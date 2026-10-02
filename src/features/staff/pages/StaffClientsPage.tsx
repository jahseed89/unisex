import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/AuthProvider'
import { qk } from '@/lib/api'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatNaira, whatsappLink } from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import { errorMessage } from '@/lib/supabase/errors'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeading,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/shared/MediaFrame'
import { ClientSheet, type DerivedClient } from '../components/ClientSheet'
import { fetchAllBookings, shiftDay, todayKey } from '../components/staffData'
import type { StaffAppointment } from '../components/staffTypes'

/** How far back the client book is derived. Roughly two years of chair time. */
const HISTORY_DAYS = 730

/**
 * A stylist's own clients, derived from their diary.
 *
 * CONTRACT GAP / FOLLOW-UP: `listCustomers` in `@/lib/api/admin` reads every
 * profile in the studio and is intended for administrators. A stylist must not
 * see the whole client book — only the people who have sat in their chair — so
 * this screen does not call it. Instead it derives the list from `listBookings`
 * filtered to the signed-in stylist's own appointments (RLS already restricts
 * `appointments` to `staff_id = auth.uid()` for staff, so the filter is a
 * second belt rather than the only guard).
 *
 * The intended replacement is a dedicated `fn_client_summary` RPC scoped to the
 * caller's own appointments, returning `customer_id`, name, contact points,
 * visit count, last visit and lifetime value in one round trip. It should:
 *   - read only appointments where `staff_id = auth.uid()`
 *   - ignore cancelled and no-show rows when counting visits
 *   - return the profile columns directly, so no `profiles` select is needed
 *   - count visits and lifetime value server-side rather than in the client
 *
 * Until that RPC lands this derivation is accurate but chatty: one paginated
 * request per 200 appointments, capped at five pages.
 */
