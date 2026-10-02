/**
 * Development fixtures.
 *
 * Mirrors `supabase/migrations/…_seed.sql` so the UI can be reviewed without a
 * Supabase project. Same slugs, same prices, same durations — so screenshots and
 * copy written against mocks stay true against the real database.
 */

import {
  GALLERY_SLOTS,
  STUDIO_SHOTS,
  productSlots,
  resolvePhoto,
  serviceSlots,
  stylistSlot,
  type GalleryCategory,
  type MediaSlot,
  type StudioShotKey,
} from '@/config/media'

/**
 * Photograph URL for a manifest slot, or `null` when nothing is published yet.
 *
 * Previously this returned a picsum URL keyed on a seed string. That was worse
 * than having no image at all: a truthy `src` makes MediaFrame skip its
 * on-brand placeholder and render an arbitrary photograph of a landscape, so
 * every tile looked broken rather than unphotographed. Returning `null` lets
 * the placeholder show until real photography is dropped into public/images.
 */
const img = (slot: MediaSlot | null | undefined) => resolvePhoto(slot)

/** Every published URL for a set of slots, dropping the ones not yet shot. */
const imgs = (slots: readonly MediaSlot[]) =>
  slots.map(resolvePhoto).filter((url): url is string => url !== null)

/** Studio-wide shot by key. */
const studioShot = (key: StudioShotKey): MediaSlot => STUDIO_SHOTS[key]

/** Mirrors the slug rule used for `profiles`, so photo paths stay stable. */
const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

// ---------------------------------------------------------------------------
// Business configuration
// ---------------------------------------------------------------------------
export const business_settings = {
  business_name: 'Black Chery Unisex Studio',
  legal_name: 'Black Chery Unisex Studio',
  tagline: 'Premium hair, braids, locs and colour for everyone.',
  currency: 'NGN',
  tax_pct: 7.5,
  tax_inclusive: true,
  booking_lead_time_hours: 4,
  max_advance_days: 60,
  min_notice_hours: 2,
  cancellation_window_hours: 24,
  deposit_required: false,
  deposit_pct: 30,
  free_delivery_threshold: 75000,
  standard_delivery_fee: 2500,
  accepts_delivery: true,
  accepts_pickup: true,
  support_email: 'hello@blackcheryunisexstudio.com',
  support_phone: '+2348000000000',
  whatsapp_number: '2348000000000',
  instagram: 'blackcheryunisexstudio',
  facebook: 'unitexhairstudio',
  tiktok: 'blackcheryunisexstudio',
  x_twitter: 'blackcheryunisexstudio',
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
export const salon_locations = [
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Black Chery Unisex Studio — Ajah',
    slug: 'ogombo-ajah',
    address_line1: 'Ogombo Roundabout',
    address_line2: null,
    city: 'Ajah',
    state: 'Lagos',
    country: 'NG',
    postal_code: '101245',
    latitude: '6.450348',
    longitude: '3.613736',
    phone: '+2348000000000',
    whatsapp: '2348000000000',
    email: 'hello@blackcheryunisexstudio.com',
    timezone: 'Africa/Lagos',
    is_primary: true,
    is_active: true,
    display_order: 1,
  },
]

const LOCATION_ID: string = salon_locations[0]!.id

export const location_hours = [
  { id: 'lh0', location_id: LOCATION_ID, weekday: 0, opens_at: '00:00', closes_at: '00:00', is_closed: true, note: null },
  { id: 'lh1', location_id: LOCATION_ID, weekday: 1, opens_at: '09:00', closes_at: '19:00', is_closed: false, note: null },
  { id: 'lh2', location_id: LOCATION_ID, weekday: 2, opens_at: '09:00', closes_at: '19:00', is_closed: false, note: null },
  { id: 'lh3', location_id: LOCATION_ID, weekday: 3, opens_at: '09:00', closes_at: '19:00', is_closed: false, note: null },
  { id: 'lh4', location_id: LOCATION_ID, weekday: 4, opens_at: '09:00', closes_at: '19:00', is_closed: false, note: null },
  { id: 'lh5', location_id: LOCATION_ID, weekday: 5, opens_at: '09:00', closes_at: '20:00', is_closed: false, note: null },
  { id: 'lh6', location_id: LOCATION_ID, weekday: 6, opens_at: '10:00', closes_at: '20:00', is_closed: false, note: null },
]

// ---------------------------------------------------------------------------
// Service catalogue
// ---------------------------------------------------------------------------
const CATEGORY_IDS = {
  braids: 'c0000000-0000-4000-8000-000000000001',
  locs: 'c0000000-0000-4000-8000-000000000002',
  haircuts: 'c0000000-0000-4000-8000-000000000003',
  colour: 'c0000000-0000-4000-8000-000000000004',
  styling: 'c0000000-0000-4000-8000-000000000005',
  treatments: 'c0000000-0000-4000-8000-000000000006',
  wig: 'c0000000-0000-4000-8000-000000000007',
}

export const service_categories = [
  { id: CATEGORY_IDS.braids, slug: 'braids', name: 'Braids', description: 'Knotless, box, stitch, cornrow and beadwork across every length.', icon: 'scissors', image_url: null, display_order: 1, is_featured: true, is_active: true },
  { id: CATEGORY_IDS.locs, slug: 'locs', name: 'Locs', description: 'Starter locs, retwisting, sculpting, colouring and repairs.', icon: 'sparkles', image_url: null, display_order: 2, is_featured: false, is_active: true },
  { id: CATEGORY_IDS.haircuts, slug: 'haircuts', name: 'Haircuts', description: 'Precision cuts, fades, layers and restyling for every texture.', icon: 'scissors', image_url: null, display_order: 3, is_featured: false, is_active: true },
  { id: CATEGORY_IDS.colour, slug: 'colour', name: 'Colour', description: 'Balayage, highlights, gloss, colour correction and creative colour.', icon: 'palette', image_url: null, display_order: 4, is_featured: false, is_active: true },
  { id: CATEGORY_IDS.styling, slug: 'styling', name: 'Styling', description: 'Silk press, blowouts, updos, styling and event looks.', icon: 'wind', image_url: null, display_order: 5, is_featured: false, is_active: true },
  { id: CATEGORY_IDS.treatments, slug: 'treatments', name: 'Treatments', description: 'Repair, protein, hydration and scalp therapy for healthy hair.', icon: 'droplet', image_url: null, display_order: 6, is_featured: false, is_active: true },
  { id: CATEGORY_IDS.wig, slug: 'wig', name: 'Wig Services', description: 'Fitting, customisation, cutting and installation of wigs.', icon: 'crown', image_url: null, display_order: 7, is_featured: false, is_active: true },
]

type ServiceSeed = {
  slug: string
  name: string
  category: keyof typeof CATEGORY_IDS
  summary: string
  description: string
  includes: string[]
  aftercare: string[]
  duration_minutes: number
  price_from: number
  price_to: number | null
  is_featured?: boolean
  is_popular?: boolean
  badge?: string
  requires_consultation?: boolean
  display_order: number
}

