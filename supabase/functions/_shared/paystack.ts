/**
 * Paystack integration helpers.
 *
 * Secrets live only in the Edge Function environment
 * (`PAYSTACK_SECRET_KEY`). The public key is safe in the browser bundle.
 */

const BASE_URL = 'https://api.paystack.co'

export interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

export interface PaystackVerifyResponse {
  status: boolean
  message: string
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    status: string
    paid_at: string | null
    channel: string | null
    customer: { email: string | null; phone_number: string | null }
    metadata: Record<string, unknown> | null
  }
}

function secretKey(): string {
  const key = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured')
  return key
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Paystack ${path} failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  return (await response.json()) as T
}

/** Create a transaction and return the hosted checkout URL. */
export function initializeTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}): Promise<PaystackInitializeResponse> {
  return call<PaystackInitializeResponse>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      // Paystack works in kobo; the database stores NGN.
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: 'NGN',
      channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],
      metadata: input.metadata ?? {},
    }),
  })
}

/**
 * Confirm a transaction actually succeeded with Paystack before trusting it.
 * A webhook alone is not sufficient evidence — the client can be told to
 * navigate away before the webhook is ever delivered.
 */
export function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  return call<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/**
 * Constant-time HMAC-SHA512 comparison for webhook signatures.
 * Returns false on any length mismatch rather than throwing.
 */
export async function verifySignature(
  payload: string,
  signature: string,
): Promise<boolean> {
  const secret = Deno.env.get('PAYSTACK_WEBHOOK_SECRET')
  if (!secret || !signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  )

  const expected = [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  if (expected.length !== signature.length) return false

  // Compare every byte; do not short-circuit on the first difference.
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/** NGN (major units) → kobo, the unit Paystack expects. */
export function toKobo(amount: number): number {
  return Math.round(Number(amount) * 100)
}

/** kobo → NGN. */
export function fromKobo(amount: number): number {
  return Math.round(Number(amount)) / 100
}
