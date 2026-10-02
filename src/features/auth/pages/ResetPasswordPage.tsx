import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, Link2Off } from 'lucide-react'

import { analytics } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button } from '@/components/ui'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { FormField } from '@/features/auth/components/FormField'
import {
  PasswordInput,
  PasswordMeter,
  scorePassword,
} from '@/features/auth/components/PasswordField'
import { returnPath } from '@/features/auth/components/authNavigation'

/**
 * Choose a new password.
 *
 * The recovery link signs the visitor in just long enough to run
 * `updatePassword`. When that link is missing, malformed or expired the session
 * never arrives, `isAuthenticated` stays false and we explain that rather than
 * letting the save fail with a raw GoTrue message.
 */

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Choose at least 8 characters.')
      .max(200, 'That password is unusually long.'),
    confirmPassword: z.string().min(1, 'Type your new password once more.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Those two passwords do not match.',
  })

type ResetValues = z.infer<typeof schema>

/** Give the provider a beat to settle before declaring a bad link. */
const SETTLE_MS = 600

export default function ResetPasswordPage() {
  const { updatePassword, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useSeo({
    title: 'Choose a new password',
    description: 'Set a new password for your Black Chery Unisex Studio account.',
    path: '/auth/reset-password',
    noindex: true,
  })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onSubmit',
  })

  const password = watch('password') ?? ''

  // Once auth has settled, either the recovery session arrived or it did not.
  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false)
      return
    }
    if (!isLoading) {
      const timer = window.setTimeout(() => setChecking(false), SETTLE_MS)
      return () => window.clearTimeout(timer)
    }
  }, [isAuthenticated, isLoading])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await updatePassword(values.password)
      analytics.signIn('password_reset')
      setDone(true)
    } catch (error) {
      setFormError(errorMessage(error, 'We could not update your password. Please try again.'))
    }
  })

  const returningTo = returnPath(location.state)

  // --- Success --------------------------------------------------------------
  if (done) {
    return (
      <AuthLayout
        eyebrow="All set"
        title="Password updated"
        description="Your new password is live. Sign in with it and pick up where you left off."
        footer={
          <>
            Need to change it again?{' '}
            <Link to="/auth/forgot-password" className="underline underline-offset-4 hover:text-ink">
              Send another reset link
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <div
            className="flex items-start gap-3 rounded-md border border-success/25 bg-success/[0.06] p-4"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <p className="text-sm leading-relaxed text-ink-soft">
              Signed in as <strong className="font-semibold text-ink">your account</strong>. You can
              go straight to your dashboard, or sign in again on another device.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link to={returningTo ?? '/account'}>Go to my account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth/sign-in" state={location.state}>
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // --- Invalid / expired link ----------------------------------------------
  if (!checking && !isAuthenticated) {
    return (
      <AuthLayout
        eyebrow="Link expired"
        title="This reset link is no longer valid"
        description="Reset links last one hour and can only be used once. Request a fresh one and we will email it straight away."
        footer={
          <>
            Rather not reset it?{' '}
            <Link to="/auth/sign-in" state={location.state} className="underline underline-offset-4 hover:text-ink">
              Sign in instead
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <Alert variant="warning" title="Nothing was changed">
            Your old password still works if you have it. Nothing about your account has been altered.
          </Alert>

          <Button asChild size="lg" fullWidth variant="accent">
            <Link to="/auth/forgot-password" state={location.state}>
              Send me a new link
            </Link>
          </Button>

          <Button
            type="button"
            size="lg"
            fullWidth
            variant="ghost"
            onClick={() => navigate('/auth/sign-in', { replace: true })}
          >
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // --- Form -----------------------------------------------------------------
  const strength = scorePassword(password)

  return (
    <AuthLayout
      eyebrow="Almost done"
      title="Choose a new password"
      description="Pick something you have not used on this account before. At least 8 characters."
      footer={
        <>
          Remembered it after all?{' '}
          <Link to="/auth/sign-in" state={location.state} className="underline underline-offset-4 hover:text-ink">
            Back to sign in
          </Link>
        </>
      }
    >
      <div aria-live="polite" className="sr-only">
        {formError ? 'Could not update your password.' : isSubmitting ? 'Saving your new password.' : ''}
      </div>

      {checking && (
        <Alert variant="neutral" className="mb-5">
          <span className="flex items-center gap-2">
            <Link2Off className="size-4 shrink-0 text-bronze" aria-hidden />
            Checking your reset link…
          </span>
        </Alert>
      )}

      {formError && (
        <Alert
          variant="danger"
          title="We could not update your password"
          className="mb-5"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/auth/forgot-password" state={location.state}>
                New link
              </Link>
            </Button>
          }
        >
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <FormField
            label="New password"
            error={errors.password?.message}
            hint={password ? strength.hints[0] : 'At least 8 characters.'}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              autoFocus
              placeholder="Something only you know"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </FormField>
          <PasswordMeter value={password} className="mt-2.5" />
        </div>

        <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Type it once more"
            invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
        </FormField>

        <Button
          type="submit"
          size="lg"
          fullWidth
          variant="accent"
          loading={isSubmitting}
          loadingText="Saving…"
        >
          Update password
        </Button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-bronze" aria-hidden />
          <span>
            Once saved, you are signed in on this device only. Other devices stay signed in until
            their session expires.
          </span>
        </p>
      </form>
    </AuthLayout>
  )
}