const SERVICE_SEEDS: ServiceSeed[] = [
  {
    slug: 'knotless-braids', name: 'Knotless Braids', category: 'braids',
    summary: 'Long-lasting knotless braids with a seamless, natural finish.',
    description: 'Our signature knotless technique keeps the parting clean and the hair light. We include a full wash, install, cut and style.',
    includes: ['Shampoo and conditioning', 'Install with custom parting', 'Trim and custom-shape', 'Styling and finish'],
    aftercare: ['Use a silk or satin bonnet nightly for the first 3 weeks', 'Avoid heavy oils at the roots for 2 weeks', 'Arrive with hair clean and detangled'],
    duration_minutes: 300, price_from: 45000, price_to: 140000,
    is_featured: true, is_popular: true, badge: 'Most booked', display_order: 1,
  },
  {
    slug: 'box-braids', name: 'Box Braids', category: 'braids',
    summary: 'Classic box braids for a bold, protective and durable look.',
    description: 'Neat square partings finished with our signature edge treatment and styled to suit your face shape.',
    includes: ['Shampoo and conditioning', 'Box braid install', 'Cut to length', 'Style and edge'],
    aftercare: ['Keep the scalp clean and moisturised daily', 'Sleep in a bonnet', 'Reapply edge control roughly weekly'],
    duration_minutes: 270, price_from: 38000, price_to: 120000,
    is_popular: true, display_order: 2,
  },
  {
    slug: 'stitch-braids', name: 'Stitch Braids', category: 'braids',
    summary: 'Fine, understated stitch braids for a refined everyday look.',
    description: 'A refined stitch pattern for clients who want braids without the weight of full box braids.',
    includes: ['Shampoo and conditioning', 'Stitch braid install', 'Neat finishing', 'Style'],
    aftercare: ['Avoid water for the first 48 hours', 'Keep in a bonnet at night'],
    duration_minutes: 240, price_from: 35000, price_to: 95000, display_order: 3,
  },
  {
    slug: 'cornrows', name: 'Cornrow Braids', category: 'braids',
    summary: 'Clean, detailed cornrows from simple to statement patterns.',
    description: 'Scalp-care focused cornrows, perfect for a protective style you can maintain at home.',
    includes: ['Scalp treatment', 'Cornrow install', 'Style and finish'],
    aftercare: ['Keep the parting line moisturised', 'Wear a bonnet at night'],
    duration_minutes: 180, price_from: 20000, price_to: 60000,
    is_popular: true, display_order: 4,
  },
  {
    slug: 'starter-locs', name: 'Starter Locs', category: 'locs',
    summary: 'Begin your loc journey with an assessment and a considered starting point.',
    description: 'We assess your hair, explain the commitment involved, and install starter locs with a maintenance plan.',
    includes: ['Hair and scalp assessment', 'Loc consultation', 'Starter install', 'Maintenance plan'],
    aftercare: ['Keep locs dry at the roots', 'Avoid tight manipulation'],
    duration_minutes: 240, price_from: 35000, price_to: 80000,
    requires_consultation: true, display_order: 5,
  },
  {
    slug: 'retwist-locs', name: 'Retwist & Sculpt', category: 'locs',
    summary: 'Routine retwisting and sculpting to keep your locs neat and healthy.',
    description: 'A tidy-up of every loc with deep conditioning and a shape that suits your loc pattern.',
    includes: ['Deep cleanse', 'Retwist and sculpt', 'Hydration and finish'],
    aftercare: ['Retouch every 6–8 weeks', 'Use a light oil on the lengths'],
    duration_minutes: 180, price_from: 25000, price_to: 65000, display_order: 6,
  },
  {
    slug: 'loc-colour', name: 'Loc Colour', category: 'locs',
    summary: 'Smooth, even colour on locs without disturbing the loc pattern.',
    description: 'Colour formulated for locked hair, applied section by section for even saturation and depth.',
    includes: ['Colour consultation', 'Gentle colour application', 'Wash and style'],
    aftercare: ['Wait 72 hours before washing', 'Use colour-safe products'],
    duration_minutes: 210, price_from: 30000, price_to: 90000,
    requires_consultation: true, display_order: 7,
  },
  {
    slug: 'silk-press', name: 'Silk Press', category: 'styling',
    summary: 'A smooth, glossy finish that respects the integrity of your hair.',
    description: 'A heat-protected press that smooths texture while protecting strands. Includes treatment.',
    includes: ['Deep conditioning', 'Heat protection', 'Press and blow-dry', 'Finish'],
    aftercare: ['Avoid heat for 2 weeks', 'Sleep in a bonnet'],
    duration_minutes: 150, price_from: 20000, price_to: 55000,
    is_popular: true, display_order: 8,
  },
  {
    slug: 'blowout', name: 'Blowout', category: 'styling',
    summary: 'A smooth, bouncy blowout for any occasion.',
    description: 'Washed, treated and finished with heat protectant for a polished result that holds for days.',
    includes: ['Shampoo and treatment', 'Heat protectant', 'Blow-dry and style'],
    aftercare: ['Sleep in a bonnet to preserve the style'],
    duration_minutes: 120, price_from: 15000, price_to: 35000, display_order: 9,
  },
  {
    slug: 'bridal-look', name: 'Bridal & Event Styling', category: 'styling',
    summary: 'Bespoke styling for weddings, shoots and milestone events.',
    description: 'We build the look around your outfit, venue and photographs — including a trial and on-the-day touch-up.',
    includes: ['Style consultation', 'Trial session', 'On-the-day styling', 'Lash application on request'],
    aftercare: ['Arrive with clean, dry hair', 'Bring your outfit and shoes for the trial'],
    duration_minutes: 240, price_from: 60000, price_to: 250000,
    requires_consultation: true, badge: 'Signature', display_order: 10,
  },
  {
    slug: 'haircut', name: 'Signature Haircut', category: 'haircuts',
    summary: 'A cut tailored to your texture, hairline and how you actually wear your hair.',
    description: 'We cut for the real shape of your hair, then show you how to maintain it at home.',
    includes: ['Consultation', 'Wash and cut', 'Style', 'Take-home guidance'],
    aftercare: ['Trim every 8–10 weeks to maintain shape'],
    duration_minutes: 60, price_from: 8000, price_to: 20000, display_order: 11,
  },
  {
    slug: 'balayage', name: 'Balayage', category: 'colour',
    summary: 'Hand-painted, lived-in colour with no harsh regrowth line.',
    description: 'Freehand placement of lightener and toner for a gradient that grows out softly.',
    includes: ['Colour consultation', 'Balayage placement', 'Toner', 'Wash and style'],
    aftercare: ['Wait 72 hours before washing', 'Book a gloss every 6–8 weeks'],
    duration_minutes: 300, price_from: 75000, price_to: 250000,
    requires_consultation: true, display_order: 12,
  },
  {
    slug: 'gloss-treatment', name: 'Gloss & Tone', category: 'colour',
    summary: 'Refresh faded colour and add shine between full colour sessions.',
    description: 'A demi-permanent gloss that revives tone, corrects brassiness and adds mirror shine.',
    includes: ['Shampoo and clarify', 'Gloss application', 'Processing', 'Style'],
    aftercare: ['Wait 72 hours before washing'],
    duration_minutes: 120, price_from: 25000, price_to: 55000, display_order: 13,
  },
  {
    slug: 'protein-therapy', name: 'Protein & Repair Therapy', category: 'treatments',
    summary: 'Deep, targeted repair for damaged or over-processed hair.',
    description: 'We bond and rebuild the hair structure, then seal it with moisture. Includes a home-care plan.',
    includes: ['Diagnosis', 'Bond repair', 'Moisture seal', 'Take-home routine'],
    aftercare: ['Avoid heat and chemical processing for 2 weeks'],
    duration_minutes: 150, price_from: 20000, price_to: 55000,
    requires_consultation: true, display_order: 14,
  },
  {
    slug: 'scalp-therapy', name: 'Scalp Therapy', category: 'treatments',
    summary: 'A treatment for a flaky, itchy or irritated scalp.',
    description: 'Exfoliation, steam and treatment to rebalance the scalp and support healthy growth.',
    includes: ['Scalp analysis', 'Exfoliation and steam', 'Targeted treatment'],
    aftercare: ['Wash your hair weekly'],
    duration_minutes: 90, price_from: 12000, price_to: 30000, display_order: 15,
  },
  {
    slug: 'wig-installation', name: 'Wig Installation', category: 'wig',
    summary: 'A secure, natural install with a custom hairline.',
    description: 'We prepare your natural hair, build a secure foundation and blend the wig for a natural hairline.',
    includes: ['Natural hair prep', 'Wig prep', 'Secure install', 'Blend and style'],
    aftercare: ['Remove the wig nightly and re-wrap', 'Avoid adhesive on the hairline for 2 weeks'],
    duration_minutes: 180, price_from: 25000, price_to: 60000, display_order: 16,
  },
  {
    slug: 'wig-customisation', name: 'Wig Customisation', category: 'wig',
    summary: 'Cut, coloured and customised to suit your face and style.',
    description: 'Layering, plucking, dyeing and styling to make a purchased or client-supplied wig your own.',
    includes: ['Wig consultation', 'Cutting and plucking', 'Custom colour', 'Style'],
    aftercare: ['Store on a wig stand'],
    duration_minutes: 150, price_from: 25000, price_to: 90000, display_order: 17,
  },
]

