import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { cancelAppointment, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { formatDateTime, formatNaira } from '@/lib/utils/format'
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
  Field,
  Textarea,
} from '@/components/ui'
import { hoursUntil, insideCancellationWindow } from './accountUi'
import type { AppointmentDetail } from '@/types'

/**
 * Cancellation confirmation.
 *
 * The warning about the 24-hour window is the important part: inside it the
 * deposit is forfeited, so the copy says so plainly rather than hiding it in a
 * policy page. The reason is optional — it goes straight to
 * `fn_cancel_appointment` and lands on the appointment row.
 */
export function CancelAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  trigger,
}: {
  appointment: AppointmentDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  // A fresh reason per opening, so a previous one never silently carries over.
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const late = insideCancellationWindow(appointment.starts_at)
  const hours = Math.max(0, Math.floor(hoursUntil(appointment.starts_at)))

  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, reason.trim() || undefined),
    onSuccess: async () => {
      toast.success('Appointment cancelled', {
        description:
          appointment.deposit_paid > 0
            ? `Your ₦${formatNaira(appointment.deposit_paid).replace('₦', '')} deposit is handled by our refunds policy.`
            : undefined,
      })
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: qk.appointments(appointment.customer_id) })
      await queryClient.invalidateQueries({ queryKey: qk.appointment(appointment.id) })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not cancel that appointment.'))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>
            {appointment.service?.name ?? 'Your service'} · {formatDateTime(appointment.starts_at)}
            {appointment.staff ? ` with ${appointment.staff.full_name}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {late ? (
            <Alert variant="warning" title={`Only ${hours} hour${hours === 1 ? '' : 's'} away`}>
              This is inside our {site.policy.cancellationWindowHours}-hour cancellation window
              {appointment.deposit_paid > 0
                ? `, so your ${formatNaira(appointment.deposit_paid)} deposit cannot be refunded`
                : ''}
              . If you can wait, rescheduling keeps everything intact.
            </Alert>
          ) : (
            <Alert variant="info" title="Free to cancel">
              You are outside the {site.policy.cancellationWindowHours}-hour window, so nothing is
              charged.
            </Alert>
          )}

          <Field
            label="Reason (optional)"
            htmlFor="cancel-reason"
            hint="It helps us plan the diary — for example “something came up” or “booked elsewhere”."
          >
            <Textarea
              id="cancel-reason"
              rows={3}
              maxLength={400}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Let us know why, if you would like to."
            />
          </Field>

          <p className="text-xs leading-relaxed text-muted">
            This cannot be undone. You can always book another time — and your requirement and
            references stay on file for next time.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep appointment
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Yes, cancel it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
