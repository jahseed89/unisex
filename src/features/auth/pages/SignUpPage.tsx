import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Mail, Phone, User } from 'lucide-react'

import { postSignInPath } from '@/lib/api'
import { analytics } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase/errors'
import { toE164 } from '@/lib/utils/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button, Checkbox, Input } from '@/components/ui'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { FormField } from '@/features/auth/components/FormField'
import {
  PasswordInput,
  PasswordMeter,
  scorePassword,
} from '@/features/auth/components/PasswordField'
import { authRedirectState, isGoogleAuthEnabled, returnPath } from '@/features/auth/components/authNavigation'

/**
 * Create an account.
 *
 * Three outcomes, all handled explicitly:
 *  1. the email is already registered — offer to sign in instead
 *  2. email confirmation is required — explain what happens next and stop
 *  3. the session is live — redirect to wherever the visitor was headed
 */

const schema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Tell us the name you would like on your appointment.')
      .max(120, 'That name looks unusually long.'),
    email: z
      .string()
      .trim()
      .min(1, 'We need an email address to confirm your account.')
      .email('That does not look like a valid email address.'),
    phone: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || toE164(value) !== null,
        'Enter a Nigerian number we can reach you on, e.g. 0803 123 4567.',
      ),
    password: z
      .string()
      .min(8, 'Choose at least 8 characters.')
      .max(200, 'That password is unusually long.'),
    confirmPassword: z.string().min(1, 'Type your password once more.'),
    marketing: z.boolean(),
    terms: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Those two passwords do not match.',
  })
  .refine((values) => values.terms, {
    path: ['terms'],
    message: 'Please accept the terms to create an account.',
  })

type SignUpValues = z.infer<typeof schema>

const DUPLICATE = /already (registered|exists)|duplicate key/i