const serviceId = (index: number) =>
  `5${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`

export const services: Record<string, unknown>[] = SERVICE_SEEDS.map((seed, index) => ({
  id: serviceId(index),
  slug: seed.slug,
  name: seed.name,
  category_id: CATEGORY_IDS[seed.category],
  summary: seed.summary,
  description: seed.description,
  includes: seed.includes,
  excludes: [],
  aftercare: seed.aftercare,
  duration_minutes: seed.duration_minutes,
  buffer_minutes: 30,
  cleanup_minutes: 10,
  price_from: seed.price_from,
  price_to: seed.price_to,
  price_unit: 'per_session',
  requires_consultation: seed.requires_consultation ?? false,
  requires_requirement: true,
  gender_restriction: null,
  min_age: null,
  max_concurrent: 1,
  image_url: img(serviceSlots(seed.slug, seed.name)[0]),
  gallery_urls: imgs(serviceSlots(seed.slug, seed.name)),
  badge: seed.badge ?? null,
  is_featured: seed.is_featured ?? false,
  is_popular: seed.is_popular ?? false,
  display_order: seed.display_order,
  status: 'active',
  meta_title: null,
  meta_description: null,
  rating_avg: 4.8,
  rating_count: 120 + index * 7,
  bookings_count: 340 + index * 41,
  created_at: '2025-01-05T09:00:00Z',
  updated_at: '2025-01-05T09:00:00Z',
}))

/** Catalog view rows: one per service per variant. */
export const service_catalog = SERVICE_SEEDS.flatMap((seed, index) => {
  const base = services[index] as Record<string, unknown>
  const category = service_categories.find((c) => c.slug === seed.category)!

  const variants: { slug: string; label: string; price: number; duration: number }[] =
    seed.slug === 'knotless-braids'
      ? [
          { slug: 'shoulder', label: 'Shoulder length', price: 45000, duration: 240 },
          { slug: 'bra-back', label: 'Bra-back', price: 95000, duration: 420 },
          { slug: 'waist', label: 'Waist length', price: 140000, duration: 480 },
        ]
      : seed.slug === 'balayage'
        ? [
            { slug: 'partial', label: 'Partial highlights', price: 75000, duration: 240 },
            { slug: 'full', label: 'Full head', price: 140000, duration: 330 },
            { slug: 'full-plus', label: 'Full head + gloss', price: 195000, duration: 420 },
          ]
        : [{ slug: 'standard', label: 'Standard', price: seed.price_from, duration: seed.duration_minutes }]

  return variants.map((variant, variantIndex) => ({
    ...base,
    category_name: category.name,
    category_slug: category.slug,
    variant_id: `v-${index}-${variant.slug}`,
    variant_name: variant.label,
    variant_price: variant.price,
    variant_duration: variant.duration,
    variant_order: variantIndex,
  }))
})

export const service_variants = SERVICE_SEEDS.flatMap((_seed, index) => {
  const rows = service_catalog.filter(
    (row) => (row as Record<string, unknown>).id === serviceId(index),
  )
  return rows.map((row, variantIndex) => {
    const source = row as Record<string, unknown>
    const label = String(source.variant_name)
    return {
      id: String(source.variant_id),
      service_id: serviceId(index),
      slug: rows.length === 1 ? 'standard' : label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      description: null,
      price: Number(source.variant_price),
      duration_minutes: Number(source.variant_duration),
      display_order: variantIndex,
      is_active: true,
      created_at: '2025-01-05T09:00:00Z',
    }
  })
})

// ---------------------------------------------------------------------------
// Stylists
// ---------------------------------------------------------------------------
const STAFF_IDS = [
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000004',
]

/**
 * `speciality` drives which gallery photographs appear in a stylist's
 * portfolio, so it is data on the seed rather than an index expression at the
 * point of use — otherwise adding a stylist silently reshuffles everyone's.
 */
const STAFF_SEEDS: {
  full_name: string
  title: string
  headline: string
  speciality: GalleryCategory
}[] = [
  { full_name: 'Adaeze Okonkwo', title: 'Senior Braids Artist', headline: 'Knotless braids specialist with nine years on the chair.', speciality: 'braids' },
  { full_name: 'Tunde Bakare', title: 'Master Colourist', headline: 'Balayage, correction and colour that grows out beautifully.', speciality: 'colour' },
  { full_name: 'Ngozi Eze', title: 'Loc Specialist', headline: 'Starter locs, sculpting and colour for locked hair.', speciality: 'locs' },
  { full_name: 'Wisdom Ocran', title: 'Stylist', headline: 'Precision cuts, silk presses and event styling.', speciality: 'hair' },
]

