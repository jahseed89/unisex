/**
 * Single source of truth for brand identity and business configuration.
 *
 * Everything a rebrand touches — navigation, SEO defaults, footer, contact
 * details, structured data — reads from here. Nothing below is fetched, so it
 * is available on first paint for crawlers.
 */

export const site = {
  name: 'Black Chery Unisex Studio',
  legalName: 'Black Chery Unisex Studio',
  /** Proprietor. Used in founder credit, JSON-LD and legal copy. */
  owner: {
    name: 'Wisdom Ocran',
    role: 'Founder & Head Stylist',
  },
  wordmark: {
    primary: 'BLACK CHERY',
    accent: 'UNISEX',
    suffix: 'STUDIO',
  },
  tagline: 'Premium hair, braids, locs and colour for everyone.',
  description:
    'Black Chery Unisex Studio is a premium unisex salon in Lagos, Nigeria. Browse and book hair, braids, locs, colour and styling services, shop wigs, extensions and hair care, and join our team.',
  shortDescription:
    'A premium unisex salon for braids, locs, hair, colour and styling — with an online boutique.',

  url: import.meta.env.VITE_APP_URL || 'https://blackcheryunisexstudio.com',
  locale: 'en-NG',
  currency: 'NGN',
  timezone: 'Africa/Lagos',

  contact: {
    email: import.meta.env.VITE_SUPPORT_EMAIL || 'hello@blackcheryunisexstudio.com',
    phone: import.meta.env.VITE_SUPPORT_PHONE || '+2348000000000',
    whatsapp: import.meta.env.VITE_WHATSAPP_PHONE_NUMBER || '2348000000000',
  },

  address: {
    street: '12 Adeola Odeku Street',
    locality: 'Victoria Island',
    region: 'Lagos',
    country: 'NG',
    postalCode: '106104',
  },

  hours: {
    // 0 = Sunday
    periods: [
      { opens: '00:00', closes: '00:00', days: [0], closed: true },
      { opens: '09:00', closes: '19:00', days: [1, 2, 3, 4], closed: false },
      { opens: '09:00', closes: '20:00', days: [5], closed: false },
      { opens: '10:00', closes: '20:00', days: [6], closed: false },
    ],
  },

  social: {
    instagram: 'https://instagram.com/blackcheryunisexstudio',
    facebook: 'https://facebook.com/blackcheryunisexstudio',
    tiktok: 'https://tiktok.com/@blackcheryunisexstudio',
    x: 'https://x.com/blackcheryunisexstudio',
  },

  /** Booking policy mirrored from business_settings; the database is authoritative. */
  policy: {
    advanceBookingDays: 60,
    leadTimeHours: 4,
    cancellationWindowHours: 24,
    depositRequired: false,
    depositPercent: 30,
  },
} as const

export type SiteConfig = typeof site

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Schema.org `openingHours` strings. Days sharing identical hours are collapsed
 * into one entry (e.g. "Mo-Th 09:00-19:00") as the specification prefers.
 */
export function schemaOpeningHours(): string[] {
  const open = site.hours.periods.filter((p) => !p.closed)

  const groups = new Map<string, number[]>()
  for (const period of open) {
    const key = `${period.opens}-${period.closes}`
    groups.set(key, [...(groups.get(key) ?? []), ...period.days])
  }

  return [...groups.entries()].map(([hours, days]) => {
    const sorted = [...days].sort((a, b) => a - b)
    const isContiguous = sorted.every((day, i) => i === 0 || day === (sorted[i - 1] as number) + 1)
    const dayRange = isContiguous
      ? sorted.length === 1
        ? (DAY_SHORT[sorted[0] as number] as string)
        : `${DAY_SHORT[sorted[0] as number]}-${DAY_SHORT[sorted[sorted.length - 1] as number]}`
      : sorted.map((d) => DAY_SHORT[d]).join(',')
    return `${dayRange} ${hours}`
  })
}

/**
 * Primary navigation. `nav` is the recommended IA from the brief; `utility`
 * holds account-only destinations that are surfaced contextually instead.
 */
export interface NavItem {
  label: string
  to: string
  /** Present only on high-traffic destinations, e.g. "Book Appointment". */
  highlight?: boolean
}

export const primaryNav: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Book Appointment', to: '/book', highlight: true },
  { label: 'Shop', to: '/shop' },
  { label: 'Careers', to: '/careers' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Contact', to: '/contact' },
] as const

export const footerNav = [
  {
    heading: 'Salon',
    links: [
      { label: 'Services', to: '/services' },
      { label: 'Book an appointment', to: '/book' },
      { label: 'Our stylists', to: '/about#team' },
      { label: 'Gallery', to: '/gallery' },
      { label: 'About us', to: '/about' },
    ],
  },
  {
    heading: 'Shop',
    links: [
      { label: 'Wigs', to: '/shop?kind=wig' },
      { label: 'Extensions', to: '/shop?kind=extension' },
      { label: 'Hair care', to: '/shop?kind=hair_care' },
      { label: 'Styling tools', to: '/shop?kind=styling' },
      { label: 'Your cart', to: '/cart' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Careers', to: '/careers' },
      { label: 'Contact', to: '/contact' },
      { label: 'Bookings policy', to: '/policies/bookings' },
      { label: 'Privacy', to: '/policies/privacy' },
      { label: 'Terms', to: '/policies/terms' },
    ],
  },
] as const

/** Primary calls to action, used by the hero and section headers. */
export const primaryCtas = [
  { label: 'Book an Appointment', to: '/book', variant: 'solid' },
  { label: 'View Services', to: '/services', variant: 'outline' },
  { label: 'Shop Now', to: '/shop', variant: 'outline' },
  { label: 'Join Our Team', to: '/careers', variant: 'ghost' },
] as const

export function absoluteUrl(path = '/'): string {
  return new URL(path, site.url).toString()
}
