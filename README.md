# Unisex Hair Studio

A premium unisex salon platform for Lagos, Nigeria: service discovery, appointment booking with a
client requirement form, an online boutique for wigs, extensions and hair care, a recruitment
pipeline, and the staff and administrator tools that run the day.

The frontend is a React 18 single-page application. The backend is one Supabase project — Postgres
with row-level security, GoTrue, Storage — and there is no application server. Business rules live in
SQL, not in the browser.

```
React 18 + TypeScript + Vite 6 + Tailwind v4 + TanStack Query
                    │
                    │  PostgREST / Auth / Storage  (JWT in the header)
                    ▼
Supabase: Postgres (47 tables, 91 RLS policies, 42 RPCs) · GoTrue · Storage
```

---

## Features

**Discovery** — service catalogue by category with price bands, durations and aftercare advice;
price and duration variants keyed on length (`knotless-braids` shoulder / bra-back / waist); a public
stylist directory with ratings and portfolios; a published gallery with before/after pairs; CMS pages
and FAQs; full-text and trigram search on services, products and profiles.

**Booking** — a live availability engine that combines location opening hours, per-stylist working
rules, approved time off, blackout dates, per-service and global buffers, a daily booking cap and
transient slot holds, all evaluated in the location's own timezone. Double-booking is prevented by a
GiST exclusion constraint, not by an application check. Requirement capture travels with the booking:
current hair state, desired outcome, allergies, scalp conditions, patch tests, budget, and reference
images in a private storage bucket reached only by the customer and their assigned stylist. Every
transition is legal-graph checked and written to an append-only status history.

**Commerce** — products and variants, an append-only inventory ledger, guest carts that merge into an
account cart on sign-in, coupons with product scoping and redemption limits, server-authoritative
totals with tax-inclusive pricing, atomic checkout with row locking, offline payment capture for cash
and bank transfer, and a Paystack integration path with a webhook idempotency table.

**Recruitment** — vacancies with data-driven screening questions, applications that need no account,
CVs in a private bucket, a partial unique index that makes re-application-after-rejection work
correctly, a pipeline history written by trigger, and candidate self-service withdrawal.

**Notifications** — a single dispatch function that writes an inbox row, fans out to opted-in channels
and enqueues a durable job. Per-type and per-channel preferences, marketing consent, quiet-hours
storage, reminder scheduling at booking time, six message templates, and a `FOR UPDATE SKIP LOCKED`
queue that supports multiple workers.

**Operations** — a role-derived staff diary, a requirements queue, an order fulfilment workflow with
restocking on return, an inventory ledger view, a customer list with lifetime value, an application
pipeline, a revenue dashboard, and an audit log of every recorded decision.

**Platform** — consent-gated analytics with a typed event vocabulary, seven schema.org builders and a
prerendering build step that emits `sitemap.xml`, `robots.txt` and per-route static HTML shells for
crawlers that do not execute JavaScript.

---

## Tech stack

| Choice | Why |
| --- | --- |
| **React 18** | Concurrent rendering and a stable ecosystem; the app is data-bound rather than state-bound, and React Query does the heavy lifting. |
| **TypeScript 5.7, `strict` plus `noUncheckedIndexedAccess`** | The domain model is large and mostly nullable. Making the compiler prove every array access and every possibly-absent field is cheaper than debugging a booking engine. |
| **Vite 6** | Sub-second HMR, first-class `target: 'es2022'`, and `@tailwindcss/vite` for Tailwind v4's zero-config CSS pipeline. |
| **Tailwind v4** | Tokens live in a CSS `@theme` block, so the design system is CSS-first and a restyle is a one-file change. No `tailwind.config.js`. |
| **TanStack Query 5** | Every screen is a server read. Cache keys come from one factory (`qk`) so invalidation cannot drift. `staleTime` is non-zero because a salon catalogue changes hourly, not per focus. |
| **React Router 6** | `createBrowserRouter` with per-route `React.lazy`, so an anonymous visitor never downloads an admin chunk. |
| **Supabase (Postgres + Auth + Storage + RLS)** | One database is the whole authorisation model. 91 policies, 42 RPCs and four column guards in SQL is a reviewable security posture; the same logic in an API server would be thousands of untested lines. |
| **`SECURITY DEFINER` functions as the write path** | Money, stock and state transitions re-authorise inside the function and can be reasoned about transactionally. |
| **PGlite (`@electric-sql/pglite`)** | The migrations execute against a real PostgreSQL 16 engine in-process, so a schema error fails `npm run validate:sql` rather than production. |
| **Zod + react-hook-form** | One validation story for booking requirements, checkout and the application form. |
| **Radix UI** | Dialog, Sheet, Accordion, Select, Tabs and friends give focus trapping, `Escape`, scroll locking and `aria-*` for free. |
| **`class-variance-authority` + `tailwind-merge` + `clsx`** | Variant-driven primitives with conflict-free class merging, via a single `cn()` helper. |
| **date-fns** | Formatting and relative dates, with `en-NG` locale handling in `src/lib/utils/format.ts`. |
| **recharts** | Dashboard charts, split into their own bundle chunk. |
| **lucide-react** | One icon set, tree-shaken, consistently `aria-hidden` when decorative. |
| **sonner** | Toasts, wired to the React Query mutation lifecycle. |
| **@fontsource-variable/fraunces + inter** | Self-hosted variable fonts: no third-party request, no FOIT, and Fraunces' optical-size and wonk axes do the brand work. |

