/**
 * CORS headers for Edge Functions.
 *
 * Only the site origin and any explicitly configured preview origins are
 * allowed. `*` is never used for credentialed requests, and the anon key is an
 * Authorization header rather than a cookie, but a tight allowlist is still the
 * correct default.
 */
export const corsHeaders = (origin: string | null): Record<string, string> => {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

  const isAllowed =
    allowed.length > 0 ? origin !== null && allowed.includes(origin) : origin === siteUrl

  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin ?? siteUrl) : siteUrl,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-paystack-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  origin: string | null = null,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function preflight(request: Request): Response {
  return new Response('ok', { headers: corsHeaders(request.headers.get('origin')) })
}
