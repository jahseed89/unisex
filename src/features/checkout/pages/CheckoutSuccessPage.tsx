import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Clock,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react'

import { getOrder, listOrders, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { formatDateTime, formatNaira, humanise, whatsappLink } from '@/lib/utils/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  statusTone,
} from '@/components/ui'
import { MediaFrame } from '@/components/shared/MediaFrame'
import type { OrderDetail } from '@/types'

/**
 * Order confirmation.
 *
 * Reads the order by id when the checkout handed one over, otherwise resolves
 * the reference from the customer's own order list. The page is honest about
 * payment state: a bank transfer that has not cleared says so, rather than
 * pretending the money is in.
 */
export default function CheckoutSuccessPage() {
  const [params] = useSearchParams()
  const { user } = useAuth()

  const reference = params.get('order')
  const orderId = params.get('order_id')
  const userId = user?.id

  useSeo({
    title: 'Order received',
    description: 'Your Unisex Hair Studio order.',
    path: '/checkout/success',
    noindex: true,
  })

  const orderQuery = useQuery({
    queryKey: orderId ? qk.order(orderId) : qk.orders(userId ?? 'anonymous'),
    queryFn: async (): Promise<OrderDetail | null> => {
      if (orderId) return getOrder(orderId)

      const orders = await listOrders(userId!)
      const match = orders.find((order) => order.order_number === reference)
      // `listOrders` is a flat read; fetch the joined row so the item list and
      // payment history are available on this page.
      return match ? getOrder(match.id) : null
    },
    enabled: Boolean(orderId) || Boolean(userId && reference),
    staleTime: 30_000,
  })

  const order = orderQuery.data ?? null

  if (orderQuery.isLoading) {
    return (
      <div className="container-page section-y">
        <SuccessSkeleton />
      </div>
    )
  }

  if (orderQuery.isError) {
    return (
      <div className="container-page section-y">
        <Alert
          variant="danger"
          title="We could not load that order"
          action={
            <Button size="sm" variant="outline" onClick={() => void orderQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(orderQuery.error)}
        </Alert>
        <div className="mt-6">
          <Button asChild variant="outline" size="lg">
            <Link to="/account/orders">All my orders</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="container-page section-y">
        <EmptyState
          icon={<PackageCheck className="size-5" aria-hidden />}
          title="We could not find that order"
          description={
            reference
              ? `Order ${reference} is not on this account. If you paid with a different email, message us on WhatsApp and we will pull it up.`
              : 'No order reference was passed to this page. Your orders are all listed in your account.'
          }
          action={
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/account/orders">View my orders</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/shop">Continue shopping</Link>
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const paid = order.payment_status === 'paid'
  const awaiting =
    order.payment_status === 'unpaid' ||
    order.payment_status === 'awaiting_payment' ||
    order.payment_status === 'partially_paid' ||
    order.payment_status === 'failed'
  const isPickup = order.fulfilment_type === 'pickup'
  const balance = Math.max(0, order.total - order.paid_total)

  // What happens next, in the customer's words rather than the database's.
  const pickupSteps = [
    {
      icon: <Clock className="size-4" aria-hidden />,
      title: 'We check and pack',
      body: 'Usually within a few hours during business days. You get an email and a WhatsApp message the moment it is ready.',
    },
    {
      icon: <Store className="size-4" aria-hidden />,
      title: 'Collect at the studio',
      body: order.location
        ? `${order.location.name}, ${order.location.address_line1}, ${order.location.city}.${
            order.location.phone ? ` Call ${order.location.phone} on arrival.` : ''
          }`
        : 'Come to the studio on Adeola Odeku Street, Victoria Island.',
    },
    {
      icon: <MessageCircle className="size-4" aria-hidden />,
      title: 'Check before you leave',
      body: 'Open the bag with a stylist if you would like the density or the grade checked before you go.',
    },
  ]

  const deliverySteps = [
    {
      icon: <Clock className="size-4" aria-hidden />,
      title: 'We check and pack',
      body: 'Orders placed before 4pm on a working day go out the same day.',
    },
    {
      icon: <Truck className="size-4" aria-hidden />,
      title: 'The rider collects and delivers',
      body: order.tracking_number
        ? `Tracking: ${order.tracking_number}${
            order.courier ? ` (${order.courier})` : ''
          }. We send the rider's number on WhatsApp too.`
        : "We share the rider's name and number on WhatsApp as soon as it is dispatched.",
    },
    {
      icon: <MessageCircle className="size-4" aria-hidden />,
      title: 'Check on arrival',
      body: 'Please check the pieces in the rider’s presence — damaged parcels are easier to sort out the moment they arrive.',
    },
  ]

  const nextSteps = isPickup ? pickupSteps : deliverySteps

  return (
    <>
      <div className="border-b border-line bg-sand/50">
        <div className="container-page py-14 text-center md:py-20">
          <SuccessMark paid={paid} />

          <p className="eyebrow mt-6">
            {paid ? 'Order confirmed' : 'Order received'}
          </p>
          <h1 className="display-section mt-3">
            {paid ? 'Thank you — we have it from here.' : 'Your order is in.'}
          </h1>
          <p className="lede mx-auto mt-4 max-w-xl">
            {paid
              ? `We have emailed your receipt to ${order.contact_email}. ${isPickup ? 'We will message you the moment your pieces are bagged and ready.' : 'We will send the rider’s details before they leave the studio.'}`
              : `We have emailed your receipt to ${order.contact_email}. We are still waiting for payment to clear — the order is reserved in the meantime.`}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Badge variant={statusTone(order.payment_status)} size="lg">
              {humanise(order.payment_status)}
            </Badge>
            <Badge variant={statusTone(order.status)} size="lg">
              {humanise(order.status)}
            </Badge>
            <span className="font-display text-lg font-semibold tabular-nums text-ink">
              {formatNaira(order.total)}
            </span>
          </div>

          <p className="mt-3 text-sm text-muted">
            Order{' '}
            <span className="font-medium tabular-nums text-ink">{order.order_number}</span> · placed{' '}
            {formatDateTime(order.placed_at)}
          </p>
        </div>
      </div>

      <div className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
          <div className="min-w-0 space-y-8">
            {awaiting && (
              <Alert
                variant="warning"
                title="Payment is not complete yet"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <a
                      href={whatsappLink(
                        `Hi! I placed order ${order.order_number} by bank transfer and I want to confirm the payment details.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp us
                    </a>
                  </Button>
                }
              >
                {balance > 0 ? (
                  <>
                    <p>
                      {formatNaira(balance)} is still outstanding on this order. We will only start
                      packing once it clears, and we will message you if anything looks off with the
                      transfer.
                    </p>
                  </>
                ) : (
                  <p>Your payment did not go through. You can retry from your order page.</p>
                )}
              </Alert>
            )}

            {/* What happens next */}
            <section aria-labelledby="next-heading">
              <h2 id="next-heading" className="font-display text-lg font-semibold text-ink">
                What happens next
              </h2>
              <ol className="mt-4 space-y-4">
                {nextSteps.map((entry) => (
                  <Step key={entry.title} icon={entry.icon} title={entry.title} body={entry.body} />
                ))}
              </ol>
            </section>

            {/* Items */}
            <section aria-labelledby="items-heading">
              <h2 id="items-heading" className="font-display text-lg font-semibold text-ink">
                In this order
              </h2>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-4 py-4">
                    <MediaFrame
                      src={item.image_snapshot}
                      alt={item.name_snapshot}
                      seed={item.sku_snapshot ?? item.id}
                      aspect="1/1"
                      rounded
                      className="size-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {item.product_id ? (
                          <Link to="/shop" className="hover:text-bronze-dark">
                            {item.name_snapshot}
                          </Link>
                        ) : (
                          item.name_snapshot
                        )}
                      </p>
                      {item.variant_snapshot && (
                        <p className="mt-0.5 text-xs text-muted">{item.variant_snapshot}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted">
                        {item.quantity} × {formatNaira(item.unit_price)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {formatNaira(item.line_total)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Summary rail */}
          <aside className="space-y-5" aria-label="Order summary">
            <Card className="p-5 md:p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Summary</h2>
              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular-nums text-ink">{formatNaira(order.subtotal)}</dd>
                </div>
                {order.discount_total > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">
                      Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}
                    </dt>
                    <dd className="tabular-nums text-success">−{formatNaira(order.discount_total)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{isPickup ? 'Pick-up' : 'Delivery'}</dt>
                  <dd
                    className={`tabular-nums ${order.shipping_total <= 0 ? 'text-success' : 'text-ink'}`}
                  >
                    {order.shipping_total <= 0 ? 'Free' : formatNaira(order.shipping_total)}
                  </dd>
                </div>
                {order.tax_total > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Tax</dt>
                    <dd className="tabular-nums text-ink">{formatNaira(order.tax_total)}</dd>
                  </div>
                )}
                {order.paid_total > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Paid</dt>
                    <dd className="tabular-nums text-ink">{formatNaira(order.paid_total)}</dd>
                  </div>
                )}
                <div
                  className="flex justify-between gap-4 border-t border-line pt-3"
                  aria-live="polite"
                >
                  <dt className="font-medium text-ink">Total</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums text-ink">
                    {formatNaira(order.total)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-base font-semibold text-ink">
                {isPickup ? 'Collect from' : 'Delivering to'}
              </h2>
              {isPickup ? (
                order.location ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {order.location.name}
                    <br />
                    {order.location.address_line1}
                    <br />
                    {order.location.city}, {order.location.state}
                    {order.location.phone ? (
                      <>
                        <br />
                        {order.location.phone}
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Our studio on Adeola Odeku Street, Victoria Island. We will confirm the collection
                    point when we message you.
                  </p>
                )
              ) : order.delivery_address ? (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {order.contact_name}
                  <br />
                  {order.delivery_address.line1}
                  {order.delivery_address.line2 ? `, ${order.delivery_address.line2}` : ''}
                  <br />
                  {order.delivery_address.city}, {order.delivery_address.state}
                  {order.delivery_address.landmark ? ` — near ${order.delivery_address.landmark}` : ''}
                  {order.delivery_address.phone ? (
                    <>
                      <br />
                      {order.delivery_address.phone}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Address on file for {order.contact_name}.
                </p>
              )}

              <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
                {order.contact_email}
                <br />
                {order.contact_phone}
              </p>

              {order.customer_notes && (
                <p className="mt-3 border-t border-line pt-3 text-sm italic leading-relaxed text-muted">
                  “{order.customer_notes}”
                </p>
              )}
            </Card>

            <div className="space-y-2.5">
              <Button asChild fullWidth size="lg" variant="accent">
                <Link to={`/account/orders/${order.id}`}>
                  Track this order
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild fullWidth size="lg" variant="outline">
                <Link to="/shop">
                  <ShoppingBag className="size-4" aria-hidden />
                  Continue shopping
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function SuccessMark({ paid }: { paid: boolean }) {
  return (
    <div
      className="mx-auto flex size-16 items-center justify-center rounded-full"
      role="img"
      aria-label={paid ? 'Order confirmed' : 'Order received, payment pending'}
    >
      <span
        className={`absolute size-16 rounded-full ${paid ? 'bg-success/12' : 'bg-warning/15'}`}
        aria-hidden
      />
      <span
        className={`relative flex size-16 items-center justify-center rounded-full text-white [animation:var(--animate-fade-up)] [animation-delay:120ms] ${
          paid ? 'bg-success' : 'bg-warning'
        }`}
        aria-hidden
      >
        {paid ? <Check className="size-8" strokeWidth={2.5} /> : <Clock className="size-7" />}
      </span>
    </div>
  )
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand text-bronze-dark">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  )
}

function SuccessSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 text-center" aria-hidden>
      <Skeleton className="mx-auto size-16 rounded-full" />
      <Skeleton className="mx-auto h-10 w-3/4" />
      <Skeleton className="mx-auto h-4 w-full" />
      <Skeleton className="mx-auto h-4 w-2/3" />
      <Skeleton className="mx-auto h-12 w-40 rounded-md" />
    </div>
  )
}
