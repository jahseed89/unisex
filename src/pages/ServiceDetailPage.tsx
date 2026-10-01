import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Clock,
  Info,
  MapPin,
  Scissors,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import {
  errorMessage,
  getFaqs,
  getServiceBySlug,
  getServiceVariants,
  getStylists,
  getStylistsForService,
  qk,
} from '@/lib/api'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  RadioCards,
  Rating,
  SectionHeading,
} from '@/components/ui'
import { CardGridSkeleton, ContentSkeleton, HeroSkeleton } from '@/components/layout/RouteLoader'
import { PageHeader, formatDuration } from '@/components/shared/Cards'
import { ClosingCta, Section } from '@/components/shared/Blocks'
import { Avatar, MediaFrame } from '@/components/shared/MediaFrame'
import { breadcrumbSchema, serviceSchema, useSeo } from '@/components/seo/Seo'
import { analytics } from '@/lib/analytics'
import { cn } from '@/lib/utils/cn'
import { formatNaira } from '@/lib/utils/format'
import { site } from '@/config/site'
import type { ServiceVariant } from '@/types'

/**
 * A single service.
 *
 * The variant selector is the interesting part: braids, locs and extensions are
 * priced by length, so the page lets the customer pin down the size before they
 * ever reach the booking flow and carries that choice through in the CTA.
 */
