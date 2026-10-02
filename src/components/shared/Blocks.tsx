import { Link } from 'react-router-dom'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { site, DAY_SHORT } from '@/config/site'
import { whatsappLink } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  Rating,
  SectionHeading,
} from '@/components/ui'
import { Avatar, MediaFrame } from './MediaFrame'
import type { Faq, GalleryItem, Review } from '@/types'

// ---------------------------------------------------------------------------
// FAQ list
// ---------------------------------------------------------------------------
export function FaqList({
  faqs,
  className,
  columns = 1,
}: {
  faqs: Faq[]
  className?: string
  columns?: 1 | 2
}) {
  if (faqs.length === 0) return null

  return (
    <Accordion
      type="single"
      collapsible
      className={cn(
        'rounded-lg border border-line bg-surface',
        columns === 2 && 'md:columns-2 md:gap-6 md:[column-fill:_balance]',
        className,
      )}
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
  )
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------
export function TestimonialCard({
  review,
  className,
}: {
  review: Review & { author_name?: string | null; service_name?: string | null }
  className?: string
}) {
  return (
    <Card className={cn('flex h-full flex-col p-6', className)}>
      <Rating value={review.rating} size="sm" />
      <blockquote className="mt-4 flex-1">
        {review.title && (
          <p className="font-display text-base font-semibold text-ink">“{review.title}”</p>
        )}
        <p className={cn('text-sm leading-relaxed text-ink-soft', review.title && 'mt-2')}>
          {review.body}
        </p>
      </blockquote>
      <footer className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <Avatar name={review.author_name ?? 'Client'} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {review.author_name ?? 'Black Chery Unisex Studio client'}
          </p>
          {review.service_name && (
            <p className="truncate text-xs text-muted">{review.service_name}</p>
          )}
        </div>
      </footer>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Before / after comparison
// ---------------------------------------------------------------------------
export function BeforeAfter({
  item,
  className,
}: {
  item: GalleryItem
  className?: string
}) {
  const hasBoth = Boolean(item.before_image_url && item.after_image_url)

  if (!hasBoth) {
    return (
      <figure className={cn('group', className)}>
        <MediaFrame
          src={item.image_url}
          alt={item.alt_text ?? item.title ?? 'Salon work'}
          seed={item.slug ?? item.id}
          aspect="4/5"
          rounded
          imgClassName="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {item.title && (
          <figcaption className="mt-3 text-sm text-ink">{item.title}</figcaption>
        )}
      </figure>
    )
  }

  return (
    <figure className={cn('group', className)}>
      <div className="relative overflow-hidden rounded-lg">
        <MediaFrame
          src={item.after_image_url}
          alt={`After — ${item.alt_text ?? item.title ?? 'salon result'}`}
          seed={`${item.slug ?? item.id}-after`}
          aspect="4/5"
          imgClassName="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <Badge variant="onImage" size="sm" className="absolute right-3 top-3">
          After
        </Badge>
      </div>
      {item.title && <figcaption className="mt-3 text-sm text-ink">{item.title}</figcaption>}
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Opening hours + contact card
// ---------------------------------------------------------------------------
export function OpeningHoursCard({ className }: { className?: string }) {
  return (
    <Card className={cn('p-6', className)}>
      <h3 className="font-display text-base font-semibold text-ink">Opening hours</h3>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Weekly opening hours</caption>
        <tbody>
          {site.hours.periods.map((period) => (
            <tr key={period.days.join()} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                {period.closed
                  ? 'Sunday'
                  : period.days.length === 1
                    ? DAY_SHORT[period.days[0]!]
                    : `${DAY_SHORT[period.days[0]!]}–${DAY_SHORT[period.days[period.days.length - 1]!]}`}
              </th>
              <td className="py-2 text-right tabular-nums text-ink">
                {period.closed ? 'Closed' : `${formatTime(period.opens)} – ${formatTime(period.closes)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function ContactCard({ className }: { className?: string }) {
  return (
    <Card className={cn('p-6', className)}>
      <h3 className="font-display text-base font-semibold text-ink">Get in touch</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The fastest way to reach us is WhatsApp. We usually reply within a couple of hours during
        opening times.
      </p>

      <div className="mt-5 space-y-3">
        <a
          href={whatsappLink("Hi! I'd like to ask about an appointment at Black Chery Unisex Studio.")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
        >
          <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
          <span>WhatsApp us</span>
          <span className="ml-auto text-xs text-muted">{site.contact.phone}</span>
        </a>

        <a
          href={`tel:${site.contact.phone.replace(/\s/g, '')}`}
          className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
        >
          <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
          <span>{site.contact.phone}</span>
        </a>

        <a
          href={`mailto:${site.contact.email}`}
          className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
        >
          <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
          <span className="truncate">{site.contact.email}</span>
        </a>

        <p className="flex items-start gap-3 px-0.5 py-1 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
          <span>
            {site.address.street}
            <br />
            {site.address.locality}, {site.address.region}
          </span>
        </p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Closing call to action
// ---------------------------------------------------------------------------
export function ClosingCta({
  eyebrow = 'Ready when you are',
  title = 'Book your chair in under a minute.',
  description = 'Tell us about your hair, share a reference, pick a time — your stylist walks in already knowing exactly what you want.',
  primary = { label: 'Book an Appointment', to: '/book' },
  secondary,
  className,
}: {
  eyebrow?: string
  title?: string
  description?: string
  primary?: { label: string; to: string }
  secondary?: { label: string; to: string }
  className?: string
}) {
  return (
    <section className={cn('border-t border-line bg-canvas section-y', className)}>
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="eyebrow mb-3">{eyebrow}</p>
            <h2 className="display-section">{title}</h2>
            {description && <p className="lede mt-4">{description}</p>}
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button asChild size="xl">
              <Link to={primary.to}>{primary.label}</Link>
            </Button>
            {secondary && (
              <Button asChild variant="outline" size="xl">
                <Link to={secondary.to}>{secondary.label}</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section shell with the standard editorial rhythm
// ---------------------------------------------------------------------------
export function Section({
  children,
  className,
  tone = 'canvas',
}: {
  children: React.ReactNode
  className?: string
  tone?: 'canvas' | 'sand' | 'ink'
}) {
  const toneClass = {
    canvas: 'bg-canvas',
    sand: 'bg-sand',
    ink: 'bg-ink text-canvas',
  }[tone]

  return (
    <section className={cn('section-y', toneClass, className)}>
      <div className="container-page">{children}</div>
    </section>
  )
}

/** 24-hour clock from a "HH:MM" string. */
function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours! >= 12 ? 'pm' : 'am'
  const hour12 = hours! % 12 === 0 ? 12 : hours! % 12
  return `${hour12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${suffix}`
}

export { SectionHeading }
