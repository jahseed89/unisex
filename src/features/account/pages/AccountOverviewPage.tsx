import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Compass,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Sparkles,
  UserRound,
} from 'lucide-react'

import { listAppointments, listNotifications, listOrders, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDateTime, formatNaira, formatRelative, humanise } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState, Skeleton, statusTone } from '@/components/ui'
import { AppointmentSummary } from '@/components/shared/Cards'
import { AccountSection, SectionLink } from '@/features/account/components/AccountSection'
import { QuickAction } from '@/features/account/components/AccountRows'
import { CancelAppointmentDialog } from '@/features/account/components/CancelAppointmentDialog'
import { RescheduleDialog } from '@/features/account/components/RescheduleDialog'
import { directionsLink, isModifiable, statusLabel } from '@/features/account/components/accountUi'

/**
 * Account overview.
 *
 * One screen that answers the four things a returning client actually wants:
 * when am I next in the chair, what is on the way, what did I order, and what
 * has the studio told me. Everything below is a short, bounded query — the page
 * deliberately never loads the full history.
 */
export default function AccountOverviewPage() {
  const { user, profile } = useAuth()
  const userId = user?.id

  useSeo({
    title: 'Your account',
    description: 'Manage your appointments, orders and saved hair at Black Chery Unisex Studio.',
    path: '/account',
    noindex: true,
  })

  const nextQuery = useQuery({
    queryKey: qk.appointments(userId ?? 'anonymous', 'next'),
    queryFn: () => listAppointments(userId!, { upcomingOnly: true, limit: 1 }),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const ordersQuery = useQuery({
    queryKey: qk.orders(userId ?? 'anonymous'),
    queryFn: () => listOrders(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const notificationsQuery = useQuery({
    queryKey: qk.notifications(userId ?? 'anonymous'),
    queryFn: () => listNotifications(userId!, { limit: 3 }),
    enabled: Boolean(userId),
    staleTime: 30_000,
  })

  const next = nextQuery.data?.[0]
  const orders = (ordersQuery.data ?? []).slice(0, 2)
  const notifications = notificationsQuery.data ?? []
  const loading = nextQuery.isLoading || ordersQuery.isLoading || notificationsQuery.isLoading
  const error = nextQuery.error ?? ordersQuery.error ?? notificationsQuery.error

  // A brand-new account has none of these — say so plainly rather than showing
  // three empty panels.
  const brandNew =
    !loading &&
    !error &&
    next === undefined &&
    orders.length === 0 &&
    notifications.length === 0

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-10">
      {/* Greeting ------------------------------------------------------- */}
      <header>
        <p className="eyebrow mb-2.5">Your account</p>
        <h1 className="display-section">Hello, {firstName}</h1>
        <p className="lede mt-3">
          {next
            ? `Your next appointment is ${formatDateTime(next.starts_at).toLowerCase()}.`
            : 'Nothing booked yet — your chair is open whenever you are ready.'}
        </p>
      </header>

      {loading && <OverviewSkeleton />}

      {!loading && error && (
        <Alert
          variant="danger"
          title="We could not load your dashboard"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void nextQuery.refetch()
                void ordersQuery.refetch()
                void notificationsQuery.refetch()
              }}
            >
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      )}

      {/* Brand-new account ---------------------------------------------- */}
      {!loading && !error && brandNew && (
        <Card className="border-dashed bg-sand/40 p-8 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface text-bronze shadow-xs">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <h2 className="font-display text-xl font-semibold text-ink">Your account is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            Everything here fills in as you go. Start with a booking and we will keep your
            requirements, references and reminders on file for next time — no re-explaining at the
            counter.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link to="/book">Book your first appointment</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/account/profile">Add your hair profile</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Next appointment ------------------------------------------------ */}
      {!loading && !error && next && (
        <AccountSection
          id="next-appointment"
          title="Your next appointment"
          description="Everything your stylist needs is already attached to this booking."
          action={<SectionLink to="/account/appointments" label="All appointments" />}
        >
          <Card className="p-5 md:p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
              <AppointmentSummary appointment={next} />

              <NextAppointmentActions appointment={next} />
            </div>
          </Card>
        </AccountSection>
      )}

      {/* Quick actions --------------------------------------------------- */}
      {!loading && !error && (
        <AccountSection
          id="quick-actions"
          title="Quick actions"
          description="The four things most clients come here to do."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickAction
              to="/book"
              icon={<CalendarPlus className="size-4.5" aria-hidden />}
              label="Book an appointment"
              description="Pick a service, a stylist and a time."
            />
            <QuickAction
              to="/shop"
              icon={<Package className="size-4.5" aria-hidden />}
              label="Shop"
              description="Bundles, units and salon-grade care."
            />
            <QuickAction
              to="/account/wishlist"
              icon={<Heart className="size-4.5" aria-hidden />}
              label="Wishlist"
              description="The pieces you saved for later."
            />
            <QuickAction
              to="/account/profile"
              icon={<UserRound className="size-4.5" aria-hidden />}
              label="Edit profile"
              description="Hair profile, preferences and privacy."
            />
          </div>
        </AccountSection>
      )}

      {/* Recent orders --------------------------------------------------- */}
      {!loading && !error && orders.length > 0 && (
        <AccountSection
          id="recent-orders"
          title="Recent orders"
          action={<SectionLink to="/account/orders" label="All orders" />}
        >
          <ul className="divide-y divide-line border-y border-line">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/account/orders/${order.id}`}
                      className="font-display text-base font-semibold text-ink hover:text-bronze-dark"
                    >
                      {order.order_number}
                    </Link>
                    <Badge variant={statusTone(order.status)} size="sm" dot>
                      {statusLabel(order.status)}
                    </Badge>
                    <Badge variant={statusTone(order.payment_status)} size="sm">
                      {statusLabel(order.payment_status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Placed {formatRelative(order.placed_at)} ·{' '}
                    {order.fulfilment_type === 'pickup' ? 'Studio pickup' : 'Delivery'} ·{' '}
                    {formatNaira(order.total)}
                  </p>
                </div>

                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link to={`/account/orders/${order.id}`}>Track order</Link>
                </Button>
              </li>
            ))}
          </ul>
        </AccountSection>
      )}

      {/* Notifications --------------------------------------------------- */}
      {!loading && !error && (
        <AccountSection
          id="recent-notifications"
          title="Latest from the studio"
          action={<SectionLink to="/account/notifications" label="All notifications" />}
        >
          {notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-5" aria-hidden />}
              title="Nothing new"
              description="Booking reminders, order updates and offers will land here."
            />
          ) : (
            <ul className="space-y-2.5">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    to={notification.action_url ?? '/account/notifications'}
                    className={`flex items-start gap-3 rounded-md border p-3.5 transition-colors hover:border-bronze ${
                      notification.is_read
                        ? 'border-line bg-surface'
                        : 'border-bronze/25 bg-bronze/[0.05]'
                    }`}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blush/60 text-bronze-dark">
                      <MessageCircle className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {notification.title}
                        </span>
                        {!notification.is_read && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-bronze"
                            aria-label="Unread"
                          />
                        )}
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[0.6875rem] text-faint">
                        {formatRelative(notification.created_at)} ·{' '}
                        {humanise(notification.category)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AccountSection>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Next appointment actions
// ---------------------------------------------------------------------------
function NextAppointmentActions({ appointment }: { appointment: AppointmentLike }) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const modifiable = isModifiable(appointment.status)
  const directions = appointment.location
    ? directionsLink(appointment.location)
    : directionsLink({})

  return (
    <div className="flex flex-col gap-2.5 lg:w-52">
      {modifiable ? (
        <>
          <Button variant="accent" size="lg" onClick={() => setRescheduleOpen(true)}>
            <CalendarDays className="size-4" aria-hidden />
            Reschedule
          </Button>
          <Button variant="outline" size="lg" onClick={() => setCancelOpen(true)}>
            Cancel appointment
          </Button>
        </>
      ) : (
        <Alert variant="neutral">
          This appointment is {statusLabel(appointment.status).toLowerCase()}, so it can no longer be
          moved. Book a new time whenever you are ready.
        </Alert>
      )}

      <Button asChild variant="outline" size="lg">
        <a href={directions} target="_blank" rel="noopener noreferrer">
          <MapPin className="size-4" aria-hidden />
          Get directions
        </a>
      </Button>

      <Button asChild variant="ghost" size="lg">
        <Link to={`/services/${appointment.service?.slug ?? ''}`}>
          <Compass className="size-4" aria-hidden />
          About this service
        </Link>
      </Button>

      <RescheduleDialog
        appointment={appointment}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
      <CancelAppointmentDialog
        appointment={appointment}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  )
}

/** Structural type so the action block does not depend on the joined row. */
type AppointmentLike = Parameters<typeof AppointmentSummary>[0]['appointment']

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function OverviewSkeleton() {
  return (
    <div className="space-y-10" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="flex gap-4">
            <Skeleton className="size-20 rounded-lg" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-5 h-px w-full" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[5.5rem] rounded-lg" />
        ))}
      </div>
    </div>
  )
}
