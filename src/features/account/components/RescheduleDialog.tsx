import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  getDaysWithAvailability,
  getSlots,
  groupSlotsByTime,
  qk,
  rescheduleAppointment,
  type TimeSlotGroup,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { formatDate, fromDateKey } from '@/lib/utils/format'
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { upcomingDayKeys } from './accountUi'
import type { AppointmentDetail } from '@/types'

/**
 * Reschedule picker.
 *
 * Reuses the booking engine rather than duplicating it: `getDaysWithAvailability`
 * decides which of the next 60 days have anything bookable, and `getSlots` +
 * `groupSlotsByTime` collapse the `(start, stylist)` rows into the same time
 * grid the booking flow renders. The write goes through `fn_reschedule_appointment`,
 * which re-validates the slot inside a transaction.
 */

const DAY_STRIP_LENGTH = 14
const PICKER_ERROR = 'That time is no longer free. Please choose another.'

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: AppointmentDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotGroup | null>(null)

  const days = useMemo(() => upcomingDayKeys(DAY_STRIP_LENGTH), [])
  const today = days[0] ?? ''
  const from = today
  const to = days[days.length - 1] ?? today

  const daysQuery = useQuery({
    queryKey: qk.slotsRange(appointment.service_id, from, to, appointment.staff_id ?? undefined),
    queryFn: () =>
      getDaysWithAvailability(
        appointment.location_id,
        appointment.service_id,
        from,
        to,
        appointment.staff_id ?? undefined,
      ),
    enabled: open,
    staleTime: 60_000,
  })

  const activeDay = selectedDay ?? from

  const slotsQuery = useQuery({
    queryKey: qk.slots(appointment.service_id, activeDay, appointment.staff_id ?? undefined),
    queryFn: () =>
      getSlots({
        locationId: appointment.location_id,
        serviceId: appointment.service_id,
        date: activeDay,
        staffId: appointment.staff_id ?? undefined,
      }),
    enabled: open,
    staleTime: 30_000,
  })

  const groups = useMemo(() => groupSlotsByTime(slotsQuery.data ?? []), [slotsQuery.data])

  // A day that no longer has availability must not stay selected.
  useEffect(() => {
    const available = daysQuery.data
    if (!available || available.length === 0) return
    if (selectedDay && !available.includes(selectedDay)) {
      setSelectedDay(null)
      setSelectedSlot(null)
    }
  }, [daysQuery.data, selectedDay])

  const reschedule = useMutation({
    mutationFn: () => {
      if (!selectedSlot) throw new Error('Choose a time first.')
      return rescheduleAppointment({
        appointmentId: appointment.id,
        newStartsAt: selectedSlot.startsAt,
        // Keep the original stylist where the new slot offers them.
        newStaffId:
          appointment.staff_id && selectedSlot.staffIds.includes(appointment.staff_id)
            ? appointment.staff_id
            : selectedSlot.staffIds[0],
      })
    },
    onSuccess: async () => {
      toast.success('Appointment moved', {
        description: selectedSlot ? formatDate(selectedSlot.startsAt, 'EEEE d MMMM, h:mm a') : undefined,
      })
      setSelectedSlot(null)
      setSelectedDay(null)
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: qk.appointments(appointment.customer_id) })
      await queryClient.invalidateQueries({ queryKey: qk.appointment(appointment.id) })
      await queryClient.invalidateQueries({ queryKey: ['slots'] })
    },
    onError: (error) => {
      toast.error(errorMessage(error, PICKER_ERROR))
      void queryClient.invalidateQueries({ queryKey: ['slots'] })
      void slotsQuery.refetch()
    },
  })

  const availableDays = daysQuery.data ?? []
  const noAvailability = !daysQuery.isLoading && availableDays.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Reschedule this appointment</DialogTitle>
          <DialogDescription>
            {appointment.service?.name ?? 'Your service'} · {formatDate(appointment.starts_at, 'EEEE d MMMM, h:mm a')}
            {appointment.staff ? ` with ${appointment.staff.full_name}` : ''}. Moving a booking keeps your
            reference and your requirement exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Day strip ---------------------------------------------------- */}
          <section aria-labelledby="reschedule-days">
            <h3
              id="reschedule-days"
              className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted"
            >
              Pick a day
            </h3>

            {daysQuery.isLoading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
                <Loader2 className="size-4 animate-[var(--animate-spin-slow)]" aria-hidden />
                Checking availability…
              </div>
            )}

            {!daysQuery.isLoading && (
              <ul className="rail -mx-1 gap-2 px-1 pb-1">
                {days.map((key) => {
                  const selectable = availableDays.includes(key)
                  const active = activeDay === key
                  const date = fromDateKey(key)

                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={!selectable}
                        onClick={() => {
                          setSelectedDay(key)
                          setSelectedSlot(null)
                        }}
                        aria-pressed={active}
                        className={cn(
                          'flex h-[4.5rem] w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-md border text-center transition-colors',
                          active
                            ? 'border-ink bg-ink text-canvas'
                            : selectable
                              ? 'border-line-strong bg-surface text-ink hover:border-ink hover:bg-sand/50'
                              : 'cursor-not-allowed border-line bg-canvas text-faint line-through',
                        )}
                      >
                        <span className="text-[0.625rem] uppercase tracking-wider">
                          {date.toLocaleDateString('en-NG', { weekday: 'short' })}
                        </span>
                        <span className="font-display text-lg font-semibold tabular-nums leading-none">
                          {date.getDate()}
                        </span>
                        <span className="text-[0.625rem] opacity-70">
                          {date.toLocaleDateString('en-NG', { month: 'short' })}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {noAvailability && (
              <Alert variant="warning" title="Nothing free in the next two weeks">
                Every slot for this service is taken. Try a different service, or message us on WhatsApp
                and we will find you something.
              </Alert>
            )}
          </section>

          {/* Time grid ---------------------------------------------------- */}
          {availableDays.includes(activeDay) && (
            <section aria-labelledby="reschedule-times">
              <h3
                id="reschedule-times"
                className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted"
              >
                {formatDate(activeDay, 'EEEE d MMMM')} · pick a time
              </h3>

              {slotsQuery.isLoading && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
                  <Loader2 className="size-4 animate-[var(--animate-spin-slow)]" aria-hidden />
                  Loading times…
                </div>
              )}

              {!slotsQuery.isLoading && slotsQuery.isError && (
                <Alert
                  variant="danger"
                  title="We could not load times for that day"
                  action={
                    <Button size="sm" variant="outline" onClick={() => void slotsQuery.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  {errorMessage(slotsQuery.error)}
                </Alert>
              )}

              {!slotsQuery.isLoading && !slotsQuery.isError && groups.length === 0 && (
                <p className="rounded-md border border-dashed border-line-strong bg-sand/40 px-4 py-6 text-sm text-muted">
                  Nothing left on this day. Pick another date above.
                </p>
              )}

              {groups.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {groups.map((group) => {
                      const active = selectedSlot?.startsAt === group.startsAt
                      return (
                        <button
                          key={group.startsAt}
                          type="button"
                          onClick={() => setSelectedSlot(group)}
                          aria-pressed={active}
                          className={cn(
                            'flex min-h-11 flex-col items-center rounded-md border px-3 py-2.5 text-sm transition-colors',
                            active
                              ? 'border-bronze bg-bronze/[0.08] font-semibold text-ink'
                              : 'border-line-strong bg-surface text-ink hover:border-ink hover:bg-sand/50',
                          )}
                        >
                          <span className="tabular-nums">{group.label}</span>
                          {group.staffCount > 1 && (
                            <span className="text-[0.6875rem] text-muted">
                              {group.staffCount} stylists
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <p className="text-xs text-muted" aria-live="polite">
                    {selectedSlot
                      ? `Moving to ${formatDate(selectedSlot.startsAt, 'EEEE d MMMM')} at ${selectedSlot.label}.`
                      : 'Tap a time to choose it.'}
                  </p>
                </>
              )}
            </section>
          )}

          <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            <CalendarClock className="mt-px size-3.5 shrink-0 text-bronze" aria-hidden />
            <span>
              Free to change up to {site.policy.cancellationWindowHours} hours before your slot. Outside
              that window the deposit is retained.
            </span>
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep current time
          </Button>
          <Button
            variant="accent"
            loading={reschedule.isPending}
            disabled={!selectedSlot}
            onClick={() => reschedule.mutate()}
          >
            {selectedSlot ? `Move to ${selectedSlot.label}` : 'Choose a time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
