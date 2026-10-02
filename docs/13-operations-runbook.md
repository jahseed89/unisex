# 13 · Operations runbook

Everything needed to take this repository from a clone to a running salon platform, and the list of
things that must be done before real customers arrive. Paths are relative to the repository root.

---

## 1 · Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node | ≥ 20.11 (`engines` in `package.json`) | build and dev server |
| npm | ≥ 10 | dependency install |
| Supabase CLI | latest | local stack, `db reset`, type generation |
| Docker Desktop | any recent | the local Supabase stack only |
| `@electric-sql/pglite` | in `devDependencies` | `npm run validate:sql` — no Docker needed |

Docker was not available in the environment this project was built in, which is why the migrations are
verified against a real PostgreSQL 16 engine in-process instead. `supabase/config.toml` records that
fact in a comment.

```bash
npm install
```

---

## 2 · Local development without a database

```bash
cp .env.example .env.local
npm run dev            # http://localhost:5173
```

`src/config/env.ts` treats the `.env.example` placeholders as "not configured"
(`supabaseUrl.includes('your-project-ref')`), so with no credentials `env.useMocks` is `true` and
`configurationNotice()` explains the state. In development `App.tsx` renders that notice as a
dismissible-looking card in the corner.

Two honest caveats about mock mode:

- **There is no mock adapter.** `env.useMocks` and `configurationNotice()` exist, but no module under
  `src/lib/api` reads them, so the app will attempt real Supabase calls against
  `http://localhost:54321` and fail at the network layer. The notice tells a reviewer that "data is
  local fixtures", which is not yet true. Either start the local stack or accept a console full of
  failed requests while working on layout.
- `vite.config.ts` proxies `/functions` to `VITE_SUPABASE_URL` (or `127.0.0.1:54321`) so Edge
  Function calls avoid CORS in development.

Other useful scripts:

```bash
npm run typecheck        # tsc -b --noEmit
npm run lint             # eslint .
npm run lint:fix
npm run build:fast       # typecheck + vite build, skips the SEO step
npm run preview          # serve dist/
```

The TypeScript configuration is strict beyond the default: `noUnusedLocals`, `noUnusedParameters`,
`noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch` are all on, and `noUncheckedIndexedAccess`
is why the codebase is full of `entries[0]!` and `sorted[i - 1] as number`. Do not silence them.

---

## 3 · Local Supabase stack

```bash
npm run supabase:start      # supabase start
npm run supabase:reset      # replays every migration, then the seed
npm run supabase:stop
```

`supabase/config.toml` configures:

| Section | Setting | Note |
| --- | --- | --- |
| `project_id` | `black-chery-unisex-studio` | |
| `[api]` | port 54321, `max_rows = 1000`, `extra_search_path = ["public","extensions"]` | |
| `[db]` | port 54322, **major_version 15** | Supabase currently runs Postgres 15; PGlite verification uses 16. Nothing in the migrations is version-specific beyond `gen_random_uuid()` being core since 13. |
| `[realtime]` | enabled | The app subscribes to no channel. |
| `[storage]` | 50 MiB default | Buckets and their policies come from migration 0014, not from this file, so local and hosted match exactly. |
| `[auth]` | `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, `reuse_interval = 10`, `site_url` and two localhost redirect URLs | |
| `[auth.email]` | `double_confirm_changes = true`, `enable_confirmations = false` | Local signups get a session immediately. |
| `[auth.sms]` | `enable_signup = false` | The `updateUser({ phone })` call in `signUp` is a no-op locally. |
| `[auth.external.google]` | disabled, credentials from env | See §6. |
| `[edge_runtime]` | enabled, `policy = "per_worker"` | Nothing is deployed there yet. |
| `[analytics]` | disabled | Site analytics are GA4/Plausible in the browser. |

After `supabase start`, copy the printed values into `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Verifying the schema with no database

```bash
npm run validate:sql
```

`scripts/validate-sql.mjs` stubs `auth`, `storage` and the `anon` / `authenticated` / `service_role`
roles, then executes all seventeen migrations verbatim against PGlite (PostgreSQL 16 compiled to
WebAssembly) and reports:

