# 03 · User flows

Seven flows, each with the permission decision that gates it. "Permission" here means the mechanism
that decides, and it is almost never the route guard: `RequireAuth` and `RequireRole`
(`src/components/layout/RouteGuards.tsx`) only decide what a person *sees*; the policy or the
function's own check decides what they *get*.

Legend for the notes in each diagram: **PERM** marks the gate, with the mechanism named.

---

## 1. Browsing anonymously

```mermaid
sequenceDiagram
  autonumber
  participant V as Visitor
  participant P as Public page
  participant S as Supabase (anon JWT)
  participant D as Postgres

  V->>P: GET /
  P->>P: useSeo — title, description, canonical, HairSalon JSON-LD
  P->>S: from('service_catalog').select(...)
  S->>D: query as `anon`
  D->>D: no anon INSERT/UPDATE policy on a view; view is security_invoker = false
  D-->>S: active services, one row per variant
  S-->>P: rows
  P->>S: from('product_catalog').select(...)
  S->>D: query as `anon`
  D-->>S: active products with live available_stock
  S-->>P: rows
  P->>S: from('staff_public').select(...)
  D-->>S: bookable stylists only
  S-->>P: rows
  P->>S: from('business_settings').select('*')
  D-->>S: the singleton row
  S-->>P: row
  P-->>V: rendered page
  Note over P,D: PERM — anon role. Reads only. The three catalogue views are
  the intended anonymous surface; each already filters to
  status = 'active' / is_published, so the RLS policies on the base
  tables are a second, independent gate.
```

What an anonymous visitor can reach, and nothing else:

| Surface | Mechanism |
| --- | --- |
| `service_catalog`, `product_catalog`, `staff_public` | `grant select … to anon, authenticated` on the views. |
| `salon_locations` (active), `location_hours`, `business_settings`, `service_categories`, `services` (active), `service_variants` (active), `staff_services` (active), `gallery_items` (published), `faqs` (published), `pages` (published), `reviews` (published), `product_categories` (active), `products` (active), `product_variants` (active + parent active), `coupons` (active), `jobs` (open) | `*_public_read` policies with `to anon, authenticated`. |
| `fn_service_slots`, `fn_is_slot_available`, `fn_get_or_create_cart`, `fn_get_cart`, `fn_apply_cart_coupon`, `fn_coupon_preview`, `fn_cart_totals`, `fn_available_stock`, `fn_my_role_keys`, `fn_naira`, `fn_slugify`, `fn_next_reference` | `grant execute … to anon, authenticated`. |
| Everything else | No grant, or no policy. Empty result, or `permission denied`. |

The calendar on `/book` is deliberately reachable without an account: `BookingPage` calls
`fn_service_slots` as `anon`, and the wizard only asks for authentication when the customer commits
to a booking time.

---

## 2. Signing up

```mermaid
sequenceDiagram
  autonumber
  participant U as New user
  participant F as SignUpPage
  participant G as GoTrue
  participant T as on_auth_user_created trigger
  participant D as Postgres
  participant A as AuthProvider

  U->>F: name, email, password
  F->>G: auth.signUp({ data: { full_name }, emailRedirectTo: /auth/confirm })
  G->>G: create auth.users row
  G->>T: AFTER INSERT on auth.users
  T->>D: INSERT profiles (id, email, full_name, slug, phone_e164)
  Note over T: slug = slugify(full_name) || '-' || left(id::text, 6),
  so it is unique even for two people called Ada
  T->>D: INSERT user_roles (user, role_id) WHERE roles.key = 'customer'
  Note over T,D: PERM — role assignment. The trigger is the only
  place an account is created, and the only role it may grant is
  `customer`. Elevation is a separate admin action.
  G-->>F: session, or null when email confirmation is required
  F-->>U: "check your inbox" or straight to /account

  Note over U,A: On the next request AuthProvider.hydrate runs:
  A->>D: select * from profiles where id = auth.uid()   (own row only)
  A->>D: select fn_my_role_keys()
  A->>A: SessionState { isAuthenticated, roles: ['customer'], isStaff: false, isAdmin: false }
```

Three properties of this flow:

- `fn_handle_new_user` uses `on conflict (id) do update` and never clobbers a display name the
  customer has already set, so a re-fire of the trigger is harmless.
- The trigger is `security definer` — it inserts into `profiles` and `user_roles` as the table owner,
  bypassing the RLS policies a client could not satisfy.