export const profiles: Record<string, unknown>[] = [
  ...STAFF_SEEDS.map((s, i) => ({
    id: STAFF_IDS[i],
    email: `${s.full_name.toLowerCase().split(' ')[0]}@blackcheryunisexstudio.com`,
    full_name: s.full_name,
    slug: slugify(s.full_name),
    phone_e164: `+23480000000${i + 1}`,
    phone_verified_at: null,
    // Shares the stylist photograph slot so a headshot and its profile image
    // are the same file rather than two near-identical ones.
    avatar_url: img(stylistSlot(slugify(s.full_name), s.full_name)),
    cover_url: null,
    gender: i === 1 ? 'male' : 'female',
    date_of_birth: null,
    bio: s.headline,
    hair_class: null,
    hair_texture: null,
    allergies: [],
    accessibility_needs: null,
    emergency_contact: null,
    locale: 'en-NG',
    marketing_opt_in: true,
    whatsapp_opt_in: true,
    sms_opt_in: false,
    email_opt_in: true,
    status: 'active',
    onboarding_step: 'complete',
    last_seen_at: null,
    created_at: '2025-01-05T09:00:00Z',
    updated_at: '2025-01-05T09:00:00Z',
  })),
  // Demo customer, so the account, dashboard and booking flows can be reviewed.
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    email: 'demo@example.com',
    full_name: 'Demo Customer',
    slug: 'demo-customer',
    phone_e164: '+2348000000099',
    phone_verified_at: null,
    avatar_url: null,
    cover_url: null,
    gender: 'female',
    date_of_birth: null,
    bio: null,
    hair_class: 'human',
    hair_texture: 'kinky',
    allergies: [],
    accessibility_needs: null,
    emergency_contact: null,
    locale: 'en-NG',
    marketing_opt_in: true,
    whatsapp_opt_in: true,
    sms_opt_in: false,
    email_opt_in: true,
    status: 'active',
    onboarding_step: 'complete',
    last_seen_at: null,
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T09:00:00Z',
  },
]

export const staff_profiles = STAFF_SEEDS.map((s, i) => {
  const slug = slugify(s.full_name)
  return {
    user_id: STAFF_IDS[i],
    slug,
    title: s.title,
    headline: s.headline,
    bio: `${s.headline} ${s.full_name.split(' ')[0]} has been with Black Chery Unisex Studio since 2021 and specialises in ${s.title.toLowerCase()}.`,
    photo_url: img(stylistSlot(slug, s.full_name)),
    // Portfolios are work samples rather than headshots, so they point at the
    // team-in-action photography rather than duplicating the profile image.
    portfolio_urls: imgs([studioShot('careersTeam'), ...GALLERY_SLOTS[s.speciality].slice(0, 2)]),
    specialities: [s.speciality],
    employment_type: 'full_time',
    commission_pct: null,
    hourly_rate: null,
    is_bookable: true,
    accepts_walk_ins: true,
    max_daily_bookings: 8,
    hired_on: '2021-06-01',
    employment_end_on: null,
    rating_avg: [4.9, 4.9, 4.8, 4.7][i],
    rating_count: [148, 96, 74, 61][i],
    created_at: '2025-01-05T09:00:00Z',
    updated_at: '2025-01-05T09:00:00Z',
  }
})

export const staff_public = STAFF_SEEDS.map((s, i) => ({
  user_id: STAFF_IDS[i],
  full_name: s.full_name,
  slug: staff_profiles[i]!.slug,
  title: s.title,
  headline: s.headline,
  bio: staff_profiles[i]!.bio,
  photo_url: staff_profiles[i]!.photo_url,
  portfolio_urls: [],
  specialities: staff_profiles[i]!.specialities,
  employment_type: 'full_time',
  is_bookable: true,
  accepts_walk_ins: true,
  rating_avg: [4.9, 4.9, 4.8, 4.7][i],
  rating_count: [148, 96, 74, 61][i],
}))

export const staff_services = SERVICE_SEEDS.flatMap((_seed, index) => {
  const stylistIndex = index % 4
  return [{ staff_id: STAFF_IDS[stylistIndex], service_id: serviceId(index), is_active: true, price_override: null, duration_override: null }]
})

export const roles = [
  { id: 1, key: 'customer', name: 'Customer', description: null, capabilities: [], rank: 10, is_system: true, created_at: '2025-01-01T00:00:00Z' },
  { id: 2, key: 'staff', name: 'Stylist / Staff', description: null, capabilities: [], rank: 50, is_system: true, created_at: '2025-01-01T00:00:00Z' },
  { id: 3, key: 'supervisor', name: 'Salon Supervisor', description: null, capabilities: [], rank: 70, is_system: true, created_at: '2025-01-01T00:00:00Z' },
  { id: 4, key: 'admin', name: 'Administrator', description: null, capabilities: ['*'], rank: 100, is_system: true, created_at: '2025-01-01T00:00:00Z' },
]

export const user_roles = [
  { user_id: 'd0000000-0000-4000-8000-000000000001', role_id: 1, granted_by: null, granted_at: '2025-02-01T09:00:00Z', expires_at: null },
  ...STAFF_IDS.map((id) => ({ user_id: id, role_id: 2, granted_by: null, granted_at: '2025-01-05T09:00:00Z', expires_at: null })),
  { user_id: STAFF_IDS[1], role_id: 4, granted_by: null, granted_at: '2025-01-05T09:00:00Z', expires_at: null },
]

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const PRODUCT_CATEGORY_IDS = {
  wigs: 'e0000000-0000-4000-8000-000000000001',
  extensions: 'e0000000-0000-4000-8000-000000000002',
  'hair-care': 'e0000000-0000-4000-8000-000000000003',
  'styling-tools': 'e0000000-0000-4000-8000-000000000004',
}

export const product_categories = [
  { id: PRODUCT_CATEGORY_IDS.wigs, slug: 'wigs', name: 'Wigs', description: 'Ready-to-wear, glueless and custom unit wigs.', parent_id: null, image_url: null, icon: 'crown', display_order: 1, is_active: true },
  { id: PRODUCT_CATEGORY_IDS.extensions, slug: 'extensions', name: 'Extensions', description: 'Bulk hair, closures, frontals and pre-stretched hair.', parent_id: null, image_url: null, icon: 'scissors', display_order: 2, is_active: true },
  { id: PRODUCT_CATEGORY_IDS['hair-care'], slug: 'hair-care', name: 'Hair Care', description: 'Shampoos, conditioners, oils, masks and treatments.', parent_id: null, image_url: null, icon: 'droplet', display_order: 3, is_active: true },
  { id: PRODUCT_CATEGORY_IDS['styling-tools'], slug: 'styling-tools', name: 'Styling Tools', description: 'Heat protectant, edges, brushes and accessories.', parent_id: null, image_url: null, icon: 'sparkles', display_order: 4, is_active: true },
]

type ProductSeed = {
  slug: string
  name: string
  kind: string
  category: keyof typeof PRODUCT_CATEGORY_IDS
  summary: string
  description: string
  benefits: string[]
  base_price: number
  compare_at_price: number | null
  hair_class: string | null
  length_cm: number | null
  cap_construction: string | null
  stock: number
  is_featured?: boolean
  is_best_seller?: boolean
  rating: number
  rating_count: number
  sold_count: number
}

