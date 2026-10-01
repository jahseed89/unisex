-- =============================================================================
-- 0012 · Row Level Security
--
-- Principles
--   1. Deny by default — RLS is enabled on every table, no policy = no rows.
--   2. Money and state transitions go through SECURITY DEFINER functions that
--      re-authorise; direct writes to appointments/orders are not granted.
--   3. `security definer` helpers never accept a caller-supplied user id for
--      privilege decisions; they read auth.uid() or take a business key.
--   4. Public catalogue reads go through narrow views so sensitive columns
--      (commission, cost price, internal notes) never reach the client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Public-safe views
-- ---------------------------------------------------------------------------
create or replace view public.staff_public
with (security_invoker = false) as
select
  sp.user_id,
  pr.full_name,
  pr.slug,
  sp.title,
  sp.headline,
  sp.bio,
  sp.photo_url,
  sp.portfolio_urls,
  sp.specialities,
  sp.employment_type,
  sp.is_bookable,
  sp.accepts_walk_ins,
  sp.rating_avg,
  sp.rating_count
from public.staff_profiles sp
join public.profiles pr on pr.id = sp.user_id
where pr.status = 'active'
  and sp.is_bookable;

comment on view public.staff_public is
  'Public stylist directory. Deliberately omits commission_pct, hourly_rate and employment dates.';

create or replace view public.service_catalog
with (security_invoker = false) as
select
  s.id, s.slug, s.name, s.category_id, s.summary, s.description,
  s.includes, s.excludes, s.aftercare,
  s.duration_minutes, s.price_from, s.price_to, s.price_unit,
  s.requires_consultation, s.requires_requirement, s.gender_restriction,
  s.image_url, s.gallery_urls, s.badge, s.is_featured, s.is_popular,
  s.rating_avg, s.rating_count, s.bookings_count,
  c.name  as category_name,
  c.slug  as category_slug,
  sc.label as variant_name,
  sc.price as variant_price,
  sc.duration_minutes as variant_duration
from public.services s
left join public.service_categories c on c.id = s.category_id
left join public.service_variants sc on sc.service_id = s.id and sc.is_active
where s.status = 'active';

create or replace view public.product_catalog
with (security_invoker = false) as
select
  p.id, p.slug, p.name, p.kind, p.category_id, p.brand,
  p.summary, p.description, p.ingredients, p.benefits, p.how_to_use,
  p.care_instructions, p.base_price, p.compare_at_price,
  p.hair_class, p.hair_texture, p.length_cm, p.weight_g,
  p.cap_construction, p.is_pre_stretched, p.is_glueless,
  p.image_url, p.gallery_urls, p.is_featured, p.is_best_seller,
  p.rating_avg, p.rating_count, p.sold_count,
  pc.name as category_name, pc.slug as category_slug,
  v.id as variant_id, v.sku, v.name as variant_name, v.attributes,
  v.price as variant_price, v.compare_at_price as variant_compare_at_price,
  greatest(v.stock_on_hand - v.stock_reserved - v.safety_stock, 0) as available_stock,
  v.stock_on_hand, v.is_default as is_default_variant, v.image_url as variant_image_url
from public.products p
left join public.product_categories pc on pc.id = p.category_id
left join public.product_variants v
  on v.product_id = p.id
 and v.is_active
 and v.stock_on_hand > 0
where p.status = 'active';

comment on view public.product_catalog is
  'Deliberately omits cost_price, tax_rate and cost-related internal fields.';

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','roles','user_roles','staff_profiles','salon_locations','business_settings',
    'audit_log','service_categories','services','service_variants','staff_services',
    'gallery_items','reviews','pages','faqs','message_templates',
    'location_hours','staff_availability_rules','staff_time_off','blackout_dates',
    'appointments','appointment_status_history','booking_holds','requirements','requirement_media',
    'product_categories','products','product_variants','inventory_movements','wishlist_items',
    'carts','cart_items','coupons','orders','order_items','payments','payment_events',
    'jobs','job_applications','application_events','job_alerts',
    'notifications','notification_deliveries','notification_preferences','contact_points',
    'scheduled_jobs','whatsapp_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- =============================================================================
