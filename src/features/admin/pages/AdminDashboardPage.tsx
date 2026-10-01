import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Package,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react'

import {
  getDashboardStats,
  listBookings,
  listLowStock,
  qk,
} from '@/lib/api'
import {
  Badge,
  Button,
  EmptyState,
  Stat,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  statusTone,
} from '@/components/ui'
import { Avatar } from '@/components/shared/MediaFrame'
import {
  AdminShell,
  AsyncSection,
  Chip,
  ChipRow,
  DetailList,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { RevenueChart } from '../components/RevenueChart'
import { withCustomer } from '../components/adminReads'
import type { AppointmentWithCustomer } from '../components/adminReads'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatNaira, formatTime, toDateKey } from '@/lib/utils/format'
import type { DashboardStats } from '@/types'

/**
 * Administrator home.
 *
 * The window lives in the URL so a range can be linked to or shared. Trends are
 * real: they compare the selected window against the immediately preceding
 * window of equal length, which costs one extra `fn_admin_dashboard_stats` call.
 */

const RANGE_DAYS = [7, 30, 90] as const
type RangeDays = (typeof RANGE_DAYS)[number]
const DEFAULT_RANGE: RangeDays = 30

interface Window {
  from: string
  to: string
  prevFrom: string
  prevTo: string
}

/** Selected window plus the equally long window immediately before it. */
function windowFor(days: number): Window {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))

  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)

  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (days - 1))

  return {
    from: toDateKey(from),
    to: toDateKey(to),
    prevFrom: toDateKey(prevFrom),
    prevTo: toDateKey(prevTo),
  }
}