const PRODUCT_SEEDS: ProductSeed[] = [
  { slug: 'glueless-bob-wig', name: 'Glueless Bob Wig', kind: 'wig', category: 'wigs', summary: 'A ready-to-wear bob with a seamless hairline and adjustable elastic band.', description: 'Designed for everyday wear: pre-plucked hairline, bleached knots and an adjustable band for a secure, comfortable fit. No glue required.', benefits: ['Installs in under 10 minutes', 'Adjustable fit for all head sizes', 'Pre-plucked natural hairline'], base_price: 185000, compare_at_price: 240000, hair_class: 'human', length_cm: 500, cap_construction: '13x4 lace', stock: 5, is_featured: true, is_best_seller: true, rating: 4.9, rating_count: 142, sold_count: 312 },
  { slug: 'full-lace-body-wave', name: 'Full Lace Body Wave Wig', kind: 'wig', category: 'wigs', summary: 'A full-lace wig with a deep body wave and an undetectable hairline.', description: 'Hand-tied full lace with baby hairs for the most natural hairline possible. Heat-stylable to 350°C.', benefits: ['Fully hand-tied lace', 'Undetectable hairline', 'Heat-stylable to 350°C'], base_price: 320000, compare_at_price: null, hair_class: 'human', length_cm: 500, cap_construction: 'Full lace', stock: 3, is_featured: true, rating: 4.8, rating_count: 61, sold_count: 88 },
  { slug: 'bone-straight-bundle', name: 'Bone Straight Bundle', kind: 'extension', category: 'extensions', summary: 'Double-drawn, bone-straight bundles that stay smooth through multiple washes.', description: 'Unprocessed 100% human hair, double-drawn for consistent density and minimal shedding.', benefits: ['Double-drawn for low shedding', 'Lasts several installs with care', 'Minimal tangling'], base_price: 125000, compare_at_price: 150000, hair_class: 'human', length_cm: 500, cap_construction: null, stock: 14, is_best_seller: true, rating: 4.7, rating_count: 203, sold_count: 447 },
  { slug: 'curly-bundle', name: 'Deep Curly Bundle', kind: 'extension', category: 'extensions', summary: 'Rich, defined curls with a soft, weightless feel.', description: 'Curl-pattern matched so every bundle blends seamlessly with the rest of the set.', benefits: ['Defined curl pattern', 'Soft, weightless feel', 'Colour-matched for seamless blending'], base_price: 130000, compare_at_price: null, hair_class: 'human', length_cm: 500, cap_construction: null, stock: 11, is_best_seller: true, rating: 4.9, rating_count: 178, sold_count: 390 },
  { slug: 'frontal-hd', name: 'HD Lace Frontal', kind: 'extension', category: 'extensions', summary: 'A 13x4 HD lace frontal with pre-plucked hairline for seamless installs.', description: '13x4 HD lace with adjustable elasticity and a natural-density hairline.', benefits: ['13x4 HD lace', 'Pre-plucked hairline', 'Bleached knots'], base_price: 85000, compare_at_price: null, hair_class: 'human', length_cm: 500, cap_construction: '13x4 HD lace', stock: 8, is_best_seller: true, rating: 4.8, rating_count: 96, sold_count: 221 },
  { slug: 'growth-oil', name: 'Edge & Growth Oil', kind: 'hair_care', category: 'hair-care', summary: 'A lightweight, non-greasy oil for the scalp and edges.', description: 'Blends castor, jojoba and peppermint to nourish the scalp and lay edges without build-up.', benefits: ['Non-greasy finish', 'Promotes scalp circulation', 'Safe on protective styles'], base_price: 8500, compare_at_price: 11000, hair_class: null, length_cm: null, cap_construction: null, stock: 40, is_featured: true, is_best_seller: true, rating: 4.8, rating_count: 311, sold_count: 1204 },
  { slug: 'protein-mask', name: 'Bond Repair Protein Mask', kind: 'hair_care', category: 'hair-care', summary: 'An intensive weekly mask that rebuilds damaged bonds.', description: 'Formulated for bleached, heat-treated and over-processed hair. Visible repair after the first use.', benefits: ['Rebuilds broken bonds', 'Restores elasticity', 'Safe on extensions and locs'], base_price: 12500, compare_at_price: null, hair_class: null, length_cm: null, cap_construction: null, stock: 32, is_featured: true, is_best_seller: true, rating: 4.9, rating_count: 254, sold_count: 902 },
  { slug: 'clarifying-shampoo', name: 'Clarifying Shampoo', kind: 'hair_care', category: 'hair-care', summary: 'A deep-cleansing shampoo that lifts product build-up without stripping.', description: 'Removes heavy oils, gels and silicone build-up while keeping the hair balanced. Suitable for locs and braids.', benefits: ['Removes product build-up', 'pH balanced', 'Safe for locs and braids'], base_price: 9500, compare_at_price: null, hair_class: null, length_cm: null, cap_construction: null, stock: 28, is_best_seller: true, rating: 4.6, rating_count: 187, sold_count: 671 },
  { slug: 'heat-protectant', name: 'Heat Protectant Spray', kind: 'styling', category: 'styling-tools', summary: 'A lightweight shield against heat damage up to 230°C.', description: 'Protects against both flat-iron and blow-dryer damage without weighing the hair down.', benefits: ['Protects to 230°C', 'Non-greasy', 'Leaves hair soft'], base_price: 7500, compare_at_price: 9000, hair_class: null, length_cm: null, cap_construction: null, stock: 45, is_featured: true, is_best_seller: true, rating: 4.7, rating_count: 229, sold_count: 845 },
  { slug: 'silk-bonnet', name: 'Mulberry Silk Bonnet', kind: 'accessory', category: 'styling-tools', summary: 'A 22-momme mulberry silk bonnet that protects styles overnight.', description: 'Reduces friction and moisture loss overnight. Protects braids, locs, curls and installs.', benefits: ['22-momme mulberry silk', 'Reduces friction and frizz', 'Protects styles overnight'], base_price: 15000, compare_at_price: 19000, hair_class: null, length_cm: null, cap_construction: null, stock: 24, is_best_seller: true, rating: 4.9, rating_count: 342, sold_count: 1130 },
]

const productId = (index: number) =>
  `f${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`

export const products: Record<string, unknown>[] = PRODUCT_SEEDS.map((seed, index) => ({
  id: productId(index),
  slug: seed.slug,
  name: seed.name,
  kind: seed.kind,
  category_id: PRODUCT_CATEGORY_IDS[seed.category],
  brand: 'Maison Luxe',
  summary: seed.summary,
  description: seed.description,
  ingredients: seed.kind === 'hair_care' ? ['Castor oil', 'Jojoba oil', 'Peppermint extract', 'Vitamin E'] : [],
  benefits: seed.benefits,
  how_to_use: [
    'Apply to slightly damp hair.',
    'Work through from the mid-lengths to the ends.',
    'For best results, use consistently for 4–6 weeks.',
  ],
  care_instructions: 'Store away from direct sunlight. Keep the packaging sealed between uses.',
  base_price: seed.base_price,
  compare_at_price: seed.compare_at_price,
  cost_price: null,
  tax_rate: 0,
  hair_class: seed.hair_class,
  hair_texture: null,
  length_cm: seed.length_cm,
  weight_g: null,
  cap_construction: seed.cap_construction,
  is_pre_stretched: false,
  is_glueless: seed.slug.includes('glueless'),
  image_url: img(productSlots(seed.slug, seed.name)[0]),
  gallery_urls: imgs(productSlots(seed.slug, seed.name)),
  video_url: null,
  status: 'active',
  is_featured: seed.is_featured ?? false,
  is_best_seller: seed.is_best_seller ?? false,
  display_order: index + 1,
  published_at: '2025-01-10T09:00:00Z',
  rating_avg: seed.rating,
  rating_count: seed.rating_count,
  sold_count: seed.sold_count,
  meta_title: null,
  meta_description: null,
  created_at: '2025-01-10T09:00:00Z',
  updated_at: '2025-01-10T09:00:00Z',
}))

