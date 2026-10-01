import { useEffect, useState } from 'react'
import { AlertTriangle, HeartPulse, Save, ShieldCheck, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { updateRequirement } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { formatDate, formatDateTime, humanise, formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  Textarea,
  Label,
} from '@/components/ui'
import { Avatar, MediaFrame } from '@/components/shared/MediaFrame'
import { requirementMedia } from './staffData'
import { STAFF_QUERY_ROOTS } from './staffKeys'
import {
  APPOINTMENT_STATUS_LABEL,
  healthFlags,
  REQUIREMENT_STATUS_LABEL,
  type RequirementWithMedia,
  type StaffAppointment,
} from './staffTypes'

/**
 * The brief a stylist reads before the client sits down.
 *
 * Health and safety is deliberately the first block: allergies and scalp
 * conditions change what may be used on the head, so they are rendered before
 * the desired outcome rather than as a footnote.
 */
export function RequirementSheet({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: StaffAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const requirement = appointment?.requirement ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {appointment && (
        <SheetContent side="right" title="Client requirement">
          <SheetHeader>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                {REQUIREMENT_STATUS_LABEL[requirement?.status ?? 'draft']}
              </p>
              <p className="truncate font-display text-base font-semibold text-ink">
                {appointment.customer?.full_name ?? 'Client'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:bg-sand hover:text-ink"
              aria-label="Close requirement"
            >
              <X className="size-4.5" />
            </button>
          </SheetHeader>

          <SheetBody className="space-y-6">
            <AppointmentLine appointment={appointment} />

            {requirement ? (
              <RequirementBody appointment={appointment} requirement={requirement} />
            ) : (
              <Alert variant="neutral" title="No requirement submitted">
                This client booked without completing a brief. Ask them about hair
                history, allergies and desired outcome before you start.
              </Alert>
            )}
          </SheetBody>
        </SheetContent>
      )}
    </Sheet>
  )
}

function AppointmentLine({ appointment }: { appointment: StaffAppointment }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={appointment.customer?.full_name ?? 'Client'} src={appointment.customer?.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {appointment.service?.name ?? 'Salon service'}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {formatDateTime(appointment.starts_at)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Ref {appointment.reference} · {APPOINTMENT_STATUS_LABEL[appointment.status]}
        </p>
      </div>
    </div>
  )
}

function RequirementBody({
  appointment,
  requirement,
}: {
  appointment: StaffAppointment
  requirement: RequirementWithMedia
}) {
  const flags = healthFlags(requirement)
  const queryClient = useQueryClient()
  const [response, setResponse] = useState(requirement.staff_response ?? '')

  // Re-seed the textarea when a different brief is opened.
  useEffect(() => {
    setResponse(requirement.staff_response ?? '')
  }, [requirement.id, requirement.staff_response])

  const save = useMutation({
    mutationFn: (patch: { status?: RequirementWithMedia['status']; staff_response?: string }) =>
      updateRequirement(requirement.id, patch),
    onSuccess: () => {
      toast.success('Requirement updated')
      for (const root of STAFF_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not save that change.'))
    },
  })

  const media = requirementMedia(requirement)

  return (
    <div className="space-y-6">
      {/* Health and safety first ---------------------------------------- */}
      {flags.flagged ? (
        <Alert variant="danger" title="Health and safety — read before you start">
          <ul className="mt-1 space-y-1.5">
            {flags.allergies.length > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Allergies:</strong> {flags.allergies.join(', ')}
                </span>
              </li>
            )}
            {flags.scalp.length > 0 && (
              <li className="flex items-start gap-2">
                <HeartPulse className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Scalp conditions:</strong> {flags.scalp.join(', ')}
                </span>
              </li>
            )}
            {flags.medications && (
              <li className="flex items-start gap-2">
                <HeartPulse className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Medications:</strong> {flags.medications}
                </span>
              </li>
            )}
          </ul>
          {requirement.patch_test_done && (
            <p className="mt-2 text-xs">
              Patch test on file{requirement.patch_test_at ? ` (${formatDate(requirement.patch_test_at)})` : ''}.
            </p>
          )}
        </Alert>
      ) : (
        <Alert variant="success" title="No allergies or scalp conditions flagged">
          <span className="flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden />
            Still confirm verbally at the chair.
          </span>
        </Alert>
      )}

      {requirement.accessibility_needs && (
        <Alert variant="info" title="Accessibility needs">
          {requirement.accessibility_needs}
        </Alert>
      )}

      {/* Current state --------------------------------------------------- */}
      <Block title="Current state">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <Row label="Length" value={requirement.current_length} />
          <Row label="Texture" value={humanise(requirement.current_texture)} />
          <Row label="Colour" value={requirement.current_colour} />
          <Row
            label="Density"
            value={
              requirement.current_density
                ? `${requirement.current_density} of 5`
                : null
            }
          />
          <Row label="Last treatment" value={requirement.last_treatment} />
          <Row
            label="Treated on"
            value={
              requirement.last_treated_at ? formatDate(requirement.last_treated_at) : null
            }
          />
        </dl>
        {requirement.previous_salon_notes && (
          <Note>“{requirement.previous_salon_notes}”</Note>
        )}
      </Block>

      {/* Desired outcome ------------------------------------------------- */}
      <Block title="Desired outcome">
        <p className="font-display text-base font-semibold text-ink">
          {requirement.desired_style}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <Row label="Length" value={requirement.desired_length} />
          <Row label="Texture" value={humanise(requirement.desired_texture)} />
          <Row label="Colour" value={requirement.desired_colour} />
          <Row
            label="Budget"
            value={budgetLabel(requirement.budget_min, requirement.budget_max)}
          />
        </dl>

        {requirement.hair_goals.length > 0 && (
          <div className="mt-3.5">
            <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Hair goals
            </p>
            <div className="flex flex-wrap gap-1.5">
              {requirement.hair_goals.map((goal) => (
                <Badge key={goal} size="sm" variant="accent">
                  {humanise(goal)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {requirement.is_flexible_on_date && (
          <p className="mt-3 text-xs text-muted">
            This client is flexible on the date — an earlier slot would be welcome.
          </p>
        )}
      </Block>

      {requirement.inspiration_notes && (
        <Block title="Inspiration notes">
          <p className="text-sm leading-relaxed text-ink-soft">
            {requirement.inspiration_notes}
          </p>
        </Block>
      )}

      {/* Reference images ------------------------------------------------ */}
      <Block title="Reference images">
        {media.length === 0 ? (
          <p className="text-sm text-muted">No images attached.</p>
        ) : (
          <ReferenceGrid media={media} />
        )}
      </Block>

      {/* Staff actions ---------------------------------------------------- */}
      <Block title="Your response">
        <Label htmlFor="staff-response">
          Private note — visible to staff only
        </Label>
        <Textarea
          id="staff-response"
          className="mt-1.5"
          rows={4}
          value={response}
          placeholder="Formula notes, product choices, what to check at the chair…"
          onChange={(event) => setResponse(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() => save.mutate({ staff_response: response })}
          >
            <Save className="size-3.5" aria-hidden />
            Save note
          </Button>
          {requirement.status === 'submitted' && (
            <Button
              size="sm"
              variant="outline"
              loading={save.isPending}
              onClick={() => save.mutate({ status: 'under_review' })}
            >
              <ShieldCheck className="size-3.5" aria-hidden />
              Mark as reviewed
            </Button>
          )}
          {requirement.status === 'under_review' && (
            <Badge variant="success" size="md">
              Marked reviewed
            </Badge>
          )}
        </div>
      </Block>

      {save.isError && (
        <Alert variant="danger" title="Could not save">
          {errorMessage(save.error)}
        </Alert>
      )}

      <p className="pb-2 text-xs text-muted">
        Submitted{' '}
        {requirement.submitted_at ? formatDate(requirement.submitted_at) : '—'}
        {requirement.reviewed_at ? ` · reviewed ${formatDate(requirement.reviewed_at)}` : ''}
        {' · '}
        <span className="capitalize">{requirement.status.replace('_', ' ')}</span>
      </p>

      <span className="sr-only">
        Requirement for {appointment.customer?.full_name ?? 'client'} on{' '}
        {formatDateTime(appointment.starts_at)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-line pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('truncate font-medium capitalize text-ink', !value && 'text-faint')}>
        {value || 'Not stated'}
      </dd>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-bronze pl-3 text-sm italic leading-relaxed text-muted">
      {children}
    </p>
  )
}

function budgetLabel(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  if (min && max) return `${formatNaira(min, { compact: true })} – ${formatNaira(max, { compact: true })}`
  return formatNaira(min ?? max, { compact: true })
}

/**
 * Reference thumbnails. Clicking one opens a Dialog lightbox so a stylist can
 * inspect length and texture properly rather than squinting at a 96px tile.
 */
function ReferenceGrid({
  media,
}: {
  media: NonNullable<ReturnType<typeof requirementMedia>>
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const active = lightbox === null ? null : media[lightbox] ?? null

  return (
    <>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {media.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setLightbox(index)}
              className="group block w-full overflow-hidden rounded-md border border-line transition-colors hover:border-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
              aria-label={`Open reference image ${index + 1} of ${media.length}${item.caption ? `: ${item.caption}` : ''}`}
            >
              <MediaFrame
                src={item.public_url}
                alt={item.caption ?? `Client reference ${index + 1}`}
                seed={item.storage_path}
                aspect="square"
                rounded
                imgClassName="transition-transform duration-300 group-hover:scale-[1.05]"
              />
            </button>
            {item.caption && (
              <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-snug text-muted">
                {item.caption}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={active !== null} onOpenChange={(next) => !next && setLightbox(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              Reference {active ? (media.findIndex((m) => m.id === active.id) + 1) : ''} of{' '}
              {media.length}
            </DialogTitle>
            {active?.caption && (
              <p className="text-sm text-muted">{active.caption}</p>
            )}
          </DialogHeader>
          <DialogBody className="bg-sand/60 p-4">
            {active && (
              <MediaFrame
                src={active.public_url}
                alt={active.caption ?? 'Client reference image'}
                seed={active.storage_path}
                aspect="4/3"
                rounded
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
