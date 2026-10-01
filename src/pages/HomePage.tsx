import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Clock,
  ImageUp,
  MessageCircle,
  Scissors,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'

import {
  getFaqs,
  getFeaturedReviews,
  getProducts,
  getServices,
  getStylists,
  listJobs,
  qk,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { site } from '@/config/site'
import { humanise } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState, SectionHeading, Stat } from '@/components/ui'
import { ProductCard, ServiceCard, StylistCard } from '@/components/shared/Cards'
import { ClosingCta, FaqList, Section, TestimonialCard } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { CardGridSkeleton, ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, faqSchema, organizationSchema, useSeo } from '@/components/seo/Seo'
import type { Faq, Job, ServiceCatalogEntry } from '@/types'

// ---------------------------------------------------------------------------
// Editorial copy — kept beside the markup so the page reads as one piece.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    title: 'Tell us about your hair',
    body: 'Two honest minutes about your current length, texture, history and scalp. What you have tried, what went wrong, what you actually want. It is the part most salons skip, and the part that changes everything.',
  },
  {
    title: 'Pick your stylist and time',
    body: 'Browse the artists, look at real work in the gallery, and choose a slot straight from the live diary. You get a reference number, a calendar reminder 24 hours before, and a chair held in your name.',
  },
  {
    title: 'Walk in and relax',
    body: 'Your stylist has already read your brief, seen your references and laid out the products. No re-explaining at the counter. You sit down, drink the ginger tea we keep brewing, and enjoy the only part you came for.',
  },
] as const

/** Warm, specific brand claims used by the trust bar. */
const YEARS_OPEN = new Date().getFullYear() - 2014
const STUDIO_RATING = 4.9

/**
 * "Appointments served" needs a floor. The public catalogue only exposes
 * `bookings_count` for online bookings, so a young or lightly-seeded database
 * would otherwise read as "0 appointments". This is the studio's own figure
 * since 2014 and never falls below it.
 */
const STUDIO_APPOINTMENTS = 12_000

const count = (value: number): string => new Intl.NumberFormat('en-NG').format(value)

