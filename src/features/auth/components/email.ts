/**
 * Email helpers for the auth forms.
 *
 * Deliberately permissive: the server is the authority on deliverability, this
 * only catches obvious typos before a round trip.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

/** Lower-cased and whitespace-trimmed — the form we submit everywhere. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Only ever show the first and last segment of an address on screen. */
export function maskEmail(email: string): string {
  const [local, domain] = normaliseEmail(email).split('@')
  if (!local || !domain) return email
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  return `${head}${'•'.repeat(Math.max(2, local.length - 2))}${tail}@${domain}`
}
