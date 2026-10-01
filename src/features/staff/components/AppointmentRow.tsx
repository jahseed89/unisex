import { Link } from 'react-router-dom'
import { CheckCheck, ClipboardList, LogIn, PlayCircle } from 'lucide-react'

import { formatNaira, formatTime } from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import { cn } from '@/lib/utils/cn'
import { Badge, Button, Card, statusTone } from '@/components/ui'
import { Avatar } from '@/components/shared/MediaFrame'
import {
  APPOINTMENT_STATUS_LABEL,
  healthFlags,
  statusActions,
  type StaffAppointment,
} from './staffTypes'

/**
 * One chronological diary entry.
 *
 * Used by "My day" and by the diary's list view. Actions are rendered inline so
 * a stylist can walk the chair down without opening anything; the requirement
 * link is the one navigation away from the brief.
 */
export function AppointmentRow({
  appointment,
  id,
  busy = false,
  onCheckIn,
  onStart,
  onComplete,
  onCancel,
  className,
}: {
  appointment: StaffAppointment
  /** Anchor target, so "open this brief" can scroll the row into view. */
  id?: string
  /** True while any status mutation for this row is in flight. */
  busy?: boolean
  onCheckIn?: (appointment: StaffAppointment) => void
  onStart?: (appointment: StaffAppointment) => void
  onComplete?: (appointment: StaffAppointment) => void
  onCancel?: (appointment: StaffAppointment) => void
  className?: string
}) {
  const actions = statusActions(appointment.status)
  const flags = healthFlags(appointment.requirement)
  const requirement = appointment.requirement
  const customerName = appointment.customer?.full_name ?? 'Client'

  return (
    <li id={id} className={cn('relative scroll-mt-24', className)}>
      <Card
        className={cn(
          'p-4 transition-colors',
          appointment.status === 'in_progress' && 'border-bronze bg-bronze/[0.05]',
          (appointment.status === 'cancelled' || appointment.status === 'no_show') && 'opacity-70',
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Time ---------------------------------------------------------- */}
          <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
            <p className="font-display text-lg font-semibold leading-none text-ink tabular-nums">
              {formatTime(appointment.starts_at)}
            </p>
            <p className="text-xs text-muted tabular-nums">
              {formatDuration(appointment.duration_minutes)}
            </p>
          </div>

          {/* Client + service ---------------------------------------------- */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar name={customerName} src={appointment.customer?.avatar_url} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-ink">{customerName}</p>
                <Badge size="sm" variant={statusTone(appointment.status)} dot>
                  {APPOINTMENT_STATUS_LABEL[appointment.status]}
                </Badge>
                {flags.flagged && (
                  <Badge size="sm" variant="danger">
                    {flags.allergies.length > 0 ? 'Allergy' : 'Scalp note'}
                  </Badge>
                )}
                {requirement && requirement.status === 'submitted' && (
                  <Badge size="sm" variant="warning">
                    Brief unread
                  </Badge>
                )}
              </div>

              <p className="mt-0.5 truncate text-sm text-muted">
                {appointment.service?.name ?? 'Salon service'}
                {appointment.location ? ` · ${appointment.location.name}` : ''}
              </p>

              {appointment.customer_notes && (
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  “{appointment.customer_notes}”
                </p>
              )}
            </div>

            <p className="shrink-0 text-sm font-semibold text-ink tabular-nums">
              {formatNaira(appointment.balance_due || appointment.total)}
            </p>
          </div>
        </div>

        {/* Actions --------------------------------------------------------- */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {actions.length > 0 ? (
            actions.map((action) => {
              const run = () => {
                if (action.status === 'checked_in') onCheckIn?.(appointment)
                else if (action.status === 'in_progress') onStart?.(appointment)
                else if (action.status === 'completed') onComplete?.(appointment)
                else if (action.status === 'cancelled') onCancel?.(appointment)
              }

              return (
                <Button
                  key={action.status}
                  size="sm"
                  variant={action.primary ? 'solid' : 'outline'}
                  disabled={busy}
                  onClick={run}
                >
                  <ActionIcon status={action.status} />
                  {action.label}
                </Button>
              )
            })
          ) : (
            <p className="text-xs text-muted">
              {appointment.status === 'completed'
                ? 'Completed — nothing further to do.'
                : 'No further action for this appointment.'}
            </p>
          )}

          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <Link to={`/staff/requirements?appointment=${appointment.id}`}>
              <ClipboardList className="size-3.5" aria-hidden />
              {requirement ? 'View requirements' : 'No requirement'}
            </Link>
          </Button>
        </div>
      </Card>
    </li>
  )
}

function ActionIcon({ status }: { status: string }) {
  switch (status) {
    case 'checked_in':
      return <LogIn className="size-3.5" aria-hidden />
    case 'in_progress':
      return <PlayCircle className="size-3.5" aria-hidden />
    case 'completed':
      return <CheckCheck className="size-3.5" aria-hidden />
    default:
      return null
  }
}
