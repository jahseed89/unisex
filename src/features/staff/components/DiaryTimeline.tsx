import { Link } from 'react-router-dom'
import { useMemo } from 'react'

import { formatTime } from '@/lib/utils/format'
import { DAY_SHORT } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { minutesFromMidnight, serviceTone } from './staffData'
import { APPOINTMENT_STATUS_LABEL, type StaffAppointment } from './staffTypes'

/**
 * Hour-column diary, built from plain CSS.
 *
 * A column per day; an absolutely-positioned block per appointment, offset by
 * its start time and sized by `duration_minutes`. No chart library is involved —
 * the geometry is a linear function of the clock, so a grid row per hour with
 * `calc()` would only add indirection.
 */

const HOUR_PX = 56
const MIN_HOUR = 8
const MAX_HOUR = 21

interface Placed {
  appointment: StaffAppointment
  top: number
  height: number
}

function placeDay(appointments: StaffAppointment[]): Placed[] {
  return appointments.map((appointment) => {
    const start = minutesFromMidnight(appointment.starts_at)
    const end = minutesFromMidnight(appointment.ends_at)
    const span = Math.max(appointment.duration_minutes || 0, end - start, 30)
    return {
      appointment,
      top: ((start - MIN_HOUR * 60) / 60) * HOUR_PX,
      height: Math.max((span / 60) * HOUR_PX, 34),
    }
  })
}

export function DiaryTimeline({
  days,
  appointmentsByDay,
}: {
  /** yyyy-MM-dd keys, left to right. */
  days: string[]
  appointmentsByDay: Map<string, StaffAppointment[]>
}) {
  const hours = useMemo(
    () => Array.from({ length: MAX_HOUR - MIN_HOUR + 1 }, (_, i) => MIN_HOUR + i),
    [],
  )
  const canvasHeight = (MAX_HOUR - MIN_HOUR) * HOUR_PX

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[42rem]">
        {/* Hour gutter ------------------------------------------------- */}
        <div className="w-14 shrink-0" aria-hidden>
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="flex items-start justify-end pr-2 text-[0.6875rem] font-medium text-faint tabular-nums"
              style={{ height: index === hours.length - 1 ? 0 : HOUR_PX }}
            >
              {hour === 12 ? '12 pm' : hour > 12 ? `${hour - 12} pm` : `${hour} am`}
            </div>
          ))}
        </div>

        {/* Day columns -------------------------------------------------- */}
        <div className="flex flex-1 gap-2">
          {days.map((key) => {
            const placed = placeDay(appointmentsByDay.get(key) ?? [])
            const dayDate = new Date(`${key}T00:00:00`)

            return (
              <div key={key} className="min-w-0 flex-1">
                <div
                  className="mb-2 border-b border-line pb-1.5 text-center"
                  aria-hidden
                >
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    {DAY_SHORT[dayDate.getDay()]}
                  </p>
                  <p className="font-display text-sm font-semibold text-ink tabular-nums">
                    {dayDate.getDate()}
                  </p>
                </div>

                <div className="relative" style={{ height: canvasHeight }}>
                  {hours.slice(0, -1).map((hour, index) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-line"
                      style={{ top: index * HOUR_PX }}
                      aria-hidden
                    />
                  ))}
                  {hours.slice(0, -1).map((hour, index) => (
                    <div
                      key={`half-${hour}`}
                      className="absolute inset-x-0 border-t border-dashed border-line/60"
                      style={{ top: index * HOUR_PX + HOUR_PX / 2 }}
                      aria-hidden
                    />
                  ))}

                  {placed.length === 0 ? (
                    <p className="absolute inset-x-0 top-2 text-center text-[0.6875rem] text-faint">
                      Free
                    </p>
                  ) : (
                    placed.map(({ appointment, top, height }) => (
                      <TimelineBlock
                        key={appointment.id}
                        appointment={appointment}
                        top={top}
                        height={height}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TimelineBlock({
  appointment,
  top,
  height,
}: {
  appointment: StaffAppointment
  top: number
  height: number
}) {
  const cancelled = appointment.status === 'cancelled' || appointment.status === 'no_show'
  const name = appointment.customer?.full_name ?? 'Client'
  const compact = height < 54

  return (
    <Link
      to={`/staff/requirements?appointment=${appointment.id}`}
      title={`${formatTime(appointment.starts_at)} · ${appointment.service?.name ?? 'Service'} · ${name}`}
      className={cn(
        'absolute inset-x-0.5 overflow-hidden rounded-md border px-2 py-1.5 shadow-xs transition-shadow',
        'hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bronze',
        serviceTone(appointment.service?.name),
        cancelled && 'opacity-50',
      )}
      style={{ top, height }}
    >
      <p className="truncate text-[0.6875rem] font-semibold leading-tight">
        {formatTime(appointment.starts_at)}
        {compact ? '' : ` – ${formatTime(appointment.ends_at)}`}
      </p>
      {!compact && (
        <p className="truncate text-[0.6875rem] font-medium leading-tight">
          {appointment.service?.name ?? 'Service'}
        </p>
      )}
      {!compact && (
        <p className="truncate text-[0.625rem] leading-tight opacity-70">{name}</p>
      )}
      {/* The block is colour-coded, so the status is carried in text for AT. */}
      <span className="sr-only">
        Status: {APPOINTMENT_STATUS_LABEL[appointment.status]}. Opens the brief.
      </span>
    </Link>
  )
}
