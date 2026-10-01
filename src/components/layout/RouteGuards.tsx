import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import type { RoleKey } from '@/types'
import { Button } from '@/components/ui'

/**
 * Route guards.
 *
 * These exist to give a good experience and keep clients out of screens they
 * cannot use — they are *not* a security boundary. Every protected query is
 * already constrained by RLS, so bypassing a guard reveals layout, never data.
 */

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-[var(--animate-spin-slow)] text-bronze" aria-hidden />
      <span className="sr-only">Checking your session</span>
    </div>
  )
}

/** Requires an authenticated session; otherwise redirects to sign-in. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageSpinner />

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/auth/sign-in" state={{ from: location }} replace />
  }

  return <>{children}</>
}

/** Requires any of the listed roles; otherwise returns them to their own home. */
export function RequireRole({ roles, children }: { roles: RoleKey[]; children: React.ReactNode }) {
  const { isAuthenticated, isLoading, roles: userRoles } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageSpinner />

  if (!isAuthenticated) {
    return <Navigate to="/auth/sign-in" state={{ from: location }} replace />
  }

  const permitted = roles.some((role) => userRoles.includes(role))

  if (!permitted) {
    const fallback = userRoles.includes('admin')
      ? '/admin'
      : userRoles.includes('staff')
        ? '/staff'
        : '/account'
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}

/**
 * For actions that need an account before they can proceed. Signed-in users go
 * straight through; everyone else is sent to sign-up with a return target.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageSpinner />

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth/sign-up"
        state={{ from: location, reason: 'account_required' }}
        replace
      />
    )
  }

  return <>{children}</>
}

/** Friendly 403 that explains itself, rather than a dead end. */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow mb-3">Restricted area</p>
      <h1 className="display-section">You do not have access to this page</h1>
      <p className="lede mt-4 max-w-md">
        {message ??
          'This area is for salon staff and administrators. If you think you should have access, please contact us.'}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <a href="/">Back to the site</a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="/contact">Contact us</a>
        </Button>
      </div>
    </div>
  )
}
