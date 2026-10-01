import { Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Star rating.
 *
 * Read-only by default. Interactive mode exposes a radiogroup so keyboard and
 * screen-reader users can set a rating without a custom widget.
 */

export function Rating({
  value = 0,
  max = 5,
  size = 'md',
  showValue = false,
  className,
}: {
  value?: number | null
  max?: number
  size?: 'sm' | 'md' | 'lg'
  showValue?: boolean
  className?: string
}) {
  const rating = value ?? 0
  const dimension = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'
  const percent = Math.max(0, Math.min(100, (rating / max) * 100))

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="img"
      aria-label={`${rating.toFixed(1)} out of ${max} stars`}
    >
      <span className="relative inline-flex">
        <span className="flex gap-0.5 text-line-strong" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <Star key={i} className={cn(dimension, 'fill-current')} strokeWidth={0} />
          ))}
        </span>
        <span
          className="absolute inset-0 flex gap-0.5 overflow-hidden text-bronze"
          style={{ width: `${percent}%` }}
          aria-hidden
        >
          {Array.from({ length: max }, (_, i) => (
            <Star key={i} className={cn(dimension, 'shrink-0 fill-current')} strokeWidth={0} />
          ))}
        </span>
      </span>
      {showValue && (
        <span className="text-xs font-medium tabular-nums text-muted">
          {rating.toFixed(1)}
          {value !== null && value !== undefined && (
            <span className="text-faint"> ({countLabel(value)})</span>
          )}
        </span>
      )}
    </div>
  )
}

function countLabel(count: number): string {
  return count === 1 ? '1 review' : `${count} reviews`
}

/** Interactive 1–5 star input. */
export function RatingInput({
  value,
  onChange,
  label = 'Rating',
  className,
}: {
  value: number
  onChange: (value: number) => void
  label?: string
  className?: string
}) {
  return (
    <fieldset className={cn('space-y-2', className)}>
      <legend className="text-[0.8125rem] font-medium text-ink-soft">{label}</legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= value
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
              onClick={() => onChange(star)}
              className={cn(
                'rounded-sm p-1 transition-transform duration-150',
                'hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze',
              )}
            >
              <Star
                className={cn(
                  'size-7 transition-colors',
                  active ? 'fill-bronze text-bronze' : 'fill-transparent text-line-strong',
                )}
                strokeWidth={1.5}
              />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