export default function SignUpPage() {
  const auth = useAuth()
  const { signUp, isAuthenticated, isLoading } = auth
  const location = useLocation()
  const navigate = useNavigate()

  const [formError, setFormError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  const state = location.state
  const reason = authRedirectState(state).reason
  const accountRequired = reason === 'account_required'
  const returningTo = returnPath(state)

  const latest = useRef(auth)
  latest.current = auth

  useSeo({
    title: 'Create an account',
    description:
      'Create a Black Chery Unisex Studio account to book appointments, track orders and keep your hair profile on file.',
    path: '/auth/sign-up',
    noindex: true,
  })

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      marketing: true,
      terms: false,
    },
    mode: 'onSubmit',
  })

  const password = watch('password') ?? ''

  // A live session (e.g. an existing tab) means there is nothing left to do.
  useEffect(() => {
    if (!isAuthenticated) return
    const session = latest.current
    navigate(returnPath(state) ?? postSignInPath(session), { replace: true })
  }, [isAuthenticated, navigate, state])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    setDuplicate(false)

    try {
      const result = await signUp({
        email: values.email.trim(),
        password: values.password,
        fullName: values.fullName.trim(),
        phone: values.phone.trim() ? toE164(values.phone.trim()) ?? undefined : undefined,
      })

      analytics.signUp('password')

      if (result.needsEmailConfirmation) {
        setPendingEmail(result.email)
        return
      }
      // Otherwise the session is already live and the effect above redirects.
    } catch (error) {
      const message = errorMessage(error, 'We could not create that account.')

      if (DUPLICATE.test(message)) {
        setDuplicate(true)
        setFormError(null)
        return
      }

      // Supabase rejects a weak password before our own meter can warn about it.
      if (/at least/i.test(message) && /character/i.test(message)) {
        setError('password', { type: 'manual', message })
        return
      }

      setFormError(message)
    }
  })

  // --- Confirmation panel ---------------------------------------------------
  if (pendingEmail) {
    return (
      <AuthLayout
        eyebrow="Almost there"
        title="Check your inbox"
        description={
          <>
            We have sent a confirmation link to <strong className="font-semibold text-ink">{pendingEmail}</strong>.
          </>
        }
        footer={
          <>
            Wrong address, or nothing after a few minutes?{' '}
            <Link to="/auth/sign-in" className="underline underline-offset-4 hover:text-ink">
              Sign in instead
            </Link>
            .
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-success/25 bg-success/[0.06] p-4" role="status">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-2 text-sm leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">What happens next</p>
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>Open the email and tap “Confirm my email”.</li>
                <li>You will land back here, signed in, with your account ready.</li>
                <li>Your bookings, orders and wishlist follow the account from then on.</li>
              </ol>
            </div>
          </div>

          <Alert variant="neutral" title="Nothing arrived?">
            Confirmations can land in promotions or spam. Search for “Black Chery Unisex Studio”, then check
            that folder. The link stays valid for 24 hours.
          </Alert>

          <Button asChild variant="outline" size="lg" fullWidth>
            <Link to="/auth/sign-in">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const strength = scorePassword(password)

  // --- Form -----------------------------------------------------------------
  return (
    <AuthLayout
      eyebrow="Join the studio"
      title="Create your account"
      description="One account for appointments, orders and your saved hair profile. It takes about a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/auth/sign-in"
            state={state}
            className="font-medium text-bronze-dark underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div aria-live="polite" className="sr-only">
        {formError ? 'Sign up failed.' : isSubmitting ? 'Creating your account.' : ''}
      </div>

      {accountRequired && (
        <Alert variant="info" title="You need an account for this" className="mb-5">
          That page keeps your bookings and orders in one place, so it needs a signed-in account.
          Creating one takes a minute — we will bring you straight back afterwards.
        </Alert>
      )}

      {duplicate && (
        <Alert
          variant="warning"
          title="That email is already registered"
          className="mb-5"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/auth/sign-in" state={{ from: state?.from }}>
                Sign in
              </Link>
            </Button>
          }
        >
          An account already exists with that address. Sign in instead, or{' '}
          <Link to="/auth/forgot-password" state={state} className="underline underline-offset-4">
            reset your password
          </Link>{' '}
          if you have forgotten it.
        </Alert>
      )}

      {formError && (
        <Alert variant="danger" title="We could not create that account" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          label="Full name"
          error={errors.fullName?.message}
          hint="This is the name we greet you by and put on your appointment."
          required
        >
          <Input
            autoComplete="name"
            placeholder="Ada Okafor"
            leadingIcon={<User className="size-4" aria-hidden />}
            invalid={Boolean(errors.fullName)}
            {...register('fullName')}
          />
        </FormField>

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

        <FormField
          label="Phone (optional)"
          error={errors.phone?.message}
          hint="Only used for appointment reminders on WhatsApp or SMS."
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            leadingIcon={<Phone className="size-4" aria-hidden />}
            invalid={Boolean(errors.phone)}
            {...register('phone')}
          />
        </FormField>

        <div>
          <FormField
            label="Password"
            error={errors.password?.message}
            hint={password ? strength.hints[0] : 'At least 8 characters.'}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              placeholder="Something only you know"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </FormField>
          <PasswordMeter value={password} className="mt-2.5" />
        </div>

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Type it once more"
            invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
        </FormField>

        <div className="space-y-3 border-t border-line pt-5">
          <Checkbox
            id="terms"
            invalid={Boolean(errors.terms)}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            label={
              <>
                I accept the{' '}
                <Link
                  to="/policies/terms"
                  className="text-bronze-dark underline underline-offset-4"
                >
                  terms
                </Link>{' '}
                and{' '}
                <Link
                  to="/policies/privacy"
                  className="text-bronze-dark underline underline-offset-4"
                >
                  privacy policy
                </Link>
                .
              </>
            }
            {...register('terms')}
          />
          {errors.terms && (
            <p id="terms-error" role="alert" className="pl-7 text-xs text-danger">
              {errors.terms.message}
            </p>
          )}

          <Checkbox
            id="marketing"
            label="Send me studio news — new services, offers and the occasional gallery drop."
            description="Booking reminders are separate and always on. Unsubscribe any time."
            {...register('marketing')}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          fullWidth
          variant={isGoogleAuthEnabled() ? 'solid' : 'accent'}
          loading={isSubmitting || isLoading}
          loadingText="Creating your account…"
        >
          {returningTo ? 'Create account & continue' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
