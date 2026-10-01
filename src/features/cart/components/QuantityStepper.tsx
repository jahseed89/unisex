import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Quantity stepper.
 *
 * Shared by the cart line items, the product buy box and the checkout review so
 * the three surfaces can never drift apart. The numeric input is a real
 * `<input type="number">` rather than a styled label, which keeps the value
 * editable with a keyboard and announced correctly by screen readers.
 */
export interface QuantityStepperProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  disabled?: boolean
  /** Noun used in the accessible name, e.g. "Quantity". */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = 'Quantity',
  size = 'md',
  className,
}: QuantityStepperProps) {
  const control = size === 'sm' ? 'size-10' : 'size-11'
  const field = size === 'sm' ? 'h-10 w-11 text-xs' : 'h-11 w-12 text-sm'

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    // An empty or transient value ("", "-") is not a quantity; snap back.
    if (Number.isNaN(parsed)) {
      onChange(value)
      return
    }
    onChange(Math.min(Math.max(parsed, min), max))
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-md border border-line-strong bg-surface',
        disabled && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className={cn(
          'flex shrink-0 items-center justify-center text-ink-soft transition-colors',
          'hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-40',
          control,
        )}
      >
        <Minus className="size-4" aria-hidden />
      </button>

      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => commit(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        className={cn(
          'border-x border-line-strong bg-surface text-center font-medium tabular-nums text-ink',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-bronze',
          'disabled:cursor-not-allowed',
          field,
        )}
      />

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
        className={cn(
          'flex shrink-0 items-center justify-center text-ink-soft transition-colors',
          'hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-40',
          control,
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}