export default function StaffClientsPage() {
  const { user } = useAuth()
  const staffId = user?.id

  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const today = todayKey()
  const from = shiftDay(today, -HISTORY_DAYS)
  const to = today

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: qk.adminBookings({ scope: 'staff-client-book', staffId, from, to }),
    queryFn: () => fetchAllBookings({ staffId, from, to }),
    enabled: Boolean(staffId),
    staleTime: 5 * 60_000,
  })

  const clients = useMemo<DerivedClient[]>(() => deriveClients(data ?? []), [data])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clients

    return clients.filter((client) =>
      [client.fullName, client.email, client.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [clients, search])

  const selected = useMemo(
    () => clients.find((client) => client.id === openId) ?? null,
    [clients, openId],
  )

  const lifetime = clients.reduce(
    (sum, client) =>
      sum +
      client.visits
        .filter((visit) => visit.status !== 'cancelled' && visit.status !== 'no_show')
        .reduce((inner, visit) => inner + Number(visit.total || 0), 0),
    0,
  )

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Clients</p>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            My clients
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Everyone who has sat in your chair, with their last service and how
            often they come back. You see only your own book.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => void refetch()}
          loading={isFetching}
          aria-label="Refresh the client list"
        >
          {!isFetching && <RefreshCw className="size-4" aria-hidden />}
          Refresh
        </Button>
      </header>

      {/* Summary ------------------------------------------------------- */}
      {!isLoading && !error && clients.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <dt className="text-[0.8125rem] font-medium text-muted">Active clients</dt>
            <dd className="mt-2 font-display text-[1.75rem] font-semibold leading-none text-ink tabular-nums">
              {clients.length}
            </dd>
            <p className="mt-2 text-xs text-muted">Last {HISTORY_DAYS / 365} years</p>
          </Card>
          <Card className="p-5">
            <dt className="text-[0.8125rem] font-medium text-muted">Repeat visits</dt>
            <dd className="mt-2 font-display text-[1.75rem] font-semibold leading-none text-ink tabular-nums">
              {clients.filter((client) => client.visits.length > 1).length}
            </dd>
            <p className="mt-2 text-xs text-muted">Seen more than once</p>
          </Card>
          <Card className="p-5">
            <dt className="text-[0.8125rem] font-medium text-muted">Service revenue</dt>
            <dd className="mt-2 font-display text-[1.75rem] font-semibold leading-none text-ink tabular-nums">
              {formatNaira(lifetime, { compact: true })}
            </dd>
            <p className="mt-2 text-xs text-muted">Excludes cancellations</p>
          </Card>
        </dl>
      )}

      {/* Search -------------------------------------------------------- */}
      {!isLoading && !error && clients.length > 0 && (
        <div className="max-w-md">
          <label htmlFor="client-search" className="sr-only">
            Search your clients
          </label>
          <Input
            id="client-search"
            type="search"
            value={search}
            placeholder="Search by name, email or phone"
            leadingIcon={<Search aria-hidden />}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}

      {/* Error --------------------------------------------------------- */}
      {error && (
        <Alert
          variant="danger"
          title="We could not load your clients"
          action={
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      )}

      {/* Loading ------------------------------------------------------- */}
      {isLoading && !error && (
        <div className="space-y-2.5" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Card key={index} className="flex items-center gap-4 p-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-24 rounded-pill" />
            </Card>
          ))}
        </div>
      )}

      {/* Empty --------------------------------------------------------- */}
      {!isLoading && !error && clients.length === 0 && (
        <EmptyState
          icon={<Users />}
          title="No clients yet"
          description="Once you have completed appointments, everyone who has sat in your chair appears here with their history and contact details."
          action={
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/staff/diary">Open my diary</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/staff">Back to my day</Link>
              </Button>
            </div>
          }
        />
      )}

      {/* No search results --------------------------------------------- */}
      {!isLoading && !error && clients.length > 0 && visible.length === 0 && (
        <EmptyState
          icon={<Search />}
          title="No clients match that search"
          description={`We could not find “${search.trim()}” among your ${clients.length} clients. Try a phone number or part of their name.`}
          action={
            <Button size="lg" variant="outline" onClick={() => setSearch('')}>
              Clear search
            </Button>
          }
        />
      )}

      {/* List ---------------------------------------------------------- */}
      {!isLoading && !error && visible.length > 0 && (
        <section aria-live="polite">
          <SectionHeading
            as="h2"
            eyebrow={search.trim() ? 'Search results' : 'Your book'}
            title={`${visible.length} ${visible.length === 1 ? 'client' : 'clients'}`}
          />

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {visible.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onOpen={() => setOpenId(client.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <ClientSheet
        client={selected}
        open={selected !== null}
        onOpenChange={(next) => !next && setOpenId(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Collapse a flat appointment list into one record per client.
 *
 * `listBookings` is ordered newest-first, so the first row seen for a customer
 * is their most recent visit — that is what the "last service" badge uses.
 * Cancelled and no-show rows are kept in the history (a stylist should be able
 * to see that someone cancelled) but excluded from the service badge.
 *
 * Local rather than exported: `fn_client_summary` (see the header comment) will
 * replace this whole function.
 */
function deriveClients(appointments: StaffAppointment[]): DerivedClient[] {
  const byId = new Map<string, DerivedClient>()

  for (const appointment of appointments) {
    const customer = appointment.customer
    if (!customer?.id) continue

    const existing = byId.get(customer.id)
    if (existing) {
      existing.visits.push(appointment)
      continue
    }

    byId.set(customer.id, {
      id: customer.id,
      fullName: customer.full_name ?? 'Client',
      email: customer.email ?? null,
      phone: customer.phone_e164 ?? null,
      visits: [appointment],
    })
  }

  const clients = [...byId.values()]

  for (const client of clients) {
    // Newest first, so index 0 is the latest meaningful visit.
    client.visits.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    // The contact block can change between visits; the newest wins.
    for (const visit of client.visits) {
      if (!client.email && visit.customer?.email) client.email = visit.customer.email
      if (!client.phone && visit.customer?.phone_e164) client.phone = visit.customer.phone_e164
    }
  }

  return clients.sort((a, b) => {
    const aLast = a.visits[0]?.starts_at ?? ''
    const bLast = b.visits[0]?.starts_at ?? ''
    return bLast.localeCompare(aLast)
  })
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ClientRow({
  client,
  onOpen,
}: {
  client: DerivedClient
  onOpen: () => void
}) {
  const counted = client.visits.filter(
    (visit) => visit.status !== 'cancelled' && visit.status !== 'no_show',
  )
  const last = counted[0] ?? client.visits[0]
  const spend = counted.reduce((sum, visit) => sum + Number(visit.total || 0), 0)

  return (
    <li>
      <Card interactive className="h-full p-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze"
          aria-label={`Open ${client.fullName}, ${counted.length} visits`}
        >
          <Avatar name={client.fullName} size="md" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-ink">{client.fullName}</p>
              <span
                className={cn(
                  'shrink-0 text-xs font-medium tabular-nums',
                  counted.length > 1 ? 'text-success' : 'text-muted',
                )}
              >
                ×{counted.length}
              </span>
            </div>

            <p className="mt-0.5 truncate text-xs text-muted">
              {last ? `${last.service?.name ?? 'Service'} · ${formatDate(last.starts_at)}` : '—'}
            </p>

            <p className="mt-0.5 truncate text-xs text-faint tabular-nums">
              {counted.length > 0
                ? `${formatDuration(
                    counted.reduce((sum, visit) => sum + (visit.duration_minutes || 0), 0),
                  )} · ${formatNaira(spend)}`
                : 'No completed visits'}
            </p>
          </div>

          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {last && !['cancelled', 'no_show'].includes(last.status) && (
            <Badge size="sm" variant="accent">
              {last.service?.name ?? 'Service'}
            </Badge>
          )}
          {counted.length > 1 && (
            <Badge size="sm" variant="success">
              Regular
            </Badge>
          )}
          {client.phone && (
            <a
              href={whatsappLink(
                `Hi ${client.fullName.split(' ')[0]}, it's from Black Chery Unisex Studio.`,
                client.phone.replace(/^\+/, ''),
              )}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              aria-label={`Message ${client.fullName} on WhatsApp`}
              className="ml-auto flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-bronze-dark transition-colors hover:bg-sand"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              WhatsApp
            </a>
          )}
          {!client.phone && client.email && (
            <a
              href={`mailto:${client.email}`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Email ${client.fullName}`}
              className="ml-auto flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-bronze-dark transition-colors hover:bg-sand"
            >
              <Mail className="size-3.5" aria-hidden />
              Email
            </a>
          )}
        </div>
      </Card>
    </li>
  )
}