```
  public tables          47
  RLS-enabled tables     47
  RLS policies           91
  public functions       42
  private functions      20
  triggers               28
  enums                  22
  indexes                152

  ok all 28 client RPCs present with matching arity
  ok staff_public / service_catalog / product_catalog
  ok fn_service_slots executes (0 rows for unknown service)
  ok every public table has RLS enabled
PASSED - 0 failures
```

It fails the process (exit 1) on any migration error, any missing or re-arityed client RPC, an
unresolvable view column, or a table without RLS. Three things it cannot verify are printed
explicitly and must be checked against a real project, because PGlite has no contrib extensions:

- `create extension pg_trgm` (migration 0001);
- the three trigram GIN indexes — `profiles_fullname_trgm`, `services_name_trgm`, `products_name_trgm`;
- the `appointments_no_overlap` exclusion constraint, which needs `btree_gist` (migration 0004).

A one-line check on a real project:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'appointments_no_overlap';
-- EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
--   WHERE (staff_id IS NOT NULL AND status = ANY (ARRAY[...]))
```

---

## 4 · Connecting a hosted Supabase project

1. Create a project at [supabase.com](https://supabase.com) and wait for the database to be ready.
2. Note the project ref and the API keys (Project Settings → API). The **anon** key goes in
   `.env.local`; the **service_role** key never does — it belongs in Edge Function environment
   variables or your shell, never in a `VITE_` variable.
3. Apply the migrations in filename order. Either:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push                 # applies everything not yet on the remote
   ```

   or paste each file into the SQL editor, in order, 0001 → 0016. They are idempotent-safe in the
   sense that they were designed to be applied once to an empty database, with `on conflict` guards in
   the seed; applying the seed twice is a no-op.
4. Confirm the result:

   ```sql
   select count(*) from pg_policies where schemaname = 'public';                      -- 91
   select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE';                    -- 47
   select count(*) from storage.buckets;                                              -- 6
   select proname, count(*) over () from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private';                                                 -- 20
   select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;         -- 0 rows
   ```

5. Generate database types if you want the alternative to the hand-written types:

   ```bash
   npm run supabase:types     # writes src/types/database.generated.ts
   ```

   The application uses `src/types/index.ts`, which is hand-written and mirrors the schema exactly.
   `database.generated.ts` is not in the repository and nothing imports it; the file's header explains
   that regenerating it is a deliberate act, and that the hand-written view/row aliases at the bottom
   should be kept.

---

## 5 · Seeding and reference data

Migration `20250101000015_seed.sql` is idempotent and runs with the migrations. It creates:

| Content | Detail |
| --- | --- |
| Roles | `customer`, `staff`, `supervisor`, `admin` with capabilities and ranks |
| Location | Black Chery Unisex Studio — Victoria Island, `12 Adeola Odeku Street`, `Africa/Lagos`, primary |
| Opening hours | Mon–Thu 09:00–19:00, Fri 09:00–20:00, Sat 10:00–20:00, Sunday closed |
| Business settings | Naira, 7.5% tax (inclusive), 4h lead time, 60-day horizon, 24h cancellation, 2.5k delivery fee over a 75k free threshold |
| 7 service categories | braids, locs, haircuts, colour, styling, treatments, wig services |
| 17 services | with durations, buffers, price bands, includes and aftercare |
| 14 service variants | keyed on length (knotless-braids shoulder/bra-back/waist, balayage partial/full/full-plus, …) |
| 4 product categories | wigs, extensions, hair care, styling tools |
| 10 products | 2 wigs, 3 extensions, 3 hair care, 1 styling tool, 1 accessory, with hair attributes |
| 12 product variants | 7 size and length SKUs (bundle single/three, curly single/three, HD frontal, bob `std`, full-lace `20in`), plus a generated `default` variant for the 5 single-SKU products |
| 2 coupons | `WELCOME10` (10% up to ₦20,000 over ₦25,000), `FREESHIP` |
| 3 vacancies | Senior Braids Artist (2 openings), Colourist, Front Desk Associate — with `screening_questions` |
| 9 FAQs | booking, shop and careers questions |
| 6 message templates | confirmation, 24h and 2h reminders, order confirmation, order ready, application received |

