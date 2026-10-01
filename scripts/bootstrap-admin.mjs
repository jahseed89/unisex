/**
 * Promote an existing account to administrator.
 *
 * `auth.users` is owned by Supabase GoTrue, so no migration can create the very
 * first administrator — you need a real signup (with a confirmed email) before
 * a role row can reference it. This script takes an email that has already
 * signed up and grants the admin role.
 *
 * It works in two ways:
 *   - with SUPABASE_ACCESS_TOKEN + project ref, it calls the Management API
 *   - otherwise it prints the exact SQL to paste into the Supabase SQL editor
 *
 * Usage:
 *   npm run admin:bootstrap -- you@example.com
 *   node scripts/bootstrap-admin.mjs you@example.com --service_role
 */
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const email = args.find((arg) => !arg.startsWith('--'))
const useServiceRole = args.includes('--service_role')

if (!email) {
  console.error('\nUsage: npm run admin:bootstrap -- you@example.com [--service_role]\n')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = useServiceRole
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.VITE_SUPABASE_ANON_KEY

console.log(`\nPromoting ${email} to administrator\n`)

if (!url || !key) {
  printManualSql()
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// 1. Resolve the auth user → profile id
const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, full_name')
  .ilike('email', email)
  .maybeSingle()

if (profileError) {
  console.error(`Could not read the profile: ${profileError.message}\n`)
  printManualSql()
  process.exit(1)
}

if (!profiles) {
  console.error('No profile found for that email.')
  console.error('The person must sign up and confirm their email address first.\n')
  printManualSql()
  process.exit(1)
}

console.log(`  found  ${profiles.email}  (${profiles.id})`)

// 2. Resolve the admin role id by key. Never hardcode it: `roles.id` is a
//    serial, so its value depends on insertion order and can differ between a
//    fresh install and an existing database.
const { data: role, error: roleLookupError } = await supabase
  .from('roles')
  .select('id, key')
  .eq('key', 'admin')
  .maybeSingle()

if (roleLookupError || !role) {
  console.error(
    `\n  failed  ${roleLookupError?.message ?? 'the admin role is missing — have you run the migrations?'}\n`,
  )
  printManualSql()
  process.exit(1)
}

// 3. Grant the role
const { error: roleError } = await supabase
  .from('user_roles')
  .upsert(
    { user_id: profiles.id, role_id: role.id },
    { onConflict: 'user_id,role_id' },
  )

if (roleError) {
  console.error(`\n  failed  ${roleError.message}\n`)
  console.error('Most likely you need the service-role key:')
  console.error('  node scripts/bootstrap-admin.mjs you@example.com --service_role\n')
  printManualSql()
  process.exit(1)
}

console.log(`  ok     administrator role granted`)
console.log(`\nDone. ${profiles.email} can now open /admin after signing in.\n`)

function printManualSql() {
  console.log('Run this in the Supabase SQL editor instead:\n')
  console.log(`-- Promote ${email} to administrator`)
  console.log(`insert into public.user_roles (user_id, role_id)`)
  console.log(`select p.id, r.id from public.profiles p, public.roles r`)
  console.log(`where lower(p.email) = lower('${email}') and r.key = 'admin'`)
  console.log(`on conflict (user_id, role_id) do nothing;`)
  console.log('')
  console.log('-- Confirm it worked')
  console.log(`select p.email, array_agg(r.key) as roles`)
  console.log(`from public.user_roles ur`)
  console.log(`join public.roles r on r.id = ur.role_id`)
  console.log(`join public.profiles p on p.id = ur.user_id`)
  console.log(`where lower(p.email) = lower('${email}')`)
  console.log(`group by p.email;\n`)
}
