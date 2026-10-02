import type { SalonLocation } from '@/types'

/**
 * iCalendar export.
 *
 * A real `.ics` file the customer can drop into Google Calendar, Apple Calendar
 * or Outlook. Times are written in UTC (`Z`) because the studio's local time is
 * Lagos time and a floating local time in an imported event is the single most
 * common source of "the appointment is at the wrong time" bug reports.
 */

export interface IcsEventInput {
  /** Stable identifier — reused as the event UID. */
  id: string
  title: string
  startsAt: string
  durationMinutes: number
  stylistName: string
  locationLine: string
  description?: string
  url?: string
}

/** RFC 5545 basic format: 20260314T091500Z */
function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** RFC 5545 caps a content line at 75 octets; longer lines must be folded. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest.length > 0) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

export function buildIcs(input: IcsEventInput): string {
  const start = new Date(input.startsAt)
  const end = new Date(start.getTime() + input.durationMinutes * 60_000)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Black Chery Unisex Studio//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(input.id)}@blackcheryunisexstudio.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeText(input.title)}`,
    `DESCRIPTION:${escapeText(input.description ?? `Appointment with ${input.stylistName}.`)}`,
    `LOCATION:${escapeText(input.locationLine)}`,
    ...(input.url ? [`URL:${escapeText(input.url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** Build the file and hand it to the browser as a download. */
export function downloadAppointmentIcs(input: IcsEventInput): void {
  const blob = new Blob([buildIcs(input)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `unisex-appointment-${input.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** Google Maps directions link from whatever address fields we were given. */
export function directionsUrl(location: Pick<SalonLocation, 'address_line1' | 'city' | 'state'> | null): string {
  const query = location
    ? `${location.address_line1}, ${location.city}, ${location.state}`
    : 'Black Chery Unisex Studio, 12 Adeola Odeku Street, Victoria Island, Lagos'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
