import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FolderTree, Plus, Scissors, Trash2 } from 'lucide-react'

import {
  listServiceCategoriesAdmin,
  listServicesAdmin,
  qk,
  saveService,
  saveServiceCategory,
  saveServiceVariant,
} from '@/lib/api'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Rating,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  ConfirmDialog,
  DetailList,
  Panel,
  SaveStatus,
  TabPanel,
  Tabs,
} from '../components/adminKit'
import type { SaveState } from '../components/adminKit'
import {
  deleteService,
  deleteServiceCategory,
  deleteServiceVariant,
  listServiceVariantsAdmin,
} from '../components/adminReads'
import { numberOr, numberOrNull, toInputValue } from '../components/adminFormat'
import { errorMessage } from '@/lib/supabase/errors'
import { formatNaira, formatPriceRange, humanise, slugify } from '@/lib/utils/format'
import type { Service, ServiceCategory, ServiceVariant, UserGender } from '@/types'

/**
 * Service and service-category administration.
 *
 * A service with a booking history is never deletable — `appointments.service_id`
 * references it, so removing one would break historical records. Those rows offer
 * archive instead; only `bookings_count === 0` rows offer a delete, and the
 * confirmation states the consequence before anything happens.
 */

const PRICE_UNITS = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'from', label: 'From' },
  { value: 'per_cm', label: 'Per centimetre' },
  { value: 'per_inch', label: 'Per inch' },
  { value: 'per_hour', label: 'Per hour' },
]

const GENDER_RESTRICTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'female', label: 'Women only' },
  { value: 'male', label: 'Men only' },
  { value: 'non_binary', label: 'Non-binary only' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft — hidden from the site' },
  { value: 'active', label: 'Active — bookable' },
  { value: 'archived', label: 'Archived — retired' },
]

interface ServiceDraft {
  id?: string
  slug: string
  slugTouched: boolean
  name: string
  categoryId: string
  summary: string
  description: string
  duration: string
  buffer: string
  priceFrom: string
  priceTo: string
  priceUnit: string
  requiresConsultation: boolean
  requiresRequirement: boolean
  genderRestriction: string
  badge: string
  isFeatured: boolean
  isPopular: boolean
  displayOrder: string
  status: Service['status']
}

const EMPTY_SERVICE: ServiceDraft = {
  slug: '',
  slugTouched: false,
  name: '',
  categoryId: '',
  summary: '',
  description: '',
  duration: '60',
  buffer: '15',
  priceFrom: '',
  priceTo: '',
  priceUnit: 'fixed',
  requiresConsultation: false,
  requiresRequirement: true,
  genderRestriction: '',
  badge: '',
  isFeatured: false,
  isPopular: false,
  displayOrder: '0',
  status: 'draft',
}

interface CategoryDraft {
  id?: string
  name: string
  slug: string
  slugTouched: boolean
  description: string
  icon: string
  displayOrder: string
  isActive: boolean
}

const EMPTY_CATEGORY: CategoryDraft = {
  name: '',
  slug: '',
  slugTouched: false,
  description: '',
  icon: '',
  displayOrder: '0',
  isActive: true,
}

