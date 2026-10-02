import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  Briefcase,
  CalendarDays,
  Check,
  ClipboardCopy,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { getJobBySlug, getLocations, getStylists, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { absoluteUrl, site } from '@/config/site'
import { formatDate, formatNaira, humanise, whatsappLink } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  SectionHeading,
} from '@/components/ui'
import { PageHeader, StylistCard } from '@/components/shared/Cards'
import { ClosingCta, Section } from '@/components/shared/Blocks'
import { ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, jobSchema, useSeo } from '@/components/seo/Seo'

/**
 * Local markdown renderer.
 *
 * Job descriptions are authored by our own supervisors, so the input is trusted
 * editorial text — but it is still never injected as HTML. This walks the
 * string and emits React nodes, which removes the injection surface entirely.
 *
 * Supported: `##` / `###` headings, `-` / `*` bullet lists, `1.` ordered
 * lists, paragraphs, **bold**, *italic*. Anything else renders as plain text.
 *
 * CONTRACT GAP: `@/features/shop/components/Markdown` does the same job for
 * product copy. One of these should be promoted to `@/components/shared` and
 * the other deleted; that file is outside this page's ownership.
 */
function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return <div className="prose-editorial">{blocks}</div>
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

function parseMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ kind: 'paragraph', text })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim()

    if (!trimmed) {
      flush()
      continue
    }

    const heading = /^#{2,3}\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[1] ?? '' })
      continue
    }

    const unordered = /^[-*]\s+(.*)$/.exec(trimmed)
    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (unordered || ordered) {
      flush()
      const isOrdered = Boolean(ordered)
      const pattern = isOrdered ? /^\d+[.)]\s+(.*)$/ : /^[-*]\s+(.*)$/
      const items: string[] = []

      while (index < lines.length) {
        const current = (lines[index] ?? '').trim()
        const match = pattern.exec(current)
        if (match) {
          items.push(match[1] ?? '')
          index += 1
          continue
        }
        if (!current) break
        items[items.length - 1] = `${items[items.length - 1] ?? ''} ${current}`
        index += 1
      }
      index -= 1

      blocks.push({ kind: 'list', ordered: isOrdered, items })
      continue
    }

    paragraph.push(trimmed)
  }

  flush()

  return blocks.map((block, index) => {
    const key = index
    switch (block.kind) {
      case 'heading':
        return (
          <h3 key={key} className="mt-8 text-lg font-semibold text-ink first:mt-0">
            {inline(block.text)}
          </h3>
        )
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag key={key} className="mt-3 space-y-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                <span>{inline(item)}</span>
              </li>
            ))}
          </Tag>
        )
      }
      case 'paragraph':
      default:
        return (
          <p key={key} className="mt-4 text-base leading-relaxed text-ink-soft first:mt-0">
            {inline(block.text)}
          </p>
        )
    }
  })
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*)/g

