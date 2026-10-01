import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarSearch, Scissors, Search, X } from 'lucide-react'

import {
  errorMessage,
  getServiceCategories,
  getServices,
  qk,
  type ServiceFilters,
} from '@/lib/api'
import { Alert, Button, EmptyState, Input } from '@/components/ui'
import { CardGridSkeleton } from '@/components/layout/RouteLoader'
import { PageHeader, ServiceCard } from '@/components/shared/Cards'
import { Section } from '@/components/shared/Blocks'
import { useSeo } from '@/components/seo/Seo'
import { analytics } from '@/lib/analytics'
import { cn } from '@/lib/utils/cn'
import { pluralise } from '@/lib/utils/format'

/**
 * Service discovery.
 *
 * Both filters live in the URL, so a filtered list is shareable and the back
 * button walks the user's filter history rather than the page history. The
 * fetch itself is TanStack Query against `getServices`, keyed on the filter
 * object, which keeps one cache entry per filter combination.
 */
export default function ServicesPage() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const activeSearch = params.get('q') ?? ''

  // The input is local so typing stays responsive; the URL catches up on a
  // short debounce and stays the single source of truth once it lands.
  const [term, setTerm] = useState(activeSearch)

  useSeo({
    title: 'Services & pricing',
    description:
      'Every hair, braids, locs, colour and styling service at Unisex Hair Studio Lagos — transparent pricing, honest durations, bookable online.',
    path: '/services',
  })

  // Keep the box in step with back/forward navigation.
  useEffect(() => {
    setTerm(activeSearch)
  }, [activeSearch])

  useEffect(() => {
    if (term === activeSearch) return
    const timer = window.setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (term.trim()) next.set('q', term.trim())
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => window.clearTimeout(timer)
  }, [term, activeSearch, setParams])

  const filters = useMemo<ServiceFilters>(() => {
    const next: ServiceFilters = {}
    if (category) next.category = category
    if (activeSearch.trim()) next.search = activeSearch.trim()
    return next
  }, [category, activeSearch])

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: qk.serviceCategories(),
    queryFn: getServiceCategories,
    staleTime: 10 * 60_000,
  })

  const {
    data: services = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.services(Object.keys(filters).length ? filters : undefined),
    queryFn: () => getServices(filters),
    staleTime: 5 * 60_000,
  })

  const patch = (next: Record<string, string | null>) => {
    setParams((previous) => {
      const params = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      return params
    })
  }

  const hasFilters = Boolean(category || activeSearch.trim())
  const clearFilters = () =>
    setParams((previous) => {
      const params = new URLSearchParams(previous)
      params.delete('category')
      params.delete('q')
      return params
    })

  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Every service, priced in the open."
        description="Hair, braids, locs, colour and styling for everyone. Pick what you want, pick who does it, and share a reference — your stylist walks in already knowing."
        action={
          <Button asChild size="lg">
            <Link to="/book">Book an Appointment</Link>
          </Button>
        }
      >
        <div className="space-y-5">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              if (activeSearch.trim()) {
                analytics.search(activeSearch.trim(), category || undefined)
              }
            }}
            className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
          >
            <label htmlFor="service-search" className="sr-only">
              Search services
            </label>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                id="service-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search braids, locs, colour, treatments…"
                className="pl-10"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2.5">
              <Button type="submit" variant="outline" size="md">
                Search
              </Button>
              {hasFilters && (
                <Button type="button" variant="ghost" size="md" onClick={clearFilters}>
                  <X aria-hidden />
                  Clear
                </Button>
              )}
            </div>
          </form>

          <nav aria-label="Filter by category">
            <ul className="rail gap-2 pb-1 no-scrollbar">
              <li>
                <CategoryChip
                  label="All services"
                  active={!category}
                  onClick={() => patch({ category: null })}
                />
              </li>
              {categories.map((item) => (
                <li key={item.id}>
                  <CategoryChip
                    label={item.name}
                    active={category === item.slug}
                    onClick={() =>
                      patch({ category: category === item.slug ? null : item.slug })
                    }
                  />
                </li>
              ))}
              {categoriesLoading &&
                Array.from({ length: 4 }, (_, index) => (
                  <li key={index}>
                    <span className="skeleton block h-9 w-28 rounded-pill" aria-hidden />
                  </li>
                ))}
            </ul>
          </nav>

          {categoriesError && (
            <Alert
              variant="warning"
              title="Categories are unavailable"
              action={
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              }
            >
              {errorMessage(categoriesError, 'We could not load the service categories.')}
            </Alert>
          )}
        </div>
      </PageHeader>

      <Section tone="canvas">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-muted" role="status" aria-live="polite">
            {isLoading
              ? 'Loading services…'
              : services.length === 0
                ? 'No services match those filters'
                : `${pluralise(services.length, 'service')} available`}
          </p>
          {isFetching && !isLoading && (
            <span className="text-xs text-faint" role="status">
              Updating…
            </span>
          )}
        </div>

        {error ? (
          <Alert
            variant="danger"
            title="We could not load the service list"
            action={
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            }
          >
            {errorMessage(error)}
          </Alert>
        ) : isLoading ? (
          <CardGridSkeleton count={6} />
        ) : services.length === 0 ? (
          <EmptyState
            icon={<Scissors aria-hidden />}
            title="Nothing matches that yet"
            description={
              hasFilters
                ? 'Try a different word, or clear the filters to see the whole menu.'
                : 'The service catalogue is being updated. Please check back shortly.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="lg" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link to="/contact">Ask us instead</Link>
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, index) => (
              <ServiceCard key={service.id} service={service} priority={index < 3} />
            ))}
          </div>
        )}

        <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted">
          <CalendarSearch className="size-4 text-bronze" aria-hidden />
          Not sure which service you need?{' '}
          <Link to="/contact" className="font-medium text-bronze-dark underline underline-offset-4">
            Ask a stylist
          </Link>{' '}
          — we will point you to the right chair.
        </p>
      </Section>
    </>
  )
}

/** Pill filter. A real button so it is keyboard-operable and announces state. */
function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center rounded-pill border px-4 text-[0.8125rem] font-medium transition-colors duration-200',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:bg-sand',
      )}
    >
      {label}
    </button>
  )
}