export default function AdminServicesPage() {
  const queryClient = useQueryClient()

  const [tab, setTab] = useState('services')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const [serviceDraft, setServiceDraft] = useState<ServiceDraft | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Service | null>(null)
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<ServiceCategory | null>(null)

  const categoriesQuery = useQuery({
    queryKey: qk.serviceCategories(),
    queryFn: listServiceCategoriesAdmin,
    staleTime: 10 * 60_000,
  })

  const servicesQuery = useQuery({
    queryKey: qk.servicesFlat(),
    queryFn: () => listServicesAdmin({ search, status, categoryId }),
    staleTime: 60_000,
  })

  const services = servicesQuery.data ?? []
  const categories = categoriesQuery.data ?? []

  const categoryName = useMemo(() => {
    const map = new Map(
      (categoriesQuery.data ?? []).map((category) => [category.id, category.name]),
    )
    return (id: string | null) => (id ? (map.get(id) ?? 'Uncategorised') : 'Uncategorised')
  }, [categoriesQuery.data])

  const invalidate = () => {
    // Partial key matches: refresh every services read regardless of its filters.
    void queryClient.invalidateQueries({ queryKey: qk.servicesFlat() })
    void queryClient.invalidateQueries({ queryKey: qk.serviceCategories() })
    void queryClient.invalidateQueries({ queryKey: qk.adminBookings({}) })
  }

  const archiveMutation = useMutation({
    mutationFn: (service: Service) => saveService({ id: service.id, status: 'archived' }),
    onSuccess: () => {
      toast.success('Service archived. It is hidden from the public menu.')
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (service: Service) => deleteService(service.id),
    onSuccess: (_result, service) => {
      toast.success(`${service.name} and its variants were deleted.`)
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (category: ServiceCategory) => deleteServiceCategory(category.id),
    onSuccess: (_result, category) => {
      toast.success(`${category.name} was deleted. Its services are now uncategorised.`)
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <AdminShell
      eyebrow="Administration"
      title="Services"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="The menu clients book from. Prices, durations and variants feed the booking engine directly."
      actions={
        tab === 'services' ? (
          <Button onClick={() => setServiceDraft({ ...EMPTY_SERVICE })}>
            <Plus aria-hidden />
            New service
          </Button>
        ) : (
          <Button onClick={() => setCategoryDraft({ ...EMPTY_CATEGORY })}>
            <Plus aria-hidden />
            New category
          </Button>
        )
      }
    >
      <Tabs
        label="Service administration"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'services', label: 'Services' },
          { id: 'categories', label: 'Categories', count: categories.length },
        ]}
      />

      {/* ----------------------------------------------------------------
          Services
      ---------------------------------------------------------------- */}
      <TabPanel id="services" value={tab}>
        <div className="space-y-5">
          <Panel title="Filters">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Search" htmlFor="service-search">
                <Input
                  id="service-search"
                  type="search"
                  value={search}
                  placeholder="Braids, locs, colour…"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
              <Field label="Category" htmlFor="service-category">
                <Select
                  id="service-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  placeholder="All categories"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              </Field>
              <Field label="Status" htmlFor="service-status">
                <Select
                  id="service-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  placeholder="Any status"
                  options={STATUS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label.split(' — ')[0] ?? option.value,
                  }))}
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Menu"
            description={
              servicesQuery.isLoading
                ? 'Loading services…'
                : `${services.length} service${services.length === 1 ? '' : 's'}`
            }
            bodyClassName="p-0"
          >
            <AsyncSection
              isLoading={servicesQuery.isLoading}
              isError={servicesQuery.isError}
              error={servicesQuery.error}
              onRetry={() => void servicesQuery.refetch()}
              isEmpty={services.length === 0}
              empty={
                <div className="p-5 text-center">
                  <Scissors className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
                  <p className="text-sm text-muted">
                    No services match these filters. Create one to open it up for booking.
                  </p>
                </div>
              }
              skeleton={<div className="h-72 animate-pulse bg-sand/60" />}
              className="p-5"
            >
              <>
                <div className="hidden lg:block">
                  <Table>
                    <caption className="sr-only">Services</caption>
                    <THead>
                      <tr>
                        <TH scope="col">Service</TH>
                        <TH scope="col">Category</TH>
                        <TH scope="col">Duration</TH>
                        <TH scope="col">Price</TH>
                        <TH scope="col">Bookings</TH>
                        <TH scope="col">Rating</TH>
                        <TH scope="col">Order</TH>
                        <TH scope="col">Featured</TH>
                        <TH scope="col">Status</TH>
                        <TH scope="col" className="text-right">Actions</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {services.map((service) => (
                        <TR key={service.id}>
                          <TD className="max-w-[15rem]">
                            <span className="block truncate font-medium text-ink">
                              {service.name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              /{service.slug}
                            </span>
                          </TD>
                          <TD className="text-sm">{categoryName(service.category_id)}</TD>
                          <TD className="whitespace-nowrap text-sm tabular-nums">
                            {service.duration_minutes} min
                          </TD>
                          <TD className="whitespace-nowrap text-sm font-medium tabular-nums text-ink">
                            {formatPriceRange(service.price_from, service.price_to)}
                          </TD>
                          <TD className="text-sm tabular-nums">{service.bookings_count}</TD>
                          <TD>
                            {service.rating_count > 0 ? (
                              <Rating value={service.rating_avg} size="sm" showValue />
                            ) : (
                              <span className="text-xs text-faint">No reviews</span>
                            )}
                          </TD>
                          <TD className="text-sm tabular-nums text-muted">
                            {service.display_order}
                          </TD>
                          <TD>
                            {service.is_featured ? (
                              <Badge variant="accent" size="sm">
                                Featured
                              </Badge>
                            ) : (
                              <span className="text-xs text-faint">—</span>
                            )}
                          </TD>
                          <TD>
                            <Badge variant={toneFor(service.status)} size="sm" dot>
                              {humanise(service.status)}
                            </Badge>
                          </TD>
                          <TD>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setServiceDraft(toDraft(service))}
                              >
                                Edit
                              </Button>
                              {service.bookings_count === 0 ? (
                                <Button
                                  variant="ghost"
                                  size="iconSm"
                                  aria-label={`Delete ${service.name}`}
                                  onClick={() => setDeleteTarget(service)}
                                >
                                  <Trash2 aria-hidden />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setArchiveTarget(service)}
                                >
                                  Archive
                                </Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>

                <ul className="space-y-3 lg:hidden">
                  {services.map((service) => (
                    <li key={service.id} className="rounded-md border border-line px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {service.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {categoryName(service.category_id)} · {service.duration_minutes} min
                          </p>
                        </div>
                        <Badge variant={toneFor(service.status)} size="sm" dot>
                          {humanise(service.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 border-t border-line pt-3">
                        <DetailList
                          columns={2}
                          items={[
                            {
                              label: 'Price',
                              value: formatPriceRange(service.price_from, service.price_to),
                            },
                            { label: 'Bookings', value: service.bookings_count },
                          ]}
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setServiceDraft(toDraft(service))}
                        >
                          Edit
                        </Button>
                        {service.bookings_count === 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(service)}
                          >
                            Delete
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setArchiveTarget(service)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            </AsyncSection>
          </Panel>
        </div>
      </TabPanel>

      {/* ----------------------------------------------------------------
          Categories
      ---------------------------------------------------------------- */}
      <TabPanel id="categories" value={tab}>
        <Panel
          title="Service categories"
          description="Categories group the services page. Deleting one leaves its services in place but uncategorised."
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={categoriesQuery.isLoading}
            isError={categoriesQuery.isError}
            error={categoriesQuery.error}
            onRetry={() => void categoriesQuery.refetch()}
            isEmpty={categories.length === 0}
            empty={
              <div className="p-5 text-center">
                <FolderTree className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
                <p className="text-sm text-muted">
                  No categories yet. Create one so the menu groups cleanly.
                </p>
              </div>
            }
            skeleton={<div className="h-56 animate-pulse bg-sand/60" />}
            className="p-5"
          >
            <ul className="divide-y divide-line">
              {categories.map((category) => {
                const count = services.filter(
                  (service) => service.category_id === category.id,
                ).length
                return (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {category.name}
                        {category.icon && (
                          <Badge variant="outline" size="sm">
                            {category.icon}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        /{category.slug} · {count} service{count === 1 ? '' : 's'} · order{' '}
                        {category.display_order}
                      </p>
                      {category.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                          {category.description}
                        </p>
                      )}
                    </div>

                    <Badge variant={category.is_active ? 'success' : 'default'} size="sm" dot>
                      {category.is_active ? 'Active' : 'Hidden'}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCategoryDraft(toCategoryDraft(category))}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => setCategoryDeleteTarget(category)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </AsyncSection>
        </Panel>
      </TabPanel>

      {/* ----------------------------------------------------------------
          Sheets & confirmations
      ---------------------------------------------------------------- */}

      {serviceDraft && (
        <ServiceSheet
          draft={serviceDraft}
          categories={categories}
          onClose={() => setServiceDraft(null)}
          onSaved={() => invalidate()}
        />
      )}

      {categoryDraft && (
        <CategorySheet
          draft={categoryDraft}
          onClose={() => setCategoryDraft(null)}
          onSaved={() => invalidate()}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : 'Delete service'}
        description="This cannot be undone."
        consequence={
          deleteTarget ? (
            <span className="block space-y-1.5">
              <span className="block">
                The service, its variants and its stylist mappings are removed permanently.
              </span>
              <span className="block">It has no bookings, so no client record is affected.</span>
              <span className="block font-medium">
                Archiving instead keeps the row and simply hides it from the public menu — you can
                undo that at any time.
              </span>
            </span>
          ) : (
            ''
          )
        }
        confirmLabel="Delete permanently"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
          setDeleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget ? `Archive “${archiveTarget.name}”?` : 'Archive service'}
        tone="default"
        confirmLabel="Archive service"
        pending={archiveMutation.isPending}
        consequence={
          archiveTarget ? (
            <span className="block">
              The service disappears from the public menu and can no longer be booked, but its{' '}
              {archiveTarget.bookings_count} booking{archiveTarget.bookings_count === 1 ? '' : 's'}{' '}
              and its reviews stay intact. You can bring it back at any time.
            </span>
          ) : (
            ''
          )
        }
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget)
          setArchiveTarget(null)
        }}
      />

      <ConfirmDialog
        open={categoryDeleteTarget !== null}
        onOpenChange={(open) => !open && setCategoryDeleteTarget(null)}
        title={categoryDeleteTarget ? `Delete “${categoryDeleteTarget.name}”?` : 'Delete category'}
        description="This cannot be undone."
        consequence={
          categoryDeleteTarget ? (
            <span className="block space-y-1.5">
              <span className="block">
                The category is removed from every services page. Its services are{' '}
                <strong className="font-semibold">not</strong> deleted — they fall back to
                &ldquo;uncategorised&rdquo; and stay bookable.
              </span>
              <span className="block font-medium">
                Hiding the category instead keeps the grouping for existing links.
              </span>
            </span>
          ) : (
            ''
          )
        }
        confirmLabel="Delete category"
        pending={deleteCategoryMutation.isPending}
        onConfirm={() => {
          if (categoryDeleteTarget) deleteCategoryMutation.mutate(categoryDeleteTarget)
          setCategoryDeleteTarget(null)
        }}
      />
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// Service sheet
// ---------------------------------------------------------------------------

function ServiceSheet({
  draft: initial,
  categories,
  onClose,
  onSaved,
}: {
  draft: ServiceDraft
  categories: ServiceCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')

  const set = <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Slug tracks the name until the editor overrides it by hand.
  useEffect(() => {
    setDraft((current) =>
      current.slugTouched ? current : { ...current, slug: slugify(current.name) },
    )
  }, [draft.name])

  const mutation = useMutation({
    mutationFn: () =>
      saveService({
        ...(draft.id ? { id: draft.id } : {}),
        slug: draft.slug || slugify(draft.name),
        name: draft.name.trim(),
        category_id: draft.categoryId || null,
        summary: draft.summary.trim(),
        description: draft.description.trim() || null,
        duration_minutes: numberOr(draft.duration, 60),
        buffer_minutes: numberOr(draft.buffer, 0),
        price_from: numberOr(draft.priceFrom, 0),
        price_to: numberOrNull(draft.priceTo),
        price_unit: draft.priceUnit,
        requires_consultation: draft.requiresConsultation,
        requires_requirement: draft.requiresRequirement,
        gender_restriction: (draft.genderRestriction || null) as UserGender | null,
        badge: draft.badge.trim() || null,
        is_featured: draft.isFeatured,
        is_popular: draft.isPopular,
        display_order: numberOr(draft.displayOrder, 0),
        status: draft.status,
      }),
    onSuccess: (service) => {
      setState('saved')
      toast.success(`${service.name} saved.`)
      onSaved()
      onClose()
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  const invalid =
    !draft.name.trim() || !draft.summary.trim() || !draft.slug.trim() || !draft.priceFrom.trim()

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" title={draft.id ? 'Edit service' : 'New service'}>
        <SheetHeader className="flex-col items-start gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            {draft.id ? 'Edit service' : 'New service'}
          </h2>
          <p className="text-sm text-muted">
            Everything here is public the moment the service is active.
          </p>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!invalid) mutation.mutate()
          }}
        >
          <SheetBody className="space-y-6">
            <fieldset className="space-y-4">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Basics
              </legend>

              <Field label="Name" htmlFor="svc-name" required>
                <Input
                  id="svc-name"
                  value={draft.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Knotless braids"
                />
              </Field>

              <Field
                label="Slug"
                htmlFor="svc-slug"
                required
                hint="Used in the public URL. Generated from the name until you edit it."
              >
                <Input
                  id="svc-slug"
                  value={draft.slug}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                      slugTouched: true,
                    }))
                  }}
                />
              </Field>

              <Field
                label="Summary"
                htmlFor="svc-summary"
                required
                hint="One sentence, shown on the service card and in search results."
              >
                <Textarea
                  id="svc-summary"
                  rows={2}
                  value={draft.summary}
                  onChange={(event) => set('summary', event.target.value)}
                  placeholder="A protective, weightless install finished with a laid-back edge."
                />
              </Field>

              <Field label="Full description" htmlFor="svc-description" hint="Markdown is supported.">
                <Textarea
                  id="svc-description"
                  rows={6}
                  value={draft.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              </Field>
            </fieldset>

            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Grouping &amp; availability
              </legend>

              <Field label="Category" htmlFor="svc-category">
                <Select
                  id="svc-category"
                  value={draft.categoryId}
                  onChange={(event) => set('categoryId', event.target.value)}
                  placeholder="Uncategorised"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              </Field>

              <Field
                label="Gender restriction"
                htmlFor="svc-gender"
                hint="Leave as anyone unless the service genuinely cannot be performed otherwise."
              >
                <Select
                  id="svc-gender"
                  value={draft.genderRestriction}
                  onChange={(event) => set('genderRestriction', event.target.value)}
                  options={GENDER_RESTRICTIONS.map((option) => ({ ...option }))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Duration (minutes)" htmlFor="svc-duration" required>
                  <Input
                    id="svc-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={draft.duration}
                    onChange={(event) => set('duration', event.target.value)}
                  />
                </Field>
                <Field
                  label="Buffer (minutes)"
                  htmlFor="svc-buffer"
                  hint="Added after the slot so the chair is not double-booked."
                >
                  <Input
                    id="svc-buffer"
                    type="number"
                    min={0}
                    step={5}
                    value={draft.buffer}
                    onChange={(event) => set('buffer', event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Price from" htmlFor="svc-price-from" required>
                  <Input
                    id="svc-price-from"
                    type="number"
                    min={0}
                    step={500}
                    inputMode="numeric"
                    value={draft.priceFrom}
                    onChange={(event) => set('priceFrom', event.target.value)}
                    placeholder="35000"
                  />
                </Field>
                <Field
                  label="Price to"
                  htmlFor="svc-price-to"
                  hint="Leave empty when the price is fixed."
                >
                  <Input
                    id="svc-price-to"
                    type="number"
                    min={0}
                    step={500}
                    inputMode="numeric"
                    value={draft.priceTo}
                    onChange={(event) => set('priceTo', event.target.value)}
                    placeholder="140000"
                  />
                </Field>
              </div>

              <Field label="Price unit" htmlFor="svc-price-unit">
                <Select
                  id="svc-price-unit"
                  value={draft.priceUnit}
                  onChange={(event) => set('priceUnit', event.target.value)}
                  options={PRICE_UNITS.map((option) => ({ ...option }))}
                />
              </Field>

              <p className="text-xs text-muted">
                Card price shows{' '}
                <strong className="font-medium text-ink">
                  {formatPriceRange(
                    numberOr(draft.priceFrom, 0),
                    numberOrNull(draft.priceTo),
                  )}
                </strong>
                .
              </p>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Rules
              </legend>

              <Checkbox
                id="svc-consultation"
                checked={draft.requiresConsultation}
                onChange={(event) => set('requiresConsultation', event.target.checked)}
                label="Requires a consultation first"
                description="Booked as a separate, shorter appointment before the main service."
              />
              <Checkbox
                id="svc-requirement"
                checked={draft.requiresRequirement}
                onChange={(event) => set('requiresRequirement', event.target.checked)}
                label="Requires a requirement brief"
                description="The client submits hair history and references before they arrive."
              />
            </fieldset>

            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Presentation
              </legend>

              <Field label="Badge" htmlFor="svc-badge" hint="Short label shown on the card, e.g. “Best seller”.">
                <Input
                  id="svc-badge"
                  value={draft.badge}
                  onChange={(event) => set('badge', event.target.value)}
                  placeholder="Most booked"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display order" htmlFor="svc-order" hint="Lower numbers appear first.">
                  <Input
                    id="svc-order"
                    type="number"
                    value={draft.displayOrder}
                    onChange={(event) => set('displayOrder', event.target.value)}
                  />
                </Field>
                <Field label="Status" htmlFor="svc-status">
                  <Select
                    id="svc-status"
                    value={draft.status}
                    onChange={(event) =>
                      set('status', event.target.value as Service['status'])
                    }
                    options={STATUS_OPTIONS.map((option) => ({ ...option }))}
                  />
                </Field>
              </div>

              <div className="space-y-3 rounded-md border border-line px-4 py-3.5">
                <Switch
                  checked={draft.isFeatured}
                  onCheckedChange={(value) => set('isFeatured', value)}
                  label="Featured"
                  aria-label="Show this service in the featured row"
                />
                <Switch
                  checked={draft.isPopular}
                  onCheckedChange={(value) => set('isPopular', value)}
                  label="Mark as popular"
                  aria-label="Mark this service as popular"
                />
              </div>
            </fieldset>

            {draft.id && <VariantEditor serviceId={draft.id} />}

            <SaveStatus state={state} />
          </SheetBody>

          <SheetFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="sm:ml-auto"
              loading={mutation.isPending}
              loadingText="Saving…"
              disabled={invalid}
            >
              {draft.id ? 'Save service' : 'Create service'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Service variant editor
// ---------------------------------------------------------------------------

const EMPTY_VARIANT: ServiceVariant = {
  id: '',
  service_id: '',
  slug: '',
  label: '',
  description: null,
  price: 0,
  duration_minutes: 60,
  display_order: 0,
  is_active: true,
}

function VariantEditor({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ServiceVariant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceVariant | null>(null)

  const variantsQuery = useQuery({
    // Namespaced: the public `qk.serviceVariants` caches active-only rows.
    queryKey: qk.serviceVariants(`admin:${serviceId}`),
    queryFn: () => listServiceVariantsAdmin(serviceId),
    staleTime: 60_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.serviceVariants(`admin:${serviceId}`) })
    void queryClient.invalidateQueries({ queryKey: qk.servicesFlat() })
    void queryClient.invalidateQueries({ queryKey: qk.serviceVariants(serviceId) })
  }

  const saveMutation = useMutation({
    mutationFn: (variant: ServiceVariant) =>
      saveServiceVariant({
        ...(variant.id ? { id: variant.id } : { service_id: serviceId }),
        slug: variant.slug || slugify(variant.label),
        label: variant.label.trim(),
        description: variant.description?.trim() || null,
        price: variant.price,
        duration_minutes: variant.duration_minutes,
        display_order: variant.display_order,
        is_active: variant.is_active,
      }),
    onSuccess: () => {
      toast.success('Variant saved.')
      setEditing(null)
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (variant: ServiceVariant) => deleteServiceVariant(variant.id),
    onSuccess: () => {
      toast.success('Variant deleted.')
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const variants = variantsQuery.data ?? []

  return (
    <fieldset className="space-y-3 border-t border-line pt-5">
      <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
        Length &amp; size variants
      </legend>
      <p className="text-xs leading-relaxed text-muted">
        Variants drive the slot duration and the price the customer commits to. A service with none
        books at its base price and duration.
      </p>

      <AsyncSection
        isLoading={variantsQuery.isLoading}
        isError={variantsQuery.isError}
        error={variantsQuery.error}
        onRetry={() => void variantsQuery.refetch()}
        isEmpty={variants.length === 0}
        empty={<p className="text-xs text-muted">No variants yet.</p>}
      >
        <ul className="divide-y divide-line rounded-md border border-line">
          {variants.map((variant) => (
            <li
              key={variant.id}
              className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 first:pt-3 last:pb-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{variant.label}</p>
                <p className="text-xs text-muted">
                  {formatNaira(variant.price)} · {variant.duration_minutes} min · order{' '}
                  {variant.display_order}
                  {!variant.is_active && ' · hidden'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(variant)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`Delete variant ${variant.label}`}
                onClick={() => setDeleteTarget(variant)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </AsyncSection>

      <Button
        variant="subtle"
        size="sm"
        onClick={() =>
          setEditing({
            ...EMPTY_VARIANT,
            service_id: serviceId,
            display_order: variants.length,
            duration_minutes: 60,
          })
        }
      >
        <Plus aria-hidden />
        Add variant
      </Button>

      {editing && (
        <Sheet open onOpenChange={(open) => !open && setEditing(null)}>
          <SheetContent side="right" title={editing.id ? 'Edit variant' : 'New variant'}>
            <SheetHeader className="flex-col items-start gap-1">
              <h2 className="font-display text-lg font-semibold text-ink">
                {editing.id ? 'Edit variant' : 'New variant'}
              </h2>
              <p className="text-sm text-muted">
                Slug is generated from the label and must be unique within the service.
              </p>
            </SheetHeader>

            <SheetBody className="space-y-4">
              <Field label="Label" htmlFor="variant-label" required>
                <Input
                  id="variant-label"
                  value={editing.label}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            label: event.target.value,
                            slug: current.id
                              ? current.slug
                              : slugify(event.target.value),
                          }
                        : current,
                    )
                  }
                  placeholder="36 inch · 200g"
                />
              </Field>

              <Field label="Description" htmlFor="variant-description">
                <Textarea
                  id="variant-description"
                  rows={3}
                  value={editing.description ?? ''}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Price" htmlFor="variant-price" required>
                  <Input
                    id="variant-price"
                    type="number"
                    min={0}
                    step={500}
                    value={String(editing.price)}
                    onChange={(event) =>
                      setEditing((current) =>
                        current
                          ? { ...current, price: numberOr(event.target.value, 0) }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Duration (minutes)" htmlFor="variant-duration" required>
                  <Input
                    id="variant-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={String(editing.duration_minutes)}
                    onChange={(event) =>
                      setEditing((current) =>
                        current
                          ? {
                              ...current,
                              duration_minutes: numberOr(event.target.value, 30),
                            }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>

              <Field label="Display order" htmlFor="variant-order">
                <Input
                  id="variant-order"
                  type="number"
                  value={String(editing.display_order)}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? { ...current, display_order: numberOr(event.target.value, 0) }
                        : current,
                    )
                  }
                />
              </Field>

              <div className="rounded-md border border-line px-4 py-3.5">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(value) =>
                    setEditing((current) =>
                      current ? { ...current, is_active: value } : current,
                    )
                  }
                  label="Active"
                  aria-label="Show this variant on the booking flow"
                />
              </div>
            </SheetBody>

            <SheetFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                className="ml-auto"
                loading={saveMutation.isPending}
                loadingText="Saving…"
                disabled={!editing.label.trim()}
                onClick={() => saveMutation.mutate(editing)}
              >
                Save variant
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete “${deleteTarget.label}”?` : 'Delete variant'}
        description="This cannot be undone."
        consequence={
          deleteTarget ? (
            <span className="block space-y-1.5">
              <span className="block">
                Existing appointments keep their recorded price and duration, so nothing already
                booked changes.
              </span>
              <span className="block font-medium">
                New bookings will no longer be able to choose this option.
              </span>
            </span>
          ) : (
            ''
          )
        }
        confirmLabel="Delete variant"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
          setDeleteTarget(null)
        }}
      />
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Category sheet
// ---------------------------------------------------------------------------

function CategorySheet({
  draft: initial,
  onClose,
  onSaved,
}: {
  draft: CategoryDraft
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')

  useEffect(() => {
    setDraft((current) =>
      current.slugTouched ? current : { ...current, slug: slugify(current.name) },
    )
  }, [draft.name])

  const mutation = useMutation({
    mutationFn: () =>
      saveServiceCategory({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        slug: draft.slug || slugify(draft.name),
        description: draft.description.trim() || null,
        icon: draft.icon.trim() || null,
        display_order: numberOr(draft.displayOrder, 0),
        is_active: draft.isActive,
      }),
    onSuccess: (category) => {
      setState('saved')
      toast.success(`${category.name} saved.`)
      onSaved()
      onClose()
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" title={draft.id ? 'Edit category' : 'New category'}>
        <SheetHeader className="flex-col items-start gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            {draft.id ? 'Edit category' : 'New category'}
          </h2>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.name.trim()) mutation.mutate()
          }}
        >
          <SheetBody className="space-y-4">
            <Field label="Name" htmlFor="cat-name" required>
              <Input
                id="cat-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Braids"
              />
            </Field>

            <Field label="Slug" htmlFor="cat-slug" required>
              <Input
                id="cat-slug"
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                    slugTouched: true,
                  }))
                }
              />
            </Field>

            <Field label="Description" htmlFor="cat-description">
              <Textarea
                id="cat-description"
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>

            <Field
              label="Icon"
              htmlFor="cat-icon"
              hint="Lucide icon key used on the services page, e.g. “scissors”."
            >
              <Input
                id="cat-icon"
                value={draft.icon}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, icon: event.target.value }))
                }
                placeholder="scissors"
              />
            </Field>

            <Field label="Display order" htmlFor="cat-order">
              <Input
                id="cat-order"
                type="number"
                value={draft.displayOrder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, displayOrder: event.target.value }))
                }
              />
            </Field>

            <div className="rounded-md border border-line px-4 py-3.5">
              <Switch
                checked={draft.isActive}
                onCheckedChange={(value) =>
                  setDraft((current) => ({ ...current, isActive: value }))
                }
                label="Active"
                aria-label="Show this category on the services page"
              />
            </div>

            <SaveStatus state={state} />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="ml-auto"
              loading={mutation.isPending}
              loadingText="Saving…"
              disabled={!draft.name.trim()}
            >
              Save category
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toneFor(status: Service['status']): 'success' | 'warning' | 'default' {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'default'
}

function toDraft(service: Service): ServiceDraft {
  return {
    id: service.id,
    slug: service.slug,
    slugTouched: true,
    name: service.name,
    categoryId: service.category_id ?? '',
    summary: service.summary,
    description: service.description ?? '',
    duration: String(service.duration_minutes),
    buffer: String(service.buffer_minutes),
    priceFrom: toInputValue(service.price_from),
    priceTo: toInputValue(service.price_to),
    priceUnit: service.price_unit,
    requiresConsultation: service.requires_consultation,
    requiresRequirement: service.requires_requirement,
    genderRestriction: service.gender_restriction ?? '',
    badge: service.badge ?? '',
    isFeatured: service.is_featured,
    isPopular: service.is_popular,
    displayOrder: String(service.display_order),
    status: service.status,
  }
}

function toCategoryDraft(category: ServiceCategory): CategoryDraft {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    slugTouched: true,
    description: category.description ?? '',
    icon: category.icon ?? '',
    displayOrder: String(category.display_order),
    isActive: category.is_active,
  }
}
