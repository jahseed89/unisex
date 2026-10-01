import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

import { formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Card } from '@/components/ui'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { TotalsPanel } from '@/features/cart/components/TotalsPanel'
import type { CartPayload } from '@/types'

/**
 * Order summary.
 *
 * Reads `cart.totals` verbatim — the server decides subtotal, discount,
 * delivery, tax and total, and re-checks them inside `fn_checkout`.
 */
export function CheckoutSummary({
  cart,
  className,
}: {
  cart: CartPayload
  className?: string
}) {
  return (
    <div className={className}>
      <ul className="max-h-72 space-y-3.5 overflow-y-auto pr-1">
        {cart.items.map((line) => (
          <li key={line.id} className="flex gap-3">
            <MediaFrame
              src={line.image_url}
              alt={line.product_name}
              seed={line.product_slug}
              aspect="1/1"
              rounded
              className="size-14 shrink-0 sm:size-16"
            />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-snug text-ink">
                  <Link to={`/shop/${line.product_slug}`} className="hover:text-bronze-dark">
                    {line.product_name}
                  </Link>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {line.variant_name} · {line.quantity} × {formatNaira(line.unit_price)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {formatNaira(line.line_total)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-5">
        <TotalsPanel totals={cart.totals} showProgress />
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Payment runs on Paystack. We never see or store your card details.
      </p>
    </div>
  )
}

/** Sticky card used on desktop. */
export function CheckoutSummaryCard({
  cart,
  title = 'Your order',
  className,
}: {
  cart: CartPayload
  title?: string
  className?: string
}) {
  return (
    <Card className={cn('p-5 md:p-6', className)}>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <CheckoutSummary cart={cart} className="mt-5" />
    </Card>
  )
}

/**
 * Mobile equivalent of the sticky card: the same figures, folded away until
 * the customer asks for them so the form keeps the whole screen.
 */
export function SummaryAccordion({ cart, className }: { cart: CartPayload; className?: string }) {
  return (
    <Accordion type="single" collapsible className={cn('rounded-lg border border-line bg-surface', className)}>
      <AccordionItem value="summary">
        <AccordionTrigger className="items-center">
          <span className="flex flex-1 items-center justify-between gap-4 pr-1">
            <span>
              <span className="block text-sm font-semibold text-ink">
                {cart.totals.item_count} item{cart.totals.item_count === 1 ? '' : 's'}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-muted">
                Show order summary
              </span>
            </span>
            <span className="font-display text-base font-semibold tabular-nums text-ink">
              {formatNaira(cart.totals.total)}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <CheckoutSummary cart={cart} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
