import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { postSignInPath } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button } from '@/components/ui'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { returnPath } from '@/features/auth/components/authNavigation'

/**
 * Landing page for the OAuth / email-confirmation redirect.
 *
 * Supabase parses the callback hash (or `?code=`) before this component mounts,
 * so the only job here is to wait for `AuthProvider` to finish, confirm a
 * session exists, and hand off.
 *
 * Redirecting on `isAuthenticated` rather than on a promise is what makes the
 * staff/admin split correct: `applyUser` awaits role hydration *before* flipping
 * `isAuthenticated`, so by the time this effect runs `isStaff` / `isAdmin` are
 * already trustworthy.
 */

/** Longest we wait for the session before calling it a failure. */
const TIMEOUT_MS = 15_000

const FAILURE_COPY: Record<string, string> = {
  confirmation:
    'That confirmation link has expired or was already used. Sign in again, or request a fresh link.',
  access_denied: 'That sign-in was declined, so nothing was connected to your account.',
  oauth: 'We could not complete that sign-in. Please try again.',
}

export default function AuthConfirmPage() {
  const auth = useAuth()
  const { isAuthenticated, isLoading } = auth
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Read the freshest session inside the effects without making it a dependency.
  const latest = useRef(auth)
  latest.current = auth

  useSeo({
    title: 'Signing you in',
    description: 'Completing your Black Chery Unisex Studio sign-in.',
    path: '/auth/confirm',
    noindex: true,
  })

  // 1. A live session — send them where they were going.
  useEffect(() => {
    if (!isAuthenticated) return
    const session = latest.current
    navigate(returnPath(location.state) ?? postSignInPath(session), { replace: true })
  }, [isAuthenticated, location.state, navigate])

  // 2. The provider settled with no session and no explicit error — the link
  //    was already consumed. Bounce to sign-in rather than spinning forever.
  useEffect(() => {
    if (isLoading || params.has('error')) return

    const timer = window.setTimeout(() => {
      if (!latest.current.isAuthenticated) {
        navigate('/auth/sign-in?error=confirmation', { replace: true, state: location.state })
      }
    }, TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [isLoading, params, location.state, navigate])

  const errorCode = params.get('error') ?? params.get('error_code')
  const message = (errorCode && FAILURE_COPY[errorCode]) ?? FAILURE_COPY.confirmation

  // --- Failure --------------------------------------------------------------
  if (errorCode) {
    return (
      <AuthLayout
        eyebrow="Sign-in interrupted"
        title="We could not complete that"
        description="Nothing has been changed on your account. You can try again, or reset your password if you have been locked out."
        footer={
          <>
            Prefer to start over?{' '}
            <Link to="/" className="underline underline-offset-4 hover:text-ink">
              Back to the studio
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <Alert
            variant="warning"
            title="The link could not be used"
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to="/auth/sign-in">Try again</Link>
              </Button>
            }
          >
            {message}
          </Alert>

          <Button asChild size="lg" fullWidth variant="outline">
            <Link to="/auth/forgot-password">Send me a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // --- Waiting --------------------------------------------------------------
  return (
    <AuthLayout
      eyebrow="One moment"
      title="Signing you in"
      description="Finishing up your confirmation — this normally takes a second."
      footer={
        <>
          Taking too long?{' '}
          <Link to="/auth/sign-in" state={location.state} className="underline underline-offset-4 hover:text-ink">
            Go to sign in
          </Link>
        </>
      }
    >
      <div
        className="flex items-center gap-3 rounded-md border border-line bg-sand/50 p-5"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-5 shrink-0 animate-[var(--animate-spin-slow)] text-bronze" aria-hidden />
        <p className="text-sm leading-relaxed text-ink-soft">
          {isLoading ? 'Checking your session…' : 'Almost there — sending you to your account…'}
        </p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        This page only appears when you follow a confirmation or sign-in link from an email. If you
        got here by accident,{' '}
        <Link to="/" className="text-bronze-dark underline underline-offset-4">
          head back to the studio
        </Link>
        .
      </p>
    </AuthLayout>
  )
}
