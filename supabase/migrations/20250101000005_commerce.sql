-- =============================================================================
-- 0005 · Commerce: products, inventory, carts, orders, payments
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Catalog taxonomy
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  description  text,
  parent_id    uuid references public.product_categories (id) on delete set null,
  image_url    text,
  icon         text,
  display_order smallint not null default 0,
  is_active    boolean not null default true,
  meta_title       text,
  meta_description text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  kind             public.product_kind not null default 'hair_care',
  category_id      uuid references public.product_categories (id) on delete set null,
  brand            text,

  summary          text not null,
  description      text,                       -- markdown
  ingredients      text[] not null default '{}',
  benefits         text[] not null default '{}',
  how_to_use       text[] not null default '{}',
  care_instructions text,

  -- Price band (sell price is always per-variant)
  base_price       numeric(12,2) not null default 0 check (base_price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= base_price),
  cost_price       numeric(12,2) check (cost_price >= 0),
  tax_rate         numeric(5,2) not null default 0 check (tax_rate >= 0),

  -- Hair attributes drive fit recommendations and filters
  hair_class       public.hair_class,
  hair_texture     public.hair_texture,
  length_cm        integer check (length_cm > 0),
  weight_g         integer check (weight_g > 0),
  cap_construction text,                        -- "13x4 lace", "full lace", "i-top"
  is_pre_stretched boolean not null default false,
  is_glueless      boolean not null default false,

  -- Media
  image_url        text,
  gallery_urls     text[] not null default '{}',
  video_url        text,

  -- Lifecycle
  status           public.product_status not null default 'draft',
  is_featured      boolean not null default false,
  is_best_seller   boolean not null default false,
  display_order    smallint not null default 0,
  published_at     timestamptz,

  rating_avg       numeric(3,2) check (rating_avg between 0 and 5),
  rating_count     integer not null default 0,
  sold_count       integer not null default 0,

  meta_title       text,
  meta_description text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A compare-at price exists only when genuinely higher (drives the strikethrough badge).
  constraint products_compare_at_higher check (compare_at_price is null or compare_at_price > base_price)
);

create index products_category_idx on public.products (category_id) where status = 'active';
create index products_kind_idx     on public.products (kind) where status = 'active';
create index products_active_idx   on public.products (display_order) where status = 'active';
create index products_featured_idx on public.products (is_featured) where status = 'active';
create index products_search_idx   on public.products using gin (
  to_tsvector('english', name || ' ' || coalesce(summary,'') || ' ' || coalesce(brand,''))
);
create index products_name_trgm    on public.products using gin (name extensions.gin_trgm_ops);

-- Reviews can also target shop products (FK deferred from migration 0003).
alter table public.reviews
  add constraint reviews_product_fk
  foreign key (product_id) references public.products (id) on delete set null;

create index reviews_product_idx on public.reviews (product_id) where status = 'published';

-- ---------------------------------------------------------------------------
-- Variants — the unit of stock and price
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products (id) on delete cascade,
  sku                text unique not null,
  slug               text not null,
  name               text not null,              -- "30 inch · 200g · Curly"
  attributes         jsonb not null default '{}',
  price              numeric(12,2) not null check (price >= 0),
  compare_at_price   numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  cost_price         numeric(12,2) check (cost_price >= 0),

  -- Inventory: available = on_hand - reserved - safety_stock
  stock_on_hand      integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved     integer not null default 0 check (stock_reserved >= 0),
  safety_stock       integer not null default 0 check (safety_stock >= 0),
  low_stock_threshold integer not null default 3,
  backorder_allowed  boolean not null default false,

  weight_grams       integer check (weight_grams > 0),
  barcode            text,
  image_url          text,
  is_default         boolean not null default false,
  is_active          boolean not null default true,
  display_order      smallint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint variant_stock_nonneg check (stock_on_hand >= 0 and stock_reserved >= 0),
  unique (product_id, slug)
);

create index variants_product_idx  on public.product_variants (product_id) where is_active;
create index variants_low_stock_idx on public.product_variants (stock_on_hand)
  where is_active and stock_on_hand <= low_stock_threshold;

-- Only one default variant per product
create unique index variants_single_default_idx
  on public.product_variants (product_id) where is_default;

-- ---------------------------------------------------------------------------
-- Inventory ledger (append-only; authoritative audit trail)
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id           bigint generated always as identity primary key,
  variant_id   uuid not null references public.product_variants (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  delta        integer not null,               -- + receipt, − sale
  balance_after integer not null,
  reason       public.inventory_reason not null,
  reference_type text,
  reference_id text,
  note         text,
  actor_id     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index inventory_movements_variant_idx
  on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_ref_idx
  on public.inventory_movements (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------------
create table public.wishlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Carts (guest carts keyed by session token)
-- ---------------------------------------------------------------------------
create table public.carts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete cascade,
  session_token text,
  currency      char(3) not null default 'NGN',
  coupon_code   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cart_identity check (user_id is not null or session_token is not null)
);

create unique index carts_user_unique_idx on public.carts (user_id) where user_id is not null;
create unique index carts_session_unique_idx on public.carts (session_token) where session_token is not null;

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0 and quantity <= 99),
  -- Snapshot so a price change never silently alters an in-flight cart
  unit_price numeric(12,2) not null check (unit_price >= 0),
  added_at   timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index cart_items_cart_idx on public.cart_items (cart_id);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null check (code = upper(code)),
  description    text,
  discount_type  public.discount_type not null default 'percentage',
  value          numeric(12,2) not null check (value > 0),
  min_subtotal   numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_discount   numeric(12,2) check (max_discount is null or max_discount > 0),
  -- Restrict to a set of products/categories; empty = site-wide
  product_scope  uuid[] not null default '{}',
  category_scope text[] not null default '{}',
  usage_limit    integer check (usage_limit is null or usage_limit > 0),
  per_user_limit smallint check (per_user_limit is null or per_user_limit > 0),
  usage_count    integer not null default 0 check (usage_count >= 0),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint coupon_window_valid check (ends_at is null or ends_at > starts_at),
  constraint coupon_usage_valid  check (usage_limit is null or usage_count <= usage_limit)
);