function inline(text: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>
      }
      return <span key={index}>{part}</span>
    })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function JobDetailPage() {
  const { slug = '' } = useParams()

  const jobQuery = useQuery({
    queryKey: qk.job(slug),
    queryFn: () => getJobBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 10 * 60_000,
  })

  const teamQuery = useQuery({
    queryKey: qk.staff(),
    queryFn: getStylists,
    staleTime: 30 * 60_000,
  })

  const locationsQuery = useQuery({
    queryKey: qk.locations(),
    queryFn: getLocations,
    staleTime: 30 * 60_000,
  })

  const job = jobQuery.data ?? null
  const applyPath = `/careers/${slug}/apply`

  // `jobs.location_id` is a bare uuid; the name lives on `salon_locations`.
  const locationName = useMemo(() => {
    if (!job?.location_id) return null
    const match = (locationsQuery.data ?? []).find((l) => l.id === job.location_id)
    return match?.name ?? null
  }, [job?.location_id, locationsQuery.data])

  const salary = useMemo(() => {
    if (!job) return null
    if (!job.is_disclosed || !job.salary_min) return 'Competitive'
    if (!job.salary_max) return `${formatNaira(job.salary_min)} ${perPeriod(job.salary_period)}`
    return `${formatNaira(job.salary_min, { compact: true })} – ${formatNaira(job.salary_max, { compact: true })} ${perPeriod(job.salary_period)}`
  }, [job])

  const jsonLd = useMemo(() => {
    if (!job) return [breadcrumbSchema([{ name: 'Careers', path: '/careers' }])]
    return [
      jobSchema({
        title: job.title,
        description: job.summary,
        slug: job.slug,
        postedAt: job.published_at,
        employmentType: job.employment_type,
        salaryMin: job.is_disclosed ? job.salary_min : null,
        salaryMax: job.is_disclosed ? job.salary_max : null,
      }),
      breadcrumbSchema([
        { name: 'Careers', path: '/careers' },
        { name: job.title, path: `/careers/${job.slug}` },
      ]),
    ]
  }, [job])

  useSeo({
    title: job ? `${job.title} at ${site.name}` : `Role not found | ${site.name}`,
    description: job?.summary ?? 'This role is no longer open at Black Chery Unisex Studio.',
    path: `/careers/${slug}`,
    jsonLd,
    noindex: !job,
  })

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (jobQuery.isLoading) {
    return (
      <>
        <PageHeader
          eyebrow="Careers"
          title="Loading role…"
          breadcrumb={[{ label: 'Careers', to: '/careers' }]}
        />
        <div className="container-page section-y">
          <div className="max-w-3xl">
            <ContentSkeleton lines={8} />
          </div>
        </div>
      </>
    )
  }

  // -----------------------------------------------------------------------
  // Error / 404
  // -----------------------------------------------------------------------
  if (jobQuery.isError) {
    return (
      <>
        <PageHeader eyebrow="Careers" title="We could not load this role" />
        <div className="container-page section-y">
          <Alert
            variant="danger"
            title="Something went wrong"
            action={
              <Button size="sm" variant="outline" onClick={() => void jobQuery.refetch()}>
                Retry
              </Button>
            }
          >
            {errorMessage(jobQuery.error)}
          </Alert>
        </div>
      </>
    )
  }

  if (!job) {
    return (
      <>
        <PageHeader
          eyebrow="Careers"
          title="That role is no longer open"
          description="It may have been filled, or the listing has been archived. Everything currently open is on the careers page."
        />
        <div className="container-page section-y">
          <EmptyState
            icon={<Briefcase />}
            title="No role at this address"
            description="Have a look at what is open now — or send us your portfolio and we will keep it on file."
            action={
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg" variant="accent">
                  <Link to="/careers">See open roles</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={`mailto:${site.contact.email}`}>
                    <Mail className="size-4" aria-hidden />
                    Email the studio
                  </a>
                </Button>
              </div>
            }
          />
        </div>
      </>
    )
  }

  // -----------------------------------------------------------------------
  // Role
  // -----------------------------------------------------------------------
  const openings = Math.max(job.openings - job.filled_count, 1)
  const team = (teamQuery.data ?? []).slice(0, 4)

  return (
    <>
      <PageHeader
        eyebrow={job.department ?? 'Careers'}
        title={job.title}
        description={job.summary}
        breadcrumb={[{ label: 'Careers', to: '/careers' }, { label: job.title, to: `/careers/${job.slug}` }]}
        action={
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              asChild
              size="xl"
              variant="accent"
              onClick={() => analytics.jobApplicationStarted(job.slug)}
            >
              <Link to={applyPath}>Apply now</Link>
            </Button>
            <ShareControls jobSlug={job.slug} jobTitle={job.title} />
          </div>
        }
      >
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <Fact icon={Clock} label="Employment" value={humanise(job.employment_type)} />
          <Fact icon={MapPin} label="Location" value={locationName ?? `${site.address.locality}, ${site.address.region}`} />
          <Fact icon={Briefcase} label="Salary" value={salary ?? 'Competitive'} />
          <Fact
            icon={Users}
            label="Openings"
            value={`${openings} ${openings === 1 ? 'opening' : 'openings'}`}
          />
          <Fact
            icon={CalendarDays}
            label="Posted"
            value={job.published_at ? formatDate(job.published_at) : 'Recently'}
          />
          {job.closes_at && (
            <Fact icon={CalendarDays} label="Closes" value={formatDate(job.closes_at)} />
          )}
          {job.min_experience_years ? (
            <Fact
              icon={Award}
              label="Experience"
              value={`${job.min_experience_years}+ years`}
            />
          ) : null}
        </dl>
      </PageHeader>

      <div className="container-page section-y">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
          {/* Body ------------------------------------------------------ */}
          <div className="min-w-0">
            <Markdown source={job.description} />

            <CheckList
              title="What you'll do"
              items={job.responsibilities}
              empty="The responsibilities for this role are still being written."
            />
            <CheckList
              title="What we're looking for"
              items={job.requirements}
              empty="We are reviewing portfolios first — tell us what you have done."
            />
            <CheckList
              title="Nice to have"
              items={job.nice_to_have}
              empty="Nothing extra — everything above is genuinely required."
            />
            <CheckList
              title="What we offer"
              items={job.benefits}
              empty="Ask us for the full package before you interview — we will send it in writing."
            />

            <div className="mt-12 border-t border-line pt-8">
              <Button asChild size="xl" variant="solid" className="sm:hidden">
                <Link to={applyPath}>Apply for this role</Link>
              </Button>
            </div>
          </div>

          {/* Sticky apply sidebar -------------------------------------- */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <Card className="p-6">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                {job.department ?? 'Role'}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold leading-tight text-ink">
                {salary ?? 'Competitive'}
              </p>
              <p className="mt-1 text-xs text-muted">
                {job.is_disclosed && job.salary_min
                  ? `${humanise(job.salary_period)} · ${job.salary_currency}`
                  : 'Ask us for the band before you interview'}
              </p>

              <dl className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
                <SideFact label="Employment" value={humanise(job.employment_type)} />
                <SideFact
                  label="Location"
                  value={locationName ?? `${site.address.street}, ${site.address.locality}`}
                />
                <SideFact label="Openings" value={String(openings)} />
                <SideFact
                  label="Posted"
                  value={job.published_at ? formatDate(job.published_at) : '—'}
                />
              </dl>

              <Button asChild fullWidth size="lg" variant="accent" className="mt-6">
                <Link to={applyPath} onClick={() => analytics.jobApplicationStarted(job.slug)}>
                  Apply now
                </Link>
              </Button>

              <p className="mt-3 text-center text-xs text-muted">
                Ten minutes. No account needed.
              </p>

              <div className="mt-5 border-t border-line pt-4">
                <ShareControls jobSlug={job.slug} jobTitle={job.title} stacked />
              </div>
            </Card>

            {job.screening_questions.length > 0 && (
              <Card className="mt-5 p-6">
                <h3 className="font-display text-base font-semibold text-ink">
                  What the form asks
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {job.screening_questions.map((question) => (
                    <li key={question.key} className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-bronze" aria-hidden />
                      <span>{question.label}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      </div>

      {/* Meet the team -------------------------------------------------- */}
      <Section tone="sand" className="border-t border-line">
        <SectionHeading
          eyebrow="Meet the team"
          title="Who you would be working with."
          description="Everyone here takes the brief as seriously as you are about to. These are the people a candidate meets on their first day."
        />

        <div className="mt-12">
          {teamQuery.isLoading ? (
            <ContentSkeleton lines={3} />
          ) : teamQuery.isError ? (
            <Alert
              variant="warning"
              title="We could not load the team"
              action={
                <Button size="sm" variant="outline" onClick={() => void teamQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(teamQuery.error)}
            </Alert>
          ) : team.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Profiles are on their way"
              description="Our public stylist profiles are being updated this week."
              action={
                <Button asChild size="lg" variant="outline">
                  <Link to="/about">About the studio</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((stylist) => (
                <StylistCard key={stylist.user_id} stylist={stylist} />
              ))}
            </div>
          )}
        </div>
      </Section>

      <ClosingCta
        eyebrow="Not quite right?"
        title="Send your portfolio anyway."
        description="We hire ahead of vacancies. If your work fits the studio, tell us what you do — even when nothing is posted."
        primary={{ label: 'Apply for this role', to: applyPath }}
        secondary={{ label: 'All open roles', to: '/careers' }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function perPeriod(period: string): string {
  return `per ${period.replace('ly', '')}`
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
      <div>
        <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
          {label}
        </dt>
        <dd className="font-medium text-ink">{value}</dd>
      </div>
    </div>
  )
}

function SideFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function CheckList({
  title,
  items,
  empty,
}: {
  title: string
  items: string[]
  empty: string
}) {
  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-bronze/12 text-bronze-dark"
                aria-hidden
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ShareControls({
  jobSlug,
  jobTitle,
  stacked = false,
}: {
  jobSlug: string
  jobTitle: string
  stacked?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const url = absoluteUrl(`/careers/${jobSlug}`)
  const message = `${jobTitle} at ${site.name} — ${url}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      analytics.share('copy', jobTitle)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Your browser blocked the clipboard. Copy the address bar instead.')
    }
  }

  return (
    <div className={cn('flex gap-2', stacked && 'w-full')}>
      <Button
        variant="outline"
        size={stacked ? 'md' : 'xl'}
        fullWidth={stacked}
        onClick={() => void copy()}
        aria-label="Copy a link to this role"
      >
        {copied ? (
          <ClipboardCopy className="size-4" aria-hidden />
        ) : (
          <Share2 className="size-4" aria-hidden />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </Button>

      <Button
        asChild
        variant="outline"
        size={stacked ? 'md' : 'xl'}
        fullWidth={stacked}
      >
        <a
          href={whatsappLink(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => analytics.whatsappClick('career')}
          aria-label="Share this role on WhatsApp"
        >
          <MessageCircle className="size-4" aria-hidden />
          WhatsApp
        </a>
      </Button>
    </div>
  )
}
