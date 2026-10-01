/**
 * POST /functions/v1/dispatch-notifications
 *
 * Drains `notification_deliveries` for queued in-app/email/SMS/WhatsApp sends.
 *
 * Intended to run from pg_cron every minute via a scheduled HTTP call, or on a
 * short interval in production. Rows are claimed with FOR UPDATE SKIP LOCKED so
 * that running several workers concurrently cannot send the same message twice.
 */
import { admin } from '../_shared/supabase.ts'
import { jsonResponse } from '../_shared/http.ts'
import { fail } from '../_shared/supabase.ts'

const MAX_ATTEMPTS = 4
const BATCH_SIZE = 40

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  // Cron calls this without a browser origin; a GET is therefore allowed.
  if (request.method !== 'POST' && request.method !== 'GET') {
    return jsonResponse(fail('Method not allowed', 405), 405, origin)
  }

  const supabase = admin()

  try {
    // ---------------------------------------------------------
    // 1. Claim a batch
    // ---------------------------------------------------------
    const { data: claimed, error: claimError } = await supabase.rpc(
      'claim_notification_deliveries',
      { p_limit: BATCH_SIZE },
    )

    if (claimError) {
      console.error('dispatch: claim failed', claimError)
      return jsonResponse(fail('Could not claim deliveries', 500), 500, origin)
    }

    const batch = (claimed ?? []) as {
      delivery_id: number
      channel: string
      destination: string
      notification_id: string
      recipient_id: string
      title: string | null
      body: string | null
      attempt_count: number
    }[]

    if (batch.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0 }, 200, origin)
    }

    // ---------------------------------------------------------
    // 2. Resolve the recipient once for the whole batch
    // ---------------------------------------------------------
    const recipientIds = [...new Set(batch.map((d) => d.recipient_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email_opt_in, sms_opt_in, whatsapp_opt_in, email, phone_e164')
      .in('id', recipientIds)

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p] as const),
    )

    // ---------------------------------------------------------
    // 3. Deliver
    // ---------------------------------------------------------
    let sent = 0
    let failed = 0

    for (const delivery of batch) {
      const profile = profileMap.get(delivery.recipient_id)
      const attempts = (delivery.attempt_count ?? 0) + 1

      try {
        // An in-app notification was already written by fn_notify(); nothing to
        // send, so just confirm it.
        if (delivery.channel === 'in_app') {
          await mark(delivery.delivery_id, 'delivered')
          continue
        }

        if (!profile) {
          await failDelivery(delivery.delivery_id, attempts, 'recipient_not_found')
          failed++
          continue
        }

        // Re-check consent at send time: a user may have opted out after the
        // notification was queued.
        const optedOut =
          (delivery.channel === 'email' && !profile.email_opt_in) ||
          (delivery.channel === 'sms' && !profile.sms_opt_in) ||
          (delivery.channel === 'whatsapp' && !profile.whatsapp_opt_in)

        if (optedOut) {
          await mark(delivery.delivery_id, 'suppressed')
          continue
        }

        const result = await deliver(delivery.channel, delivery.destination, {
          title: delivery.title ?? '',
          body: delivery.body ?? '',
          recipientId: delivery.recipient_id,
        })

        if (result.ok) {
          await mark(delivery.delivery_id, 'sent', result.providerMessageId)
          sent++
        } else {
          await failDelivery(delivery.delivery_id, attempts, result.error)
          failed++
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await failDelivery(delivery.delivery_id, attempts, message)
        failed++
      }
    }

    return jsonResponse({ processed: batch.length, sent, failed }, 200, origin)
  } catch (error) {
    console.error('dispatch-notifications failed', error)
    return jsonResponse(fail('Dispatch failed', 500), 500, origin)
  }
})

// ---------------------------------------------------------------------------
// Delivery adapters
// ---------------------------------------------------------------------------

async function deliver(
  channel: string,
  destination: string,
  payload: { title: string; body: string; recipientId: string },
): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  switch (channel) {
    case 'email':
      return deliverEmail(destination, payload)
    case 'sms':
      return deliverSms(destination, payload.body)
    case 'whatsapp':
      return deliverWhatsapp(destination, payload)
    default:
      // 'push' has no provider configured yet; treat as a no-op success so the
      // queue does not stall behind it.
      return { ok: true }
  }
}

/**
 * Email. Uses the Supabase `resend` SMTP relay if configured; otherwise logs
 * the message so local development is still observable.
 */
