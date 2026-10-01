-- =============================================================================
-- 0010 · Commerce Engine: inventory, cart, coupons, checkout
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create or replace function public.fn_available_stock(p_variant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select greatest(v.stock_on_hand - v.stock_reserved - v.safety_stock, 0)
     from public.product_variants v where v.id = p_variant_id),
    0
  );
$$;

create or replace function public.fn_adjust_stock(
  p_variant_id    uuid,
  p_delta         integer,
  p_reason        public.inventory_reason,
  p_note          text default null,
  p_reference_type text default null,
  p_reference_id  text default null
)
returns public.product_variants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variant  public.product_variants%rowtype;
  v_new_stock integer;
begin
  if not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Only staff can adjust inventory' using errcode = 'insufficient_privilege';
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if v_variant.id is null then
    raise exception 'Variant not found' using errcode = 'no_data_found';
  end if;

  v_new_stock := v_variant.stock_on_hand + p_delta;

  -- Physical count cannot go negative. Backorders are opt-in per variant.
  if v_new_stock < 0 and not v_variant.backorder_allowed then
    raise exception 'Cannot reduce % below zero (currently %)', v_variant.name, v_variant.stock_on_hand
      using errcode = 'check_violation';
  end if;

  update public.product_variants
  set stock_on_hand = greatest(v_new_stock, 0),
      updated_at = now()
  where id = p_variant_id
  returning * into v_variant;

  insert into public.inventory_movements (
    variant_id, product_id, delta, balance_after,
    reason, reference_type, reference_id, note, actor_id
  )
  values (
    p_variant_id, v_variant.product_id, p_delta, v_variant.stock_on_hand,
    p_reason, p_reference_type, p_reference_id, p_note, auth.uid()
  );

  -- Notify the merchandising team when a SKU crosses its reorder threshold.
  if v_variant.stock_on_hand <= v_variant.low_stock_threshold
     and v_new_stock >= 0
     and v_variant.is_active then
    insert into public.scheduled_jobs (job_name, payload, run_after)
    values (
      'low_stock_alert',
      jsonb_build_object(
        'variant_id', p_variant_id,
        'sku', v_variant.sku,
        'name', v_variant.name,
        'on_hand', v_variant.stock_on_hand,
        'threshold', v_variant.low_stock_threshold
      ),
      now()
    );
  end if;

  return v_variant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cart lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.fn_get_or_create_cart(p_session_token text default null)
returns public.carts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart public.carts%rowtype;
  v_uid  uuid := auth.uid();
begin
  if v_uid is not null then
    select * into v_cart from public.carts where user_id = v_uid;
    if v_cart.id is not null then
      -- Merge any guest cart into the account cart on sign-in.
      if p_session_token is not null then
        perform public.fn_merge_carts(p_session_token, v_uid);
        select * into v_cart from public.carts where user_id = v_uid;
      end if;
      return v_cart;
    end if;
  end if;

  if p_session_token is null then
    raise exception 'A session token is required for guest carts' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.carts (user_id, session_token)
  values (v_uid, case when v_uid is null then p_session_token else null end)
  on conflict do nothing;

  select * into v_cart
  from public.carts
  where (v_uid is not null and user_id = v_uid)
     or (v_uid is null and session_token = p_session_token);

  return v_cart;
end;
$$;