- `AuthProvider` calls `resetQueryCache()` and `queryClient.clear()` on every identity change except
  `TOKEN_REFRESHED`, so a sign-in can never render the previous user's cached data.

If the profile row is missing when the client looks (a race, or a trigger that did not fire),
`AuthProvider.hydrate` tolerates it: `Promise.allSettled` on the profile and role reads, defaulting
roles to `['customer']`. `src/lib/api/account.ts:ensureProfile` is the idempotent upsert used by the
account form for that edge case.

---

## 3. Booking with requirements

The most constrained flow in the system. Three defences, documented in full in
[07](./07-availability-and-booking-engine.md).

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer
  participant B as BookingPage
  participant D as Postgres

  C->>B: choose service
  B->>D: rpc fn_service_slots(location, service, date, staff?, variant?)
  D-->>B: one row per (start, stylist), already filtered
  Note over B,D: PERM — advisory only. fn_service_slots is
  STABLE SECURITY DEFINER and is granted to anon, so it cannot
  enforce anything; it just renders the grid.

  C->>B: pick a time
  B->>D: rpc fn_hold_slot(staff, service, location, starts_at, session_token, ttl 20)
  D->>D: fn_is_slot_available(...)
  D->>D: INSERT booking_holds (expires_at = now() + 20 min)
  D-->>B: hold id
  Note over B,D: PERM — none required. A hold is not a
  reservation; it only removes the slot from other people's
  calendars for 20 minutes.

  C->>B: fills the requirement form
  B->>B: uploads reference images
  B->>D: storage upload to `requirements/{user_id}/{requirement_id}/...`
  D-->>B: 7-day signed URL
  B->>D: insert requirement_media (storage_path, public_url, kind)
  Note over B,D: PERM — requirements_owner_upload requires
  storage.foldername(name)[1] = auth.uid(); the bucket is private,
  so only a signed URL exposes the bytes.

  C->>B: confirm
  B->>D: rpc fn_create_appointment(service, location, staff, starts_at, variant, requirement, hold_token, force = false)
  D->>D: 1. auth.uid() is not null                     → else insufficient_privilege
  D->>D: 2. profiles.status = 'active'
  D->>D: 3. force? only honoured for staff/admin
  D->>D: 4. fn_is_slot_available(...)                  → check_violation
  D->>D: 5. lead time and max advance window            → check_violation
  D->>D: 6. service active, requirement present, gender restriction
  D->>D: 7. price = coalesce(variant.price, service.price_from); deposit = pct
  D->>D: 8. INSERT ... ON CONFLICT (staff_id, tstzrange) DO NOTHING
  Note over D: the exclusion constraint appointments_no_overlap
  is the final authority. A lost race returns no row and the
  function raises "That slot was just taken."
  D->>D: 9. convert the hold, INSERT requirements ON CONFLICT DO UPDATE
  D->>D: 10. trigger: appointment_status_history + fn_appointment_created
  D-->>B: the appointment row, status 'pending'
  B-->>C: /book/confirmed/{reference}
```

The customer sees `pending`, not `confirmed`. `fn_create_appointment` sets
`case when is_staff_or_admin(auth.uid()) then 'confirmed' else 'pending'`, so the phone, walk-in and
admin paths skip the confirmation queue while the web path waits for the front desk.

Side effects of step 10, all in the same transaction as the insert: the customer gets an in-app,
email and WhatsApp notification; every admin gets an `appointment.new`; and two `scheduled_jobs`
rows are enqueued for 24h and 2h before the start.

---

## 4. Rescheduling and cancelling

### Reschedule

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer
  participant B as AppointmentDetailPage
  participant D as Postgres

  C->>B: choose a new time
  B->>D: rpc fn_reschedule_appointment(id, new_starts_at, new_staff_id?, note?)
  D->>D: SELECT ... FOR UPDATE
  D->>D: auth.uid() is admin, the customer, or the assigned staff member
  Note over D: PERM — ownership, checked inside the function.
  A route guard is not involved; a customer who guesses another
  person's appointment id gets insufficient_privilege.
  D->>D: status must be 'pending' or 'confirmed'
  D->>D: fn_set_appointment_status(id, 'rescheduled', note)
  Note over D: the legal transition graph allows
  confirmed → rescheduled but NOT pending → rescheduled.
  A web booking is created 'pending', so a first-time
  reschedule of an unconfirmed booking is rejected with
  check_violation. Confirmed the customer can reschedule, or an
  admin can confirm the booking first.
  D->>D: fn_create_appointment(..., source 'recurring', force = staff?)
  D->>D: UPDATE new.rescheduled_from_id = old id
  D-->>B: the NEW appointment
```

