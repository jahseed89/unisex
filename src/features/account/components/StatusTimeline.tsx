import { cn } from '@/lib/utils/cn'
import type { TimelineStep } from './accountUi'

/**
 * Vertical status history.
 *
 * Rendered as an ordered list so the sequence is available to assistive
 * technology, not merely implied by the dots. The dots are `aria-hidden`; the
 * label carries the meaning.
 */
export function StatusTimeline({
  steps,
  className,
}: {
  steps: TimelineStep[]
  className?: string
}) {
  if (steps.length === 0) return null

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-full border-2',
                  step.state === 'pending'
                    ? 'border-line-strong bg-canvas'
                    : step.state === 'current'
                      ? 'border-bronze bg-bronze'
                      : 'border-bronze bg-bronze/25',
                )}
                aria-hidden
              />
              {!last && <span className="w-px flex-1 bg-line" aria-hidden />}
            </div>

            <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
              <p
                className={cn(
                  'text-sm font-medium leading-snug',
                  step.state === 'pending' ? 'text-muted' : 'text-ink',
                )}
              >
                {step.label}
                {step.state === 'current' && (
                  <span className="sr-only"> (current status)</span>
                )}
              </p>
              {step.meta && <p className="mt-0.5 text-xs text-muted">{step.meta}</p>}
              {step.note && (
                <p className="mt-1.5 rounded-md border border-line bg-sand/50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {step.note}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
