/**
 * Photography manifest — every image slot the site expects.
 *
 * This is the shot list for the studio's photography. Each entry declares a
 * file path under `public/images`, the alt text that must accompany it, and
 * the intrinsic dimensions and focal point used to reserve layout space and
 * crop on mobile.
 *
 * Publishing a photo is a file operation, not a code change:
 *
 *   1. Save the photo at `public/images/<file>` using the exact name below.
 *   2. Run `npm run media:sync` (already wired into `dev` and `build`).
 *
 * `resolvePhoto` then starts returning the real URL and MediaFrame renders it
 * instead of its placeholder. Nothing else in the app needs to know.
 *
 * Alt text is written for someone who cannot see the image, so it says what is
 * in the frame — not that a photo exists. `credit` is only populated for
 * photography the studio does not own; it renders in the footer credits.
 */
import { PUBLISHED_PHOTOS } from './media.generated'
import { PHOTO_CREDITS } from './media.credits'

/** Attribution for a photo the studio does not own. Omit for studio photography. */
export interface PhotoCredit {
  author: string
  license: string
  /** Canonical page for the original, not the file we host. */
  source: string
}

export interface MediaSlot {
  /** Path under `public/images`, e.g. `gallery/braids-01.jpg`. */
  file: string
  /** Describes the frame. Required — there is no safe default. */
  alt: string
  width: number
  height: number
  /** Subject position within the frame, 0–1. Applied as object-position. */
  focal: { x: number; y: number }
  credit?: PhotoCredit
}

const slot = (
  dir: string,
  name: string,
  alt: string,
  width: number,
  height: number,
  focal: [number, number] = [0.5, 0.5],
): MediaSlot => ({
  file: `${dir}/${name}`,
  alt,
  width,
  height,
  focal: { x: focal[0], y: focal[1] },
})

// ---------------------------------------------------------------------------
// Studio-wide photography
//
// Wide establishing shots for the home page, about page and contact panel.
// ---------------------------------------------------------------------------

export const STUDIO_SHOTS = {
  hero: slot(
    'studio',
    'hero-01.jpg',
    'A stylist sectioning a client’s hair at a styling chair in the studio',
    2400,
    1600,
    [0.45, 0.4],
  ),
  heroSecondary: slot(
    'studio',
    'hero-02.jpg',
    'Braids in progress on a client seated under a hooded dryer',
    1600,
    2000,
    [0.5, 0.45],
  ),
  floor: slot(
    'studio',
    'floor-01.jpg',
    'The studio floor, with styling chairs facing mirrors and warm afternoon light',
    2400,
    1600,
  ),
  reception: slot(
    'studio',
    'reception-01.jpg',
    'The studio reception counter, with the product shelf and appointment diary',
    1600,
    1200,
  ),
  interiorDetail: slot(
    'studio',
    'interior-01.jpg',
    'A styling station set with brushes, clips and a folded cape',
    1600,
    1200,
    [0.4, 0.5],
  ),
  productsShelf: slot(
    'studio',
    'products-01.jpg',
    'Shelves of hair care products and treatments on the studio retail wall',
    1600,
    1200,
  ),
  aboutStory: slot(
    'studio',
    'about-01.jpg',
    'A stylist braiding a client’s hair, working section by section',
    1600,
    2000,
    [0.5, 0.4],
  ),
  careersTeam: slot(
    'studio',
    'team-01.jpg',
    'Three stylists working side by side at adjacent chairs',
    2000,
    2500,
    [0.5, 0.45],
  ),
} as const satisfies Record<string, MediaSlot>

export type StudioShotKey = keyof typeof STUDIO_SHOTS

// ---------------------------------------------------------------------------
// Gallery
//
// Four photographs per category. The categories match `gallery_items.category`
// in the database; keeping them aligned is what lets the gallery grid filter
// and still find a photo for every tile.
// ---------------------------------------------------------------------------

export const GALLERY_CATEGORIES = [
  'braids',
  'locs',
  'hair',
  'colour',
  'styling',
  'before_after',
  'interior',
  'team',
] as const

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]

/**
 * Alt text per category, one entry per photo slot (4 per category).
 *
 * Order matters: slot 1 is the tile the category filter shows first, so the
 * strongest, most representative photograph goes first.
 */
