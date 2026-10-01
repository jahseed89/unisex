import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PackageSearch, ShoppingBag } from 'lucide-react'

import { listOrders, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  statusTone,
} from '@/components/ui'
import { statusLabel } from '@/features/account/components/accountUi'
import type { Order, OrderStatus } from '@/types'

/**
 * Order history.
 *
 * A real table on desktop and stacked cards on mobile, because an order row has
 * five meaningful columns and squeezing them into a card loses the comparison
 * the client is actually making. The status tabs filter client-side — the list is
 * small and a single query keeps it instant.
 */

const FILTERS: { value: OrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

type OrderFilter = 'all' | 'open' | 'delivered' | 'cancelled'

const OPEN_STATUSES = new Set<OrderStatus>([
  'pending',
  'confirmed',
  'processing',
  'ready_for_pickup',
  'out_for_delivery',
])

function matches(order: Order, filter: OrderFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'open':
      return OPEN_STATUSES.has(order.status)
    case 'delivered':
      return order.status === 'delivered'
    case 'cancelled':
      return order.status === 'cancelled' || order.status === 'returned'
  }
}

export default function AccountOrdersPage() {
  const { user } = useAuth()
  const userId = user?.id
  const [filter, setFilter] = useState<OrderFilter>('all')

  useSeo({
    title: 'Your orders',
    description: 'Track deliveries and pickups from Unisex Hair Studio.',
    path: '/account/orders',
    noindex: true,
  })

  const query = useQuery({
    queryKey: qk.orders(userId ?? 'anonymous'),
    queryFn: () => listOrders(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const all = useMemo(() => query.data ?? [], [query.data])
  const counts = useMemo(
    () => ({
      all: all.length,
      open: all.filter((order) => matches(order, 'open')).length,
      delivered: all.filter((order) => matches(order, 'delivered')).length,
      cancelled: all.filter((order) => matches(order, 'cancelled')).length,
    }),
    [all],
  )

  const rows = useMemo(() => all.filter((order) => matches(order, filter)), [all, filter])
  const isEmpty = !query.isLoading && !query.isError && all.length === 0

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2.5">The boutique</p>
        <h1 className="display-section">Orders</h1>
        <p className="lede mt-3">
          Every order you have placed, with its payment and delivery status.
        </p>
      </header>

      {query.isLoading && <OrdersSkeleton />}

      {!query.isLoading && query.isError && (
        <Alert
          variant="danger"
          title="We could not load your orders"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      )}

      {isEmpty && (
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden />}
          title="No orders yet"
          description="When you order from the boutique it appears here — with tracking, receipts and the option to reorder in one tap."
          action={
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/shop">Shop the boutique</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/account/wishlist">See your wishlist</Link>
              </Button>
            </div>
          }
        />
      )}

      {!query.isLoading && !query.isError && all.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Order status">
            {FILTERS.map((entry) => {
              const active = filter === entry.value
              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(entry.value)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      'rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
                      active ? 'bg-white/15' : 'bg-sand text-muted',
                    )}
                  >
                    {counts[entry.value]}
                  </span>
                </button>
              )
            })}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="size-5" aria-hidden />}
              title="Nothing in that group"
              description="Try another filter to see the rest of your orders."
              action={
                <Button variant="outline" size="lg" onClick={() => setFilter('all')}>
                  Show all orders
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-lg border border-line bg-surface lg:block">
                <Table>
                  <caption className="sr-only">Your orders</caption>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH scope="col">Order</TH>
                      <TH scope="col">Placed</TH>
                      <TH scope="col">Reference</TH>
                      <TH scope="col">Fulfilment</TH>
                      <TH scope="col" className="text-right">
                        Total
                      </TH>
                      <TH scope="col">Payment</TH>
                      <TH scope="col">Status</TH>
                      <TH scope="col">
                        <span className="sr-only">Actions</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((order) => (
                      <TR key={order.id}>
                        <TD className="font-medium text-ink">
                          <Link
                            to={`/account/orders/${order.id}`}
                            className="tabular-nums hover:text-bronze-dark"
                          >
                            {order.order_number}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap text-xs">
                          {formatDate(order.placed_at)}
                        </TD>
                        <TD className="text-xs">
                          {order.coupon_code ? (
                            <span className="rounded-pill bg-sand px-2 py-0.5 text-[0.6875rem]">
                              {order.coupon_code}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </TD>
                        <TD className="text-xs">
                          {order.fulfilment_type === 'pickup' ? 'Studio pickup' : 'Delivery'}
                        </TD>
                        <TD className="text-right font-medium tabular-nums text-ink">
                          {formatNaira(order.total)}
                        </TD>
                        <TD>
                          <Badge variant={statusTone(order.payment_status)} size="sm">
                            {statusLabel(order.payment_status)}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge variant={statusTone(order.status)} size="sm" dot>
                            {statusLabel(order.status)}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/account/orders/${order.id}`}>
                              View
                              <span className="sr-only"> order {order.order_number}</span>
                            </Link>
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-3 lg:hidden">
                {rows.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/account/orders/${order.id}`}
                      className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-bronze"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-base font-semibold text-ink">
                            {order.order_number}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatDate(order.placed_at)} ·{' '}
                            {order.fulfilment_type === 'pickup' ? 'Studio pickup' : 'Delivery'}
                          </p>
                        </div>
                        <Badge variant={statusTone(order.status)} size="sm" dot>
                          {statusLabel(order.status)}
                        </Badge>
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
                        <span className="text-xs text-muted">
                          {order.coupon_code ? `Promo ${order.coupon_code}` : 'No promo code'}
                        </span>
                        <span className="text-right">
                          <span className="block text-[0.6875rem] text-muted">
                            {statusLabel(order.payment_status)}
                          </span>
                          <span className="block text-sm font-semibold tabular-nums text-ink">
                            {formatNaira(order.total)}
                          </span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function OrdersSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-11 w-28 rounded-pill" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-20 rounded-pill" />
            </div>
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
