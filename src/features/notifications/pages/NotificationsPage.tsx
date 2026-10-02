import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BellOff,
  Briefcase,
  CheckCheck,
  Package,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  qk,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatRelative, humanise } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import {
  NOTIFICATION_FILTERS,
  dayBucket,
  type NotificationFilter,
} from '@/features/account/components/accountUi'
import type { AppNotification, NotificationCategory } from '@/types'

/**
 * Notification inbox.
 *
 * Grouped Today / Yesterday / Earlier because a chronological flat list is
 * unreadable past about a dozen items. Marking read is optimistic — the unread
 * badge in the shell needs to drop the instant you tap, and the query is
 * refetched regardless so a failure self-corrects.
 */

const BUCKETS = ['Today', 'Yesterday', 'Earlier'] as const

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  booking: Bell,
  commerce: Package,
  recruitment: Briefcase,
  promotional: Sparkles,
  general: Bell,
  system: BellOff,
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<NotificationFilter>('all')

  useSeo({
    title: 'Notifications',
    description: 'Booking updates, order tracking and studio news from Black Chery Unisex Studio.',
    path: '/account/notifications',
    noindex: true,
  })

  const query = useQuery({
    queryKey: qk.notifications(userId ?? 'anonymous'),
    queryFn: () => listNotifications(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: qk.notifications(userId!) })
    await queryClient.invalidateQueries({ queryKey: qk.unreadCount(userId!) })
  }

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      // Optimistic: flip the row locally before the write lands.
      await queryClient.cancelQueries({ queryKey: qk.notifications(userId!) })
      const previous = queryClient.getQueryData<AppNotification[]>(qk.notifications(userId!))
      queryClient.setQueryData<AppNotification[]>(qk.notifications(userId!), (rows) =>
        (rows ?? []).map((row) => (row.id === id ? { ...row, is_read: true } : row)),
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.notifications(userId!), context.previous)
      }
      toast.error(errorMessage(error, 'We could not mark that as read.'))
    },
    onSuccess: invalidate,
  })

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(userId!),
    onSuccess: async () => {
      toast.success('All caught up')
      await invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not mark everything as read.'))
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not delete that notification.'))
    },
  })

  const all = useMemo(() => query.data ?? [], [query.data])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'all':
        return all
      case 'unread':
        return all.filter((row) => !row.is_read)
      default:
        return all.filter((row) => row.category === filter)
    }
  }, [all, filter])

  const grouped = useMemo(() => {
    const map = new Map<(typeof BUCKETS)[number], AppNotification[]>()
    for (const bucket of BUCKETS) map.set(bucket, [])
    for (const row of filtered) map.get(dayBucket(row.created_at))?.push(row)
    return map
  }, [filtered])

  const unreadCount = all.filter((row) => !row.is_read).length
  const counts = useMemo(
    () => ({
      all: all.length,
      unread: unreadCount,
      booking: all.filter((row) => row.category === 'booking').length,
      commerce: all.filter((row) => row.category === 'commerce').length,
      recruitment: all.filter((row) => row.category === 'recruitment').length,
    }),
    [all, unreadCount],
  )

  const isEmpty = !query.isLoading && !query.isError && all.length === 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2.5">Stay in the loop</p>
          <h1 className="display-section">Notifications</h1>
          <p className="lede mt-3">
            Booking confirmations, order updates and studio news — in one place.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="lg"
            className="shrink-0"
            loading={markAll.isPending}
            loadingText="Marking…"
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        )}
      </header>

      {query.isLoading && <NotificationsSkeleton />}

      {!query.isLoading && query.isError && (
        <Alert
          variant="danger"
          title="We could not load your notifications"
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
          icon={<BellOff className="size-5" aria-hidden />}
          title="Nothing to read"
          description="When you book, order or apply for a role, everything the studio sends you lands here. You can pick which channels we use from your profile."
          action={
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/book">Book an appointment</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/account/profile">Notification settings</Link>
              </Button>
            </div>
          }
        />
      )}

      {!query.isLoading && !query.isError && all.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter notifications">
            {NOTIFICATION_FILTERS.map((entry) => {
              const count = counts[entry.value]
              const active = filter === entry.value

              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={count === 0 && entry.value !== 'all'}
                  onClick={() => setFilter(entry.value)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                    count === 0 && entry.value !== 'all' && 'opacity-40',
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      'rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
                      active ? 'bg-white/15' : 'bg-sand text-muted',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<BellOff className="size-5" aria-hidden />}
              title={
                filter === 'unread' ? 'Nothing unread' : `No ${filter} notifications`
              }
              description={
                filter === 'unread'
                  ? 'You are completely up to date.'
                  : 'Nothing in this category yet. Try another filter.'
              }
              action={
                <Button variant="outline" size="lg" onClick={() => setFilter('all')}>
                  Show everything
                </Button>
              }
            />
          ) : (
            <div className="space-y-8">
              {BUCKETS.map((bucket) => {
                const rows = grouped.get(bucket) ?? []
                if (rows.length === 0) return null

                return (
                  <section key={bucket} aria-labelledby={`bucket-${bucket}`}>
                    <h2
                      id={`bucket-${bucket}`}
                      className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {bucket}
                    </h2>
                    <ul className="space-y-2">
                      {rows.map((row) => (
                        <li key={row.id}>
                          <NotificationRow
                            notification={row}
                            isPending={markOne.isPending && markOne.variables === row.id}
                            isDeleting={remove.isPending && remove.variables === row.id}
                            onOpen={() => {
                              if (!row.is_read) markOne.mutate(row.id)
                            }}
                            onDelete={() => remove.mutate(row.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
function NotificationRow({
  notification,
  onOpen,
  onDelete,
  isPending,
  isDeleting,
}: {
  notification: AppNotification
  onOpen: () => void
  onDelete: () => void
  isPending: boolean
  isDeleting: boolean
}) {
  const Icon = CATEGORY_ICON[notification.category] ?? Bell
  const highPriority = notification.priority === 'high' || notification.priority === 'critical'

  // Deep links are authored internally, so a non-internal target is ignored
  // rather than followed.
  const safeHref = notification.action_url?.startsWith('/') ? notification.action_url : null

  const body = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
          notification.is_read ? 'bg-sand text-muted' : 'bg-bronze/[0.14] text-bronze-dark',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'text-sm leading-snug',
              notification.is_read ? 'text-ink-soft' : 'font-semibold text-ink',
            )}
          >
            {notification.title}
          </span>
          {!notification.is_read && (
            <span className="size-2 shrink-0 rounded-full bg-bronze" aria-label="Unread" />
          )}
          {highPriority && (
            <Badge size="sm" variant="accent">
              {notification.priority === 'critical' ? 'Urgent' : 'Important'}
            </Badge>
          )}
        </span>

        {notification.body && (
          <span className="mt-1 block text-sm leading-relaxed text-muted">{notification.body}</span>
        )}

        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-faint">
          <time dateTime={notification.created_at} title={formatDate(notification.created_at, 'PPPp')}>
            {formatRelative(notification.created_at)}
          </time>
          <span>{humanise(notification.category)}</span>
        </span>
      </span>
    </>
  )

  return (
    <Card
      className={cn(
        'flex items-start gap-3.5 p-4 transition-colors',
        notification.is_read ? 'bg-surface' : 'border-bronze/25 bg-bronze/[0.05]',
      )}
    >
      {safeHref ? (
        <Link
          to={safeHref}
          onClick={onOpen}
          aria-busy={isPending || undefined}
          className="flex min-w-0 flex-1 items-start gap-3.5"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={isPending || notification.is_read}
          aria-busy={isPending || undefined}
          className="flex min-w-0 flex-1 items-start gap-3.5 text-left disabled:cursor-default"
        >
          {body}
        </button>
      )}

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        {notification.action_label && safeHref && (
          <Button asChild variant="subtle" size="sm">
            <Link to={safeHref} onClick={onOpen}>
              {notification.action_label}
            </Link>
          </Button>
        )}

        {!notification.is_read && (
          <Button
            variant="ghost"
            size="sm"
            loading={isPending}
            onClick={onOpen}
            className="!px-2"
          >
            <span className="sr-only">Mark “{notification.title}” as read</span>
            <CheckCheck className="size-4" aria-hidden />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          loading={isDeleting}
          onClick={onDelete}
          className="!px-2 hover:text-danger"
        >
          <span className="sr-only">Delete “{notification.title}”</span>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function NotificationsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-11 w-24 rounded-pill" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex gap-3.5 rounded-lg border border-line bg-surface p-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