const GALLERY_ALT: Record<GalleryCategory, readonly string[]> = {
  braids: [
    'Knotless braids styled into a long centre-parted curtain',
    'A stylist installing knotless braids close to the scalp',
    'Braided cornrows finished with a braided bun',
    'Feed-in braids styled with a wrap at the nape',
  ],
  locs: [
    'Loc sculpting on short, freshly retwisted locs',
    'A stylist retwisting locs section by section at the chair',
    'Long locs styled into an updo for an event',
    'Loc ends freshly retwisted and shaped',
  ],
  hair: [
    'A signature cut with a clean fringe, freshly styled',
    'A stylist cutting a client’s hair with scissors and comb',
    'A short cropped cut, shaped with clippers at the nape',
    'A blunt cut, finished with a smooth blow-dry',
  ],
  colour: [
    'A warm balayage result with soft, blended roots',
    'A colourist applying toner with a brush at the basin',
    'Blonde highlights blended through mid-lengths',
    'A rich brunette colour correction, grown out softly',
  ],
  styling: [
    'A silk press finished with a smooth, glossy blowout',
    'Curl definition set and shaped on a client with coily hair',
    'A braided updo pinned for a wedding',
    'A sleek middle-parted style smoothed with a flat iron',
  ],
  before_after: [
    'Before: hair grown out at the roots between appointments',
    'After: colour and cut refreshed at a follow-up appointment',
    'Before: a length change between trims',
    'After: the same length cut, shaped and styled',
  ],
  interior: [
    'The studio floor, with styling chairs facing a mirrored wall',
    'The reception counter and product shelf near the entrance',
    'A styling station set with brushes, clips and a folded cape',
    'The waiting area, with soft seating and the studio sign',
  ],
  team: [
    'A stylist braiding a client’s hair at the chair',
    'Two stylists working at adjacent chairs on a busy afternoon',
    'A colourist mixing a formula at the station',
    'A stylist sectioning and pinning hair before a cut',
  ],
}

/** Filename-safe index per category. */
function galleryFile(category: GalleryCategory, index: number): string {
  const n = String(index + 1).padStart(2, '0')
  // before_after reads as a pair rather than a sequence, so it keeps its own name.
  const stem = category === 'before_after' ? 'transformation' : category
  return `gallery/${stem}-${n}.jpg`
}

export const GALLERY_SLOTS: Record<GalleryCategory, readonly MediaSlot[]> = GALLERY_CATEGORIES.reduce(
  (acc, category) => {
    const landscape = category === 'interior' || category === 'team'
    acc[category] = GALLERY_ALT[category].map((alt, i) => ({
      file: galleryFile(category, i),
      alt,
      width: landscape ? 1600 : 1200,
      height: landscape ? 1200 : 1600,
      // Faces and hands sit high in the frame; bias the crop upward so a
      // 4:5 mobile crop does not cut them off.
      focal: { x: 0.5, y: 0.4 },
    }))
    return acc
  },
  {} as Record<GalleryCategory, readonly MediaSlot[]>,
)

// ---------------------------------------------------------------------------
// Catalogue photos
//
// Services and products want two and three photographs respectively. Alt text is
// generated from the record's own name so it stays accurate if the catalogue is
// edited, and is intentionally plain: a product shot on white says very little.
// ---------------------------------------------------------------------------

export function serviceSlots(slug: string, name: string): readonly MediaSlot[] {
  return [0, 1].map((i) => {
    const n = String(i + 1).padStart(2, '0')
    return {
      file: `services/${slug}-${n}.jpg`,
      alt: `${name}, photo ${i + 1}`,
      width: 1200,
      height: 1500,
      focal: { x: 0.5, y: 0.45 },
    } satisfies MediaSlot
  })
}

export function productSlots(slug: string, name: string): readonly MediaSlot[] {
  return [0, 1, 2].map((i) => {
    const n = String(i + 1).padStart(2, '0')
    return {
      file: `products/${slug}-${n}.jpg`,
      alt: `${name}, photo ${i + 1}`,
      width: 1200,
      height: 1200,
      focal: { x: 0.5, y: 0.5 },
    } satisfies MediaSlot
  })
}

export function stylistSlot(slug: string, name: string): MediaSlot {
  return {
    file: `stylists/${slug}.jpg`,
    alt: `${name}`,
    width: 800,
    height: 800,
    // Headshots are cropped tight; bias upward so the framing survives a
    // circular avatar crop on small sizes.
    focal: { x: 0.5, y: 0.35 },
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * URL for a slot, or `null` when the photograph has not been published yet.
 *
 * Returning `null` rather than a URL that 404s is deliberate: it lets callers
 * fall back to the on-brand placeholder, and keeps the console clean instead of
 * logging a failed request for every unphotographed tile on the gallery.
 */
export function resolvePhoto(slot: MediaSlot | null | undefined): string | null {
  if (!slot) return null
  if (!PUBLISHED_PHOTOS[slot.file]) return null
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/$/, '')}/images/${slot.file}`
}

/**
 * Every credited photograph currently published, for the footer credits link.
 *
 * Attribution lives in the generated `media.credits.ts` rather than inline on
 * each slot: the studio's own photography needs none, so the overwhelmingly
 * common case is a manifest with no `credit` keys at all. Credits are merged in
 * here — the only consumer — which means `scripts/fetch-stock-photography.mjs`
 * can write attribution without editing this file.
 *
 * Returns an empty list when nothing is borrowed, in which case the footer
 * hides the disclosure entirely.
 */
export function publishedCredits(): Array<PhotoCredit & { file: string; alt: string }> {
  const all: MediaSlot[] = [
    ...Object.values(STUDIO_SHOTS),
    ...Object.values(GALLERY_SLOTS).flat(),
  ]
  return all
    .map((slot): (PhotoCredit & { file: string; alt: string }) | null => {
      const credit = PHOTO_CREDITS[slot.file]
      return credit ? { file: slot.file, alt: slot.alt, ...credit } : null
    })
    .filter((entry): entry is PhotoCredit & { file: string; alt: string } => entry !== null)
    .filter((entry) => Boolean(PUBLISHED_PHOTOS[entry.file]))
}