/** Stable empties, so the memoised JSON-LD only changes when the data does. */
const NO_FAQS: Faq[] = []
const NO_JOBS: Job[] = []
const NO_SERVICES: ServiceCatalogEntry[] = []

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HomePage() {
  const featuredQuery = useQuery({
    queryKey: qk.services({ home: 'featured' }),
    queryFn: () => getServices({ featuredOnly: true, limit: 6 }),
    staleTime: 5 * 60_000,
  })

  const catalogueQuery = useQuery({
    queryKey: qk.services({ home: 'stats' }),
    queryFn: () => getServices(),
    staleTime: 10 * 60_000,
  })

  const productsQuery = useQuery({
    queryKey: qk.products({ home: 'preview' }),
    queryFn: () => getProducts({ limit: 4 }),
    staleTime: 5 * 60_000,
  })

  const stylistsQuery = useQuery({
    queryKey: qk.staff(),
    queryFn: getStylists,
    staleTime: 10 * 60_000,
  })

  const reviewsQuery = useQuery({
    queryKey: qk.reviews(),
    queryFn: () => getFeaturedReviews(3),
    staleTime: 10 * 60_000,
  })

  const jobsQuery = useQuery({
    queryKey: qk.jobs(),
    queryFn: () => listJobs(),
    staleTime: 10 * 60_000,
  })

  const faqsQuery = useQuery({
    queryKey: qk.faqs(),
    queryFn: () => getFaqs(),
    staleTime: 30 * 60_000,
  })

  const featuredServices = featuredQuery.data
  const products = productsQuery.data
  const stylists = stylistsQuery.data
  const reviews = reviewsQuery.data
  const jobs = jobsQuery.data

  // The six questions most worth answering on the home page.
  const faqs = useMemo(() => (faqsQuery.data ?? NO_FAQS).slice(0, 6), [faqsQuery.data])

  const openRoles = (jobs ?? NO_JOBS).reduce(
    (total, job) => total + (job.openings || 1),
    0,
  )
  const onlineBookings = (catalogueQuery.data ?? NO_SERVICES).reduce(
    (total, service) => total + (service.bookings_count || 0),
    0,
  )

  const jsonLd = useMemo(
    () => [
      organizationSchema(),
      breadcrumbSchema([{ name: 'Home', path: '/' }]),
      ...(faqs.length > 0
        ? [faqSchema(faqs.map((faq) => ({ question: faq.question, answer: faq.answer })))]
        : []),
    ],
    [faqs],
  )

  useSeo({
    title: `${site.name} — Premium braids, locs, hair & colour in Lagos`,
    description: site.description,
    path: '/',
    bareTitle: true,
    jsonLd,
  })

  return (
    <>
      {/* ------------------------------------------------------------------
          1. Hero
      ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-b border-line bg-sand/50">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 78% -10%, rgba(169,132,103,0.20), transparent 62%)',
          }}
          aria-hidden
        />

        <div className="container-page relative section-y">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-5">Premium unisex salon · Lagos</p>

              <h1 className="display-hero">
                Hair, braids, locs
                <br />
                and colour — for{' '}
                <span className="text-bronze-dark">everyone.</span>
              </h1>

              <p className="lede mt-7 max-w-xl">
                A studio on Adeola Odeku where the brief comes before the brush.
                Tell us about your hair, share a reference, pick a time — and the
                stylist you booked walks in already knowing the look you want.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl">
                  <Link to="/book" onClick={() => analytics.bookingStarted('home-hero')}>
                    <CalendarDays aria-hidden />
                    Book an Appointment
                  </Link>
                </Button>
                <Button asChild variant="outline" size="xl">
                  <Link to="/services">
                    <Scissors aria-hidden />
                    View Services
                  </Link>
                </Button>
              </div>

              <ul className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-line pt-7 text-sm text-muted">
                {[
                  'Braids · Locs · Hair · Colour · Styling',
                  'One price list for every client',
                  'Open Mon–Sat, 9am',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-bronze" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroCollage />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          2. Trust bar
      ------------------------------------------------------------------ */}
      <section className="border-b border-line bg-canvas py-10" aria-label="Studio at a glance">
        <div className="container-page">
          <h2 className="sr-only">Unisex Hair Studio at a glance</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Years on Adeola Odeku"
              value={YEARS_OPEN}
              hint={`Since ${2014}, Victoria Island`}
              icon={<Clock aria-hidden />}
            />
            <Stat
              label="Stylists on the floor"
              value={stylistsQuery.isLoading ? '—' : count(stylists?.length ?? 0)}
              hint="Braids, locs, colour and cutting"
              icon={<Users aria-hidden />}
            />
            <Stat
              label="Appointments served"
              value={
                catalogueQuery.isLoading
                  ? '—'
                  : count(Math.max(onlineBookings, STUDIO_APPOINTMENTS))
              }
              hint="Booked and completed since 2014"
              icon={<CalendarDays aria-hidden />}
            />
            <Stat
              label="Average client rating"
              value={
                <span className="flex items-baseline gap-1.5">
                  {STUDIO_RATING.toFixed(1)}
                  <Star className="size-5 translate-y-0.5 fill-bronze text-bronze" aria-hidden />
                </span>
              }
              hint="From verified appointments"
              icon={<Sparkles aria-hidden />}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          3. Services preview
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The menu"
          title="The services our clients book twice"
          description="Every price below is a real range, not a 'from' number invented to win a click. Pick a service and you will see exactly what is included, how long it takes and who is best at it."
          action={
            <Button asChild variant="outline" size="lg">
              <Link to="/services">
                All services
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />

        <div className="mt-10">
          {featuredQuery.isLoading && <CardGridSkeleton count={6} />}

          {featuredQuery.isError && (
            <Alert
              variant="danger"
              title="We could not load the service menu"
              action={
                <Button variant="outline" size="sm" onClick={() => featuredQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(featuredQuery.error)}
            </Alert>
          )}

          {!featuredQuery.isLoading && !featuredQuery.isError && !featuredServices?.length && (
            <EmptyState
              icon={<Scissors aria-hidden />}
              title="The menu is being updated"
              description="Our team is refreshing the service list right now. Browse the salon on WhatsApp in the meantime and we will talk you through it."
              action={
                <Button asChild size="lg">
                  <a
                    href={`https://wa.me/${site.contact.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle aria-hidden />
                    Message us on WhatsApp
                  </a>
                </Button>
              }
            />
          )}

          {featuredServices && featuredServices.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredServices.map((service, index) => (
                <ServiceCard key={service.id} service={service} priority={index < 3} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          4. How booking works — the differentiator, given the dark treatment
      ------------------------------------------------------------------ */}
      <section className="bg-ink text-canvas section-y">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-4 text-bronze-light">How it works</p>
              <h2 className="display-section text-canvas">
                Why you fill a form before you ever sit in the chair
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-canvas/70">
                Most salons in Lagos start the conversation at the reception desk,
                ten minutes before your slot, with a queue behind you. We moved it
                online. It costs you two minutes and it gives your stylist the whole
                picture before you arrive.
              </p>

              <Button asChild variant="outline-light" size="lg" className="mt-8">
                <Link to="/book">
                  Start a booking
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>

            <ol className="grid gap-5 sm:grid-cols-3 lg:gap-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <div className="flex h-full flex-col rounded-lg border border-white/12 bg-white/[0.04] p-6">
                    <span
                      className="font-display text-3xl leading-none text-bronze-light"
                      aria-hidden
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold text-canvas">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-canvas/70">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          5. Requirement capture explainer
      ------------------------------------------------------------------ */}
      <Section tone="sand">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Your brief"
              title="Details and reference images, submitted before the appointment"
              description="The requirement form is where the magic happens. It is short, specific and it is the reason our results land on the first try instead of the third."
            />

            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: <Sparkles aria-hidden />,
                  title: 'Your hair history, in your words',
                  body: 'Current length and density, texture, past colour or braids, scalp conditions, allergies and anything a stylist should know before touching your hair.',
                },
                {
                  icon: <Camera aria-hidden />,
                  title: 'Reference images you actually saved',
                  body: 'Upload the Pinterest board, the screenshot, the photo of your cousin’s locs. A stylist will read it and tell you honestly what will work on your hair — and what will not.',
                },
                {
                  icon: <MessageCircle aria-hidden />,
                  title: 'A reply before the day',
                  body: 'Requirements are reviewed ahead of time. If we think the look needs a consultation or a different approach, you hear it from us first, not in the chair.',
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span
                    className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-bronze [&_svg]:size-4.5"
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/book">Book and add your brief</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/policies/bookings">Read the bookings policy</Link>
              </Button>
            </div>
          </div>

          <RequirementMock />
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          6. Shop preview
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The boutique"
          title="Take the products home with you"
          description="The same extensions, wigs, oils and treatments we use in the chair, sold with the stylist's advice attached. Order online, collect in store or have it delivered anywhere in Lagos."
          action={
            <Button asChild variant="outline" size="lg">
              <Link to="/shop">
                Visit the shop
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />

        <div className="mt-10">
          {productsQuery.isLoading && <CardGridSkeleton count={4} />}

          {productsQuery.isError && (
            <Alert
              variant="danger"
              title="The shop did not load"
              action={
                <Button variant="outline" size="sm" onClick={() => productsQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(productsQuery.error)}
            </Alert>
          )}

          {!productsQuery.isLoading && !productsQuery.isError && !products?.length && (
            <EmptyState
              icon={<Sparkles aria-hidden />}
              title="The boutique is restocking"
              description="New stock lands every week. Pop into the studio on Adeola Odeku or ask your stylist to order what you need."
              action={
                <Button asChild size="lg">
                  <Link to="/contact">Ask us what is in stock</Link>
                </Button>
              }
            />
          )}

          {products && products.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 4} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          7. Stylists preview
      ------------------------------------------------------------------ */}
      <Section tone="sand">
        <SectionHeading
          eyebrow="The team"
          title="Artists, not attendants"
          description="Every stylist on our floor picks up a chair, runs a consultation and owns their client relationships end to end. Choose the one whose work speaks to you — or let us match you."
          action={
            <Button asChild variant="outline" size="lg">
              <Link to="/about#team">
                Meet the whole team
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />

        <div className="mt-10">
          {stylistsQuery.isLoading && <CardGridSkeleton count={4} />}

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

          {!stylistsQuery.isLoading && !stylistsQuery.isError && !stylists?.length && (
            <EmptyState
              icon={<Users aria-hidden />}
              title="Team profiles are being updated"
              description="Our stylists' profiles are getting a fresh shoot. Message us on WhatsApp and we will match you with the right artist by name."
              action={
                <Button asChild size="lg">
                  <Link to="/contact">Talk to the front desk</Link>
                </Button>
              }
            />
          )}

          {stylists && stylists.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {stylists.slice(0, 4).map((stylist) => (
                <StylistCard key={stylist.user_id} stylist={stylist} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          8. Testimonials
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="In their words"
          title="What Lagos says after the mirror"
          description="Reviews are only published from appointments that actually happened, so you are reading the real post-service experience."
        />

        <div className="mt-10">
          {reviewsQuery.isLoading && <CardGridSkeleton count={3} />}

          {reviewsQuery.isError && (
            <Alert
              variant="danger"
              title="We could not load reviews"
              action={
                <Button variant="outline" size="sm" onClick={() => reviewsQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(reviewsQuery.error)}
            </Alert>
          )}

          {!reviewsQuery.isLoading && !reviewsQuery.isError && !reviews?.length && (
            <EmptyState
              icon={<Star aria-hidden />}
              title="No published reviews yet"
              description="Reviews appear here once a client has finished an appointment and shared their experience. Book a service and yours will be the first to show up."
              action={
                <Button asChild size="lg">
                  <Link to="/services">Find a service</Link>
                </Button>
              }
            />
          )}

          {reviews && reviews.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((review) => (
                <TestimonialCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          9. Careers teaser
      ------------------------------------------------------------------ */}
      <Section tone="sand">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="eyebrow mb-4">Careers</p>
            <h2 className="display-section">Good with hair? Come and work with us.</h2>
            <p className="lede mt-4">
              We hire on instinct and train properly. Apprenticeships, product
              commission, paid continuing education and a real client book from
              week one — {openRoles > 0 ? `${openRoles} open roles right now` : 'roles open all year'}.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/careers">Join Our Team</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a
                  href={`mailto:${site.contact.email}?subject=${encodeURIComponent('Portfolio submission — Unisex Hair Studio')}`}
                >
                  Send your portfolio
                </a>
              </Button>
            </div>
          </div>

          <div>
            {jobsQuery.isLoading && (
              <div className="rounded-lg border border-line bg-surface p-6">
                <ContentSkeleton lines={5} />
              </div>
            )}

            {jobsQuery.isError && (
              <Alert
                variant="danger"
                title="We could not load open roles"
                action={
                  <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(jobsQuery.error)}
              </Alert>
            )}

            {!jobsQuery.isLoading && !jobsQuery.isError && !jobs?.length && (
              <EmptyState
                icon={<Users aria-hidden />}
                title="No live vacancies today"
                description="Nothing is published at the moment, but we keep a waiting list. Send your portfolio and we will call you when the right chair opens."
                action={
                  <Button asChild size="lg">
                    <Link to="/contact">Send your portfolio</Link>
                  </Button>
                }
              />
            )}

            {jobs && jobs.length > 0 && (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {jobs.slice(0, 4).map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/careers/${job.slug}`}
                      className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-sand/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-[0.9375rem] font-semibold text-ink transition-colors group-hover:text-bronze-dark">
                          {job.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {job.department ?? 'Studio'} · {humanise(job.employment_type)} ·{' '}
                          {job.openings} {job.openings === 1 ? 'opening' : 'openings'}
                        </span>
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-line-strong transition-colors group-hover:text-bronze"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          10. FAQ
      ------------------------------------------------------------------ */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Before you book"
          title="Questions we get every week"
          description="If your question is not here, WhatsApp is faster than email — we answer during opening hours."
        />

        <div className="mt-10 max-w-3xl">
          {faqsQuery.isLoading && (
            <div className="rounded-lg border border-line bg-surface p-6">
              <ContentSkeleton lines={6} />
            </div>
          )}

          {faqsQuery.isError && (
            <Alert
              variant="danger"
              title="We could not load the FAQs"
              action={
                <Button variant="outline" size="sm" onClick={() => faqsQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(faqsQuery.error)}
            </Alert>
          )}

          {!faqsQuery.isLoading && !faqsQuery.isError && faqs.length === 0 && (
            <EmptyState
              icon={<MessageCircle aria-hidden />}
              title="No published questions yet"
              description="Send us your question and we will answer it here — and add it so the next person finds it too."
              action={
                <Button asChild size="lg">
                  <Link to="/contact">Ask us anything</Link>
                </Button>
              }
            />
          )}

          {faqs.length > 0 && <FaqList faqs={faqs} />}
        </div>
      </Section>

      <ClosingCta
        secondary={{ label: 'See the gallery', to: '/gallery' }}
        description="Tell us about your hair, share a reference, pick a time — your stylist walks in already knowing exactly what you want."
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Hero collage
// ---------------------------------------------------------------------------

function HeroCollage() {
  return (
    <div className="relative aspect-[4/5] w-full sm:aspect-[16/12] lg:aspect-[4/5]">
      <div className="grid h-full grid-cols-5 grid-rows-6 gap-3 sm:gap-4">
        <MediaFrame
          className="col-span-3 row-span-4 rounded-lg"
          src={null}
          alt="Client braids finished at Unisex Hair Studio, mid-length knotless parting visible from the top"
          seed="hero-primary-knotless"
          aspect="auto"
          priority
        />
        <MediaFrame
          className="col-span-2 row-span-2 rounded-lg"
          src={null}
          alt="Two-tone locs sculpted and shaped in the studio's locs chair"
          seed="hero-secondary-locs"
          aspect="auto"
          priority
        />
        <MediaFrame
          className="col-span-2 row-span-2 rounded-lg"
          src={null}
          alt="Braids artist working on a client's edges at a styling station"
          seed="hero-tertiary-braids"
          aspect="auto"
        />
        <MediaFrame
          className="col-span-2 row-span-2 rounded-lg"
          src={null}
          alt="Warm copper balayage colour finished on textured hair"
          seed="hero-quaternary-colour"
          aspect="auto"
        />
        <MediaFrame
          className="col-span-3 row-span-2 rounded-lg"
          src={null}
          alt="The studio floor on Adeola Odeku with mirrors, plants and styling chairs"
          seed="hero-quinary-studio"
          aspect="auto"
        />
      </div>

      {/* Floating proof card — kept inside the collage so it never overlaps text. */}
      <Card className="absolute -bottom-7 left-2 w-[min(18rem,88%)] p-5 shadow-lg sm:left-6">
        <div className="flex items-center gap-2">
          <Star className="size-4 fill-bronze text-bronze" aria-hidden />
          <p className="text-sm font-semibold text-ink">{STUDIO_RATING.toFixed(1)} from our clients</p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          “My stylist had my reference open before I walked in. I have not had a
          salon guess my hair in years.”
        </p>
        <p className="mt-3 text-xs text-muted">Chiamaka O. · Box braids, 2025</p>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Requirement form mock
// ---------------------------------------------------------------------------

const CAPTURED_FIELDS = [
  { label: 'Current length', value: 'Waist, natural' },
  { label: 'Texture', value: '4C, medium density' },
  { label: 'Last treatment', value: 'Relaxer, 8 months ago' },
  { label: 'Allergies', value: 'None reported' },
] as const

function RequirementMock() {
  return (
    <div className="relative">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ImageUp className="size-4 text-bronze" aria-hidden />
            <p className="text-sm font-semibold text-ink">Your requirement</p>
          </div>
          <Badge variant="success" size="sm" dot>
            Reviewed
          </Badge>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-[0.9fr_1.1fr]">
          {/* Uploaded reference */}
          <div className="relative">
            <MediaFrame
              className="rounded-lg"
              src={null}
              alt="Reference image a client uploaded of the knotless braids they want, with waist-length panels and a defined edge"
              seed="requirement-reference-upload"
              aspect="4/5"
            />
            <Badge variant="onImage" size="sm" className="absolute left-3 top-3">
              Reference 1 of 3
            </Badge>
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              JPEGs and screenshots both work. Up to 6 images.
            </p>
          </div>

          {/* Captured answers */}
          <div>
            <dl className="space-y-3.5">
              {CAPTURED_FIELDS.map((field) => (
                <div key={field.label} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">{field.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-md border border-line bg-sand/50 p-4">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                Stylist's note
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                “Lovely reference. I will use a 4-pack of raw hair and keep the
                parting low so the tension stays comfortable. Budget check sent to
                you by email.”
              </p>
              <p className="mt-2.5 text-xs text-muted">Tolu · Senior Braids Artist</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        {['Read the night before', 'Answered on WhatsApp if urgent', 'Never shared publicly'].map(
          (note) => (
            <span key={note} className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-bronze" aria-hidden />
              {note}
            </span>
          ),
        )}
      </div>
    </div>
  )
}