---

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:5173
```

Without credentials the app still boots and tells you it is unconfigured. To run the schema without a
database at all:

```bash
npm run validate:sql            # all 17 migrations against PostgreSQL 16 (WASM)
```

To run against a real Supabase project, apply the migrations in order
(`supabase db push`, or paste each file into the SQL editor), then promote yourself to administrator —
the exact SQL is in [docs/README.md](./docs/README.md#bootstrapping-the-first-administrator) and in
the [runbook](./docs/13-operations-runbook.md#6-bootstrapping-the-first-administrator).

Full setup, cron registration, secrets and the pre-launch checklist:
**[docs/13-operations-runbook.md](./docs/13-operations-runbook.md)**.

---

## Project structure

```
supabase/
  config.toml                  local stack: api, db, auth, storage, edge runtime
  migrations/                  17 files, 5,930 lines — the entire backend
    20250101000001_extensions_and_enums.sql    pg_trgm, 22 enums, app_private
    20250101000002_identity.sql                profiles, roles, staff, settings, audit
    20250101000003_content.sql                 services, gallery, reviews, pages, FAQs
    20250101000004_booking.sql                 hours, rules, time off, appointments
    20250101000005_commerce.sql                products, carts, orders, payments
    20250101000006_recruitment.sql             jobs, applications, events
    20250101000007_notifications.sql           inbox, deliveries, scheduled jobs
    20250101000008_functions_auth.sql          role helpers, fn_handle_new_user
    20250101000009_availability.sql            fn_service_slots + the booking engine
    20250101000010_commerce_engine.sql         inventory, cart, coupon, checkout
    20250101000011_notifications.sql           fn_notify, job queue, dashboard stats
    20250101000012_rls.sql                     views, 91 policies, all grants
    20250101000013_public_rpcs.sql             guest cart, applications, admin transitions
    20250101000014_triggers_storage.sql        triggers, column guards, buckets
    20250101000015_seed.sql                    idempotent reference content
    20250101000016_candidate_selfservice.sql   fn_withdraw_application
    20250101000017_edge_function_support.sql   delivery claiming, service_role grants

scripts/
  validate-sql.mjs             run every migration against PGlite; assert the contract
  generate-seo.mjs             sitemap.xml, robots.txt, per-route prerendered shells
  bootstrap-admin.mjs          promote an existing account to administrator

src/
  App.tsx                      the route table, every page lazily imported
  main.tsx                     providers: Query, Router, Auth, Cart, Toaster
  types/index.ts               hand-written mirror of the database schema
  styles/index.css             Tailwind v4 @theme: the entire design system
  config/                      env.ts (VITE_* reads), site.ts (brand, nav, hours)
  lib/
    supabase/client.ts         the memoised browser client
    supabase/errors.ts         ApiError, error classification, message scrubbing
    api/                       the only place a query is built
      db.ts                    PostgREST/RPC wrappers, filter DSL, error unwrapping
      catalog.ts account.ts booking.ts commerce.ts recruitment.ts admin.ts
    query/                     QueryClient defaults, the qk key factory
    analytics.ts               consent-gated GA4 + Plausible, typed event vocabulary
    utils/                     cn(), formatters
  components/
    ui/                        Button, Field, Badge, Surface, Dialog, Rating, …
    shared/                    ServiceCard, ProductCard, Section, MediaFrame, …
    layout/                    SiteLayout, DashboardLayout, RouteGuards, RouteLoader
    seo/Seo.tsx                useSeo + seven schema.org builders
  features/                    one folder per surface: auth, booking, shop, cart,
                               checkout, careers, account, staff, admin, notifications
  pages/                       the marketing and policy routes

