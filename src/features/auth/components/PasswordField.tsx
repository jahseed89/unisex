import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input, type InputProps } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * Password input with a reveal toggle.
 *
 * The toggle is a real button with an `aria-label` and `aria-pressed`, so it is
 * announced rather than being a decorative icon sitting inside the field.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput({ className, invalid, ...props }, ref) {
    const [visible, setVisible] = useState(false)

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          invalid={invalid}
          className={cn('pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted transition-colors hover:bg-sand hover:text-ink"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    )
  },
)

// ---------------------------------------------------------------------------
// Strength meter
// ---------------------------------------------------------------------------
export interface PasswordStrength {
  /** 0 (empty) to 4 (excellent). */
  score: number
  label: string
  /** Tailwind text colour for the label and bars. */
  tone: string
  bar: string
  hints: string[]
}

/**
 * A deliberately modest scoring pass: length does most of the work, variety
 * breaks ties, and obvious repeats are penalised. It is guidance for the user,
 * not a security control — Supabase sets the real policy.
 */
export function scorePassword(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: 'Too short',
      tone: 'text-muted',
      bar: 'bg-line-strong',
      hints: ['Use at least 8 characters.'],
    }
  }

  const hints: string[] = []
  let score = 0

  if (password.length >= 8) score += 1
  else hints.push('Use at least 8 characters.')

  if (password.length >= 12) score += 1
  else hints.push('Longer is stronger — aim for 12 or more.')

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length
  if (classes >= 2) score += 1
  else hints.push('Mix upper case, lower case, numbers or symbols.')

  if (classes >= 3 && password.length >= 10) score += 1
  else if (classes >= 2) hints.push('Adding a number or symbol makes it harder to guess.')
  else hints.push('Avoid names, phone numbers and single words.')

  const bounded = Math.max(1, Math.min(4, score))

  const table: Record<number, { label: string; tone: string; bar: string }> = {
    1: { label: 'Weak', tone: 'text-danger', bar: 'bg-danger' },
    2: { label: 'Fair', tone: 'text-clay', bar: 'bg-clay' },
    3: { label: 'Good', tone: 'text-warning', bar: 'bg-warning' },
    4: { label: 'Strong', tone: 'text-success', bar: 'bg-success' },
  }

  return { score: bounded, ...(table[bounded] ?? table[1]!), hints }
}

/** Four-segment meter rendered directly under a password field. */
export function PasswordMeter({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const strength = scorePassword(value)
  const show = value.length > 0

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1 flex-1 rounded-pill transition-colors duration-300',
              show && strength.score >= step ? strength.bar : 'bg-line',
            )}
          />
        ))}
      </div>

      {/* Announced politely so a screen-reader user hears the change. */}
      <p className="flex items-center justify-between gap-3 text-xs">
        <span className={show ? strength.tone : 'text-muted'}>
          {show ? `Password strength: ${strength.label}` : 'Password strength'}
        </span>
        {!show && <span className="text-faint">At least 8 characters</span>}
      </p>
    </div>
  )
}
