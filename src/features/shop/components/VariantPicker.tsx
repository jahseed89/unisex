import { formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { ProductVariant } from '@/types'

/**
 * Variant selector.
 *
 * Out-of-stock variants stay visible — a customer who can see a length exists
 * but is sold out is far better served than one who wonders whether the product
 * comes in that length at all. They are simply not selectable.
 */
export function VariantPicker({
  variants,
  selectedId,
  onSelect,
  name,
  className,
}: {
  variants: ProductVariant[]
  selectedId: string | null
  onSelect: (variant: ProductVariant) => void
  name: string
  className?: string
}) {
  if (variants.length === 0) return null

  return (
    <fieldset className={className}>
      <legend className="mb-3 text-[0.8125rem] font-medium text-ink-soft">
        Choose an option
        {variants.length > 1 && (
          <span className="ml-1.5 text-muted">({variants.length} available)</span>
        )}
      </legend>

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {variants.map((variant) => {
          const stock = sellableStock(variant)
          const outOfStock = stock <= 0
          const selected = variant.id === selectedId

          return (
            <li key={variant.id}>
              <button
                type="button"
                onClick={() => onSelect(variant)}
                disabled={outOfStock}
                aria-pressed={selected}
                aria-label={`${variant.name}${outOfStock ? ' — out of stock' : ` — ${formatNaira(variant.price)}`}`}
                className={cn(
                  'flex h-full min-h-11 w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors',
                  'disabled:cursor-not-allowed',
                  selected
                    ? 'border-bronze bg-bronze/[0.06]'
                    : outOfStock
                      ? 'border-line bg-sand/40 opacity-60 hover:border-line'
                      : 'border-line-strong bg-surface hover:border-ink',
                )}
              >
                <span
                  className={cn(
                    'text-sm font-medium leading-snug',
                    selected ? 'text-ink' : 'text-ink-soft',
                    outOfStock && 'line-through',
                  )}
                >
                  {variant.name}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {outOfStock ? 'Out of stock' : formatNaira(variant.price)}
                </span>
                <span className="sr-only">
                  {variant.sku} for {name}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

/**
 * Sellable units for a variant.
 *
 * `product_variants` exposes on-hand, reserved and safety stock rather than a
 * single available figure, so the arithmetic lives here and nowhere else.
 */
export function sellableStock(variant: ProductVariant): number {
  return Math.max(0, variant.stock_on_hand - variant.stock_reserved - variant.safety_stock)
}
