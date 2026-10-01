import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mail, MailCheck, Send } from 'lucide-react'

import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/supabase/errors'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { FormField } from '@/features/auth/components/FormField'
import { isEmail, normaliseEmail } from '@/features/auth/components/email'

/**
 * Request a password reset.
 *
 * Supabase deliberately answers identically whether or not the address exists,
 * so the success copy never confirms that an account is registered — that would
 * turn this form into an account-enumeration oracle.
 */
export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useSeo({
    title: 'Reset your password',
    description: 'Send yourself a password reset link for your Unisex Hair Studio account.',
    path: '/auth/forgot-password',
    noindex: true,
  })

  const emailError = touched && !isEmail(email)
    ? 'Enter the email address on your account.'
    : undefined

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTouched(true)
    setError(null)

    if (!isEmail(email)) return

    setSubmitting(true)
    try {
      await resetPassword(normaliseEmail(email))
      setSentTo(normaliseEmail(email))
    } catch (caught) {
      setError(errorMessage(caught, 'We could not send that email. Please try again in a moment.'))
    } finally {
      setSubmitting(false)
    }
  }

  // --- Sent -----------------------------------------------------------------
  if (sentTo) {
    return (
      <AuthLayout
        eyebrow="Check your inbox"
        title="Reset link on its way"
        description={
          <>
            If <strong className="font-semibold text-ink">{sentTo}</strong> has an account with us,
            a reset link is in the inbox now.
          </>
        }
        footer={
          <>
            Remembered it already?{' '}
            <Link to="/auth/sign-in" state={location.state} className="underline underline-offset-4 hover:text-ink">
              Sign in
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-success/25 bg-success/[0.06] p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-1.5 text-sm leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Next steps</p>
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>Open the email titled “Reset your password”.</li>
                <li>Tap the link — it signs you in just long enough to set a new one.</li>
                <li>Choose something you have not used before.</li>
              </ol>
            </div>
          </div>

          <Alert variant="neutral" title="The link expires in an hour">
            If it has expired, or nothing arrived, use the button below to send another. Only the most
            recent link works.
          </Alert>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              loading={submitting}
              loadingText="Resending…"
              onClick={() => {
                setSentTo(null)
                setError(null)
              }}
            >
              Send another link
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/auth/sign-in" state={location.state}>
                Back to sign in
              </Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // --- Form -----------------------------------------------------------------
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Give us the email on your account and we will send a link to set a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/auth/sign-in" state={location.state} className="underline underline-offset-4 hover:text-ink">
            Back to sign in
          </Link>
        </>
      }
    >
      <div aria-live="polite" className="sr-only">
        {error ? 'Could not send the reset email.' : submitting ? 'Sending the reset email.' : ''}
      </div>

      {error && (
        <Alert variant="danger" title="That did not go through" className="mb-5">
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          label="Email address"
          error={emailError}
          hint="We will only send a reset link — never your details."
          required
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            leadingIcon={<Mail className="size-4" aria-hidden />}
            value={email}
            invalid={Boolean(emailError)}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched(true)}
          />
        </FormField>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingText="Sending…"
        >
          <Send className="size-4" aria-hidden />
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
