-- =============================================================================
-- 0008 · Auth & Role Helpers, Reference Generators, Generic Triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers
-- SECURITY DEFINER so RLS on user_roles cannot deadlock policy evaluation.
-- Locked search_path prevents search-path hijacking.
-- ---------------------------------------------------------------------------
create or replace function app_private.has_role(p_user_id uuid, p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.key = any (p_keys)
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function app_private.has_capability(p_user_id uuid, p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and p_cap = any (r.capabilities)
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function app_private.is_admin(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.has_role(p_user_id, array['admin']);
$$;

create or replace function app_private.is_staff(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.has_role(p_user_id, array['staff', 'admin']);
$$;

create or replace function app_private.is_staff_or_admin(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.has_role(p_user_id, array['staff', 'admin']);
$$;

-- Public, session-scoped wrappers used directly by RLS policies and the client.
-- Always pass auth.uid() implicitly; never trust a caller-supplied user id.
create or replace function public.fn_is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select app_private.is_admin(auth.uid()); $$;

create or replace function public.fn_is_staff()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select app_private.is_staff(auth.uid()); $$;

create or replace function public.fn_is_staff_or_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select app_private.is_staff_or_admin(auth.uid()); $$;

create or replace function public.fn_my_role_keys()
returns text[] language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(r.key) filter (where r.key is not null),
    '{}'
  )
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and (ur.expires_at is null or ur.expires_at > now());
$$;

comment on function public.fn_my_role_keys() is
  'Client-safe role resolver. Drives route guards and conditional navigation.';

-- Staff can access data they own or that they have been assigned.
create or replace function public.fn_is_assigned_staff(p_staff_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.is_admin(auth.uid())
      or (auth.uid() = p_staff_id)
      or app_private.is_staff(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Generic updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Human-readable references
-- ---------------------------------------------------------------------------
create or replace function public.fn_next_reference(p_prefix text, p_date date default current_date)
returns text
language plpgsql
volatile
as $$
declare
  v_body text;
begin
  -- Crockford-style base32: hex digits mapped onto an unambiguous alphabet.
  -- Entropy comes from gen_random_uuid() (core PG13+), so this needs no
  -- extension. 32^5 ~= 33.5M combinations per day; a unique index is the
  -- final collision guard.
  v_body := upper(substr(translate(
    replace(gen_random_uuid()::text, '-', ''),
    'abcdef0123456789', 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  ), 1, 5));

  return format('%s-%s-%s', p_prefix, to_char(p_date, 'YYYYMMDD'), v_body);
end;
$$;

comment on function public.fn_next_reference is
  'Collision probability for 5 base32 chars across a day is negligible; a unique index is the final guard.';

-- ---------------------------------------------------------------------------
-- Profile provisioning on signup
-- ---------------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full_name text;
  v_slug      text;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  v_slug := lower(regexp_replace(v_full_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'member'; end if;

  insert into public.profiles (id, email, full_name, slug, phone_e164)
  values (
    new.id,
    coalesce(new.email, ''),
    v_full_name,
    v_slug || '-' || substr(new.id::text, 1, 6),
    nullif(new.phone, '')
  )
  on conflict (id) do update
    set email = excluded.email,
        -- Keep the display name the customer set, never clobber with the email prefix
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  -- Every account gets the customer role; elevated roles are granted by admins.
  insert into public.user_roles (user_id, role_id)
  values (new.id, (select id from public.roles where key = 'customer'))
  on conflict do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Money / slug normalisation helpers used by the client and Edge Functions
-- ---------------------------------------------------------------------------
create or replace function public.fn_slugify(p_text text)
returns text
language sql immutable
as $$
  select trim(both '-' from
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')
  );
$$;

create or replace function public.fn_naira(p_amount numeric)
returns text
language sql immutable
as $$
  select '₦' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00');
$$;

-- Staff rating rollup from published reviews
create or replace function public.fn_recalculate_staff_rating(p_staff_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.staff_profiles sp
  set rating_avg = agg.avg_rating,
      rating_count = agg.n,
      updated_at = now()
  from (
    select round(avg(r.rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews r
    where r.staff_id = p_staff_id and r.status = 'published'
  ) agg
  where sp.user_id = p_staff_id;
$$;

-- Service rating rollup
create or replace function public.fn_recalculate_service_rating(p_service_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.services s
  set rating_avg = agg.avg_rating,
      rating_count = agg.n,
      updated_at = now()
  from (
    select round(avg(r.rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews r
    where r.service_id = p_service_id and r.status = 'published'
  ) agg
  where s.id = p_service_id;
$$;

-- Product rating rollup
create or replace function public.fn_recalculate_product_rating(p_product_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.products p
  set rating_avg = agg.avg_rating,
      rating_count = agg.n,
      updated_at = now()
  from (
    select round(avg(r.rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews r
    where r.product_id = p_product_id and r.status = 'published'
  ) agg
  where p.id = p_product_id;
$$;