docs/                          the technical documentation set
index.html                     the SPA shell, including a baked HairSalon JSON-LD node
vite.config.ts                 plugins, /functions proxy, vendor chunking
```

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173, with `/functions` proxied to Supabase. |
| `npm run build` | `tsc -b --noEmit` → `vite build` → `npm run seo:generate`. |
| `npm run build:fast` | Typecheck and bundle, skipping the SEO step. |
| `npm run preview` | Serve `dist/`. |
| `npm run typecheck` | `tsc -b --noEmit`. |
| `npm run lint` / `lint:fix` | ESLint 9 flat config. |
| `npm run validate:sql` | Execute all 17 migrations against PGlite and assert the DB/client contract. |
| `npm run seo:generate` | Emit `sitemap.xml`, `robots.txt`, per-route shells and `404.html`. `-- --fetch` queries the live database for dynamic routes first. |
| `npm run supabase:start` / `:stop` / `:reset` | The local Supabase stack. |
| `npm run supabase:types` | Generate `src/types/database.generated.ts` from a running project. |
| `npm run admin:bootstrap -- <email>` | Grant the admin role to an account that has already signed up. |
| `npm run db:reset` | Alias of `supabase db reset`. |

---

## Environment variables

All configuration is `VITE_*` and is inlined into the bundle at build time. **A secret in a `VITE_`
variable is a published secret.** Paystack secret keys, the Supabase service-role key and WhatsApp
tokens belong in Supabase Edge Function environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_APP_URL` | `http://localhost:5173` | Public origin. Baked into canonical URLs, `og:url`, `sitemap.xml` and every `absoluteUrl()` call. |
| `VITE_APP_ENV` | `development` | `production` or `development`; gates the dev-only configuration banner. |
| `VITE_SUPABASE_URL` | — | Project API URL. |
| `VITE_SUPABASE_ANON_KEY` | — | The public anon key. Public by design. |
| `VITE_USE_MOCKS` | `false` | Declares fixture mode. No adapter reads it yet — see below. |
| `VITE_PAYSTACK_PUBLIC_KEY` | — | Public Paystack key. |
| `VITE_PAYSTACK_ENABLED` | `false` | Requires a public key to also be present. |
| `VITE_WHATSAPP_ENABLED` | `false` | Gates the WhatsApp channel in the UI. |
| `VITE_WHATSAPP_PHONE_NUMBER` | `2348000000000` | Used for `wa.me` links. |
| `VITE_GA_MEASUREMENT_ID` | — | GA4 measurement id. |
| `VITE_PLAUSIBLE_DOMAIN` | — | Plausible site domain. |
| `VITE_ENABLE_ANALYTICS` | `false` | Requires at least one analytics id. |
| `VITE_SUPPORT_EMAIL` | `hello@unisexhairstudio.com` | Contact details for the footer and JSON-LD. |
| `VITE_SUPPORT_PHONE` | `+2348000000000` | As above. |

Server-side secrets, deliberately absent from `.env.example` because they must never reach the
bundle: `SUPABASE_SERVICE_ROLE_KEY`, the Paystack secret key, the Paystack webhook secret, the
WhatsApp phone-number id, permanent access token, app secret and template names.

---

## Documentation

Start with **[docs/README.md](./docs/README.md)** — a 60-second orientation, the verified schema
inventory, and the first-administrator bootstrap.

