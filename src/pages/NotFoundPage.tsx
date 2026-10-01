import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Briefcase,
  CalendarDays,
  Compass,
  MessageCircle,
  Search as SearchIcon,
  Scissors,
  ShoppingBag,
  Users,
} from 'lucide-react'

import { site } from '@/config/site'
import { whatsappLink } from '@/lib/utils/format'
import { Button, Card, Input } from '@/components/ui'
import { useSeo } from '@/components/seo/Seo'

const DESTINATIONS = [
  {
    to: '/services',
    icon: Scissors,
    title: 'Services',
    body: 'Braids, locs, hair, colour and styling — with real prices and times.',
  },
  {
    to: '/book',
    icon: CalendarDays,
    title: 'Book an appointment',
    body: 'Pick a stylist and a slot from the live diary, in about a minute.',
  },
  {
    to: '/shop',
    icon: ShoppingBag,
    title: 'Shop',
    body: 'Wigs, extensions, oils and tools, delivered across Lagos.',
  },
  {
    to: '/gallery',
    icon: Compass,
    title: 'Gallery',
    body: 'Real work from the studio floor, with before-and-afters.',
  },
  {
    to: '/about',
    icon: Users,
    title: 'About the studio',
    body: 'Twelve years on Adeola Odeku, and the team behind the chairs.',
  },
  {
    to: '/careers',
    icon: Briefcase,
    title: 'Careers',
    body: 'Open roles, apprenticeships and paid training.',
  },
] as const

export default function NotFoundPage() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')

  useSeo({
    title: 'Page not found',
    description:
      'That page has moved or never existed. Search the site, or jump straight to services, booking, the shop or the gallery.',
    noindex: true,
  })

  const onSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = term.trim()
    if (query.length < 2) return
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <section className="bg-canvas section-y">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="eyebrow mb-4">Error 404</p>
          <h1 className="display-hero">
            This page has
            <br />
            left the chair.
          </h1>
          <p className="lede mt-6">
            The link you followed is broken, the page has moved, or somebody typed it
            from memory. Nothing is lost — search below, or pick up the tour from one
            of these.
          </p>

          <form onSubmit={onSearch} role="search" className="mt-8 max-w-xl">
            <label htmlFor="notfound-search" className="sr-only">
              Search the site
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                id="notfound-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search for a service or product"
                autoComplete="off"
                enterKeyHint="search"
                className="h-12 flex-1"
                leadingIcon={<SearchIcon aria-hidden />}
              />
              <Button type="submit" size="lg" disabled={term.trim().length < 2}>
                Search
              </Button>
            </div>
          </form>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="accent" size="lg">
              <a
                href={whatsappLink(
                  "Hi! I tried to visit a page on your website and it did not work. Can you help?",
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden />
                Tell us on WhatsApp
              </a>
            </Button>
            <p className="text-sm text-muted">
              or email{' '}
              <a
                href={`mailto:${site.contact.email}`}
                className="font-medium text-bronze-dark underline underline-offset-4"
              >
                {site.contact.email}
              </a>
            </p>
          </div>
        </div>

        <nav aria-label="Main destinations" className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-ink">Where would you like to go?</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map((destination) => {
              const Icon = destination.icon
              return (
                <li key={destination.to}>
                  <Card interactive className="group h-full">
                    <Link to={destination.to} className="block h-full p-6">
                      <span
                        className="flex size-10 items-center justify-center rounded-full bg-sand text-bronze transition-colors group-hover:bg-bronze group-hover:text-white [&_svg]:size-4.5"
                        aria-hidden
                      >
                        <Icon />
                      </span>
                      <h3 className="mt-4 font-display text-base font-semibold text-ink transition-colors group-hover:text-bronze-dark">
                        {destination.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{destination.body}</p>
                    </Link>
                  </Card>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="mt-12 rounded-lg border border-line bg-sand/60 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Looking for a policy?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Bookings, privacy and terms are all published in full — no email required.
            </p>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
            {[
              { to: '/policies/bookings', label: 'Bookings' },
              { to: '/policies/privacy', label: 'Privacy' },
              { to: '/policies/terms', label: 'Terms' },
            ].map((policy) => (
              <li key={policy.to}>
                <Link
                  to={policy.to}
                  className="inline-flex h-11 items-center rounded-pill border border-line-strong bg-surface px-4 text-sm text-ink-soft transition-colors hover:border-ink hover:bg-canvas"
                >
                  {policy.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
