import type { SessionState } from '@/types'

/**
 * Redirect helpers shared by every `/auth/*` screen.
 *
 * `RequireAuth` and `RequireAccount` (see `components/layout/RouteGuards`) park
 * the interrupted location in `location.state.from`, so the shape is read once
 * here rather than being re-invented on five pages.
 */

interface AuthRedirectState {
  from?: string | { pathname?: string; search?: string; hash?: string } | null
  reason?: string
}

/** Narrow the router's untyped `location.state`. */
export function authRedirectState(state: unknown): AuthRedirectState {
  return state && typeof state === 'object' ? (state as AuthRedirectState) : {}
}

/**
 * The path to return to after authenticating, or `null` when there is none.
 *
 * Anything inside `/auth` is discarded — bouncing a signed-in visitor back to
 * the sign-in form would loop.
 */
export function returnPath(state: unknown): string | null {
  const from = authRedirectState(state).from
  if (!from) return null

  const path =
    typeof from === 'string' ? from : `${from.pathname ?? '/'}${from.search ?? ''}${from.hash ?? ''}`

  if (!path.startsWith('/') || path.startsWith('/auth')) return null
  return path
}

/** Where a successfully authenticated session belongs. */
export function destinationFor(session: SessionState, state: unknown): string {
  return returnPath(state) ?? roleHome(session)
}

/** Role-aware landing page, mirroring `postSignInPath` in the data layer. */
export function roleHome(session: SessionState): string {
  if (session.isAdmin) return '/admin'
  if (session.isStaff) return '/staff'
  return '/account'
}

/**
 * Google sign-in is opt-in because the provider has to be enabled per Supabase
 * project. Without the flag the button is hidden rather than left to fail.
 */
export function isGoogleAuthEnabled(): boolean {
  return import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true'
}
