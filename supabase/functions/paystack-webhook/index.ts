/**
 * POST /functions/v1/paystack-webhook
 *
 * Paystack calls this when a transaction settles. Two properties matter:
 *
 *  1. IDEMPOTENCY — Paystack retries. `payment_events` has a unique constraint
 *     on (provider, event, provider_ref), so a duplicate delivery is rejected by
 *     the insert rather than double-crediting an order.
 *  2. INDEPENDENT VERIFICATION — the signature is checked, then the transaction
 *     is re-verified against Paystack's API. We never trust the webhook body
 *     alone to assert that money arrived.
 */
import { admin } from '../_shared/supabase.ts'
import { jsonResponse } from '../_shared/http.ts'
import { fromKobo, verifySignature, verifyTransaction } from '../_shared/paystack.ts'

interface WebhookEvent {
  event: string
  data: { reference?: string; status?: string; amount?: number; id?: number }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  // The raw body is required for the HMAC; read it before any JSON parsing.
  const raw = await request.text()

  // -------------------------------------------------------------------
  // Signature check
  // -------------------------------------------------------------------
  const signature = request.headers.get('x-paystack-signature')
  if (signature) {
    const valid = await verifySignature(raw, signature)
    if (!valid) {
      console.warn('paystack-webhook: signature mismatch', { signature })
      return jsonResponse({ error: 'Invalid signature' }, 401, origin)
    }
  } else if (Deno.env.get('PAYSTACK_WEBHOOK_SECRET')) {
    // A secret is configured, so a missing signature is a failure — not a
    // reason to silently accept an unauthenticated call.
    console.warn('paystack-webhook: missing signature')
    return jsonResponse({ error: 'Missing signature' }, 401, origin)
  }

  let event: WebhookEvent
  try {
    event = JSON.parse(raw) as WebhookEvent
  } catch {
    return jsonResponse({ error: 'Malformed payload' }, 400, origin)
  }

  if (!event.event) return jsonResponse({ error: 'Missing event name' }, 400, origin)

  const reference = event.data?.reference ?? null
  const supabase = admin()

  // -------------------------------------------------------------------
  // Idempotency guard
  // -------------------------------------------------------------------
  const { error: claimError } = await supabase.from('payment_events').insert({
    provider: 'paystack',
    event: event.event,
    provider_ref: reference,
    payload: event as unknown as Record<string, unknown>,
  })

  if (claimError) {
    // 23505 = unique_violation → this exact event was already handled.
    if (claimError.code === '23505') {
      console.log('paystack-webhook: duplicate ignored', { event: event.event, reference })
      return jsonResponse({ received: true, duplicate: true }, 200, origin)
    }
    console.error('paystack-webhook: could not record event', claimError)
    return jsonResponse({ error: 'Could not record event' }, 500, origin)
  }

  const markProcessed = async (ok: boolean, error?: string) => {
    await supabase
      .from('payment_events')
      .update({ processed_at: ok ? new Date().toISOString() : null, error: error ?? null })
      .eq('provider', 'paystack')
      .eq('event', event.event)
      .eq('provider_ref', reference)
  }

  // -------------------------------------------------------------------
  // Only settlement changes money.
  // -------------------------------------------------------------------
  if (event.event !== 'charge.success') {
    await markProcessed(true)
    return jsonResponse({ received: true, ignored: event.event }, 200, origin)
  }

  if (!reference) {
    await markProcessed(false, 'no reference')
    return jsonResponse({ error: 'Missing reference' }, 400, origin)
  }

  try {
    // ---------------------------------------------------------
    // 1. Independent verification
    // ---------------------------------------------------------
    const verification = await verifyTransaction(reference)
    if (!verification.status || verification.data.status !== 'success') {
      await markProcessed(false, `paystack status: ${verification.data?.status}`)
      return jsonResponse({ error: 'Transaction not successful' }, 400, origin)
    }

    const { data: transaction } = verification
    const amount = fromKobo(transaction.amount)

    // ---------------------------------------------------------
    // 2. Locate our payment record
    // ---------------------------------------------------------
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .maybeSingle()

    if (!payment) {
      await markProcessed(false, 'no matching payment row')
      console.warn('paystack-webhook: unknown reference', reference)
      return jsonResponse({ error: 'Unknown reference' }, 404, origin)
    }

    if (payment.status === 'paid') {
      await markProcessed(true)
      return jsonResponse({ received: true, alreadyPaid: true }, 200, origin)
    }

    // ---------------------------------------------------------
    // 3. Settle the payment
    // ---------------------------------------------------------
    await supabase
      .from('payments')
      .update({
        status: 'paid',
        provider_reference: transaction.reference,
        amount,
        channel: transaction.channel,
        customer_email: transaction.customer?.email ?? payment.customer_email,
        paid_at: transaction.paid_at ?? new Date().toISOString(),
        verified_at: new Date().toISOString(),
        raw_payload: transaction as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    // ---------------------------------------------------------
    // 4. Apply it to the order
    // ---------------------------------------------------------
    if (payment.order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, total, paid_total, refund_total, payment_status, status')
        .eq('id', payment.order_id)
        .single()

      if (order) {
        const paidTotal = Number(order.paid_total) + amount
        const fullyPaid = paidTotal >= Number(order.total)

        await supabase
          .from('orders')
          .update({
            paid_total: paidTotal,
            payment_status: fullyPaid ? 'paid' : 'partially_paid',
            // A paid order moves out of `pending` so fulfilment can start.
            status: order.status === 'pending' && fullyPaid ? 'confirmed' : order.status,
            confirmed_at: fullyPaid ? new Date().toISOString() : order.confirmed_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)

        if (fullyPaid) {
          // fn_order_created already ran at checkout; it must not run twice or
          // the customer gets a duplicate confirmation. Send the payment-specific
          // notification instead.
          await supabase.rpc('fn_notify', {
            p_recipient_id: payment.customer_id,
            p_type: 'order.paid',
            p_title: 'Payment received — thank you',
            p_body: `We have received your payment of ₦${amount.toLocaleString('en-NG')}. We will let you know as soon as your order is ready.`,
            p_category: 'commerce',
            p_action_url: `/account/orders/${order.id}`,
            p_action_label: 'View order',
            p_priority: 'high',
            p_data: { order_id: order.id },
            p_channels: ['in_app', 'email'],
          })
        }
      }
    }

    // ---------------------------------------------------------
    // 5. Appointment deposit / balance
    // ---------------------------------------------------------
    if (payment.appointment_id) {
      const { data: appointment } = await supabase
        .from('appointments')
        .select('id, deposit_amount, deposit_paid, total, payment_status, reference')
        .eq('id', payment.appointment_id)
        .single()

      if (appointment) {
        const isDeposit = payment.purpose === 'appointment_deposit'
        const nextPaid = isDeposit
          ? Number(appointment.deposit_paid) + amount
          : Number(appointment.total)

        await supabase
          .from('appointments')
          .update({
            deposit_paid: isDeposit ? nextPaid : appointment.deposit_paid,
            payment_status: nextPaid >= Number(appointment.deposit_amount) ? 'paid' : 'partially_paid',
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.id)
      }
    }

    await markProcessed(true)
    return jsonResponse({ received: true, settled: true }, 200, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('paystack-webhook failed', message)
    await markProcessed(false, message)
    // 500 makes Paystack retry, which is what we want for a transient failure.
    return jsonResponse({ error: 'Processing failed' }, 500, origin)
  }
})
