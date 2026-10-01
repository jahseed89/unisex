-- =============================================================================
-- 0007 · Notifications & Messaging
-- =============================================================================

-- ---------------------------------------------------------------------------
-- In-app inbox. One row per logical notification; fan-out over channels.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         text not null,               -- dotted key, e.g. 'appointment.reminder'
  category     text not null default 'general'
                 check (category in ('general', 'booking', 'commerce', 'recruitment', 'system', 'promotional')),
  title        text not null,
  body         text,
  action_url   text,
  action_label text,
  icon         text,
  priority     public.notification_priority not null default 'normal',
  data         jsonb not null default '{}',
  is_read      boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz                     -- optional TTL for time-sensitive items
);

create index notifications_inbox_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id)
  where is_read = false;

-- ---------------------------------------------------------------------------
-- Per-channel delivery attempts (email / SMS / WhatsApp / push)
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id                bigint generated always as identity primary key,
  notification_id   uuid not null references public.notifications (id) on delete cascade,
  recipient_id      uuid not null references public.profiles (id) on delete cascade,
  channel           public.notification_channel not null,
  destination       text not null,           -- email address, E.164 phone, push token
  provider          text not null default 'internal',
  provider_message_id text,
  status            public.delivery_status not null default 'queued',
  attempt_count     smallint not null default 0,
  scheduled_for     timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  failed_at         timestamptz,
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now(),

  -- Idempotency: one delivery per (notification, channel)
  unique (notification_id, channel)
);

create index deliveries_queue_idx on public.notification_deliveries (scheduled_for)
  where status in ('queued', 'processing');
create index deliveries_recipient_idx on public.notification_deliveries (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- User preferences — opt-outs are respected by the dispatch function
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,                  -- '*' = all types
  channel    public.notification_channel not null,
  enabled    boolean not null default true,
  quiet_hours jsonb,                         -- { "start": "22:00", "end": "07:00" }
  updated_at timestamptz not null default now(),
  primary key (user_id, type, channel)
);

create index notification_prefs_user_idx on public.notification_preferences (user_id);

-- ---------------------------------------------------------------------------
-- Contact-address book used by SMS/WhatsApp jobs
-- ---------------------------------------------------------------------------
create table public.contact_points (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  channel     public.notification_channel not null check (channel in ('email','sms','whatsapp')),
  address     text not null,
  is_primary  boolean not null default false,
  verified_at timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (profile_id, channel, address)
);

create index contact_points_profile_idx on public.contact_points (profile_id) where is_active;

create unique index contact_points_primary_idx
  on public.contact_points (profile_id, channel) where is_primary;

-- ---------------------------------------------------------------------------
-- Scheduled reminder queue. Driven by pg_cron, consumed by Edge Functions.
-- ---------------------------------------------------------------------------
create table public.scheduled_jobs (
  id            uuid primary key default gen_random_uuid(),
  job_name      text not null,
  payload       jsonb not null default '{}',
  run_after     timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  attempts      smallint not null default 0,
  last_error    text,
  locked_at     timestamptz,
  locked_by     text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index scheduled_jobs_due_idx on public.scheduled_jobs (run_after)
  where status = 'pending';

comment on table public.scheduled_jobs is
  'Durable queue. A worker claims rows with FOR UPDATE SKIP LOCKED so multiple workers never double-send.';

-- ---------------------------------------------------------------------------
-- WhatsApp conversation log (opt-in based; Cloud API 24h window respected)
-- ---------------------------------------------------------------------------
create table public.whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  provider_message_id text unique,
  direction      text not null check (direction in ('inbound', 'outbound')),
  profile_id     uuid references public.profiles (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  order_id       uuid references public.orders (id) on delete set null,
  template_name  text,
  body           text,
  status         text not null default 'sent',
  error_message  text,
  sent_at        timestamptz not null default now(),
  delivered_at   timestamptz,
  read_at        timestamptz
);

create index whatsapp_profile_idx on public.whatsapp_messages (profile_id, sent_at desc);