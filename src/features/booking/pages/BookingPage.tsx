import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Clock, Info, MapPin, Scissors } from 'lucide-react'

import {
  ApiError,
  SLOT_KEY_PREFIX,
  attachRequirementMedia,
  createAppointment,
  errorMessage,
  getDaysWithAvailability,
  getLocations,
  getRequirement,
  getServiceBySlug,
  getServices,
  getServiceVariants,
  getSettings,
  getSlots,
  getStylists,
  getStylistsForService,
  groupSlotsByTime,
  holdSlot,
  qk,
  uploadRequirementImage,
  type TimeSlotGroup,
} from '@/lib/api'
import { Alert, Badge, Button, EmptyState, RadioCards, Select } from '@/components/ui'
import { CardGridSkeleton, ContentSkeleton } from '@/components/layout/RouteLoader'
import { PageHeader, formatDuration } from '@/components/shared/Cards'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { useSeo } from '@/components/seo/Seo'
import { analytics } from '@/lib/analytics'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils/cn'
import {
  formatDate,
  formatNaira,
  formatPriceRange,
  fromDateKey,
  toDateKey,
} from '@/lib/utils/format'
import {
  BookingProgress,
  type BookingStepDescriptor,
} from '@/features/booking/components/BookingProgress'
import { DateStrip, type DayCell } from '@/features/booking/components/DateStrip'
import { buildDayCells, toDayCells } from '@/features/booking/components/days'
import { TimeGrid } from '@/features/booking/components/TimeGrid'
import { RequirementStep } from '@/features/booking/components/RequirementStep'
import { ReviewStep } from '@/features/booking/components/ReviewStep'
import { useRequirementDraft } from '@/features/booking/components/useRequirementDraft'
import type {
  PublicStaff,
  RequirementDraft,
  SalonLocation,
  ServiceCatalogEntry,
  ServiceVariant,
} from '@/types'

const STEP_LIBRARY = {
  service: {
    id: 'service',
    label: 'Service',
    short: 'Service',
    title: 'What are we doing?',
    blurb: 'Every service is priced up front. Pick one and we will find the earliest chair that can do it.',
  },
  schedule: {
    id: 'schedule',
    label: 'Stylist & time',
    short: 'Time',
    title: 'Pick a stylist and a time',
    blurb: 'Choose a specific stylist or take the earliest one free, then pick a day and a time.',
  },
  requirements: {
    id: 'requirements',
    label: 'Requirements',
    short: 'Details',
    title: 'Tell us about your hair',
    blurb: 'This is the part that makes the difference. Your stylist reads it before you sit down, so the appointment starts where you want it to.',
  },
  review: {
    id: 'review',
    label: 'Review',
    short: 'Confirm',
    title: 'Check and confirm',
    blurb: 'One last look before we hold the chair for you.',
  },
} as const satisfies Record<string, BookingStepDescriptor & { title: string; blurb: string }>

type StepId = keyof typeof STEP_LIBRARY

const STEP_IDS = Object.keys(STEP_LIBRARY) as StepId[]

function isSlotConflict(message: string): boolean {
  return /no longer available|just taken|already (booked|taken)|that slot|unavailable/i.test(message)
}

/**
 * The booking wizard.
 *
 * Selections that a customer would be annoyed to lose — service, location,
 * variant, stylist, day, time, and which step they are on — all live in the URL,
 * so a refresh, a shared link and the back button all behave. The requirement
 * form is the exception: it is long, carries file handles, and is mirrored into
 * `sessionStorage` instead.
 */
