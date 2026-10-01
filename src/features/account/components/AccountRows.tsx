import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getStylist, qk } from '@/lib/api'
import { Avatar } from '@/components/shared/MediaFrame'

/**
 * Appointment, order and application rows share a lot of structure: a leading
 * avatar or image, a title, a meta line and a trailing status badge plus
 * actions. This is that shape once, so the account screens stay consistent and
 * stay readable on a phone.
 */

export function RowShell({
  title,
  subtitle,
  meta,
  status,
  actions,
  media,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
  media?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={
        className ??
        'flex flex-col gap-4 border-b border-line py-5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between'
      }
    >
      <div className="flex min-w-0 flex-1 gap-4">
        {media}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3 className="text-sm font-medium leading-snug text-ink">{title}</h3>
            {status}
          </div>
          {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
          {meta && <div className="mt-2 text-xs leading-relaxed text-muted">{meta}</div>}
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  )
}

/** Staff photo, resolved lazily from the public staff view. */
export function StaffAvatar({
  userId,
  name,
  size = 'sm',
}: {
  userId: string
  name: string
  size?: 'xs' | 'sm' | 'md'
}) {
  const { data } = useQuery({
    queryKey: qk.staffMember(userId),
    queryFn: () => getStylist(userId),
    staleTime: 10 * 60_000,
    enabled: Boolean(userId),
  })

  return <Avatar src={data?.photo_url} name={name} size={size} />
}

/** Quick-action tile used on the overview page and the empty states. */
export function QuickAction({
  to,
  icon,
  label,
  description,
}: {
  to: string
  icon: React.ReactNode
  label: string
  description?: string
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-[5.5rem] flex-col justify-between rounded-lg border border-line bg-surface p-4 transition-colors hover:border-bronze hover:bg-sand/40"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-blush/60 text-bronze-dark transition-colors group-hover:bg-bronze group-hover:text-white">
        {icon}
      </span>
      <span className="mt-3 block">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </Link>
  )
}
