-- =============================================================================
-- 0011 · Notification Dispatch & Scheduled Jobs
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Create an in-app notification and queue out-of-band deliveries.
-- Honours per-type channel opt-outs and the contact's channel opt-in flags.
-- ---------------------------------------------------------------------------
create or replace function public.fn_notify(
  p_recipient_id uuid,
  p_type         text,
  p_title        text,
  p_body         text default null,
  p_category     text default 'general',
  p_action_url   text default null,
  p_action_label text default null,
  p_priority     public.notification_priority default 'normal',
  p_data         jsonb default '{}',
  p_channels     public.notification_channel[] default array['in_app']::public.notification_channel[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification_id uuid;
  v_profile         public.profiles%rowtype;
  v_channel         public.notification_channel;
  v_allowed         boolean;
  v_destination     text;
  v_is_promotional  boolean := (p_category = 'promotional');
  v_wants           public.notification_channel[];
begin
  if p_recipient_id is null then return null; end if;

  select * into v_profile from public.profiles where id = p_recipient_id;
  if v_profile.id is null then return null; end if;

  if v_profile.status <> 'active' then return null; end if;

  insert into public.notifications (
    recipient_id, type, category, title, body,
    action_url, action_label, priority, data
  )
  values (
    p_recipient_id, p_type, p_category, p_title, p_body,
    p_action_url, p_action_label, p_priority, coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_notification_id;

  -- Fan out to requested channels, filtered by preference and opt-in flags
  foreach v_channel in array p_channels
  loop
    if v_channel <> 'in_app' then

      -- Global and type-specific opt-outs both apply; default is opt-in.
      select coalesce(bool_or(not enabled), false) into v_allowed
      from public.notification_preferences np
      where np.user_id = p_recipient_id
        and np.channel = v_channel
        and np.type in (p_type, '*');

      v_allowed := coalesce(not v_allowed, true);

      -- Marketing requires explicit consent, regardless of the default.
      if v_is_promotional and not v_profile.marketing_opt_in then
        v_allowed := false;
      end if;

      if v_channel = 'email' and not v_profile.email_opt_in then v_allowed := false; end if;
      if v_channel = 'sms'    and not v_profile.sms_opt_in    then v_allowed := false; end if;
      if v_channel = 'whatsapp' and not v_profile.whatsapp_opt_in then v_allowed := false; end if;

      if v_allowed then
        v_destination := case v_channel
          when 'email'    then v_profile.email
          when 'sms'      then v_profile.phone_e164
          when 'whatsapp' then v_profile.phone_e164
          else null
        end;

        if v_destination is not null then
          insert into public.notification_deliveries (
            notification_id, recipient_id, channel, destination, status
          )
          values (
            v_notification_id, p_recipient_id, v_channel, v_destination,
            case when v_channel = 'in_app' then 'delivered' else 'queued' end
          )
          on conflict (notification_id, channel) do nothing;
        end if;
      end if;
    end if;
  end loop;

  -- A worker drains notification_deliveries; no-op when everything was in-app.
  if exists (
    select 1 from public.notification_deliveries
    where notification_id = v_notification_id and status = 'queued'
  ) then
    insert into public.scheduled_jobs (job_name, payload, run_after)
    values (
      'dispatch_notification',
      jsonb_build_object('notification_id', v_notification_id),
      now()
    );
  end if;

  return v_notification_id;
end;
$$;

comment on function public.fn_notify is
  'Preferred notification entry point. Inserts the in-app row synchronously and queues email/SMS/WhatsApp for the dispatcher Edge Function.';

-- Convenience wrapper: notify every admin
create or replace function public.fn_notify_admins(
  p_type     text,
  p_title    text,
  p_body     text default null,
  p_action_url text default null,
  p_data     jsonb default '{}',
  p_channels public.notification_channel[] default array['in_app']::public.notification_channel[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
begin
  for v_admin in
    select ur.user_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.key = 'admin'
      and (ur.expires_at is null or ur.expires_at > now())
  loop
    perform public.fn_notify(
      v_admin, p_type, p_title, p_body,
      'system', p_action_url, 'Open dashboard', 'high', p_data, p_channels
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking lifecycle notifications
-- ---------------------------------------------------------------------------
create or replace function public.fn_appointment_created(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appt     public.appointments%rowtype;
  v_service  text;
  v_staff    text;
  v_when     text;
begin
  select a.* into v_appt
  from public.appointments a
  where a.id = p_appointment_id;

  if v_appt.id is not null then
    select s.name into v_service from public.services s where s.id = v_appt.service_id;
  end if;

  if v_appt.id is null then return; end if;

  select coalesce(pr.full_name, 'your stylist') into v_staff
  from public.profiles pr where pr.id = v_appt.staff_id;

  v_when := to_char(v_appt.starts_at at time zone 'Africa/Lagos', 'DD Mon YYYY, HH24:MI');

  perform public.fn_notify(
    v_appt.customer_id,
    'appointment.created',
    'Booking received — ' || v_appt.reference,
    format('%s with %s on %s. We''ll confirm shortly.', v_service, v_staff, v_when),
    'booking',
    format('/account/appointments/%s', v_appt.id),
    'View booking',
    'high',
    jsonb_build_object('appointment_id', v_appt.id, 'reference', v_appt.reference),
    array['in_app','email','whatsapp']::public.notification_channel[]
  );

  perform public.fn_notify_admins(
    'appointment.new',
    'New booking — ' || v_appt.reference,
    format('%s · %s · %s', v_service, v_staff, v_when),
    format('/admin/bookings/%s', v_appt.id),
    jsonb_build_object('appointment_id', v_appt.id)
  );

  -- Reminder queue: 24h and 2h before the appointment
  insert into public.scheduled_jobs (job_name, payload, run_after)
  values
    ('appointment_reminder',
     jsonb_build_object('appointment_id', v_appt.id, 'offset', '24h'),
     v_appt.starts_at - interval '24 hours'),
    ('appointment_reminder',
     jsonb_build_object('appointment_id', v_appt.id, 'offset', '2h'),
     v_appt.starts_at - interval '2 hours');
end;
$$;

-- ---------------------------------------------------------------------------
-- Order lifecycle notifications
-- ---------------------------------------------------------------------------
create or replace function public.fn_order_created(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or v_order.customer_id is null then return; end if;

  perform public.fn_notify(
    v_order.customer_id,
    'order.created',
    'Order ' || v_order.order_number || ' received',
    case
      when v_order.payment_status = 'paid'
        then format('We have your payment of %s. You can collect from any branch.', public.fn_naira(v_order.paid_total))
      else format('Total due: %s. Complete payment to confirm your order.', public.fn_naira(v_order.total - v_order.paid_total))
    end,
    'commerce',
    format('/account/orders/%s', v_order.id),
    'View order',
    'high',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number),
    array['in_app','email','whatsapp']::public.notification_channel[]
  );

  perform public.fn_notify_admins(
    'order.new',
    'New order ' || v_order.order_number,
    format('%s · %s', v_order.contact_name, public.fn_naira(v_order.total)),
    format('/admin/orders/%s', v_order.id),
    jsonb_build_object('order_id', v_order.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Job application notifications
-- ---------------------------------------------------------------------------
create or replace function public.fn_application_submitted(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.job_applications%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_app from public.job_applications where id = p_application_id;
  if v_app.id is null then return; end if;

  select * into v_job from public.jobs where id = v_app.job_id;

  -- Confirmation goes to the applicant's email even when they never signed up.
  insert into public.notifications (
    recipient_id, type, category, title, body, action_url, data
  )
  select
    p.applicant_id,
    'application.submitted',
    'recruitment',
    format('Application received — %s', coalesce(v_job.title, 'this role')),
    format('Hi %s, your application for %s is in. Reference %s. We will be in touch.',
           v_app.full_name, coalesce(v_job.title, 'the role'), v_app.reference),
    format('/careers/%s', v_job.slug),
    jsonb_build_object('application_id', v_app.id, 'job_id', v_app.job_id)
  from public.profiles p
  where p.id = v_app.applicant_id
  on conflict do nothing;

  insert into public.notification_deliveries (notification_id, recipient_id, channel, destination, status)
  select n.id, p.applicant_id, 'email', v_app.email, 'queued'
  from public.notifications n
  join public.profiles p on p.id = p.applicant_id
  where n.type = 'application.submitted'
    and n.data ->> 'application_id' = v_app.id::text
    and n.recipient_id = p.applicant_id
    and n.created_at > now() - interval '10 seconds'
  on conflict (notification_id, channel) do nothing;

  perform public.fn_notify_admins(
    'application.new',
    format('New application — %s', v_job.title),
    format('%s · %s', v_app.full_name, v_app.email),
    format('/admin/careers/applications/%s', v_app.id),
    jsonb_build_object('application_id', v_app.id, 'job_id', v_app.job_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Job queue maintenance
-- ---------------------------------------------------------------------------
create or replace function app_private.claim_scheduled_jobs(p_worker text, p_limit integer default 25)
returns setof public.scheduled_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    select sj.id
    from public.scheduled_jobs sj
    where sj.status = 'pending'
      and sj.run_after <= now()
      and (sj.locked_at is null or sj.locked_at < now() - interval '10 minutes')
    order by sj.run_after
    limit coalesce(p_limit, 25)
    for update skip locked
  )
  update public.scheduled_jobs sj
  set status = 'running',
      locked_at = now(),
      locked_by = p_worker,
      attempts = sj.attempts + 1
  from claimed
  where sj.id = claimed.id
  returning sj.*;
$$;

create or replace function app_private.complete_scheduled_job(
  p_job_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.scheduled_jobs
  set status     = case when p_success then 'done' else 'failed' end,
      completed_at = now(),
      last_error = p_error,
      locked_at = null
  where id = p_job_id;
$$;

-- ---------------------------------------------------------------------------
-- Abandoned-hold cleanup. Safe to run frequently.
-- ---------------------------------------------------------------------------
create or replace function app_private.purge_expired_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.booking_holds
  where converted_appointment_id is null
    and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates (admin/staff only, enforced by RLS + this guard)
-- ---------------------------------------------------------------------------
create or replace function public.fn_admin_dashboard_stats(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date := coalesce(p_from, current_date - 30);
  v_to   date := coalesce(p_to, current_date);
  v_result jsonb;
begin
  if not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),

    'appointments', jsonb_build_object(
      'total',    (select count(*) from public.appointments
                    where starts_at::date between v_from and v_to),
      'completed',(select count(*) from public.appointments
                    where status = 'completed'
                      and starts_at::date between v_from and v_to),
      'cancelled',(select count(*) from public.appointments
                    where status = 'cancelled'
                      and starts_at::date between v_from and v_to),
      'no_show',  (select count(*) from public.appointments
                    where status = 'no_show'
                      and starts_at::date between v_from and v_to),
      'upcoming', (select count(*) from public.appointments
                    where status in ('pending','confirmed')
                      and starts_at > now()),
      'revenue',  (select coalesce(sum(total), 0) from public.appointments
                    where status = 'completed'
                      and starts_at::date between v_from and v_to)
    ),

    'revenue', jsonb_build_object(
      'services', (select coalesce(sum(total), 0) from public.appointments
                    where status = 'completed'
                      and starts_at::date between v_from and v_to),
      'products', (select coalesce(sum(total), 0) from public.orders
                    where status <> 'cancelled'
                      and placed_at::date between v_from and v_to),
      'collected',(select coalesce(sum(paid_total), 0) from public.orders
                    where placed_at::date between v_from and v_to
                      and payment_status in ('paid','partially_paid'))
    ),

    'commerce', jsonb_build_object(
      'orders',      (select count(*) from public.orders
                       where placed_at::date between v_from and v_to),
      'open_orders', (select count(*) from public.orders
                       where status in ('pending','confirmed','processing','ready_for_pickup')),
      'units_sold',  (select coalesce(sum(quantity), 0) from public.order_items oi
                       join public.orders o on o.id = oi.order_id
                       where o.placed_at::date between v_from and v_to
                         and o.status <> 'cancelled'),
      'low_stock',   (select count(*) from public.product_variants
                       where is_active and stock_on_hand <= low_stock_threshold),
      'out_of_stock',(select count(*) from public.product_variants
                       where is_active and stock_on_hand = 0)
    ),

    'recruitment', jsonb_build_object(
      'open_jobs',        (select count(*) from public.jobs where status = 'open'),
      'applications',     (select count(*) from public.job_applications
                            where submitted_at::date between v_from and v_to),
      'awaiting_review',  (select count(*) from public.job_applications
                            where status in ('submitted','screening')),
      'shortlisted',      (select count(*) from public.job_applications
                            where status in ('shortlisted','interview_scheduled','interviewed'))
    ),

    'customers', jsonb_build_object(
      'new',        (select count(*) from public.profiles
                       where created_at::date between v_from and v_to),
      'total',      (select count(*) from public.profiles where status = 'active'),
      'returning',  (select count(distinct a.customer_id) from public.appointments a
                       where a.starts_at::date between v_from and v_to)
    ),

    'series', (
      select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb)
      from (
        select
          d.day,
          coalesce(apt.revenue, 0) as service_revenue,
          coalesce(ord.revenue, 0) as product_revenue,
          coalesce(apt.count, 0)   as appointments
        from generate_series(v_from, v_to, '1 day'::interval) as d(day)
        left join (
          select starts_at::date as day, sum(total) as revenue, count(*) as count
          from public.appointments
          where status = 'completed' and starts_at::date between v_from and v_to
          group by 1
        ) apt on apt.day = d.day
        left join (
          select placed_at::date as day, sum(total) as revenue
          from public.orders
          where status <> 'cancelled' and placed_at::date between v_from and v_to
          group by 1
        ) ord on ord.day = d.day
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;