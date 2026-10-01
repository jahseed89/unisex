/**
 * POST /functions/v1/bank-transfer-instructions
 *
 * Returns the studio's bank details and a unique transfer reference so the
 * customer can pay from their own bank, plus a polling hint. When a bank
 * reference is received the order is confirmed by staff, or by a
 * bank-transfer-confirm webhook if one is configured.
 */
import { admin, fail, identify, isUuid, readJson } from '../_shared/supabase.ts'
import { jsonResponse, preflight } from '../_shared/http.ts'

interface Body {
  order_id?: string
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') return preflight(request)
  if (request.method !== 'POST') {
    return jsonResponse(fail('Method not allowed', 405), 405, origin)
  }

  const caller = await identify(request)
  if (!caller) return jsonResponse(fail('You must be signed in to pay', 401), 401, origin)

  const body = await readJson<Body>(request)
  if (!body || !isUuid(body.order_id)) {
    return jsonResponse(fail('order_id is required', 400), 400, origin)
  }

  const supabase = admin()

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, total, paid_total, payment_status, currency')
    .eq('id', body.order_id)
    .single()

  if (!order) return jsonResponse(fail('Order not found', 404), 404, origin)
  if (order.customer_id !== caller.userId && !caller.roles.includes('admin')) {
    return jsonResponse(fail('Not permitted', 403), 403, origin)
  }

  const outstanding = Number(order.total) - Number(order.paid_total)
  if (outstanding <= 0) {
    return jsonResponse(fail('This order is already paid', 409), 409, origin)
  }

  const accountName = Deno.env.get('BANK_ACCOUNT_NAME') ?? 'Unisex Hair Studio'
  const accountNumber = Deno.env.get('BANK_ACCOUNT_NUMBER') ?? ''
  const bankName = Deno.env.get('BANK_NAME') ?? ''

  if (!accountNumber) {
    return jsonResponse(
      fail('Bank transfer is not yet configured. Please pay by card instead.', 503),
      503,
      origin,
    )
  }

  const transferReference = `ORD-${order.order_number}`

  // Record the intent so staff can match the incoming transfer.
  await supabase.from('payments').upsert(
    {
      reference: transferReference,
      customer_id: order.customer_id,
      order_id: order.id,
      provider: 'bank_transfer',
      amount: outstanding,
      currency: order.currency,
      status: 'awaiting_payment',
      purpose: 'order',
      channel: 'bank_transfer',
      customer_email: caller.email,
    },
    { onConflict: 'reference' },
  )

  const instructions = [
    `Transfer ₦${outstanding.toLocaleString('en-NG')} to:`,
    '',
    `  Bank:      ${bankName}`,
    `  Account:   ${accountNumber}`,
    `  Account name: ${accountName}`,
    '',
    `  Reference: ${transferReference}`,
    '',
    'Include the reference in your transfer narration so we can match it.',
    'Your order is confirmed as soon as the transfer lands — usually within a few hours during opening times.',
  ].join('\n')

  return jsonResponse({ instructions, reference: transferReference }, 200, origin)
})
