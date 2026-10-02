import { Mail, MessageCircle, Phone, X } from 'lucide-react'

import {
  formatDate,
  formatDateTime,
  formatNaira,
  whatsappLink,
} from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import {
  Badge,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  statusTone,
} from '@/components/ui'
import { Avatar } from '@/components/shared/MediaFrame'
import { APPOINTMENT_STATUS_LABEL, type StaffAppointment } from './staffTypes'

/** A client derived from a stylist's own diary — see `StaffClientsPage`. */
export interface DerivedClient {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  visits: StaffAppointment[]
}

/**
 * Client detail: contact points, the history a stylist can actually see, and a
 * one-tap WhatsApp thread. A stylist has no legitimate need to reach the rest of
 * the studio's client book, so nothing outside their own diary appears here.
 */
export function ClientSheet({
  client,
  open,
  onOpenChange,
}: {
  client: DerivedClient | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {client && (
        <SheetContent side="right" title="Client details">
          <SheetHeader>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={client.fullName} size="md" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-ink">
                  {client.fullName}
                </p>
                <p className="text-xs text-muted">
                  {client.visits.length} {client.visits.length === 1 ? 'visit' : 'visits'} with you
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:bg-sand hover:text-ink"
              aria-label="Close client details"
            >
              <X className="size-4.5" />
            </button>
          </SheetHeader>

          <SheetBody className="space-y-6">
            <div className="space-y-2">
              {client.phone && (
                <a
                  href={whatsappLink(`Hi ${client.fullName.split(' ')[0]}, it's from Black Chery Unisex Studio.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3.5 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                >
                  <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
                  <span className="truncate">{client.phone}</span>
                  <span className="ml-auto shrink-0 text-xs font-medium text-bronze-dark">
                    WhatsApp
                  </span>
                </a>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone.replace(/\s/g, '')}`}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3.5 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                >
                  <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
                  <span className="truncate">Call {client.phone}</span>
                </a>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3.5 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                >
                  <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
                  <span className="truncate">{client.email}</span>
                </a>
              )}
              {!client.phone && !client.email && (
                <p className="text-sm text-muted">
                  This client booked without contact details on file.
                </p>
              )}
            </div>

            <section>
              <h3 className="mb-3 border-b border-line pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Appointment history
              </h3>
              <ul className="space-y-2.5">
                {client.visits.map((visit) => (
                  <li
                    key={visit.id}
                    className="rounded-md border border-line bg-surface p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {visit.service?.name ?? 'Salon service'}
                      </p>
                      <Badge size="sm" variant={statusTone(visit.status)}>
                        {APPOINTMENT_STATUS_LABEL[visit.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(visit.starts_at)} · {formatDuration(visit.duration_minutes)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(visit.starts_at)}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums">
                      {formatNaira(visit.total)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </SheetBody>
        </SheetContent>
      )}
    </Sheet>
  )
}