export default function ServiceDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [variantId, setVariantId] = useState('')
  const trackedSlug = useRef<string | null>(null)

  const {
    data: service,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.service(slug),
    queryFn: () => getServiceBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  })

  const {
    data: variants = [],
    isLoading: variantsLoading,
    error: variantsError,
  } = useQuery({
    queryKey: qk.serviceVariants(service?.id ?? ''),
    queryFn: () => getServiceVariants(service!.id),
    enabled: Boolean(service?.id),
    staleTime: 10 * 60_000,
  })

  // One view event per service, not one per render.
  useEffect(() => {
    if (!service || trackedSlug.current === service.slug) return
    trackedSlug.current = service.slug
    analytics.viewService(service.slug, service.name, service.price_from)
  }, [service])

  const activeVariant: ServiceVariant | undefined = useMemo(() => {
    if (variants.length === 0) return undefined
    return variants.find((variant) => variant.id === variantId) ?? variants[0]
  }, [variants, variantId])

  const priceFrom = activeVariant?.price ?? service?.price_from ?? 0
  // The variant narrows the price, but the range is still the honest headline for
  // a length-driven service — so the top of the range never disappears.
  const priceCeiling = service?.price_to ?? null
  const duration = activeVariant?.duration_minutes ?? service?.duration_minutes ?? 0

  const jsonLd = useMemo(() => {
    if (!service) return undefined
    return [
      serviceSchema({
        name: service.name,
        description: service.summary,
        slug: service.slug,
        priceFrom: service.price_from,
        priceTo: service.price_to,
        durationMinutes: service.duration_minutes,
        image: service.image_url,
      }),
      breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Services', path: '/services' },
        { name: service.name, path: `/services/${service.slug}` },
      ]),
    ]
  }, [service])

  useSeo({
    title: service ? `${service.name} — ${service.category_name ?? 'Salon service'}` : 'Service',
    description: service?.summary ?? 'Hair, braids, locs, colour and styling at Unisex Hair Studio, Lagos.',
    path: service ? `/services/${service.slug}` : '/services',
    image: service?.image_url ?? undefined,
    type: 'website',
    jsonLd,
  })

  if (isLoading) return <HeroSkeleton />

  if (error) {
    return (
      <div className="container-page section-y">
        <Alert
          variant="danger"
          title="We could not load this service"
          action={
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/services">Back to all services</Link>
        </Button>
      </div>
    )
  }

  if (!service) {
    return (
      <div className="container-page section-y">
        <EmptyState
          icon={<Scissors aria-hidden />}
          title="That service is no longer listed"
          description="It may have been renamed or retired. The full menu is one click away."
          action={
            <Button asChild size="lg">
              <Link to="/services">Browse all services</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const bookHref = activeVariant
    ? `/book?service=${encodeURIComponent(service.slug)}&variant=${activeVariant.id}`
    : `/book?service=${encodeURIComponent(service.slug)}`

  return (
    <>
      <PageHeader
        eyebrow={service.category_name ?? 'Service'}
        title={service.name}
        description={service.summary}
        breadcrumb={[{ label: 'Services', to: '/services' }]}
        action={
          <div className="flex flex-col items-start gap-1 lg:items-end">
            <p className="font-display text-2xl font-semibold text-ink">
              {formatNaira(priceFrom)}
            </p>
            {priceCeiling && priceCeiling !== priceFrom && (
              <p className="text-sm text-muted">up to {formatNaira(priceCeiling)}</p>
            )}
            <p className="text-sm text-muted">{formatDuration(duration)}</p>
          </div>
        }
      />

      {/* Hero: photography on the right on desktop, facts underneath on mobile */}
      <div className="container-page pt-10 md:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-12">
          <div className="order-2 lg:order-1">
            <div className="flex flex-wrap items-center gap-3">
              {service.badge && <Badge variant="accent">{service.badge}</Badge>}
              {service.requires_requirement && <Badge variant="default">Requirements form</Badge>}
              {service.requires_consultation && (
                <Badge variant="default">Consultation first</Badge>
              )}
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Clock className="size-4 text-bronze" aria-hidden />
                {formatDuration(duration)}
              </span>
              {service.rating_count > 0 && (
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Rating value={service.rating_avg} size="sm" showValue />
                </span>
              )}
            </div>

            {service.description ? (
              <div className="prose-editorial mt-7 text-[0.9375rem]">
                {renderMarkdown(service.description)}
              </div>
            ) : (
              <div className="mt-7">
                <ContentSkeleton lines={4} />
              </div>
            )}

            {service.includes.length > 0 && (
              <BulletList
                title="What is included"
                items={service.includes}
                icon={<Check className="mt-0.5 size-4 text-sage" aria-hidden />}
              />
            )}

            {service.excludes.length > 0 && (
              <BulletList
                title="Not included"
                items={service.excludes}
                muted
              />
            )}

            {service.aftercare.length > 0 && (
              <BulletList
                title="Aftercare advice"
                items={service.aftercare}
                icon={<Sparkles className="mt-0.5 size-4 text-bronze" aria-hidden />}
              />
            )}
          </div>

          <div className="order-1 lg:order-2">
            <MediaFrame
              src={service.image_url}
              alt={`${service.name} at Unisex Hair Studio`}
              seed={service.slug}
              aspect="4/5"
              priority
              rounded
              className="shadow-sm"
            />
          </div>
        </div>
      </div>

      <Section tone="sand">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-12">
          <div className="min-w-0 space-y-12">
            {/* Variants — length-driven services price differently */}
            <section aria-label="Service size options">
              <SectionHeading as="h2" title="Choose your size" eyebrow="Options" />

              {variantsLoading ? (
                <div className="mt-6">
                  <ContentSkeleton lines={3} />
                </div>
              ) : variantsError ? (
                <Alert
                  variant="warning"
                  title="Options unavailable"
                  className="mt-6"
                  action={
                    <Button size="sm" variant="outline" onClick={() => void refetch()}>
                      Retry
                    </Button>
                  }
                >
                  {errorMessage(variantsError, 'We could not load the options for this service.')}
                </Alert>
              ) : variants.length === 0 ? (
                <p className="mt-5 text-sm leading-relaxed text-muted">
                  This service is priced as a single appointment. The final price is confirmed at
                  your consultation, before any work starts.
                </p>
              ) : (
                <>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                    Price and time both move with the size you pick. Pick the closest match — your
                    stylist fine-tunes it after your consultation.
                  </p>
                  <RadioCards
                    name="service-variant"
                    aria-label="Service size"
                    className="mt-6 max-w-2xl"
                    columns={2}
                    value={activeVariant?.id}
                    onChange={setVariantId}
                    options={variants.map((variant) => ({
                      value: variant.id,
                      label: variant.label,
                      description: [
                        formatNaira(variant.price),
                        formatDuration(variant.duration_minutes),
                        variant.description,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    }))}
                  />
                </>
              )}
            </section>

            <Divider />

            <StylistPanel serviceId={service.id} serviceSlug={service.slug} />
          </div>

          {/* Sticky-ish conversion panel */}
          <aside className="lg:sticky lg:top-24">
            <Card className="p-6 shadow-sm">
              <p className="eyebrow">From</p>
              <p className="mt-2 font-display text-3xl font-semibold text-ink">
                {formatNaira(priceFrom)}
              </p>
              {priceCeiling && priceCeiling !== priceFrom && (
                <p className="mt-1 text-sm text-muted">
                  Up to {formatNaira(priceCeiling)} depending on length and density
                </p>
              )}
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Clock className="size-4 text-bronze" aria-hidden />
                {formatDuration(duration)}
              </p>

              <Divider className="my-5" />

              <Button asChild variant="accent" size="xl" fullWidth>
                <Link to={bookHref}>
                  Book this service
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" fullWidth className="mt-2.5">
                <Link to="/shop?kind=extension">Buy the hair we use</Link>
              </Button>

              <ul className="mt-6 space-y-2.5 text-sm text-muted">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden />
                  Free to reschedule up to {site.policy.cancellationWindowHours} hours before
                </li>
                <li className="flex items-start gap-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  Final price is agreed before we start — no surprises on the day
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  {site.address.street}, {site.address.locality}
                </li>
              </ul>

              {service.gender_restriction && (
                <p className="mt-5 rounded-md border border-warning/25 bg-warning/[0.07] p-3 text-xs leading-relaxed text-ink-soft">
                  This service is currently limited to{' '}
                  <strong className="font-semibold">{service.gender_restriction}</strong> clients.
                  Message us on WhatsApp and we will find you the right chair.
                </p>
              )}
            </Card>
          </aside>
        </div>
      </Section>

      <BookingFaqs />
      <ClosingCta />
    </>
  )
}

// ---------------------------------------------------------------------------
// Stylists who perform this service
// ---------------------------------------------------------------------------

function StylistPanel({ serviceId, serviceSlug }: { serviceId: string; serviceSlug: string }) {
  const { data: staffIds = [], isLoading: idsLoading } = useQuery({
    queryKey: qk.staffServices(serviceId),
    queryFn: () => getStylistsForService(serviceId),
    enabled: Boolean(serviceId),
    staleTime: 10 * 60_000,
  })

  const { data: allStylists = [], isLoading: staffLoading } = useQuery({
    queryKey: qk.staff(),
    queryFn: getStylists,
    staleTime: 10 * 60_000,
  })

  const stylists = useMemo(() => {
    if (staffIds.length === 0) return allStylists
    const allowed = new Set(staffIds)
    return allStylists.filter((stylist) => allowed.has(stylist.user_id))
  }, [allStylists, staffIds])

  const loading = idsLoading || staffLoading

  return (
    <section aria-label="Stylists who perform this service">
      <SectionHeading
        as="h2"
        title="Who will be doing it"
        eyebrow="The team"
        description="Pick a name when you book, or let us take the earliest chair that fits."
      />

      {loading ? (
        <CardGridSkeleton count={3} className="mt-7" />
      ) : stylists.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          We do not publish individual availability, but a stylist is always assigned to your
          appointment.
        </p>
      ) : (
        <>
          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stylists.slice(0, 6).map((stylist) => (
              <li
                key={stylist.user_id}
                className="flex items-center gap-3.5 rounded-lg border border-line bg-surface p-4"
              >
                <Avatar src={stylist.photo_url} name={stylist.full_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[0.9375rem] font-semibold text-ink">
                    {stylist.full_name}
                  </p>
                  {stylist.title && (
                    <p className="truncate text-xs text-bronze-dark">{stylist.title}</p>
                  )}
                  {stylist.rating_count > 0 && (
                    <Rating
                      value={stylist.rating_avg}
                      size="sm"
                      showValue
                      className="mt-1.5"
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button asChild variant="link" size="md" className="mt-4">
            <Link to={`/book?service=${encodeURIComponent(serviceSlug)}`}>
              Choose a stylist when you book <ArrowRight aria-hidden />
            </Link>
          </Button>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Booking FAQs
// ---------------------------------------------------------------------------

function BookingFaqs() {
  const { data: faqs = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.faqs(),
    queryFn: () => getFaqs('booking'),
    staleTime: 30 * 60_000,
  })

  if (isLoading) {
    return (
      <Section tone="canvas">
        <SectionHeading as="h2" title="Booking questions" eyebrow="Good to know" />
        <div className="mt-7">
          <ContentSkeleton lines={5} />
        </div>
      </Section>
    )
  }

  if (error) {
    return (
      <Section tone="canvas">
        <Alert
          variant="danger"
          title="We could not load the FAQs"
          action={
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      </Section>
    )
  }

  if (faqs.length === 0) return null

  // NOTE: `FaqList` in components/shared/Blocks passes the question as a `title`
  // prop to `AccordionItem`, which Radix renders as an HTML tooltip attribute
  // rather than a trigger — so no question header appears. Rendering the
  // accordion here keeps this page correct; the shared component should be fixed
  // to wrap the title in `AccordionTrigger`.
  return (
    <Section tone="canvas">
      <SectionHeading
        as="h2"
        title="Before you book"
        eyebrow="Good to know"
        description="Cancellations, deposits and what happens if you are running late."
      />
      <Accordion
        type="single"
        collapsible
        className="mt-8 max-w-3xl rounded-lg border border-line bg-surface"
      >
        {faqs.map((faq) => (
          <AccordionItem key={faq.id} value={faq.id}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm leading-relaxed text-muted">{faq.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function BulletList({
  title,
  items,
  icon,
  muted = false,
}: {
  title: string
  items: string[]
  icon?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="mt-9">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bronze-dark">
        {title}
      </h3>
      <ul className={cn('mt-4 space-y-2.5', muted ? 'text-muted' : 'text-ink-soft')}>
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed">
            {icon ?? <span className="mt-2 size-1 shrink-0 rounded-full bg-line-strong" aria-hidden />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minimal markdown renderer
//
// Service descriptions are authored as markdown in the CMS. Rather than pull in
// a parser, we handle the subset the studio actually writes: headings, lists,
// paragraphs, block quotes and inline emphasis/links. Everything is built as
// React nodes, so nothing is ever passed through `dangerouslySetInnerHTML`.
// ---------------------------------------------------------------------------

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g

function renderInline(text: string, key: string): React.ReactNode[] {
  // A fresh regex per call: the pattern is global, and sharing `lastIndex`
  // between nested calls (bold inside a link, say) makes the outer loop restart.
  const pattern = new RegExp(INLINE_PATTERN.source, 'g')
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    nodes.push(renderToken(match[0], `${key}-${match.index}`))
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function renderToken(token: string, key: string): React.ReactNode {
  const inner = token.slice(2, -2)
  const single = token.slice(1, -1)

  if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
    return <strong key={key}>{renderInline(inner, key)}</strong>
  }
  if (token.startsWith('`') && token.endsWith('`')) {
    return (
      <code key={key} className="rounded-sm bg-sand px-1.5 py-0.5 text-[0.875em]">
        {single}
      </code>
    )
  }

  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
  if (link) {
    const label = link[1] ?? ''
    const href = link[2] ?? ''
    const safe = /^(https?:|mailto:|tel:|\/)/i.test(href)
    if (!safe) return <span key={key}>{label}</span>
    const external = /^https?:/i.test(href)
    return (
      <a
        key={key}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {label}
      </a>
    )
  }

  return <em key={key}>{renderInline(single, key)}</em>
}

function renderMarkdown(source: string): React.ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let index = 0
  let key = 0

  const isBlockStart = (line: string) =>
    !line.trim() ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^>\s?/.test(line)

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min((heading[1] ?? '#').length, 4)
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1] ?? 'h3'
      blocks.push(
        <Tag key={`b${key++}`} className={level === 1 ? 'mt-0 text-2xl' : undefined}>
          {renderInline(heading[2] ?? '', `h${key}`)}
        </Tag>,
      )
      index += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`b${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `u${key}-${itemIndex}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`b${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `o${key}-${itemIndex}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quoted.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote key={`b${key++}`} className="border-l-2 border-bronze pl-4 italic">
          <p>{renderInline(quoted.join(' '), `q${key}`)}</p>
        </blockquote>,
      )
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && !isBlockStart(lines[index] ?? '')) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    blocks.push(<p key={`b${key++}`}>{renderInline(paragraph.join(' '), `p${key}`)}</p>)
  }

  return blocks
}
