# 04 · API specification

There is no REST API written by hand. The API surface is:

1. **PostgREST** over 48 tables, three views and 44 `public.fn_*` RPCs (`/rest/v1/*`).
2. **GoTrue** for identity (`/auth/v1/*`).
3. **Storage** for objects (`/storage/v1/object/*`).
4. **Edge Functions** (`/functions/v1/*`) — three are specified below and **none are implemented**.

Everything the browser can reach is in one of two places: a `grant` in migration 0012, and a policy or
function-level check. Both must open. This document lists them exactly as migration 0012 and the
earlier migrations define them.

Error convention: functions raise with explicit SQLSTATE codes so the client can branch. The codes in
use are `insufficient_privilege` (42501), `check_violation` (23514, or a bare `raise exception`
surfacing as P0001), `no_data_found` (P0002) and `invalid_parameter_value` (22023).
`src/lib/supabase/errors.ts` classifies them (`isAuthError`, `isExpected`) and
`src/lib/query/client.ts` declines to retry `42501`, `PGRST301` and `23505`.

---

## RPC catalogue

### Session and identity (migration 0008)

| Function | Signature | Returns | Callers | Errors |
| --- | --- | --- | --- | --- |
| `fn_is_admin` | `() → boolean` | bool | **Nobody.** Revoked from `public, anon, authenticated`; used inside policies only. | — |
| `fn_is_staff` | `() → boolean` | bool | Nobody. `has_role(uid, ['staff','admin'])`. | — |
| `fn_is_staff_or_admin` | `() → boolean` | bool | Nobody. Identical membership to `fn_is_staff`. | — |
| `fn_my_role_keys` | `() → text[]` | `text[]`, `'{}'` when none | anon + authenticated | — |
| `fn_is_assigned_staff` | `(p_staff_id uuid) → boolean` | bool | Nobody. Revoked; also unreferenced by any policy. | — |
| `fn_next_reference` | `(p_prefix text, p_date date default current_date) → text` | `PREFIX-YYYYMMDD-XXXXX` (Crockford base32 from `gen_random_uuid()`) | anon + authenticated | — |
| `fn_handle_new_user` | `() → trigger` | — | Trigger only; revoked | — |
| `fn_slugify` | `(p_text text) → text` | slug | anon + authenticated | — |
| `fn_naira` | `(p_amount numeric) → text` | `'₦' || to_char(…, 'FM999,999,990.00')` | anon + authenticated | — |
| `fn_recalculate_staff_rating` | `(p_staff_id uuid) → void` | — | Trigger/recalculation only; revoked | — |
| `fn_recalculate_service_rating` | `(p_service_id uuid) → void` | — | as above | — |
| `fn_recalculate_product_rating` | `(p_product_id uuid) → void` | — | as above | — |

```ts
// Client wrappers — src/lib/api/account.ts
export async function getProfile(userId: string): Promise<Profile | null> {
  return selectOne<Profile>('profiles', { filters: { id: userId }, range: { from: 0, to: 1 } })
}
```
Role keys are fetched once per session in `AuthProvider.hydrate`:
```ts
supabase.rpc('fn_my_role_keys')   // → RoleKey[]
```

### Availability and booking (migration 0009)

#### `fn_service_slots` — advisory calendar query

```
fn_service_slots(
  p_location_id        uuid,
  p_service_id         uuid,
  p_date               date,
  p_staff_id           uuid        default null,
  p_service_variant_id uuid        default null,
  p_slot_interval_mins integer     default 15
) returns table (
  starts_at       timestamptz,
  ends_at         timestamptz,
  staff_id        uuid,
  staff_name      text,
  staff_title     text,
  staff_photo_url text,
  price           numeric,
  staff_count     bigint      -- count(*) over (partition by starts_at)
)
```
`stable`, `security definer`, granted to `anon, authenticated`. One row per `(start_time, stylist)`.
`STABLE` means it reads a snapshot and is safe to call from a cache. Callers group by `starts_at`;
`src/lib/api/booking.ts:groupSlotsByTime` does exactly that and exposes `staffIds` so a customer can
pick a named stylist or take the first available. No rows rather than an error when a service is
unknown — the `cfg` CTE joins on `s.status = 'active'` and simply produces no row.

