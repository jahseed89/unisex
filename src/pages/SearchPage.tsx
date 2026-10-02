import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Search as SearchIcon, Scissors, ShoppingBag, X } from 'lucide-react'

import { getProducts, getServices, listJobs, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { formatNaira, humanise } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui'
import { formatDuration, PageHeader } from '@/components/shared/Cards'
import { ClosingCta, Section } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { ContentSkeleton } from '@/components/layout/RouteLoader'
import { useSeo } from '@/components/seo/Seo'
import type { Job, ProductCatalogEntry, ServiceCatalogEntry } from '@/types'

/** Below this length, matching everything would be noise rather than search. */
const MIN_TERM = 2

const SUGGESTIONS = ['knotless braids', 'locs', 'silk press', 'balayage', 'wig', 'colourist']

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const term = (searchParams.get('q') ?? '').trim()
  const [draft, setDraft] = useState(term)

  const shouldSearch = term.length >= MIN_TERM

  // Keep the input in step with the URL when the visitor uses back/forward.
  useEffect(() => {
    setDraft(term)
  }, [term])

  // Report the search once per submitted term.
  useEffect(() => {
    if (shouldSearch) analytics.search(term)
  }, [shouldSearch, term])

  // Parallel searches. `enabled` guards the empty term, so a blank box never
  // pulls the whole catalogue over the wire.
  const servicesQuery = useQuery({
    queryKey: qk.services({ search: term }),
    queryFn: () => getServices({ search: term }),
    enabled: shouldSearch,
    staleTime: 60_000,
  })

  const productsQuery = useQuery({
    queryKey: qk.products({ search: term }),
    queryFn: () => getProducts({ search: term }),
    enabled: shouldSearch,
    staleTime: 60_000,
  })

  const jobsQuery = useQuery({
    queryKey: qk.jobs({ search: term }),
    queryFn: () => listJobs({ search: term }),
    enabled: shouldSearch,
    staleTime: 60_000,
  })

  const services = servicesQuery.data ?? []
  const products = productsQuery.data ?? []
  const jobs = jobsQuery.data ?? []
  const total = services.length + products.length + jobs.length

  const groupLinks = [
    { id: 'services', label: 'Services', count: services.length },
    { id: 'products', label: 'Shop', count: products.length },
    { id: 'jobs', label: 'Open roles', count: jobs.length },
  ].filter((group) => group.count > 0)

  const isLoading = shouldSearch && (servicesQuery.isLoading || productsQuery.isLoading || jobsQuery.isLoading)
  const firstError = [servicesQuery, productsQuery, jobsQuery].find((query) => query.isError)
  const errorQuery = firstError as
    | typeof servicesQuery
    | undefined

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = draft.trim()
    if (next.length < MIN_TERM) return
    setSearchParams({ q: next }, { replace: true })
  }

  const clear = () => {
    setDraft('')
    setSearchParams({}, { replace: true })
  }

  useSeo({
    title: shouldSearch ? `Search results for “${term}”` : 'Search',
    description: shouldSearch
      ? total > 0
        ? `${pluraliseResults(total)} on the Black Chery Unisex Studio site for “${term}” — services, products and open roles.`
        : `No results on the Black Chery Unisex Studio site for “${term}”. Try a shorter word, or ask us directly.`
      : 'Search the Black Chery Unisex Studio site for a service, a product or an open role.',
    path: shouldSearch ? `/search?q=${encodeURIComponent(term)}` : '/search',
    noindex: true,
  })

  return (
    <>
      <PageHeader
        eyebrow="Search"
        title={shouldSearch ? `Results for “${term}”` : 'What are you looking for?'}
        description="Search across the service menu, the boutique and our open roles. One box, everything on the site."
        breadcrumb={[{ label: 'Search', to: '/search' }]}
      >
        <form onSubmit={onSubmit} role="search" className="max-w-2xl">
          <label htmlFor="site-search" className="sr-only">
            Search the site
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Input
              id="site-search"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Try “knotless braids”, “wig” or “colourist”"
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 flex-1"
              leadingIcon={<SearchIcon aria-hidden />}
              trailingSlot={
                draft.length > 0 ? (
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="Clear search"
                    className="rounded-sm p-1.5 text-muted transition-colors hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                ) : undefined
              }
            />
            <Button type="submit" size="lg" disabled={draft.trim().length < MIN_TERM}>
              Search
            </Button>
          </div>
          <p className="mt-2.5 text-xs text-muted" role="status" aria-live="polite">
            {shouldSearch
              ? `${total} ${total === 1 ? 'result' : 'results'} for “${term}”.`
              : 'Enter at least two characters to search.'}
          </p>
        </form>
      </PageHeader>

      <Section tone="canvas">
        {!shouldSearch && (
          <div className="max-w-2xl">
            <h2 className="display-section text-[1.5rem]">Popular searches</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(suggestion)
                      setSearchParams({ q: suggestion }, { replace: true })
                    }}
                    className="inline-flex h-11 items-center rounded-pill border border-line-strong bg-surface px-4 text-sm text-ink-soft transition-colors hover:border-ink hover:bg-sand"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { to: '/services', icon: <Scissors aria-hidden />, title: 'Browse services', body: 'Braids, locs, hair, colour and styling with real prices.' },
                { to: '/shop', icon: <ShoppingBag aria-hidden />, title: 'Browse the shop', body: 'Wigs, extensions, oils and tools, delivered across Lagos.' },
                { to: '/careers', icon: <Briefcase aria-hidden />, title: 'See open roles', body: 'We hire on instinct and train properly.' },
              ].map((link) => (
                <Card key={link.to} interactive className="p-5">
                  <Link to={link.to} className="block">
                    <span className="flex size-9 items-center justify-center rounded-full bg-sand text-bronze [&_svg]:size-4.5" aria-hidden>
                      {link.icon}
                    </span>
                    <span className="mt-4 block font-display text-base font-semibold text-ink">
                      {link.title}
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-muted">
                      {link.body}
                    </span>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        )}

        {shouldSearch && isLoading && (
          <div className="max-w-3xl space-y-4">
            {[0, 1, 2].map((group) => (
              <Card key={group} className="p-6">
                <ContentSkeleton lines={4} />
              </Card>
            ))}
          </div>
        )}

        {shouldSearch && !isLoading && errorQuery?.isError && (
          <Alert
            variant="danger"
            title="Search is temporarily unavailable"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void servicesQuery.refetch()
                  void productsQuery.refetch()
                  void jobsQuery.refetch()
                }}
              >
                Retry
              </Button>
            }
          >
            {errorMessage(errorQuery.error)}
          </Alert>
        )}

        {shouldSearch && !isLoading && !errorQuery?.isError && total === 0 && (
          <EmptyState
            icon={<SearchIcon aria-hidden />}
            title={`Nothing matched “${term}”`}
            description="Try a shorter word — “braids” instead of “knotless braids installation”. You can also ask us directly and we will point you to the right service."
            action={
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button size="lg" onClick={clear}>
                  Clear search
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">Ask us directly</Link>
                </Button>
              </div>
            }
          />
        )}

        {shouldSearch && !isLoading && !errorQuery?.isError && total > 0 && (
          <div className="space-y-14">
            <nav aria-label="Result sections">
              <ul className="flex flex-wrap items-center gap-2">
                {groupLinks.map((group) => (
                  <li key={group.id}>
                    <a
                      href={`#${group.id}`}
                      className="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface px-4 text-sm text-ink-soft transition-colors hover:border-ink hover:bg-sand"
                    >
                      {group.label}
                      <span className="text-xs tabular-nums text-faint">{group.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {services.length > 0 && (
              <ResultGroup
                id="services"
                title="Services"
                count={services.length}
                description="Book these online with a time that suits you."
              >
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map((service) => (
                    <ServiceResult key={service.id} service={service} />
                  ))}
                </ul>
                <MoreLink to="/services" label="All services" />
              </ResultGroup>
            )}

            {products.length > 0 && (
              <ResultGroup
                id="products"
                title="Shop"
                count={products.length}
                description="The same products we use in the chair, sold with a stylist's advice attached."
              >
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {products.map((product) => (
                    <ProductResult key={product.id} product={product} />
                  ))}
                </ul>
                <MoreLink to="/shop" label="All products" />
              </ResultGroup>
            )}

            {jobs.length > 0 && (
              <ResultGroup
                id="jobs"
                title="Open roles"
                count={jobs.length}
                description="We hire on instinct and train properly — portfolios welcome."
              >
                <ul className="grid gap-4 sm:grid-cols-2">
                  {jobs.map((job) => (
                    <JobResult key={job.id} job={job} />
                  ))}
                </ul>
                <MoreLink to="/careers" label="All open roles" />
              </ResultGroup>
            )}
          </div>
        )}
      </Section>

      <ClosingCta
        eyebrow="Still looking?"
        title="Tell us the look and we will build it."
        description="Send a reference with your booking and your stylist will tell you honestly what it will take to get there on your hair."
        secondary={{ label: 'See the gallery', to: '/gallery' }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Result sections
// ---------------------------------------------------------------------------

function ResultGroup({
  id,
  title,
  count,
  description,
  children,
}: {
  id: string
  title: string
  count: number
  description: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <div>
        <h2 id={`${id}-heading`} className="font-display text-2xl font-semibold text-ink">
          {title}
          <Badge variant="accent" size="md" className="ml-2.5 align-middle">
            {count}
          </Badge>
        </h2>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function MoreLink({ to, label }: { to: string; label: string }) {
  return (
    <p className="mt-5">
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-bronze-dark underline underline-offset-4 transition-colors hover:text-ink"
      >
        {label}
        <span aria-hidden>→</span>
      </Link>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Result rows
// ---------------------------------------------------------------------------

function ServiceResult({ service }: { service: ServiceCatalogEntry }) {
  return (
    <li>
      <Card interactive className="group h-full overflow-hidden">
        <Link to={`/services/${service.slug}`} className="flex h-full flex-col">
          <MediaFrame
            src={service.image_url}
            alt={service.name}
            seed={service.slug}
            aspect="4/3"
            imgClassName="transition-transform duration-500 ease-[var(--ease-editorial)] group-hover:scale-[1.04]"
          />
          <div className="flex flex-1 flex-col p-4">
            {service.category_name && (
              <p className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                {service.category_name}
              </p>
            )}
            <h3 className="line-clamp-2 font-display text-[0.9375rem] font-semibold leading-snug text-ink transition-colors group-hover:text-bronze-dark">
              {service.name}
            </h3>
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
              {service.summary}
            </p>
            <p className="mt-auto pt-3 text-xs text-muted">
              From {formatNaira(service.price_from, { compact: true })} ·{' '}
              {formatDuration(service.duration_minutes)}
            </p>
          </div>
        </Link>
      </Card>
    </li>
  )
}

function ProductResult({ product }: { product: ProductCatalogEntry }) {
  const price = product.variant_price ?? product.base_price

  return (
    <li>
      <Card interactive className="group h-full overflow-hidden">
        <Link to={`/shop/${product.slug}`} className="flex h-full flex-col">
          <MediaFrame
            src={product.variant_image_url ?? product.image_url}
            alt={product.name}
            seed={product.slug}
            aspect="square"
            imgClassName="transition-transform duration-500 ease-[var(--ease-editorial)] group-hover:scale-[1.04]"
          />
          <div className="flex flex-1 flex-col p-4">
            {product.brand && (
              <p className="mb-1 text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted">
                {product.brand}
              </p>
            )}
            <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors group-hover:text-bronze-dark">
              {product.name}
            </h3>
            <p className="mt-auto pt-3 text-sm font-semibold text-ink">
              {formatNaira(price)}
              {product.available_stock <= 0 && (
                <span className="ml-2 text-xs font-normal text-muted">Out of stock</span>
              )}
            </p>
          </div>
        </Link>
      </Card>
    </li>
  )
}

function JobResult({ job }: { job: Job }) {
  return (
    <li>
      <Card interactive className="group h-full p-5">
        <Link to={`/careers/${job.slug}`} className="flex h-full flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-ink transition-colors group-hover:text-bronze-dark">
              {job.title}
            </h3>
            {job.is_featured && (
              <Badge variant="accent" size="sm">
                Featured
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {job.department ?? 'Studio'} · {humanise(job.employment_type)} ·{' '}
            {job.openings} {job.openings === 1 ? 'opening' : 'openings'}
          </p>
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{job.summary}</p>
          <p className="mt-auto pt-4 text-sm font-medium text-bronze-dark">View role →</p>
        </Link>
      </Card>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluraliseResults(total: number): string {
  if (total === 0) return 'No results'
  return `${total} ${total === 1 ? 'result' : 'results'}`
}
