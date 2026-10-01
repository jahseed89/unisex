import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface BookingStepDescriptor {
  id: string
  /** Full label, shown from `sm` up. */
  label: string
  /** Abbreviated label so four steps still fit a 375px screen. */
  short: string
}

export interface BookingProgressProps {
  steps: BookingStepDescriptor[]
  currentId: string
  /** Steps the customer has reached at least once — the only ones they may jump back to. */
  reachedIds: string[]
  onJump: (id: string) => void
}

/**
 * Wizard progress.
 *
 * Every step is a real `<button>` so it works with a keyboard and a screen
 * reader; steps not yet reached are disabled rather than hidden, which keeps the
 * shape of the whole journey visible from the first screen.
 */
export function BookingProgress({
  steps,
  currentId,
  reachedIds,
  onJump,
}: BookingProgressProps) {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === currentId),
    0,
  )

  return (
    <nav aria-label="Booking progress">
      <ol className="flex">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentId
          const isReached = reachedIds.includes(step.id)
          const isDone = isReached && !isCurrent && index < currentIndex

          return (
            <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-1/2 right-0 top-[1.125rem] -z-0 h-px',
                    index < currentIndex ? 'bg-bronze' : 'bg-line',
                  )}
                />
              )}

              <button
                type="button"
                onClick={() => onJump(step.id)}
                disabled={!isReached}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-[0.8125rem] font-semibold transition-colors duration-200',
                  isCurrent && 'border-ink bg-ink text-canvas',
                  isDone && 'border-bronze bg-bronze text-white hover:bg-bronze-dark',
                  !isCurrent && !isDone && isReached && 'border-line-strong bg-surface text-ink-soft hover:border-ink',
                  !isReached && 'cursor-not-allowed border-line bg-canvas text-faint',
                )}
              >
                {isDone ? (
                  <>
                    <Check className="size-4" aria-hidden />
                    <span className="sr-only">completed</span>
                  </>
                ) : (
                  index + 1
                )}
              </button>

              <span
                className={cn(
                  'mt-2 max-w-full truncate text-center text-[0.6875rem] leading-tight',
                  isCurrent ? 'font-semibold text-ink' : isReached ? 'text-ink-soft' : 'text-faint',
                )}
              >
                <span className="sm:hidden">{step.short}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