| Document | Covers |
| --- | --- |
| [01 · System architecture](./docs/01-system-architecture.md) | Context and container diagrams, the four surfaces, request lifecycle, trust boundaries, deployment, and every Supabase feature in use. |
| [02 · Database schema](./docs/02-database-schema.md) | All 47 tables by domain, ER diagrams, invariants, the 22 enums, column guards, index strategy, storage buckets. |
| [03 · User flows](./docs/03-user-flows.md) | Seven end-to-end sequences with the permission decision at each step. |
| [04 · API specification](./docs/04-api-specification.md) | Every RPC with signature, return, callers and errors; the client wrapper for each; the PostgREST table surface; Edge Function contracts. |
| [05 · Authentication model](./docs/05-authentication-model.md) | Signup, sessions, refresh, the provisioning trigger, roles as a table, why route guards are UX. |
| [06 · RLS and permissions](./docs/06-rls-and-permissions.md) | The full permission matrix, the `app_private` pattern, why `FORCE RLS` is off, the catalogue views, five known gaps. |
| [07 · Availability and booking engine](./docs/07-availability-and-booking-engine.md) | `fn_service_slots` layer by layer, timezone handling, the three-layer double-booking defence, the status-transition graph. |
| [08 · Commerce and payments](./docs/08-commerce-and-payments.md) | Variants, the inventory ledger, cart merging, coupons, tax-inclusive pricing, the checkout transaction, the Paystack architecture. |
| [09 · Notifications and integrations](./docs/09-notifications-and-integrations.md) | `fn_notify`, opt-in resolution, the durable job queue, reminders, templates, the WhatsApp plan. |
| [10 · SEO and analytics](./docs/10-seo-and-analytics.md) | `useSeo`, the JSON-LD builders, the prerendering build step, the SSR/ISR path, the event vocabulary. |
| [11 · Design system](./docs/11-design-system.md) | Colour, type, spacing, elevation, motion, the component inventory, accessibility, placeholder media. |
| [13 · Operations runbook](./docs/13-operations-runbook.md) | Local development, migrations, seeding, admin bootstrap, providers, secrets, cron, backups, pre-launch checklist. |
| [FRONTEND_CONTRACT.md](./docs/FRONTEND_CONTRACT.md) | The binding rules for anything under `src/`. |

---

## What is implemented vs planned

Snapshot taken while writing the documentation. Page-level status is a moving target: several route
components were being implemented in parallel, so treat the page list as indicative and check the file
before planning work against it. To find the current set of placeholders:

```powershell
Get-ChildItem src -Recurse -Filter *.tsx |
  Where-Object { (Get-Content $_.FullName -Raw).StartsWith('/** Placeholder') } |
  Select-Object FullName
```

At the time of writing, 22 of 50 route components were placeholders and 28 were built: the eight
`/account` pages (overview, appointments, appointment detail, orders, order detail, wishlist, profile,
applications), ten under `/admin` (services, products, product edit, inventory, orders, order detail,
customers, careers, applications, application detail), one under `/staff` (clients), the
notifications inbox, the booking confirmation page, the job-apply form and the email-confirm landing
page.

### Implemented and exercised

| Area | Evidence |
| --- | --- |
| Schema and logic | 17 migrations, 5,930 lines, executing cleanly under `npm run validate:sql`: 47 tables (all RLS-enabled), 91 policies, 42 public functions, 20 private, 28 triggers, 22 enums, 152 indexes. |
| Availability and booking | `fn_service_slots`, `fn_hold_slot`, `fn_create_appointment`, `fn_set_appointment_status`, `fn_cancel_appointment`, `fn_reschedule_appointment`, the exclusion constraint, the transition graph. `BookingPage` (1,076 lines) and its `TimeGrid`, `DateStrip`, `RequirementStep` and `ReferenceUploader` components. |
| Commerce | Cart, coupons, checkout (`CheckoutPage`, 832 lines), success page, offline payment capture, the inventory ledger. |
| Discovery | Home, about, services, service detail, shop, product detail, gallery, contact, policies, search, 404, cart. |
| Auth screens | Sign in, sign up, forgot password, and the provider that backs session handling, roles and password reset. |
| Admin and staff | Dashboard and bookings list are built, with `adminKit` (751 lines), `RevenueChart` and `StockAdjustDialog`. |
| SEO | `useSeo` plus all seven builders, and `generate-seo.mjs` producing sitemap, robots, shells and a 404. |
| Analytics | Consent gate, GA4 + Plausible loaders, 16 typed events, SPA page-view reporting. |
| Design system | 14 primitive files, shared cards and blocks, the full `@theme` token set, reduced-motion handling. |
| Supabase config | `supabase/config.toml` for the local API, database, auth, storage and edge runtime. |
| Service-role surface | Migration 0017 grants `service_role` the named execute and table privileges the Edge Functions need, and revokes the client `insert` on `payments`. |
| Operations tooling | `validate-sql.mjs`, `generate-seo.mjs`, `bootstrap-admin.mjs`. |

### Not implemented

