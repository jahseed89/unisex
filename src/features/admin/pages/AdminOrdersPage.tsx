import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, MapPin, Search, ShoppingBag } from 'lucide-react'

import { listLocationsAdmin, qk } from '@/lib/api'
import {
  Badge,
  Button,
  Field,
  Input,
  Pagination,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  Chip,
  ChipRow,
  DetailList,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { exportCsv } from '../components/adminFormat'
import { listOrdersAdmin } from '../components/adminReads'
import { formatDateTime, formatNaira, humanise } from '@/lib/utils/format'
import type { OrderStatus, PaymentStatus } from '@/types'

/**
 * Order administration.
 *
 * Money on this screen — totals, paid, refunded — is what the checkout function
 * stored on the order. Nothing is recomputed here, so a price change made today
 * cannot retroactively alter what a past order says it cost.
 */

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
]

const PAYMENT_STATUSES: PaymentStatus[] = [
  'awaiting_payment',
  'partially_paid',
  'paid',
  'refunded',
  'partially_refunded',
  'failed',
  'voided',
]

const PAGE_SIZE = 25

export default function AdminOrdersPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const statuses = (params.get('status') ?? '').split(',').filter(Boolean)
  const paymentStatus = params.get('paymentStatus') ?? ''
  const locationId = params.get('locationId') ?? ''
  const search = params.get('search') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const filters = {
    ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(locationId ? { locationId } : {}),
    ...(search ? { search } : {}),
  }

  const ordersQuery = useQuery({
    queryKey: qk.adminOrders({ ...filters, page, pageSize: PAGE_SIZE }),
    queryFn: () => listOrdersAdmin(filters, page, PAGE_SIZE),
    staleTime: 30_000,
  })

  const locationsQuery = useQuery({
    queryKey: qk.locations(),
    queryFn: listLocationsAdmin,
    staleTime: 10 * 60_000,
  })

  const orders = ordersQuery.data?.data ?? []
  const count = ordersQuery.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const hasFilters =
    statuses.length > 0 || Boolean(paymentStatus) || Boolean(locationId) || Boolean(search)

  const toggleStatus = (status: OrderStatus) => {
    const next = statuses.includes(status)
      ? statuses.filter((value) => value !== status)
      : [...statuses, status]
    update({ status: next.join(',') })
  }

  const exportPage = () => {
    exportCsv(
      `unisex-orders-page-${page}.csv`,
      [
        'Order number',
        'Placed',
        'Customer',
        'Email',
        'Phone',
        'Fulfilment',
        'Items',
        'Total',
        'Paid',
        'Refunded',
        'Payment status',
        'Order status',
        'Location',
      ],
      orders.map((order) => [
        order.order_number,
        order.placed_at,
        order.contact_name,
        order.contact_email,
        order.contact_phone,
        order.fulfilment_type,
        order.items.reduce((sum, item) => sum + item.quantity, 0),
        order.total,
        order.paid_total,
        order.refund_total,
        order.payment_status,
        order.status,
        order.location?.name ?? '',
      ]),
    )
  }

  return (
    <AdminShell
      eyebrow="Administration"
      title="Orders"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Every order from the boutique, with the fulfilment state and what has actually been paid."
      actions={
        <Button
          variant="outline"
          onClick={exportPage}
          disabled={orders.length === 0}
          aria-label={`Export the ${orders.length} orders on this page as CSV`}
        >
          <Download aria-hidden />
          Export this page
        </Button>
      }
    >
      <Panel
        title="Filters"
        action={
          hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Reset
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Search"
              htmlFor="order-search"
              hint="Matches order number, customer name or phone."
            >
              <Input
                id="order-search"
                type="search"
                value={search}
                placeholder="UHS-1042, Chiamaka, 0803…"
                onChange={(event) => update({ search: event.target.value })}
              />
            </Field>
            <Field label="Pickup location" htmlFor="order-location">
              <Select
                id="order-location"
                value={locationId}
                onChange={(event) => update({ locationId: event.target.value })}
                placeholder="Any location"
                options={(locationsQuery.data ?? []).map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-soft">Payment status</p>
            <ChipRow label="Payment status">
              {PAYMENT_STATUSES.map((value) => (
                <Chip
                  key={value}
                  active={paymentStatus === value}
                  onClick={() =>
                    update({ paymentStatus: paymentStatus === value ? '' : value })
                  }
                >
                  {humanise(value)}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-soft">Order status</p>
            <ChipRow
              label="Order status"
              onClear={hasFilters ? () => update({ status: '' }) : undefined}
              clearLabel="Any status"
            >
              {ORDER_STATUSES.map((value) => (
                <Chip
                  key={value}
                  active={statuses.includes(value)}
                  onClick={() => toggleStatus(value)}
                >
                  {humanise(value)}
                </Chip>
              ))}
            </ChipRow>
          </div>
        </div>
      </Panel>

      <div className="mt-5">
        <Panel
          title="Results"
          description={
            ordersQuery.isLoading
              ? 'Loading orders…'
              : `${count} order${count === 1 ? '' : 's'} match`
          }
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={ordersQuery.isLoading}
            isError={ordersQuery.isError}
            error={ordersQuery.error}
            onRetry={() => void ordersQuery.refetch()}
            isEmpty={orders.length === 0}
            empty={
              <div className="p-5">
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  {hasFilters ? (
                    <Search className="size-6 text-bronze" aria-hidden />
                  ) : (
                    <ShoppingBag className="size-6 text-bronze" aria-hidden />
                  )}
                  <p className="max-w-sm text-sm text-muted">
                    {hasFilters
                      ? 'No orders match these filters. Clear one to widen the search.'
                      : 'No orders have been placed yet.'}
                  </p>
                  {hasFilters && (
                    <Button
                      variant="outline"
                      onClick={() => setParams(new URLSearchParams(), { replace: true })}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            }
            skeleton={<div className="h-80 animate-pulse bg-sand/60" />}
            className="p-5"
          >
            <>
              <div className="hidden lg:block">
                <Table>
                  <caption className="sr-only">
                    Orders, page {page} of {pageCount}
                  </caption>
                  <THead>
                    <tr>
                      <TH scope="col">Order</TH>
                      <TH scope="col">Placed</TH>
                      <TH scope="col">Customer</TH>
                      <TH scope="col">Fulfilment</TH>
                      <TH scope="col">Items</TH>
                      <TH scope="col" className="text-right">Total</TH>
                      <TH scope="col" className="text-right">Paid</TH>
                      <TH scope="col">Payment</TH>
                      <TH scope="col">Status</TH>
                      <TH scope="col">Location</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {orders.map((order) => (
                      <TR
                        key={order.id}
                        className="cursor-pointer"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('a,button')) return
                          navigate(`/admin/orders/${order.id}`)
                        }}
                      >
                        <TD>
                          <Link
                            to={`/admin/orders/${order.id}`}
                            className="font-medium tabular-nums text-ink transition-colors hover:text-bronze-dark"
                          >
                            {order.order_number}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap text-sm">
                          {formatDateTime(order.placed_at)}
                        </TD>
                        <TD className="max-w-[13rem]">
                          <span className="block truncate text-sm text-ink">
                            {order.contact_name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {order.contact_phone}
                          </span>
                        </TD>
                        <TD>
                          <Badge variant="outline" size="sm">
                            {humanise(order.fulfilment_type)}
                          </Badge>
                        </TD>
                        <TD className="text-sm tabular-nums">
                          {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                        </TD>
                        <TD className="text-right text-sm font-medium tabular-nums text-ink">
                          {formatNaira(order.total)}
                        </TD>
                        <TD className="text-right text-sm tabular-nums text-ink">
                          {formatNaira(order.paid_total)}
                          {order.refund_total > 0 && (
                            <span className="block text-xs text-danger">
                              −{formatNaira(order.refund_total)} refunded
                            </span>
                          )}
                        </TD>
                        <TD>
                          <StatusBadge status={order.payment_status} />
                        </TD>
                        <TD>
                          <StatusBadge status={order.status} />
                        </TD>
                        <TD className="max-w-[10rem] truncate text-sm">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                            {order.location?.name ??
                              (order.fulfilment_type === 'delivery'
                                ? 'Delivery'
                                : '—')}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>

              <ul className="space-y-3 lg:hidden">
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="block rounded-md border border-line px-4 py-3.5 transition-colors hover:border-bronze hover:bg-sand/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tabular-nums text-ink">
                            {order.order_number}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {order.contact_name} · {formatDateTime(order.placed_at)}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="mt-3 border-t border-line pt-3">
                        <DetailList
                          columns={2}
                          items={[
                            { label: 'Total', value: formatNaira(order.total) },
                            { label: 'Paid', value: formatNaira(order.paid_total) },
                            { label: 'Fulfilment', value: humanise(order.fulfilment_type) },
                            {
                              label: 'Payment',
                              value: <StatusBadge status={order.payment_status} />,
                            },
                          ]}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col items-center gap-3 border-t border-line px-5 py-4">
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onPageChange={(next) => update({ page: String(next) })}
                />
                <p className="text-xs text-muted">
                  Page {page} of {pageCount} · {count} in total
                </p>
              </div>
            </>
          </AsyncSection>
        </Panel>
      </div>
    </AdminShell>
  )
}