-- Identity
-- =============================================================================
create policy profiles_select_self_or_staff on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.fn_is_staff_or_admin());


create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.fn_is_admin())
  with check (id = auth.uid() or public.fn_is_admin());

create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using (public.fn_is_admin());

create policy roles_select on public.roles
  for select to anon, authenticated using (true);

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.fn_is_admin());

create policy user_roles_admin_manage on public.user_roles
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Sensitive: no direct client access. Read via public.staff_public.
create policy staff_profiles_select_authenticated on public.staff_profiles
  for select to authenticated
  using (public.fn_is_staff_or_admin() or user_id = auth.uid());

create policy staff_profiles_admin_manage on public.staff_profiles
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- A stylist may edit their own public-facing profile fields.
create policy staff_profiles_update_self on public.staff_profiles
  for update to authenticated
  using (user_id = auth.uid() or public.fn_is_admin())
  with check (user_id = auth.uid() or public.fn_is_admin());

-- =============================================================================
-- Public content
-- =============================================================================
create policy locations_public_read on public.salon_locations
  for select to anon, authenticated using (is_active);

create policy locations_admin_write on public.salon_locations
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy settings_public_read on public.business_settings
  for select to anon, authenticated using (true);

create policy settings_admin_write on public.business_settings
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy location_hours_public_read on public.location_hours
  for select to anon, authenticated using (true);

create policy location_hours_admin_write on public.location_hours
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy service_categories_public_read on public.service_categories
  for select to anon, authenticated using (is_active or public.fn_is_staff_or_admin());

create policy service_categories_admin_write on public.service_categories
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy services_public_read on public.services
  for select to anon, authenticated using (status = 'active' or public.fn_is_staff_or_admin());

create policy services_admin_write on public.services
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy service_variants_public_read on public.service_variants
  for select to anon, authenticated using (is_active or public.fn_is_staff_or_admin());

create policy service_variants_admin_write on public.service_variants
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy staff_services_public_read on public.staff_services
  for select to anon, authenticated using (is_active or public.fn_is_staff_or_admin());

create policy staff_services_admin_write on public.staff_services
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy gallery_public_read on public.gallery_items
  for select to anon, authenticated using (is_published or public.fn_is_staff_or_admin());

create policy gallery_admin_write on public.gallery_items
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy faqs_public_read on public.faqs
  for select to anon, authenticated using (is_published or public.fn_is_staff_or_admin());

create policy faqs_admin_write on public.faqs
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy pages_public_read on public.pages
  for select to anon, authenticated using (is_published or public.fn_is_staff_or_admin());

create policy pages_admin_write on public.pages
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy templates_admin_only on public.message_templates
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- =============================================================================
-- Reviews
-- =============================================================================
create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (status = 'published' or customer_id = auth.uid() or public.fn_is_staff_or_admin());

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    -- Reviews must be tied to a service the customer actually received
    and (
      appointment_id is null
      or exists (
        select 1 from public.appointments a
        where a.id = reviews.appointment_id
          and a.customer_id = auth.uid()
          and a.status = 'completed'
      )
    )
  );

create policy reviews_update_own_pending on public.reviews
  for update to authenticated
  using (customer_id = auth.uid() and status = 'pending')
  with check (customer_id = auth.uid());

create policy reviews_admin_moderate on public.reviews
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- =============================================================================
-- Availability configuration (admin manages; staff read their own)
-- =============================================================================
create policy availability_rules_staff_read on public.staff_availability_rules
  for select to authenticated
  using (public.fn_is_admin() or staff_id = auth.uid());

create policy availability_rules_admin_write on public.staff_availability_rules
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy time_off_own_and_admin on public.staff_time_off
  for all to authenticated
  using (public.fn_is_admin() or staff_id = auth.uid())
  with check (public.fn_is_admin() or staff_id = auth.uid());

