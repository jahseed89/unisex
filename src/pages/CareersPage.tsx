import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  GraduationCap,
  HandCoins,
  Mail,
  MessageCircle,
  Percent,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'

import { getGallery, getJobDepartments, listJobs, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { STUDIO_SHOTS, resolvePhoto } from '@/config/media'
import { humanise } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeading,
  Select,
} from '@/components/ui'
import { JobCard } from '@/components/shared/Cards'
import { ContactCard, FaqList, OpeningHoursCard, Section } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { CardGridSkeleton, ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, faqSchema, jobSchema, useSeo } from '@/components/seo/Seo'
import type { Faq } from '@/types'

// ---------------------------------------------------------------------------
// Editorial copy
// ---------------------------------------------------------------------------

/** The standing offer, written once and reused by the benefits strip. */
const BASE_BENEFITS = [
  {
    title: 'Paid, on time, in writing',
    body: 'Every role states its salary band before you apply. Payslip, pension contribution and paid leave are handled properly — no “we will sort it when you grow” promises.',
    Icon: HandCoins,
  },
  {
    title: 'Product commission',
    body: 'You are not expected to sell. But when the extension or treatment you genuinely recommend is the right one for the client, you are paid a percentage of it.',
    Icon: Percent,
  },
  {
    title: 'Paid training and certification',
    body: 'Colour theory, loc methodology, advanced braiding — funded and scheduled, not squeezed into evenings after a full day on the floor.',
    Icon: GraduationCap,
  },
  {
    title: 'Staff discount',
    body: 'Forty percent off services and retail, for you and for one immediate family member. We use the products we sell, and we should be using them.',
    Icon: Sparkles,
  },
  {
    title: 'A real career path',
    body: 'Senior artist, lead, supervisor and studio manager are roles people here actually move into. We promote from the chair.',
    Icon: TrendingUp,
  },
] as const

const HIRING_STEPS = [
  {
    title: 'Apply',
    body: 'Ten minutes online. Tell us about your work, link a portfolio, and answer the two or three questions the role actually cares about. No account, no password, no cover letter theatre.',
    meta: 'Online · 10 minutes',
  },
  {
    title: 'Review',
    body: 'A supervisor reads every application — the same week it arrives. You get a reference number by email, and a real answer either way.',
    meta: 'Within 7 days',
  },
  {
    title: 'Interview',
    body: 'A conversation with the supervisor for the department, and a short practical session in the studio — real work, on a real head, with a real brief. We pay for the travel.',
    meta: '45 minutes + practical',
  },
  {
    title: 'Offer',
    body: 'A written offer with the salary band, the roster and the training plan spelled out. If it does not match what was said in the interview, say so and we will fix it.',
    meta: 'Offer in 48 hours',
  },
] as const

const DIVERSITY_POINTS = [
  {
    title: 'A unisex salon hires a mixed team on purpose',
    body: 'Our clients are everyone. If only women cut braids and only men do tapers, we are not serving the studio we say we are. Every chair is open to every stylist who can do the work.',
  },
  {
    title: 'Men and non-binary clients are not an afterthought',
    body: 'Beard design, scalp work, locs, texture, colour and installs. A meaningful share of our chair time is taken by clients who have been turned away somewhere else.',
  },
  {
    title: 'Skill is the only filter we apply',
    body: 'Not where you trained, not who you know, not which house you came from. Portfolios, references and hands-on ability decide it.',
  },
  {
    title: 'Lived experience counts as expertise',
    body: 'If your own hair has been the difficult one, you already understand what our clients are anxious about. That is professional knowledge, and we pay for it.',
  },
] as const

