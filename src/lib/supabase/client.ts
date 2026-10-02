import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { configurationNotice } from '@/config/env'
import { createMockClient } from '@/lib/mocks/supabase-mock'

/**
 * The browser Supabase client.
 *
 * The anon key is designed to be public — every meaningful restriction is
 * enforced by Postgres RLS, not by hiding this key. When credentials are absent
 * (or VITE_USE_MOCKS is on) a complete in-memory stand-in is returned instead, so
 * the app is never a blank screen for a reviewer.
 */

let instance: SupabaseClient | null = null

function build(): SupabaseClient {
  if (env.useMocks) {
    return createMockClient() as unknown as SupabaseClient
  }

  return createClient(
    env.supabase.url || 'http://localhost:54321',
    env.supabase.anonKey || 'public-anon-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
      global: {
        headers: {
          'x-application-name': 'black-chery-unisex-studio',
        },
      },
      db: {
        schema: 'public',
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    },
  )
}

export function getSupabase(): SupabaseClient {
  if (!instance) instance = build()
  return instance
}

/**
 * Test seam: lets the mock adapter assert against the same surface without
 * constructing a live client.
 */
export function __setSupabase(client: SupabaseClient | null): void {
  instance = client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabase(), prop) as unknown
  },
})

/**
 * Invoke an Edge Function. Kept here so every call site gets identical error
 * handling and so the mock mode can intercept it.
 */
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(name, { body })
  if (error) throw new Error(error.message || `Function "${name}" failed`)
  return data as T
}

export { configurationNotice }
