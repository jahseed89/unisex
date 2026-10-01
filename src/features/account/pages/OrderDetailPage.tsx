import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Mail,
  MapPin,
  MessageCircle,
  RotateCcw,
  ShoppingBag,
  Truck,
} from 'lucide-react'

import { getOrder, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatDateTime, formatNaira, humanise } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState, Skeleton, statusTone } from '@/components/ui'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { StatusTimeline } from '@/features/account/components/StatusTimeline'
import {
  directionsLink,
  helpWhatsappLink,
  orderTimeline,
  orderWhatsappLink,
  statusLabel,
} from '@/features/account/components/accountUi'
import type { DeliveryAddress } from '@/types'

/**
 * A single order.
 *
 * Every figure below is read straight off the row that `fn_checkout` wrote —
 * subtotal, discount, shipping, tax, total, paid and refund are all server
 * values. Nothing is recomputed here, because a client-side total would
 * inevitably disagree with the receipt at some rounding boundary.
 */
export default function OrderDetailPage() {
  const { id = '' } = useParams()

  useSeo({
    title: 'Order',
    description: 'Items, payments and delivery details for your Unisex Hair Studio order.',
    path: `/account/orders/${id}`,
    noindex: true,
  })

  const query = useQuery({
    queryKey: qk.order(id),
    queryFn: () => getOrder(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  })

  if (query.isLoading) return <OrderSkeleton />

  if (query.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Alert
          variant="danger"
          title="We could not load this order"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      </div>
    )
  }

  const order = query.data
  if (!order) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden />}
          title="Order not found"
          description="It may have been removed, or the link may belong to another account."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/account/orders">See all orders</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const balance = Math.max(0, order.total - order.paid_total)
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const cancelled = order.status === 'cancelled' || order.status === 'returned'
  const address = order.delivery_address as DeliveryAddress | null

  return (
    <div className="space-y-8">
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Badge variant={statusTone(order.status)} dot>
              {statusLabel(order.status)}
            </Badge>
            <Badge variant={statusTone(order.payment_status)}>
              {statusLabel(order.payment_status)}
            </Badge>
          </div>
          <h1 className="display-section">Order {order.order_number}</h1>
          <p className="lede mt-3">
            Placed {formatDateTime(order.placed_at)} · {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          <Button asChild variant="accent" size="lg">
            <Link to="/shop">
              <RotateCcw className="size-4" aria-hidden />
              Reorder
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={helpWhatsappLink()} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden />
              Need help
            </a>
          </Button>
        </div>
      </header>

      {balance > 0 && !cancelled && (
        <Alert
          variant="warning"
          title={`${formatNaira(balance)} still to pay`}
          action={
            <Button asChild size="sm" variant="outline">
              <a href={helpWhatsappLink()} target="_blank" rel="noopener noreferrer">
                Message us
              </a>
            </Button>
          }
        >
          This order has not been settled yet. Pay by card or bank transfer — message us on WhatsApp
          and we will send the details straight away.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
        <div className="space-y-6">
          {/* Items ---------------------------------------------------- */}
          <Card className="p-5 md:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">What you ordered</h2>

            <ul className="mt-4 divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <MediaFrame
                    src={item.image_snapshot}
                    alt={item.name_snapshot}
                    seed={item.sku_snapshot ?? item.name_snapshot}
                    aspect="1/1"
                    rounded
                    className="w-16 shrink-0 sm:w-20"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        {/* The snapshot holds a name and SKU, not a slug, so this
                            deliberately does not link to a product page. */}
                        <h3 className="text-sm font-medium leading-snug text-ink">
                          {item.name_snapshot}
                        </h3>
                        <p className="mt-1 text-xs text-muted">
                          {item.variant_snapshot ?? 'Standard'}
                          {item.sku_snapshot ? (
                            <span className="text-faint"> · {item.sku_snapshot}</span>
                          ) : null}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatNaira(item.line_total)}
                      </p>
                    </div>

                    <p className="mt-1.5 text-xs text-muted">
                      {formatNaira(item.unit_price)} × {item.quantity}
                      {item.refunded_qty > 0 && (
                        <span className="text-danger">
                          {' '}
                          · {item.refunded_qty} refunded
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {order.customer_notes && (
              <Alert variant="neutral" title="Your note">
                {order.customer_notes}
              </Alert>
            )}
          </Card>

          {/* Fulfilment ---------------------------------------------- */}
          <Card className="p-5 md:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              {order.fulfilment_type === 'pickup' ? 'Collection' : 'Delivery'}
            </h2>

            {order.fulfilment_type === 'pickup' ? (
              <div className="mt-4">
                {order.location ? (
                  <>
                    <p className="text-sm font-medium text-ink">{order.location.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {order.location.address_line1}, {order.location.city}, {order.location.state}
                    </p>
                    {order.location.phone && (
                      <p className="mt-2 text-sm text-muted">
                        <a
                          href={`tel:${order.location.phone.replace(/\s/g, '')}`}
                          className="text-bronze-dark underline underline-offset-4"
                        >
                          {order.location.phone}
                        </a>
                      </p>
                    )}
                    <Button asChild variant="outline" size="md" className="mt-4">
                      <a
                        href={directionsLink(order.location)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="size-4" aria-hidden />
                        Get directions
                      </a>
                    </Button>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Collection point to be confirmed — we will email you when it is ready.
                  </p>
                )}
              </div>
            ) : address ? (
              <address className="mt-4 space-y-1 text-sm not-italic leading-relaxed text-ink-soft">
                <p className="font-medium text-ink">{order.contact_name}</p>
                {address.line1 && <p>{address.line1}</p>}
                {address.line2 && <p>{address.line2}</p>}
                <p>
                  {[address.city, address.state].filter(Boolean).join(', ')}
                </p>
                {address.landmark && <p className="text-muted">Near {address.landmark}</p>}
                {address.phone && <p className="text-muted">{address.phone}</p>}
              </address>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No delivery address was recorded for this order.
              </p>
            )}

            {/* Tracking */}
            {(order.tracking_number || order.courier) && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                <Truck className="size-4 text-bronze" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {order.tracking_number ?? 'Tracking to be assigned'}
                  </p>
                  <p className="text-xs text-muted">{order.courier ?? 'Our delivery partner'}</p>
                </div>
              </div>
            )}

            {order.delivery_notes && (
              <p className="mt-4 rounded-md border border-line bg-sand/50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
                {order.delivery_notes}
              </p>
            )}
          </Card>

          {/* Payments ------------------------------------------------- */}
          {order.payments.length > 0 && (
            <Card className="p-5 md:p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Payments</h2>
              <ul className="mt-4 divide-y divide-line">
                {order.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {formatNaira(payment.amount)}
                        {payment.refunded_amount > 0 && (
                          <span className="ml-2 text-xs font-normal text-danger">
                            {formatNaira(payment.refunded_amount)} refunded
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {humanise(payment.provider)}
                        {payment.channel ? ` · ${humanise(payment.channel)}` : ''} ·{' '}
                        {payment.paid_at ? formatDate(payment.paid_at) : humanise(payment.purpose)}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-faint tabular-nums">
                        {payment.provider_reference ?? payment.reference}
                      </p>
                    </div>
                    <Badge variant={statusTone(payment.status)} size="sm">
                      {statusLabel(payment.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Sidebar --------------------------------------------------- */}
        <aside className="space-y-5 lg:sticky lg:top-24">
          {/* Totals */}
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-ink">Summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <TotalRow label="Subtotal" value={formatNaira(order.subtotal)} />
              {order.discount_total > 0 && (
                <TotalRow
                  label={order.coupon_code ? `Discount (${order.coupon_code})` : 'Discount'}
                  value={`−${formatNaira(order.discount_total)}`}
                  tone="text-success"
                />
              )}
              <TotalRow
                label="Delivery"
                value={order.shipping_total > 0 ? formatNaira(order.shipping_total) : 'Free'}
              />
              {order.tax_total > 0 && (
                <TotalRow label="Tax" value={formatNaira(order.tax_total)} />
              )}
              <div className="flex justify-between gap-4 border-t border-line pt-2.5">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatNaira(order.total)}</dd>
              </div>
              <TotalRow label="Paid" value={formatNaira(order.paid_total)} />
              {order.refund_total > 0 && (
                <TotalRow label="Refunded" value={`−${formatNaira(order.refund_total)}`} tone="text-danger" />
              )}
              {balance > 0 && (
                <div className="flex justify-between gap-4 border-t border-line pt-2.5">
                  <dt className="font-medium text-ink">Outstanding</dt>
                  <dd className="font-semibold tabular-nums text-clay">{formatNaira(balance)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5">
              <Button asChild variant="outline" size="md">
                <Link to="/shop">
                  <RotateCcw className="size-4" aria-hidden />
                  Reorder these items
                </Link>
              </Button>
              <Button asChild variant="subtle" size="md">
                <a
                  href={orderWhatsappLink(order.order_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Contact us
                </a>
              </Button>
            </div>
          </Card>

          {/* Contact */}
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-ink">Contact</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{order.contact_name}</p>
            <p className="mt-1 text-sm text-muted">
              <a
                href={`mailto:${order.contact_email}`}
                className="inline-flex items-center gap-1.5 hover:text-bronze-dark"
              >
                <Mail className="size-3.5" aria-hidden />
                {order.contact_email}
              </a>
            </p>
            {order.contact_phone && (
              <p className="mt-1 text-sm text-muted">
                <a
                  href={`tel:${order.contact_phone.replace(/\s/g, '')}`}
                  className="hover:text-bronze-dark"
                >
                  {order.contact_phone}
                </a>
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Questions? WhatsApp is fastest — we usually reply within a couple of hours during
              opening times.
            </p>
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-ink">Progress</h2>
            <StatusTimeline steps={orderTimeline(order)} className="mt-4" />
          </Card>

          <p className="px-1 text-xs leading-relaxed text-muted">
            Need a VAT receipt or a correction? Email{' '}
            <a
              href={`mailto:${site.contact.email}`}
              className="text-bronze-dark underline underline-offset-4"
            >
              {site.contact.email}
            </a>{' '}
            quoting {order.order_number}.
          </p>
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function BackLink() {
  return (
    <Link
      to="/account/orders"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All orders
    </Link>
  )
}

function TotalRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function OrderSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-4 rounded-lg border border-line bg-surface p-6">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-4">
              <Skeleton className="size-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
