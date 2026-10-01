-- =============================================================================
-- 0017 · Edge Function support
--
-- The notification dispatcher runs with the service role, so it needs its own
-- claim primitive (app_private.claim_scheduled_jobs handles job rows, not
-- delivery rows) and explicit EXECUTE grants, which service_role does not get
-- for free.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Claim a batch of queued deliveries.
--
-- FOR UPDATE SKIP LOCKED lets several dispatcher workers run concurrently
-- without ever handing the same row to two workers. Rows are rescheduled with
-- exponential backoff when a send fails.
-- ---------------------------------------------------------------------------
create or replace function app_private.claim_notification_deliveries(
  p_limit integer default 40
)
returns table (
  delivery_id     bigint,
  channel         public.notification_channel,
  destination     text,
  notification_id uuid,
  recipient_id    uuid,
  title           text,
  body            text,
  attempt_count   smallint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  -- title/body live on `notifications`, so the claim joins rather than reading
  -- only the delivery row. FOR UPDATE OF d keeps the lock on the delivery
  -- itself; SKIP LOCKED is what makes concurrent workers safe.
  with candidates as (
    select
      d.id,
      n.title,
      n.body
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.status = 'queued'
      and d.scheduled_for <= now()
      and d.attempt_count < 4
    order by d.scheduled_for
    limit greatest(coalesce(p_limit, 40), 1)
    for update of d skip locked
  )
  update public.notification_deliveries d
  set status        = 'processing',
      attempt_count = d.attempt_count + 1
  from candidates c
  where d.id = c.id
  returning
    d.id,
    d.channel,
    d.destination,
    d.notification_id,
    d.recipient_id,
    c.title,
    c.body,
    d.attempt_count;
$$;

comment on function app_private.claim_notification_deliveries(integer) is
  'Claims queued deliveries with SKIP LOCKED so concurrent workers never double-send. Called by the dispatch-notifications Edge Function.';

-- Recover deliveries stranded in `processing` by a crashed worker.
create or replace function app_private.recover_stuck_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.notification_deliveries
  set status        = 'queued',
      scheduled_for = now()
  where status = 'processing'
    and coalesce(failed_at, sent_at, created_at) < now() - interval '10 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the service role.
--
-- service_role bypasses RLS but does not bypass table/function privileges, so
-- the entry points the Edge Functions rely on must be granted explicitly.
-- ---------------------------------------------------------------------------
grant execute on function
  public.fn_notify(uuid, text, text, text, text, text, text, public.notification_priority, jsonb, public.notification_channel[]),
  public.fn_order_created(uuid),
  public.fn_appointment_created(uuid),
  public.fn_application_submitted(uuid),
  public.fn_set_order_status(uuid, public.order_status, text, text, text),
  public.fn_set_application_status(uuid, public.application_status, text, smallint, timestamptz),
  public.fn_service_slots(uuid, uuid, date, uuid, uuid, integer),
  public.fn_cart_totals(uuid),
  public.fn_available_stock(uuid),
  public.fn_next_reference(text, date),
  public.fn_record_offline_payment(uuid, numeric, public.payment_provider, text, text),
  public.fn_adjust_stock(uuid, integer, public.inventory_reason, text, text, text)
  to service_role;

grant execute on function
  app_private.claim_notification_deliveries(integer),
  app_private.recover_stuck_deliveries(),
  app_private.claim_scheduled_jobs(text, integer),
  app_private.complete_scheduled_job(uuid, boolean, text),
  app_private.housekeeping(),
  app_private.purge_expired_holds()
  to service_role;

-- The dispatcher reads profiles directly; grants are not implied by RLS bypass.
grant select on public.profiles to service_role;
grant select, update on public.payments, public.orders, public.appointments to service_role;
grant insert on public.payment_events, public.payments, public.notifications,
                public.notification_deliveries, public.whatsapp_messages
  to service_role;
grant update on public.notification_deliveries, public.notification_preferences
  to service_role;

-- ---------------------------------------------------------------------------
-- Do not let the client fabricate a payment row directly.
-- Payments are written by the webhook, by fn_record_offline_payment, or by the
-- initialize function. A client INSERT would bypass every server-side check.
-- ---------------------------------------------------------------------------
revoke insert on public.payments from anon, authenticated;
