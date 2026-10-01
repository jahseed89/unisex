/**
 * Value helpers for the admin forms.
 *
 * Deliberately separate from the component module: these are pure functions, not
 * React components, and mixing the two costs Fast Refresh its validity. They also
 * deserve to be testable in isolation.
 */

import type { AppointmentWithCustomer } from './adminReads'

// ---------------------------------------------------------------------------
// Form value coercion
// ---------------------------------------------------------------------------

/** '' → null, otherwise a finite number. Keeps nullable numerics honest. */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function numberOr(value: string, fallback: number): number {
  return numberOrNull(value) ?? fallback
}

/** number | null → controlled-input string. */
export function toInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

/** ISO timestamp → `datetime-local` value, in the browser's own timezone. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** `datetime-local` value → ISO, or null when the field is empty. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Long-form text area → trimmed array, dropping blank lines. */
export function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function listToLines(values: string[]): string {
  return values.join('\n')
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Builds a CSV from the rows currently held in memory and downloads it. The
 * export is deliberately page-scoped — the admin readers page server-side and
 * expose no streaming endpoint, so the button that calls this says "this page".
 */
export function exportCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): number {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  // BOM so Excel opens the ₦ sign correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return rows.length
}

/** Rows of an admin booking page, flattened for `exportCsv`. */
export function bookingRows(rows: AppointmentWithCustomer[]) {
  return rows.map((row) => [
    row.reference,
    row.starts_at,
    row.customer?.full_name ?? '',
    row.customer?.email ?? '',
    row.customer?.phone_e164 ?? '',
    row.service?.name ?? '',
    row.variant?.label ?? '',
    row.staff?.full_name ?? '',
    row.location?.name ?? '',
    row.status,
    row.payment_status,
    row.total,
  ])
}

export const BOOKING_CSV_HEADER = [
  'Reference',
  'Starts',
  'Customer',
  'Email',
  'Phone',
  'Service',
  'Variant',
  'Stylist',
  'Location',
  'Status',
  'Payment status',
  'Total',
]

