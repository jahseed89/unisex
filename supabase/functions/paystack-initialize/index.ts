/**
 * POST /functions/v1/paystack-initialize
 *
 * Creates a Paystack transaction for an order or appointment deposit and
 * returns the hosted checkout URL. Called by `startPayment()` in
 * src/lib/api/commerce.ts.
 *
 * The amount is ALWAYS recomputed from the database. A client-supplied amount
 * is never trusted — that would let a caller pay ₦1 for a ₦90,000 order.
 */
import { admin, fail, identify, isUuid, readJson } from '../_shared/supabase.ts'
import { jsonResponse, preflight } from '../_shared/http.ts'
import { initializeTransaction, toKobo } from '../_shared/paystack.ts'

interface Body {
  order_id?: string
  appointment_id?: string
  email?: string
  reference?: string
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
  if (!body) return jsonResponse(fail('Invalid request body', 400), 400, origin)

  const supabase = admin()

  try {
    // ---------------------------------------------------------------------
    // Order payment
    // ---------------------------------------------------------------------
    if (isUuid(body.order_id)) {
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_id, total, paid_total, currency, payment_status, contact_email')
        .eq('id', body.order_id)
        .single()

      if (error || !order) return jsonResponse(fail('Order not found', 404), 404, origin)
      if (order.customer_id !== caller.userId && !caller.roles.includes('admin')) {
        return jsonResponse(fail('Not permitted', 403), 403, origin)
      }

      const outstanding = Number(order.total) - Number(order.paid_total)
      if (outstanding <= 0) {
        return jsonResponse(fail('This order is already paid', 409), 409, origin)
      }

      const email = body.email ?? order.contact_email
      if (!email) return jsonResponse(fail('An email address is required', 400), 400, origin)

      const result = await initializeTransaction({
        email,
        amountKobo: toKobo(outstanding),
        reference: `ORD-${order.order_number}`,
        callbackUrl: `${Deno.env.get('SITE_URL') ?? ''}/checkout/success?order_id=${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          purpose: 'order',
        },
      })

      if (!result.status) {
        return jsonResponse(fail(result.message || 'Paystack rejected the request', 502), 502, origin)
      }

      // Record the intent so the webhook can match it and the UI can show
      // "payment pending" rather than "unpaid".
      await supabase.from('payments').insert({
        reference: result.data.reference,
        customer_id: order.customer_id,
        order_id: order.id,
        provider: 'paystack',
        amount: outstanding,
        currency: order.currency,
        status: 'awaiting_payment',
        purpose: 'order',
        channel: 'card',
        customer_email: email,
      })

      return jsonResponse(
        {
          authorization_url: result.data.authorization_url,
          access_code: result.data.access_code,
          reference: result.data.reference,
          amount: outstanding,
        },
        200,
        origin,
      )
    }

    // ---------------------------------------------------------------------
    // Appointment deposit
    // ---------------------------------------------------------------------
    if (isUuid(body.appointment_id)) {
      const { data: appointment } = await supabase
        .from('appointments')
        .select('id, reference, customer_id, deposit_amount, deposit_paid, deposit_required')
        .eq('id', body.appointment_id)
        .single()

      if (!appointment) return jsonResponse(fail('Appointment not found', 404), 404, origin)
      if (appointment.customer_id !== caller.userId && !caller.roles.includes('admin')) {
        return jsonResponse(fail('Not permitted', 403), 403, origin)
      }
      if (!appointment.deposit_required) {
        return jsonResponse(fail('No deposit is required for this booking', 409), 409, origin)
      }

      const outstanding =
        Number(appointment.deposit_amount) - Number(appointment.deposit_paid)
      if (outstanding <= 0) {
        return jsonResponse(fail('The deposit is already paid', 409), 409, origin)
      }

      const email = body.email ?? caller.email
      if (!email) return jsonResponse(fail('An email address is required', 400), 400, origin)

      const result = await initializeTransaction({
        email,
        amountKobo: toKobo(outstanding),
        reference: `APT-${appointment.reference}`,
        callbackUrl: `${Deno.env.get('SITE_URL') ?? ''}/account/appointments/${appointment.id}`,
        metadata: {
          appointment_id: appointment.id,
          reference: appointment.reference,
          customer_id: appointment.customer_id,
          purpose: 'appointment_deposit',
        },
      })

      if (!result.status) {
        return jsonResponse(fail(result.message || 'Paystack rejected the request', 502), 502, origin)
      }

      await supabase.from('payments').insert({
        reference: result.data.reference,
        customer_id: appointment.customer_id,
        appointment_id: appointment.id,
        provider: 'paystack',
        amount: outstanding,
        currency: 'NGN',
        status: 'awaiting_payment',
        purpose: 'appointment_deposit',
        channel: 'card',
        customer_email: email,
      })

      return jsonResponse(
        {
          authorization_url: result.data.authorization_url,
          access_code: result.data.access_code,
          reference: result.data.reference,
          amount: outstanding,
        },
        200,
        origin,
      )
    }

    return jsonResponse(fail('Provide either order_id or appointment_id', 400), 400, origin)
  } catch (error) {
    console.error('paystack-initialize failed', error)
    return jsonResponse(
      fail('We could not start the payment. Please try again.', 502),
      502,
      origin,
    )
  }
})
