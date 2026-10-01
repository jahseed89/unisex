/**
 * Shared Edge Function bootstrap: a service-role Supabase client and a
 * consistent error envelope.
 *
 * Every function here runs with the service role, which bypasses RLS. That is
 * deliberate — these are trusted server-side entry points — so each handler must
 * re-derive the caller's identity from their JWT rather than trusting request
 * body fields.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Service-role client. Never expose this outside the function runtime. */
export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface CallerIdentity {
  userId: string
  email: string | null
  roles: string[]
}

/**
 * Resolve the caller from the Authorization bearer token.
 * Returns null when the token is missing or invalid.
 */
export async function identify(request: Request): Promise<CallerIdentity | null> {
  const header = request.headers.get('Authorization')
  if (!header) return null

  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) return null

  // Verify through GoTrue rather than decoding locally, so the signature is
  // checked and we never trust an unverified payload.
  const { data, error } = await admin().auth.getUser(token)
  if (error || !data.user) return null

  const user = data.user

  // Roles are read directly rather than through fn_my_role_keys(): that function
  // resolves auth.uid(), which is always null for the service-role client.
  const { data: roleRows } = await admin()
    .from('user_roles')
    .select('roles:role_id ( key )')
    .eq('user_id', user.id)

  const keys = (roleRows ?? [])
    .map((row) => {
      const roles = row.roles as unknown
      if (Array.isArray(roles)) return (roles[0] as { key?: string } | undefined)?.key
      return (roles as { key?: string } | null)?.key
    })
    .filter((key): key is string => Boolean(key))

  return { userId: user.id, email: user.email ?? null, roles: keys }
}

/** Uniform error envelope, so the client can surface something actionable. */
export function fail(
  message: string,
  status = 400,
  code?: string,
): { error: string; code?: string; status: number } {
  return code ? { error: message, code, status } : { error: message, status }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/** Parse a JSON body, returning null rather than throwing. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