Reschedule is create-new-and-close-old, never an in-place time change. `rescheduled_from_id` keeps
the lineage, the old row keeps its history, and the old slot is released because `rescheduled` is
not in the exclusion constraint's blocking status list. The new row gets a fresh `reference`.

### Cancel

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer
  participant B as AppointmentDetailPage
  participant D as Postgres

  C->>B: cancel, optional reason
  B->>D: rpc fn_cancel_appointment(id, reason)
  D->>D: auth.uid() is admin, the customer, or the assigned stylist
  Note over D: PERM — ownership.
  D->>D: status not in (completed, cancelled, no_show)
  D->>D: hours_left = extract(epoch from starts_at - now()) / 3600
  D->>D: late := hours_left < business_settings.cancellation_window_hours (24)
  D->>D: fn_set_appointment_status(id, 'cancelled', reason)
  D->>D: stamps cancelled_at, cancelled_by, cancellation_reason
  D->>D: if late and deposit_paid > 0 and actor is the customer:
  D->>D:   INSERT audit_log (action 'appointment.late_cancellation',
  Note over D:   after_data { forfeit_pct: 50 }, before_data {
  hours_notice, deposit_paid, window_hours })
  D-->>B: the appointment, status 'cancelled'
```

**Cancellation is a transition, not a delete.** Three reasons: the row is referenced by
`requirements`, `appointment_status_history`, `reviews` and `payments`; the salon needs the history
to answer disputes; and deleting would release the slot silently, whereas a status change to
`cancelled` releases it *and* records who released it and why. `appointments_staff_delete` exists for
admins as a last resort, but there is no client `DELETE` grant on `appointments`, so it is only
reachable from a service-role context.

**The late-cancellation rule is a record, not a charge.** The 50% deposit forfeit is written to
`audit_log` for a human to act on; `fn_cancel_appointment` does not move money. Deposits are settled
through `payments`, and there is no automated refund path. The customer-facing copy matches the
seeded FAQ: *"Inside 24 hours, 50% of any deposit paid is forfeited."*

---

## 5. Shopping and paying

```mermaid
sequenceDiagram
  autonumber
  participant G as Guest
  participant U as Signed-in customer
  participant C as CartProvider
  participant D as Postgres
  participant X as Edge Function (not implemented)

  G->>C: add to bag
  C->>D: rpc fn_add_to_cart(variant, qty, session_token from localStorage)
  D->>D: cart = fn_get_or_create_cart(session_token)
  D->>D: lock variant FOR UPDATE; stock check (backorder_allowed respected)
  D->>D: INSERT cart_items ON CONFLICT (cart_id, variant_id) DO UPDATE
  D-->>C: the line
  C->>D: rpc fn_get_cart(session_token)
  D-->>C: { cart, items[], totals } — every number computed in SQL

  U->>C: signs in
  C->>D: rpc fn_get_or_create_cart(session_token)
  D->>D: fn_merge_carts: copy guest lines into the account cart,
  D->>D:   sum duplicates, cap at stock_on_hand, delete the guest cart
  D-->>C: the merged account cart
  Note over C,D: PERM — a guest cart is identified only by an
  opaque token they hold. Anyone with the token can read that cart,
  which is why the token is never logged and lives only in
  localStorage. fn_apply_cart_coupon requires auth.uid().

  U->>C: apply WELCOME10
  C->>D: rpc fn_apply_cart_coupon('welcome10')
  D->>D: fn_coupon_preview(code, subtotal, product_ids)
  D-->>C: { is_valid, message, discount_amount, coupon_code }

  U->>C: checkout
  C->>D: rpc fn_checkout(cart, name, email, phone, fulfilment, location, address, notes, coupon)
  D->>D: auth.uid() is not null            → else insufficient_privilege
  Note over D: PERM — checkout is authenticated only. Guest carts
  must be claimed by signing in.
  D->>D: SELECT cart FOR UPDATE
  D->>D: delivery allowed? address present?
  D->>D: FOR EACH line, in variant_id order:
  D->>D:   SELECT variant FOR UPDATE      → deterministic lock order
  D->>D:   active? sufficient stock?
  D->>D: INSERT orders (status 'pending', payment_status 'awaiting_payment')
  D->>D: FOR EACH line: snapshot into order_items,
  D->>D:   decrement stock, INSERT inventory_movements (reason 'sale'),
  D->>D:   increment products.sold_count
  D->>D: increment coupons.usage_count
  D-->>C: the order, total computed from the locked data

  U->>C: pay
  C->>X: functions.invoke('paystack-initialize', { order_id, amount, email, reference })
  Note over C,X: NOT IMPLEMENTED. The call is in
  src/lib/api/commerce.ts:startPayment and will fail until
  supabase/functions/paystack-initialize exists.
  X-.-> U: redirect to Paystack checkout
  Paystack-.-> X: webhook → payment_events → payments
  Note over Paystack: NOT IMPLEMENTED.
