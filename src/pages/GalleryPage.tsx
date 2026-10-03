import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, ImageOff, Images, Maximize2 } from 'lucide-react'

import { getGallery, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { PHOTO_CREDITS } from '@/config/media.credits'
import { cn } from '@/lib/utils/cn'
import { humanise } from '@/lib/utils/format'
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@/components/ui'
import { PageHeader } from '@/components/shared/Cards'
import { BeforeAfter, ClosingCta, Section } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { CardGridSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, useSeo } from '@/components/seo/Seo'
import type { GalleryItem } from '@/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Chip order is editorial: the work first, the space and the people last. */
const CATEGORIES = [
  { value: 'all', label: 'All work' },
  { value: 'braids', label: 'Braids' },
  { value: 'locs', label: 'Locs' },
  { value: 'hair', label: 'Hair' },
  { value: 'colour', label: 'Colour' },
  { value: 'styling', label: 'Styling' },
  { value: 'before_after', label: 'Before & after' },
  { value: 'interior', label: 'The studio' },
  { value: 'team', label: 'The team' },
] as const

type CategoryValue = (typeof CATEGORIES)[number]['value']

/** Stable empty array, so memoised derivations keep a constant dependency. */
const NO_ITEMS: GalleryItem[] = []

/**
 * True while the gallery is running on borrowed photography.
 *
 * The page claims its images are the studio's own work, on a real client, with
 * permission — and it also links before/after shots as evidence of a result.
 * That claim has to follow whatever is actually published, or the site is
 * asserting something untrue about a booking decision. Driven by the generated
 * credits rather than a flag, so it flips the moment real photography lands.
 */
const usesBorrowedPhotography = Object.keys(PHOTO_CREDITS).length > 0

function whatsappHref(message: string): string {
  return `https://wa.me/${site.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function GalleryPage() {
  const [active, setActive] = useState<CategoryValue>('all')
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const galleryQuery = useQuery({
    queryKey: qk.gallery(),
    queryFn: () => getGallery(),
    staleTime: 10 * 60_000,
  })

  const items = galleryQuery.data ?? NO_ITEMS

  // Counts drive the chip labels, and hide categories with nothing published.
  const counts = useMemo(() => {
    const tally = new Map<string, number>()
    for (const item of items) tally.set(item.category, (tally.get(item.category) ?? 0) + 1)
    return tally
  }, [items])

  const availableCategories = useMemo(
    () =>
      CATEGORIES.filter(
        (category) => category.value === 'all' || (counts.get(category.value) ?? 0) > 0,
      ),
    [counts],
  )

  const filtered = useMemo(
    () => (active === 'all' ? items : items.filter((item) => item.category === active)),
    [active, items],
  )

  const lightboxItem: GalleryItem | null = useMemo(
    () => items.find((item) => item.id === lightboxId) ?? null,
    [items, lightboxId],
  )

  const activeLabel = CATEGORIES.find((category) => category.value === active)?.label ?? 'All work'

  const jsonLd = useMemo(
    () => [
      breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Gallery', path: '/gallery' },
      ]),
    ],
    [],
  )

  useSeo({
    title: 'Gallery — braids, locs, colour and styling',
    description:
      'Real work from the Black Chery Unisex Studio floor: knotless and box braids, sculpted locs, silk presses, balayage and before-and-after results from clients in Lagos.',
    path: '/gallery',
    jsonLd,
  })

  return (
    <>
      <PageHeader
        eyebrow="The gallery"
        title="Work from the floor, not from a mood board"
        description={
          usesBorrowedPhotography
            ? 'Representative looks from our work, shown while our own studio photography is being shot. Filter by what you are planning, then tap any shot to see it properly.'
            : 'Every image here was taken in the studio on a real client, with their permission. Filter by what you are planning, then tap any shot to see it properly.'
        }
        breadcrumb={[{ label: 'Gallery', to: '/gallery' }]}
        action={
          <Button asChild size="xl">
            <Link to="/book">Book this look</Link>
          </Button>
        }
      />

      <Section tone="canvas">
        {/* ----------------------------------------------------------------
            Category chips
        ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="rail -mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            role="group"
            aria-label="Filter gallery by category"
          >
            {availableCategories.map((category) => {
              const isActive = active === category.value
              const chipCount =
                category.value === 'all' ? items.length : (counts.get(category.value) ?? 0)
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setActive(category.value)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:bg-sand',
                  )}
                >
                  {category.label}
                  <span className={cn('text-xs tabular-nums', isActive ? 'text-canvas/60' : 'text-faint')}>
                    {chipCount}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="shrink-0 text-sm text-muted" role="status" aria-live="polite">
            Showing {filtered.length} {filtered.length === 1 ? 'shot' : 'shots'} · {activeLabel}
          </p>
        </div>

        <div className="mt-9">
          {galleryQuery.isLoading && <CardGridSkeleton count={9} />}

          {galleryQuery.isError && (
            <Alert
              variant="danger"
              title="We could not load the gallery"
              action={
                <Button variant="outline" size="sm" onClick={() => galleryQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(galleryQuery.error)}
            </Alert>
          )}

          {!galleryQuery.isLoading && !galleryQuery.isError && items.length === 0 && (
            <EmptyState
              icon={<Images aria-hidden />}
              title="The gallery is empty for now"
              description="We are shooting a new set of studio work this month. In the meantime, browse the service menu or ask us for examples on WhatsApp."
              action={
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Button asChild size="lg">
                    <Link to="/services">Browse services</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a
                      href={whatsappHref(
                        "Hi! Could you send me examples of work similar to what I'm looking for?",
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ask for examples
                    </a>
                  </Button>
                </div>
              }
            />
          )}

          {!galleryQuery.isLoading && items.length > 0 && filtered.length === 0 && (
            <EmptyState
              icon={<ImageOff aria-hidden />}
              title="Nothing published in this category yet"
              description="We shoot in batches, so a few categories are still waiting on their photos. Try another filter — or tell us what you would like to see."
              action={
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Button size="lg" onClick={() => setActive('all')}>
                    Show all work
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a
                      href={whatsappHref("Hi! I'd like to see examples of a specific look.")}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ask on WhatsApp
                    </a>
                  </Button>
                </div>
              }
            />
          )}

          {filtered.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item, index) => (
                <li key={item.id}>
                  <GalleryTile item={item} priority={index < 3} onOpen={() => setLightboxId(item.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <ClosingCta
        eyebrow="Seen enough?"
        title="Any of this can be yours by Friday."
        description="Send us the shot you liked as a reference when you book. Your stylist will tell you honestly what it will take to get there on your hair."
        secondary={{ label: 'See our services', to: '/services' }}
      />

      {/* ------------------------------------------------------------------
          Lightbox
      ------------------------------------------------------------------ */}
      <Dialog
        open={lightboxItem !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxId(null)
        }}
      >
        <DialogContent size="xl">
          {lightboxItem && (
            <>
              <DialogHeader>
                <DialogTitle>{lightboxItem.title ?? humanise(lightboxItem.category)}</DialogTitle>
                <DialogDescription>
                  {lightboxItem.alt_text ??
                    `Salon work from Black Chery Unisex Studio — ${humanise(lightboxItem.category)}.`}
                </DialogDescription>
              </DialogHeader>

              <DialogBody>
                <LightboxBody item={lightboxItem} />

                {lightboxItem.tags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {lightboxItem.tags.map((tag) => (
                      <Badge key={tag} size="sm" variant="default">
                        {humanise(tag)}
                      </Badge>
                    ))}
                  </div>
                )}
              </DialogBody>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Close</Button>
                </DialogClose>
                <Button asChild onClick={() => setLightboxId(null)}>
                  <Link to="/book">
                    <Camera aria-hidden />
                    Book a look like this
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

function GalleryTile({
  item,
  priority,
  onOpen,
}: {
  item: GalleryItem
  priority?: boolean
  onOpen: () => void
}) {
  const isBeforeAfter = item.category === 'before_after' && Boolean(item.before_image_url)

  if (isBeforeAfter) {
    return (
      <div className="space-y-3">
        <BeforeAfter item={item} />
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{item.title ?? 'Before and after'}</p>
              {item.alt_text && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.alt_text}</p>
              )}
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/book">Book this</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <Card interactive className="group overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={`Open larger view of ${item.title ?? item.alt_text ?? 'salon work'}`}
      >
        <div className="relative">
          <MediaFrame
            src={item.image_url}
            alt={item.alt_text ?? item.title ?? 'Salon work at Black Chery Unisex Studio'}
            seed={item.slug ?? item.id}
            aspect="4/5"
            priority={priority}
            imgClassName="transition-transform duration-500 ease-[var(--ease-editorial)] group-hover:scale-[1.04]"
          />

          <Badge variant="onImage" size="sm" className="absolute left-3 top-3">
            {humanise(item.category)}
          </Badge>

          <span
            className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          >
            <Maximize2 className="size-4" />
          </span>
        </div>

        <div className="p-4">
          <p className="line-clamp-1 font-display text-[0.9375rem] font-semibold text-ink">
            {item.title ?? humanise(item.category)}
          </p>
          {item.alt_text && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.alt_text}</p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} size="sm" variant="default">
                  {humanise(tag)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Lightbox body
// ---------------------------------------------------------------------------

function LightboxBody({ item }: { item: GalleryItem }) {
  const hasBefore = Boolean(item.before_image_url)
  const hasAfter = Boolean(item.after_image_url)

  if (hasBefore && hasAfter) {
    const panels = [
      { url: item.before_image_url!, label: 'Before', seed: `${item.slug ?? item.id}-before` },
      { url: item.after_image_url!, label: 'After', seed: `${item.slug ?? item.id}-after` },
    ]

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {panels.map((panel) => (
          <figure key={panel.label} className="space-y-2">
            <div className="relative overflow-hidden rounded-lg">
              <MediaFrame
                src={panel.url}
                alt={`${panel.label} — ${item.alt_text ?? item.title ?? 'salon result'}`}
                seed={panel.seed}
                aspect="4/5"
              />
              <Badge variant="onImage" size="sm" className="absolute left-3 top-3">
                {panel.label}
              </Badge>
            </div>
            <figcaption className="text-xs leading-relaxed text-muted">
              {panel.label} —{' '}
              {usesBorrowedPhotography
                ? 'representative of the work we do.'
                : 'photographed in the studio with the client’s permission.'}
            </figcaption>
          </figure>
        ))}
      </div>
    )
  }

  return (
    <MediaFrame
      className="rounded-lg"
      src={item.image_url}
      alt={item.alt_text ?? item.title ?? 'Salon work at Black Chery Unisex Studio'}
      seed={item.slug ?? item.id}
      aspect="4/3"
      priority
    />
  )
}
