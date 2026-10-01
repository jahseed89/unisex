# Unisex Hair Studio — Technical Documentation

Documentation for the Unisex Hair Studio platform: a premium unisex salon in Lagos, Nigeria, covering
service discovery, appointment booking with client requirement capture, an online boutique
(wigs, extensions, hair care), recruitment, and staff/administrator operations.

Everything in this directory describes code that exists in this repository. Where a capability is
designed but not built, the document says so explicitly in a **Not yet implemented** or **Planned**
callout rather than describing it as done.

---

## Document index

| Document | What it covers |
| --- | --- |
| [01 · System architecture](./01-system-architecture.md) | Context and container diagrams, the four application surfaces, the SPA + Supabase split, request lifecycle, trust boundaries, deployment topology, and a table of every Supabase feature in use. |
| [02 · Database schema](./02-database-schema.md) | All 47 tables organised by domain, ER diagrams, the invariants the schema enforces, the complete enum list, generated columns, exclusion constraints, and the column-guard triggers. |
| [03 · User flows](./03-user-flows.md) | Sequence diagrams for browsing, signup, booking with requirements, reschedule/cancel, shopping and paying, job applications, the staff diary, and running the salon — with the permission decision at each step. |
| [04 · API specification](./04-api-specification.md) | The complete RPC catalogue (42 `public.fn_*` functions plus 20 `app_private` helpers) with signatures, return shapes, callers and errors; the client-side TypeScript wrapper for each; the PostgREST table surface; and the Edge Function contracts. |
| [05 · Authentication model](./05-authentication-model.md) | Signup, session handling, token refresh, the `fn_handle_new_user` trigger, the profile/role model, password reset, OAuth, why roles are a table and not an enum, and why route guards are UX rather than security. |
| [06 · RLS and permissions](./06-rls-and-permissions.md) | The full permission matrix (customer / staff / supervisor / admin across all 47 tables), the `app_private` schema pattern, `has_role()` / `is_admin()`, why `FORCE ROW LEVEL SECURITY` is deliberately off, the public catalogue views, and the anti-patterns the schema avoids. |
| [07 · Availability and booking engine](./07-availability-and-booking-engine.md) | The full logic of `fn_service_slots`, timezone handling, buffers, holds, daily caps, the `business_settings` gates, the three-layer double-booking defence, the legal status-transition graph, and the late-cancellation rule. |
| [08 · Commerce and payments](./08-commerce-and-payments.md) | The product/variant model, the append-only inventory ledger, guest cart merging, coupon evaluation, server-authoritative pricing, tax-inclusive totals, the checkout transaction and its `FOR UPDATE` locking, offline payments, refunds, and the Paystack integration architecture. |
| [09 · Notifications and integrations](./09-notifications-and-integrations.md) | The `fn_notify` dispatch model, channel fan-out, opt-in resolution, `notification_deliveries`, the durable `scheduled_jobs` queue with `FOR UPDATE SKIP LOCKED` claiming, reminder scheduling, message templates, and the planned WhatsApp Cloud API integration. |
| [10 · SEO and analytics](./10-seo-and-analytics.md) | The `useSeo` head manager and its tag-leakage protection, every JSON-LD builder with worked examples, the `scripts/generate-seo.mjs` prerendering step, why it matters for a JS-rendered SPA, the SSR/ISR migration path, and the consent-gated analytics architecture. |
| [11 · Design system](./11-design-system.md) | The editorial-luxe language: colour tokens, the Fraunces/Inter type scale, spacing rhythm, radii, elevation, motion and reduced-motion handling, the Tailwind v4 `@theme` block, the component inventory, accessibility rules, and the placeholder-media strategy. |
| [13 · Operations runbook](./13-operations-runbook.md) | Local development, connecting a real project, migrations, type generation, seeding, promoting the first administrator, Auth provider setup, storage, Paystack and WhatsApp secrets, cron registration, backups, and the pre-launch checklist. |
| [FRONTEND_CONTRACT.md](./FRONTEND_CONTRACT.md) | The implementation contract every page module in `src/` follows: module shape, imports, data fetching, the three visual states, accessibility, SEO, money formatting. |

---

## Sixty-second orientation

1. **The whole backend is one Postgres database.** Seventeen SQL migrations in `supabase/migrations/`
   define 47 tables, 42 public RPCs, 91 RLS policies, 22 enums and 28 triggers. There is no
   application server.
2. **The browser talks to Postgres directly.** `src/lib/supabase/client.ts` creates a
   `@supabase/supabase-js` client with the anonymous key. The key is public by design; every
   meaningful restriction is a Postgres policy or a `SECURITY DEFINER` function.