| Area | State |
| --- | --- |
| **Edge Functions** | No `supabase/functions/` directory. `paystack-initialize` and `bank-transfer-instructions` are called by `commerce.ts` and by `CheckoutPage` and will 404. Contracts are specified in [04](./docs/04-api-specification.md#edge-functions). |
| **Payment webhook** | No handler. `payment_events`, `payments.provider_reference` and the idempotency index exist and are unused. |
| **Notification dispatcher** | `fn_notify` and `fn_adjust_stock` enqueue `dispatch_notification` and `low_stock_alert` jobs. Migration 0017 adds the claiming primitives (`claim_notification_deliveries`, `recover_stuck_deliveries`) and the `service_role` grants, but nothing calls them. |
| **`pg_cron` registration** | `housekeeping()` and `claim_scheduled_jobs()` exist; both `cron.schedule` calls are commented out in `config.toml`. Without housekeeping, `booking_holds` grows unbounded. |
| **WhatsApp Cloud API** | Schema, opt-in plumbing and the conversation log exist. The sender does not. |
| **Realtime** | Not used. The client configures the transport; no channel is subscribed. |
| **Realtime role changes** | A role granted mid-session needs a re-hydrate or a sign-in. |
| **MFA, phone OTP** | Not configured. `[auth.sms] enable_signup = false`. |
| **Consent banner** | `setConsent` exists and is correct; no UI calls it, so analytics stays off. |
| **Catalogue media upload** | The three public buckets have no object policies — service_role only, and no admin UI. |
| **Mock/fixture mode** | `env.useMocks` and `configurationNotice()` exist; no data-layer adapter reads them, and the notice's "local fixtures" wording is not yet true. |
| **Type generation** | `npm run supabase:types` works, but nothing imports `src/types/database.generated.ts`; the app uses the hand-written `src/types/index.ts`. |
| **Photography** | Placeholders only. `MediaFrame` renders a deterministic on-brand surface. `public/og-image.jpg`, `public/apple-touch-icon.png`, `icon-192.png` and `icon-512.png` are referenced and absent. |
| **Dynamic routes in the sitemap** | `generate-seo.mjs --fetch` can add service, product and job detail pages; the build script does not pass `--fetch`. |

### Known defects found while documenting

Stated plainly, with the fix location. Each is in [06](./docs/06-rls-and-permissions.md#known-gaps),
[07](./docs/07-availability-and-booking-engine.md#legal-status-transitions) or
[08](./docs/08-commerce-and-payments.md#known-issues).

1. **`supervisor` is seeded but not enforced.** `app_private.is_staff()` tests `['staff','admin']`, so a
   supervisor passes the `/staff` route guard and then reads empty lists. `has_capability()` is defined
   and never called.
2. **A pending appointment cannot be rescheduled.** `fn_reschedule_appointment` accepts `pending`, but
   `fn_set_appointment_status` has no `pending → rescheduled` edge — and web bookings are created
   `pending`.
3. **The cart total exceeds the order total when prices are tax-inclusive.** `fn_cart_totals` adds tax
   unconditionally; `fn_checkout` adds it only when it is exclusive. With the seeded 7.5% inclusive
   tax, a ₦100,000 cart displays ₦107,500 and is charged ₦100,000.
4. **A fully discounted order cannot be placed.** `fn_checkout` inserts a `payments` row with
   `amount = 0` when the total is zero, violating `check (amount > 0)`.
5. **`cost_price` and `tax_rate` are readable by `anon`** through the `products` and `product_variants`
   grant, despite the `product_catalog` view deliberately omitting them.
6. **Review moderation can be bypassed by the author.** Neither `reviews_insert_own` nor
   `reviews_update_own_pending` constrains `status`, so a customer can publish their own review.
7. **`fn_merge_carts` accepts a caller-supplied `p_user_id`** — the only definer function that does, and
   the one place migration 0012's own principle 3 is not upheld.
8. **A stylist can write their own `commission_pct` and `hourly_rate`.** `staff_profiles` has a full
   update grant and no column guard, unlike `profiles`, `appointments`, `orders` and `product_variants`.
9. **`buffer_between_bookings` is advisory only.** It is honoured by the slot grid and absent from
   `appointments.ends_at`, so the exclusion constraint does not see it.
10. **Two `business_settings` gates are inert:** `max_active_bookings_per_customer` and
    `no_show_window_minutes` are read by nothing.
11. **The late-cancellation deposit forfeit is a record, not a charge.** `fn_cancel_appointment` writes
    an `audit_log` row; no money moves.

---

## Licence

Private. All rights reserved.
