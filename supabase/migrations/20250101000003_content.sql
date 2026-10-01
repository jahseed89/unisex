-- =============================================================================
-- 0003 · Content: Services, Gallery, Pages, Reviews, FAQs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Service taxonomy
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  icon          text,                       -- lucide icon key
  image_url     text,
  display_order smallint not null default 0,
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  meta_title    text,
  meta_description text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  name               text not null,
  category_id        uuid references public.service_categories (id) on delete set null,
  summary            text not null,
  description        text,                   -- markdown
  includes           text[] not null default '{}',
  excludes           text[] not null default '{}',
  aftercare          text[] not null default '{}',

  -- Scheduling
  duration_minutes   integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  buffer_minutes     integer not null default 0 check (buffer_minutes >= 0),
  cleanup_minutes    integer not null default 10 check (cleanup_minutes >= 0),

  -- Pricing (cents-agnostic; store as numeric NGN)
  price_from         numeric(12,2) not null default 0 check (price_from >= 0),
  price_to           numeric(12,2) check (price_to is null or price_to >= price_from),
  price_unit         text not null default 'per_session',

  -- Eligibility
  requires_consultation boolean not null default false,
  requires_requirement  boolean not null default true,
  gender_restriction  public.user_gender,   -- null = unisex
  min_age             smallint,
  max_concurrent      smallint not null default 1 check (max_concurrent > 0),

  -- Presentation
  image_url          text,
  gallery_urls       text[] not null default '{}',
  badge              text,
  is_featured        boolean not null default false,
  is_popular         boolean not null default false,
  display_order      smallint not null default 0,
  status             text not null default 'active'
                       check (status in ('draft', 'active', 'archived')),

  -- SEO
  meta_title         text,
  meta_description   text,

  rating_avg         numeric(3,2) check (rating_avg between 0 and 5),
  rating_count       integer not null default 0,
  bookings_count     integer not null default 0,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index services_category_idx   on public.services (category_id) where status = 'active';
create index services_active_order_idx on public.services (display_order) where status = 'active';
create index services_featured_idx  on public.services (is_featured desc) where status = 'active';
create index services_search_idx    on public.services using gin (
  to_tsvector('english', name || ' ' || coalesce(summary, '') || ' ' || coalesce(description, ''))
);
create index services_name_trgm     on public.services using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Price / duration variants keyed on hair length or size
-- ---------------------------------------------------------------------------
create table public.service_variants (
  id               uuid primary key default gen_random_uuid(),
  service_id       uuid not null references public.services (id) on delete cascade,
  slug             text not null,
  label            text not null,            -- "Shoulder length", "36 inch"
  description      text,
  price            numeric(12,2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  display_order    smallint not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (service_id, slug)
);

-- ---------------------------------------------------------------------------
-- Service ↔ staff capability mapping
-- ---------------------------------------------------------------------------
create table public.staff_services (
  staff_id  uuid not null references public.staff_profiles (user_id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price_override  numeric(12,2) check (price_override >= 0),
  duration_override integer check (duration_override > 0),
  is_active boolean not null default true,
  primary key (staff_id, service_id)
);

-- ---------------------------------------------------------------------------
-- Gallery
-- ---------------------------------------------------------------------------
create table public.gallery_items (
  id             uuid primary key default gen_random_uuid(),
  title          text,
  slug           text unique,
  category       text not null default 'hair'
                   check (category in ('hair', 'braids', 'locs', 'colour', 'styling', 'makeup', 'nails', 'before_after', 'interior', 'team')),
  image_url      text not null,
  before_image_url text,
  after_image_url  text,
  alt_text       text,                       -- required for a11y/SEO
  stylist_id     uuid references public.staff_profiles (user_id) on delete set null,
  service_id     uuid references public.services (id) on delete set null,
  tags           text[] not null default '{}',
  is_featured    boolean not null default false,
  display_order  smallint not null default 0,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now()
);

create index gallery_published_idx on public.gallery_items (is_published, display_order);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.profiles (id) on delete set null,
  appointment_id uuid,
  service_id    uuid references public.services (id) on delete set null,
  staff_id      uuid references public.staff_profiles (user_id) on delete set null,
  -- product_id FK is added in 0005, once the products table exists.
  product_id    uuid,
  rating        smallint not null check (rating between 1 and 5),
  title         text,
  body          text not null,
  image_urls    text[] not null default '{}',
  staff_reply   text,
  replied_at    timestamptz,
  status        public.review_status not null default 'pending',
  is_featured   boolean not null default false,
  created_at    timestamptz not null default now(),
  moderated_at  timestamptz,
  moderated_by  uuid references public.profiles (id) on delete set null
);

create index reviews_status_idx  on public.reviews (status, created_at desc);
create index reviews_featured_idx on public.reviews (is_featured) where status = 'published';
create index reviews_service_idx on public.reviews (service_id) where status = 'published';

-- ---------------------------------------------------------------------------
-- CMS pages (About Us, policies, custom landing pages)
-- ---------------------------------------------------------------------------
create table public.pages (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  eyebrow          text,
  excerpt          text,
  body_md          text,
  hero_image_url   text,
  is_published     boolean not null default false,
  noindex          boolean not null default false,
  meta_title       text,
  meta_description text,
  published_at     timestamptz,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- FAQs
-- ---------------------------------------------------------------------------
create table public.faqs (
  id            uuid primary key default gen_random_uuid(),
  question      text not null,
  answer        text not null,
  category      text not null default 'general',
  page_slug     text,                        -- null = site-wide
  display_order smallint not null default 0,
  is_published  boolean not null default true,
  helpful_count integer not null default 0,
  created_at    timestamptz not null default now()
);

create index faqs_published_idx on public.faqs (is_published, display_order);

-- ---------------------------------------------------------------------------
-- Static marketing/transactional content used by notifications
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  channel     public.notification_channel not null,
  locale      text not null default 'en-NG',
  subject     text,
  body        text not null,
  variables   text[] not null default '{}',
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);