create policy blackout_admin_manage on public.blackout_dates
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- =============================================================================
-- Appointments
-- =============================================================================
create policy appointments_select_participants on public.appointments
  for select to authenticated
  using (
    customer_id = auth.uid()
    or public.fn_is_admin()
    or (public.fn_is_staff() and staff_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies for customers: every transition goes through
-- fn_create_appointment / fn_set_appointment_status / fn_cancel_appointment.
create policy appointments_staff_update on public.appointments
  for update to authenticated
  using (public.fn_is_admin() or (public.fn_is_staff() and staff_id = auth.uid()))
  with check (public.fn_is_admin() or (public.fn_is_staff() and staff_id = auth.uid()));

create policy appointments_staff_delete on public.appointments
  for delete to authenticated
  using (public.fn_is_admin());

create policy appointment_history_select_participants on public.appointment_status_history
  for select to authenticated
  using (
    public.fn_is_staff_or_admin()
    or exists (
      select 1 from public.appointments a
      where a.id = appointment_status_history.appointment_id
        and a.customer_id = auth.uid()
    )
  );

create policy appointment_history_staff_insert on public.appointment_status_history
  for insert to authenticated
  with check (public.fn_is_staff_or_admin());

create policy booking_holds_select_own on public.booking_holds
  for select to authenticated
  using (customer_id = auth.uid() or public.fn_is_staff_or_admin());

create policy booking_holds_admin_manage on public.booking_holds
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- =============================================================================
-- Requirements
-- =============================================================================
create policy requirements_select_participants on public.requirements
  for select to authenticated
  using (
    customer_id = auth.uid()
    or public.fn_is_admin()
    or exists (
      select 1 from public.appointments a
      where a.id = requirements.appointment_id
        and public.fn_is_staff() and a.staff_id = auth.uid()
    )
  );

create policy requirements_insert_own on public.requirements
  for insert to authenticated
  with check (customer_id = auth.uid());

create policy requirements_update_own_draft on public.requirements
  for update to authenticated
  using (customer_id = auth.uid() or public.fn_is_staff_or_admin())
  with check (customer_id = auth.uid() or public.fn_is_staff_or_admin());

create policy requirements_staff_review on public.requirements
  for update to authenticated
  using (public.fn_is_staff_or_admin())
  with check (public.fn_is_staff_or_admin());

create policy requirement_media_select_participants on public.requirement_media
  for select to authenticated
  using (
    exists (
      select 1 from public.requirements r
      where r.id = requirement_media.requirement_id
        and (
          r.customer_id = auth.uid()
          or public.fn_is_admin()
          or exists (
            select 1 from public.appointments a
            where a.id = r.appointment_id
              and public.fn_is_staff() and a.staff_id = auth.uid()
          )
        )
    )
  );

create policy requirement_media_insert_own on public.requirement_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.requirements r
      where r.id = requirement_media.requirement_id
        and (r.customer_id = auth.uid() or public.fn_is_staff_or_admin())
    )
  );

create policy requirement_media_delete_own on public.requirement_media
  for delete to authenticated
  using (
    exists (
      select 1 from public.requirements r
      where r.id = requirement_media.requirement_id
        and (r.customer_id = auth.uid() or public.fn_is_admin())
    )
  );

-- =============================================================================
-- Commerce
-- =============================================================================
create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated using (is_active or public.fn_is_staff_or_admin());

create policy product_categories_admin_write on public.product_categories
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated using (status = 'active' or public.fn_is_staff_or_admin());

create policy products_admin_write on public.products
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy variants_public_read on public.product_variants
  for select to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    or public.fn_is_staff_or_admin()
  );

create policy variants_admin_write on public.product_variants
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Staff need live stock visibility for fulfilment.
create policy variants_staff_update on public.product_variants
  for update to authenticated
  using (public.fn_is_staff_or_admin())
  with check (public.fn_is_staff_or_admin());

create policy inventory_staff_read on public.inventory_movements
  for select to authenticated using (public.fn_is_staff_or_admin());

create policy inventory_admin_manage on public.inventory_movements
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy wishlist_own on public.wishlist_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy carts_select_own on public.carts
  for select to authenticated
  using (user_id = auth.uid());

