/**
 * Executes every migration against a real PostgreSQL 16 engine (PGlite/WASM) so
 * schema errors surface locally instead of in production.
 *
 * Supabase-owned schemas (auth, storage) and roles are stubbed first, because
 * migrations legitimately reference them.
 *
 * PGlite ships no contrib extensions, so the two statements that genuinely
 * need pg_trgm / btree_gist are stripped and reported separately. Everything
 * else — 2,900 lines of DDL, plpgsql and RLS — is executed verbatim.
 *
 * Usage: node scripts/validate-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')

const PREAMBLE = `
-- Supabase platform stubs ---------------------------------------------------
create schema if not exists auth;
create schema if not exists storage;
-- Supabase provisions this schema and installs contrib extensions into it.
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  phone              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- Supabase exposes the caller's id as auth.uid() from the JWT claim.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true), ''
  )::uuid;
$$;

-- storage.objects subset used by the bucket policies
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id) on delete cascade,
  name       text not null,
  owner_id   uuid,
  metadata   jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;
`

const skipped = []

/**
 * Remove only what PGlite cannot execute, recording each omission so the
 * report is honest about what was and was not verified.
 */
function adapt(file, sql) {
  let out = sql

  // Extensions are unavailable in the WASM build.
  out = out.replace(/^\s*create extension[^\n]*\n/gm, () => {
    skipped.push(`${file}: create extension (pg_trgm)`)
    return ''
  })

  // Trigram GIN indexes need the pg_trgm opclass.
  out = out.replace(/create index [^;]*extensions\.gin_trgm_ops[^;]*;/g, () => {
    skipped.push(`${file}: trigram GIN index`)
    return ''
  })

  // The overlap-exclusion constraint needs btree_gist for the uuid equality
  // operator class. Re-checked on real Supabase. Stripped by scanning to the
  // statement's terminating semicolon, which a regex gets wrong (the status list
  // contains nested parens and quotes).
  const excl = out.indexOf('add constraint appointments_no_overlap')
  if (excl !== -1) {
    const stmtStart = out.lastIndexOf('alter table', excl)
    const semi = out.indexOf(';', excl)
    if (stmtStart !== -1 && semi !== -1) {
      out = out.slice(0, stmtStart) + out.slice(semi + 1)
      skipped.push(`${file}: appointments_no_overlap exclusion constraint (btree_gist)`)
    }
  }

  // The comment still refers to a constraint that was stripped.
  out = out.replace(
    /comment on constraint appointments_no_overlap[\s\S]*?;\n/,
    '',
  )

  // on conflict ... where requires a matching partial unique index, which the
  // strip above would otherwise remove for cart merge; none are affected.
  return out
}

const db = new PGlite()
let failures = 0

async function run(label, sql) {
  try {
    await db.exec(sql)
    return true
  } catch (err) {
    const msg = String(err.message ?? err).split('\n')[0]
    console.error(`\n  x ${label}\n    ${msg}`)
    // Surface the offending statement: Postgres reports a character position
    // that maps directly into the script we executed.
    const pos = Number(err.position)
    if (Number.isFinite(pos) && pos > 0) {
      const from = Math.max(0, pos - 200)
      console.error(`    near: …${sql.slice(from, pos + 160).replace(/\s+/g, ' ')}…`)
    }
    failures++
    return false
  }
}

console.log('PGlite - PostgreSQL 16 (WASM)\n')
await run('preamble (supabase stubs)', PREAMBLE)

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  const sql = adapt(file, await readFile(join(migrationsDir, file), 'utf8'))
  const before = failures
  const ok = await run(file, sql)
  console.log(`  ${ok && failures === before ? 'ok' : '!!'} ${file}`)
}

// ---------------------------------------------------------------------------
console.log('\nSchema inventory')
const INVENTORY = [
  ['public tables', `select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`],
  ['RLS-enabled tables', `select count(*)::int c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`],
  ['RLS policies', `select count(*)::int c from pg_policies where schemaname='public'`],
  ['public functions', `select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`],
  ['private functions', `select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private'`],
  ['triggers', `select count(*)::int c from pg_trigger where not tgisinternal`],
  ['enums', `select count(*)::int c from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'`],
  ['indexes', `select count(*)::int c from pg_indexes where schemaname='public'`],
]