export default function BookingPage() {
  const [params, setParams] = useSearchParams()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuth()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const {
    draft,
    update: updateDraft,
    toggleGoal,
    toggleScalpCondition,
    setAllergies,
    images,
    addImages,
    removeImage,
  } = useRequirementDraft()

  // ---------------------------------------------------------------------------
  // URL-backed selections
  // ---------------------------------------------------------------------------
  const serviceSlug = params.get('service') ?? ''
  const locationParam = params.get('location') ?? ''
  const variantParam = params.get('variant') ?? ''
  const staffParam = params.get('staff') || 'any'
  const dateParam = params.get('date') ?? ''
  const timeParam = params.get('time') ?? ''
  const stepParam = params.get('step') ?? ''

  const patchParams = useCallback(
    (next: Record<string, string | null>, options?: { replace?: boolean }) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(next)) {
            if (value) updated.set(key, value)
            else updated.delete(key)
          }
          return updated
        },
        options,
      )
    },
    [setParams],
  )

  // Step 1 only exists when the customer did not arrive with a service already.
  const steps: BookingStepDescriptor[] = useMemo(
    () =>
      serviceSlug
        ? [STEP_LIBRARY.schedule, STEP_LIBRARY.requirements, STEP_LIBRARY.review]
        : [
            STEP_LIBRARY.service,
            STEP_LIBRARY.schedule,
            STEP_LIBRARY.requirements,
            STEP_LIBRARY.review,
          ],
    [serviceSlug],
  )

  const currentId: StepId = useMemo(() => {
    if (stepParam && STEP_IDS.includes(stepParam as StepId)) {
      const candidate = stepParam as StepId
      if (steps.some((step) => step.id === candidate)) return candidate
    }
    return steps[0]!.id as StepId
  }, [stepParam, steps])

  const [reachedIds, setReachedIds] = useState<string[]>([currentId])

  useEffect(() => {
    setReachedIds((previous) =>
      previous.includes(currentId) ? previous : [...previous, currentId],
    )
  }, [currentId])

  const goToStep = useCallback(
    (id: string) => {
      patchParams({ step: id })
      window.requestAnimationFrame(() => {
        headingRef.current?.focus()
        headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      })
    },
    [patchParams],
  )

  // ---------------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------------
  const { data: settings } = useQuery({
    queryKey: qk.settings(),
    queryFn: getSettings,
    staleTime: 30 * 60_000,
  })

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: qk.locations(),
    queryFn: getLocations,
    staleTime: 30 * 60_000,
  })

  // The primary location is derived from the same list rather than fetched
  // twice — `getPrimaryLocation()` would need a key the registry does not have.
  const primaryLocation = useMemo(
    () => locations.find((item) => item.is_primary) ?? locations[0] ?? null,
    [locations],
  )

  const location = useMemo<SalonLocation | null>(() => {
    if (locationParam) return locations.find((item) => item.id === locationParam) ?? null
    return primaryLocation
  }, [locationParam, locations, primaryLocation])

  const { data: service, isLoading: serviceLoading } = useQuery({
    queryKey: qk.service(serviceSlug),
    queryFn: () => getServiceBySlug(serviceSlug),
    enabled: Boolean(serviceSlug),
    staleTime: 5 * 60_000,
  })

  const serviceId = service?.id ?? ''

  const { data: variants = [] } = useQuery({
    queryKey: qk.serviceVariants(serviceId),
    queryFn: () => getServiceVariants(serviceId),
    enabled: Boolean(serviceId),
    staleTime: 10 * 60_000,
  })

  const variant: ServiceVariant | undefined = useMemo(() => {
    if (variants.length === 0) return undefined
    return variants.find((item) => item.id === variantParam) ?? variants[0]
  }, [variants, variantParam])

  const { data: staffIds = [] } = useQuery({
    queryKey: qk.staffServices(serviceId),
    queryFn: () => getStylistsForService(serviceId),
    enabled: Boolean(serviceId),
    staleTime: 10 * 60_000,
  })

  const { data: allStylists = [] } = useQuery({
    queryKey: qk.staff(),
    queryFn: getStylists,
    staleTime: 10 * 60_000,
  })

  const stylists = useMemo<PublicStaff[]>(() => {
    if (staffIds.length === 0) return allStylists
    const allowed = new Set(staffIds)
    return allStylists.filter((stylist) => allowed.has(stylist.user_id))
  }, [allStylists, staffIds])

  const stylistId = staffParam === 'any' ? undefined : staffParam

  // ---------------------------------------------------------------------------
  // Availability — one sweep across the window, filtered locally
  // ---------------------------------------------------------------------------
  const dayCount = Math.min(30, Math.max(1, settings?.max_advance_days ?? 30))
  const fromKey = toDateKey(new Date())
  const toKey = useMemo(() => buildDayCells(dayCount).at(-1)?.key ?? fromKey, [dayCount, fromKey])

  const scheduleReached = reachedIds.includes(STEP_LIBRARY.schedule.id)

  const availability = useQuery({
    queryKey: qk.slotsRange(serviceId, fromKey, toKey, stylistId),
    queryFn: () =>
      getDaysWithAvailability(location!.id, serviceId, fromKey, toKey, stylistId),
    enabled: Boolean(serviceId && location && scheduleReached),
    staleTime: 5 * 60_000,
  })

  const days = useMemo<DayCell[]>(
    () =>
      toDayCells(
        buildDayCells(dayCount),
        availability.data,
        !availability.isLoading && !availability.isError,
      ),
    [dayCount, availability.data, availability.isLoading, availability.isError],
  )

  // Open on the first day that actually has space rather than an empty grid.
  useEffect(() => {
    if (dateParam || !serviceId || !location) return
    if (availability.isLoading) return
    const first = days.find((cell) => cell.known && cell.available) ?? days[0]
    if (first) patchParams({ date: first.key }, { replace: true })
  }, [dateParam, serviceId, location, availability.isLoading, days, patchParams])

  const slotsQuery = useQuery({
    queryKey: qk.slots(serviceId, dateParam, stylistId, variant?.id),
    queryFn: () =>
      getSlots({
        locationId: location!.id,
        serviceId,
        date: dateParam,
        staffId: stylistId,
        serviceVariantId: variant?.id,
      }),
    enabled: Boolean(serviceId && location && dateParam),
    staleTime: 60_000,
  })

  const groups = useMemo(() => groupSlotsByTime(slotsQuery.data ?? []), [slotsQuery.data])

  const selectedGroup = useMemo<TimeSlotGroup | undefined>(
    () => groups.find((group) => group.startsAt === timeParam),
    [groups, timeParam],
  )

  // "First available" resolves to a real stylist taken from the slot rows, so it
  // is always someone genuinely free at that time.
  const resolvedStaffId = useMemo(() => {
    if (!selectedGroup) return null
    if (staffParam !== 'any') return staffParam
    return selectedGroup.staffIds[0] ?? null
  }, [selectedGroup, staffParam])

  const resolvedStylist = stylists.find((stylist) => stylist.user_id === resolvedStaffId)

  // The server gates on lead time plus minimum notice.
  const nowMs = useMinuteClock()
  const earliestBookableMs =
    nowMs +
    ((settings?.booking_lead_time_hours ?? 4) + (settings?.min_notice_hours ?? 0)) * 3_600_000

  // ---------------------------------------------------------------------------
  // Derived booking facts
  // ---------------------------------------------------------------------------
  const durationMinutes = variant?.duration_minutes ?? service?.duration_minutes ?? 0
  const price = variant?.price ?? service?.price_from ?? 0
  const [acceptedPolicy, setAcceptedPolicy] = useState(false)
  const [styleError, setStyleError] = useState('')

  const [sessionToken] = useState(() => crypto.randomUUID())
  const trackedSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!service || trackedSlug.current === service.slug) return
    trackedSlug.current = service.slug
    analytics.bookingStarted(service.slug, variant?.price ?? service.price_from)
  }, [service, variant])

  useSeo({
    title: 'Book an appointment',
    description:
      'Book hair, braids, locs, colour and styling at Black Chery Unisex Studio, Lagos. Pick your stylist, choose a time, and tell your stylist exactly what you want.',
    path: '/book',
    noindex: true,
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new ApiError('Create an account to confirm this booking.')
      if (!service || !location || !selectedGroup || !resolvedStaffId) {
        throw new ApiError('Please choose a time before confirming.')
      }

      // Freeze the chair while the request is in flight. The hold is an
      // optimisation only — `createAppointment` re-validates server-side anyway.
      let holdToken: string | undefined
      try {
        await holdSlot({
          staffId: resolvedStaffId,
          serviceId: service.id,
          locationId: location.id,
          startsAt: selectedGroup.startsAt,
          sessionToken,
          ttlMinutes: 20,
        })
        holdToken = sessionToken
      } catch {
        holdToken = undefined
      }

      return createAppointment({
        serviceId: service.id,
        locationId: location.id,
        staffId: resolvedStaffId,
        startsAt: selectedGroup.startsAt,
        serviceVariantId: variant?.id ?? null,
        customerId: user.id,
        requirement: buildRequirement(draft),
        holdToken,
      })
    },
    onSuccess: async (appointment) => {
      analytics.bookingCompleted(appointment.reference, appointment.total)

      // Reference images are attached to the requirement that now exists. The
      // appointment is already saved, so a failure here is a warning, not a loss.
      if (images.length > 0 && user) {
        try {
          const requirement = await getRequirement(appointment.id)
          if (requirement) {
            for (const [index, image] of images.entries()) {
              const uploaded = await uploadRequirementImage(user.id, image.file, requirement.id)
              await attachRequirementMedia({
                requirementId: requirement.id,
                storagePath: uploaded.storagePath,
                publicUrl: uploaded.publicUrl,
                bytes: uploaded.bytes,
                mimeType: uploaded.mimeType,
                sortOrder: index,
              })
            }
          }
        } catch {
          toast.error('Your booking is confirmed, but the reference photos did not upload.')
        }
      }

      // Every availability cache entry is now stale: both the per-day grids and
      // the month-long sweep they are filtered from.
      void queryClient.invalidateQueries({ queryKey: [SLOT_KEY_PREFIX] })
      void queryClient.invalidateQueries({ queryKey: [`${SLOT_KEY_PREFIX}-range`] })
      if (user) void queryClient.invalidateQueries({ queryKey: qk.appointments(user.id) })
      navigate(`/book/confirmed/${appointment.reference}`)
    },
  })

  const submitError = useMemo(() => {
    if (!submitMutation.error) return null
    const message = errorMessage(submitMutation.error)
    return { message, slotTaken: isSlotConflict(message) }
  }, [submitMutation.error])

  const pickAnotherTime = () => {
    submitMutation.reset()
    void slotsQuery.refetch()
    void availability.refetch()
    goToStep(STEP_LIBRARY.schedule.id)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const serviceMissing = Boolean(serviceSlug) && !serviceLoading && !service
  const stepIndex = steps.findIndex((step) => step.id === currentId) + 1
  const signUpRedirect = `${routerLocation.pathname}${routerLocation.search}`

  return (
    <>
      <PageHeader
        eyebrow="Booking"
        title="Book your appointment"
        description="Four short steps. The last one is the important part — telling your stylist exactly what you want before you arrive."
        breadcrumb={
          service ? [{ label: service.name, to: `/services/${service.slug}` }] : undefined
        }
      />

      <div className="container-page pb-20 pt-10 md:pt-12">
        <div className="mx-auto max-w-4xl">
          <BookingProgress
            steps={steps}
            currentId={currentId}
            reachedIds={reachedIds}
            onJump={goToStep}
          />

          {/* Announce every step change. */}
          <p className="sr-only" role="status" aria-live="polite">
            {`Step ${stepIndex} of ${steps.length}: ${STEP_LIBRARY[currentId].label}`}
          </p>

          <div className="mt-10">
            <p className="eyebrow">Step {stepIndex} of {steps.length}</p>
            <h2 ref={headingRef} tabIndex={-1} className="display-section mt-2 focus:outline-none">
              {STEP_LIBRARY[currentId].title}
            </h2>
            <p className="lede mt-3">{STEP_LIBRARY[currentId].blurb}</p>
          </div>

          <div className="mt-8">
            {serviceMissing && (
              <Alert
                variant="danger"
                title="We could not find that service"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      patchParams({
                        service: null,
                        variant: null,
                        staff: null,
                        date: null,
                        time: null,
                        step: STEP_LIBRARY.service.id,
                      })
                    }
                  >
                    Choose another
                  </Button>
                }
              >
                It may have been renamed or retired.
              </Alert>
            )}

            {currentId === STEP_LIBRARY.service.id && (
              <ServiceStep
                selectedSlug={serviceSlug}
                locations={locations}
                locationId={location?.id ?? ''}
                locationsLoading={locationsLoading}
                onSelectService={(slug) =>
                  patchParams({
                    service: slug,
                    variant: null,
                    staff: null,
                    date: null,
                    time: null,
                    step: STEP_LIBRARY.schedule.id,
                  })
                }
                onSelectLocation={(id) => patchParams({ location: id })}
                onContinue={() => goToStep(STEP_LIBRARY.schedule.id)}
              />
            )}

            {currentId === STEP_LIBRARY.schedule.id &&
              (serviceLoading || !service ? (
                <ContentSkeleton lines={6} />
              ) : (
                <ScheduleStep
                  service={service}
                  location={location}
                  variants={variants}
                  variantId={variant?.id ?? ''}
                  onSelectVariant={(id) =>
                    patchParams({ variant: id, time: null }, { replace: true })
                  }
                  stylists={stylists}
                  staffId={staffParam}
                  onSelectStaff={(id) =>
                    // The chosen time may not exist for a different stylist.
                    patchParams(
                      { staff: id === 'any' ? null : id, time: null },
                      { replace: true },
                    )
                  }
                  days={days}
                  availabilityLoading={availability.isLoading}
                  availabilityDegraded={availability.isError}
                  onSelectDay={(key) =>
                    patchParams({ date: key, time: null }, { replace: true })
                  }
                  groups={groups}
                  selectedStartsAt={timeParam}
                  onSelectTime={(group) => {
                    patchParams({ time: group.startsAt }, { replace: true })
                    analytics.slotSelected(service.slug, group.startsAt)
                  }}
                  slotsLoading={slotsQuery.isLoading}
                  slotsError={slotsQuery.error}
                  onRetrySlots={() => void slotsQuery.refetch()}
                  earliestBookableMs={earliestBookableMs}
                  selectedDateKey={dateParam}
                  staleTimeWarning={Boolean(timeParam) && !slotsQuery.isLoading && !selectedGroup}
                  onContinue={() => goToStep(STEP_LIBRARY.requirements.id)}
                />
              ))}

            {currentId === STEP_LIBRARY.requirements.id && (
              <>
                <RequirementStep
                  draft={draft}
                  update={(patch) => {
                    updateDraft(patch)
                    if (patch.desired_style !== undefined && patch.desired_style.trim()) {
                      setStyleError('')
                    }
                  }}
                  toggleGoal={toggleGoal}
                  toggleScalpCondition={toggleScalpCondition}
                  setAllergies={setAllergies}
                  images={images}
                  onAddImages={addImages}
                  onRemoveImage={removeImage}
                  isAuthenticated={isAuthenticated}
                  signUpRedirect={signUpRedirect}
                  styleError={styleError}
                />

                <StepFooter
                  onBack={() => goToStep(STEP_LIBRARY.schedule.id)}
                  onContinue={() => {
                    if (!draft.desired_style?.trim()) {
                      setStyleError('Tell us the style you want — one line is enough.')
                      goToStep(STEP_LIBRARY.requirements.id)
                      return
                    }
                    setStyleError('')
                    goToStep(STEP_LIBRARY.review.id)
                  }}
                  continueLabel="Review booking"
                />
              </>
            )}

            {currentId === STEP_LIBRARY.review.id &&
              (!service || serviceLoading || !selectedGroup || !resolvedStaffId ? (
                <Alert
                  variant="warning"
                  title="Your booking is not complete yet"
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => goToStep(STEP_LIBRARY.schedule.id)}
                    >
                      Back to times
                    </Button>
                  }
                >
                  Choose a service, stylist and time before confirming.
                </Alert>
              ) : (
                <ReviewStep
                  service={service}
                  variant={variant}
                  stylistName={resolvedStylist?.full_name ?? 'First available stylist'}
                  stylistPhotoUrl={resolvedStylist?.photo_url ?? null}
                  location={location}
                  startsAt={selectedGroup.startsAt}
                  durationMinutes={durationMinutes}
                  price={price}
                  settings={settings ?? null}
                  draft={draft}
                  images={images}
                  acceptedPolicy={acceptedPolicy}
                  onAcceptedPolicyChange={setAcceptedPolicy}
                  submitError={submitError}
                  onPickAnotherTime={pickAnotherTime}
                  isSubmitting={submitMutation.isPending}
                  isAuthenticated={isAuthenticated}
                  signUpRedirect={signUpRedirect}
                  onSubmit={() => submitMutation.mutate()}
                />
              ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — service and location
// ---------------------------------------------------------------------------

function ServiceStep({
  selectedSlug,
  locations,
  locationId,
  locationsLoading,
  onSelectService,
  onSelectLocation,
  onContinue,
}: {
  selectedSlug: string
  locations: SalonLocation[]
  locationId: string
  locationsLoading: boolean
  onSelectService: (slug: string) => void
  onSelectLocation: (id: string) => void
  onContinue: () => void
}) {
  const { data: services = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.services(),
    queryFn: () => getServices(),
    staleTime: 5 * 60_000,
  })

  return (
    <div className="space-y-8">
      {locations.length > 1 && (
        <div className="max-w-sm">
          <label
            htmlFor="booking-location"
            className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft"
          >
            Where would you like to come?
          </label>
          <Select
            id="booking-location"
            value={locationId}
            onChange={(event) => onSelectLocation(event.target.value)}
            options={locations.map((item) => ({
              value: item.id,
              label: `${item.name} — ${item.address_line1}`,
            }))}
            disabled={locationsLoading}
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="size-3.5 text-bronze" aria-hidden />
            Most appointments are at our Victoria Island studio.
          </p>
        </div>
      )}

      {error ? (
        <Alert
          variant="danger"
          title="We could not load the service list"
          action={
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      ) : isLoading ? (
        <CardGridSkeleton count={6} />
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Scissors aria-hidden />}
          title="The service list is unavailable"
          description="We could not load the menu. Try again in a moment, or message us on WhatsApp."
          action={
            <Button variant="outline" size="lg" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <fieldset>
            <legend className="sr-only">Choose a service</legend>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {services.map((item) => (
                <li key={item.id}>
                  <ServiceOption
                    service={item}
                    selected={item.slug === selectedSlug}
                    onSelect={() => onSelectService(item.slug)}
                  />
                </li>
              ))}
            </ul>
          </fieldset>

          <StepFooter
            onContinue={onContinue}
            continueLabel="Choose a time"
            continueDisabled={!selectedSlug}
            hint={selectedSlug ? undefined : 'Choose a service to continue'}
          />
        </>
      )}
    </div>
  )
}

/** Compact selection row — a full ServiceCard would be too heavy to scan a list of. */
function ServiceOption({
  service,
  selected,
  onSelect,
}: {
  service: ServiceCatalogEntry
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-lg border p-3 text-left transition-colors duration-200',
        selected
          ? 'border-ink bg-sand/60 shadow-sm'
          : 'border-line bg-surface hover:border-line-strong hover:bg-sand/40',
      )}
    >
      <MediaFrame
        src={service.image_url}
        alt={service.name}
        seed={service.slug}
        aspect="1/1"
        rounded
        className="w-16 shrink-0"
      />
      <span className="min-w-0 flex-1">
        {service.category_name && (
          <span className="block text-[0.625rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
            {service.category_name}
          </span>
        )}
        <span className="block truncate font-display text-[0.9375rem] font-semibold text-ink">
          {service.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted">
          <span className="font-medium text-ink-soft">
            {formatPriceRange(service.price_from, service.price_to)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {formatDuration(service.duration_minutes)}
          </span>
        </span>
      </span>
      {selected && (
        <Badge variant="accent" size="sm" className="shrink-0">
          Selected
        </Badge>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — variant, stylist, day, time
// ---------------------------------------------------------------------------

function ScheduleStep({
  service,
  location,
  variants,
  variantId,
  onSelectVariant,
  stylists,
  staffId,
  onSelectStaff,
  days,
  availabilityLoading,
  availabilityDegraded,
  onSelectDay,
  groups,
  selectedStartsAt,
  onSelectTime,
  slotsLoading,
  slotsError,
  onRetrySlots,
  earliestBookableMs,
  selectedDateKey,
  staleTimeWarning,
  onContinue,
}: {
  service: ServiceCatalogEntry
  location: SalonLocation | null
  variants: ServiceVariant[]
  variantId: string
  onSelectVariant: (id: string) => void
  stylists: PublicStaff[]
  staffId: string
  onSelectStaff: (id: string) => void
  days: DayCell[]
  availabilityLoading: boolean
  availabilityDegraded: boolean
  onSelectDay: (key: string) => void
  groups: TimeSlotGroup[]
  selectedStartsAt: string
  onSelectTime: (group: TimeSlotGroup) => void
  slotsLoading: boolean
  slotsError: unknown
  onRetrySlots: () => void
  earliestBookableMs: number
  selectedDateKey: string
  staleTimeWarning: boolean
  onContinue: () => void
}) {
  const stylistOptions = [
    {
      value: 'any',
      label: 'First available',
      description: 'Earliest stylist who can do this service',
    },
    ...stylists.map((stylist) => ({
      value: stylist.user_id,
      label: stylist.full_name,
      description: [
        stylist.title,
        stylist.rating_count > 0 ? `${stylist.rating_avg?.toFixed(1)} out of 5` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  ]

  return (
    <div className="space-y-10">
      {variants.length > 0 && (
        <section aria-label="Service size">
          <h3 className="text-[0.8125rem] font-medium text-ink-soft">Size and length</h3>
          <p className="mt-1 text-xs text-muted">
            Price and time both change with the size, so pin it down now.
          </p>
          <RadioCards
            name="booking-variant"
            aria-label="Service size"
            columns={2}
            className="mt-3.5"
            value={variantId}
            onChange={onSelectVariant}
            options={variants.map((variant) => ({
              value: variant.id,
              label: variant.label,
              description: `${formatNaira(variant.price)} · ${formatDuration(variant.duration_minutes)}`,
            }))}
          />
        </section>
      )}

      <section aria-label="Stylist">
        <h3 className="text-[0.8125rem] font-medium text-ink-soft">Your stylist</h3>
        <p className="mt-1 text-xs text-muted">
          {stylists.length > 0
            ? `${stylists.length} ${stylists.length === 1 ? 'stylist' : 'stylists'} offer ${service.name}.`
            : 'Anyone in the studio can take this service.'}
        </p>
        <RadioCards
          name="booking-staff"
          aria-label="Stylist"
          columns={2}
          className="mt-3.5"
          value={staffId}
          onChange={onSelectStaff}
          options={stylistOptions}
        />
      </section>

      <section aria-label="Date">
        <h3 className="text-[0.8125rem] font-medium text-ink-soft">Pick a day</h3>
        <div className="mt-3">
          <DateStrip
            days={days}
            selectedKey={selectedDateKey}
            onSelect={onSelectDay}
            isLoading={availabilityLoading}
            degraded={availabilityDegraded}
          />
        </div>
      </section>

      <section aria-label="Time">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[0.8125rem] font-medium text-ink-soft">
            {selectedDateKey
              ? `Times on ${formatDate(fromDateKey(selectedDateKey), 'EEEE d MMMM')}`
              : 'Pick a time'}
          </h3>
          {location && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <MapPin className="size-3.5 text-bronze" aria-hidden />
              {location.name}
            </p>
          )}
        </div>

        <div className="mt-3">
          {!selectedDateKey ? (
            <Alert variant="neutral" title="Choose a day first">
              Times appear as soon as you pick a date.
            </Alert>
          ) : (
            <>
              {staleTimeWarning && (
                <Alert variant="warning" title="That time has gone" className="mb-4">
                  Someone else booked it while you were deciding. Pick another time below.
                </Alert>
              )}
              <TimeGrid
                groups={groups}
                selectedStartsAt={selectedStartsAt}
                onSelect={onSelectTime}
                earliestBookableMs={earliestBookableMs}
                isLoading={slotsLoading}
                error={slotsError}
                onRetry={onRetrySlots}
                dateKey={selectedDateKey}
              />
            </>
          )}
        </div>

        {selectedStartsAt && (
          <p className="mt-4 flex items-start gap-2.5 rounded-md border border-line bg-sand/40 p-3.5 text-sm text-ink-soft">
            <Info className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
            <span>
              Holding{' '}
              <strong className="font-semibold text-ink">
                {formatDate(selectedStartsAt, "EEEE d MMMM 'at' h:mm a")}
              </strong>
              . We freeze the chair when you confirm.
            </span>
          </p>
        )}
      </section>

      <StepFooter
        onContinue={onContinue}
        continueLabel="Continue"
        continueDisabled={!selectedStartsAt}
        hint={selectedStartsAt ? undefined : 'Choose a time to continue'}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared step chrome
// ---------------------------------------------------------------------------

function StepFooter({
  onBack,
  onContinue,
  continueLabel,
  continueDisabled,
  hint,
}: {
  onBack?: () => void
  onContinue: () => void
  continueLabel: string
  continueDisabled?: boolean
  hint?: string
}) {
  return (
    <div className="mt-10 border-t border-line pt-6">
      {hint && (
        <p className="mb-3 text-xs text-muted" role="status">
          {hint}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button type="button" variant="ghost" size="lg" onClick={onBack}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button
          type="button"
          variant="solid"
          size="lg"
          onClick={onContinue}
          disabled={continueDisabled}
        >
          {continueLabel}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One-minute heartbeat so the lead-time gate stays honest on a long session. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

/** Drops empty values so `fn_create_appointment` stores nulls, not empty strings. */
function buildRequirement(draft: RequirementDraft): RequirementDraft {
  const requirement: RequirementDraft = { desired_style: draft.desired_style.trim() }

  if (draft.current_length) requirement.current_length = draft.current_length
  if (draft.current_texture) requirement.current_texture = draft.current_texture
  if (draft.current_colour) requirement.current_colour = draft.current_colour
  if (draft.last_treatment) requirement.last_treatment = draft.last_treatment
  if (draft.desired_length) requirement.desired_length = draft.desired_length
  if (draft.desired_colour) requirement.desired_colour = draft.desired_colour
  if (draft.hair_goals?.length) requirement.hair_goals = draft.hair_goals
  if (draft.inspiration_notes?.trim()) {
    requirement.inspiration_notes = draft.inspiration_notes.trim()
  }
  if (draft.allergies?.length) requirement.allergies = draft.allergies
  if (draft.scalp_conditions?.length) requirement.scalp_conditions = draft.scalp_conditions
  if (draft.medications?.trim()) requirement.medications = draft.medications.trim()
  if (draft.accessibility_needs?.trim()) {
    requirement.accessibility_needs = draft.accessibility_needs.trim()
  }
  if (typeof draft.budget_min === 'number') requirement.budget_min = draft.budget_min
  if (typeof draft.budget_max === 'number') requirement.budget_max = draft.budget_max
  requirement.is_flexible_on_date = draft.is_flexible_on_date ?? false

  return requirement
}