-- Merge a guest cart into the user's cart, combining duplicate lines.
create or replace function public.fn_merge_carts(p_session_token text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guest public.carts%rowtype;
  v_user  public.carts%rowtype;
  v_item  record;
begin
  select * into v_guest from public.carts
   where session_token = p_session_token and user_id is null
   for update;

  if v_guest.id is null then return; end if;

  insert into public.carts (user_id) values (p_user_id)
  on conflict (user_id) do update set updated_at = now()
  returning * into v_user;

  for v_item in
    select ci.variant_id, ci.product_id, ci.quantity, ci.unit_price
    from public.cart_items ci
    where ci.cart_id = v_guest.id
  loop
    insert into public.cart_items (cart_id, variant_id, product_id, quantity, unit_price)
    values (v_user.id, v_item.variant_id, v_item.product_id, v_item.quantity, v_item.unit_price)
    on conflict (cart_id, variant_id) do update
      set quantity = (
        select least(
          public.cart_items.quantity + excluded.quantity,
          coalesce((select stock_on_hand from public.product_variants
                    where id = v_item.variant_id), 99)
        )
      );
  end loop;

  delete from public.carts where id = v_guest.id;
end;
$$;

create or replace function public.fn_add_to_cart(
  p_variant_id uuid,
  p_quantity  integer default 1,
  p_session_token text default null
)
returns public.cart_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart     public.carts%rowtype;
  v_variant  public.product_variants%rowtype;
  v_product  public.products%rowtype;
  v_item     public.cart_items%rowtype;
  v_existing integer;
  v_wanted   integer;
begin
  if coalesce(p_quantity, 1) <= 0 then
    raise exception 'Quantity must be positive' using errcode = 'invalid_parameter_value';
  end if;

  select v.* into v_variant
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id
    and v.is_active
    and p.status = 'active'
  for update of v;

  if v_variant.id is null then
    raise exception 'Product is no longer available' using errcode = 'no_data_found';
  end if;

  select * into v_product from public.products where id = v_variant.product_id;

  select * into v_cart from public.fn_get_or_create_cart(p_session_token);

  select coalesce(quantity, 0) into v_existing
  from public.cart_items
  where cart_id = v_cart.id and variant_id = p_variant_id;

  v_wanted := v_existing + p_quantity;

  if not v_variant.backorder_allowed and v_wanted > v_variant.stock_on_hand then
    if v_variant.stock_on_hand = 0 then
      raise exception 'Out of stock' using errcode = 'check_violation';
    end if;
    raise exception 'Only % left in stock', v_variant.stock_on_hand
      using errcode = 'check_violation';
  end if;

  insert into public.cart_items (cart_id, variant_id, product_id, quantity, unit_price)
  values (v_cart.id, p_variant_id, v_product.id, p_wanted, v_variant.price)
  on conflict (cart_id, variant_id) do update
    set quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        added_at = now()
  returning * into v_item;

  update public.carts set updated_at = now() where id = v_cart.id;
  return v_item;
end;
$$;

create or replace function public.fn_update_cart_item(p_cart_item_id uuid, p_quantity integer)
returns public.cart_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item    public.cart_items%rowtype;
  v_variant public.product_variants%rowtype;
begin
  select * into v_item from public.cart_items where id = p_cart_item_id for update;
  if v_item.id is null then
    raise exception 'Cart item not found' using errcode = 'no_data_found';
  end if;

  if not app_private.is_staff_or_admin(auth.uid()) then
    select 1 into v_variant from public.carts
    where id = v_item.cart_id and user_id = auth.uid();
    if v_variant.id is null then
      raise exception 'Not permitted' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_quantity <= 0 then
    delete from public.cart_items where id = p_cart_item_id;
    return null;
  end if;

  select * into v_variant from public.product_variants where id = v_item.variant_id;
  if not v_variant.backorder_allowed and p_quantity > v_variant.stock_on_hand then
    raise exception 'Only % available', v_variant.stock_on_hand using errcode = 'check_violation';
  end if;

  -- Re-read price so a pricing change applies to the cart on next interaction
  update public.cart_items
  set quantity = p_quantity,
      unit_price = v_variant.price,
      added_at = now()
  where id = p_cart_item_id
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.fn_remove_cart_item(p_cart_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.cart_items ci
  using public.carts c
  where ci.id = p_cart_item_id
    and ci.cart_id = c.id
    and (c.user_id = auth.uid() or app_private.is_staff_or_admin(auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Coupon evaluation (also used by the UI to preview a discount)
-- ---------------------------------------------------------------------------
create or replace function public.fn_coupon_preview(
  p_code      text,
  p_subtotal  numeric,
  p_product_ids uuid[] default '{}'
)
returns table (
  is_valid       boolean,
  message        text,
  discount_amount numeric,
  coupon_code    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with c as (
  select * from public.coupons
  where code = upper(trim(coalesce(p_code, '')))
)
select
  case
    when c.id is null                                    then false
    when not c.is_active                                 then false
    when now() < c.starts_at                             then false
    when c.ends_at is not null and now() > c.ends_at     then false
    when p_subtotal < c.min_subtotal                     then false
    when c.usage_limit is not null
         and c.usage_count >= c.usage_limit              then false
    when cardinality(c.product_scope) > 0
         and not (c.product_scope && p_product_ids)     then false
    else true
  end as is_valid,
  case
    when c.id is null                                    then 'This code is not recognised'
    when not c.is_active                                 then 'This code is no longer active'
    when now() < c.starts_at                             then 'This code is not active yet'
    when c.ends_at is not null and now() > c.ends_at     then 'This code has expired'
    when p_subtotal < c.min_subtotal
      then format('Spend %s to use this code', public.fn_naira(c.min_subtotal))
    when c.usage_limit is not null
         and c.usage_count >= c.usage_limit              then 'This code has been fully redeemed'
    when cardinality(c.product_scope) > 0
         and not (c.product_scope && p_product_ids)     then 'This code does not apply to your items'
    else 'Applied'
  end as message,
  case
    when c.id is null
      or not c.is_active
      or now() < c.starts_at
      or (c.ends_at is not null and now() > c.ends_at)
      or p_subtotal < c.min_subtotal
      or (c.usage_limit is not null and c.usage_count >= c.usage_limit)
      or (cardinality(c.product_scope) > 0 and not (c.product_scope && p_product_ids))
      then 0::numeric
    when c.discount_type = 'percentage'
      then round(least(
             p_subtotal * (c.value / 100),
             coalesce(c.max_discount, p_subtotal)
           ), 2)
    when c.discount_type = 'fixed_amount'
      then least(c.value, p_subtotal)
    else 0::numeric
  end as discount_amount,
  c.code as coupon_code
from c;
$$;

-- ---------------------------------------------------------------------------
-- Cart totals (server-authoritative; the client never computes money)
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
  -- A CTE's output columns are not implicitly in scope; reach them via
  -- subqueries rather than bare references.
  select *
  from public.fn_coupon_preview(
    (select c.coupon_code from public.carts c where c.id = p_cart_id),
    (select l.subtotal from lines l),
    (select l.product_ids from lines l)
  )
),
priced as (
  select
    lines.subtotal,
    lines.item_count,
    lines.product_ids,
    cart.coupon_code,
    coalesce(coupon.discount_amount, 0) as discount_amount,
    coupon.message                 as coupon_message,
    -- Delivery is charged only when it is offered, enabled and below threshold.
    case
      when cfg.free_delivery_threshold is null or cfg.free_delivery_threshold <= 0
        then 0
      when lines.subtotal >= cfg.free_delivery_threshold
        then 0
      else cfg.standard_delivery_fee
    end as shipping,
    -- Prices are tax-inclusive by default: the tax shown is the portion
    -- already contained in the line totals, not an additional charge.
    case
      when cfg.tax_inclusive
        then round((lines.subtotal - coalesce(coupon.discount_amount, 0))
                    * cfg.tax_pct / (100 + cfg.tax_pct), 2)
      else round((lines.subtotal - coalesce(coupon.discount_amount, 0))
                 * cfg.tax_pct / 100, 2)
    end as tax
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
  greatest(p.subtotal - p.discount_amount + p.tax, 0)
    + case when cfg.accepts_delivery then p.shipping else 0 end,
  p.item_count,
  cfg.free_delivery_threshold,
  p.coupon_code,
  p.coupon_message
from priced p
cross join cfg;
$$;

-- ---------------------------------------------------------------------------
-- Checkout — atomic order creation + stock decrement
-- ---------------------------------------------------------------------------
create or replace function public.fn_checkout(
  -- Required parameters first: PostgreSQL forbids a defaulted parameter
  -- preceding a required one.
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
  v_coupon   record;
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

  -- Optionally attach a coupon before pricing
  if p_coupon_code is not null and trim(p_coupon_code) <> '' then
    update public.carts set coupon_code = upper(trim(p_coupon_code)) where id = v_cart.id;
  end if;

  -- Lock every line's variant before validating stock so two concurrent
  -- checkouts cannot both pass the availability check.
  for v_item in
    select ci.id, ci.variant_id, ci.quantity, ci.unit_price
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
      raise exception 'Only % of "%" left — please adjust your cart',
        v_variant.stock_on_hand, v_variant.name using errcode = 'check_violation';
    end if;
  end loop;

  select * into v_totals from public.fn_cart_totals(v_cart.id);
  v_shipping := case
    when p_fulfilment_type = 'pickup' then 0
    when v_settings.free_delivery_threshold > 0
         and v_totals.subtotal >= v_settings.free_delivery_threshold then 0
    else v_settings.standard_delivery_fee
  end;

  v_tax := case
    when v_settings.tax_inclusive
      then round((v_totals.subtotal - v_totals.discount) * v_settings.tax_pct / (100 + v_settings.tax_pct), 2)
    else round((v_totals.subtotal - v_totals.discount) * v_settings.tax_pct / 100, 2)
  end;

  v_total := case
    when v_settings.tax_inclusive then v_totals.subtotal - v_totals.discount + v_shipping
    else v_totals.subtotal - v_totals.discount + v_tax + v_shipping
  end;

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
    coalesce(p_location_id,
             (select id from public.salon_locations where is_primary and is_active)),
    v_totals.subtotal, v_totals.discount, v_shipping, v_tax, greatest(v_total, 0),
    v_settings.currency,
    case when v_total > 0 then 'awaiting_payment' else 'paid' end,
    nullif(v_cart.coupon_code, ''),
    p_contact_name, p_contact_email, p_contact_phone,
    p_delivery_address, p_notes
  )
  returning * into v_order;

  -- Line items: snapshot everything for legal and audit integrity
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

    -- Draw down stock and record the movement in the same transaction
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

  if v_total <= 0 then
    insert into public.payments (
      reference, customer_id, order_id, provider, amount, currency,
      status, purpose, paid_at, verified_at, channel
    )
    values (
      public.fn_next_reference('PAY'), v_uid, v_order.id, 'waived', 0,
      v_settings.currency, 'paid', 'order', now(), now(), 'no_payment_required'
    );
  end if;

  delete from public.cart_items where cart_id = v_cart.id;
  update public.carts set coupon_code = null, updated_at = now() where id = v_cart.id;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Offline / in-person payment capture (cash, POS, bank transfer)
-- ---------------------------------------------------------------------------
create or replace function public.fn_record_offline_payment(
  p_order_id    uuid,
  p_amount      numeric,
  p_provider    public.payment_provider,
  p_reference   text default null,
  p_note        text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order     public.orders%rowtype;
  v_payment   public.payments%rowtype;
  v_paid      numeric;
  v_settings  public.business_settings;
begin
  if not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Only staff can record payments' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_settings from public.business_settings where id;

  insert into public.payments (
    reference, customer_id, order_id, provider, provider_reference,
    amount, currency, status, purpose, channel, paid_at, verified_at
  )
  values (
    public.fn_next_reference('PAY'), v_order.customer_id, v_order.id, p_provider, p_reference,
    p_amount, v_order.currency, 'paid',
    case when p_amount >= v_order.total then 'order' else 'appointment_balance' end,
    p_provider::text, now(), now()
  )
  returning * into v_payment;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where order_id = v_order.id and status in ('paid', 'partially_paid');

  update public.orders
  set paid_total   = v_paid,
      refund_total = v_paid - (select coalesce(sum(refunded_amount), 0)
                               from public.payments
                               where order_id = v_order.id),
      payment_status = case
        when v_paid <= 0 then 'unpaid'
        when v_paid < v_order.total then 'partially_paid'
        when v_paid > v_order.total then 'partially_refunded'
        else 'paid'
      end,
      status = case when v_paid >= v_order.total and status = 'pending' then 'confirmed' else status end,
      confirmed_at = case when v_paid >= v_order.total and confirmed_at is null then now() else confirmed_at end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'payment.recorded', 'order', p_order_id::text,
          jsonb_build_object('provider', p_provider, 'amount', p_amount, 'reference', p_reference));

  return v_payment;
end;
$$;