export default function AdminDashboardPage() {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('range'))
  const days: RangeDays = (RANGE_DAYS as readonly number[]).includes(raw)
    ? (raw as RangeDays)
    : DEFAULT_RANGE

  const win = useMemo(() => windowFor(days), [days])
  const today = toDateKey(new Date())

  const statsQuery = useQuery({
    queryKey: qk.dashboard(win.from, win.to),
    queryFn: () => getDashboardStats(win.from, win.to),
    staleTime: 60_000,
  })

  const previousQuery = useQuery({
    queryKey: qk.dashboard(win.prevFrom, win.prevTo),
    queryFn: () => getDashboardStats(win.prevFrom, win.prevTo),
    staleTime: 5 * 60_000,
  })

  // The diary reader sorts newest-first; the front desk wants the next five in
  // running order, so the page re-sorts the slice it is given.
  const diaryQuery = useQuery({
    queryKey: qk.adminBookings({ from: today, to: today, page: 1, limit: 5 }),
    queryFn: () => listBookings({ from: today, to: today }, 1, 5),
    staleTime: 60_000,
  })

  const lowStockQuery = useQuery({
    queryKey: qk.inventory(),
    queryFn: listLowStock,
    staleTime: 60_000,
  })

  const stats = statsQuery.data
  const diary = useMemo(
    () =>
      withCustomer(diaryQuery.data?.data ?? []).sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at),
      ),
    [diaryQuery.data],
  )
  const lowStock = useMemo(
    () =>
      [...(lowStockQuery.data ?? [])].sort(
        (a, b) => a.stock_on_hand - b.stock_on_hand,
      ),
    [lowStockQuery.data],
  )

  const setRange = (next: RangeDays) => {
    const updated = new URLSearchParams(params)
    updated.set('range', String(next))
    setParams(updated, { replace: true })
  }

  return (
    <AdminShell
      eyebrow="Administration"
      title="Studio dashboard"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Revenue, bookings, commerce and hiring across the studio. Figures are aggregated by the database for the window you select."
      actions={
        <ChipRow label="Date range">
          {RANGE_DAYS.map((option) => (
            <Chip key={option} active={option === days} onClick={() => setRange(option)}>
              {option} days
            </Chip>
          ))}
        </ChipRow>
      }
    >
      <AsyncSection
        isLoading={statsQuery.isLoading}
        isError={statsQuery.isError}
        error={statsQuery.error}
        onRetry={() => void statsQuery.refetch()}
        skeleton={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-28 animate-pulse rounded-lg border border-line bg-sand/60" />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-lg border border-line bg-sand/60" />
          </div>
        }
      >
        {stats && (
          <>
            <KpiRow stats={stats} previous={previousQuery.data} days={days} />

            <div className="mt-6 grid gap-5 xl:grid-cols-3">
              <Panel
                className="xl:col-span-2"
                title="Revenue"
                description="Service and product income per day. Service revenue counts completed appointments; product revenue counts non-cancelled orders."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/orders">
                      Orders
                      <ArrowUpRight aria-hidden />
                    </Link>
                  </Button>
                }
              >
                <RevenueChart data={stats.series} />
              </Panel>

              <AppointmentsPanel stats={stats} days={days} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <CommercePanel stats={stats} />
              <RecruitmentPanel stats={stats} />
            </div>
          </>
        )}
      </AsyncSection>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <DiaryPanel
          isLoading={diaryQuery.isLoading}
          isError={diaryQuery.isError}
          error={diaryQuery.error}
          onRetry={() => void diaryQuery.refetch()}
          rows={diary}
          today={today}
        />

        <Panel
          title="Lowest stock"
          description="Active variants at or below their reorder threshold."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/inventory">
                Inventory
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          }
        >
          <AsyncSection
            isLoading={lowStockQuery.isLoading}
            isError={lowStockQuery.isError}
            error={lowStockQuery.error}
            onRetry={() => void lowStockQuery.refetch()}
            isEmpty={lowStock.length === 0}
            empty={
              <EmptyState
                icon={<Package aria-hidden />}
                title="Every SKU is above its threshold"
                description="Nothing needs reordering right now."
              />
            }
          >
            <ul className="divide-y divide-line">
              {lowStock.slice(0, 6).map((variant) => (
                <li key={variant.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/products/${variant.product_id}`}
                      className="block truncate text-sm font-medium text-ink transition-colors hover:text-bronze-dark"
                    >
                      {variant.product_name || variant.name}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {variant.name} · {variant.sku}
                    </p>
                  </div>
                  <Badge variant={variant.stock_on_hand <= 0 ? 'danger' : 'warning'} size="sm">
                    {variant.stock_on_hand <= 0
                      ? 'Out of stock'
                      : `${variant.stock_on_hand} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          </AsyncSection>
        </Panel>
      </div>
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

function KpiRow({
  stats,
  previous,
  days,
}: {
  stats: DashboardStats
  previous: DashboardStats | undefined
  days: number
}) {
  const label = `vs previous ${days} days`

  // A zero baseline carries no information, so no arrow is shown rather than a
  // fabricated +100%.
  const trend = (current: number, before: number | undefined) =>
    before === undefined || before <= 0
      ? undefined
      : { value: ((current - before) / before) * 100, label }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Revenue collected"
        value={formatNaira(stats.revenue.collected)}
        icon={<Wallet aria-hidden />}
        hint={`${formatNaira(stats.revenue.services)} services · ${formatNaira(
          stats.revenue.products,
        )} products sold`}
        trend={trend(stats.revenue.collected, previous?.revenue.collected)}
      />
      <Stat
        label="Appointments"
        value={stats.appointments.total}
        icon={<CalendarDays aria-hidden />}
        hint={`${stats.appointments.completed} completed · ${stats.appointments.upcoming} upcoming`}
        trend={trend(stats.appointments.total, previous?.appointments.total)}
      />
      <Stat
        label="New customers"
        value={stats.customers.new}
        icon={<Users aria-hidden />}
        hint={`${stats.customers.total} accounts in total`}
        trend={trend(stats.customers.new, previous?.customers.new)}
      />
      <Stat
        label="Open orders"
        value={stats.commerce.open_orders}
        icon={<ShoppingBag aria-hidden />}
        hint="Awaiting pickup or delivery"
        trend={trend(stats.commerce.open_orders, previous?.commerce.open_orders)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Appointments breakdown
// ---------------------------------------------------------------------------

function AppointmentsPanel({ stats, days }: { stats: DashboardStats; days: number }) {
  const rows = [
    { label: 'Completed', value: stats.appointments.completed, bar: 'bg-success' },
    { label: 'Cancelled', value: stats.appointments.cancelled, bar: 'bg-danger' },
    { label: 'No-show', value: stats.appointments.no_show, bar: 'bg-warning' },
    { label: 'Upcoming', value: stats.appointments.upcoming, bar: 'bg-info' },
  ]
  const max = Math.max(1, ...rows.map((row) => row.value))

  return (
    <Panel
      title="Appointments"
      description={`Outcomes recorded in the last ${days} days. Upcoming counts every pending and confirmed booking still ahead of us.`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/bookings">
            Bookings
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      }
    >
      <ul className="space-y-3.5">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-soft">{row.label}</span>
              <span className="font-semibold tabular-nums text-ink">{row.value}</span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-pill bg-sand"
              role="img"
              aria-label={`${row.label}: ${row.value} appointments`}
            >
              <div
                className={cn('h-full rounded-pill', row.bar)}
                style={{ width: `${Math.round((row.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <DetailList
          columns={2}
          items={[
            { label: 'Booked service value', value: formatNaira(stats.appointments.revenue) },
            { label: 'Returning clients', value: stats.customers.returning },
          ]}
        />
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Commerce & recruitment
// ---------------------------------------------------------------------------

function CommercePanel({ stats }: { stats: DashboardStats }) {
  return (
    <Panel
      title="Commerce health"
      description="Stock figures are live across the whole catalogue, not just the window."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/products">
            Products
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        <CommerceTile
          to="/admin/orders?status=pending,confirmed,processing,ready_for_pickup"
          label="Open orders"
          value={stats.commerce.open_orders}
          hint="Not yet delivered, picked up, cancelled or returned"
        />
        <CommerceTile
          to="/admin/inventory"
          label="Units sold"
          value={stats.commerce.units_sold}
          hint="Across non-cancelled orders in the window"
        />
        <CommerceTile
          to="/admin/inventory?filter=low"
          label="Low-stock SKUs"
          value={stats.commerce.low_stock}
          hint="At or below the reorder threshold"
          tone={stats.commerce.low_stock > 0 ? 'warning' : 'default'}
        />
        <CommerceTile
          to="/admin/inventory?filter=out"
          label="Out of stock"
          value={stats.commerce.out_of_stock}
          hint="Active variants with nothing on hand"
          tone={stats.commerce.out_of_stock > 0 ? 'danger' : 'default'}
        />
      </ul>
    </Panel>
  )
}

function CommerceTile({
  to,
  label,
  value,
  hint,
  tone = 'default',
}: {
  to: string
  label: string
  value: number
  hint: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <li>
      <Link
        to={to}
        className="group flex h-full flex-col rounded-md border border-line px-4 py-3.5 transition-colors hover:border-bronze hover:bg-sand/50"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[0.8125rem] font-medium text-muted">{label}</span>
          <ArrowUpRight
            className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-bronze"
            aria-hidden
          />
        </span>
        <span className="mt-1.5 font-display text-2xl font-semibold leading-none text-ink tabular-nums">
          {value}
        </span>
        <span className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</span>
        {tone !== 'default' && (
          <Badge variant={statusTone(tone === 'danger' ? 'cancelled' : 'pending')} size="sm" className="mt-2 self-start">
            Needs attention
          </Badge>
        )}
      </Link>
    </li>
  )
}

function RecruitmentPanel({ stats }: { stats: DashboardStats }) {
  return (
    <Panel
      title="Recruitment"
      description="Vacancies live on the public careers page; applications move through the pipeline below."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/careers/applications">
            Pipeline
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      }
    >
      <DetailList
        columns={3}
        items={[
          {
            label: 'Open roles',
            value: (
              <Link to="/admin/careers" className="text-bronze-dark underline underline-offset-4">
                {stats.recruitment.open_jobs}
              </Link>
            ),
          },
          {
            label: 'Awaiting review',
            value: (
              <Link
                to="/admin/careers/applications?status=submitted,screening"
                className="text-bronze-dark underline underline-offset-4"
              >
                {stats.recruitment.awaiting_review}
              </Link>
            ),
          },
          {
            label: 'Shortlisted',
            value: (
              <Link
                to="/admin/careers/applications?status=shortlisted,interview_scheduled,interviewed"
                className="text-bronze-dark underline underline-offset-4"
              >
                {stats.recruitment.shortlisted}
              </Link>
            ),
          },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Briefcase className="size-4 text-bronze" aria-hidden />
        <p className="text-sm text-muted">
          {stats.recruitment.applications} application
          {stats.recruitment.applications === 1 ? '' : 's'} received in this window.
        </p>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link to="/admin/careers">
            <ClipboardList aria-hidden />
            Manage vacancies
          </Link>
        </Button>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Today's diary
// ---------------------------------------------------------------------------

function DiaryPanel({
  isLoading,
  isError,
  error,
  onRetry,
  rows,
  today,
}: {
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
  rows: AppointmentWithCustomer[]
  today: string
}) {
  return (
    <Panel
      title="Today's diary"
      description={`Appointments starting on ${formatDate(`${today}T00:00:00`)}, in running order.`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/bookings">
            All bookings
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      }
    >
      <AsyncSection
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={onRetry}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={<CalendarDays aria-hidden />}
            title="No appointments on the floor today"
            description="Walk-ins and phone bookings can still be added from a stylist's diary."
          />
        }
        skeleton={<div className="h-48 animate-pulse rounded-md bg-sand/60" />}
      >
        <Table>
          <caption className="sr-only">Today's appointments</caption>
          <THead>
            <tr>
              <TH scope="col">Time</TH>
              <TH scope="col">Client</TH>
              <TH scope="col">Service</TH>
              <TH scope="col">Stylist</TH>
              <TH scope="col">Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap font-medium tabular-nums text-ink">
                  {formatTime(row.starts_at)}
                </TD>
                <TD className="max-w-[10rem] truncate">
                  <Link
                    to={`/admin/bookings/${row.id}`}
                    className="font-medium text-ink transition-colors hover:text-bronze-dark"
                  >
                    {row.customer?.full_name ?? row.reference}
                  </Link>
                </TD>
                <TD className="max-w-[12rem] truncate text-sm">
                  {row.service?.name ?? '—'}
                </TD>
                <TD>
                  <span className="flex items-center gap-2">
                    {row.staff ? (
                      <>
                        <Avatar src={row.staff.photo_url} name={row.staff.full_name} size="xs" />
                        <span className="max-w-[8rem] truncate text-sm">{row.staff.full_name}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted">Unassigned</span>
                    )}
                  </span>
                </TD>
                <TD>
                  <StatusBadge status={row.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AsyncSection>
    </Panel>
  )
}