```ts
// src/lib/api/booking.ts
export async function getSlots(query: SlotQuery): Promise<Slot[]> {
  const rows = await rpc<Slot[]>('fn_service_slots', {
    p_location_id: query.locationId,
    p_service_id: query.serviceId,
    p_date: query.date,
    p_staff_id: query.staffId ?? null,
    p_service_variant_id: query.serviceVariantId ?? null,
    p_slot_interval_mins: 15,
  })
  return rows ?? []
}
```

#### `fn_is_slot_available` — cheap revalidation probe

```
fn_is_slot_available(p_staff_id uuid, p_location_id uuid, p_service_id uuid,
                     p_starts_at timestamptz, p_service_variant_id uuid default null)
  → boolean
```
`stable`, granted to `anon, authenticated`. Delegates to `fn_service_slots` with a 5-minute interval
and the date derived from `p_starts_at` in the location's timezone. No errors — it answers a question.

#### `fn_hold_slot` — transient reservation

```
fn_hold_slot(p_staff_id uuid, p_service_id uuid, p_location_id uuid,
             p_starts_at timestamptz, p_session_token text,
             p_ttl_minutes integer default 20) → uuid
```
`plpgsql`, `security definer`, granted to `authenticated`. TTL is clamped to
`least(greatest(coalesce(p_ttl_minutes,20), 5), 120)`.

| Error | Message | Cause |
| --- | --- | --- |
| `P0002` | `Service % is not bookable` | Service missing or not `active`. |
| `23514` | `That time is no longer available` | `fn_is_slot_available` returned false. |

```ts
// src/lib/api/booking.ts
export async function holdSlot(input: {...}): Promise<string> {
  return rpc<string>('fn_hold_slot', {
    p_staff_id: input.staffId,
    p_service_id: input.serviceId,
    p_location_id: input.locationId,
    p_starts_at: input.startsAt,
    p_session_token: input.sessionToken,
    p_ttl_minutes: input.ttlMinutes ?? 20,
  })
}
```

#### `fn_create_appointment` — the only write path for a booking

```
fn_create_appointment(
  p_service_id         uuid,
  p_location_id        uuid,
  p_staff_id           uuid,
  p_starts_at          timestamptz,
  p_service_variant_id uuid                     default null,
  p_customer_id        uuid                     default null,
  p_customer_notes     text                     default null,
  p_source             public.booking_source    default 'web',
  p_requirement        jsonb                    default null,
  p_hold_token         text                     default null,
  p_force              boolean                  default false
) returns public.appointments
```
`plpgsql`, `security definer`, granted to `authenticated`. Used identically for the web, phone,
WhatsApp, walk-in and admin paths — only `p_source` differs. `p_customer_id` defaults to
`auth.uid()`. The return value is a composite row, so PostgREST yields an array; the client takes
`rows[0]`.

| Error | SQLSTATE | Message / condition |
| --- | --- | --- |
| `insufficient_privilege` | 42501 | `Authentication required to book` (no `auth.uid()`); `Not permitted to override availability` (`p_force` without staff). |
| `no_data_found` | P0002 | `Account not found or suspended`; `Service not available`. |
| `check_violation` | P0001 / 23514 | `That time is no longer available. Please choose another slot.`; `Bookings require at least % hours notice`; `Bookings open % days in advance`; `Please complete the requirements form before booking`; `This service is not available for your selected profile option`; `That slot was just taken. Please pick another time.` |

The last one is raised when `on conflict (staff_id, tstzrange(starts_at, ends_at)) … do nothing`
returns no row — the exclusion constraint losing a race.

```ts
// src/lib/api/booking.ts
const row = await rpcOne<AppointmentDetail & { id: string }>('fn_create_appointment', {
  p_service_id: input.serviceId,
  p_location_id: input.locationId,
  p_staff_id: input.staffId,
  p_starts_at: input.startsAt,
  p_service_variant_id: input.serviceVariantId ?? null,
  p_customer_id: input.customerId ?? null,
  p_customer_notes: input.customerNotes ?? null,
  p_source: 'web',
  p_requirement: input.requirement ?? null,
  p_hold_token: input.holdToken ?? null,
  p_force: false,
})
if (!row?.id) throw new ApiError('We could not create that booking. Please try another time.')
return row
```

#### `fn_set_appointment_status`, `fn_cancel_appointment`, `fn_reschedule_appointment`

```
fn_set_appointment_status(p_appointment_id uuid, p_status public.appointment_status,
                          p_note text default null) → public.appointments
fn_cancel_appointment(p_appointment_id uuid, p_reason text default null) → public.appointments
fn_reschedule_appointment(p_appointment_id uuid, p_new_starts_at timestamptz,
                          p_new_staff_id uuid default null, p_note text default null)
  → public.appointments
```
All three are `plpgsql security definer`, granted to `authenticated`, and all three take
`SELECT … FOR UPDATE` on the appointment before deciding anything.

