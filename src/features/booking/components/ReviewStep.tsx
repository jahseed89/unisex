import type {
  BusinessSettings,
  RequirementDraft,
  SalonLocation,
  ServiceCatalogEntry,
  ServiceVariant,
} from '@/types'
import { CalendarPlus, Clock, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Alert, Badge, Button, Card, Checkbox, Divider } from '@/components/ui'
import { formatDuration } from '@/components/shared/Cards'
import { Avatar, MediaFrame } from '@/components/shared/MediaFrame'
import { formatDateTime, formatNaira } from '@/lib/utils/format'
import { downloadAppointmentIcs, siteAddressLine } from './calendar'
import { site } from '@/config/site'
import {
  COLOUR_OPTIONS,
  GOAL_OPTIONS,
  LENGTH_OPTIONS,
  SCALP_OPTIONS,
  TEXTURE_OPTIONS,
  optionLabel,
  optionLabels,
} from './requirementOptions'
import { formatBytes, type DraftImage } from './useRequirementDraft'

export interface ReviewStepProps {
  service: ServiceCatalogEntry
  variant?: ServiceVariant
  stylistName: string
  stylistPhotoUrl: string | null
  location: SalonLocation | null
  startsAt: string
  durationMinutes: number
  price: number
  settings: BusinessSettings | null
  draft: RequirementDraft
  images: DraftImage[]
  acceptedPolicy: boolean
  onAcceptedPolicyChange: (accepted: boolean) => void
  submitError: { message: string; slotTaken: boolean } | null
  onPickAnotherTime: () => void
  isSubmitting: boolean
  isAuthenticated: boolean
  signUpRedirect: string
  onSubmit: () => void
}

/**
 * Read-only review.
 *
 * Nothing here is editable — every value can be changed by stepping back to the
 * screen that owns it, which is faster than a pre-filled form and impossible to
 * submit half-updated. Money is one authoritative total with the deposit broken
 * out underneath.
 */