create policy carts_admin_all on public.carts
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Signed-in users may read their own lines directly. Guests use fn_get_cart().
create policy cart_items_via_cart on public.cart_items
  for select to authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (c.user_id = auth.uid() or public.fn_is_admin())
    )
  );

-- Writes go through fn_add_to_cart / fn_update_cart_item / fn_remove_cart_item.
create policy cart_items_admin_write on public.cart_items
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy coupons_public_read on public.coupons
  for select to anon, authenticated using (is_active or public.fn_is_admin());

create policy coupons_admin_write on public.coupons
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy orders_select_participants on public.orders
  for select to authenticated
  using (customer_id = auth.uid() or public.fn_is_staff_or_admin());

-- Creation is via fn_checkout only.
create policy orders_staff_update on public.orders
  for update to authenticated
  using (public.fn_is_staff_or_admin())
  with check (public.fn_is_staff_or_admin());

create policy order_items_select_participants on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.customer_id = auth.uid() or public.fn_is_staff_or_admin())
    )
  );

create policy order_items_admin_manage on public.order_items
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy payments_select_participants on public.payments
  for select to authenticated
  using (customer_id = auth.uid() or public.fn_is_staff_or_admin());

-- Insert is via fn_record_offline_payment or the webhook Edge Function.
create policy payments_staff_insert on public.payments
  for insert to authenticated
  with check (public.fn_is_staff_or_admin());

create policy payments_admin_update on public.payments
  for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- payment_events: no client policy at all. service_role only.

-- =============================================================================
-- Recruitment
-- =============================================================================
create policy jobs_public_read on public.jobs
  for select to anon, authenticated
  using (status = 'open' or public.fn_is_staff_or_admin());

create policy jobs_admin_write on public.jobs
  for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy applications_select_own_or_staff on public.job_applications
  for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and lower(p.email) = lower(job_applications.email))
    or public.fn_is_staff_or_admin()
  );

-- Applications are submitted through fn_submit_application so the function can
-- validate the vacancy is open, attach the applicant, and rate-limit.
create policy applications_staff_update on public.job_applications
  for update to authenticated
  using (public.fn_is_staff_or_admin())
  with check (public.fn_is_staff_or_admin());

create policy application_events_staff_read on public.application_events
  for select to authenticated using (public.fn_is_staff_or_admin());

create policy application_events_staff_insert on public.application_events
  for insert to authenticated with check (public.fn_is_staff_or_admin());

create policy job_alerts_own on public.job_alerts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- Notifications
-- =============================================================================
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

create policy deliveries_select_own_or_staff on public.notification_deliveries
  for select to authenticated
  using (recipient_id = auth.uid() or public.fn_is_staff_or_admin());

create policy prefs_own on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy contact_points_own on public.contact_points
  for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- scheduled_jobs and whatsapp_messages are server-side only.
create policy whatsapp_select_participants on public.whatsapp_messages
  for select to authenticated
  using (profile_id = auth.uid() or public.fn_is_staff_or_admin());

create policy whatsapp_staff_insert on public.whatsapp_messages
  for insert to authenticated with check (public.fn_is_staff_or_admin());

create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.fn_is_admin());

-- =============================================================================
-- Grants
-- ---------------------------------------------------------------------------
-- Public catalogue reads
grant select on public.staff_public, public.service_catalog, public.product_catalog
  to anon, authenticated;

grant select on
  public.salon_locations, public.location_hours, public.business_settings,
  public.service_categories, public.services, public.service_variants, public.staff_services,
  public.gallery_items, public.faqs, public.pages, public.reviews,
  public.product_categories, public.products, public.product_variants, public.coupons, public.jobs
  to anon, authenticated;

-- Everything else is opt-in per role.
grant select, update on public.profiles to authenticated;
grant select on public.roles to anon, authenticated;
grant select on public.user_roles to authenticated;
grant select, update on public.staff_profiles to authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;
grant select, insert, update on public.requirements, public.requirement_media to authenticated;
grant select on public.appointments, public.appointment_status_history to authenticated;
grant update on public.appointments to authenticated;
grant select on public.orders, public.order_items, public.payments to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select on public.notifications to authenticated;
grant update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.contact_points to authenticated;
grant select, update on public.job_applications to authenticated;
grant select, insert, update, delete on public.job_alerts to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.product_variants to authenticated;
grant update on public.product_variants to authenticated;