for (const [label, sql] of INVENTORY) {
  try {
    const res = await db.query(sql)
    console.log(`  ${label.padEnd(22)} ${res.rows[0].c}`)
  } catch (err) {
    console.error(`  x ${label}: ${err.message}`)
    failures++
  }
}

// ---------------------------------------------------------------------------
// Every RPC the client imports must exist with the right arity.
console.log('\nClient contract')
const CLIENT_FNS = [
  ['fn_service_slots', 6], ['fn_is_slot_available', 5], ['fn_hold_slot', 6],
  ['fn_create_appointment', 11], ['fn_cancel_appointment', 2],
  ['fn_reschedule_appointment', 4], ['fn_set_appointment_status', 3],
  ['fn_get_cart', 1], ['fn_add_to_cart', 3], ['fn_update_cart_item', 2],
  ['fn_remove_cart_item', 1], ['fn_cart_totals', 1], ['fn_apply_cart_coupon', 1],
  ['fn_coupon_preview', 3], ['fn_checkout', 9], ['fn_record_offline_payment', 5],
  ['fn_adjust_stock', 6], ['fn_submit_application', 1],
  ['fn_set_application_status', 5], ['fn_set_order_status', 5],
  ['fn_admin_dashboard_stats', 2], ['fn_my_role_keys', 0],
  ['fn_available_stock', 1], ['fn_notify', 10], ['fn_slugify', 1], ['fn_naira', 1],
  ['fn_get_or_create_cart', 1], ['fn_merge_carts', 2],
]

const missing = []
for (const [fn, arity] of CLIENT_FNS) {
  const res = await db.query(
    `select count(*)::int as c, coalesce(max(p.pronargs), 0) as n
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = $1`,
    [fn],
  )
  if (res.rows[0].c === 0) missing.push(`${fn} (absent)`)
  else if (res.rows[0].n !== arity) missing.push(`${fn} (arity ${res.rows[0].n}, expected ${arity})`)
}
if (missing.length) {
  console.error(`  x contract drift: ${missing.join(', ')}`)
  failures++
} else {
  console.log(`  ok all ${CLIENT_FNS.length} client RPCs present with matching arity`)
}

// Public catalogue views must resolve the columns the UI selects.
console.log('\nView contracts')
const VIEWS = [
  ['staff_public', 'user_id, full_name, title, photo_url, rating_avg'],
  ['service_catalog', 'id, slug, name, duration_minutes, price_from, category_slug'],
  ['product_catalog', 'id, slug, name, variant_id, variant_price, available_stock'],
]
for (const [view, cols] of VIEWS) {
  try {
    await db.query(`select ${cols} from public.${view} limit 0`)
    console.log(`  ok ${view}`)
  } catch (err) {
    console.error(`  x ${view}: ${err.message}`)
    failures++
  }
}

// The availability engine must compile and execute.
try {
  const res = await db.query(
    `select * from public.fn_service_slots(gen_random_uuid(), gen_random_uuid(), current_date)`,
  )
  console.log(`\n  ok fn_service_slots executes (${res.rows.length} rows for unknown service)`)
} catch (err) {
  console.error(`\n  x fn_service_slots: ${err.message}`)
  failures++
}

// RLS must be on every public table.
const exposed = await db.query(`
  select c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
`)
if (exposed.rows.length) {
  console.error(`  x tables without RLS: ${exposed.rows.map((r) => r.relname).join(', ')}`)
  failures++
} else {
  console.log('  ok every public table has RLS enabled')
}

if (skipped.length) {
  console.log('\nNot verifiable under PGlite (require real Supabase extensions):')
  for (const s of [...new Set(skipped)]) console.log(`  - ${s}`)
}

console.log(`\n${failures ? `FAILED - ${failures} failure(s)` : 'PASSED - 0 failures'}`)
await db.close()
process.exit(failures ? 1 : 0)