3. **Money and state transitions never go through PostgREST.** `orders`, `appointments`,
   `payments`, `cart_items` and `inventory_movements` have no client write policies. They are only
   reachable through `fn_checkout`, `fn_create_appointment`, `fn_set_appointment_status`,
   `fn_adjust_stock` and `fn_record_offline_payment`, each of which re-authorises the caller.
4. **The client computes no money and trusts no price.** `fn_cart_totals` returns the cart total and
   the UI renders it verbatim. Appointment prices come from the service or variant row.
5. **Double-booking is impossible, not unlikely.** `fn_service_slots` is an advisory calendar query;
   `fn_create_appointment` re-validates; the `appointments_no_overlap` GiST exclusion constraint
   settles any remaining race. See [07](./07-availability-and-booking-engine.md).
6. **Roles are rows, not an enum.** `roles` + `user_roles` with an expiry column and capability
   strings. Every signup receives exactly one role — `customer` — from the `on_auth_user_created`
   trigger. Elevation is an insert into `user_roles`.
7. **Route guards are UX.** `RequireAuth` / `RequireRole` keep customers out of screens they cannot
   use. Removing them reveals layout, never data. RLS is the boundary.
8. **Notifications are queued, not sent.** `fn_notify` writes an inbox row plus one
   `notification_deliveries` row per opted-in channel, and enqueues a `scheduled_jobs` row. Nothing
   talks to SMTP or WhatsApp until an Edge Function worker exists.

### Verified schema inventory

Produced by `npm run validate:sql`, which executes all seventeen migrations against a real PostgreSQL 16
engine (PGlite/WASM) and then counts the catalogue:

```
public tables          47
RLS-enabled tables     47
RLS policies           91        (+7 storage.objects policies in migration 0014)
public functions       42
private functions      20
triggers               28
enums                  22
indexes                152

Client contract: ok all 28 client RPCs present with matching arity
View contracts:   ok staff_public, service_catalog, product_catalog
                  ok fn_service_slots executes
                  ok every public table has RLS enabled
PASSED - 0 failures
```

Migration 0017 (`20250101000017_edge_function_support.sql`) adds the two delivery-claiming
functions, the `service_role` grants and `revoke insert on public.payments from anon, authenticated`.
It adds no tables and no policies, so the counts above are unchanged.

PGlite ships no contrib extensions, so three things cannot be verified locally and are reported
separately by the script: the `pg_trgm` extension, the three trigram GIN indexes
(`profiles_fullname_trgm`, `services_name_trgm`, `products_name_trgm`) and the
`appointments_no_overlap` exclusion constraint, which needs `btree_gist`. Re-check those three against
a real Supabase project; see the [runbook](./13-operations-runbook.md).

---

## Local setup

Requires Node 20.11 or newer (engines field in `package.json`).

```bash
npm install
cp .env.example .env.local     # then fill in the two Supabase values
```

Two ways to get a database:

**Hosted project (recommended).** Create a project, then run the migrations in the order they sort,
or paste them into the SQL editor. Then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
`.env.local` and run `npm run dev`.

**Local stack.** Requires the Supabase CLI and Docker, which were not available in the environment
this project was built in:

```bash
npm run supabase:start     # apis on :54321, studio on :54323
npm run supabase:reset     # replays every migration, then the seed
```

`supabase/config.toml` is present and configures the local API, database, auth, storage, edge runtime
and analytics. It does not register cron jobs — see the runbook for the two `cron.schedule`
statements to run against a hosted project.

**With no credentials at all** the app still boots: `src/config/env.ts` detects that
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing or still contain the
`.env.example` placeholders, and `configurationNotice()` explains the state in a dev-only banner in
`src/App.tsx`.

Verify the schema without a database:

```bash
npm run validate:sql
```

---

## Bootstrapping the first administrator

`auth.users` is owned by Supabase GoTrue, so no migration can create the first administrator — a role
row needs a real, confirmed account to point at. Migration `20250101000015_seed.sql` deliberately
seeds the `admin` *role* without seeding an admin *user*, and says so in its header.

