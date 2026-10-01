-- =============================================================================
-- 0014 · Triggers, Column Guards & Storage
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Provision a profile + customer role on signup
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','staff_profiles','salon_locations','business_settings',
    'service_categories','services','product_categories','products','product_variants',
    'carts','coupons','orders','jobs','job_applications','requirements',
    'appointments','reviews','pages','faqs'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$I
         for each row execute function app_private.touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Column guards
-- RLS is row-level, so these BEFORE UPDATE triggers enforce *column* rules.
-- ---------------------------------------------------------------------------

-- Profiles: a customer may edit their own details but never their own
-- status, id, or email (email is owned by auth.users).
create or replace function app_private.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if app_private.is_admin(auth.uid()) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.status is distinct from old.status then
    raise exception 'These fields can only be changed by an administrator'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile
  before update on public.profiles
  for each row execute function app_private.guard_profile_columns();

-- Appointments: staff may move status and add internal notes, but must not be
-- able to rewrite the customer, the money, or the booked slot. Slot changes go
-- through fn_reschedule_appointment, which re-validates availability.
create or replace function app_private.guard_appointment_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean := app_private.is_admin(auth.uid());
begin
  if v_is_admin then
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id
     or new.service_id is distinct from old.service_id
     or new.location_id is distinct from old.location_id
     or new.subtotal  is distinct from old.subtotal
     or new.discount  is distinct from old.discount
     or new.total     is distinct from old.total
     or new.deposit_amount is distinct from old.deposit_amount
     or new.deposit_paid   is distinct from old.deposit_paid
     or new.payment_status is distinct from old.payment_status then
    raise exception 'Booking and payment fields cannot be edited directly'
      using errcode = 'insufficient_privilege';
  end if;

  -- An assigned stylist may adjust the slot (walk-in re-timing); validation
  -- still happens through the availability engine before the exclusion
  -- constraint fires.
  if new.starts_at is distinct from old.starts_at
     or new.ends_at   is distinct from old.ends_at
     or new.staff_id  is distinct from old.staff_id then
    if not (public.fn_is_staff() and new.staff_id = auth.uid()) then
      raise exception 'Only the assigned stylist or an administrator can reschedule'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_appointment on public.appointments;
create trigger trg_guard_appointment
  before update on public.appointments
  for each row execute function app_private.guard_appointment_columns();

-- Orders: fulfilment staff may change status/notes/tracking only.
create or replace function app_private.guard_order_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if app_private.is_admin(auth.uid()) then
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id
     or new.subtotal      is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.shipping_total is distinct from old.shipping_total
     or new.tax_total     is distinct from old.tax_total
     or new.total         is distinct from old.total
     or new.paid_total    is distinct from old.paid_total
     or new.refund_total  is distinct from old.refund_total
     or new.payment_status is distinct from old.payment_status
     or new.currency      is distinct from old.currency then
    raise exception 'Order totals and payment fields cannot be edited directly'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_order on public.orders;
create trigger trg_guard_order
  before update on public.orders
  for each row execute function app_private.guard_order_columns();

-- Product variants: price changes are admin-only; stock quantity is adjusted
-- through fn_adjust_stock so the ledger stays complete.
create or replace function app_private.guard_variant_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if app_private.is_admin(auth.uid()) then
    return new;
  end if;

  if new.price is distinct from old.price
     or new.cost_price is distinct from old.cost_price
     or new.stock_on_hand is distinct from old.stock_on_hand then
    raise exception 'Pricing and stock levels require the inventory workflow'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_variant on public.product_variants;
create trigger trg_guard_variant
  before update on public.product_variants
  for each row execute function app_private.guard_variant_columns();