The seed deliberately creates **no user accounts and no admin**. See §6.

**Stock and prices are demonstration data.** Every seeded `stock_on_hand` is fictional. Before taking
real orders, reconcile the catalogue and set real prices; the money in the seed is not the studio's
price list.

---

## 6 · Bootstrapping the first administrator

`auth.users` is owned by GoTrue, so a migration cannot create the first administrator. Sign up through
the app, then promote the account.

```bash
# 1. Sign up at /auth/sign-up and confirm the email.
# 2. Promote:
npm run admin:bootstrap -- you@example.com
```

`scripts/bootstrap-admin.mjs` resolves the profile by email and the role by `key`, then inserts into
`user_roles`. It uses the anon key by default and needs a key that can write to `user_roles` — which
only an admin or `service_role` can do, so the first promotion needs the service-role key:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> npm run admin:bootstrap -- you@example.com
# or
node scripts/bootstrap-admin.mjs you@example.com --service_role
```

Without a usable key it prints the SQL to paste into the Supabase SQL editor (that session bypasses
RLS):

```sql
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where lower(p.email) = lower('you@example.com') and r.key = 'admin'
on conflict (user_id, role_id) do nothing;

select p.email, array_agg(r.key order by r.rank) as roles
from public.user_roles ur
join public.roles r on r.id = ur.role_id
join public.profiles p on p.id = ur.user_id
where lower(p.email) = lower('you@example.com')
group by p.email;
```

Never hardcode `roles.id` — it is a `smallserial` whose value depends on insertion order.

Then add stylists, each of whom also needs a `staff_profiles` row before they appear on any calendar:

```sql
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where lower(p.email) = lower('stylist@example.com') and r.key = 'staff'
on conflict (user_id, role_id) do nothing;

insert into public.staff_profiles (user_id, slug, title, headline, is_bookable, max_daily_bookings)
values ('<uuid>', 'ada-okafor', 'Senior Braids Artist', 'Knotless and box braids', true, 8);

-- and give them a capability map, or every service will offer them
insert into public.staff_services (staff_id, service_id) values ('<uuid>', '<service-id>');
```

And the working rules, or they will not appear in `fn_service_slots`:

```sql
insert into public.staff_availability_rules (staff_id, weekday, starts_at, ends_at)
select '<uuid>', d, '09:00', '19:00' from generate_series(1, 6) d;
```

---

## 7 · Auth providers

| Setting | Where | Value |
| --- | --- | --- |
| Site URL | Authentication → URL Configuration | `https://blackcheryunisexstudio.com` |
| Redirect URLs | Authentication → URL Configuration | `https://blackcheryunisexstudio.com/auth/confirm`, `https://blackcheryunisexstudio.com/auth/reset-password`, plus `http://localhost:5173/…` for development |
| Email confirmations | Authentication → Providers → Email | Enable for production. `supabase/config.toml` disables it locally. |
| Password policy | Authentication → Providers → Email | `AuthProvider.mapAuthMessage` already handles the "at least N characters" message. |
| Google OAuth | Authentication → Providers → Google | Add client id and secret; set the callback to `https://<project-ref>.supabase.co/auth/v1/callback`. `AuthProvider.signInWithGoogle` already redirects to `/auth/confirm`. |
| Rate limits | Authentication → Rate Limits | The anonymous application endpoint in `fn_submit_application` is capped at 3 per email per 24h in the database, but GoTrue sign-in itself also needs limits against credential stuffing. |
| MFA | Authentication → MFA | Not implemented in the client. Worth enabling for accounts with the `admin` role. |

After enabling confirmations, the email templates Supabase sends are the default ones. Replace at least
the confirmation and recovery templates: the brand, the support address and the WhatsApp fallback
number are all in `src/config/site.ts` and should match.

---

## 8 · Storage

Buckets and their object policies are created by migration 0014, so nothing needs to be done by hand.
They exist after the migrations:

| Bucket | Public | Client-writable? |
| --- | --- | --- |
| `service-images` | yes | No — no object policies; service_role only |
| `gallery` | yes | No |
| `products` | yes | No |
| `requirements` | no | Yes: the owner, under `{user_id}/{requirement_id}/` |
| `applications` | no | Yes: any authenticated user; owner or staff can read |
| `avatars` | yes | Yes, folder-scoped |

Two operational notes:

- **Catalogue media has to be uploaded through the service role** (a script, a cron job, or a temporary
  SQL session using `storage.objects`). There is no admin upload UI, and no policy that would allow
  one. If you want an in-app uploader, add an admin-scoped `insert` policy on those three buckets.
- **Check the CDN cache policy for the public buckets.** They are read by URL, so a re-uploaded file at
  the same path may be served stale. Use versioned paths, or a short `Cache-Control`.

---

## 9 · Paystack

| Item | Where | Notes |
| --- | --- | --- |
| `VITE_PAYSTACK_PUBLIC_KEY` | `.env.local` / hosting build env | Public. Starts with `pk_test_` or `pk_live_`. |
| `VITE_PAYSTACK_ENABLED` | build env | `true` only when a public key is also present (`env.payments.enabled`). |
| Secret key | **Edge Function secret** | Never a `VITE_` variable. |
| Webhook secret | **Edge Function secret** | Needed to verify `x-paystack-signature`. |
| Webhook URL | Paystack dashboard | `https://<project-ref>.supabase.co/functions/v1/paystack-webhook` |

