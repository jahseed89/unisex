import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns'
import { site } from '@/config/site'

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Format NGN. The naira sign is prefixed by hand because the Intl narrow
 * symbol renders inconsistently across browsers for NGN.
 */
export function formatNaira(amount: number | null | undefined, options?: { compact?: boolean }): string {
  const value = Number(amount ?? 0)
  if (!Number.isFinite(value)) return '₦0'

  if (options?.compact && Math.abs(value) >= 1_000_000) {
    return `₦${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}m`
  }
  if (options?.compact && Math.abs(value) >= 10_000) {
    return `₦${Math.round(value / 1000)}k`
  }

  return `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** Compact price range for catalogue cards: "₦35k – ₦140k". */
export function formatPriceRange(from: number, to?: number | null): string {
  if (!to || to === from) return formatNaira(from)
  return `${formatNaira(from, { compact: true })} – ${formatNaira(to, { compact: true })}`
}

// ---------------------------------------------------------------------------
// Dates & times
// ---------------------------------------------------------------------------

function asDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value
}

/** Absolute date, e.g. "Mon, 3 Mar 2025". */
export function formatDate(value: string | Date, pattern = 'EEE, d MMM yyyy'): string {
  try {
    return format(asDate(value), pattern)
  } catch {
    return '—'
  }
}

export function formatDateLong(value: string | Date): string {
  return formatDate(value, 'EEEE, d MMMM yyyy')
}

export function formatTime(value: string | Date): string {
  return formatDate(value, 'h:mm a')
}

/** "Today at 2:30 PM" / "Tomorrow at 10:00 AM" / "Mon, 3 Mar at 2:30 PM". */
export function formatDateTime(value: string | Date): string {
  const date = asDate(value)
  if (isToday(date)) return `Today at ${formatTime(date)}`
  if (isTomorrow(date)) return `Tomorrow at ${formatTime(date)}`
  if (isYesterday(date)) return `Yesterday at ${formatTime(date)}`
  return `${format(date, 'EEE, d MMM')} at ${format(date, 'h:mm a')}`
}

export function formatRelative(value: string | Date): string {
  try {
    return formatDistanceToNowStrict(asDate(value), { addSuffix: true })
  } catch {
    return '—'
  }
}

export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Local-midnight `Date` for a yyyy-MM-dd key, avoiding UTC day-shift bugs. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function humanise(value: string | null | undefined): string {
  if (!value) return '—'
  return titleCase(value)
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

// ---------------------------------------------------------------------------
// Phone & URLs
// ---------------------------------------------------------------------------

/**
 * Coerce local Nigerian input to E.164. Accepts 0803…, +234803…, 234803….
 */
export function toE164(input: string, defaultCountry = '234'): string | null {
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0') && digits.length >= 11) return `+${defaultCountry}${digits.slice(1)}`
  if (digits.startsWith(defaultCountry) && digits.length >= 12) return `+${digits}`
  if (digits.length === 10) return `+${defaultCountry}${digits}`
  if (digits.length === 11) return `+${digits}`
  return `+${digits}`
}

export function whatsappLink(message: string, phone?: string): string {
  const number = (phone ?? site.contact.whatsapp).replace(/\D/g, '')
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

// ---------------------------------------------------------------------------
// Slugs & misc
// ---------------------------------------------------------------------------

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Percentage saved when `compare` exceeds `price`. */
export function discountPercent(price: number, compare: number | null | undefined): number | null {
  if (!compare || compare <= price) return null
  return Math.round(((compare - price) / compare) * 100)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/** Stable grouping of a list into a Map keyed by the result of `key`. */
export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = out.get(k)
    if (bucket) bucket.push(item)
    else out.set(k, [item])
  }
  return out
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