const RECRUITMENT_FAQS: Faq[] = [
  {
    id: 'faq-roles-gender',
    question: 'Do I need to be a woman to work here?',
    answer:
      'No. Black Chery Unisex Studio hires across genders, and every role is open to every stylist who can do the work well. Braids, locs, colour, cuts and scalp services are served to everyone, so the team behind them is mixed by design — not because it looks modern, but because it is the only way the studio actually works.',
    category: 'careers',
    display_order: 1,
    is_published: true,
  },
  {
    id: 'faq-no-experience',
    question: 'I am new to the salon. Can I still apply?',
    answer:
      'For apprenticeship and internship roles, yes — that is exactly what they are for. For senior artist and colourist roles we look for real, verifiable experience, because a client is trusting us with their hair. If you are early in your career, apply for the apprenticeship and tell us honestly where you are; we would rather train you than hire you into a role you cannot do yet.',
    category: 'careers',
    display_order: 2,
    is_published: true,
  },
  {
    id: 'faq-apply-time',
    question: 'How long does the process take?',
    answer:
      'Roughly one to two weeks from application to decision. We review every application within seven days, run interviews in the week after, and send a written offer within 48 hours of a successful practical. If you are waiting longer than that, email us — something has gone wrong, and we would rather fix it than have you guess.',
    category: 'careers',
    display_order: 3,
    is_published: true,
  },
  {
    id: 'faq-portfolio',
    question: 'What do I need to submit?',
    answer:
      'A link to your work — Instagram, TikTok, a portfolio page, or photographs of what you have done. That is the only thing we cannot work without. A CV helps, and the role may ask a couple of short questions about your experience or earliest start date, but there is no formal cover letter and no account to create.',
    category: 'careers',
    display_order: 4,
    is_published: true,
  },
  {
    id: 'faq-pay-product-commission',
    question: 'How does pay work, exactly?',
    answer:
      'Each role states its salary band and pays monthly. Some roles carry a performance bonus or a percentage on products and treatments you recommend — it is always spelled out in the offer, never assumed. If a role says “competitive” instead of a figure, ask us for the band before you interview, and we will give it to you.',
    category: 'careers',
    display_order: 5,
    is_published: true,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CareersPage() {
  const [department, setDepartment] = useState<string>('')
  const [search, setSearch] = useState('')
  const [employmentType, setEmploymentType] = useState<string>('')

  const jobsQuery = useQuery({
    queryKey: qk.jobs(),
    queryFn: () => listJobs(),
    staleTime: 10 * 60_000,
  })

  const departmentsQuery = useQuery({
    queryKey: qk.jobs({ department: 'all' }),
    queryFn: getJobDepartments,
    staleTime: 30 * 60_000,
  })

  const galleryQuery = useQuery({
    queryKey: qk.gallery('team'),
    queryFn: () => getGallery('team'),
    staleTime: 30 * 60_000,
  })

  // Defaulted once, so the memos below do not re-run on every render while a
  // query is still in flight.
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data])
  const departments = departmentsQuery.data ?? []
  const teamPhotos = galleryQuery.data ?? []

  const employmentTypes = useMemo(
    () => [...new Set(jobs.map((job) => job.employment_type))].sort(),
    [jobs],
  )

  // `listJobs` reads the whole open list anyway, so the facet set is applied
  // here: one cache entry, and department chips stay available while searching.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return jobs.filter((job) => {
      if (department && job.department !== department) return false
      if (employmentType && job.employment_type !== employmentType) return false
      if (!term) return true
      return (
        job.title.toLowerCase().includes(term) ||
        job.summary.toLowerCase().includes(term) ||
        (job.department ?? '').toLowerCase().includes(term)
      )
    })
  }, [jobs, department, employmentType, search])

  const grouped = useMemo(() => {
    const buckets = new Map<string, typeof filtered>()
    for (const job of filtered) {
      const key = job.department ?? 'General'
      const bucket = buckets.get(key)
      if (bucket) bucket.push(job)
      else buckets.set(key, [job])
    }
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  // Only group by department when the visitor has not narrowed the list.
  const showGroups = !department && !employmentType && !search.trim()
  const featured = jobs.find((job) => job.is_featured) ?? jobs[0] ?? null

  /** Every benefit mentioned on any open role, de-duplicated. */
  const roleBenefits = useMemo(() => {
    const seen = new Set<string>()
    for (const job of jobs) {
      for (const benefit of job.benefits) {
        const key = benefit.trim().toLowerCase()
        if (key) seen.add(benefit.trim())
      }
    }
    return [...seen]
  }, [jobs])

  const openRoles = jobs.reduce((total, job) => total + (job.openings || 1), 0)

  const jsonLd = useMemo(() => {
    const nodes: Record<string, unknown>[] = [
      breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Careers', path: '/careers' },
      ]),
      faqSchema(RECRUITMENT_FAQS.map(({ question, answer }) => ({ question, answer }))),
    ]
    if (featured) {
      nodes.unshift(
        jobSchema({
          title: featured.title,
          description: featured.summary,
          slug: featured.slug,
          postedAt: featured.published_at,
          employmentType: featured.employment_type,
          salaryMin: featured.is_disclosed ? featured.salary_min : null,
          salaryMax: featured.is_disclosed ? featured.salary_max : null,
        }),
      )
    }
    return nodes
  }, [featured])

  useSeo({
    title: `Careers at ${site.name} — hair, braids, locs & colour roles in Lagos`,
    description: `${site.tagline} We hire across genders and hair textures: braids artists, colourists, locs specialists, front of house and apprentices. Salary bands published, paid training, product commission.`,
    path: '/careers',
    jsonLd,
  })

  const filtersActive = Boolean(department || employmentType || search.trim())

  return (
    <>
      {/* ----------------------------------------------------------------
          Hero
      ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-line bg-sand/50">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.6]"
          style={{
            backgroundImage:
              'radial-gradient(52rem 34rem at 82% -14%, rgba(169,132,103,0.24), transparent 62%)',
          }}
          aria-hidden
        />

        <div className="container-page relative section-y">
          <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-5">Careers · {site.address.locality}, {site.address.region}</p>

              <h1 className="display-hero">
                Do the work you are
                <br />
                actually good at,{' '}
                <span className="text-bronze-dark">for everyone.</span>
              </h1>

              <p className="lede mt-7 max-w-xl">
                Black Chery Unisex Studio is a unisex salon, so our team is unisex too.
                We hire braids artists, colourists, locs specialists, front of
                house and apprentices — across genders, across hair textures,
                with the salary band published before you ever apply.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl" variant="accent">
                  <a href="#open-roles">
                    See open roles
                    <ArrowRight className="size-5" aria-hidden />
                  </a>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link to="/contact">Talk to the studio</Link>
                </Button>
              </div>

              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-8">
                <HeroStat label="Open positions" value={String(openRoles)} />
                <HeroStat label="Departments" value={String(departments.length || jobs.length)} />
                <HeroStat label="Hiring across" value="All genders" />
              </dl>
            </div>

            <div className="hidden lg:block">
              <StudioCollage photos={teamPhotos} />
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          Benefits
      ---------------------------------------------------------------- */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="What working here offers"
          title="Pay, training, and room to grow."
          description="The unglamorous list first, because it matters more than the styling. Every figure below is the studio's standing offer; individual roles publish their own band."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BASE_BENEFITS.map(({ title, body, Icon }) => (
            <Card key={title} className="p-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-bronze/10 text-bronze-dark">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </Card>
          ))}
        </div>

        {roleBenefits.length > 0 && (
          <div className="mt-10 border-t border-line pt-8">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Benefits listed on current roles
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {roleBenefits.map((benefit) => (
                <li key={benefit}>
                  <Badge variant="outline" size="lg" className="gap-1.5">
                    <Check className="size-3.5 text-success" aria-hidden />
                    {benefit}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ----------------------------------------------------------------
          Open roles
      ---------------------------------------------------------------- */}
      <section id="open-roles" className="border-y border-line bg-canvas section-y scroll-mt-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Open roles"
            title="Roles open right now."
            description="Every vacancy, with the band published where the studio publishes bands. If a role says “competitive”, ask and we will tell you the figure before you interview."
            action={
              jobsQuery.isLoading ? undefined : (
                <p className="text-sm text-muted tabular-nums">
                  {filtered.length} of {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
                </p>
              )
            }
          />

          {/* Filters --------------------------------------------------- */}
          <div className="mt-10 space-y-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <div>
                <label htmlFor="careers-search" className="sr-only">
                  Search open roles
                </label>
                <Input
                  id="careers-search"
                  type="search"
                  value={search}
                  placeholder="Search by title, department or keyword"
                  leadingIcon={<Search aria-hidden />}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="careers-type" className="sr-only">
                  Employment type
                </label>
                <Select
                  id="careers-type"
                  value={employmentType}
                  onChange={(event) => setEmploymentType(event.target.value)}
                  options={[
                    { value: '', label: 'Any employment type' },
                    ...employmentTypes.map((type) => ({
                      value: type as string,
                      label: humanise(type),
                    })),
                  ]}
                />
              </div>
            </div>

            {departments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Chip active={!department} onClick={() => setDepartment('')}>
                  All departments
                </Chip>
                {departments.map((name) => (
                  <Chip
                    key={name}
                    active={department === name}
                    onClick={() => setDepartment(department === name ? '' : name)}
                  >
                    {name}
                  </Chip>
                ))}
              </div>
            )}

            {filtersActive && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted">
                  {filtered.length} {filtered.length === 1 ? 'role matches' : 'roles match'}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDepartment('')
                    setSearch('')
                    setEmploymentType('')
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                  Clear filters
                </Button>
              </div>
            )}
          </div>

          {/* Results -------------------------------------------------- */}
          <div className="mt-10" aria-live="polite">
            {jobsQuery.isLoading ? (
              <CardGridSkeleton count={3} className="sm:grid-cols-1 lg:grid-cols-2" />
            ) : jobsQuery.isError ? (
              <Alert
                variant="danger"
                title="We could not load the open roles"
                action={
                  <Button size="sm" variant="outline" onClick={() => void jobsQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(jobsQuery.error)}
              </Alert>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Compass />}
                title={jobs.length === 0 ? 'No open roles right now' : 'No roles match those filters'}
                description={
                  jobs.length === 0
                    ? 'We post vacancies as they are approved, usually a few times a month. Send us your portfolio and we will keep it on file.'
                    : 'Try a different department or clear the search to see every open role.'
                }
                action={
                  jobs.length === 0 ? (
                    <Button asChild size="lg" variant="accent">
                      <a href={`mailto:${site.contact.email}?subject=${encodeURIComponent('Work at Black Chery Unisex Studio')}`}>
                        Send your portfolio
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => {
                        setDepartment('')
                        setSearch('')
                        setEmploymentType('')
                      }}
                    >
                      Clear filters
                    </Button>
                  )
                }
              />
            ) : showGroups ? (
              <div className="space-y-12">
                {grouped.map(([name, group]) => (
                  <section key={name}>
                    <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-line pb-3">
                      <h3 className="font-display text-lg font-semibold text-ink">{name}</h3>
                      <p className="text-xs text-muted tabular-nums">
                        {group.length} {group.length === 1 ? 'role' : 'roles'}
                      </p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {group.map((job) => (
                        <JobCard key={job.id} job={job} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filtered.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          Life at the studio
      ---------------------------------------------------------------- */}
      <Section tone="sand">
        <SectionHeading
          eyebrow="Life at the studio"
          title="A working salon, not a photo shoot."
          description={`${site.address.street}, nine till seven, tea constantly on. Show up, do good work, look after each other's chairs. That is most of it.`}
        />

        {galleryQuery.isError ? (
          <div className="mt-12">
            <Alert
              variant="warning"
              title="Studio photos are unavailable"
              action={
                <Button size="sm" variant="outline" onClick={() => void galleryQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(galleryQuery.error)}
            </Alert>
          </div>
        ) : galleryQuery.isLoading ? (
          <div className="mt-12">
            <ContentSkeleton lines={3} />
          </div>
        ) : teamPhotos.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              icon={<UserRound />}
              title="Studio photography is on its way"
              description="We are shooting the team this month. In the meantime the gallery and the stylist profiles show who you would be working with."
              action={
                <Button asChild size="lg" variant="outline">
                  <Link to="/gallery">Browse the gallery</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {teamPhotos.slice(0, 8).map((photo, index) => (
              <div key={photo.id} className={cn(index === 0 && 'sm:col-span-2 lg:col-span-2')}>
                <MediaFrame
                  src={photo.image_url}
                  alt={photo.alt_text ?? photo.title ?? `The Black Chery Unisex Studio team, photo ${index + 1}`}
                  seed={photo.slug ?? photo.id}
                  aspect={index === 0 ? '4/3' : 'square'}
                  rounded
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ----------------------------------------------------------------
          How we hire
      ---------------------------------------------------------------- */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="How we hire"
          title="Four steps, about a week, no ghosting."
          description="You will always know where your application is and what happens next."
        />

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HIRING_STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col p-6">
                <span
                  className="flex size-9 items-center justify-center rounded-full border border-bronze/30 bg-bronze/10 font-display text-sm font-semibold text-bronze-dark"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-bronze-dark">
                  {step.meta}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      {/* ----------------------------------------------------------------
          Why we hire — diversity
      ---------------------------------------------------------------- */}
      <section className="border-y border-line bg-ink text-canvas section-y">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-4 text-bronze-light">Why we hire</p>
              <h2 className="display-section">
                A unisex salon has to <span className="text-bronze-light">hire</span> a
                unisex team.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-canvas/75">
                We are asked for this more than anything else on this page, so we
                will say it plainly. Our clients are men, women and non-binary
                people with every texture of hair, and the majority of them have
                already been told somewhere else that they are not the kind of
                person a salon like this is for. Fixing that is a staffing
                decision, not a poster.
              </p>
              <Button asChild size="xl" variant="outline-light" className="mt-8">
                <a href={`mailto:${site.contact.email}?subject=${encodeURIComponent('Work at Black Chery Unisex Studio')}`}>
                  <Mail className="size-4.5" aria-hidden />
                  Email the studio
                </a>
              </Button>
            </div>

            <ul className="grid gap-5 sm:grid-cols-2">
              {DIVERSITY_POINTS.map(({ title, body }) => (
                <li key={title} className="border-t border-white/15 pt-4">
                  <h3 className="font-display text-base font-semibold text-canvas">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-canvas/70">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          FAQ
      ---------------------------------------------------------------- */}
      <Section tone="canvas">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <SectionHeading
            eyebrow="Before you apply"
            title="Questions we actually get asked."
            description="If yours is not here, WhatsApp or email the studio — a person answers, usually the same day."
            action={
              <Button asChild variant="outline" size="lg">
                <a
                  href={`https://wa.me/${site.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent("Hi! I have a question about working at Black Chery Unisex Studio.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Ask on WhatsApp
                </a>
              </Button>
            }
          />
          <FaqList faqs={RECRUITMENT_FAQS} />
        </div>
      </Section>

      {/* ----------------------------------------------------------------
          Don't see your role
      ---------------------------------------------------------------- */}
      <section className="border-t border-line bg-sand section-y">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-4">Don't see your role?</p>
              <h2 className="display-section">
                Send us your work anyway.
              </h2>
              <p className="lede mt-5">
                We hire ahead of vacancies. Two of our current stylists applied
                for roles that were not posted, and both are still here. Tell us
                what you do, link a portfolio, and we will keep it on file for
                when a chair opens.
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="xl" variant="accent">
                  <a href={`mailto:${site.contact.email}?subject=${encodeURIComponent('Portfolio — work at Black Chery Unisex Studio')}`}>
                    <Mail className="size-5" aria-hidden />
                    Email your portfolio
                  </a>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link to="/contact">Visit the studio</Link>
                </Button>
              </div>

              <p className="mt-6 flex items-start gap-2.5 text-sm text-muted">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                <span>
                  Everything we publish about a role — the band, the roster, the
                  training budget — is in the job description before you apply.
                  If something is missing, ask.
                </span>
              </p>
            </div>

            <div className="space-y-5">
              <ContactCard />
              <OpeningHoursCard />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-2xl font-semibold text-ink">{value}</dd>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-pill border px-4 text-[0.8125rem] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** Two offset frames — a warm stand-in until the team photography lands. */
function StudioCollage({
  photos,
}: {
  photos: { id: string; image_url: string; alt_text: string | null; title: string | null; slug: string | null }[]
}) {
  const [lead, ...rest] = photos
  const secondary = rest.slice(0, 2)

  if (!lead) {
    return (
      <div className="grid gap-4">
        <div className="overflow-hidden rounded-xl border border-line bg-sand">
          <MediaFrame
            src={resolvePhoto(STUDIO_SHOTS.careersTeam)}
            alt={`The ${site.name} floor at ${site.address.street}`}
            seed="careers-hero"
            aspect="4/5"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-3 overflow-hidden rounded-xl border border-line bg-sand shadow-sm">
        <MediaFrame
          src={lead.image_url}
          alt={lead.alt_text ?? lead.title ?? 'The Black Chery Unisex Studio team at work'}
          seed={lead.slug ?? lead.id}
          aspect="4/5"
          priority
        />
      </div>
      <div className="col-span-2 flex flex-col gap-4">
        {(secondary.length > 0 ? secondary : [lead]).map((photo, index) => (
          <div
            key={`${photo.id}-${index}`}
            className="flex-1 overflow-hidden rounded-xl border border-line bg-sand shadow-sm"
          >
            <MediaFrame
              src={photo.image_url}
              alt={photo.alt_text ?? photo.title ?? 'Studio life at Black Chery Unisex Studio'}
              seed={photo.slug ?? `${photo.id}-${index}`}
              aspect="square"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