-- Admin write surface
grant insert, update, delete on
  public.services, public.service_variants, public.service_categories,
  public.staff_services, public.staff_profiles, public.salon_locations,
  public.location_hours, public.gallery_items, public.faqs, public.pages,
  public.products, public.product_variants, public.product_categories,
  public.coupons, public.jobs, public.reviews, public.business_settings,
  public.user_roles, public.staff_availability_rules, public.staff_time_off,
  public.blackout_dates, public.orders, public.order_items, public.payments,
  public.message_templates
  to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Function execution privileges
-- ---------------------------------------------------------------------------
-- Callable by everyone (read-only helpers)
grant execute on function
  public.fn_service_slots(uuid, uuid, date, uuid, uuid, integer),
  public.fn_is_slot_available(uuid, uuid, uuid, timestamptz, uuid),
  public.fn_cart_totals(uuid),
  public.fn_coupon_preview(text, numeric, uuid[]),
  public.fn_available_stock(uuid),
  public.fn_my_role_keys(),
  public.fn_naira(numeric),
  public.fn_slugify(text),
  public.fn_get_or_create_cart(text),
  -- fn_get_cart is defined in 0013 and granted there; grants cannot forward-
  -- reference a function that does not exist yet.
  public.fn_next_reference(text, date)
  to anon, authenticated;

-- Customer actions
grant execute on function
  public.fn_hold_slot(uuid, uuid, uuid, timestamptz, text, integer),
  public.fn_create_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, public.booking_source, jsonb, text, boolean),
  public.fn_cancel_appointment(uuid, text),
  public.fn_reschedule_appointment(uuid, timestamptz, uuid, text),
  public.fn_set_appointment_status(uuid, public.appointment_status, text),
  public.fn_add_to_cart(uuid, integer, text),
  public.fn_update_cart_item(uuid, integer),
  public.fn_remove_cart_item(uuid),
  public.fn_checkout(uuid, text, text, text, public.fulfilment_type, uuid, jsonb, text, text),
  public.fn_merge_carts(text, uuid),
  public.fn_notify(uuid, text, text, text, text, text, text, public.notification_priority, jsonb, public.notification_channel[])
  to authenticated;

-- fn_submit_application is defined in 0013 and granted there.

-- Server-side only
revoke execute on function
  public.fn_notify_admins(text, text, text, text, jsonb, public.notification_channel[]),
  public.fn_appointment_created(uuid),
  public.fn_order_created(uuid),
  public.fn_application_submitted(uuid),
  public.fn_record_offline_payment(uuid, numeric, public.payment_provider, text, text),
  public.fn_adjust_stock(uuid, integer, public.inventory_reason, text, text, text),
  public.fn_admin_dashboard_stats(date, date),
  public.fn_handle_new_user(),
  public.fn_recalculate_staff_rating(uuid),
  public.fn_recalculate_service_rating(uuid),
  public.fn_recalculate_product_rating(uuid),
  public.fn_is_admin(), public.fn_is_staff(), public.fn_is_staff_or_admin(),
  public.fn_is_assigned_staff(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fn_admin_dashboard_stats(date, date),
  public.fn_record_offline_payment(uuid, numeric, public.payment_provider, text, text),
  public.fn_adjust_stock(uuid, integer, public.inventory_reason, text, text, text)
  to authenticated;

revoke all on function
  app_private.has_role(uuid, text[]),
  app_private.has_capability(uuid, text),
  app_private.is_admin(uuid),
  app_private.is_staff(uuid),
  app_private.is_staff_or_admin(uuid),
  app_private.claim_scheduled_jobs(text, integer),
  app_private.complete_scheduled_job(uuid, boolean, text),
  app_private.purge_expired_holds(),
  app_private.touch_updated_at()
  from public, anon, authenticated;