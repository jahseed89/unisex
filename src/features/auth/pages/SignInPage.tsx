import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, Mail } from 'lucide-react'

import { postSignInPath } from '@/lib/api'
import { analytics } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout, GoogleMark } from '@/features/auth/components/AuthLayout'
import { FormField } from '@/features/auth/components/FormField'
import { PasswordInput } from '@/features/auth/components/PasswordField'
import { isGoogleAuthEnabled, returnPath } from '@/features/auth/components/authNavigation'

/**
 * Sign in.
 *
 * The session settles asynchronously: `signIn` resolves before `AuthProvider`
 * has hydrated the profile and roles, so the redirect is driven by
 * `isAuthenticated` rather than by the promise. That also covers a visitor who
 * is already signed in when they land here — the effect fires on mount.
 */

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter the email address on your account.')
    .email('That does not look like a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type SignInValues = z.infer<typeof schema>

export default function SignInPage() {
  const auth = useAuth()
  const { signIn, signInWithGoogle, isAuthenticated, isLoading } = auth
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)

  const state = location.state

  // `/auth/confirm` bounces here with `?error=…` when a callback link cannot be
  // used. Surface why rather than presenting a bare form.
  const bounceReason = params.get('error')

  // Read the freshest session inside the redirect effect without making it a
  // dependency (the provider object is a new reference on every state change).
  const latest = useRef(auth)
  latest.current = auth

  useSeo({
    title: 'Sign in',
    description: 'Sign in to manage your appointments, orders and saved hair at Black Chery Unisex Studio.',
    path: '/auth/sign-in',
    noindex: true,
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!isAuthenticated) return
    const session = latest.current
    navigate(returnPath(state) ?? postSignInPath(session), { replace: true })
  }, [isAuthenticated, navigate, state])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signIn({ email: values.email.trim(), password: values.password })
      analytics.signIn('password')
    } catch (error) {
      setFormError(errorMessage(error, 'We could not sign you in. Please try again.'))
    }
  })

  const onGoogle = async () => {
    setGoogleError(null)
    setGooglePending(true)
    try {
      // Supabase navigates away to Google; the return lands on /auth/confirm.
      await signInWithGoogle()
    } catch (error) {
      setGoogleError(errorMessage(error, 'Google sign-in is unavailable right now.'))
      setGooglePending(false)
    }
  }

  const returningTo = returnPath(state)

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in"
      description={
        returningTo ? 'Pick up where you left off — we will take you straight back.' : undefined
      }
      footer={
        <>
          New to Black Chery Unisex Studio?{' '}
          <Link
            to="/auth/sign-up"
            state={state}
            className="font-medium text-bronze-dark underline underline-offset-4"
          >
            Create an account
          </Link>
          {' · '}
          <Link to="/book" className="underline underline-offset-4 hover:text-ink">
            Book without an account
          </Link>
        </>
      }
    >
      <div aria-live="polite" className="sr-only">
        {formError ? 'Sign in failed.' : isSubmitting ? 'Signing you in.' : ''}
      </div>

      {bounceReason && (
        <Alert variant="warning" title="That link could not be used" className="mb-5">
          {bounceReason === 'access_denied'
            ? 'That sign-in was declined, so nothing was connected to your account.'
            : 'The confirmation link has expired or was already used. Sign in below, or request a fresh one.'}
        </Alert>
      )}

      {formError && (
        <Alert variant="danger" title="We could not sign you in" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField label="Email address" error={errors.email?.message} required>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            leadingIcon={<Mail className="size-4" aria-hidden />}
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </FormField>

        <div>
          <FormField label="Password" error={errors.password?.message} required>
            <PasswordInput
              autoComplete="current-password"
              placeholder="Your password"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </FormField>

          <div className="mt-2 text-right">
            <Link
              to="/auth/forgot-password"
              state={state}
              className="text-[0.8125rem] text-bronze-dark underline underline-offset-4 hover:text-bronze"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting || isLoading}
          loadingText="Signing in…"
        >
          <LogIn className="size-4" aria-hidden />
          Sign in
        </Button>
      </form>

      {isGoogleAuthEnabled() && (
        <>
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" aria-hidden />
            <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-faint">or</span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>

          {googleError && (
            <Alert variant="danger" title="Google sign-in failed" className="mb-4">
              {googleError}
            </Alert>
          )}

          <Button
            type="button"
            size="lg"
            fullWidth
            variant="outline"
            loading={googlePending}
            loadingText="Opening Google…"
            onClick={() => void onGoogle()}
          >
            <GoogleMark />
            Continue with Google
          </Button>
        </>
      )}
    </AuthLayout>
  )
}
