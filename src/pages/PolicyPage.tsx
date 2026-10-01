import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react'

import { getPage, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { formatDate, slugify, whatsappLink } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/shared/Cards'
import { Section } from '@/components/shared/Blocks'
import { ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, useSeo } from '@/components/seo/Seo'

// ---------------------------------------------------------------------------
// Built-in policy copy
//
// Used whenever the CMS has no published page for the slug, so the three
// footered policies always render with real content.
// ---------------------------------------------------------------------------

const BUILT_IN: Record<
  string,
  { title: string; eyebrow: string; excerpt: string; updated: string; body: string }
> = {
  bookings: {
    title: 'Bookings policy',
    eyebrow: 'Appointments',
    excerpt:
      'How far ahead you can book, what notice we need, when you can cancel for free, and what happens to deposits.',
    updated: '1 September 2025',
    body: `# Bookings policy

Appointments are held in a stylist's name, not just a chair. That is why we ask for a little notice, and why we ask you to tell us about your hair before you arrive. Everything below is what we have agreed with every client since we opened.

## Booking window

- You can book **up to 60 days ahead**. Anything further out opens as soon as it does — the diary for a busy Saturday in December is usually live by early November.
- Appointments can be booked from **4 hours ahead** of the start time. Anything inside that window has to be arranged by phone or WhatsApp so a stylist can be assigned by hand.
- Same-day bookings depend on the diary. We hold a small number of walk-in slots each day, and they go quickly on Saturdays.

## Free cancellation and rescheduling

- Cancel or reschedule **free of charge up to 24 hours before** your appointment start time. Do it from your account under Appointments, or message us — a reschedule is confirmed instantly from the live diary.
- **Inside 24 hours**, the chair stays held in your name and we can no longer fill it. If a deposit was paid, **50% of that deposit is forfeited**. The remaining balance, if any, is released.
- **No-shows** are treated the same as a late cancellation: any deposit paid is forfeited in full, because the time could not be re-sold.

## Deposits

- Some services — extensions, wigs, loc colour and bridal bookings — carry a deposit. The amount is shown on the service page and again at the payment step, always as a naira figure. We never take a deposit silently.
- Deposits come off your final bill. You pay the balance at the salon after the service, by card, transfer or USSD.
- If a deposit is taken and you cancel **more than 24 hours ahead**, it is refunded in full to the original payment method within **5 working days**.
- If you cancel inside 24 hours, half is forfeited and half is refunded on the same timetable.

## Refunds

- **Service deposits** follow the cancellation rules above. There is no separate refund process — cancel the booking and the refund is automatic.
- **Products** bought in the boutique can be returned unopened within **7 days** of collection or delivery, with the receipt. Opened hair care, wigs that have been fitted or cut, and products bought at a discounted price are not returnable, for hygiene reasons.
- **Custom or made-to-measure work** — custom units, colour correction plans, course bookings — is non-refundable once work has started, because the materials are committed to you.
- **Late or failed delivery** is refunded in full, or reshipped at our cost, whichever you prefer. Tell us within 48 hours of the expected delivery date.
- Refunds are processed to the original payment method. Bank transfers can take up to 3 working days to appear; card refunds usually show up within 24 hours.

## Payments

- We accept card, bank transfer and USSD through Paystack, which works with all major Nigerian banks. Cash and POS are welcome at the studio.
- A booking is only confirmed once any required deposit has cleared. Unpaid deposits are held for **24 hours** and then the slot is released.

## Running late

- We hold a chair for **15 minutes**. After that, we may need to shorten the service or move you to another stylist so the next client is not left waiting.
- If you know you will be late, message us. It genuinely helps, and we will do what we can.

## Changing or cancelling a booking

Do it from your account under Appointments, or send us the reference from your confirmation email. If something is not working, tell us — we would always rather move an appointment than lose you.`,
  },
  privacy: {
    title: 'Privacy policy',
    eyebrow: 'Legal',
    excerpt:
      'What we collect, why we collect it, how long we keep it, and the rights you have over your own data.',
    updated: '1 September 2025',
    body: `# Privacy policy

We collect the minimum we need to cut your hair well and keep your appointments in order. This page explains exactly what that means, in plain language.

## What we collect

- **Account details** — your name, email address and phone number, which you give us when you create an account.
- **Booking details** — the services you book, the times you choose, your stylist, and any notes you add.
- **Hair and requirement details** — the information you enter on the requirement form: current length, texture, colour history, scalp conditions, allergies and the reference images you upload.
- **Payments** — Paystack handles card, transfer and USSD payments. We store the amount, the provider, the reference and the status. We never see or store full card numbers.
- **Order details** — what you bought, where it was delivered or collected, and the contact details you gave us for the delivery.
- **Technical data** — pages visited and searches performed, collected only if you have given analytics consent.

## Why we collect it

- To book, confirm and remind you about appointments.
- To prepare properly for your hair, which is the whole point of the requirement form.
- To take payment, issue refunds and keep our books straight.
- To deliver or collect an order.
- To answer your messages and handle feedback.
- To improve the studio, using aggregated numbers rather than your personal details.

## Reference images and health information

Photographs you upload as references, and anything you tell us about allergies, scalp conditions or medications, are treated as **confidential salon records**. They are visible to the stylist preparing for your appointment and to the studio manager where it is genuinely needed. They are never published, never used in marketing, and never shared with suppliers.

## How long we keep it

- Appointment and order records: **7 years**, because we are a registered business and tax and consumer law require it.
- Account details: until you ask us to delete your account.
- Reference images: for **12 months** after your last appointment, then deleted automatically.
- Requirements and aftercare notes: for **24 months**, so your stylist has history if you come back.

## Who we share it with

- Our payment provider, Paystack, to take payment.
- Our delivery partner, for the address and phone number needed to deliver an order.
- Nobody else. We do not sell data, and we do not share it with advertisers or data brokers.

## Your rights

You can ask us at any time to:

- give you a copy of the personal data we hold about you;
- correct anything that is wrong;
- delete your account and the data attached to it, where the law does not require us to keep it;
- stop you receiving marketing messages, by replying to any message or writing to us.

Write to [${site.contact.email}](mailto:${site.contact.email}) and we will action it within 30 days. There is no charge.

## Cookies

We use cookies for the things that make the site work — keeping you signed in, remembering your cart, and remembering your analytics consent. We do not use advertising cookies, and we do not run retargeting pixels.

## Security

Data is held in an encrypted database with row-level access control, so staff only see the records they need for their job. Passwords are hashed and never stored in readable form. No system is perfect, but a breach of this studio's data is treated as a serious incident and we would tell you.

## Children

Our services are for adults. If you are under 18, please have a parent or guardian book on your behalf and get their agreement before you create an account.

## Changes to this policy

If we make a material change, we will update the date at the top of this page and, where the change affects you directly, message you before it takes effect.`,
  },
  terms: {
    title: 'Terms of use',
    eyebrow: 'Legal',
    excerpt:
      'The rules for using this website, buying from our shop, and the limits of what we can promise.',
    updated: '1 September 2025',
    body: `# Terms of use

These terms cover the Unisex Hair Studio website, online booking and online shop. By using the site or placing an order, you accept them.

## Using this website

- Content on this site — service descriptions, prices, images and articles — belongs to Unisex Hair Studio or is used with permission. You may read it, share links to it, and quote short extracts with credit. You may not copy it commercially or republish it wholesale.
- Prices shown are in **Nigerian Naira (₦)** and include VAT where applicable. Prices can change; the price on your booking or order confirmation is the price that applies.
- We try hard to keep information accurate, but occasionally something is wrong or out of date. If a price is materially wrong, tell us and we will sort it out before you pay.

## Accounts

- You need an account to book an appointment, submit a requirement, check out or apply for a role. Browsing is open to everyone; you do not need an account to look around.
- You are responsible for keeping your password safe and for what happens under your account. Tell us immediately if you think someone else has access.
- You must be 18 or older to create an account, or have a parent or guardian do it for you.

## Bookings

Appointments, deposits, cancellations and refunds are covered in full by our [bookings policy](/policies/bookings). In short: book up to 60 days ahead, give us 4 hours notice, cancel free up to 24 hours before, and expect half of any deposit to be forfeited inside that window.

## Online shop

- Orders are confirmed once payment clears. Items are held for **5 working days** after payment while we prepare them.
- Product images are as accurate as we can make them. Hair colour and texture vary between batches, and screens differ — if an exact shade matters for a custom unit, talk to us first.
- Our [refunds and returns rules](/policies/bookings#refunds) apply to shop purchases, with the addition that wigs that have been fitted or cut, and opened hair care, cannot be returned.
- Delivery is free within Lagos on orders over **₦75,000** and **₦2,500** otherwise. Collection from the studio is always free. We cannot deliver outside Lagos at the moment.
- We may cancel and refund an order if an item is out of stock, if the listing was published in error, or if we suspect fraud.

## Appointments and results

- Every service page shows a **price range** rather than a single price, because hair length, density and starting condition genuinely vary. Your stylist will confirm the final figure with you **before** any work begins.
- We aim to deliver the result you agreed in consultation. Different hair textures react differently to the same treatment, and we will always tell you honestly what is realistic on your hair — before you pay, not after.
- If something goes wrong, tell us within **7 days** so we can put it right. We would far rather fix it than argue about it.

## Reviews and content you submit

- Reviews are only published from appointments that actually happened. We moderate for honesty, not for sentiment.
- If you upload reference images or send us photos, you are giving us permission to use them **for your appointment and our internal records only**. We will not publish or use them in marketing without asking you first.
- Please do not upload content that is not yours, or that depicts anyone without their consent.

## Intellectual property

The Unisex Hair Studio name, wordmark, site design, photography and written content are our property. Product names and brand names belong to their respective owners.

## Liability

- We are responsible for doing our work with reasonable care and skill. That is the standard we hold ourselves to.
- We are not liable for indirect or consequential losses — for example, a missed event caused by a delay you did not tell us about, or lost income.
- Nothing in these terms limits your rights under Nigerian consumer law, or excludes liability for death, personal injury or fraud.

## Changes

We may update these terms. The date at the top shows when they last changed, and material changes will be announced on the site and, where they affect you directly, by message.

## Getting in touch

Questions about these terms, the website or anything else: [${site.contact.email}](mailto:${site.contact.email}), or WhatsApp the studio on **${site.contact.phone}**. We answer during opening hours.`,
  },
}

const KNOWN_SLUGS = Object.keys(BUILT_IN)

function metaFor(slug: string) {
  return BUILT_IN[slug] ?? null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PolicyPage() {
  const { slug = '' } = useParams<{ slug: string }>()

  const pageQuery = useQuery({
    queryKey: qk.page(slug),
    queryFn: () => getPage(slug),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  })

  const page = pageQuery.data ?? null
  const fallback = metaFor(slug)

  // The CMS wins; the built-in copy is the safety net. Both end up as markdown.
  const policy = useMemo(() => {
    if (page?.body_md?.trim()) {
      return {
        title: page.title,
        eyebrow: page.eyebrow ?? 'Legal',
        excerpt: page.excerpt ?? '',
        markdown: page.body_md,
        updated: page.published_at ? formatDate(page.published_at) : 'Published in full',
      }
    }
    if (fallback) {
      return {
        title: fallback.title,
        eyebrow: fallback.eyebrow,
        excerpt: fallback.excerpt,
        markdown: fallback.body,
        updated: `Last updated ${fallback.updated}`,
      }
    }
    return null
  }, [page, fallback])

  const jsonLd = useMemo(
    () =>
      policy
        ? [
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: policy.title, path: `/policies/${slug}` },
            ]),
          ]
        : [],
    [policy, slug],
  )

  useSeo({
    title: policy?.title ?? 'Policy not found',
    description:
      policy?.excerpt ??
      'This policy is not published yet. Browse our other policies or get in touch and we will send you a copy.',
    path: `/policies/${slug}`,
    noindex: !policy,
    jsonLd,
  })

  // ------------------------------------------------------------------
  // Unknown slug, or a CMS page that no longer exists
  // ------------------------------------------------------------------
  if (!pageQuery.isLoading && !policy) {
    return (
      <>
        <PageHeader
          eyebrow="Policies"
          title="We could not find that policy"
          description="The page you asked for has either moved or was never published. Here is everything we do have."
          breadcrumb={[
            { label: 'Policies', to: '/policies/privacy' },
            { label: 'Not found', to: `/policies/${slug}` },
          ]}
        />

        <Section tone="canvas">
          <EmptyState
            icon={<FileText aria-hidden />}
            title="No policy at this address"
            description="We keep three published policies. If you were looking for something specific — refunds, deposits, delivery, privacy — it is almost certainly in one of them."
            action={
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/policies/bookings">Bookings policy</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">Ask us instead</Link>
                </Button>
              </div>
            }
          />

          <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
            {KNOWN_SLUGS.map((knownSlug) => {
              const entry = BUILT_IN[knownSlug]!
              return (
                <li key={knownSlug}>
                  <Card interactive className="h-full p-5">
                    <Link to={`/policies/${knownSlug}`} className="block">
                      <Badge variant="accent" size="sm">
                        {entry.eyebrow}
                      </Badge>
                      <h2 className="mt-3 font-display text-base font-semibold text-ink">
                        {entry.title}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{entry.excerpt}</p>
                    </Link>
                  </Card>
                </li>
              )
            })}
          </ul>

          {pageQuery.isError && (
            <div className="mx-auto mt-8 max-w-4xl">
              <Alert
                variant="danger"
                title="We could not reach the content database"
                action={
                  <Button variant="outline" size="sm" onClick={() => pageQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(pageQuery.error)}
              </Alert>
            </div>
          )}
        </Section>
      </>
    )
  }

  // ------------------------------------------------------------------
  // Real policy
  // ------------------------------------------------------------------
  return (
    <>
      <PageHeader
        eyebrow={policy?.eyebrow ?? 'Policy'}
        title={policy?.title ?? 'Policy'}
        description={policy?.excerpt}
        breadcrumb={[
          { label: 'Policies', to: '/policies/privacy' },
          { label: policy?.title ?? '', to: `/policies/${slug}` },
        ]}
        action={
          <Badge variant="outline" size="lg" className="shrink-0">
            <ShieldCheck className="size-3.5" aria-hidden />
            {policy?.updated ?? 'Published in full'}
          </Badge>
        }
      >
        <nav aria-label="Other policies">
          <ul className="flex flex-wrap gap-2">
            {KNOWN_SLUGS.map((knownSlug) => {
              const entry = BUILT_IN[knownSlug]!
              const isCurrent = knownSlug === slug
              return (
                <li key={knownSlug}>
                  <Link
                    to={`/policies/${knownSlug}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={
                      isCurrent
                        ? 'inline-flex h-11 items-center rounded-pill border border-ink bg-ink px-4 text-sm text-canvas'
                        : 'inline-flex h-11 items-center rounded-pill border border-line-strong bg-surface px-4 text-sm text-ink-soft transition-colors hover:border-ink hover:bg-sand'
                    }
                  >
                    {entry.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </PageHeader>

      <Section tone="canvas">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
          <article className="min-w-0 max-w-2xl">
            {pageQuery.isLoading && (
              <div className="space-y-4">
                <ContentSkeleton lines={12} />
              </div>
            )}

            {pageQuery.isError && (
              <Alert
                variant="danger"
                title="We could not reach the content database"
                action={
                  <Button variant="outline" size="sm" onClick={() => pageQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(pageQuery.error)} You can still read the published copy below.
              </Alert>
            )}

            {!pageQuery.isLoading && policy && (
              <div className="prose-editorial text-[0.9375rem]">
                <Markdown source={policy.markdown} />
              </div>
            )}
          </article>

          <aside className="space-y-5">
            <Card className="p-6">
              <h2 className="font-display text-base font-semibold text-ink">
                Questions about this policy?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We would rather explain it than have you guess. WhatsApp is fastest, and
                a human reads every message during opening hours.
              </p>
              <div className="mt-5 space-y-2.5">
                <Button asChild variant="accent" fullWidth>
                  <a
                    href={whatsappLink(
                      `Hi! I have a question about your ${policy?.title.toLowerCase() ?? 'policy'}.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle aria-hidden />
                    WhatsApp the studio
                  </a>
                </Button>
                <Button asChild variant="outline" fullWidth>
                  <a href={`tel:${site.contact.phone.replace(/\s/g, '')}`}>
                    <Phone aria-hidden />
                    {site.contact.phone}
                  </a>
                </Button>
                <Button asChild variant="ghost" fullWidth>
                  <a href={`mailto:${site.contact.email}`}>
                    <Mail aria-hidden />
                    {site.contact.email}
                  </a>
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-base font-semibold text-ink">All policies</h2>
              <ul className="mt-4 space-y-2.5">
                {KNOWN_SLUGS.map((knownSlug) => {
                  const entry = BUILT_IN[knownSlug]!
                  return (
                    <li key={knownSlug}>
                      <Link
                        to={`/policies/${knownSlug}`}
                        className="text-sm text-muted underline-offset-4 transition-colors hover:text-bronze-dark hover:underline"
                      >
                        {entry.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Minimal markdown renderer
//
// Deliberately local and tiny: headings, paragraphs, unordered/ordered lists,
// **bold**, *italic* and [links](url). Policy bodies are authored in the CMS by
// studio staff, not end users, so there is no HTML pass-through and no need for
// a parsing dependency.
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }

function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null
  // Consecutive plain lines are one soft-wrapped paragraph, as in real markdown.
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  const flush = () => {
    flushParagraph()
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  for (const raw of source.split('\n')) {
    const line = raw.trim()
    // An indented, non-blank line continues the list item above it.
    const isContinuation = list !== null && /^\s{2,}\S/.test(raw)

    if (!line) {
      flush()
      continue
    }

    if (isContinuation && list !== null && !/^[-*+>#]/.test(line) && !/^\d+[.)]\s/.test(line)) {
      const items = list.items
      const index = items.length - 1
      items[index] = `${items[index] ?? ''} ${line}`.trim()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      // A single `#` is the page title, which the masthead already renders.
      if ((heading[1]?.length ?? 0) > 1) {
        blocks.push({ kind: 'h2', text: heading[2] ?? '' })
      }
      continue
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      flushParagraph()
      if (list?.kind !== 'ul') {
        flush()
        list = { kind: 'ul', items: [] }
      }
      list.items.push(unordered[1] ?? '')
      continue
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (list?.kind !== 'ol') {
        flush()
        list = { kind: 'ol', items: [] }
      }
      list.items.push(ordered[1] ?? '')
      continue
    }

    if (list) flush()
    paragraph.push(line)
  }

  flush()
  return blocks
}

/** Renders inline `**bold**`, `*italic*` and `[label](href)`. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }
    const token = match[0]
    const key = `${keyPrefix}-${index++}`

    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      const label = link?.[1] ?? token
      const href = link?.[2] ?? '#'
      const isInternal = href.startsWith('/')
      nodes.push(
        isInternal ? (
          <Link key={key} to={href}>
            {label}
          </Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ),
      )
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }

    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])

  return (
    <>
      {blocks.map((block, index) => {
        const key = `block-${index}`

        if (block.kind === 'h2') {
          return (
            <h2 key={key} id={slugify(block.text)} className="scroll-mt-24">
              {renderInline(block.text, key)}
            </h2>
          )
        }

        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind === 'ul' ? 'ul' : 'ol'
          return (
            <List key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </List>
          )
        }

        return <p key={key}>{renderInline(block.text, key)}</p>
      })}
    </>
  )
}