export function ReviewStep({
  service,
  variant,
  stylistName,
  stylistPhotoUrl,
  location,
  startsAt,
  durationMinutes,
  price,
  settings,
  draft,
  images,
  acceptedPolicy,
  onAcceptedPolicyChange,
  submitError,
  onPickAnotherTime,
  isSubmitting,
  isAuthenticated,
  signUpRedirect,
  onSubmit,
}: ReviewStepProps) {
  const depositRequired = settings?.deposit_required ?? false
  const depositPct = settings?.deposit_pct ?? 30
  const deposit = depositRequired ? Math.round((price * depositPct) / 100) : 0
  const cancellationHours = settings?.cancellation_window_hours ?? 24

  const ics = () =>
    downloadAppointmentIcs({
      id: `${service.slug}-${startsAt}`,
      title: `${service.name}${variant ? ` (${variant.label})` : ''}`,
      startsAt,
      durationMinutes,
      stylistName,
      locationLine: location
        ? `${location.name}, ${location.address_line1}, ${location.city}`
        : `${site.name}, ${siteAddressLine()}`,
    })

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
        {/* ---------------------------------------------------------------- */}
        {/* The appointment                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Card className="overflow-hidden">
          <div className="flex gap-4 p-5">
            <MediaFrame
              src={service.image_url}
              alt={service.name}
              seed={service.slug}
              aspect="1/1"
              rounded
              className="w-20 shrink-0"
            />
            <div className="min-w-0 flex-1">
              {service.category_name && (
                <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                  {service.category_name}
                </p>
              )}
              <h3 className="font-display text-lg font-semibold text-ink">{service.name}</h3>
              {variant ? (
                <p className="mt-0.5 text-sm text-muted">{variant.label}</p>
              ) : (
                <Badge variant="default" size="sm" className="mt-1.5">
                  Standard appointment
                </Badge>
              )}
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-bronze" aria-hidden />
                  {formatDateTime(startsAt)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-bronze" aria-hidden />
                  {formatDuration(durationMinutes)}
                </span>
              </div>
              {location && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="size-4 text-bronze" aria-hidden />
                  {location.name}, {location.address_line1}
                </p>
              )}
            </div>
          </div>

          <Divider />

          <dl className="divide-y divide-line">
            <SummaryRow label="Stylist">
              <span className="flex items-center justify-end gap-2">
                <Avatar src={stylistPhotoUrl} name={stylistName} size="xs" />
                {stylistName}
              </span>
            </SummaryRow>

            <SummaryRow label="Service price">{formatNaira(price)}</SummaryRow>

            {deposit > 0 && (
              <>
                <SummaryRow label={`Deposit to secure (${depositPct}%)`}>
                  {formatNaira(deposit)}
                </SummaryRow>
                <SummaryRow label="Balance due in the salon">
                  {formatNaira(Math.max(price - deposit, 0))}
                </SummaryRow>
              </>
            )}

            <SummaryRow label="Total" emphasis>
              {formatNaira(price)}
            </SummaryRow>
          </dl>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Price + policy + submit                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <Card className="p-5">
            <p className="eyebrow">Total</p>
            <p className="mt-1.5 font-display text-3xl font-semibold text-ink">
              {formatNaira(price)}
            </p>
            {deposit > 0 ? (
              <p className="mt-1.5 text-sm text-muted">
                {formatNaira(deposit)} deposit secures the slot ·{' '}
                {formatNaira(price - deposit)} in the salon
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted">No deposit needed for this booking.</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="md"
              fullWidth
              className="mt-4"
              onClick={ics}
            >
              <CalendarPlus aria-hidden />
              Add to calendar
            </Button>
          </Card>

          {submitError && (
            <Alert
              variant={submitError.slotTaken ? 'warning' : 'danger'}
              title={submitError.slotTaken ? 'That time was just taken' : 'We could not book that'}
              action={
                submitError.slotTaken ? (
                  <Button size="sm" variant="outline" onClick={onPickAnotherTime}>
                    Pick another time
                  </Button>
                ) : undefined
              }
            >
              {submitError.message}
            </Alert>
          )}

          {!isAuthenticated && (
            <Alert
              variant="info"
              title="Create an account to confirm"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to={`/auth/sign-up?redirect=${encodeURIComponent(signUpRedirect)}`}>
                    Sign up
                  </Link>
                </Button>
              }
            >
              We need an account to hold the chair and hand your requirement to your stylist.
              Everything you have entered is kept.
            </Alert>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink">Cancellation policy</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Reschedule or cancel free of charge up to {cancellationHours} hours before your
              appointment. Inside that window the stylist may already have reserved product and
              materials for your hair. Full terms are in our{' '}
              <Link to="/policies/bookings" className="underline underline-offset-4">
                bookings policy
              </Link>
              .
            </p>

            <Checkbox
              className="mt-4"
              label="I have read and accept the cancellation policy"
              checked={acceptedPolicy}
              onChange={(event) => onAcceptedPolicyChange(event.target.checked)}
            />

            <Button
              type="button"
              variant="accent"
              size="xl"
              fullWidth
              className="mt-5"
              loading={isSubmitting}
              loadingText="Booking…"
              disabled={!acceptedPolicy || !isAuthenticated}
              onClick={onSubmit}
            >
              Create appointment
            </Button>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* The requirement                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card className="p-5 sm:p-6">
        <h3 className="font-display text-base font-semibold text-ink">Your requirement</h3>
        <p className="mt-1 text-sm text-muted">
          This goes to your stylist before the appointment, so nothing is decided in the chair on
          the day.
        </p>

        <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <ReviewField label="Style requested" value={draft.desired_style} />
          <ReviewField label="Desired length" value={draft.desired_length} />
          <ReviewField
            label="Current length"
            value={optionLabel(LENGTH_OPTIONS, draft.current_length)}
          />
          <ReviewField
            label="Natural texture"
            value={optionLabel(
              TEXTURE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              })),
              draft.current_texture,
            )}
          />
          <ReviewField
            label="Current colour"
            value={optionLabel(COLOUR_OPTIONS, draft.current_colour)}
          />
          <ReviewField label="Desired colour" value={draft.desired_colour} />
          <ReviewField label="Goals" value={optionLabels(GOAL_OPTIONS, draft.hair_goals)} />
          <ReviewField
            label="Scalp"
            value={optionLabels(SCALP_OPTIONS, draft.scalp_conditions)}
          />
          <ReviewField label="Allergies" value={draft.allergies?.join(', ')} />
          <ReviewField label="Medications" value={draft.medications} />
          <ReviewField label="Accessibility" value={draft.accessibility_needs} />
          <ReviewField
            label="Budget"
            value={
              draft.budget_min || draft.budget_max
                ? `${draft.budget_min ? formatNaira(draft.budget_min) : '—'} – ${
                    draft.budget_max ? formatNaira(draft.budget_max) : 'open'
                  }`
                : undefined
            }
          />
          <ReviewField
            label="Date flexibility"
            value={
              draft.is_flexible_on_date ? 'Yes — happy to be moved' : 'This date only'
            }
          />
        </dl>

        {draft.inspiration_notes && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-bronze-dark">
              Your notes
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {draft.inspiration_notes}
            </p>
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-bronze-dark">
              Reference images ({images.length})
            </p>
            <ul className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-5">
              {images.map((image, index) => (
                <li key={image.id}>
                  <img
                    src={image.url}
                    alt={`Reference ${index + 1}: ${image.name}`}
                    className="aspect-square w-full rounded-md border border-line object-cover"
                  />
                  <p className="mt-1 truncate text-[0.625rem] text-muted">
                    {formatBytes(image.bytes)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  emphasis,
  children,
}: {
  label: string
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className={emphasis ? 'text-sm font-semibold text-ink' : 'text-sm text-muted'}>
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? 'font-display text-lg font-semibold tabular-nums text-ink'
            : 'text-sm font-medium tabular-nums text-ink'
        }
      >
        {children}
      </dd>
    </div>
  )
}

function ReviewField({ label, value }: { label: string; value?: string | null }) {
  const empty = !value || value === '—'
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={empty ? 'mt-1 text-sm text-faint' : 'mt-1 text-sm text-ink'}>
        {empty ? 'Not specified' : value}
      </dd>
    </div>
  )
}