```

Stock is validated twice on purpose: `fn_add_to_cart` gives immediate feedback, and `fn_checkout`
re-checks under a row lock because a cart can sit for days. The `for update` loop is ordered by
`variant_id` so two concurrent checkouts containing the same two variants cannot deadlock.

Money is never computed in the browser. `fn_get_cart` returns `totals` straight from
`fn_cart_totals`, and `fn_checkout` recomputes the same figures from locked rows. Any drift between
what was shown and what was charged is therefore a database-level inconsistency, not a client bug —
see the known issue in [08 · Commerce and payments](./08-commerce-and-payments.md#known-issues).

---

## 6. Applying for a job

Vacancies are public; applications do not require an account.

```mermaid
sequenceDiagram
  autonumber
  participant A as Applicant
  participant J as JobApplyPage
  participant D as Postgres
  participant S as Storage

  A->>J: reads /careers/{slug}
  J->>D: from('jobs').select().eq('status','open')
  D-->>J: the vacancy + screening_questions
  Note over J,D: PERM — jobs_public_read: status = 'open', to anon.

  A->>J: attaches a CV
  J->>S: upload to applications/{user_id | guest-uuid}/{uuid}.pdf
  Note over J,S: PERM — applications_upload: any authenticated
  user may insert into the private bucket. A guest (anon JWT)
  cannot: uploadCv() requires a session. The path is a random
  folder for applicants without an account, so nobody but staff
  can read it back.
  S-->>J: path

  A->>J: submits
  J->>D: rpc fn_submit_application(payload)
  D->>D: job exists, status = 'open', not past closes_at
  D->>D: if anon: at most 3 submissions per email per 24 h
  D->>D: email present; consent_contact must be true
  D->>D: INSERT ... ON CONFLICT (job_id, lower(email))
  Note over D: PERM — the partial unique index
  applications_unique_live_idx is the rate limit. A re-application
  after a rejection updates the closed row and reopens it at
  'submitted' instead of creating a duplicate.
  D->>D: fn_application_submitted → notify admins
  D-->>J: the application, with a UHS reference

  A->>J: later, "withdraw"
  J->>D: rpc fn_withdraw_application(id)
  D->>D: ownership via applicant_id OR a matching profile email
  Note over D: PERM — email match is accepted on purpose:
  candidates routinely apply before creating an account.
  D->>D: status must not already be withdrawn/rejected
  D->>D: set 'withdrawn', record the event, notify admins
  D-->>J: the updated application
```

A signed-in applicant can see their own applications at `/account/applications`
(`applications_select_own_or_staff` also matches on profile email), and can generate a 10-minute
signed download URL for a CV they uploaded themselves.

---

## 7. Staff working the diary

```mermaid
sequenceDiagram
  autonumber
  participant S as Stylist
  participant T as StaffTodayPage
  participant D as Postgres

  S->>T: opens /staff
  Note over S,T: RequireAuth + RequireRole(['staff','supervisor','admin']).
  A guard. RLS is what follows.
  T->>D: from('appointments').select(...).gte(starts_at).lte(ends_at)
  D->>D: appointments_select_participants
  D->>D:   customer_id = auth.uid()
  Note over D:   OR fn_is_admin()
  D->>D:   OR (fn_is_staff() AND staff_id = auth.uid())
  D-->>T: only this stylist's appointments
  Note over D: A stylist cannot widen the result set by editing
  the query: there is no filter that reaches another stylist's
  rows. addBookingInternalNote writes internal_notes, which
  trg_guard_appointment permits for the assigned stylist.

  T->>D: from('requirements') via the appointments embed
  D->>D: requirements_select_participants
  D-->>T: requirements for their own clients only
  Note over D: Staff read through appointment.staff_id, not
  through customer_id, so reassigning an appointment moves the
  requirement with it.

  T->>D: signed URL for a reference image
  D-->>T: object exists in `requirements` AND is attached to a
  requirement whose appointment.staff_id = auth.uid()

  S->>T: checks the client in
  T->>D: rpc fn_set_appointment_status(id, 'checked_in')
  D->>D: auth.uid() is admin, or staff assigned to this appointment
  D->>D: legal transition: confirmed → checked_in ✓
  D->>D: UPDATE ... confirmed_at / checked_in_at / completed_at
  D->>D: trigger writes appointment_status_history
  D-->>T: the updated appointment

  S->>T: starts, then completes
  T->>D: 'in_progress' then 'completed'
  D->>D: trigger increments services.bookings_count
  D-->>T: done

  S->>T: adds a note
  T->>D: update appointments set internal_notes = ...
  D->>D: trg_guard_appointment: notes are fine, money and slot
  Note over D: fields are not. A direct attempt to change total
  raises insufficient_privilege.