export const product_variants: Record<string, unknown>[] = products.map((_product, index) => {
  const seed = PRODUCT_SEEDS[index]!
  return {
    id: `9${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
    product_id: productId(index),
    sku: `UHS-${seed.slug.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    slug: 'standard',
    name: 'Standard',
    attributes: {},
    price: seed.base_price,
    compare_at_price: seed.compare_at_price,
    cost_price: null,
    stock_on_hand: seed.stock,
    stock_reserved: 0,
    safety_stock: 0,
    low_stock_threshold: 3,
    backorder_allowed: false,
    weight_grams: null,
    barcode: null,
    image_url: null,
    is_default: true,
    is_active: true,
    display_order: 0,
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  }
})

export const product_catalog = products.map((product, index) => {
  const category = product_categories.find((c) => c.id === (product.category_id as string))!
  const variant = product_variants[index] as Record<string, unknown>
  const seed = PRODUCT_SEEDS[index]!

  return {
    ...product,
    category_name: category.name,
    category_slug: category.slug,
    variant_id: variant.id,
    sku: variant.sku,
    variant_name: variant.name,
    attributes: {},
    variant_price: variant.price,
    variant_compare_at_price: variant.compare_at_price,
    available_stock: Math.max(0, seed.stock - 2),
    stock_on_hand: seed.stock,
    is_default_variant: true,
    variant_image_url: null,
  }
})

// ---------------------------------------------------------------------------
// Editorial content
// ---------------------------------------------------------------------------
export const faqs = [
  { id: 'q1', question: 'Do I need an account to book an appointment?', answer: 'You can browse services, hairstyles and our gallery without an account. Creating a free account lets you complete your requirement form, submit reference images, manage your bookings and check out faster.', category: 'booking', display_order: 1, is_published: true, helpful_count: 42 },
  { id: 'q2', question: 'How far in advance can I book?', answer: 'Bookings open 60 days ahead and we ask for at least 4 hours notice so we can prepare your slot properly. Same-day and walk-in availability depends on the diary.', category: 'booking', display_order: 2, is_published: true, helpful_count: 28 },
  { id: 'q3', question: 'What is your cancellation policy?', answer: 'You can cancel or reschedule free of charge up to 24 hours before your appointment. Inside 24 hours, 50% of any deposit paid is forfeited because the chair is held for you.', category: 'booking', display_order: 3, is_published: true, helpful_count: 51 },
  { id: 'q4', question: 'Why do you ask for my requirements before the appointment?', answer: 'It means your stylist knows exactly what you want before you arrive — your hair history, allergies, scalp condition and the look you are after. Most of our clients say it is the difference between a good result and their best one.', category: 'booking', display_order: 4, is_published: true, helpful_count: 67 },
  { id: 'q5', question: 'Do you sell the hair used in your services?', answer: 'Yes. Every extension and wig we install is available in our shop, and your stylist will recommend exactly what suits your hair and your budget.', category: 'shop', display_order: 5, is_published: true, helpful_count: 39 },
  { id: 'q6', question: 'How do I pay?', answer: 'We accept card, bank transfer and USSD through Paystack, which works with all major Nigerian banks. You can pay a deposit when booking and settle the balance at the salon.', category: 'shop', display_order: 6, is_published: true, helpful_count: 24 },
  { id: 'q7', question: 'Do you deliver products?', answer: 'Yes, within Lagos. Delivery is free on orders over ₦75,000 and ₦2,500 otherwise. You can also collect from any of our branches at no charge.', category: 'shop', display_order: 7, is_published: true, helpful_count: 18 },
  { id: 'q8', question: 'Can I reschedule my appointment?', answer: 'Yes, from your account under Appointments. Pick a new time from the live diary and it is confirmed instantly, subject to availability.', category: 'booking', display_order: 8, is_published: true, helpful_count: 31 },
  { id: 'q9', question: 'Do you train or take on apprentices?', answer: 'We do. Post openings on our Careers page and watch for apprenticeship and internship roles, or send a portfolio to hello@blackcheryunisexstudio.com.', category: 'careers', display_order: 9, is_published: true, helpful_count: 15 },
]

const REVIEW_COPY = [
  { title: 'Best knotless braids I have had in Lagos', body: 'I brought three reference photos and Adaeze turned it into something even better. The parting stayed clean three weeks later and my edges were still done properly. Worth every naira.', rating: 5, staff: 0, service: 0 },
  { title: 'Colour correction that actually worked', body: 'Two other places left my hair a shade too orange. Tunde spent forty minutes explaining the formula before starting, and the result is the first time I have been happy with my colour in two years.', rating: 5, staff: 1, service: 11 },
  { title: 'Locs journey finally sorted', body: 'Ngozi explained the commitment honestly, which I appreciated more than the sales pitch. Six months in and my locs are healthy and shaped the way we planned.', rating: 5, staff: 2, service: 4 },
  { title: 'On time, no rushing', body: 'Booked the silk press at 2pm and was in the chair at 2pm. That should not be remarkable but around here it is. My hair feels protected rather than fried.', rating: 4, staff: 3, service: 7 },
  { title: 'The wig they sold me is the wig they installed', body: 'I bought the glueless bob after my stylist recommended it. It went on in under five minutes at home and looks natural. That consistency is why I keep coming back.', rating: 5, staff: 0, service: 15 },
  { title: 'Great for first-timers', body: 'The requirement form meant we did not spend the appointment talking. I just showed my stylist the reference and we started. First salon visit that felt this efficient.', rating: 5, staff: 3, service: 0 },
]

export const reviews = REVIEW_COPY.map((review, index) => ({
  id: `7${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
  customer_id: null,
  appointment_id: null,
  service_id: serviceId(review.service),
  staff_id: STAFF_IDS[review.staff],
  product_id: null,
  rating: review.rating,
  title: review.title,
  body: review.body,
  image_urls: [],
  staff_reply: null,
  replied_at: null,
  status: 'published',
  is_featured: true,
  created_at: `2025-0${(index % 6) + 1}-1${index}T09:00:00Z`,
  moderated_at: null,
  moderated_by: null,
}))

/**
 * Gallery tiles.
 *
 * Three tiles per category across the eight categories. Each tile takes its
 * photograph and alt text from `GALLERY_SLOTS`, which is where the studio's
 * shot list lives — so the gallery, the stylist portfolios and the category
 * filter all draw from one source.
 *
 * `before_after` tiles are the exception: they reference a *pair* of slots
 * rather than one, because a before/after comparison is meaningless with a
 * single image. Both are null until the pair has been photographed.
 */
const GALLERY_TITLES: Record<GalleryCategory, readonly string[]> = {
  braids: ['Knotless braids', 'Feed-in braids', 'Braided bun', 'Cornrow set'],
  locs: ['Loc sculpt', 'Starter locs', 'Loc updo', 'Retwist and shape'],
  hair: ['Signature cut', 'Fringe trim', 'Cropped cut', 'Blunt cut'],
  colour: ['Balayage', 'Toner refresh', 'Highlights', 'Colour correction'],
  styling: ['Silk press', 'Curl definition', 'Bridal updo', 'Sleek blowout'],
  before_after: ['Colour refresh', 'Length change', 'Cut and restyle', 'Blonde transformation'],
  interior: ['The studio floor', 'Reception', 'Styling station', 'Waiting area'],
  team: ['Braiding at the chair', 'A busy afternoon', 'Mixing formula', 'Sectioning and pinning'],
}

const GALLERY_CATEGORIES = Object.keys(GALLERY_TITLES) as GalleryCategory[]

export const gallery_items: Record<string, unknown>[] = GALLERY_CATEGORIES.flatMap((category, categoryIndex) =>
  [0, 1, 2].map((n) => {
    const slots = GALLERY_SLOTS[category]
    const slot = slots[n % slots.length]!
    const index = categoryIndex * 3 + n
    const slug = `${category}-${n + 1}`
    const isBeforeAfter = category === 'before_after'

    // The pair is slots 0/1 for tile 1 and 2/3 for tile 2; tile 3 reuses the
    // "after" of tile 2 as a plain single image rather than inventing a pair.
    const beforeSlot = isBeforeAfter ? slots[n * 2] : undefined
    const afterSlot = isBeforeAfter ? slots[n * 2 + 1] : undefined

    return {
      id: `8${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
      title: GALLERY_TITLES[category][n]!,
      slug,
      category,
      image_url: isBeforeAfter ? img(afterSlot!) : img(slot),
      before_image_url: isBeforeAfter ? img(beforeSlot) : null,
      after_image_url: isBeforeAfter ? img(afterSlot) : null,
      alt_text: slot.alt,
      stylist_id: STAFF_IDS[index % 4],
      service_id: serviceId(index % 17),
      tags: [category],
      is_featured: index < 6,
      display_order: index,
      is_published: true,
      created_at: '2025-01-12T09:00:00Z',
      moderated_at: null,
      moderated_by: null,
    }
  }),
)

// ---------------------------------------------------------------------------
// Careers
// ---------------------------------------------------------------------------
const JOB_IDS = [
  '4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000002',
  '4a000000-0000-4000-8000-000000000003',
]

export const jobs: Record<string, unknown>[] = [
  {
    id: JOB_IDS[0],
    slug: 'senior-braids-artist',
    title: 'Senior Braids Artist',
    department: 'Braids',
    employment_type: 'full_time',
    location_id: LOCATION_ID,
    is_remote: false,
    is_hybrid: false,
    summary: 'Lead our braids book across knotless, box and stitch work.',
    description: 'We are looking for an experienced braids artist to lead a chair and mentor junior artists. You will own your client relationships end to end, from consultation through aftercare advice.',
    responsibilities: ['Consult with clients and translate their references into a plan', 'Deliver knotless, box and stitch braids to our finish standard', 'Maintain accurate client notes and aftercare guidance', 'Support and coach junior artists', 'Contribute to our retail product recommendations'],
    requirements: ['At least 5 years of professional braiding experience', 'A verifiable portfolio of your work', 'Confident in client consultation and upselling', 'Comfortable working to a target diary'],
    nice_to_have: ['Locs experience', 'Colouring experience', 'Training or mentoring experience'],
    benefits: ['Monthly performance bonus', 'Product commission on recommendations', 'Paid continuing education', 'Staff salon and product discounts'],
    salary_min: 120000,
    salary_max: 220000,
    salary_currency: 'NGN',
    salary_period: 'monthly',
    is_disclosed: true,
    openings: 2,
    filled_count: 0,
    min_experience_years: 5,
    status: 'open',
    is_featured: true,
    display_order: 1,
    published_at: '2025-03-01T09:00:00Z',
    closes_at: null,
    apply_email: 'careers@blackcheryunisexstudio.com',
    screening_questions: [
      { key: 'portfolio', label: 'Share a portfolio link', type: 'url', required: true },
      { key: 'speciality', label: 'Which styles are you strongest at?', type: 'text', required: true },
      { key: 'start', label: 'Earliest start date', type: 'date', required: true },
    ],
    views_count: 412,
    created_by: null,
    created_at: '2025-03-01T09:00:00Z',
    updated_at: '2025-03-01T09:00:00Z',
  },
  {
    id: JOB_IDS[1],
    slug: 'colourist',
    title: 'Colourist',
    department: 'Colour',
    employment_type: 'full_time',
    location_id: LOCATION_ID,
    is_remote: false,
    is_hybrid: false,
    summary: 'Join our colour bar working across balayage, correction and gloss.',
    description: 'Our colourist handles everything from lived-in balayage to complex colour correction. You will have access to our full colour library and a dedicated colour room.',
    responsibilities: ['Consult and formulate colour plans', 'Perform balayage, highlights, gloss and colour correction', 'Maintain detailed formula records', 'Advise clients on home colour-safe routines'],
    requirements: ['At least 4 years in a salon colour role', 'Strong colour theory knowledge', 'Able to read and correct previous colour work'],
    nice_to_have: ['Balayage certification', 'Curly or textured hair specialist'],
    benefits: ['Product commission', 'Paid colour training', 'Flexible roster'],
    salary_min: 100000,
    salary_max: 200000,
    salary_currency: 'NGN',
    salary_period: 'monthly',
    is_disclosed: true,
    openings: 1,
    filled_count: 0,
    min_experience_years: 4,
    status: 'open',
    is_featured: false,
    display_order: 2,
    published_at: '2025-02-10T09:00:00Z',
    closes_at: null,
    apply_email: 'careers@blackcheryunisexstudio.com',
    screening_questions: [
      { key: 'portfolio', label: 'Colour portfolio link', type: 'url', required: true },
      { key: 'start', label: 'Earliest start date', type: 'date', required: true },
    ],
    views_count: 268,
    created_by: null,
    created_at: '2025-02-10T09:00:00Z',
    updated_at: '2025-02-10T09:00:00Z',
  },
  {
    id: JOB_IDS[2],
    slug: 'front-desk-associate',
    title: 'Front Desk Associate',
    department: 'Front of House',
    employment_type: 'full_time',
    location_id: LOCATION_ID,
    is_remote: false,
    is_hybrid: false,
    summary: 'Be the first warm voice clients hear.',
    description: 'You will manage bookings, welcome clients and keep the studio running smoothly. Prior experience in hospitality is a plus, not a requirement.',
    responsibilities: ['Manage the booking diary and walk-in flow', 'Welcome and check in every client', 'Handle payments and orders', 'Support retail sales'],
    requirements: ['Warm, professional manner', 'Comfortable with phones and apps', 'Organised and calm under pressure'],
    nice_to_have: ['Spa or salon front-desk experience', 'Bilingual (English plus a Nigerian language)'],
    benefits: ['Monthly bonus', 'Meal allowance', 'Staff salon and product discounts'],
    salary_min: 70000,
    salary_max: 100000,
    salary_currency: 'NGN',
    salary_period: 'monthly',
    is_disclosed: true,
    openings: 1,
    filled_count: 0,
    min_experience_years: 1,
    status: 'open',
    is_featured: false,
    display_order: 3,
    published_at: '2025-03-20T09:00:00Z',
    closes_at: null,
    apply_email: 'careers@blackcheryunisexstudio.com',
    screening_questions: [
      { key: 'experience', label: 'Relevant experience', type: 'textarea', required: true },
      { key: 'start', label: 'Earliest start date', type: 'date', required: true },
    ],
    views_count: 187,
    created_by: null,
    created_at: '2025-03-20T09:00:00Z',
    updated_at: '2025-03-20T09:00:00Z',
  },
]

export const job_applications: Record<string, unknown>[] = [
  {
    id: 'j1000000-0000-4000-8000-000000000001',
    reference: 'APP-20250301-A7K2M',
    job_id: JOB_IDS[0],
    applicant_id: null,
    full_name: 'Chiamaka Nwosu',
    email: 'chiamaka@example.com',
    phone_e164: '+2348010000001',
    location: 'Lekki, Lagos',
    cover_letter: 'I have been braiding professionally for six years and my clients regularly ask for knotless specifically. My portfolio is on Instagram.',
    portfolio_url: 'https://instagram.com/example',
    portfolio_urls: [],
    cv_path: null,
    cv_file_name: 'Chiamaka-Nwosu-CV.pdf',
    cv_bytes: 284_000,
    answers: { portfolio: 'https://instagram.com/example', speciality: 'Knotless and box', start: '2025-04-01' },
    experience_years: 6,
    status: 'shortlisted',
    stage_notes: 'Strong portfolio. Book for a practical assessment.',
    rating: 4,
    interview_at: null,
    consent_contact: true,
    consented_at: '2025-03-22T10:00:00Z',
    submitted_at: '2025-03-22T10:00:00Z',
    reviewed_at: '2025-03-24T14:00:00Z',
    reviewed_by: null,
    updated_at: '2025-03-24T14:00:00Z',
  },
  {
    id: 'j1000000-0000-4000-8000-000000000002',
    reference: 'APP-20250305-B3X9P',
    job_id: JOB_IDS[1],
    applicant_id: null,
    full_name: 'Yusuf Abdullahi',
    email: 'yusuf@example.com',
    phone_e164: '+2348010000002',
    location: 'Ikeja, Lagos',
    cover_letter: 'Colourist with five years in a premium salon. I specialise in corrective colour and blonding dark hair.',
    portfolio_url: 'https://instagram.com/example',
    portfolio_urls: [],
    cv_path: null,
    cv_file_name: 'Yusuf-Abdullahi-CV.pdf',
    cv_bytes: 310_000,
    answers: { portfolio: 'https://instagram.com/example', start: '2025-05-01' },
    experience_years: 5,
    status: 'submitted',
    stage_notes: null,
    rating: null,
    interview_at: null,
    consent_contact: true,
    consented_at: '2025-03-05T09:00:00Z',
    submitted_at: '2025-03-05T09:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    updated_at: '2025-03-05T09:00:00Z',
  },
  {
    id: 'j1000000-0000-4000-8000-000000000003',
    reference: 'APP-20250311-C5T2Q',
    job_id: JOB_IDS[2],
    applicant_id: null,
    full_name: 'Blessing Etim',
    email: 'blessing@example.com',
    phone_e164: '+2348010000003',
    location: 'Ajah, Lagos',
    cover_letter: 'I worked front desk at a spa for three years and I am very calm under pressure.',
    portfolio_url: null,
    portfolio_urls: [],
    cv_path: null,
    cv_file_name: 'Blessing-Etim-CV.pdf',
    cv_bytes: 198_000,
    answers: { experience: 'Three years front desk at a Lagos spa.', start: '2025-04-15' },
    experience_years: 3,
    status: 'interview_scheduled',
    stage_notes: 'Interview booked.',
    rating: 5,
    interview_at: '2025-04-02T10:00:00Z',
    consent_contact: true,
    consented_at: '2025-03-11T09:00:00Z',
    submitted_at: '2025-03-11T09:00:00Z',
    reviewed_at: '2025-03-12T11:00:00Z',
    reviewed_by: null,
    updated_at: '2025-03-12T11:00:00Z',
  },
]

export const application_events = job_applications.flatMap((application, index) => [
  {
    id: index * 100 + 1,
    application_id: application.id as string,
    from_status: null,
    to_status: 'submitted',
    actor_id: null,
    note: null,
    created_at: application.submitted_at,
  },
  ...(application.status !== 'submitted'
    ? [
        {
          id: index * 100 + 2,
          application_id: application.id as string,
          from_status: 'submitted',
          to_status: application.status,
          actor_id: null,
          note: application.stage_notes,
          created_at: application.reviewed_at,
        },
      ]
    : []),
])

// ---------------------------------------------------------------------------
// Tables that start empty
// ---------------------------------------------------------------------------
export const emptyTables = {
  // Empty because no photography is published: the build-time manifest
  // (public/images) is what serves images in mock mode, and it is empty until
  // real files are dropped in. Seeding fake rows here would make the gallery
  // look populated in preview while the database stayed empty.
  studio_media: [] as Record<string, unknown>[],
  appointments: [] as Record<string, unknown>[],
  appointment_status_history: [] as Record<string, unknown>[],
  requirements: [] as Record<string, unknown>[],
  requirement_media: [] as Record<string, unknown>[],
  carts: [] as Record<string, unknown>[],
  cart_items: [] as Record<string, unknown>[],
  orders: [] as Record<string, unknown>[],
  order_items: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
  notification_deliveries: [] as Record<string, unknown>[],
  notification_preferences: [] as Record<string, unknown>[],
  contact_points: [] as Record<string, unknown>[],
  wishlist_items: [] as Record<string, unknown>[],
  inventory_movements: [] as Record<string, unknown>[],
  pages: [] as Record<string, unknown>[],
  booking_holds: [] as Record<string, unknown>[],
  business_settings: [business_settings] as unknown as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
}

/** Every table the mock client can serve, keyed by name. */
export function buildDatabase(): Record<string, Record<string, unknown>[]> {
  return {
    profiles,
    roles,
    user_roles,
    staff_profiles,
    staff_public,
    staff_services,
    salon_locations,
    location_hours,
    // Declared in emptyTables with an incompatible literal type; stored as an
    // array because the query builder addresses every table uniformly.
    business_settings: [business_settings] as unknown as Record<string, unknown>[],
    service_categories,
    services,
    service_catalog,
    service_variants,
    gallery_items,
    reviews,
    faqs,
    product_categories,
    products,
    product_variants,
    product_catalog,
    jobs,
    job_applications,
    application_events,
    appointments: emptyTables.appointments,
  studio_media: emptyTables.studio_media,
    appointment_status_history: emptyTables.appointment_status_history,
    requirements: emptyTables.requirements,
    requirement_media: emptyTables.requirement_media,
    carts: emptyTables.carts,
    cart_items: emptyTables.cart_items,
    orders: emptyTables.orders,
    order_items: emptyTables.order_items,
    payments: emptyTables.payments,
    notifications: emptyTables.notifications,
    notification_deliveries: emptyTables.notification_deliveries,
    notification_preferences: emptyTables.notification_preferences,
    contact_points: emptyTables.contact_points,
    wishlist_items: emptyTables.wishlist_items,
    inventory_movements: emptyTables.inventory_movements,
    pages: emptyTables.pages,
    booking_holds: emptyTables.booking_holds,
  }
}

export const DEMO_ACCOUNT = {
  id: 'd0000000-0000-4000-8000-000000000001',
  email: 'demo@example.com',
  password: 'demo1234',
  full_name: 'Demo Customer',
}

export const DEMO_ADMIN = {
  id: STAFF_IDS[1],
  email: 'tunde@blackcheryunisexstudio.com',
  password: 'demo1234',
  full_name: 'Tunde Bakare',
  roles: ['staff', 'admin'],
}

export const DEMO_STAFF = {
  id: STAFF_IDS[0],
  email: 'adaeze@blackcheryunisexstudio.com',
  password: 'demo1234',
  full_name: 'Adaeze Okonkwo',
  roles: ['staff'],
}

export { img as fixtureImage }
