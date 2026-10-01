-- =============================================================================
-- 0006 · Recruitment: vacancies and applications
-- =============================================================================

create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  department     text,                       -- "Braids", "Colour", "Front of House"
  employment_type public.employment_type not null default 'full_time',

  location_id    uuid references public.salon_locations (id) on delete set null,
  is_remote      boolean not null default false,
  is_hybrid      boolean not null default false,

  summary        text not null,
  description    text not null,              -- markdown
  responsibilities text[] not null default '{}',
  requirements   text[] not null default '{}',
  nice_to_have   text[] not null default '{}',
  benefits       text[] not null default '{}',

  salary_min     numeric(12,2),
  salary_max     numeric(12,2),
  salary_currency char(3) not null default 'NGN',
  salary_period  text not null default 'monthly'
                   check (salary_period in ('hourly', 'daily', 'monthly', 'yearly', 'project')),
  is_disclosed   boolean not null default true,   -- false = "Competitive"

  openings       smallint not null default 1 check (openings > 0),
  filled_count   smallint not null default 0 check (filled_count >= 0),
  min_experience_years numeric(3,1) check (min_experience_years >= 0),

  status         public.job_status not null default 'draft',
  is_featured    boolean not null default false,
  display_order  smallint not null default 0,
  published_at   timestamptz,
  closes_at      date,
  apply_email    text,
  screening_questions jsonb not null default '[]',

  views_count    integer not null default 0,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint jobs_salary_valid check (
    salary_min is null or salary_max is null or salary_max >= salary_min
  ),
  constraint jobs_filled_valid  check (filled_count <= openings),
  constraint jobs_closes_valid  check (closes_at is null or published_at is null or closes_at >= published_at::date)
);

create index jobs_open_idx on public.jobs (status, published_at desc) where status = 'open';
create index jobs_dept_idx on public.jobs (department) where status = 'open';
create index jobs_search_idx on public.jobs using gin (
  to_tsvector('english', title || ' ' || coalesce(summary, '') || ' ' || coalesce(department, ''))
);

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
create table public.job_applications (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null default '',
  job_id           uuid not null references public.jobs (id) on delete cascade,
  applicant_id     uuid references public.profiles (id) on delete set null,

  -- Contact denormalised: applications survive account deletion (GDPR)
  full_name        text not null,
  email            text not null,
  phone_e164       text,
  location         text,

  cover_letter     text,
  portfolio_url    text,
  portfolio_urls   text[] not null default '{}',

  -- Files live in the `applications` storage bucket
  cv_path          text,
  cv_file_name     text,
  cv_bytes         integer,

  answers          jsonb not null default '{}',  -- screening question responses
  experience_years numeric(3,1),
  notice_period    text,
  expected_salary  numeric(12,2),
  available_from   date,

  status           public.application_status not null default 'submitted',
  stage_notes      text,
  rating           smallint check (rating between 1 and 5),
  interview_at     timestamptz,

  consent_contact  boolean not null default false,
  consented_at     timestamptz,

  submitted_at     timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);

-- One live application per person per job. Withdrawn/rejected rows drop out of
-- the index, so a candidate may genuinely re-apply.
create unique index applications_unique_live_idx
  on public.job_applications (job_id, lower(email))
  where status not in ('withdrawn', 'rejected');

create index applications_job_idx     on public.job_applications (job_id, submitted_at desc);
create index applications_status_idx  on public.job_applications (status, submitted_at desc);
create index applications_person_idx on public.job_applications (email);
create index applications_applicant_idx on public.job_applications (applicant_id, submitted_at desc)
  where applicant_id is not null;

-- ---------------------------------------------------------------------------
-- Pipeline history
-- ---------------------------------------------------------------------------
create table public.application_events (
  id            bigint generated always as identity primary key,
  application_id uuid not null references public.job_applications (id) on delete cascade,
  from_status   public.application_status,
  to_status     public.application_status not null,
  actor_id      uuid references public.profiles (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

create index application_events_idx on public.application_events (application_id, created_at);

-- ---------------------------------------------------------------------------
-- Saved job alerts (candidates tracking new vacancies)
-- ---------------------------------------------------------------------------
create table public.job_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  email      text not null,
  keywords   text[] not null default '{}',
  department text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);