async function deliverEmail(
  to: string,
  payload: { title: string; body: string },
): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  const relayKey = Deno.env.get('SMTP_RELAY_KEY')

  if (!relayKey) {
    console.log('[email:dev]', { to, subject: payload.title, body: payload.body })
    return { ok: true, providerMessageId: 'dev-log' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Unisex Hair Studio <no-reply@unisexhairstudio.com>',
      to: [to],
      subject: payload.title,
      text: payload.body,
    }),
  })

  if (!response.ok) {
    return { ok: false, error: `email provider returned ${response.status}` }
  }

  const data = (await response.json()) as { id?: string }
  return { ok: true, providerMessageId: data.id }
}

/** SMS via Termii, configured for the Nigerian market. */
async function deliverSms(
  to: string,
  body: string,
): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  const { TERMII_API_KEY, TERMII_SENDER_ID } = Deno.env.toObject()

  if (!TERMII_API_KEY) {
    console.log('[sms:dev]', { to, body })
    return { ok: true, providerMessageId: 'dev-log' }
  }

  const params = new URLSearchParams({
    api_key: TERMII_API_KEY,
    to,
    from: TERMII_SENDER_ID ?? 'UnisexHair',
    type: 'plain',
    channel: 'generic',
    message: body.slice(0, 800),
  })

  const response = await fetch(`https://api.termii.com/messages/send?${params}`)
  if (!response.ok) {
    return { ok: false, error: `termii returned ${response.status}` }
  }

  const data = (await response.json()) as { message_id?: string }
  return { ok: true, providerMessageId: data.message_id }
}

/**
 * WhatsApp via the Cloud API.
 *
 * Business-initiated messages only work inside the 24-hour customer service
 * window or with an approved template. Anything else must use a template name,
 * which is why the template key is checked before sending free-form text.
 */
async function deliverWhatsapp(
  to: string,
  payload: { title: string; body: string },
): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = Deno.env.toObject()

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log('[whatsapp:dev]', { to, body: payload.body })
    return { ok: true, providerMessageId: 'dev-log' }
  }

  const insideWindow = await isInsideServiceWindow(payload.recipientId)
  const type = insideWindow ? 'text' : 'template'
  const whatsappTemplate = Deno.env.get('WHATSAPP_TEMPLATE_NAME')

  if (!insideWindow && !whatsappTemplate) {
    return {
      ok: false,
      error: 'outside the 24h window and no template is configured',
    }
  }

  const message =
    type === 'text'
      ? { text: { body: `${payload.title}\n\n${payload.body}`.slice(0, 1024) } }
      : {
          template: {
            name: whatsappTemplate,
            language: { code: 'en' },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: payload.title }] },
            ],
          },
        }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: `+${to.replace(/\D/g, '')}`, type, ...message }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    return { ok: false, error: `whatsapp returned ${response.status}: ${detail.slice(0, 200)}` }
  }

  const data = (await response.json()) as { messages?: { id?: string }[] }
  return { ok: true, providerMessageId: data.messages?.[0]?.id }
}

/**
 * True when this person messaged us within the last 24 hours.
 *
 * The Cloud API only permits free-form business replies inside that window;
 * anything later must use an approved template. Looked up by profile_id, which
 * is how inbound webhooks resolve the sender.
 */
async function isInsideServiceWindow(recipientId: string): Promise<boolean> {
  const supabase = admin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('whatsapp_messages')
    .select('sent_at')
    .eq('direction', 'inbound')
    .eq('profile_id', recipientId)
    .gt('sent_at', since)
    .limit(1)

  return (data ?? []).length > 0
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

async function mark(
  id: number,
  status: string,
  providerMessageId?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await admin()
    .from('notification_deliveries')
    .update({
      status,
      sent_at: now,
      delivered_at: status === 'delivered' ? now : null,
      provider_message_id: providerMessageId ?? null,
      failed_at: null,
      error_message: null,
    })
    .eq('id', id)
}

async function failDelivery(id: number, attempts: number, message: string): Promise<void> {
  const exhausted = attempts >= MAX_ATTEMPTS

  await admin()
    .from('notification_deliveries')
    .update({
      status: exhausted ? 'failed' : 'queued',
      attempt_count: attempts,
      failed_at: new Date().toISOString(),
      error_message: message.slice(0, 500),
      // Back off: 1m, 2m, 4m …
      scheduled_for: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
    })
    .eq('id', id)

  if (exhausted) {
    console.warn(`dispatch: giving up on delivery ${id}: ${message}`)
  }
}