create index coupons_active_idx on public.coupons (is_active, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text unique not null default '',
  customer_id      uuid references public.profiles (id) on delete set null,
  status           public.order_status not null default 'pending',
  fulfilment_type  public.fulfilment_type not null default 'pickup',
  location_id      uuid references public.salon_locations (id) on delete set null,

  subtotal         numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total   numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total   numeric(12,2) not null default 0 check (shipping_total >= 0),
  tax_total        numeric(12,2) not null default 0 check (tax_total >= 0),
  total            numeric(12,2) not null default 0 check (total >= 0),
  paid_total       numeric(12,2) not null default 0 check (paid_total >= 0),
  refund_total     numeric(12,2) not null default 0 check (refund_total >= 0),
  currency         char(3) not null default 'NGN',
  payment_status   public.payment_status not null default 'awaiting_payment',
  coupon_code      text references public.coupons (code) on delete set null,

  -- Contact is denormalised: an order must survive profile deletion / GDPR erasure
  contact_name     text not null,
  contact_email    text not null,
  contact_phone    text not null,
  delivery_address jsonb,
  delivery_notes   text,
  customer_notes   text,
  internal_notes   text,
  tracking_number  text,
  courier          text,

  placed_at        timestamptz not null default now(),
  confirmed_at     timestamptz,
  fulfilled_at     timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  updated_at       timestamptz not null default now()
);

create index orders_customer_idx on public.orders (customer_id, placed_at desc);
create index orders_status_idx   on public.orders (status, placed_at desc);
create index orders_location_idx on public.orders (location_id, placed_at desc);
create index orders_unpaid_idx   on public.orders (placed_at) where payment_status in ('awaiting_payment','partially_paid');

-- ---------------------------------------------------------------------------
-- Order lines — fully snapshotted for legal/audit integrity
-- ---------------------------------------------------------------------------
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  variant_id     uuid references public.product_variants (id) on delete set null,

  name_snapshot  text not null,
  variant_snapshot text,
  sku_snapshot   text,
  image_snapshot text,
  attributes     jsonb not null default '{}',

  unit_price     numeric(12,2) not null check (unit_price >= 0),
  quantity       integer not null check (quantity > 0),
  line_total     numeric(12,2) not null check (line_total >= 0),
  cost_snapshot  numeric(12,2),

  fulfilled_qty  integer not null default 0 check (fulfilled_qty >= 0 and fulfilled_qty <= quantity),
  refunded_qty   integer not null default 0 check (refunded_qty >= 0 and refunded_qty <= quantity),
  created_at     timestamptz not null default now()
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- Payments (unified across orders and appointments)
-- ---------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null default '',
  customer_id      uuid references public.profiles (id) on delete set null,
  order_id         uuid references public.orders (id) on delete cascade,
  appointment_id   uuid references public.appointments (id) on delete cascade,

  provider         public.payment_provider not null default 'paystack',
  provider_reference text,
  amount           numeric(12,2) not null check (amount > 0),
  refunded_amount  numeric(12,2) not null default 0 check (refunded_amount >= 0),
  currency         char(3) not null default 'NGN',
  status           public.payment_status not null default 'awaiting_payment',
  channel          text,                       -- card, bank, ussd, bank_transfer, mobile_money
  customer_email   text,
  customer_phone   text,

  purpose          text not null default 'order'
                     check (purpose in ('order', 'appointment_deposit', 'appointment_balance', 'service_balance')),

  -- Paystack specifics
  authorization_code text,
  access_code        text,
  paid_at          timestamptz,
  verified_at      timestamptz,
  expires_at       timestamptz,
  raw_payload      jsonb,                      -- signed webhook body, for disputes

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payment_amount_valid  check (refunded_amount <= amount),
  constraint payment_link_valid   check (
    (order_id is not null) <> (appointment_id is not null)
  )
);

create unique index payments_provider_ref_idx
  on public.payments (provider, provider_reference) where provider_reference is not null;
create index payments_order_idx       on public.payments (order_id);
create index payments_appointment_idx on public.payments (appointment_id);
create index payments_customer_idx    on public.payments (customer_id, created_at desc);
create index payments_reconcile_idx   on public.payments (created_at) where status = 'awaiting_payment';

-- Payment webhook events — idempotency guard against provider retries
create table public.payment_events (
  id              bigint generated always as identity primary key,
  provider        public.payment_provider not null,
  event           text not null,
  provider_ref    text,
  payload         jsonb not null,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  unique (provider, event, provider_ref)
);

create index payment_events_unprocessed_idx on public.payment_events (created_at)
  where processed_at is null;
