import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

/**
 * Progress indicator for the multi-step application form.
 *
 * A real `<ol>` with `aria-current="step"`, so the position is available to a
 * screen reader and not only to the eye. Completed steps stay clickable so a
 * candidate can go back and correct something without losing their answers.
 */
export interface StepDefinition {
  id: string
  label: string
  /** Short line under the label, for the current step only. */
  hint?: string
}

export function ApplicationSteps({
  steps,
  current,
  completed,
  onSelect,
  className,
}: {
  steps: StepDefinition[]
  /** Zero-based index of the active step. */
  current: number
  completed: number[]
  onSelect?: (index: number) => void
  className?: string
}) {
  return (
    <nav aria-label="Application progress" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((step, index) => {
          const done = completed.includes(index)
          const active = index === current
          const reachable = done || index <= current
          const Tag = reachable && onSelect ? 'button' : 'div'

          const content = (
            <>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold tabular-nums transition-colors',
                  active
                    ? 'border-bronze bg-bronze text-white'
                    : done
                      ? 'border-sage bg-sage text-white'
                      : 'border-line-strong bg-surface text-faint',
                )}
                aria-hidden
              >
                {done && !active ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="whitespace-nowrap text-[0.8125rem] font-medium">{step.label}</span>
            </>
          )

          const classes = cn(
            'inline-flex min-h-11 items-center gap-2 rounded-md px-2.5 text-left transition-colors',
            active
              ? 'bg-blush/60 text-ink'
              : reachable
                ? 'text-ink-soft hover:bg-sand hover:text-ink'
                : 'text-faint',
          )

          return (
            <li key={step.id} className="flex items-center">
              {index > 0 && <span className="mx-0.5 h-px w-4 bg-line sm:w-6" aria-hidden />}
              {Tag === 'button' ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(index)}
                  aria-current={active ? 'step' : undefined}
                  className={classes}
                >
                  {content}
                </button>
              ) : (
                <span aria-current={active ? 'step' : undefined} className={classes}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Progress bar used on mobile, where the stepper wraps. */
export function StepProgress({
  current,
  total,
  className,
}: {
  current: number
  total: number
  className?: string
}) {
  const percent = Math.round(((current + 1) / total) * 100)

  return (
    <div className={className}>
      <div
        className="h-1 w-full overflow-hidden rounded-pill bg-line"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Step ${current + 1} of ${total}`}
      >
        <div
          className="h-full rounded-pill bg-bronze transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Step {current + 1} of {total} · {percent}% complete
      </p>
    </div>
  )
}

/** Small inline link back to the role, used on the confirmation panel. */
export function BackToJobLink({ slug }: { slug: string }) {
  return (
    <Link
      to={`/careers/${slug}`}
      className="text-sm text-bronze-dark underline underline-offset-4 hover:text-bronze"
    >
      Read the full role description
    </Link>
  )
}
