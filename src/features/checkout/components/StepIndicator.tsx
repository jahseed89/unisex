import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CHECKOUT_STEPS } from './schema'

/**
 * Checkout progress.
 *
 * A real `<ol>` with `aria-current="step"`, so the position is announced and
 * the sequence survives a screen reader's list navigation.
 */
export function StepIndicator({
  current,
  onStepClick,
  className,
}: {
  current: number
  /** Steps already satisfied can be revisited. */
  onStepClick?: (step: number) => void
  className?: string
}) {
  return (
    <nav aria-label="Checkout progress" className={className}>
      <ol className="flex items-center gap-1.5 sm:gap-3">
        {CHECKOUT_STEPS.map((step, index) => {
          const done = step.id < current
          const active = step.id === current
          const reachable = done && onStepClick

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step.id)}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <StepDot step={step.id} done={done} active={active} />
                  <span className="truncate text-xs font-medium text-ink-soft sm:text-sm">
                    {step.label}
                  </span>
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <StepDot step={step.id} done={done} active={active} />
                  <span
                    className={cn(
                      'truncate text-xs font-medium sm:text-sm',
                      active ? 'text-ink' : 'text-muted',
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              )}
              {index < CHECKOUT_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'hidden h-px flex-1 sm:block',
                    done ? 'bg-bronze' : 'bg-line',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        Step {current} of {CHECKOUT_STEPS.length}: {CHECKOUT_STEPS[current - 1]?.label}
      </p>
    </nav>
  )
}

function StepDot({ step, done, active }: { step: number; done: boolean; active: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
        done && 'border-bronze bg-bronze text-white',
        active && 'border-ink bg-ink text-canvas',
        !done && !active && 'border-line-strong bg-surface text-muted',
      )}
      aria-hidden
    >
      {done ? <Check className="size-4" strokeWidth={3} /> : step}
    </span>
  )
}
