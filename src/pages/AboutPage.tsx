import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, Heart, MapPin, MessageCircle, Scissors, Users } from 'lucide-react'

import { getPage, getStylists, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { Alert, Badge, Button, Card, SectionHeading, Stat } from '@/components/ui'
import { PageHeader, StylistCard } from '@/components/shared/Cards'
import { ClosingCta, OpeningHoursCard, Section } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { CardGridSkeleton, ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, organizationSchema, useSeo } from '@/components/seo/Seo'

// ---------------------------------------------------------------------------
// Fallback copy — used whenever the CMS has no published `about` page yet.
// ---------------------------------------------------------------------------

const STORY = [
  'Unisex Hair Studio started in 2014 with two chairs, one braids artist and a stubborn belief: that the same quality of work should be available to everyone, not split into a "men\'s" and a "women\'s" side of the salon.',
  'We grew into a full studio on Adeola Odeku because our clients kept asking for two things at once — a braids artist who understood their texture, and a colourist who could read a formula. Nobody else in the neighbourhood was doing both, so we built the team ourselves.',
  'Today we are a team of braids artists, loc specialists, colourists and cutters who work the same diary, share the same price list and eat lunch at the same table. What has not changed is the rule we started with: understand the hair before you touch it, and write down what you did so the next appointment is better than the last one.',
] as const

const VALUES = [
  {
    title: 'Everyone gets the same chair',
    body: 'Gender is not a price bracket. Tapers, locs sculpting, waist-length knotless braids and full colour all sit in the same studio with the same standards.',
  },
  {
    title: 'The brief comes first',
    body: 'Every booking opens a requirement form. Your stylist reads it before you arrive, so the consultation starts at the third minute instead of the tenth.',
  },
  {
    title: 'Honest advice, even when it costs us',
    body: 'If your hair cannot take the look in your reference, we say so — and show you what will work instead. We would rather change the plan than disappoint you in the chair.',
  },
  {
    title: 'Craft over throughput',
    body: 'We cap how much work one stylist takes in a day. A good result takes the time it takes, and we would rather turn a booking down than rush a client.',
  },
  {
    title: 'Grow our own',
    body: 'Most of our senior artists started here as apprentices. We fund the training, the certifications and the time it takes to get genuinely good.',
  },
  {
    title: 'Care after the chair',
    body: 'You leave with a written aftercare plan and a direct line to your stylist. The result is only as good as the eight weeks that follow it.',
  },
] as const

const PILLARS = [
  { value: '2014', label: 'Founded', hint: 'Two chairs, one braids artist' },
  { value: '12+', label: 'Stylists on the floor', hint: 'Braids, locs, colour, cutting' },
  { value: '4.9', label: 'Average client rating', hint: 'From verified appointments' },
  { value: '20k+', label: 'Appointments served', hint: 'Across Lagos and beyond' },
] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AboutPage() {
  const pageQuery = useQuery({
    queryKey: qk.page('about'),
    queryFn: () => getPage('about'),
    staleTime: 10 * 60_000,
  })

  const stylistsQuery = useQuery({
    queryKey: qk.staff(),
    queryFn: getStylists,
    staleTime: 10 * 60_000,
  })

  const page = pageQuery.data ?? null
  const paragraphs = useMemo(() => {
    const body = page?.body_md?.trim()
    if (body) {
      // The CMS body is plain prose for this page; blank lines separate paragraphs.
      return body
        .split(/\n{2,}/)
        .map((block) => block.replace(/^#+\s*/, '').trim())
        .filter(Boolean)
    }
    return [...STORY]
  }, [page])

  const jsonLd = useMemo(
    () => [
      organizationSchema(),
      breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'About', path: '/about' },
      ]),
    ],
    [],
  )

  useSeo({
    title: page?.meta_title ?? 'About the studio',
    description:
      page?.meta_description ??
      page?.excerpt ??
      'Unisex Hair Studio is a premium unisex salon on Adeola Odeku, Victoria Island. Meet the team behind our braids, locs, colour and cutting.',
    path: '/about',
    image: page?.hero_image_url,
    jsonLd,
  })

  return (
    <>
      <PageHeader
        eyebrow="About the studio"
        title="Two chairs, one stubborn idea, twelve years on"
        description="We are a unisex salon in the heart of Victoria Island, built for people who want good hair work without the guessing, the upsell and the gender rules."
        breadcrumb={[{ label: 'About', to: '/about' }]}
        action={
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button asChild size="xl">
              <Link to="/book">Book an Appointment</Link>
            </Button>
            <Button asChild variant="outline" size="xl">
              <Link to="/gallery">See our work</Link>
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------------
          Story
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Our story"
              title="Built for hair that does not fit the standard template"
            />

            <div className="mt-7 max-w-2xl">
              {pageQuery.isLoading && <ContentSkeleton lines={8} />}

              {pageQuery.isError && (
                <Alert
                  variant="danger"
                  title="We could not load the studio story"
                  action={
                    <Button variant="outline" size="sm" onClick={() => pageQuery.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  {errorMessage(pageQuery.error)}
                </Alert>
              )}

              {!pageQuery.isLoading && !pageQuery.isError && (
                <div className="space-y-5">
                  {paragraphs.map((paragraph, index) => (
                    <p
                      key={paragraph.slice(0, 24)}
                      className={
                        index === 0
                          ? 'text-lg leading-relaxed text-ink-soft'
                          : 'text-base leading-relaxed text-muted'
                      }
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <dl className="mt-9 grid max-w-2xl gap-6 border-t border-line pt-8 sm:grid-cols-2">
              {[
                { term: 'Where we are', detail: `${site.address.street}, ${site.address.locality}` },
                { term: 'Who we serve', detail: 'Everyone — every texture, every length, every gender' },
                { term: 'How you book', detail: 'Online, in under a minute, up to 60 days ahead' },
                { term: 'How you pay', detail: 'Card, bank transfer or USSD via Paystack' },
              ].map((item) => (
                <div key={item.term}>
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                    {item.term}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-ink">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-4">
            <MediaFrame
              className="rounded-lg"
              src={page?.hero_image_url}
              alt="The Unisex Hair Studio floor on Adeola Odeku, with styling chairs, mirrors and warm afternoon light"
              seed="about-studio-floor"
              aspect="4/5"
              priority
            />
            <div className="grid grid-cols-2 gap-4">
              <MediaFrame
                className="rounded-lg"
                src={null}
                alt="A stylist parting a client's hair for a knotless braid install"
                seed="about-braids-session"
                aspect="1/1"
              />
              <MediaFrame
                className="rounded-lg"
                src={null}
                alt="Shelves of hair care products and tools in the studio retail corner"
                seed="about-retail-shelf"
                aspect="1/1"
              />
            </div>

            <Card className="p-5">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4.5 shrink-0 text-bronze" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Come and see the space</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {site.address.street}, {site.address.locality}, {site.address.region}. Free
                    parking is limited, so the BRT stop at Victoria Island is the easier option.
                  </p>
                  <Button asChild variant="link" size="sm" className="mt-2.5">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(
                        `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Google Maps
                      <ArrowRight aria-hidden />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          Stats strip
      ------------------------------------------------------------------ */}
      <section className="border-y border-line bg-sand py-12" aria-label="Studio facts">
        <div className="container-page">
          <h2 className="sr-only">Unisex Hair Studio by the numbers</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => (
              <Stat
                key={pillar.label}
                label={pillar.label}
                value={pillar.value}
                hint={pillar.hint}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          Values
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="What we stand on"
          title="Six things we will not trade away"
          description="These are not posters on a wall. They are the reasons we say no to bookings, cap diaries and turn down work we cannot do properly."
        />

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((value, index) => (
            <li key={value.title}>
              <Card className="h-full p-6">
                <span className="font-display text-sm text-bronze-dark" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-ink">{value.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{value.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------------------------
          Team
      ------------------------------------------------------------------ */}
      <Section tone="sand" className="scroll-mt-24">
        <div id="team" className="scroll-mt-24">
          <SectionHeading
            eyebrow="The team"
            title="The people who will be working on your hair"
            description="Every stylist here owns their chair and their clients. Browse the work, read what they specialise in, and book the one whose results you recognise."
            action={
              <Button asChild variant="outline" size="lg">
                <Link to="/book">
                  <CalendarDays aria-hidden />
                  Book a stylist
                </Link>
              </Button>
            }
          />

          <div className="mt-10">
            {stylistsQuery.isLoading && <CardGridSkeleton count={6} />}

            {stylistsQuery.isError && (
              <Alert
                variant="danger"
                title="We could not load the team"
                action={
                  <Button variant="outline" size="sm" onClick={() => stylistsQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(stylistsQuery.error)}
              </Alert>
            )}

            {!stylistsQuery.isLoading && !stylistsQuery.isError && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(stylistsQuery.data ?? []).map((stylist) => (
                  <StylistCard key={stylist.user_id} stylist={stylist} />
                ))}
              </div>
            )}
          </div>

          {!stylistsQuery.isLoading && !stylistsQuery.isError && (stylistsQuery.data ?? []).length === 0 && (
            <Card className="mt-10 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-bronze" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Our stylists are between appointments
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    We are updating artist profiles right now. Tell us the look you want and
                    we will match you with the right person by name.
                  </p>
                </div>
              </div>
              <Button asChild size="lg" className="shrink-0">
                <Link to="/contact">
                  <MessageCircle aria-hidden />
                  Match me with a stylist
                </Link>
              </Button>
            </Card>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          Hours & visit
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-12">
          <div>
            <SectionHeading
              eyebrow="Visit us"
              title="When the chairs are free"
              description="Bookings run from 9am Monday to Saturday, with later slots on Friday and weekend. We are closed on Sundays, and on public holidays the front desk opens at noon."
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                { icon: <Scissors aria-hidden />, title: 'By appointment', body: 'Book online up to 60 days ahead for the time that suits you.' },
                { icon: <Heart aria-hidden />, title: 'Walk-ins welcome', body: 'We hold a few slots back each day for clients without a booking.' },
                { icon: <Users aria-hidden />, title: 'Groups & events', body: 'Bridal parties, shoots and corporate bookings — talk to the front desk.' },
                { icon: <MessageCircle aria-hidden />, title: 'Quick questions', body: 'WhatsApp is fastest. We reply during opening hours, usually within the hour.' },
              ].map((item) => (
                <Card key={item.title} className="p-5">
                  <span className="flex size-9 items-center justify-center rounded-full bg-sand text-bronze [&_svg]:size-4.5" aria-hidden>
                    {item.icon}
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <OpeningHoursCard />
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Badge variant="accent" size="sm">
                  Good to know
                </Badge>
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
                {[
                  'Arrive 10 minutes early so we can start on time.',
                  'Bring your reference images on your phone — we will open them together.',
                  'Come with clean, detangled hair unless your stylist told you otherwise.',
                  'Children are welcome in the studio until 5pm on weekdays.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-bronze" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" fullWidth className="mt-6">
                <Link to="/book">Book an Appointment</Link>
              </Button>
            </Card>
          </div>
        </div>
      </Section>

      <ClosingCta
        eyebrow="Come and sit with us"
        title="Whichever chair you want, we will have it ready."
        description="Bring a reference or describe the look in your own words. Either way, you will leave with hair you actually wanted."
        secondary={{ label: 'Browse the gallery', to: '/gallery' }}
      />
    </>
  )
}
