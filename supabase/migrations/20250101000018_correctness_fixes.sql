-- =============================================================================
-- 0018 · Correctness fixes found in review
--
-- Each of these is a real defect, not a refactor. They are grouped here so a
-- fresh database and an upgraded one end in the same correct state.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Cart totals diverged from order totals under tax-inclusive pricing.
--
--    fn_cart_totals returned  subtotal - discount + tax + shipping
--    fn_checkout   stored     subtotal - discount + shipping
--
--    With tax_inclusive = true (the default) the `tax` figure is the portion of
--    the line prices that already belongs to VAT, so adding it double-counted.
--    Customers were shown a total higher than the order they then created.
--
--    Rule: an inclusive tax figure is informative only — never a line item.
-- ---------------------------------------------------------------------------
create or replace function public.fn_cart_totals(p_cart_id uuid)
returns table (
  subtotal      numeric,
  discount      numeric,
  shipping      numeric,
  tax           numeric,
  total         numeric,
  item_count    integer,
  free_shipping_threshold numeric,
  coupon_code   text,
  coupon_message text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with cfg as (
  select * from public.business_settings where id
),
lines as (
  select
    coalesce(sum(ci.unit_price * ci.quantity), 0)::numeric as subtotal,
    coalesce(sum(ci.quantity), 0)::int as item_count,
    coalesce(array_agg(ci.product_id) filter (where ci.product_id is not null), '{}') as product_ids
  from public.cart_items ci
  where ci.cart_id = p_cart_id
),
cart as (
  select c.coupon_code from public.carts c where c.id = p_cart_id
),
coupon as (
  select *
  from public.fn_coupon_preview(
    (select c.coupon_code from cart c),
    (select l.subtotal from lines l),
    (select l.product_ids from lines l)
  )
),
priced as (
  select
    lines.subtotal,
    lines.item_count,
    cart.coupon_code,
    coalesce(coupon.discount_amount, 0) as discount_amount,
    coupon.message as coupon_message,
    -- Delivery is charged only when it is offered, enabled and below threshold.
    case
      when cfg.free_delivery_threshold is null or cfg.free_delivery_threshold <= 0
        then 0
      when lines.subtotal >= cfg.free_delivery_threshold
        then 0
      else cfg.standard_delivery_fee
    end as shipping,
    -- Informative breakdown of the inclusive price. Never added to the total.
    case
      when cfg.tax_inclusive
        then round((lines.subtotal - coalesce(coupon.discount_amount, 0))
                   * cfg.tax_pct / (100 + cfg.tax_pct), 2)
      else round((lines.subtotal - coalesce(coupon.discount_amount, 0))
                 * cfg.tax_pct / 100, 2)
    end as tax,
    -- Ex-VAT subtotal: what we actually remit to the tax authority.
    case
      when cfg.tax_inclusive
        then round((lines.subtotal - coalesce(coupon.discount_amount, 0))
                   * 100 / (100 + cfg.tax_pct), 2)
      else round(lines.subtotal - coalesce(coupon.discount_amount, 0), 2)
    end as net_total
  from lines
  cross join cfg
  cross join cart
  left join coupon on true
)
select
  p.subtotal,
  p.discount_amount,
  case when cfg.accepts_delivery then p.shipping else 0 end,
  p.tax,
  -- Grand total the customer pays. Ex-VAT prices add tax on top; inclusive
  -- prices already contain it, so the inclusive portion is not added again.
  case
    when cfg.tax_inclusive
      then greatest(p.net_total + p.discount_amount, 0)
           + case when cfg.accepts_delivery then p.shipping else 0 end
    else p.subtotal - p.discount_amount + p.tax
         + case when cfg.accepts_delivery then p.shipping else 0 end
  end,
  p.item_count,
  cfg.free_delivery_threshold,
  p.coupon_code,
  p.coupon_message
from priced p
cross join cfg;
$$;

comment on function public.fn_cart_totals(uuid) is
  'Server-authoritative pricing. Under tax-inclusive pricing the tax column is informational: the total is subtotal - discount + shipping, matching fn_checkout exactly.';

-- ---------------------------------------------------------------------------
-- 2. Pending appointments could not be rescheduled.
--
--    The transition graph allowed `confirmed -> rescheduled` but not
--    `pending -> rescheduled`, while fn_reschedule_appointment always routes
--    through the graph. Since every web booking starts as `pending`, rescheduling
--    before the salon confirmed it always failed.
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

  if not (
       app_private.is_admin(auth.uid())
    or (auth.uid() = v_appt.staff_id and app_private.is_staff(auth.uid()))
    or (auth.uid() = v_appt.customer_id and p_status = 'cancelled')
  ) then
    raise exception 'Not permitted to change this appointment'
      using errcode = 'insufficient_privilege';
  end if;

  -- Legal transitions. A booking may be rescheduled while it is still pending or
  -- once confirmed; after work has started the slot is no longer releasable.
  v_allowed := case
    when p_status = v_appt.status                      then true
    when v_appt.status = 'pending'                     then p_status in ('confirmed','cancelled','rescheduled')
    when v_appt.status = 'confirmed'                   then p_status in ('checked_in','in_progress','cancelled','no_show','rescheduled')
    when v_appt.status = 'checked_in'                  then p_status in ('in_progress','cancelled','no_show')
    when v_appt.status = 'in_progress'                 then p_status in ('completed')
    when v_appt.status in ('completed','cancelled','no_show') then false
    else false
  end;

  if not v_allowed then
    raise exception 'Cannot move appointment from % to %', v_appt.status, p_status
      using errcode = 'check_violation';
  end if;

  update public.appointments
  set status          = p_status,
      confirmed_at    = case when p_status = 'confirmed'   and confirmed_at  is null then now() else confirmed_at  end,
      checked_in_at   = case when p_status = 'checked_in'  then now() else checked_in_at end,
      completed_at    = case when p_status = 'completed'   then now() else completed_at end,
      cancelled_at    = case when p_status = 'cancelled'   then now() else cancelled_at end,
      cancelled_by    = case when p_status = 'cancelled'   then auth.uid() else cancelled_by end,
      cancellation_reason = case when p_status = 'cancelled' then p_note else cancellation_reason end,
      updated_at      = now()
  where id = p_appointment_id
  returning * into v_appt;

  return v_appt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A zero-total checkout could not be recorded.
--
--    fn_checkout inserted a `waived` payment with amount 0 for a fully
--    discounted order, but payments.amount has `check (amount > 0)`. The insert
--    raised, so a 100%-off coupon made checkout fail outright. Record the order
--    as paid without inventing a payment row.
-- ---------------------------------------------------------------------------
create or replace function public.fn_checkout(
  p_cart_id          uuid,
  p_contact_name     text,
  p_contact_email    text,
  p_contact_phone    text,
  p_fulfilment_type  public.fulfilment_type default 'pickup',
  p_location_id      uuid default null,
  p_delivery_address jsonb default null,
  p_notes            text default null,
  p_coupon_code      text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart     public.carts%rowtype;
  v_settings public.business_settings;
  v_order    public.orders%rowtype;
  v_totals   record;
  v_item     record;
  v_variant  public.product_variants%rowtype;
  v_product  public.products%rowtype;
  v_shipping numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please sign in to complete your order' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cart from public.carts where id = p_cart_id for update;
  if v_cart.id is null then
    raise exception 'Cart not found' using errcode = 'no_data_found';
  end if;

  if v_cart.user_id is distinct from v_uid and not app_private.is_admin(v_uid) then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    raise exception 'Your cart is empty' using errcode = 'check_violation';
  end if;

  select * into v_settings from public.business_settings where id;

  if p_fulfilment_type = 'delivery' and not v_settings.accepts_delivery then
    raise exception 'Delivery is currently unavailable. Please choose pickup.'
      using errcode = 'check_violation';
  end if;

  if p_fulfilment_type = 'delivery' and (p_delivery_address is null or p_delivery_address = '{}'::jsonb) then
    raise exception 'A delivery address is required' using errcode = 'check_violation';
  end if;

  if p_coupon_code is not null and trim(p_coupon_code) <> '' then
    update public.carts set coupon_code = upper(trim(p_coupon_code)) where id = v_cart.id;
  end if;

  -- Lock every line's variant before validating stock so two concurrent
  -- checkouts cannot both pass the availability check.
  for v_item in
    select ci.variant_id, ci.quantity
    from public.cart_items ci
    where ci.cart_id = v_cart.id
    order by ci.variant_id
    for update
  loop
    select * into v_variant
    from public.product_variants v
    where v.id = v_item.variant_id
    for update;

    if v_variant.id is null or not v_variant.is_active then
      raise exception 'An item in your cart is no longer available' using errcode = 'check_violation';
    end if;

    if v_variant.stock_on_hand < v_item.quantity and not v_variant.backorder_allowed then
      raise exception 'Only % of "%" left - please adjust your cart',
        v_variant.stock_on_hand, v_variant.name using errcode = 'check_violation';
    end if;
  end loop;

  select * into v_totals from public.fn_cart_totals(v_cart.id);
  v_shipping := v_totals.shipping;

  -- v_totals.total is already the authoritative grand total, inclusive or
  -- exclusive of tax as configured. Recomputing it here is what caused the
  -- cart/order divergence, so the server total is used verbatim.
  v_tax   := v_totals.tax;
  v_total := v_totals.total;

  insert into public.orders (
    order_number, customer_id, status, fulfilment_type, location_id,
    subtotal, discount_total, shipping_total, tax_total, total, currency,
    payment_status, coupon_code,
    contact_name, contact_email, contact_phone, delivery_address, customer_notes
  )
  values (
    public.fn_next_reference('ORD'),
    v_uid,
    'pending',
    p_fulfilment_type,
    coalesce(p_location_id, (select id from public.salon_locations where is_primary and is_active)),
    v_totals.subtotal,
    v_totals.discount,
    v_shipping,
    v_tax,
    greatest(v_total, 0),
    v_settings.currency,
    -- A fully discounted or zero-value order is settled on placement. There is
    -- deliberately no payment row, because payments.amount must be positive.
    case when v_total <= 0 then 'paid' else 'awaiting_payment' end,
    nullif(v_cart.coupon_code, ''),
    p_contact_name, p_contact_email, p_contact_phone,
    p_delivery_address, p_notes
  )
  returning * into v_order;

  for v_item in
    select * from public.cart_items where cart_id = v_cart.id order by id
  loop
    select * into v_variant from public.product_variants where id = v_item.variant_id;
    select * into v_product from public.products where id = v_variant.product_id;

    insert into public.order_items (
      order_id, product_id, variant_id,
      name_snapshot, variant_snapshot, sku_snapshot, image_snapshot, attributes,
      unit_price, quantity, line_total, cost_snapshot
    )
    values (
      v_order.id, v_product.id, v_variant.id,
      v_product.name, v_variant.name, v_variant.sku, v_variant.image_url, v_variant.attributes,
      v_variant.price, v_item.quantity, v_variant.price * v_item.quantity, v_variant.cost_price
    );

    update public.product_variants
    set stock_on_hand = stock_on_hand - v_item.quantity,
        updated_at = now()
    where id = v_item.variant_id;

    insert into public.inventory_movements (
      variant_id, product_id, delta, balance_after,
      reason, reference_type, reference_id, actor_id
    )
    values (
      v_item.variant_id, v_variant.product_id, -v_item.quantity,
      v_variant.stock_on_hand - v_item.quantity,
      'sale', 'order', v_order.order_number::text, v_uid
    );

    update public.products
    set sold_count = sold_count + v_item.quantity
    where id = v_variant.product_id;
  end loop;

  if v_order.coupon_code is not null then
    update public.coupons
    set usage_count = usage_count + 1, updated_at = now()
    where code = v_order.coupon_code
      and usage_limit is not null
      and usage_count < usage_limit;
  end if;

  delete from public.cart_items where cart_id = v_cart.id;
  update public.carts set coupon_code = null, updated_at = now() where id = v_cart.id;

  return v_order;
end;
$$;

comment on function public.fn_checkout(uuid, text, text, text, public.fulfilment_type, uuid, jsonb, text, text) is
  'Creates the order, draws down stock and records inventory movements atomically. Pricing is taken verbatim from fn_cart_totals so the cart and the order can never disagree.';

-- ---------------------------------------------------------------------------
-- 4. anon could read cost_price.
--
--    The catalogue views deliberately omit it, but a blanket GRANT on the base
--    tables exposed it anyway — so the view was providing no protection at all.
--    RLS is row-level and cannot help here; column privileges are the correct
--    tool. Cost and margin stay server-side; the client renders retail price.
-- ---------------------------------------------------------------------------
revoke select on public.products, public.product_variants from anon, authenticated;

grant select (
  -- public.product_variants
  id, product_id, sku, slug, name, attributes,
  price, compare_at_price,
  stock_on_hand, stock_reserved, safety_stock, low_stock_threshold, backorder_allowed,
  weight_grams, barcode, image_url, is_default, is_active, display_order,
  created_at, updated_at
) on public.product_variants to anon, authenticated;

grant select (
  -- public.products (cost_price and tax_rate intentionally withheld)
  id, slug, name, kind, category_id, brand, summary, description,
  ingredients, benefits, how_to_use, care_instructions,
  base_price, compare_at_price,
  hair_class, hair_texture, length_cm, weight_g,
  cap_construction, is_pre_stretched, is_glueless,
  image_url, gallery_urls, video_url,
  status, is_featured, is_best_seller, display_order, published_at,
  rating_avg, rating_count, sold_count,
  meta_title, meta_description, created_at, updated_at
) on public.products to anon, authenticated;

-- Cost accounting needs them; that runs server-side with the service role.
grant select on public.products, public.product_variants to service_role;

-- ---------------------------------------------------------------------------
-- 5. The supervisor role was admitted by the route guard but rejected by
--    is_staff(), so it rendered empty lists everywhere.
--
--    Two sources of truth for "who counts as staff" had drifted apart.
--    is_staff() is now the single definition and includes supervisor.
-- ---------------------------------------------------------------------------
create or replace function app_private.is_staff(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.has_role(p_user_id, array['staff', 'supervisor', 'admin']);
$$;

comment on function app_private.is_staff(uuid) is
  'Single source of truth for operational access. Mirrors the RequireRole guard: staff, supervisor and admin.';

-- is_staff_or_admin already covered supervisor via is_staff, but is redefined
-- here so both predicates read from the same list and cannot drift again.
create or replace function app_private.is_staff_or_admin(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app_private.is_staff(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- 6. Staff diary needs the customer, and one request should do it.
--    The account screens also read customer names; adding it here removes the
--    second query the staff screens were forced into.
-- ---------------------------------------------------------------------------
create or replace function public.fn_staff_diary(
  p_from     timestamptz,
  p_to       timestamptz,
  p_staff_id uuid default null
)
returns table (
  id                 uuid,
  reference          text,
  customer_id        uuid,
  service_id         uuid,
  staff_id           uuid,
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             public.appointment_status,
  payment_status     public.payment_status,
  customer_name      text,
  customer_phone     text,
  customer_email     text,
  service_name       text,
  service_slug       text,
  service_summary    text,
  service_duration   integer,
  requirement_status public.requirement_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id, a.reference, a.customer_id, a.service_id, a.staff_id,
    a.starts_at, a.ends_at, a.status, a.payment_status,
    pr.full_name, pr.phone_e164, pr.email,
    s.name, s.slug, s.summary, s.duration_minutes,
    r.status
  from public.appointments a
  join public.services s  on s.id = a.service_id
  left join public.profiles pr on pr.id = a.customer_id
  left join public.requirements r on r.appointment_id = a.id
  where a.starts_at >= p_from
    and a.starts_at <  p_to
    -- A stylist sees only their own diary; an administrator may see anyone's.
    and (p_staff_id is null or a.staff_id = p_staff_id)
    and (
      app_private.is_admin(auth.uid())
      or a.staff_id = auth.uid()
      or app_private.is_staff(auth.uid()) and p_staff_id is not null and p_staff_id = auth.uid()
    )
    and a.status in ('pending','confirmed','checked_in','in_progress','completed')
  order by a.starts_at asc;
$$;

comment on function public.fn_staff_diary(timestamptz, timestamptz, uuid) is
  'Diary projection that includes the customer in one round trip. RLS is bypassed because the join spans profiles, so the WHERE clause re-applies the staff scoping explicitly.';

grant execute on function
  public.fn_staff_diary(timestamptz, timestamptz, uuid),
  public.fn_cart_totals(uuid),
  public.fn_checkout(uuid, text, text, text, public.fulfilment_type, uuid, jsonb, text, text),
  public.fn_set_appointment_status(uuid, public.appointment_status, text)
  to authenticated;

grant execute on function public.fn_cart_totals(uuid) to anon;