The functions to build are specified in
[04 · Edge Functions](./04-api-specification.md#edge-functions). Until they exist, the "Pay now" button
on `CheckoutPage` throws, and the offline paths (cash, POS, bank transfer) work because they go through
`fn_record_offline_payment` with no provider involved.

A safe first configuration is to leave `VITE_PAYSTACK_ENABLED=false` and take cash and bank transfer
only. That path is complete today: `fn_record_offline_payment` handles cash, POS, bank transfer and
Moniepoint, auto-confirms a fully paid order, and writes an `audit_log` row.

---

## 10 · WhatsApp Business Cloud API

| Item | Where | Notes |
| --- | --- | --- |
| `VITE_WHATSAPP_PHONE_NUMBER` | build env | Public. Used by `whatsappLink()` for `wa.me` deep links and `analytics.whatsappClick`. |
| `VITE_WHATSAPP_ENABLED` | build env | Gates the channel in the UI. |
| Phone number id | **Edge Function secret** | |
| Permanent access token | **Edge Function secret** | |
| App secret | **Edge Function secret** | For webhook signature verification. |
| Business account id | **Edge Function secret** | |
| Message template names | **Edge Function secret** | Must match Meta-approved templates. |
| Webhook | Meta → `/functions/v1/whatsapp-webhook` | Inbound messages and delivery receipts. |

Prerequisites outside this repository: a verified business account, an approved app, and **message
templates approved by Meta**. Approval takes hours to days and is the long pole. The templates in
`message_templates` (`order.ready` on WhatsApp, `appointment.reminder_24h` / `_2h` on email and SMS)
are the content to submit.

Remember the 24-hour window: free-form replies only inside 24 hours of the customer's last inbound
message. Outside it, a template is mandatory. The plan is in
[09 · WhatsApp Cloud API](./09-notifications-and-integrations.md#whatsapp-cloud-api-planned).

---

## 11 · Cron jobs

`pg_cron` must be enabled (Supabase → Database → Extensions → `pg_cron`) and the two schedules
registered by an operator. The statements are in `supabase/config.toml`, commented out, so they are
easy to find:

```sql
-- Every 10 minutes: purge expired holds, finished and exhausted jobs, expired notifications
select cron.schedule(
  'uhs-housekeeping', '*/10 * * * *',
  $$select app_private.housekeeping();$$
);

-- Every minute: claim due jobs for a worker
select cron.schedule(
  'uhs-dispatch-notifications', '* * * * *',
  $$select app_private.claim_scheduled_jobs('pg_cron', 50);$$
);
```

Both functions are `SECURITY DEFINER` in `app_private`, and `cron.schedule` runs as the database owner,
so no grant is needed. Migration 0017 grants the same functions, plus
`claim_notification_deliveries` and `recover_stuck_deliveries`, to `service_role` for the Edge Function
worker. To inspect or change them:

```sql
select jobid, schedule, command, active from cron.job where jobname like 'uhs-%';
select cron.unschedule('uhs-housekeeping');
```

What each is for:

| Job | Cadence | Effect |
| --- | --- | --- |
| `uhs-housekeeping` | 10 min | The only thing bounding `booking_holds`, `scheduled_jobs` and expired `notifications`. Without it all three grow forever. |
| `uhs-dispatch-notifications` | 1 min | Claims due rows with `FOR UPDATE SKIP LOCKED`. **The claim result is discarded**, so today it only proves the queue drains; wiring it to an Edge Function (via `pg_net`, or a long-running worker) is the next step. |

A third schedule is worth adding once a low-stock notifier exists: `low_stock_alert` jobs are enqueued
by `fn_adjust_stock` and are also only claimed, not handled.

Also worth scheduling: `purge_expired_holds()` on its own if you would rather not run the full
housekeeping function every ten minutes.

---

## 12 · Backups and recovery

| Asset | Where it lives | Backup story |
| --- | --- | --- |
| Postgres | Supabase managed | Point-in-time recovery and daily backups are project settings (Plan → Database → Backups). Verify a restore in staging before launch. |
| Uploaded media | Supabase Storage | Backed up separately. Migrations store only paths, so a database restore without the matching objects leaves `requirement_media` and `cv_path` pointing at nothing. The `avatars`, `gallery`, `service-images` and `products` buckets are also the site's photography and are the hardest to recreate. |
| Application | This repository | Version-controlled. `dist/` is not — it is a build artifact and `.gitignore`d. |
| Migrations | This repository | The schema's source of truth. Never edit an applied migration; add a new one, as migration 0016 does. |

A quarterly rehearsal is worth the hour: restore last night's backup into a scratch project, run
`npm run supabase:types` against it, and confirm the counts (`47` tables, `91` policies) and the three
trigram indexes and the exclusion constraint exist.

---

## 13 · Deployment

```bash
npm run build          # tsc -b --noEmit && vite build && npm run seo:generate
```

`vite build` writes `dist/`; `npm run seo:generate` then reads `dist/index.html` and adds
`sitemap.xml`, `robots.txt`, `404.html` and one prerendered shell per indexable route. Running the SEO
step before the bundler would find no `index.html` and skip prerendering, which is why the order in the
script matters.

Hosting requirements:

- Serve `dist/` as the web root.
- Rewrite extensionless paths to `/index.html` so client-side routes resolve. The prerendered shells
  mean the indexable routes are already real files, but `/staff`, `/account` and `/admin` are not.
- `VITE_APP_URL` must be the public origin. It is baked into canonical URLs, `og:url`, `sitemap.xml`
  and every `absoluteUrl()` call, and a wrong value produces a site that canonicalises to itself.
- Long-lived immutable caching for `/assets/*` (they are content-hashed), short caching for
  `index.html` and the per-route shells.
- `404.html` should be the host's not-found document.

To include dynamic detail pages in the sitemap, run the generator with database credentials in CI:

```bash
node scripts/generate-seo.mjs --fetch    # writes scripts/seo-routes.generated.json
node scripts/generate-seo.mjs            # subsequent runs consume it
```

---

## 14 · Pre-launch checklist

**Blocking — the product does not work without these**

- [ ] All seventeen migrations applied to production; `47` tables, `91` policies, `22` enums,
      `42` public functions, `20` private.
- [ ] The exclusion constraint and the three trigram GIN indexes exist (PGlite cannot prove them).
- [ ] `salon_locations`, `location_hours`, `staff_availability_rules`, `staff_time_off`,
      `blackout_dates` and `business_settings` reflect the real studio: real hours, real tax
      treatment, real lead time and cancellation window.
- [ ] `business_settings` contact details and `src/config/site.ts` agree — phone, WhatsApp, address,
      social handles. They are two separate sources of truth today.
- [ ] Real services, prices, durations and buffers; real products, variants, SKUs, prices and stock.
- [ ] `pg_cron` schedules registered (§11). Without housekeeping, `booking_holds` grows unbounded.
- [ ] At least one administrator, at least two bookable stylists, each with a `staff_profiles` row,
      working hours and `staff_services` capability rows.
- [ ] The two price/total inconsistencies resolved before any real money changes hands: the
      `fn_cart_totals` tax-inclusive total ([08 § Known issues](./08-commerce-and-payments.md#known-issues)),
      and the zero-total `payments` insert.
- [ ] `pending → rescheduled` decided: either add the edge to
      `fn_set_appointment_status` or narrow `fn_reschedule_appointment` to `confirmed`
      ([07](./07-availability-and-booking-engine.md#legal-status-transitions)).
- [ ] `supervisor` either wired into `app_private.is_staff()` or removed from the seed and the route
      guard ([06](./06-rls-and-permissions.md#known-gaps)).
- [ ] `products` / `product_variants` removed from the `anon` grant list, or `cost_price` accepted as
      public ([06](./06-rls-and-permissions.md#known-gaps)).
- [ ] `public/og-image.jpg`, `public/apple-touch-icon.png`, `public/icon-192.png` and
      `public/icon-512.png` added. Social previews and the install manifest are broken without them.
- [ ] Every route in `App.tsx` that still renders a placeholder component is implemented, or the route
      table is trimmed to what exists. A placeholder is a four-line module whose only export is
      `return <div className="container-page py-20" />`; find them with:

      ```powershell
      Get-ChildItem src -Recurse -Filter *.tsx | Where-Object {
        (Get-Content $_.FullName -Raw).StartsWith('/** Placeholder')
      } | Select-Object FullName
      ```

      The count at the time of writing was 22, concentrated in `/account`, `/admin`, `/staff/clients`,
      `/careers/:slug/apply` and the notifications inbox. See the status section in the repository
      `README.md`.
- [ ] `npm run typecheck` and `npm run lint` clean; `npm run validate:sql` reports 0 failures.

**Payments**

- [ ] `paystack-initialize` deployed and the webhook URL registered with Paystack.
- [ ] Webhook signature verification implemented and tested against a replayed event.
- [ ] `payment_events` written and a retry confirmed to be a no-op.
- [ ] Decision made about late-cancellation deposit forfeits: currently an `audit_log` row a human
      must action ([07](./07-availability-and-booking-engine.md#the-late-cancellation-deposit-rule)).
- [ ] Offline payment path rehearsed end to end: cash, POS, bank transfer, partial payment, refund.

**Messaging and notifications**

- [ ] Notification dispatcher Edge Function deployed and `uhs-dispatch-notifications` pointed at it.
- [ ] Transactional email templates replaced with branded copy; sending domain verified (SPF, DKIM,
      DMARC).
- [ ] Quiet hours implemented, or the preference removed from the profile screen.
- [ ] WhatsApp templates submitted and approved, or the channel switched off in
      `business_settings`.

**Security**

- [ ] `SUPABASE_SERVICE_ROLE_KEY`, the Paystack secret and any WhatsApp token confirmed absent from the
      built bundle: `grep -r "<the key fragment>" dist/`.
- [ ] MFA enabled for administrator accounts.
- [ ] `audit_log` reviewed for anything unexpected; consider an alert on repeated
      `payment.recorded` or `appointment.late_cancellation` rows.
- [ ] A decision recorded on `FORCE ROW LEVEL SECURITY` ([06](./06-rls-and-permissions.md#why-force-row-level-security-is-deliberately-not-used)):
      the current model trusts the owner role completely.

**Product**

- [ ] Legal pages published at `/policies/privacy`, `/policies/terms`, `/policies/bookings` and
      reviewed by whoever owns the salon. They are CMS rows, not files.
- [ ] Photos shot and uploaded, or the placeholder strategy accepted deliberately.
- [ ] WhatsApp number, address, parking note and opening hours verified against Google Business
      Profile — that, not this site, drives most local discovery.
- [ ] Analytics consent banner implemented. Analytics is currently dormant because nothing calls
      `setConsent` ([10](./10-seo-and-analytics.md#known-gaps)).
- [ ] Point-in-time recovery enabled and a restore rehearsed (§12).
