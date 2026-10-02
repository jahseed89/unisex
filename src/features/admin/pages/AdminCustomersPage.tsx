import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Mail,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react'

import { listCustomers, qk } from '@/lib/api'
import type { CustomerSummary } from '@/lib/api'
import {
  Badge,
  Button,
  Field,
  Input,
  Pagination,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
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
  DetailList,
  EmptyState,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { listCustomerAppointments, listCustomerOrders } from '../components/adminReads'
import { formatDate, formatDateTime, formatNaira, whatsappLink } from '@/lib/utils/format'

/**
 * Customer administration.
 *
 * `listCustomers` is the only reader that returns a real lifetime figure: it
 * sums completed appointments and paid orders server-side. The drawer then
 * pulls that customer's own appointments and orders through scoped reads, so
 * what is shown is what actually happened rather than a client-side guess.
 *
 * Search note: the server-side customer filter matches email only, so the field
 * is labelled as such instead of implying a name search the API cannot do.
 */

const PAGE_SIZE = 25

export default function AdminCustomersPage() {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<CustomerSummary | null>(null)

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

  const customersQuery = useQuery({
    queryKey: qk.adminCustomers({ search, page, pageSize: PAGE_SIZE }),
    queryFn: () => listCustomers({ search }, page, PAGE_SIZE),
    staleTime: 60_000,
  })

  const customers = customersQuery.data?.data ?? []
  const count = customersQuery.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <AdminShell
      eyebrow="Administration"
      title="Customers"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Everyone with an account, with what they have spent across the salon and the boutique. Lifetime value sums completed appointments and paid orders."
    >
      <Panel title="Search">
        <Field
          label="Email"
          htmlFor="customer-search"
          hint="The customer reader filters on email. For a name or phone, search the orders list instead."
        >
          <Input
            id="customer-search"
            type="search"
            value={search}
            placeholder="chiamaka@example.com"
            onChange={(event) => update({ search: event.target.value })}
          />
        </Field>
      </Panel>

      <div className="mt-5">
        <Panel
          title="Accounts"
          description={
            customersQuery.isLoading
              ? 'Loading customers…'
              : `${count} account${count === 1 ? '' : 's'}`
          }
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={customersQuery.isLoading}
            isError={customersQuery.isError}
            error={customersQuery.error}
            onRetry={() => void customersQuery.refetch()}
            isEmpty={customers.length === 0}
            empty={
              <div className="p-5">
                <EmptyState
                  icon={search ? <Search aria-hidden /> : <UserRound aria-hidden />}
                  title={search ? 'No account matches that email' : 'No accounts yet'}
                  description={
                    search
                      ? 'Check the spelling, or search the orders list by name or phone instead.'
                      : 'Accounts appear here as soon as someone signs up or places an order.'
                  }
                  action={
                    search ? (
                      <Button
                        variant="outline"
                        onClick={() => update({ search: '' })}
                      >
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            }
            skeleton={<div className="h-72 animate-pulse bg-sand/60" />}
            className="p-5"
          >
            <>
              <Table>
                <caption className="sr-only">
                  Customer accounts, page {page} of {pageCount}
                </caption>
                <THead>
                  <tr>
                    <TH scope="col">Name</TH>
                    <TH scope="col">Email</TH>
                    <TH scope="col">Phone</TH>
                    <TH scope="col">Joined</TH>
                    <TH scope="col">Appointments</TH>
                    <TH scope="col">Orders</TH>
                    <TH scope="col">Account</TH>
                    <TH scope="col" className="text-right">Lifetime value</TH>
                  </tr>
                </THead>
                <TBody>
                  {customers.map((customer) => (
                    <TR key={customer.id}>
                      <TD>
                        <button
                          type="button"
                          onClick={() => setSelected(customer)}
                          className="text-left font-medium text-ink transition-colors hover:text-bronze-dark"
                          aria-label={`Open history for ${customer.full_name ?? customer.email}`}
                        >
                          {customer.full_name ?? 'Unnamed account'}
                        </button>
                      </TD>
                      <TD className="max-w-[15rem] truncate text-sm">{customer.email}</TD>
                      <TD className="whitespace-nowrap text-sm">
                        {customer.phone_e164 ?? '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-sm">
                        {formatDate(customer.created_at)}
                      </TD>
                      <TD className="text-sm tabular-nums">{customer.appointment_count}</TD>
                      <TD className="text-sm tabular-nums">{customer.order_count}</TD>
                      <TD>
                        <StatusBadge status={customer.status} />
                      </TD>
                      <TD className="text-right text-sm font-semibold tabular-nums text-ink">
                        {formatNaira(customer.lifetime_value)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

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

      {selected && <CustomerSheet customer={selected} onClose={() => setSelected(null)} />}
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// Customer drawer
// ---------------------------------------------------------------------------

function CustomerSheet({
  customer,
  onClose,
}: {
  customer: CustomerSummary
  onClose: () => void
}) {
  const appointmentsQuery = useQuery({
    // `qk.appointments(userId)` is exactly this shape of read.
    queryKey: qk.appointments(customer.id),
    queryFn: () => listCustomerAppointments(customer.id),
    staleTime: 60_000,
  })

  const ordersQuery = useQuery({
    queryKey: qk.orders(customer.id),
    queryFn: () => listCustomerOrders(customer.id),
    staleTime: 60_000,
  })

  const appointments = appointmentsQuery.data ?? []
  const orders = ordersQuery.data ?? []
  const firstName = customer.full_name?.split(' ')[0] ?? 'there'

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" title={`Customer: ${customer.full_name ?? customer.email}`}>
        <SheetHeader className="flex-col items-start gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            {customer.full_name ?? 'Unnamed account'}
          </h2>
          <p className="text-sm text-muted">
            Joined {formatDate(customer.created_at)} · {customer.status}
          </p>
        </SheetHeader>

        <SheetBody className="space-y-6">
          <DetailList
            columns={2}
            items={[
              { label: 'Completed appointments', value: customer.appointment_count },
              { label: 'Paid orders', value: customer.order_count },
              {
                label: 'Lifetime value',
                value: (
                  <span className="font-semibold">{formatNaira(customer.lifetime_value)}</span>
                ),
              },
              { label: 'Account', value: <StatusBadge status={customer.status} /> },
            ]}
          />

          <div className="space-y-2">
            {customer.phone_e164 && (
              <>
                <a
                  href={`tel:${customer.phone_e164}`}
                  className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                >
                  <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
                  Call {customer.phone_e164}
                </a>
                <a
                  href={whatsappLink(
                    `Hello ${firstName} — this is Black Chery Unisex Studio. How can we help?`,
                    customer.phone_e164,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                >
                  <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
                  Message on WhatsApp
                </a>
              </>
            )}
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
            >
              <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
              <span className="truncate">{customer.email}</span>
            </a>
          </div>

          {/* Appointments ------------------------------------------- */}
          <section aria-labelledby="customer-appointments">
            <h3
              id="customer-appointments"
              className="flex items-center gap-2 font-display text-base font-semibold text-ink"
            >
              <CalendarDays className="size-4 text-bronze" aria-hidden />
              Appointments
            </h3>

            <div className="mt-3">
              <AsyncSection
                isLoading={appointmentsQuery.isLoading}
                isError={appointmentsQuery.isError}
                error={appointmentsQuery.error}
                onRetry={() => void appointmentsQuery.refetch()}
                isEmpty={appointments.length === 0}
                empty={<p className="text-sm text-muted">No appointments booked.</p>}
                skeleton={<div className="h-24 animate-pulse rounded-md bg-sand/60" />}
              >
                <ul className="divide-y divide-line">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/admin/bookings/${appointment.id}`}
                            className="block truncate text-sm font-medium text-ink transition-colors hover:text-bronze-dark"
                          >
                            {appointment.service?.name ?? 'Salon service'}
                          </Link>
                          <p className="text-xs text-muted">
                            {formatDateTime(appointment.starts_at)}
                            {appointment.location && ` · ${appointment.location.name}`}
                          </p>
                        </div>
                        <StatusBadge status={appointment.status} />
                      </div>
                      {appointment.status === 'completed' && (
                        <p className="mt-1 text-xs tabular-nums text-muted">
                          {formatNaira(appointment.total)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </section>

          {/* Orders -------------------------------------------------- */}
          <section aria-labelledby="customer-orders">
            <h3
              id="customer-orders"
              className="flex items-center gap-2 font-display text-base font-semibold text-ink"
            >
              <ShoppingBag className="size-4 text-bronze" aria-hidden />
              Orders
            </h3>

            <div className="mt-3">
              <AsyncSection
                isLoading={ordersQuery.isLoading}
                isError={ordersQuery.isError}
                error={ordersQuery.error}
                onRetry={() => void ordersQuery.refetch()}
                isEmpty={orders.length === 0}
                empty={<p className="text-sm text-muted">No orders placed.</p>}
                skeleton={<div className="h-24 animate-pulse rounded-md bg-sand/60" />}
              >
                <ul className="divide-y divide-line">
                  {orders.map((order) => (
                    <li key={order.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/admin/orders/${order.id}`}
                            className="block truncate text-sm font-medium tabular-nums text-ink transition-colors hover:text-bronze-dark"
                          >
                            {order.order_number}
                          </Link>
                          <p className="text-xs text-muted">
                            {formatDateTime(order.placed_at)} ·{' '}
                            {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline" size="sm">
                            {formatNaira(order.total)}
                          </Badge>
                          <StatusBadge status={order.status} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </section>

          <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Lifetime value counts completed appointments and orders marked paid. Refunds and
            cancelled orders are excluded.
          </p>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
