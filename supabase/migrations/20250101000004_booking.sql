-- =============================================================================
-- 0004 · Booking Engine: hours, availability, appointments, requirements
-- =============================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Opening hours per location (weekday 0=Sunday .. 6=Saturday)
-- ---------------------------------------------------------------------------
create table public.location_hours (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.salon_locations (id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  opens_at     time not null,
  closes_at    time not null,
  is_closed    boolean not null default false,
  note         text,
  unique (location_id, weekday),
  constraint location_hours_valid check (closes_at > opens_at or is_closed)
);

comment on table public.location_hours is
  'Single source of truth for when a location opens. Staff rules can only narrow this window, never widen it.';

-- ---------------------------------------------------------------------------
-- Recurring staff working hours
-- ---------------------------------------------------------------------------
create table public.staff_availability_rules (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.staff_profiles (user_id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  starts_at    time not null,
  ends_at      time not null,
  effective_from date not null default current_date,
  effective_to   date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint staff_hours_valid check (ends_at > starts_at),
  constraint staff_hours_window check (effective_to is null or effective_to >= effective_from)
);

create index staff_hours_lookup_idx
  on public.staff_availability_rules (staff_id, weekday) where is_active;

-- ---------------------------------------------------------------------------
-- Ad-hoc absences
-- ---------------------------------------------------------------------------
create table public.staff_time_off (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff_profiles (user_id) on delete cascade,
  kind       public.time_off_kind not null default 'personal',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  is_approved boolean not null default true,
  created_at timestamptz not null default now(),
  constraint time_off_valid check (ends_at > starts_at)
);

create index staff_time_off_range_idx on public.staff_time_off (staff_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Blackout dates (public holidays, closed days)
-- ---------------------------------------------------------------------------
create table public.blackout_dates (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid references public.salon_locations (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  unique (location_id, starts_on, ends_on),
  constraint blackout_valid check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  reference       text unique not null default '',
  customer_id     uuid not null references public.profiles (id) on delete restrict,
  service_id      uuid not null references public.services (id) on delete restrict,
  service_variant_id uuid references public.service_variants (id) on delete set null,
  staff_id        uuid references public.staff_profiles (user_id) on delete set null,
  location_id     uuid not null references public.salon_locations (id) on delete restrict,

  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_minutes  integer not null default 0 check (buffer_minutes >= 0),

  status          public.appointment_status not null default 'pending',
  payment_status  public.payment_status not null default 'unpaid',
  source          public.booking_source not null default 'web',

  subtotal        numeric(12,2) not null default 0 check (subtotal >= 0),
  discount        numeric(12,2) not null default 0 check (discount >= 0),
  total           numeric(12,2) not null default 0 check (total >= 0),
  deposit_required boolean not null default false,
  deposit_amount  numeric(12,2) not null default 0 check (deposit_amount >= 0),
  deposit_paid    numeric(12,2) not null default 0 check (deposit_paid >= 0),
  balance_due     numeric(12,2) generated always as (greatest(total - deposit_paid, 0)) stored,

  customer_notes  text,
  internal_notes  text,
  cancellation_reason text,
  cancelled_by    uuid references public.profiles (id) on delete set null,
  cancelled_at    timestamptz,
  confirmed_at    timestamptz,
  checked_in_at   timestamptz,
  completed_at    timestamptz,
  rescheduled_from_id uuid references public.appointments (id) on delete set null,
  is_recurring    boolean not null default false,
  recurrence_group_id uuid,

  -- Optional external calendar sync
  calendar_event_id text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint appointment_window_valid check (ends_at > starts_at),
  constraint appointment_times_aligned check (
    date_trunc('minute', starts_at) = starts_at and date_trunc('minute', ends_at) = ends_at
  ),
  constraint appointment_money_valid check (
    discount <= subtotal and deposit_amount <= total and deposit_paid <= deposit_amount
  )
);

-- Database-level guarantee against double-booking a stylist.
-- Only blocking statuses participate; cancelled/no-show slots are released.
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (staff_id is not null
           and status in ('pending', 'confirmed', 'checked_in', 'in_progress'));

comment on constraint appointments_no_overlap on public.appointments is
  'Exclusion constraint is the final authority on double-booking. Application-level slot checks are advisory only.';

create index appointments_customer_idx on public.appointments (customer_id, starts_at desc);
create index appointments_staff_idx    on public.appointments (staff_id, starts_at);
create index appointments_location_idx on public.appointments (location_id, starts_at);
create index appointments_status_idx   on public.appointments (status, starts_at);
create index appointments_range_idx    on public.appointments using gist (tstzrange(starts_at, ends_at));
create index appointments_day_idx      on public.appointments (starts_at) where status in ('pending','confirmed');

-- Reviews may reference a completed appointment (FK added here).
alter table public.reviews
  add constraint reviews_appointment_fk
  foreign key (appointment_id) references public.appointments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Status transition audit
-- ---------------------------------------------------------------------------
create table public.appointment_status_history (
  id             bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  from_status    public.appointment_status,
  to_status      public.appointment_status not null,
  actor_id       uuid references public.profiles (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index appointment_history_idx
  on public.appointment_status_history (appointment_id, created_at);

-- ---------------------------------------------------------------------------
-- Transient slot holds (checkout / requirement capture)
-- ---------------------------------------------------------------------------
create table public.booking_holds (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid references public.staff_profiles (user_id) on delete cascade,
  customer_id   uuid references public.profiles (id) on delete cascade,
  service_id    uuid not null references public.services (id) on delete cascade,
  location_id   uuid not null references public.salon_locations (id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  session_token text not null,
  expires_at    timestamptz not null,
  converted_appointment_id uuid references public.appointments (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint booking_hold_window check (ends_at > starts_at)
);

create index booking_holds_active_idx
  on public.booking_holds (starts_at) where converted_appointment_id is null;
create index booking_holds_session_idx on public.booking_holds (session_token);

-- ---------------------------------------------------------------------------
-- Client requirements captured before the appointment
-- ---------------------------------------------------------------------------
create table public.requirements (
  id                  uuid primary key default gen_random_uuid(),
  appointment_id      uuid not null unique references public.appointments (id) on delete cascade,
  customer_id         uuid not null references public.profiles (id) on delete cascade,

  -- Current state of the client's hair
  current_length      text,                 -- "short" | "shoulder" | "waist" | ...
  current_texture     public.hair_texture,
  current_colour      text,
  current_density     smallint check (current_density between 1 and 5),
  last_treated_at     date,
  last_treatment      text,
  previous_salon_notes text,

  -- Desired outcome
  desired_style       text not null,
  desired_length      text,
  desired_texture     public.hair_texture,
  desired_colour      text,
  hair_goals          text[] not null default '{}',   -- "growth", "protective", "cuticle care"…
  inspiration_notes   text,

  -- Health & safety
  allergies           text[] not null default '{}',
  scalp_conditions    text[] not null default '{}',   -- "dandruff", "alopecia", "sensitivity"
  medications         text,
  accessibility_needs text,
  patch_test_done     boolean not null default false,
  patch_test_at       date,

  -- Commercial
  budget_min          numeric(12,2),
  budget_max          numeric(12,2),
  is_flexible_on_date boolean not null default false,

  status              public.requirement_status not null default 'draft',
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.staff_profiles (user_id) on delete set null,
  staff_response      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index requirements_customer_idx on public.requirements (customer_id, created_at desc);
create index requirements_status_idx   on public.requirements (status) where status in ('submitted','under_review');
create index requirements_appt_idx     on public.requirements (appointment_id);

-- ---------------------------------------------------------------------------
-- Reference images attached to a requirement
-- ---------------------------------------------------------------------------
create table public.requirement_media (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  storage_path   text not null,
  public_url     text not null,
  kind           text not null default 'reference'
                   check (kind in ('reference', 'current_state', 'inspiration', 'after')),
  caption        text,
  width          integer,
  height         integer,
  bytes          integer,
  mime_type      text,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now()
);

create index requirement_media_idx on public.requirement_media (requirement_id, sort_order);

comment on table public.requirement_media is
  'Binary data lives in the Supabase `requirements` storage bucket; only paths are stored here.';