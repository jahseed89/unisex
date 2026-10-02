-- =============================================================================
-- 0002 · Identity, Roles & Tenancy
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles — 1:1 with auth.users, created by trigger on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  full_name          text,
  slug                text unique,
  phone_e164          text,
  phone_verified_at   timestamptz,
  avatar_url          text,
  cover_url           text,
  gender              public.user_gender,
  date_of_birth       date,
  bio                 text,

  -- Salon-specific client profile
  hair_class          public.hair_class,
  hair_texture        public.hair_texture,
  allergies           text[] not null default '{}',
  accessibility_needs text,
  emergency_contact   jsonb,

  -- Preferences
  locale              text not null default 'en-NG',
  marketing_opt_in    boolean not null default false,
  whatsapp_opt_in     boolean not null default true,
  sms_opt_in          boolean not null default false,
  email_opt_in        boolean not null default true,

  -- Lifecycle
  status              text not null default 'active'
                         check (status in ('active', 'suspended', 'deleted')),
  onboarding_step     text not null default 'profile'
                         check (onboarding_step in ('profile', 'preferences', 'complete')),
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.profiles.status is
  'Suspension is soft; auth.users is only deleted on explicit erasure requests.';

create index profiles_phone_idx     on public.profiles (phone_e164);
create index profiles_created_idx   on public.profiles (created_at desc);
create index profiles_fullname_trgm on public.profiles using gin (full_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Roles & assignments — M2M so custom roles can be added without a migration
-- on new tables or enum values.
-- ---------------------------------------------------------------------------
create table public.roles (
  id          smallserial primary key,
  key         text not null unique check (key ~ '^[a-z_]+$'),
  name        text not null,
  description text,
  -- Capability grants, evaluated by app_private.has_capability()
  capabilities text[] not null default '{}',
  rank        smallint not null default 0,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    smallint not null references public.roles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, role_id)
);

create index user_roles_role_idx on public.user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Staff extension of a profile
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  slug             text unique,
  title            text,                             -- e.g. "Senior Braids Artist"
  headline         text,                             -- short public bio line
  bio              text,
  photo_url        text,
  portfolio_urls   text[] not null default '{}',
  specialities     text[] not null default '{}',      -- service slugs
  employment_type  public.employment_type default 'full_time',
  commission_pct   numeric(5,2) check (commission_pct between 0 and 100),
  hourly_rate      numeric(12,2) check (hourly_rate >= 0),
  is_bookable      boolean not null default true,
  accepts_walk_ins boolean not null default true,
  max_daily_bookings smallint not null default 8,
  hired_on         date,
  employment_end_on date,
  rating_avg       numeric(3,2) check (rating_avg between 0 and 5),
  rating_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint staff_is_active check (employment_end_on is null or employment_end_on >= hired_on)
);

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create table public.salon_locations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique not null,
  address_line1  text not null,
  address_line2  text,
  city           text not null,
  state          text not null,
  country        char(2) not null default 'NG',
  postal_code    text,
  latitude       numeric(9,6),
  longitude      numeric(9,6),
  phone          text,
  whatsapp       text,
  email           text,
  timezone       text not null default 'Africa/Lagos',
  directions     text,
  parking_note   text,
  is_primary     boolean not null default false,
  is_active      boolean not null default true,
  display_order  smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint salon_lat_range  check (latitude is null or latitude between -90 and 90),
  constraint salon_lng_range  check (longitude is null or longitude between -180 and 180)
);

create unique index salon_single_primary_idx
  on public.salon_locations (is_primary) where is_primary;

-- ---------------------------------------------------------------------------
-- Singleton business configuration
-- ---------------------------------------------------------------------------
create table public.business_settings (
  id                       boolean primary key default true check (id),
  business_name            text not null default 'Black Chery Unisex Studio',
  legal_name               text,
  tagline                  text,
  currency                 char(3) not null default 'NGN',
  tax_pct                  numeric(5,2) not null default 7.5 check (tax_pct >= 0),
  tax_inclusive            boolean not null default true,

  -- Booking policy
  booking_lead_time_hours  smallint not null default 4 check (booking_lead_time_hours >= 0),
  max_advance_days         smallint not null default 60 check (max_advance_days > 0),
  min_notice_hours         smallint not null default 2 check (min_notice_hours >= 0),
  cancellation_window_hours smallint not null default 24 check (cancellation_window_hours >= 0),
  no_show_window_minutes   smallint not null default 15,
  max_active_bookings_per_customer smallint not null default 5,
  deposit_required         boolean not null default false,
  deposit_pct              numeric(5,2) not null default 30 check (deposit_pct between 0 and 100),
  allow_walk_ins           boolean not null default true,
  buffer_between_bookings  smallint not null default 0 check (buffer_between_bookings between 0 and 60),

  -- Commerce
  free_delivery_threshold  numeric(12,2),
  standard_delivery_fee    numeric(12,2) not null default 1500,
  accepts_delivery         boolean not null default true,
  accepts_pickup           boolean not null default true,

  -- Contact
  support_email            text,
  support_phone            text,
  whatsapp_number          text,
  instagram                text,
  facebook                 text,
  tiktok                   text,
  x_twitter                text,

  updated_at               timestamptz not null default now()
);

insert into public.business_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);