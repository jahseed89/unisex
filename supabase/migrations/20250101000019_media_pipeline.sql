-- ---------------------------------------------------------------------------
-- Media pipeline
--
-- Two gaps are closed here.
--
-- 1. The `gallery`, `service-images` and `products` buckets were created
--    public with no write policies at all. Reads worked; there was no way for
--    anyone, including an administrator, to put a photograph into them. Every
--    upload helper in the application therefore had to target a private bucket
--    or bypass storage entirely. These policies make the buckets writable by
--    administrators and supervisors only.
--
-- 2. There is no registry of what each image *shows*. Alt text stored beside a
--    URL is easy to lose and impossible to audit across a gallery. `studio_media`
--    makes the caption part of the record, with a check that rejects the two
--    things that break screen readers: an empty alt, and a decorative image
--    that has not opted out via `is_decorative`.
--
-- The local pipeline (public/images + scripts/sync-media-manifest.mjs) needs
-- none of this. It exists for photographs uploaded after deploy, and for the
-- reference images that must not live in a public bucket.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The studio bucket
--
-- Separate from `gallery` because these are wide establishing shots with no
-- owning record: the hero image, the floor, reception, the product wall. They
-- are referenced by key from src/config/media.ts rather than by a foreign key,
-- so they need somewhere to live that is not tied to a catalogue row.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('studio', 'studio', true, 15728640, array['image/jpeg','image/png','image/webp','image/avif'])
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: write access to the public image buckets
-- ---------------------------------------------------------------------------

-- Uploading is an administrative action. Customers and job applicants can post
-- to `requirements` and `applications`, but nothing here is writable by them:
-- these buckets are world-readable, so a permissive write policy would let any
-- authenticated user overwrite studio photography or plant arbitrary files on
-- the site.
create policy "gallery_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.fn_is_admin());

create policy "gallery_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and public.fn_is_admin())
  with check (bucket_id = 'gallery' and public.fn_is_admin());

create policy "gallery_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.fn_is_admin());

create policy "service_images_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'service-images' and public.fn_is_admin());

create policy "service_images_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'service-images' and public.fn_is_admin())
  with check (bucket_id = 'service-images' and public.fn_is_admin());

create policy "service_images_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'service-images' and public.fn_is_admin());

create policy "products_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and public.fn_is_admin());

create policy "products_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'products' and public.fn_is_admin())
  with check (bucket_id = 'products' and public.fn_is_admin());

create policy "products_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'products' and public.fn_is_admin());

-- ---------------------------------------------------------------------------
-- Media registry
-- ---------------------------------------------------------------------------

create table public.studio_media (
  id             uuid primary key default gen_random_uuid(),
  -- Bucket the file lives in, and its path within it. Together these are the
  -- storage key, which is what `fn_public_media_url` turns into a URL.
  bucket         text        not null check (bucket in ('gallery','service-images','products','studio')),
  path           text        not null check (path !~ '^/' and length(path) between 1 and 300),

  -- What kind of thing this photograph shows. Drives which page embeds it.
  kind           text        not null check (kind in (
                     'hero','interior','team','stylist',
                     'service','product','gallery','before_after','other')),

  -- The caption. Required, and required to be non-blank: an image with no alt
  -- text is invisible to a screen reader, which is a content bug, not a
  -- cosmetic one. Decorative images must say so explicitly instead.
  alt_text       text        not null check (char_length(btrim(alt_text)) > 0),

  -- Subject position as fractions of the frame, so a 4:5 mobile crop can keep
  -- a face in shot. Both are clamped to 0..1 because `object-position` does not
  -- accept values outside that range.
  focal_x        numeric(4,3) not null default 0.5 check (focal_x between 0 and 1),
  focal_y        numeric(4,3) not null default 0.5 check (focal_y between 0 and 1),

  intrinsic_width  integer check (intrinsic_width is null or intrinsic_width > 0),
  intrinsic_height integer check (intrinsic_height is null or intrinsic_height > 0),

  -- Attribution. Optional, because studio photography is owned outright. A
  -- borrowed photograph without these is rejected rather than silently
  -- published without credit.
  credit_author  text,
  credit_license text,
  credit_source  text,
  constraint studio_media_credit_complete check (
    (credit_author is null and credit_license is null and credit_source is null)
    or
    (credit_author is not null and credit_license is not null and credit_source is not null)
  ),

  -- An image flagged decorative is skipped by assistive technology, which is
  -- only correct when it carries no information. Requiring the flag keeps that
  -- a deliberate act.
  is_decorative  boolean not null default false,

  -- Optional links to the record this photograph illustrates. `on delete
  -- set null` so retiring a service does not orphan its photography.
  service_id     uuid references public.services (id) on delete set null,
  product_id     uuid references public.products (id) on delete set null,
  -- staff_profiles is keyed on user_id, not a surrogate id. Every other table
  -- that points at a stylist does the same.
  stylist_id     uuid references public.staff_profiles (user_id) on delete set null,

  display_order  integer not null default 0,
  is_published   boolean not null default false,

  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One row per file. Without this, a double-upload creates two rows pointing
  -- at the same object and the gallery shows the same photograph twice.
  constraint studio_media_bucket_path_key unique (bucket, path)
);