| Function | Authorisation | Transition rule | Errors |
| --- | --- | --- | --- |
| `fn_set_appointment_status` | admin, or staff assigned to the appointment, or the customer **but only for `cancelled`** | see the graph in [07](./07-availability-and-booking-engine.md#legal-status-transitions) | `no_data_found` `Appointment not found`; `insufficient_privilege` `Not permitted to change this appointment`; `check_violation` `Cannot move appointment from % to %` |
| `fn_cancel_appointment` | admin, the customer, or the assigned stylist | rejects `completed`, `cancelled`, `no_show` | `no_data_found`; `insufficient_privilege` `Not permitted to cancel this appointment`; `check_violation` `This appointment can no longer be cancelled` |
| `fn_reschedule_appointment` | admin, the customer, or the assigned stylist | requires `pending` or `confirmed`; the inner `fn_set_appointment_status(…,'rescheduled')` requires the current status to be `confirmed` | `no_data_found`; `insufficient_privilege`; `check_violation` `Only pending or confirmed appointments can be rescheduled`, or `Cannot move appointment from pending to rescheduled` |

The second `check_violation` is reachable: a booking created through the web flow is `pending`, and
the transition graph does not allow `pending → rescheduled`. The customer-facing workaround today is
for staff to confirm the booking first.

```ts
// src/lib/api/booking.ts
export const cancelAppointment = (id: string, reason?: string): Promise<Appointment> =>
  rpc<Appointment>('fn_cancel_appointment', {
    p_appointment_id: id, p_reason: reason ?? null,
  })

export const rescheduleAppointment = (input: {...}): Promise<Appointment> =>
  rpc<Appointment>('fn_reschedule_appointment', {
    p_appointment_id: input.appointmentId,
    p_new_starts_at: input.newStartsAt,
    p_new_staff_id: input.newStaffId ?? null,
    p_note: input.note ?? null,
  })

export const setAppointmentStatus = (id: string, status: AppointmentStatus, note?: string) =>
  rpc<Appointment>('fn_set_appointment_status', {
    p_appointment_id: id, p_status: status, p_note: note ?? null,
  })
```

### Commerce (migrations 0010 and 0013)

| Function | Signature | Returns | Callers | Errors |
| --- | --- | --- | --- | --- |
| `fn_available_stock` | `(p_variant_id uuid) → integer` | `greatest(on_hand − reserved − safety, 0)` | anon + auth | — |
| `fn_adjust_stock` | `(p_variant_id uuid, p_delta integer, p_reason inventory_reason, p_note text default null, p_reference_type text default null, p_reference_id text default null) → product_variants` | the updated variant | auth (staff or admin only) | `insufficient_privilege` `Only staff can adjust inventory`; `no_data_found` `Variant not found`; `check_violation` `Cannot reduce % below zero (currently %)` |
| `fn_get_or_create_cart` | `(p_session_token text default null) → carts` | the cart row; merges a guest cart when signed in | anon + auth | `invalid_parameter_value` `A session token is required for guest carts` |
| `fn_merge_carts` | `(p_session_token text, p_user_id uuid) → void` | — | auth | — (no-op when there is no guest cart) |
| `fn_add_to_cart` | `(p_variant_id uuid, p_quantity integer default 1, p_session_token text default null) → cart_items` | the line | auth | `invalid_parameter_value` `Quantity must be positive`; `no_data_found` `Product is no longer available`; `check_violation` `Out of stock` / `Only % left in stock` |
| `fn_update_cart_item` | `(p_cart_item_id uuid, p_quantity integer) → cart_items` | the line, or `null` when the quantity is `<= 0` (the line is deleted) | auth (owner or staff/admin) | `no_data_found`; `insufficient_privilege` `Not permitted`; `check_violation` `Only % available` |
| `fn_remove_cart_item` | `(p_cart_item_id uuid) → void` | — | auth (owner or staff/admin) | — (silent no-op) |
| `fn_coupon_preview` | `(p_code text, p_subtotal numeric, p_product_ids uuid[] default '{}') → table(is_valid boolean, message text, discount_amount numeric, coupon_code text)` | validation verdict plus a human message | anon + auth | — (never raises) |
| `fn_cart_totals` | `(p_cart_id uuid) → table(subtotal, discount, shipping, tax, total, item_count, free_shipping_threshold, coupon_code, coupon_message)` | the authoritative money | anon + auth | — |
| `fn_get_cart` | `(p_session_token text default null) → jsonb` | `{ cart, items[], totals }`; a zeroed payload when there is no cart | anon + auth | — |
| `fn_apply_cart_coupon` | `(p_code text) → jsonb` | `fn_coupon_preview` shape, or `{is_valid:true,message:'Coupon removed'}` for an empty code | anon + auth (requires `auth.uid()`) | `insufficient_privilege` `Please sign in to use a promo code`; `no_data_found` `Cart not found` |
| `fn_checkout` | `(p_cart_id uuid, p_contact_name text, p_contact_email text, p_contact_phone text, p_fulfilment_type fulfilment_type default 'pickup', p_location_id uuid default null, p_delivery_address jsonb default null, p_notes text default null, p_coupon_code text default null) → orders` | the order | auth | see below |
| `fn_record_offline_payment` | `(p_order_id uuid, p_amount numeric, p_provider payment_provider, p_reference text default null, p_note text default null) → payments` | the payment | auth (staff or admin) | `insufficient_privilege` `Only staff can record payments`; `no_data_found` `Order not found`; `invalid_parameter_value` `Payment amount must be positive` |
| `fn_set_order_status` | `(p_order_id uuid, p_status order_status, p_note text default null, p_tracking text default null, p_courier text default null) → orders` | the order | auth (staff or admin) | `insufficient_privilege` `Only staff can update orders`; `no_data_found` `Order not found`; `check_violation` `Refund this order before cancelling it` |

`fn_checkout` errors:

| Error | Message / condition |
| --- | --- |
| `insufficient_privilege` | `Please sign in to complete your order`; `Not permitted` (cart belongs to someone else and the caller is not an admin) |
| `no_data_found` | `Cart not found` |
| `check_violation` | `Your cart is empty`; `Delivery is currently unavailable. Please choose pickup.`; `A delivery address is required`; `An item in your cart is no longer available`; `Only % of "%" left — please adjust your cart` |
| `23514` | A zero-total order tries to write a `payments` row with `amount = 0`, which the `amount > 0` column check rejects. See [08 · Known issues](./08-commerce-and-payments.md#known-issues). |

```ts
// src/lib/api/commerce.ts
export const getCart = (sessionToken?: string | null) =>
  rpc<CartPayload>('fn_get_cart', { p_session_token: sessionToken ?? null })

export const addToCart = async (variantId: string, quantity = 1, sessionToken?: string | null) => {
  await rpc('fn_add_to_cart', {
    p_variant_id: variantId, p_quantity: quantity, p_session_token: sessionToken ?? null,
  })
  return getCart(sessionToken)
}

export const applyCoupon = (code: string) => rpc<CouponPreview>('fn_apply_cart_coupon', { p_code: code })

export const checkout = (input: CheckoutInput) => rpc<Order>('fn_checkout', {
  p_cart_id: input.cartId,
  p_contact_name: input.contactName,
  p_contact_email: input.contactEmail,
  p_contact_phone: input.contactPhone,
  p_fulfilment_type: input.fulfilmentType,
  p_location_id: input.locationId ?? null,
  p_delivery_address: input.deliveryAddress ?? null,
  p_notes: input.notes ?? null,
  p_coupon_code: input.couponCode ?? null,
})

// src/lib/api/admin.ts
export const setOrderStatus = (input: {...}) => rpc<Order>('fn_set_order_status', {
  p_order_id: input.orderId, p_status: input.status,
  p_note: input.note ?? null, p_tracking: input.tracking ?? null, p_courier: input.courier ?? null,
})

export const recordOfflinePayment = (input: {...}) => rpc<{ id: string }>('fn_record_offline_payment', {
  p_order_id: input.orderId, p_amount: input.amount, p_provider: input.provider,
  p_reference: input.reference ?? null, p_note: input.note ?? null,
})

export const adjustStock = (input: {...}) => rpc<ProductVariant>('fn_adjust_stock', {
  p_variant_id: input.variantId, p_delta: input.delta, p_reason: input.reason,
  p_note: input.note ?? null, p_reference_type: null, p_reference_id: null,
})
```

### Recruitment (migrations 0013 and 0016)

```
fn_submit_application(p_payload jsonb) → public.job_applications
```
`p_payload` keys consumed by the function: `job_id` (required, uuid), `email` (required),
`consent_contact` (required true), `full_name`, `phone`, `location`, `cover_letter`,
`portfolio_url`, `portfolio_urls`, `cv_path`, `cv_file_name`, `cv_bytes`, `answers`,
`experience_years`, `notice_period`, `expected_salary`, `available_from`.

| Error | SQLSTATE | Message |
| --- | --- | --- |
| `no_data_found` | P0002 | `This vacancy no longer exists` |
| `check_violation` | P0001 | `This vacancy is not accepting applications`; `This vacancy has closed`; `Too many applications from this address. Please try again later.`; `You must consent to us contacting you about this application` |
| `invalid_parameter_value` | 22023 | `Email is required` |

```ts
// src/lib/api/recruitment.ts
export const submitApplication = (input: SubmitApplicationInput) =>
  rpc<JobApplication>('fn_submit_application', {
    p_payload: {
      job_id: input.jobId, full_name: input.fullName, email: input.email,
      phone: input.phone ?? '', location: input.location ?? '',
      cover_letter: input.coverLetter ?? '', portfolio_url: input.portfolioUrl ?? '',
      portfolio_urls: input.portfolioUrls ?? [], cv_path: input.cvPath ?? '',
      cv_file_name: input.cvFileName ?? '', cv_bytes: input.cvBytes ?? 0,
      answers: input.answers, experience_years: input.experienceYears ?? null,
      consent_contact: input.consentContact,
    },
  })
```

```
fn_set_application_status(p_application_id uuid, p_status application_status,
                          p_note text default null, p_rating smallint default null,
                          p_interview_at timestamptz default null) → public.job_applications
```
Auth (staff or admin): `insufficient_privilege` `Only staff can review applications`;
`no_data_found` `Application not found`. `hired` increments `jobs.filled_count` and auto-closes a
fully filled vacancy. Notifies the candidate where an account exists.

```
fn_withdraw_application(p_application_id uuid) → public.job_applications
```
Migration 0016, auth. Ownership via `applicant_id` **or** a `profiles.email` match.
Errors: `no_data_found` `Application not found`; `insufficient_privilege` `You can only withdraw your
own application`; `check_violation` `This application is already closed`. Calls `fn_notify_admins`.

```ts
export const withdrawApplication = (id: string) =>
  rpc<JobApplication>('fn_withdraw_application', { p_application_id: id })
```

### Notifications and reporting (migrations 0011, 0013)

```
fn_notify(
  p_recipient_id uuid, p_type text, p_title text,
  p_body text default null, p_category text default 'general',
  p_action_url text default null, p_action_label text default null,
  p_priority notification_priority default 'normal',
  p_data jsonb default '{}',
  p_channels notification_channel[] default array['in_app']
) → uuid
```
Auth. Returns the notification id, or `null` for a null recipient, a missing profile, or a
non-active profile. Never raises.

```
fn_admin_dashboard_stats(p_from date, p_to date) → jsonb
```
Auth (staff or admin), `insufficient_privilege` `Not permitted`. Defaults `p_from` to
`current_date - 30`. Returns `range`, `appointments`, `revenue`, `commerce`, `recruitment`,
`customers` and a `series` array of one point per day.

```
fn_notify_admins(p_type, p_title, p_body default null, p_action_url default null,
                 p_data default '{}', p_channels default array['in_app']) → void
fn_appointment_created(p_appointment_id uuid) → void
fn_order_created(p_order_id uuid) → void
fn_application_submitted(p_application_id uuid) → void
```
All four are revoked from `public, anon, authenticated`. They are called from triggers and from other
`SECURITY DEFINER` functions, which is why they do not need their own authorisation — the caller's
context has already been checked.

```ts
// src/lib/api/admin.ts
export const getDashboardStats = (from: string, to: string) =>
  rpc<DashboardStats>('fn_admin_dashboard_stats', { p_from: from, p_to: to })
```

### Private helpers (`app_private`)

Revoked from `public, anon, authenticated` at the end of migration 0012. Callable only from
`SECURITY DEFINER` code, cron or `service_role`. Migration 0017 grants the six the dispatcher and the
cron jobs need back to `service_role` explicitly.

| Function | Purpose |
| --- | --- |
| `has_role(uuid, text[])` | Role membership with expiry honoured. |
| `has_capability(uuid, text)` | Capability-string lookup against `roles.capabilities`. Defined, granted to nobody, and **not consulted by any policy or function** — see [06 · Known gaps](./06-rls-and-permissions.md#known-gaps). |
| `is_admin(uuid)` | `has_role(uid, ['admin'])`. |
| `is_staff(uuid)` | `has_role(uid, ['staff','admin'])`. |
| `is_staff_or_admin(uuid)` | Identical to `is_staff`. |
| `touch_updated_at()` | Trigger function: `new.updated_at := now()`. |
| `claim_scheduled_jobs(worker text, limit integer default 25)` | `setof scheduled_jobs`; `for update skip locked` claim. |
| `complete_scheduled_job(uuid, boolean, text default null)` | Marks `done` / `failed` and releases the lock. |
| `claim_notification_deliveries(limit integer default 40)` | Migration 0017. `setof (delivery_id, channel, destination, notification_id, recipient_id, title, body, attempt_count)`; `for update of d skip locked` claim over `notification_deliveries`. |
| `recover_stuck_deliveries()` | Migration 0017. Returns `queued` for deliveries stranded in `processing` for more than 10 minutes; returns the row count. |
| `purge_expired_holds()` | Deletes unconverted expired holds; returns the count. |
| `guard_profile_columns()` | Trigger: blocks non-admin edits to `id`, `email`, `status`. |
| `guard_appointment_columns()` | Trigger: blocks non-admin edits to identity and money; gates slot edits to the assigned stylist. |
| `guard_order_columns()` | Trigger: blocks non-admin edits to customer and money. |
| `guard_variant_columns()` | Trigger: blocks non-admin edits to `price`, `cost_price`, `stock_on_hand`. |
| `log_appointment_status()` | Trigger: status history, `fn_appointment_created`, `bookings_count`. |
| `log_order_created()` | Trigger: `fn_order_created`. |
| `sync_review_rollups()` | Trigger: staff, service and product rating rollups. |
| `log_application_status()` | Trigger: `application_events`. |
| `housekeeping()` | Returns `{holds_purged, jobs_cleaned}`; purges expired holds, `done` jobs older than 7 days, `failed` jobs with 5+ attempts, and expired notifications. This is the pg_cron target. |

---

## PostgREST table surface

Two independent gates. A query needs **a grant for the role** *and* **a passing policy** (RLS is
enabled on all 48 tables, so no policy means no rows).

### Public views (anon + authenticated)

| View | Grain | Notes |
| --- | --- | --- |
| `staff_public` | one row per bookable stylist | Joins `profiles` for `full_name` / `slug`. Omits `commission_pct`, `hourly_rate`, `hired_on`, `employment_end_on`. |
| `service_catalog` | one row per (service, active variant) | Adds `category_name`, `category_slug`, `variant_name`, `variant_price`, `variant_duration`. |
| `product_catalog` | one row per (product, active variant with stock) | Adds `available_stock`, `sku`, `variant_*` columns. Omits `cost_price` and `tax_rate`. Filters `v.stock_on_hand > 0`. |

All three are declared `with (security_invoker = false)`, so the view's own `where` clauses — not the
caller's permissions — decide what a row is.

### anon: readable tables

`salon_locations` (active) · `location_hours` · `business_settings` · `service_categories` (active)
· `services` (active) · `service_variants` (active) · `staff_services` (active) · `gallery_items`
(published) · `faqs` (published) · `pages` (published) · `reviews` (published) · `product_categories`
(active) · `products` (active) · `product_variants` (active + active parent) · `coupons` (active) ·
`jobs` (open) · `roles`.

**No anon write grant exists on any table.** Every write is authenticated or service-role.

### authenticated: table by table

| Table | Grant | Effective access |
| --- | --- | --- |
| `profiles` | select, update | read own row (or any row for staff/admin); update own row, blocked per-column by `guard_profile_columns`; admin delete |
| `roles` | select | all rows (capability strings are public by design) |
| `user_roles` | select | own grants, or all for an admin; admin manages |
| `staff_profiles` | select, update | own row or all for staff/admin; own row or all for admin; anonymous traffic uses the view |
| `appointments` | select, update | own bookings, or assigned bookings for staff; staff/admin update, gated by `guard_appointment_columns`. **No insert, no delete grant.** |
| `appointment_status_history` | select | own appointment's history, or all for staff/admin |
| `requirements`, `requirement_media` | select, insert, update | own, or assigned through the appointment; staff review |
| `booking_holds` | — | no grant: reachable only through `fn_hold_slot` and admin paths |
| `products`, `services`, `service_variants`, `service_categories`, `staff_services`, `gallery_items`, `faqs`, `pages`, `product_categories`, `coupons`, `jobs`, `salon_locations`, `location_hours`, `staff_availability_rules`, `staff_time_off`, `blackout_dates`, `business_settings`, `user_roles`, `message_templates` | select + admin insert/update/delete | public read; admin write |
| `product_variants` | select, update | public read of active variants; staff/admin update, gated by `guard_variant_columns`; admin full |
| `inventory_movements` | **select only** | staff/admin read. No client insert, update or delete: the ledger is append-only by grant. |
| `wishlist_items` | select, insert, update, delete | own rows only, in every command |
| `carts`, `cart_items` | select, insert, update, delete | own cart via policy; mutations in practice go through `fn_add_to_cart` / `fn_update_cart_item` / `fn_remove_cart_item` / `fn_checkout` |
| `orders` | select, admin insert/update/delete | own orders, or all for staff/admin; staff/admin update gated by `guard_order_columns` |
| `order_items` | select, admin insert/update/delete | via the parent order |
| `payments` | select, update | own payments or all for staff; **admin update**. Migration 0017 revokes the `insert` grant from `anon` and `authenticated`, so a client cannot fabricate a payment row: the webhook, `fn_record_offline_payment` and the initialize function are the only writers. |
| `payment_events` | none | `service_role` only; no policy exists |
| `job_applications` | select, update | own (by `applicant_id` or email) or all for staff; staff/admin update; insertion is via `fn_submit_application` |
| `application_events` | — | no grant; staff read/insert policies exist but there is no table grant |
| `job_alerts` | select, insert, update, delete | own rows |
| `notifications` | select, update, delete | own rows |
| `notification_deliveries` | select | own deliveries, or all for staff/admin |
| `notification_preferences`, `contact_points` | select, insert, update, delete | own rows |
| `scheduled_jobs` | none | `service_role` / cron only; no policy |
| `whatsapp_messages` | — | no grant; participant/staff read and staff insert policies exist |
| `audit_log` | — | no grant; admin read policy exists |

### RPC-only tables

`booking_holds`, `payment_events`, `scheduled_jobs` and `whatsapp_messages` have no client grant at
all. Everything else is reachable either directly or through a function, never exclusively through
one.

### The `service_role` surface

`grant all on all tables in schema public to service_role` in migration 0012 is not sufficient on its
own, and migration 0017 says why: *service_role bypasses RLS but does not bypass table/function
privileges.* The Edge Function entry points are therefore granted explicitly.

Execute:

```
fn_notify, fn_order_created, fn_appointment_created, fn_application_submitted,
fn_set_order_status, fn_set_application_status, fn_service_slots, fn_cart_totals,
fn_available_stock, fn_next_reference, fn_record_offline_payment, fn_adjust_stock
```

Table privileges: `select` on `profiles`; `select, update` on `payments`, `orders`, `appointments`;
`insert` on `payment_events`, `payments`, `notifications`, `notification_deliveries`,
`whatsapp_messages`; `update` on `notification_deliveries`, `notification_preferences`.

---

## Storage API surface

Used from `src/lib/api/booking.ts` and `src/lib/api/recruitment.ts`.

```ts
// Private bucket, signed read-back, 7 days
await getSupabase().storage.from('requirements')
  .upload(storagePath, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
const { data: signed } = await getSupabase().storage
  .from('requirements').createSignedUrl(storagePath, 60 * 60 * 24 * 7)

// CV: 10 MB ceiling, pdf/msword/docx only, 10-minute signed URL
await getSupabase().storage.from('applications').upload(path, file, { upsert: false })
await getSupabase().storage.from('applications').createSignedUrl(path, 60 * 10)
```

Object policies are in migration 0014 and are summarised in
[02 · Storage buckets](./02-database-schema.md#storage-buckets). The catalogue buckets
(`service-images`, `gallery`, `products`) have no object policies at all: they are public-read and
service-role-write, so admin media upload is currently a dashboard or SQL task, not a UI action.

---

## Edge Functions

**None of these exist.** There is no `supabase/functions/` directory. The two functions the client
already calls will fail at runtime with a 404 from the functions gateway; the contracts below are
what the client expects and what a future implementation must satisfy.

`vite.config.ts` proxies `/functions` to `VITE_SUPABASE_URL` in dev, and
`src/lib/supabase/client.ts:invokeFunction` wraps `functions.invoke` with uniform error handling.

### `paystack-initialize`

Called by `src/lib/api/commerce.ts:startPayment`.

Request:
```json
{ "order_id": "uuid", "amount": 98500, "email": "client@example.com", "reference": "ORD-ORD-20260101-ABCDE" }
```
Response (client reads snake_case):
```json
{ "authorization_url": "https://checkout.paystack.com/abc", "access_code": "abc", "reference": "ORD-…", "amount": 98500 }
```

Client expectations, from the wrapper: `authorization_url` must be present or the client throws
*"Payment could not be started. Please try again."*; `access_code` and `reference` may be empty
strings; `amount` falls back to the order total. A server-side implementation must re-derive the
amount from the order row and never trust the value in the body.

### `bank-transfer-instructions`

Called by `src/lib/api/commerce.ts:requestBankTransfer`.

Request: `{ "order_id": "uuid" }`
Response: `{ "instructions": "…", "reference": "…" }`

Used for the offline-payment path, which then lands in `fn_record_offline_payment` with provider
`bank_transfer`.

### Payment webhook handler — not called by the client

Provider-initiated, so it is invoked by Paystack, not by `functions.invoke`. Requirements the schema
already anticipates:

1. Verify the `x-paystack-signature` HMAC against the raw body with the secret key.
2. `INSERT INTO payment_events (provider, event, provider_ref, payload) ON CONFLICT DO NOTHING` —
   the `unique (provider, event, provider_ref)` constraint is the idempotency guard. A duplicate
   delivery must be a no-op, not an error.
3. On `charge.success`, verify the amount and currency against the `payments` row, then move the
   payment to `paid`, set `paid_at` / `verified_at`, store `raw_payload`, and recompute
   `orders.paid_total`, `orders.payment_status` (and `confirmed_at`) exactly as
   `fn_record_offline_payment` does.
4. Mark `payment_events.processed_at`, or record `error` for a retry.
5. A failed insert or a business-rule rejection must not roll back `payment_events` — the row is the
   audit record.

### Notification dispatcher — referenced, not implemented

Migration 0011 enqueues `scheduled_jobs` rows with `job_name = 'dispatch_notification'` whenever
`fn_notify` produced at least one `queued` delivery. Migration 0010 enqueues
`job_name = 'low_stock_alert'`. A worker is expected to:

1. `select * from app_private.claim_scheduled_jobs('edge-worker', 50)` — `FOR UPDATE SKIP LOCKED`, so
   two workers never claim the same row.
2. For `dispatch_notification`, call `app_private.claim_notification_deliveries(40)` (migration
   0017), which returns each due delivery with its `title` and `body` already joined, sends it over
   its channel, then updates the delivery status, `provider_message_id`, `sent_at` / `delivered_at` /
   `failed_at` and `error_code` / `error_message`. Rows still `processing` after ten minutes are
   returned to `queued` by `app_private.recover_stuck_deliveries()`.
3. `select app_private.complete_scheduled_job(id, true)` on success, or `(id, false, error)` to
   retry — `housekeeping()` clears `failed` jobs after 5 attempts, and a delivery is never claimed
   again once `attempt_count` reaches 4.

Triggering that worker from pg_cron needs `pg_net` to POST to the function, or a database-side
dispatcher. Neither is written. See [09](./09-notifications-and-integrations.md).

Migration 0017 provides the database side of this: `app_private.claim_notification_deliveries(limit)`
and `app_private.recover_stuck_deliveries()`, both granted to `service_role`, so the function's query
layer is complete even though the function itself is not.

### WhatsApp sender — planned

Would call the Cloud API for `whatsapp` deliveries and write `whatsapp_messages` rows. Templates
outside the 24-hour window require an approved template name, which is why the seeded templates in
migration 0015 include channel-specific entries such as `appointment.reminder_2h` (sms) and
`order.ready` (whatsapp).

---

## Contract verification

`scripts/validate-sql.mjs` checks the client/database contract mechanically on every run:

- all 28 RPCs named in the client with their expected arity, so a renamed or re-parameterised
  function fails the build;
- the three catalogue views resolve the columns the UI selects;
- `fn_service_slots` compiles and executes;
- every public table has RLS enabled.

```
  ok all 28 client RPCs present with matching arity
  ok staff_public / service_catalog / product_catalog
  ok fn_service_slots executes (0 rows for unknown service)
  ok every public table has RLS enabled
```
