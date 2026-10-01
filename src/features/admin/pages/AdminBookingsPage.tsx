import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Download, MapPin, Scissors, Search, X } from 'lucide-react'

import {
  getStylists,
  listBookings,
  listLocationsAdmin,
  qk,
} from '@/lib/api'
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
  EmptyState,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { BOOKING_CSV_HEADER, bookingRows, exportCsv } from '../components/adminFormat'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, formatNaira, humanise, toDateKey } from '@/lib/utils/format'
import { withCustomer } from '../components/adminReads'
import type { AppointmentStatus } from '@/types'

/**
 * Booking administration.
 *
 * Filters live in the query string so a filtered view is linkable, and every
 * filter is resolved server-side by `listBookings`. The CSV export is built from
 * the rows on screen — the reader pages server-side and exposes no bulk
 * endpoint — so the button says "this page" rather than implying a full dump.
 */

const STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]

const PAGE_SIZE = 25

export default function AdminBookingsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const statuses = (params.get('status') ?? '')
    .split(',')
    .filter((value): value is AppointmentStatus =>
      (STATUSES as string[]).includes(value),
    )
  const staffId = params.get('staffId') ?? ''
  const locationId = params.get('locationId') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
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

  const filters: Record<string, unknown> = {
    ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
    ...(staffId ? { staffId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }

  const rowsQuery = useQuery({
    queryKey: qk.adminBookings({ ...filters, page, pageSize: PAGE_SIZE }),
    queryFn: () => listBookings(filters, page, PAGE_SIZE),
    staleTime: 30_000,
  })

  const stylistsQuery = useQuery({ queryKey: qk.staff(), queryFn: getStylists, staleTime: 10 * 60_000 })
  const locationsQuery = useQuery({
    queryKey: qk.locations(),
    queryFn: listLocationsAdmin,
    staleTime: 10 * 60_000,
  })

  const rows = withCustomer(rowsQuery.data?.data ?? [])
  const count = rowsQuery.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const hasFilters =
    statuses.length > 0 || Boolean(staffId) || Boolean(locationId) || Boolean(from) || Boolean(to)

  const toggleStatus = (status: AppointmentStatus) => {
    const next = statuses.includes(status)
      ? statuses.filter((value) => value !== status)
      : [...statuses, status]
    update({ status: next.join(',') })
  }

  const exportPage = () => {
    exportCsv(`unisex-bookings-page-${page}.csv`, BOOKING_CSV_HEADER, bookingRows(rows))
  }

  return (
    <AdminShell
      eyebrow="Administration"
      title="Bookings"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Every appointment across the studio. Filter, then open a booking to move it through the salon workflow."
      actions={
        <Button
          variant="outline"
          onClick={exportPage}
          disabled={rows.length === 0}
          aria-label={`Export the ${rows.length} bookings on this page as CSV`}
        >
          <Download aria-hidden />
          Export this page
        </Button>
      }
    >
      <Panel
        title="Filters"
        description="Statuses combine; the rest narrow to a single value."
        action={
          hasFilters ? (
            <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              <X aria-hidden />
              Reset
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <ChipRow
            label="Status"
            clearLabel="Any status"
            onClear={hasFilters ? () => setParams(new URLSearchParams(), { replace: true }) : undefined}
          >
            {STATUSES.map((status) => (
              <Chip
                key={status}
                active={statuses.includes(status)}
                onClick={() => toggleStatus(status)}
              >
                {humanise(status)}
              </Chip>
            ))}
          </ChipRow>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Stylist" htmlFor="filter-staff">
              <Select
                id="filter-staff"
                value={staffId}
                onChange={(event) => update({ staffId: event.target.value })}
                placeholder="Every stylist"
                options={(stylistsQuery.data ?? []).map((stylist) => ({
                  value: stylist.user_id,
                  label: stylist.full_name,
                }))}
              />
            </Field>

            <Field label="Location" htmlFor="filter-location">
              <Select
                id="filter-location"
                value={locationId}
                onChange={(event) => update({ locationId: event.target.value })}
                placeholder="Every location"
                options={(locationsQuery.data ?? []).map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
              />
            </Field>

            <Field label="From" htmlFor="filter-from">
              <Input
                id="filter-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => update({ from: event.target.value })}
              />
            </Field>

            <Field label="To" htmlFor="filter-to">
              <Input
                id="filter-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => update({ to: event.target.value })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="subtle"
              size="sm"
              onClick={() => update({ from: toDateKey(new Date()) })}
            >
              Today
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                const start = new Date()
                start.setDate(start.getDate() - 6)
                update({ from: toDateKey(start), to: toDateKey(new Date()) })
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                const start = new Date()
                start.setDate(start.getDate() - 29)
                update({ from: toDateKey(start), to: toDateKey(new Date()) })
              }}
            >
              Last 30 days
            </Button>
          </div>
        </div>
      </Panel>

      <div className="mt-5">
        <Panel
          title="Results"
          description={
            rowsQuery.isLoading
              ? 'Loading bookings…'
              : `${count} booking${count === 1 ? '' : 's'} match`
          }
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={rowsQuery.isLoading}
            isError={rowsQuery.isError}
            error={rowsQuery.error}
            onRetry={() => void rowsQuery.refetch()}
            isEmpty={rows.length === 0}
            empty={
              <div className="p-5">
                <EmptyState
                  icon={hasFilters ? <Search aria-hidden /> : <CalendarDays aria-hidden />}
                  title={hasFilters ? 'No bookings match these filters' : 'No bookings yet'}
                  description={
                    hasFilters
                      ? 'Widen the date range or clear a filter to see more.'
                      : 'Bookings made through the site appear here the moment they are placed.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="outline"
                        onClick={() => setParams(new URLSearchParams(), { replace: true })}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            }
            skeleton={<div className="h-80 animate-pulse rounded-md bg-sand/60" />}
            className="p-5"
          >
            <>
              {/* Desktop: full table. */}
              <div className="hidden lg:block">
                <Table>
                  <caption className="sr-only">
                    Bookings, page {page} of {pageCount}
                  </caption>
                  <THead>
                    <tr>
                      <TH scope="col">Reference</TH>
                      <TH scope="col">When</TH>
                      <TH scope="col">Customer</TH>
                      <TH scope="col">Service</TH>
                      <TH scope="col">Stylist</TH>
                      <TH scope="col">Location</TH>
                      <TH scope="col">Status</TH>
                      <TH scope="col">Payment</TH>
                      <TH scope="col" className="text-right">Total</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR
                        key={row.id}
                        className="cursor-pointer"
                        onClick={(event) => {
                          // The reference cell carries a real link for keyboard use.
                          if ((event.target as HTMLElement).closest('a')) return
                          navigate(`/admin/bookings/${row.id}`)
                        }}
                      >
                        <TD>
                          <Link
                            to={`/admin/bookings/${row.id}`}
                            className="font-medium tabular-nums text-ink transition-colors hover:text-bronze-dark"
                          >
                            {row.reference}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap text-sm">{formatDateTime(row.starts_at)}</TD>
                        <TD className="max-w-[12rem] truncate text-sm">
                          {row.customer?.full_name ?? 'Guest'}
                        </TD>
                        <TD className="max-w-[12rem] truncate text-sm">
                          <span className="flex items-center gap-1.5">
                            <Scissors className="size-3.5 shrink-0 text-bronze" aria-hidden />
                            {row.service?.name ?? '—'}
                          </span>
                        </TD>
                        <TD className="max-w-[10rem] truncate text-sm">
                          {row.staff?.full_name ?? <span className="text-muted">Unassigned</span>}
                        </TD>
                        <TD className="max-w-[9rem] truncate text-sm">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                            {row.location?.name ?? '—'}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge status={row.status} />
                        </TD>
                        <TD>
                          <Badge variant="outline" size="sm">
                            {humanise(row.payment_status)}
                          </Badge>
                        </TD>
                        <TD className="text-right font-medium tabular-nums text-ink">
                          {formatNaira(row.total)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile: stacked cards. */}
              <ul className="space-y-3 lg:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/admin/bookings/${row.id}`}
                      className={cn(
                        'block rounded-md border border-line px-4 py-3.5 transition-colors',
                        'hover:border-bronze hover:bg-sand/40',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {row.customer?.full_name ?? 'Guest'}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted">
                            {row.reference} · {formatDateTime(row.starts_at)}
                          </p>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>

                      <div className="mt-3 border-t border-line pt-3">
                        <DetailList
                          columns={1}
                          items={[
                            { label: 'Service', value: row.service?.name ?? '—' },
                            {
                              label: 'Stylist',
                              value: row.staff?.full_name ?? 'Unassigned',
                            },
                            { label: 'Location', value: row.location?.name ?? '—' },
                            { label: 'Total', value: formatNaira(row.total) },
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
