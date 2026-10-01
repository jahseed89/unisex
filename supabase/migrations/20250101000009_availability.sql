-- =============================================================================
-- 0009 · Availability Engine & Appointment Booking
--
-- Design: the client calls fn_service_slots() to render a calendar. That call
-- is advisory. The authoritative guards are (a) fn_create_appointment(), which
-- re-validates inside a transaction, and (b) the `appointments_no_overlap`
-- exclusion constraint, which cannot be bypassed by any code path.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Slot discovery
-- ---------------------------------------------------------------------------
create or replace function public.fn_service_slots(
  p_location_id        uuid,
  p_service_id         uuid,
  p_date               date,
  p_staff_id           uuid default null,
  p_service_variant_id uuid default null,
  p_slot_interval_mins integer default 15
)
returns table (
  starts_at       timestamptz,
  ends_at         timestamptz,
  staff_id        uuid,
  staff_name      text,
  staff_title     text,
  staff_photo_url text,
  price           numeric,
  staff_count     bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with settings as (
  select * from public.business_settings where id
),

-- Service + location configuration resolved to one row, in the location's timezone
cfg as (
  select
    l.timezone                                            as tz,
    coalesce(sv.duration_minutes, s.duration_minutes)     as duration,
    coalesce(sv.price, s.price_from)                      as price,
    coalesce(s.buffer_minutes, 0)                         as buffer_mins,
    st.buffer_between_bookings                            as global_buffer,
    st.booking_lead_time_hours                            as lead_hours,
    st.max_advance_days                                   as max_advance_days,
    st.booking_lead_time_hours + st.min_notice_hours      as lead_hours_total,
    h.opens_at,
    h.closes_at,
    h.is_closed
  from public.salon_locations l
  join public.services s
    on s.id = p_service_id
   and s.status = 'active'
  left join public.service_variants sv
    on p_service_variant_id is not null
   and sv.id = p_service_variant_id
   and sv.service_id = s.id
   and sv.is_active
  join public.location_hours h
    on h.location_id = p_location_id
   and h.weekday = extract(dow from p_date)::smallint
  cross join settings st
  where l.id = p_location_id
    and l.is_active
),

-- Local-day open window expressed in UTC instants
day_window as (
  select
    cfg.*,
    (p_date + cfg.opens_at) at time zone cfg.tz as open_at,
    (p_date + cfg.closes_at) at time zone cfg.tz as close_at
  from cfg
  where not cfg.is_closed
),

-- Booking horizon + notice gates
gate as (
  select dw.*,
         (now() at time zone dw.tz)::date as today_local
  from day_window dw
  where p_date >= (now() at time zone dw.tz)::date
    and p_date <= (now() at time zone dw.tz)::date + dw.max_advance_days
),

-- Bookable stylists for this service
staff_pool as (
  select
    sp.user_id,
    pr.full_name,
    sp.title,
    sp.photo_url,
    sp.max_daily_bookings
  from public.staff_profiles sp
  join public.profiles pr
    on pr.id = sp.user_id
   and pr.status = 'active'
  where sp.is_bookable
    and (sp.employment_end_on is null or sp.employment_end_on >= current_date)
    and (
         (p_staff_id is not null and sp.user_id = p_staff_id)
         or exists (
              select 1 from public.staff_services ss
              where ss.staff_id = sp.user_id
                and ss.service_id = p_service_id
                and ss.is_active
            )
         -- No capability map configured for this service yet → any stylist may take it
         or not exists (
              select 1 from public.staff_services ss2
              where ss2.service_id = p_service_id
            )
    )
),

-- Drop staff blocked by a location or global blackout on this date
staff_free as (
  select sp.*
  from staff_pool sp
  where not exists (
    select 1
    from public.blackout_dates b
    where (b.location_id is null or b.location_id = p_location_id)
      and p_date between b.starts_on and b.ends_on
  )
),

-- Staff working windows for this weekday, intersected with the location window
rules as (
  select
    sf.user_id as staff_id,
    greatest(
      (p_date + r.starts_at) at time zone g.tz,
      g.open_at
    ) as win_start,
    least(
      (p_date + r.ends_at) at time zone g.tz,
      g.close_at
    ) as win_end
  from staff_free sf
  join gate g on true
  join public.staff_availability_rules r
    on r.staff_id = sf.user_id
   and r.weekday = extract(dow from p_date)::smallint
   and r.is_active
   and p_date >= r.effective_from
   and (r.effective_to is null or p_date <= r.effective_to)
  where least((p_date + r.ends_at) at time zone g.tz, g.close_at)
      - greatest((p_date + r.starts_at) at time zone g.tz, g.open_at)
      >= make_interval(mins => g.duration + g.buffer_mins)
),

-- Expand each window into candidate starts. generate_series yields nothing when
-- start > stop, which is exactly the "window too small to fit" case.
candidates as (
  select distinct on (r.staff_id, gs)
    r.staff_id,
    gs as starts_at,
    gs + make_interval(mins => g.duration + g.buffer_mins + g.global_buffer) as ends_at
  from rules r
  join gate g on true
  cross join lateral generate_series(
    r.win_start,
    r.win_end - make_interval(mins => g.duration + g.buffer_mins + g.global_buffer),
    make_interval(mins => greatest(coalesce(p_slot_interval_mins, 15), 5))
  ) as gs
  order by r.staff_id, gs
),

-- Remove anything already committed, temporarily held, or on leave
free_slots as (
  select c.staff_id, c.starts_at, c.ends_at
  from candidates c
  join gate g on true
  where c.starts_at >= now() + make_interval(hours => g.lead_hours_total)
    and not exists (
      select 1 from public.staff_time_off t
      where t.staff_id = c.staff_id
        and t.is_approved
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = c.staff_id
        and a.status in ('pending', 'confirmed', 'checked_in', 'in_progress')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
    -- Unexpired checkout holds are not yet appointments but still reserve capacity
    and not exists (
      select 1 from public.booking_holds h
      where h.staff_id = c.staff_id
        and h.converted_appointment_id is null
        and h.expires_at > now()
        and tstzrange(h.starts_at, h.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
),

-- Daily workload cap per stylist
daily_load as (
  select
    a.staff_id,
    count(*)::int as booked
  from public.appointments a
  join gate g on true
  where a.status in ('pending', 'confirmed', 'checked_in', 'in_progress')
    and (a.starts_at at time zone g.tz)::date = p_date
  group by a.staff_id
)

select
  fs.starts_at,
  fs.ends_at,
  fs.staff_id,
  sf.full_name,
  sf.title,
  sf.photo_url,
  g.price,
  count(*) over (partition by fs.starts_at) as staff_count
from free_slots fs
join gate g on true
join staff_free sf on sf.user_id = fs.staff_id
left join daily_load dl on dl.staff_id = fs.staff_id
where coalesce(dl.booked, 0) < sf.max_daily_bookings
order by fs.starts_at, sf.full_name;
$$;

comment on function public.fn_service_slots is
  'Returns one row per (start_time, stylist). Callers group by starts_at to render a time grid. Read-only.';

-- ---------------------------------------------------------------------------
-- Cheap availability probe used to re-validate immediately before booking
-- ---------------------------------------------------------------------------
create or replace function public.fn_is_slot_available(
  p_staff_id           uuid,
  p_location_id        uuid,
  p_service_id         uuid,
  p_starts_at          timestamptz,
  p_service_variant_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.fn_service_slots(
      p_location_id,
      p_service_id,
      (p_starts_at at time zone (
        select timezone from public.salon_locations where id = p_location_id
      ))::date,
      p_staff_id,
      p_service_variant_id,
      5
    ) s
    where s.staff_id = p_staff_id
      and s.starts_at = p_starts_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Slot hold — used to freeze a slot while the customer completes requirements
-- ---------------------------------------------------------------------------
create or replace function public.fn_hold_slot(
  p_staff_id    uuid,
  p_service_id  uuid,
  p_location_id uuid,
  p_starts_at   timestamptz,
  p_session_token text,
  p_ttl_minutes integer default 20
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.business_settings;
  v_duration  integer;
  v_buffer    integer;
  v_ends_at   timestamptz;
  v_hold_id   uuid;
begin
  select * into v_settings from public.business_settings where id;

  select s.duration_minutes, s.buffer_minutes
    into v_duration, v_buffer
  from public.services s
  where s.id = p_service_id and s.status = 'active';

  if v_duration is null then
    raise exception 'Service % is not bookable', p_service_id using errcode = 'no_data_found';
  end if;

  if not public.fn_is_slot_available(p_staff_id, p_location_id, p_service_id, p_starts_at, null) then
    raise exception 'That time is no longer available' using errcode = 'check_violation';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration + v_buffer);

  insert into public.booking_holds (
    staff_id, customer_id, service_id, location_id,
    starts_at, ends_at, session_token, expires_at
  )
  values (
    p_staff_id,
    case when auth.uid() is null then null else auth.uid() end,
    p_service_id, p_location_id,
    p_starts_at, v_ends_at, p_session_token,
    now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 20), 5), 120))
  )
  returning id into v_hold_id;

  return v_hold_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Appointment creation — the single write path for every booking source
-- ---------------------------------------------------------------------------
create or replace function public.fn_create_appointment(
  p_service_id         uuid,
  p_location_id        uuid,
  p_staff_id           uuid,
  p_starts_at          timestamptz,
  p_service_variant_id uuid default null,
  p_customer_id        uuid default null,
  p_customer_notes     text default null,
  p_source             public.booking_source default 'web',
  p_requirement        jsonb default null,
  p_hold_token         text default null,
  p_force              boolean default false
)
returns public.appointments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer   uuid := coalesce(p_customer_id, auth.uid());
  v_settings   public.business_settings;
  v_service    public.services%rowtype;
  v_variant    public.service_variants%rowtype;
  v_staff      public.staff_profiles%rowtype;
  v_duration   integer;
  v_buffer     integer;
  v_price      numeric;
  v_ends_at    timestamptz;
  v_deposit    numeric := 0;
  v_appointment public.appointments;
  v_hold       public.booking_holds%rowtype;
begin
  if v_customer is null then
    raise exception 'Authentication required to book' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = v_customer and status = 'active') then
    raise exception 'Account not found or suspended' using errcode = 'no_data_found';
  end if;

  -- `p_force` is a staff-only escape hatch (walk-ins, admin correction). A caller
  -- can set the argument, but never the privilege: derive it, never trust it.
  if p_force and not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Not permitted to override availability' using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(p_force, false) then
    if not public.fn_is_slot_available(
      p_staff_id, p_location_id, p_service_id, p_starts_at, p_service_variant_id
    ) then
      raise exception 'That time is no longer available. Please choose another slot.'
        using errcode = 'check_violation';
    end if;
  end if;

  select * into v_settings from public.business_settings where id;

  if p_starts_at < now() + make_interval(hours => v_settings.booking_lead_time_hours) then
    raise exception 'Bookings require at least % hours notice', v_settings.booking_lead_time_hours
      using errcode = 'check_violation';
  end if;

  if p_starts_at > now() + make_interval(days => v_settings.max_advance_days) then
    raise exception 'Bookings open % days in advance', v_settings.max_advance_days
      using errcode = 'check_violation';
  end if;

  select * into v_service from public.services where id = p_service_id and status = 'active';
  if v_service.id is null then
    raise exception 'Service not available' using errcode = 'no_data_found';
  end if;

  if v_service.requires_requirement and p_requirement is null then
    raise exception 'Please complete the requirements form before booking'
      using errcode = 'check_violation';
  end if;

  if v_service.gender_restriction is not null
     and exists (select 1 from public.profiles
                 where id = v_customer and gender = v_service.gender_restriction) then
    raise exception 'This service is not available for your selected profile option'
      using errcode = 'check_violation';
  end if;

  if p_service_variant_id is not null then
    select * into v_variant from public.service_variants
    where id = p_service_variant_id and service_id = p_service_id and is_active;
  end if;

  v_duration := coalesce(v_variant.duration_minutes, v_service.duration_minutes);
  v_buffer   := v_service.buffer_minutes;
  v_price    := coalesce(v_variant.price, v_service.price_from);
  v_ends_at  := p_starts_at + make_interval(mins => v_duration + v_buffer);

  if v_settings.deposit_required then
    v_deposit := round(v_price * (v_settings.deposit_pct / 100), 2);
  end if;

  -- Consume the customer-facing hold, if one exists for this slot.
  if p_hold_token is not null then
    select * into v_hold
    from public.booking_holds
    where session_token = p_hold_token
      and staff_id = p_staff_id
      and starts_at = p_starts_at
      and converted_appointment_id is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;
  end if;

  insert into public.appointments (
    reference, customer_id, service_id, service_variant_id, staff_id, location_id,
    starts_at, ends_at, duration_minutes, buffer_minutes,
    status, source, subtotal, discount, total,
    deposit_required, deposit_amount, customer_notes
  )
  values (
    public.fn_next_reference('UHS'),
    v_customer, p_service_id, p_service_variant_id, p_staff_id, p_location_id,
    p_starts_at, v_ends_at, v_duration, v_buffer,
    case when app_private.is_staff_or_admin(auth.uid()) then 'confirmed'::public.appointment_status
         else 'pending'::public.appointment_status end,
    p_source, v_price, 0, v_price,
    v_deposit > 0, v_deposit, p_customer_notes
  )
  -- Re-checked atomically: two customers racing for the last slot, one loses.
  on conflict (staff_id, tstzrange(starts_at, ends_at))
    where (staff_id is not null
           and status in ('pending','confirmed','checked_in','in_progress'))
  do nothing
  returning * into v_appointment;

  if v_appointment.id is null then
    raise exception 'That slot was just taken. Please pick another time.'
      using errcode = 'check_violation';
  end if;

  if v_hold.id is not null then
    update public.booking_holds
      set converted_appointment_id = v_appointment.id
    where id = v_hold.id;
  end if;

  if p_requirement is not null then
    insert into public.requirements (
      appointment_id, customer_id,
      current_length, current_texture, current_colour, current_density,
      last_treated_at, last_treatment,
      desired_style, desired_length, desired_texture, desired_colour,
      hair_goals, inspiration_notes,
      allergies, scalp_conditions, medications, accessibility_needs,
      patch_test_done, patch_test_at,
      budget_min, budget_max, is_flexible_on_date,
      status, submitted_at
    )
    values (
      v_appointment.id, v_customer,
      nullif(p_requirement ->> 'current_length', ''),
      nullif(p_requirement ->> 'current_texture', '')::public.hair_texture,
      nullif(p_requirement ->> 'current_colour', ''),
      nullif(p_requirement ->> 'current_density', '')::smallint,
      nullif(p_requirement ->> 'last_treated_at', '')::date,
      nullif(p_requirement ->> 'last_treatment', ''),
      coalesce(nullif(p_requirement ->> 'desired_style', ''), v_service.name),
      nullif(p_requirement ->> 'desired_length', ''),
      nullif(p_requirement ->> 'desired_texture', '')::public.hair_texture,
      nullif(p_requirement ->> 'desired_colour', ''),
      coalesce(p_requirement -> 'hair_goals', '{}'::jsonb),
      nullif(p_requirement ->> 'inspiration_notes', ''),
      coalesce(p_requirement -> 'allergies', '{}'::jsonb),
      coalesce(p_requirement -> 'scalp_conditions', '{}'::jsonb),
      nullif(p_requirement ->> 'medications', ''),
      nullif(p_requirement ->> 'accessibility_needs', ''),
      coalesce((p_requirement ->> 'patch_test_done')::boolean, false),
      nullif(p_requirement ->> 'patch_test_at', '')::date,
      nullif(p_requirement ->> 'budget_min', '')::numeric,
      nullif(p_requirement ->> 'budget_max', '')::numeric,
      coalesce((p_requirement ->> 'is_flexible_on_date')::boolean, false),
      'submitted', now()
    )
    on conflict (appointment_id) do update
      set current_length    = excluded.current_length,
          current_texture   = excluded.current_texture,
          current_colour    = excluded.current_colour,
          current_density   = excluded.current_density,
          desired_style     = excluded.desired_style,
          desired_length    = excluded.desired_length,
          desired_texture   = excluded.desired_texture,
          desired_colour    = excluded.desired_colour,
          hair_goals        = excluded.hair_goals,
          inspiration_notes = excluded.inspiration_notes,
          allergies         = excluded.allergies,
          scalp_conditions  = excluded.scalp_conditions,
          budget_min        = excluded.budget_min,
          budget_max        = excluded.budget_max,
          is_flexible_on_date = excluded.is_flexible_on_date,
          status            = 'submitted',
          submitted_at      = now(),
          updated_at        = now();
  end if;

  return v_appointment;