1. Sign up through the app at `/auth/sign-up` (or the hosted project's Auth → Users panel) and
   confirm the email address. The `on_auth_user_created` trigger creates the `profiles` row and
   grants the `customer` role.
2. Promote that account. The helper script resolves the profile and the role by key, then inserts the
   grant:

   ```bash
   npm run admin:bootstrap -- you@example.com
   ```

   It needs a key with permission to insert into `user_roles`. With only the anonymous key it will
   fail and print the SQL below. `SUPABASE_SERVICE_ROLE_KEY` in the environment switches it to the
   service-role key:

   ```bash
   node scripts/bootstrap-admin.mjs you@example.com --service_role
   ```

   Or paste this into the Supabase SQL editor (that session runs with elevated privileges, so RLS on
   `user_roles` does not block it):

   ```sql
   -- Promote an existing account to administrator
   insert into public.user_roles (user_id, role_id)
   select p.id, r.id
   from public.profiles p
   cross join public.roles r
   where lower(p.email) = lower('you@example.com')
     and r.key = 'admin'
   on conflict (user_id, role_id) do nothing;

   -- Confirm
   select p.email, array_agg(r.key order by r.rank) as roles
   from public.user_roles ur
   join public.roles r on r.id = ur.role_id
   join public.profiles p on p.id = ur.user_id
   where lower(p.email) = lower('you@example.com')
   group by p.email;
   ```

   Never hardcode `roles.id`. It is a `smallserial`, so its value depends on insertion order and
   differs between a fresh install and an existing database — look the role up by `key`.

3. Sign in again. `AuthProvider.hydrate` calls `fn_my_role_keys()`, `SessionState.isAdmin` becomes
   true, and `postSignInPath` sends the user to `/admin`.

To add a stylist, grant the role and create the staff extension row:

```sql
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where lower(p.email) = lower('stylist@example.com') and r.key = 'staff'
on conflict (user_id, role_id) do nothing;

insert into public.staff_profiles (user_id, title, headline, is_bookable)
values ('<the same uuid>', 'Senior Braids Artist', 'Knotless and box braids', true);
```

---

## Conventions

- **Frontend contract.** `docs/FRONTEND_CONTRACT.md` is binding for anything under `src/`. One
  default export per page, imports only from the `@/lib/api` barrel, TanStack Query only, cache keys
  only from `qk`, all three visual states on every data-backed screen, and `useSeo` on every public
  page.
- **Money and dates are formatted, never hand-built.** `src/lib/utils/format.ts`
  (`formatNaira`, `formatPriceRange`, `formatDateTime`, `formatDuration`) and
  `public.fn_naira(numeric)` on the server.
- **Errors are normalised once.** `src/lib/supabase/errors.ts` turns PostgREST, RPC and network
  failures into one `ApiError` and scrubs constraint names out of user-facing text.
- **Types mirror the database.** `src/types/index.ts` is hand-written and matches the migrations
  exactly. `npm run supabase:types` writes `src/types/database.generated.ts` if you want the
  generated alternative.

---

## Known gaps at the time of writing

Stated here so nobody has to infer it from the code:

| Area | Status |
| --- | --- |
| Edge Functions (`paystack-initialize`, `bank-transfer-instructions`, notification dispatcher, payment webhook) | **Not implemented.** There is no `supabase/functions/` directory. `src/lib/api/commerce.ts` already calls two of them by name, and the contracts are specified in [04](./04-api-specification.md). |
| Payment webhook handling and `payment_events` writes | **Not implemented.** The table, its unique constraint and its index exist; nothing writes to them. |
| WhatsApp Cloud API | **Planned.** Schema and `fn_notify` opt-in plumbing exist; the sender does not. |
| `pg_cron` schedule registration | **Not registered.** `app_private.housekeeping()` and `app_private.claim_scheduled_jobs()` exist; the `cron.schedule` calls are commented out in `supabase/config.toml`. |
| Supabase Realtime | **Not used.** The client configures the realtime transport but subscribes to no channel. |
| Catalogue image upload | **Service-role only.** `service-images`, `gallery` and `products` buckets have no `storage.objects` policies, so only `requirements`, `applications` and `avatars` are client-writable. |
| `supervisor` role | **Seeded but not enforced.** See [06](./06-rls-and-permissions.md#known-gaps). |
| Mock/fixture mode | **Not implemented.** `env.useMocks` and `configurationNotice()` exist; no data-layer adapter reads them. |
| Photography | Placeholders only. `MediaFrame` renders a deterministic on-brand surface until real images land. `public/og-image.jpg`, `public/apple-touch-icon.png` and the two manifest PNGs are referenced but absent. |
| Route components | Partially built. A placeholder page is a four-line module that renders an empty `<div>`. At the time of writing 22 of 50 remained, mostly under `/account`, `/admin`, `/staff/clients` and `/careers/:slug/apply`. The repository `README.md` has the current count and a command to reproduce it. |
