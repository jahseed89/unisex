import { Truck } from 'lucide-react'
import { formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { CartTotals } from '@/types'

/**
 * Order totals.
 *
 * Every figure is read from the server-computed `CartTotals`; the client never
 * adds, taxes or rounds anything up. The only derived numbers here are the
 * "add this much more for free delivery" hint and its progress percentage,
 * which are presentation only.
 */
export interface TotalsPanelProps {
  totals: CartTotals
  /** Show the free-delivery progress hint when a threshold applies. */
  showProgress?: boolean
  /** "Delivery" reads oddly on a pickup-only basket. */
  shippingLabel?: string
  className?: string
}

export function TotalsPanel({
  totals,
  showProgress = false,
  shippingLabel = 'Delivery',
  className,
}: TotalsPanelProps) {
  const threshold = totals.free_shipping_threshold
  const qualifies = threshold !== null && threshold > 0 && totals.shipping <= 0
  const remaining = threshold && threshold > 0 ? Math.max(0, threshold - totals.subtotal) : 0
  const percent =
    threshold && threshold > 0
      ? Math.min(100, Math.round((totals.subtotal / threshold) * 100))
      : 100

  return (
    <div className={cn('space-y-4', className)}>
      {showProgress && threshold !== null && threshold > 0 && !qualifies && (
        <div className="rounded-md border border-line bg-sand/50 p-3.5">
          <p className="flex items-center gap-2 text-xs font-medium text-ink">
            <Truck className="size-3.5 shrink-0 text-bronze" aria-hidden />
            Add {formatNaira(remaining)} more for free delivery
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Progress towards free delivery"
            className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-blush"
          >
            <div
              className="h-full rounded-pill bg-bronze transition-[width] duration-500 ease-[var(--ease-editorial)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {showProgress && qualifies && (
        <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/[0.06] p-3.5 text-xs font-medium text-ink">
          <Truck className="size-3.5 shrink-0 text-success" aria-hidden />
          This order qualifies for free delivery
        </p>
      )}

      <dl className="space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-medium tabular-nums text-ink">{formatNaira(totals.subtotal)}</dd>
        </div>

        {totals.discount > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">
              Discount{totals.coupon_code ? ` (${totals.coupon_code})` : ''}
            </dt>
            <dd className="font-medium tabular-nums text-success">
              −{formatNaira(totals.discount)}
            </dd>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">{shippingLabel}</dt>
          <dd className={cn('font-medium tabular-nums', totals.shipping <= 0 ? 'text-success' : 'text-ink')}>
            {totals.shipping <= 0 ? 'Free' : formatNaira(totals.shipping)}
          </dd>
        </div>

        {totals.tax > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Tax</dt>
            <dd className="font-medium tabular-nums text-ink">{formatNaira(totals.tax)}</dd>
          </div>
        )}

        <div
          className="flex items-baseline justify-between gap-4 border-t border-line pt-3"
          aria-live="polite"
          aria-atomic="true"
        >
          <dt className="text-sm font-medium text-ink">Total</dt>
          <dd className="font-display text-xl font-semibold tabular-nums text-ink">
            {formatNaira(totals.total)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
