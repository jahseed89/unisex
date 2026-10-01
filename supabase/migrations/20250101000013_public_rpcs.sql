-- =============================================================================
-- 0013 · Public RPCs requiring a SECURITY DEFINER bridge
-- These back guest (unauthenticated) and cross-owner flows where RLS alone
-- cannot express the rule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Read a cart + its lines + totals. Works for guests via session token and for
-- signed-in users via their own cart.
-- ---------------------------------------------------------------------------
create or replace function public.fn_get_cart(p_session_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_cart public.carts%rowtype;
  v_tot  record;
  v_items jsonb;
begin
  if v_uid is not null then
    select * into v_cart from public.carts where user_id = v_uid;
  end if;

  if v_cart.id is null and p_session_token is not null then
    select * into v_cart from public.carts
    where session_token = p_session_token and user_id is null;
  end if;

  if v_cart.id is null then
    return jsonb_build_object(
      'cart', null, 'items', '[]'::jsonb,
      'totals', jsonb_build_object(
        'subtotal', 0, 'discount', 0, 'shipping', 0, 'tax', 0,
        'total', 0, 'item_count', 0
      )
    );
  end if;

  select coalesce(jsonb_agg(row_to_json(i) order by i.added_at), '[]'::jsonb)
  into v_items
  from (
    select
      ci.id,
      ci.variant_id,
      ci.product_id,
      ci.quantity,
      ci.unit_price,
      round(ci.unit_price * ci.quantity, 2) as line_total,
      v.sku,
      v.name  as variant_name,
      v.attributes,
      coalesce(v.image_url, p.image_url) as image_url,
      p.slug  as product_slug,
      p.name  as product_name,
      p.kind,
      greatest(v.stock_on_hand - v.stock_reserved - v.safety_stock, 0) as available_stock,
      (v.stock_on_hand - v.stock_reserved - v.safety_stock) < ci.quantity as exceeds_stock
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id
  ) i;

  select * into v_tot from public.fn_cart_totals(v_cart.id);

  return jsonb_build_object(
    'cart', jsonb_build_object(
      'id', v_cart.id, 'coupon_code', v_cart.coupon_code, 'currency', v_cart.currency
    ),
    'items', v_items,
    'totals', to_jsonb(v_tot) - 'coupon_code' - 'coupon_message'
      || jsonb_build_object('coupon_message', v_tot.coupon_message)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply or clear a coupon on the current cart
-- ---------------------------------------------------------------------------
create or replace function public.fn_apply_cart_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_cart  public.carts%rowtype;
  v_subtotal numeric;
  v_product_ids uuid[] := '{}';
  v_result record;
begin
  if v_uid is null then
    raise exception 'Please sign in to use a promo code' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cart from public.carts where user_id = v_uid;
  if v_cart.id is null then
    raise exception 'Cart not found' using errcode = 'no_data_found';
  end if;

  -- Clearing
  if p_code is null or trim(p_code) = '' then
    update public.carts set coupon_code = null, updated_at = now() where id = v_cart.id;
    return jsonb_build_object('is_valid', true, 'message', 'Coupon removed');
  end if;

  select coalesce(sum(unit_price * quantity), 0) into v_subtotal
  from public.cart_items where cart_id = v_cart.id;

  select coalesce(array_agg(ci.product_id) filter (where ci.product_id is not null), '{}')
    into v_product_ids
  from public.cart_items ci
  where ci.cart_id = v_cart.id;

  select * into v_result
  from public.fn_coupon_preview(
    upper(trim(p_code)),
    v_subtotal,
    v_product_ids
  );

  update public.carts
  set coupon_code = case when v_result.is_valid then upper(trim(p_code)) else null end,
      updated_at = now()
  where id = v_cart.id;

  return to_jsonb(v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Job application submission
-- Accepts applicants with or without an account. `p_payload` carries the
-- contact block, the answer set, and the uploaded file paths.
-- ---------------------------------------------------------------------------
create or replace function public.fn_submit_application(
  p_payload jsonb
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job         public.jobs%rowtype;
  v_application public.job_applications%rowtype;
  v_applicant   uuid := auth.uid();
  v_email       text;
  v_job_id      uuid;
begin
  v_job_id := (p_payload ->> 'job_id')::uuid;

  select * into v_job from public.jobs where id = v_job_id;
  if v_job.id is null then
    raise exception 'This vacancy no longer exists' using errcode = 'no_data_found';
  end if;

  if v_job.status <> 'open' then
    raise exception 'This vacancy is not accepting applications' using errcode = 'check_violation';
  end if;

  if v_job.closes_at is not null and current_date > v_job.closes_at then
    raise exception 'This vacancy has closed' using errcode = 'check_violation';
  end if;

  -- Basic anti-abuse: cap anonymous submissions from the same email.
  if v_applicant is null then
    if (select count(*) from public.job_applications
         where email = lower(p_payload ->> 'email')
           and submitted_at > now() - interval '24 hours') >= 3 then
      raise exception 'Too many applications from this address. Please try again later.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_email := lower(trim(coalesce(p_payload ->> 'email', '')));
  if v_email = '' then
    raise exception 'Email is required' using errcode = 'invalid_parameter_value';
  end if;

  if not coalesce((p_payload ->> 'consent_contact')::boolean, false) then
    raise exception 'You must consent to us contacting you about this application'
      using errcode = 'check_violation';
  end if;

  insert into public.job_applications (
    job_id, applicant_id, full_name, email, phone_e164, location,
    cover_letter, portfolio_url, portfolio_urls,
    cv_path, cv_file_name, cv_bytes,
    answers, experience_years, notice_period, expected_salary, available_from,
    status, consent_contact, consented_at
  )
  values (
    v_job.id,
    v_applicant,
    coalesce(nullif(p_payload ->> 'full_name', ''), 'Applicant'),
    v_email,
    nullif(trim(coalesce(p_payload ->> 'phone', '')), ''),
    nullif(p_payload ->> 'location', ''),
    nullif(p_payload ->> 'cover_letter', ''),
    nullif(p_payload ->> 'portfolio_url', ''),
    coalesce(p_payload -> 'portfolio_urls', '{}'::jsonb),
    nullif(p_payload ->> 'cv_path', ''),
    nullif(p_payload ->> 'cv_file_name', ''),
    nullif(p_payload ->> 'cv_bytes', '')::integer,
    coalesce(p_payload -> 'answers', '{}'::jsonb),
    nullif(p_payload ->> 'experience_years', '')::numeric,
    nullif(p_payload ->> 'notice_period', ''),
    nullif(p_payload ->> 'expected_salary', '')::numeric,
    nullif(p_payload ->> 'available_from', '')::date,
    'submitted',
    true, now()
  )
  -- Re-applying after a rejection replaces the rejected record rather than
  -- duplicating the candidate in the pipeline.
  on conflict (job_id, lower(email)) where status not in ('withdrawn', 'rejected')
  do update set
      full_name     = excluded.full_name,
      phone_e164    = excluded.phone_e164,
      location      = excluded.location,
      cover_letter  = excluded.cover_letter,
      portfolio_url = excluded.portfolio_url,
      portfolio_urls = excluded.portfolio_urls,
      cv_path       = excluded.cv_path,
      cv_file_name  = excluded.cv_file_name,
      cv_bytes      = excluded.cv_bytes,
      answers       = excluded.answers,
      experience_years = excluded.experience_years,
      notice_period = excluded.notice_period,
      expected_salary  = excluded.expected_salary,
      available_from    = excluded.available_from,
      applicant_id  = coalesce(excluded.applicant_id, public.job_applications.applicant_id),
      status        = 'submitted',
      submitted_at  = now(),
      stage_notes   = null,
      reviewed_at   = null,
      updated_at    = now()
  returning * into v_application;

  perform public.fn_application_submitted(v_application.id);

  return v_application;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: move an application through the pipeline
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_application_status(
  p_application_id uuid,
  p_status        public.application_status,
  p_note          text default null,
  p_rating        smallint default null,
  p_interview_at  timestamptz default null
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app     public.job_applications%rowtype;
  v_updated public.job_applications%rowtype;
begin
  if not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Only staff can review applications' using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from public.job_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if v_app.status = p_status then return v_app; end if;

  update public.job_applications
  set status        = p_status,
      stage_notes   = coalesce(p_note, stage_notes),
      rating        = coalesce(p_rating, rating),
      interview_at  = coalesce(p_interview_at, interview_at),
      reviewed_at   = case when p_status in ('rejected','shortlisted','hired') then now() else reviewed_at end,
      reviewed_by   = coalesce(reviewed_by, auth.uid()),
      updated_at    = now()
  where id = p_application_id
  returning * into v_updated;

  -- Hiring consumes an opening and auto-closes a fully filled vacancy.
  if p_status = 'hired' then
    update public.jobs
    set filled_count = filled_count + 1,
        status = case when filled_count + 1 >= openings then 'closed'::public.job_status else status end,
        updated_at = now()
    where id = v_app.job_id;
  end if;

  -- Notify the candidate where we have an account for them.
  perform public.fn_notify(
    v_app.applicant_id,
    'application.status_changed',
    format('Your application for %s is now %s',
           (select title from public.jobs where id = v_app.job_id),
           replace(p_status::text, '_', ' ')),
    coalesce(p_note, 'We will be in touch with next steps.'),
    'recruitment',
    '/careers',
    'View role',
    'normal',
    jsonb_build_object('application_id', v_app.id, 'status', p_status),
    array['in_app','email']::public.notification_channel[]
  );

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: fulfil / cancel an order
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_order_status(
  p_order_id       uuid,
  p_status         public.order_status,
  p_note           text default null,
  p_tracking       text default null,
  p_courier        text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not app_private.is_staff_or_admin(auth.uid()) then
    raise exception 'Only staff can update orders' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  -- Cancelling a paid order must go through the refund flow, not a status flip.
  if p_status = 'cancelled' and v_order.payment_status in ('paid','partially_paid')
     and v_order.paid_total > 0 then
    raise exception 'Refund this order before cancelling it' using errcode = 'check_violation';
  end if;

  -- Returning restocks the physical units.
  if p_status = 'returned' and v_order.status <> 'returned' then
    insert into public.inventory_movements (
      variant_id, product_id, delta, balance_after, reason, reference_type, reference_id, actor_id
    )
    select oi.variant_id, oi.product_id, oi.quantity,
           v.stock_on_hand + oi.quantity,
           'return', 'order', v_order.order_number::text, auth.uid()
    from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    where oi.order_id = p_order_id and oi.variant_id is not null;

    update public.product_variants v
    set stock_on_hand = v.stock_on_hand + oi.quantity, updated_at = now()
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id = v.id;

    update public.order_items
    set refunded_qty = quantity
    where order_id = p_order_id;
  end if;

  update public.orders
  set status        = p_status,
      internal_notes = coalesce(p_note, internal_notes),
      tracking_number = coalesce(p_tracking, tracking_number),
      courier        = coalesce(p_courier, courier),
      confirmed_at   = case when p_status = 'confirmed'   and confirmed_at  is null then now() else confirmed_at  end,
      fulfilled_at   = case when p_status = 'delivered'   then now() else fulfilled_at end,
      cancelled_at   = case when p_status = 'cancelled'   then now() else cancelled_at end,
      cancel_reason  = case when p_status = 'cancelled'   then coalesce(p_note, cancel_reason) else cancel_reason end,
      updated_at     = now()
  where id = p_order_id
  returning * into v_order;

  perform public.fn_notify(
    v_order.customer_id,
    'order.status_changed',
    format('Order %s — %s', v_order.order_number, replace(p_status::text, '_', ' ')),
    case
      when p_status = 'ready_for_pickup' then 'Your order is ready. Please bring your order reference and ID.'
      when p_status = 'out_for_delivery' then coalesce('Your order is on the way. Tracking: ' || p_tracking, 'Your order is on the way.')
      when p_status = 'delivered'        then 'Delivered. We hope you love it.'
      when p_status = 'cancelled'        then coalesce('Your order was cancelled. ' || p_note, 'Your order was cancelled.')
      else null
    end,
    'commerce',
    format('/account/orders/%s', v_order.id),
    'View order',
    'high',
    jsonb_build_object('order_id', v_order.id, 'status', p_status),
    array['in_app','email','whatsapp']::public.notification_channel[]
  );

  return v_order;
end;
$$;

grant execute on function
  public.fn_get_cart(text),
  public.fn_apply_cart_coupon(text)
  to anon, authenticated;

grant execute on function
  public.fn_submit_application(jsonb),
  public.fn_set_application_status(uuid, public.application_status, text, smallint, timestamptz),
  public.fn_set_order_status(uuid, public.order_status, text, text, text)
  to authenticated;

revoke execute on function public.fn_application_submitted(uuid) from public, anon, authenticated;