comment on table public.studio_media is
  'Registry of studio photography: what each image shows, its alt text, focal point and attribution.';

-- Lookups are all by bucket, by kind, or by the record illustrated, so the
-- indexes follow the access patterns rather than guessing.
create index studio_media_kind_idx
  on public.studio_media (kind, display_order)
  where is_published;

create index studio_media_service_idx on public.studio_media (service_id) where service_id is not null;
create index studio_media_product_idx on public.studio_media (product_id) where product_id is not null;
create index studio_media_stylist_idx on public.studio_media (stylist_id) where stylist_id is not null;
create index studio_media_published_idx on public.studio_media (display_order) where is_published;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.studio_media enable row level security;

-- Published photography is public. It is no more sensitive than the CSS.
create policy "studio_media_public_read"
  on public.studio_media for select to anon, authenticated
  using (is_published);

-- Staff can see unpublished work so a photographer's review queue is not
-- limited to administrators.
create policy "studio_media_staff_read"
  on public.studio_media for select to authenticated
  using (public.fn_is_staff_or_admin());

-- Only administrators publish or retire photography. Supervisors manage the
-- diary, not the brand's public face.
create policy "studio_media_admin_write"
  on public.studio_media for all to authenticated
  using (public.fn_is_admin())
  with check (public.fn_is_admin());

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create trigger studio_media_set_updated_at
  before update on public.studio_media
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Public RPC
-- ---------------------------------------------------------------------------

-- Returns published photography for a kind, with a ready-to-render URL.
--
-- SECURITY DEFINER because an anonymous visitor must be able to call it, and
-- RLS alone cannot grant a table read to `anon` without also exposing drafts.
-- The `where is_published` predicate is repeated in the query rather than
-- relying on the policy, because a SECURITY DEFINER function bypasses RLS.
create or replace function public.fn_public_media(p_kind text)
returns table (
  id         uuid,
  kind       text,
  bucket     text,
  path       text,
  alt_text   text,
  focal_x    numeric,
  focal_y    numeric,
  width      integer,
  height     integer,
  credit     jsonb,
  display_order integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    m.id,
    m.kind,
    m.bucket,
    m.path,
    m.alt_text,
    m.focal_x,
    m.focal_y,
    m.intrinsic_width,
    m.intrinsic_height,
    case
      when m.credit_author is null then null
      else jsonb_build_object(
        'author',  m.credit_author,
        'license', m.credit_license,
        'source',  m.credit_source
      )
    end,
    m.display_order
  from public.studio_media m
  where m.is_published
    and (p_kind is null or m.kind = p_kind)
  order by m.display_order, m.created_at;
$$;

comment on function public.fn_public_media(text) is
  'Published photography for a kind, as bucket plus storage path. The caller assembles the URL, since the database has no source of truth for the Supabase project URL. Rows flagged is_decorative must be rendered as CSS backgrounds rather than <img> elements.';

grant execute on function public.fn_public_media(text) to anon, authenticated;