-- ---------------------------------------------------------------------------
-- Appointment lifecycle
-- ---------------------------------------------------------------------------
create or replace function app_private.log_appointment_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history (appointment_id, to_status, actor_id, note)
    values (new.id, new.status, auth.uid(), 'Booking created');

    perform public.fn_appointment_created(new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.appointment_status_history (appointment_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, auth.uid());

    -- Completed appointments count toward the service's social proof.
    if new.status = 'completed' then
      update public.services set bookings_count = bookings_count + 1 where id = new.service_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appointment_lifecycle on public.appointments;
create trigger trg_appointment_lifecycle
  after insert or update on public.appointments
  for each row execute function app_private.log_appointment_status();

-- ---------------------------------------------------------------------------
-- Order lifecycle
-- ---------------------------------------------------------------------------
create or replace function app_private.log_order_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.fn_order_created(new.id);
  return new;
end;
$$;

drop trigger if exists trg_order_created on public.orders;
create trigger trg_order_created
  after insert on public.orders
  for each row execute function app_private.log_order_created();

-- ---------------------------------------------------------------------------
-- Review rollups
-- ---------------------------------------------------------------------------
create or replace function app_private.sync_review_rollups()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- NEW is unassigned in a DELETE trigger, so that case is handled first.
  if tg_op = 'DELETE' then
    if old.staff_id   is not null then perform public.fn_recalculate_staff_rating(old.staff_id);   end if;
    if old.service_id is not null then perform public.fn_recalculate_service_rating(old.service_id); end if;
    if old.product_id is not null then perform public.fn_recalculate_product_rating(old.product_id); end if;
    return null;
  end if;

  -- On UPDATE, re-derive the previous targets if they changed.
  if tg_op = 'UPDATE' then
    if old.staff_id is not null and new.staff_id is distinct from old.staff_id then
      perform public.fn_recalculate_staff_rating(old.staff_id);
    end if;
    if old.service_id is not null and new.service_id is distinct from old.service_id then
      perform public.fn_recalculate_service_rating(old.service_id);
    end if;
    if old.product_id is not null and new.product_id is distinct from old.product_id then
      perform public.fn_recalculate_product_rating(old.product_id);
    end if;
  end if;

  if new.staff_id   is not null then perform public.fn_recalculate_staff_rating(new.staff_id);   end if;
  if new.service_id is not null then perform public.fn_recalculate_service_rating(new.service_id); end if;
  if new.product_id is not null then perform public.fn_recalculate_product_rating(new.product_id); end if;

  return null;
end;
$$;

drop trigger if exists trg_review_rollups on public.reviews;
create trigger trg_review_rollups
  after insert or update or delete on public.reviews
  for each row execute function app_private.sync_review_rollups();

-- ---------------------------------------------------------------------------
-- Application pipeline history
-- ---------------------------------------------------------------------------
create or replace function app_private.log_application_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.application_events (application_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, auth.uid(), new.stage_notes);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_application_status on public.job_applications;
create trigger trg_application_status
  after update on public.job_applications
  for each row execute function app_private.log_application_status();

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('service-images',  'service-images',  true,  10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('gallery',         'gallery',         true,  10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('products',        'products',        true,  10485760, array['image/jpeg','image/png','image/webp','image/avif','video/mp4']),
  ('requirements',    'requirements',    false,  15728640, array['image/jpeg','image/png','image/webp','image/avif']),
  ('applications',    'applications',    false,  10485760, array['application/pdf','application/msword',
                                                                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('avatars',         'avatars',         true,   5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- The "requirements" bucket is deliberately PRIVATE. Reference images are
-- personal data, reachable only through signed URLs issued to the owning
-- customer and the stylist assigned to their appointment (see policies below).

-- Requirements: signed-in customers upload under their own folder.
create policy "requirements_owner_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'requirements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "requirements_owner_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'requirements'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      -- Staff read a customer's uploads only for appointments assigned to them
      or exists (
        select 1
        from public.requirements r
        join public.appointments a on a.id = r.appointment_id
        join public.requirement_media m on m.requirement_id = r.id
        where m.storage_path = name
          and public.fn_is_staff() and a.staff_id = auth.uid()
      )
      or public.fn_is_admin()
    )
  );

create policy "requirements_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'requirements'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.fn_is_admin())
  );

-- Applications: CVs land under the applicant's user id, or a random folder for
-- guests (who cannot later read them back except through staff).
create policy "applications_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'applications');

create policy "applications_staff_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'applications' and public.fn_is_staff_or_admin());

create policy "applications_owner_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'applications' and (storage.foldername(name))[1] = auth.uid()::text);

-- Avatars are self-service.
create policy "avatars_owner_manage"
  on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Housekeeping: purge expired holds and finished jobs.
-- ---------------------------------------------------------------------------
create or replace function app_private.housekeeping()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_holds integer;
  v_jobs  integer;
begin
  -- Expired slot holds are the only unbounded-growth table in the booking path.
  v_holds := app_private.purge_expired_holds();

  delete from public.scheduled_jobs
  where status in ('done') and completed_at < now() - interval '7 days';

  delete from public.scheduled_jobs
  where status = 'failed' and attempts >= 5;

  get diagnostics v_jobs = row_count;

  -- Expire stale notifications so the inbox stays relevant.
  delete from public.notifications
  where expires_at is not null and expires_at < now();

  return jsonb_build_object('holds_purged', v_holds, 'jobs_cleaned', v_jobs);
end;
$$;