end;
$$;

comment on function public.fn_create_appointment is
  'Single entry point for web, phone, WhatsApp and walk-in bookings. Re-validates availability, then relies on the exclusion constraint as the final race-condition guard.';

-- ---------------------------------------------------------------------------
-- Status transitions with side effects
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_appointment_status(
  p_appointment_id uuid,
  p_status         public.appointment_status,
  p_note           text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appt    public.appointments%rowtype;
  v_allowed boolean;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;

  -- Authorisation: owner may cancel, staff may advance their own diary,
  -- admins may do anything.
  if not (
       app_private.is_admin(auth.uid())
    or (auth.uid() = v_appt.staff_id and app_private.is_staff(auth.uid()))
    or (auth.uid() = v_appt.customer_id and p_status = 'cancelled')
  ) then
    raise exception 'Not permitted to change this appointment'
      using errcode = 'insufficient_privilege';
  end if;

  -- Legal transition graph
  v_allowed := case
    when p_status = v_appt.status                        then true
    when v_appt.status = 'pending'                       then p_status in ('confirmed','cancelled')
    when v_appt.status = 'confirmed'                     then p_status in ('checked_in','in_progress','cancelled','no_show','rescheduled')
    when v_appt.status = 'checked_in'                    then p_status in ('in_progress','cancelled','no_show')
    when v_appt.status = 'in_progress'                   then p_status in ('completed')
    when v_appt.status in ('completed','cancelled','no_show') then false
    else false
  end;

  if not v_allowed then
    raise exception 'Cannot move appointment from % to %', v_appt.status, p_status
      using errcode = 'check_violation';
  end if;

  update public.appointments
  set status          = p_status,
      confirmed_at    = case when p_status = 'confirmed'  and confirmed_at is null then now() else confirmed_at end,
      checked_in_at   = case when p_status = 'checked_in' then now() else checked_in_at end,
      completed_at    = case when p_status = 'completed'  then now() else completed_at end,
      cancelled_at    = case when p_status = 'cancelled'  then now() else cancelled_at end,
      cancelled_by    = case when p_status = 'cancelled'  then auth.uid() else cancelled_by end,
      cancellation_reason = case when p_status = 'cancelled' then p_note else cancellation_reason end,
      updated_at      = now()
  where id = p_appointment_id
  returning * into v_appt;

  return v_appt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer-initiated cancellation, with the late-cancellation penalty
-- ---------------------------------------------------------------------------
create or replace function public.fn_cancel_appointment(
  p_appointment_id uuid,
  p_reason         text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appt      public.appointments%rowtype;
  v_settings  public.business_settings;
  v_hours_left numeric;
  v_late      boolean;
  v_result    public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;

  if not (
       app_private.is_admin(auth.uid())
    or (auth.uid() = v_appt.customer_id)
    or (auth.uid() = v_appt.staff_id and app_private.is_staff(auth.uid()))
  ) then
    raise exception 'Not permitted to cancel this appointment' using errcode = 'insufficient_privilege';
  end if;

  if v_appt.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'This appointment can no longer be cancelled' using errcode = 'check_violation';
  end if;

  select * into v_settings from public.business_settings where id;
  v_hours_left := extract(epoch from (v_appt.starts_at - now())) / 3600;
  v_late := v_hours_left < v_settings.cancellation_window_hours;

  v_result := public.fn_set_appointment_status(p_appointment_id, 'cancelled', p_reason);

  -- Late cancellations forfeit a percentage of the deposit; the remainder of the
  -- balance is never charged. Recorded as a negative ledger adjustment.
  if v_late and v_appt.deposit_paid > 0 and auth.uid() = v_appt.customer_id then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(), 'appointment.late_cancellation', 'appointment', p_appointment_id,
      jsonb_build_object('hours_notice', round(v_hours_left, 2),
                         'deposit_paid', v_appt.deposit_paid,
                         'window_hours', v_settings.cancellation_window_hours),
      jsonb_build_object('forfeit_pct', 50)
    );
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reschedule — writes a fresh appointment and links the lineage
-- ---------------------------------------------------------------------------
create or replace function public.fn_reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at  timestamptz,
  p_new_staff_id   uuid default null,
  p_note           text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appt     public.appointments%rowtype;
  v_staff_id uuid;
  v_moved    public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;

  if not (
       app_private.is_admin(auth.uid())
    or (auth.uid() = v_appt.customer_id)
    or (auth.uid() = v_appt.staff_id and app_private.is_staff(auth.uid()))
  ) then
    raise exception 'Not permitted to reschedule this appointment' using errcode = 'insufficient_privilege';
  end if;

  if v_appt.status not in ('pending','confirmed') then
    raise exception 'Only pending or confirmed appointments can be rescheduled'
      using errcode = 'check_violation';
  end if;

  v_staff_id := coalesce(p_new_staff_id, v_appt.staff_id);

  perform public.fn_set_appointment_status(p_appointment_id, 'rescheduled', coalesce(p_note, 'Rescheduled'));

  v_moved := public.fn_create_appointment(
    p_service_id         => v_appt.service_id,
    p_location_id        => v_appt.location_id,
    p_staff_id           => v_staff_id,
    p_starts_at          => p_new_starts_at,
    p_service_variant_id => v_appt.service_variant_id,
    p_customer_id        => v_appt.customer_id,
    p_customer_notes     => v_appt.customer_notes,
    p_source             => 'recurring',
    p_force              => app_private.is_staff_or_admin(auth.uid())
  );

  update public.appointments
  set rescheduled_from_id = p_appointment_id,
      is_recurring = false
  where id = v_moved.id;

  return v_moved;
end;
$$;