```

**The daily cap is enforced in the availability query, not here.** `staff_profiles.max_daily_bookings`
(default 8) is checked by `fn_service_slots`, so a stylist at capacity simply stops appearing in the
bookable list. `fn_create_appointment` does not re-check the cap; a staff-forced booking bypasses it by
design.

---

## 8. Running the salon as an administrator

```mermaid
sequenceDiagram
  autonumber
  participant A as Administrator
  participant U as /admin
  participant D as Postgres

  A->>U: opens /admin
  Note over A,U: RequireAuth + RequireRole(['admin']). UI only.

  U->>D: rpc fn_admin_dashboard_stats(from, to)
  D->>D: is_staff_or_admin(auth.uid())  → else insufficient_privilege
  D-->>U: appointments, revenue, commerce, recruitment, customers, daily series

  U->>D: from('appointments') with filters
  D->>D: fn_is_admin() → all bookings
  D-->>U: rows
  U->>D: rpc fn_set_appointment_status(id, 'confirmed' | 'no_show' | …)
  D->>D: admin may take any legal transition

  U->>D: update services / products / jobs / gallery / hours
  D->>D: *_admin_write policies (fn_is_admin) AND the admin
  Note over D: grant list. Both gates must open: the policy says
  which rows, the GRANT says which columns exist for the role.
  `message_templates`, `business_settings`, `coupons`,
  `user_roles`, `blackout_dates` and `staff_availability_rules`
  are admin-only for writes.

  U->>D: rpc fn_adjust_stock(variant, delta, reason, note)
  D->>D: is_staff_or_admin
  D->>D: lock variant FOR UPDATE; negative result rejected unless
  D->>D:   backorder_allowed
  D->>D: UPDATE stock_on_hand
  D->>D: INSERT inventory_movements (delta, balance_after, reason, actor)
  D->>D: if at or below low_stock_threshold → scheduled_jobs 'low_stock_alert'
  D-->>U: the variant

  U->>D: rpc fn_set_order_status(order, status, note, tracking, courier)
  D->>D: is_staff_or_admin
  D->>D: cancelling a paid order is refused: "Refund this order
  Note over D: before cancelling it"
  D->>D: 'returned' restocks every line and sets refunded_qty
  D-->>U: the order, plus an order.status_changed notification

  U->>D: rpc fn_record_offline_payment(order, amount, cash|pos|bank_transfer|moniepoint, ref)
  D->>D: is_staff_or_admin
  D->>D: INSERT payments (status 'paid')
  D->>D: recompute orders.paid_total / refund_total / payment_status
  D->>D: auto-confirm a pending order once fully paid
  D->>D: INSERT audit_log (action 'payment.recorded')
  D-->>U: the payment

  U->>D: rpc fn_set_application_status(id, status, note, rating, interview_at)
  D->>D: is_staff_or_admin
  D->>D: 'hired' increments jobs.filled_count and closes the
  Note over D: vacancy when it is full
  D->>D: notify the candidate (in-app + email)
  D-->>U: the application

  A->>U: from('audit_log')
  D->>D: audit_log_admin_read
  D-->>A: before/after snapshots of every recorded decision
```

What an administrator cannot do through the client, and by design: change an order's money
(`trg_guard_order` and `guard_variant_columns`), or invent an appointment that was never validated —
`fn_create_appointment` still applies the exclusion constraint and the transition graph to
administrators. The only bypass is `p_force`, which itself requires
`app_private.is_staff_or_admin(auth.uid())` inside the function.
