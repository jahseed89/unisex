import { Link } from 'react-router-dom'
import { Instagram, Facebook, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { footerNav, site } from '@/config/site'
import { whatsappLink } from '@/lib/utils/format'
import { Button } from '@/components/ui'

/** Public site footer: sitemap, contact details and the WhatsApp channel. */
export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-sand">
      {/* Closing call to action */}
      <div className="border-b border-line">
        <div className="container-page section-y !py-14">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <p className="eyebrow mb-3">Ready when you are</p>
              <h2 className="display-section">
                Book your chair in under a minute.
              </h2>
              <p className="lede mt-4">
                Tell us about your hair, share a reference, pick a time — your stylist
                walks in already knowing exactly what you want.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="xl">
                <Link to="/book">Book an Appointment</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                onClick={() =>
                  window.open(
                    whatsappLink(
                      "Hi! I'd like to ask about an appointment at Unisex Hair Studio.",
                    ),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                <a href={whatsappLink('Hi! I have a question about your services.')} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  WhatsApp us
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link to="/" className="inline-flex items-baseline gap-1.5" aria-label={`${site.name} — home`}>
            <span className="font-display text-base font-semibold uppercase tracking-[0.16em] text-ink">
              {site.wordmark.primary}
            </span>
            <span className="font-display text-base font-light uppercase tracking-[0.16em] text-bronze">
              {site.wordmark.accent} {site.wordmark.suffix}
            </span>
          </Link>

          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            {site.description}
          </p>

          <address className="mt-6 space-y-3 text-sm not-italic text-muted">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(
                `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 transition-colors hover:text-ink"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
              <span>
                {site.address.street}
                <br />
                {site.address.locality}, {site.address.region}
              </span>
            </a>

            <a
              href={`tel:${site.contact.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-2.5 transition-colors hover:text-ink"
            >
              <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
              {site.contact.phone}
            </a>

            <a
              href={`mailto:${site.contact.email}`}
              className="flex items-center gap-2.5 transition-colors hover:text-ink"
            >
              <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
              {site.contact.email}
            </a>
          </address>

          <div className="mt-6 flex items-center gap-2">
            {[
              { href: site.social.instagram, label: 'Instagram', Icon: Instagram },
              { href: site.social.facebook, label: 'Facebook', Icon: Facebook },
            ].map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm border border-line bg-surface p-2.5 text-ink-soft transition-colors hover:border-ink hover:text-ink"
                aria-label={`${site.name} on ${label}`}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {footerNav.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink">
              {group.heading}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.to + link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted transition-colors hover:text-bronze-dark"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Legal */}
      <div className="border-t border-line">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted sm:flex-row">
          <p>
            © {year} {site.legalName}. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <Link to="/policies/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link to="/policies/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link to="/policies/bookings" className="transition-colors hover:text-ink">
              Bookings policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
