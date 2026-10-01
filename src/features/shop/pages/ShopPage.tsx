import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PackageSearch, Search, Sparkles, Truck } from 'lucide-react'

import { getProductCategories, getProducts, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { useCart } from '@/features/cart/CartProvider'
import { useSeo, breadcrumbSchema } from '@/components/seo/Seo'
import { PageHeader, ProductCard } from '@/components/shared/Cards'
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTrigger,
} from '@/components/ui'
import { CardGridSkeleton } from '@/components/layout/RouteLoader'
import { ActiveFilterChips } from '@/features/shop/components/ActiveFilterChips'
import { ShopFilters } from '@/features/shop/components/ShopFilters'
import {
  CHIP_PARAM_KEYS,
  KIND_LABELS,
  PARAM,
  SORT_OPTIONS,
  activeChips,
  parseFilters,
  toProductFilters,
  type ShopFilterState,
} from '@/features/shop/components/filters'
import type { ProductCatalogEntry } from '@/types'

/**
 * The boutique.
 *
 * Filters live in the query string, so the footer deep links (`/shop?kind=wig`)
 * and a shared filtered URL behave identically. Filtering, sorting and price
 * banding are all applied by `getProducts`; this page never narrows the result
 * set itself.
 */
export default function ShopPage() {
  const [params, setParams] = useSearchParams()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { addItem } = useCart()

  const state = useMemo(() => parseFilters(params), [params])
  const filters = useMemo(() => toProductFilters(state), [state])

  const categoriesQuery = useQuery({
    queryKey: qk.productCategories(),
    queryFn: getProductCategories,
    staleTime: 10 * 60_000,
  })

  const productsQuery = useQuery({
    // Spreading satisfies `qk`'s Record signature without weakening the filter type.
    queryKey: qk.products({ ...filters }),
    queryFn: () => getProducts(filters),
    staleTime: 5 * 60_000,
  })

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const products = productsQuery.data ?? []
  const chips = useMemo(() => activeChips(state, categories), [state, categories])
  const kind = state.kind

  useSeo({
    title: kind ? `${KIND_LABELS[kind]} — shop hair online` : 'Shop wigs, extensions & hair care',
    description:
      'Shop raw bundles, wigs, lace fronts, clip-in extensions and salon-grade hair care at Unisex Hair Studio, Lagos. Filter by hair class, length and price, then pay by card or bank transfer.',
    path: kind ? `/shop?kind=${kind}` : '/shop',
    jsonLd: [breadcrumbSchema([{ name: 'Shop', path: '/shop' }])],
  })

  // --- URL mutations -------------------------------------------------------
  const writeParams = useCallback(
    (next: URLSearchParams) => setParams(next, { preventScrollReset: true }),
    [setParams],
  )

  const onChange = useCallback(
    (patch: Partial<ShopFilterState>) => {
      const next = new URLSearchParams(params)
      applyPatch(next, patch)
      writeParams(next)
    },
    [params, writeParams],
  )

  const onClear = useCallback(() => {
    const next = new URLSearchParams()
    // Sorting and the search term are not facets; keep them.
    if (state.sort !== 'featured') next.set(PARAM.sort, state.sort)
    if (state.search) next.set(PARAM.search, state.search)
    writeParams(next)
  }, [state.search, state.sort, writeParams])

  const onRemoveChip = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params)
      for (const key of CHIP_PARAM_KEYS[id] ?? [id]) next.delete(key)
      writeParams(next)
    },
    [params, writeParams],
  )

  const onQuickAdd = useCallback(
    (product: ProductCatalogEntry) => {
      if (!product.variant_id) return
      void addItem(product.variant_id, 1, {
        slug: product.slug,
        price: product.variant_price ?? product.base_price,
      })
    },
    [addItem],
  )

  const heading = kind ? KIND_LABELS[kind] : 'Everything for your hair'

  return (
    <>
      <PageHeader
        eyebrow="The boutique"
        title={heading}
        description={
          kind
            ? `${KIND_LABELS[kind]} we keep in stock at the studio — graded bundles, ready-to-wear units and the accessories that make them sit properly.`
            : 'Wigs, extensions, treatments and tools — the same stock we use in the salon chairs on Adeola Odeku.'
        }
        breadcrumb={[{ label: 'Shop', to: '/shop' }]}
      >
        <SearchBar
          value={state.search ?? ''}
          onSubmit={(term) => onChange({ search: term || undefined })}
        />
      </PageHeader>

      {/* Editorial band ---------------------------------------------------- */}
      <section className="border-b border-line bg-sand/40">
        <div className="container-page grid gap-8 py-12 md:grid-cols-3 md:gap-10 md:py-16">
          <div className="md:col-span-2">
            <p className="eyebrow mb-3">Hair we will stand behind</p>
            <h2 className="font-display text-2xl leading-tight text-ink md:text-3xl">
              Double-drawn, cuticle-aligned, honestly graded.
            </h2>
            <div className="mt-4 max-w-2xl space-y-3.5 text-sm leading-relaxed text-ink-soft">
              <p>
                Every bundle we sell is double-drawn — no short hairs at the ends, so the hair blends
                with your own without a visible line. We align the cuticle in one direction before we
                tie the weft, which is what keeps tangles down and shine up after the third wash.
              </p>
              <p>
                Grade matters more than marketing. We weigh each bundle at the root and the tip and
                label the real density, so 18 inches at full single-drawn is not the same as 18 inches
                on a double weft. If a listing says single-drawn, it is single-drawn.
              </p>
              <p>
                Lace is 13×13 HD from Uncharted or L&amp;T, so it melts into the skin at the hairline
                instead of sitting on top of it. Every frontal arrives cut-ready and comes with the
                elastic band, wig grip and edge control our stylists actually use in the chair.
              </p>
            </div>
          </div>

          <ul className="space-y-4 md:border-l md:border-line md:pl-8">
            <Assurance
              icon={<Sparkles className="size-4" aria-hidden />}
              title="Weighed, not guessed"
              body="Every unit is weighed at the studio and graded on a scale you can check."
            />
            <Assurance
              icon={<Truck className="size-4" aria-hidden />}
              title="Same-day pickup in Lagos"
              body="Order before 4pm on a working day and collect from Victoria Island that evening."
            />
            <Assurance
              icon={<PackageSearch className="size-4" aria-hidden />}
              title="Nothing in the fine print"
              body="Density, cap construction, length and weight are on the label, not in the description."
            />
          </ul>
        </div>
      </section>

      {/* Catalogue --------------------------------------------------------- */}
      <div className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-[17rem_1fr] lg:gap-12">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block" aria-label="Product filters">
            <div className="sticky top-40 max-h-[calc(100dvh-11rem)] overflow-y-auto pr-2">
              <ShopFilters
                state={state}
                categories={categories}
                onChange={onChange}
                onClear={onClear}
              />
            </div>
          </aside>

          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted" aria-live="polite">
                {productsQuery.isLoading
                  ? 'Loading products…'
                  : `${products.length} product${products.length === 1 ? '' : 's'}`}
              </p>

              <div className="flex items-center gap-2.5">
                {/* Mobile filters */}
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="md" className="lg:hidden">
                      <PackageSearch className="size-4" aria-hidden />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" title="Filter products">
                    <SheetHeader>
                      <h2 className="font-display text-base font-semibold text-ink">
                        Filter products
                      </h2>
                    </SheetHeader>
                    <SheetBody>
                      <ShopFilters
                        state={state}
                        categories={categories}
                        onChange={onChange}
                        onClear={onClear}
                        onDone={() => setSheetOpen(false)}
                      />
                    </SheetBody>
                    <SheetFooter>
                      <Button
                        fullWidth
                        size="lg"
                        variant="accent"
                        onClick={() => setSheetOpen(false)}
                      >
                        Show {products.length} result{products.length === 1 ? '' : 's'}
                      </Button>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>

                <div className="w-52">
                  <label htmlFor="shop-sort" className="sr-only">
                    Sort products
                  </label>
                  <Select
                    id="shop-sort"
                    value={state.sort}
                    onChange={(event) => {
                      const next = event.target.value
                      onChange({
                        sort: SORT_OPTIONS.some((option) => option.value === next)
                          ? (next as ShopFilterState['sort'])
                          : 'featured',
                      })
                    }}
                    options={SORT_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </div>
              </div>
            </div>

            <ActiveFilterChips
              className="mt-4"
              chips={chips}
              resultCount={products.length}
              onRemove={onRemoveChip}
              onClearAll={onClear}
            />

            {/* Results */}
            <div className="mt-6">
              {productsQuery.isLoading && (
                <CardGridSkeleton count={9} className="grid-cols-2 lg:grid-cols-3" />
              )}

              {productsQuery.isError && (
                <Alert
                  variant="danger"
                  title="We could not load the catalogue"
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void productsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  }
                >
                  {errorMessage(productsQuery.error)}
                </Alert>
              )}

              {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 && (
                <EmptyState
                  icon={<PackageSearch className="size-5" aria-hidden />}
                  title="Nothing matches those filters"
                  description="Try widening the price range, or clear the filters to see the full shelf — new stock lands every week."
                  action={
                    <Button variant="outline" size="lg" onClick={onClear}>
                      Clear all filters
                    </Button>
                  }
                />
              )}

              {!productsQuery.isLoading && products.length > 0 && (
                <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
                  {products.map((product, index) => (
                    <li key={product.id} className="flex">
                      <ProductCard
                        product={product}
                        className="w-full"
                        priority={index < 3}
                        onQuickAdd={onQuickAdd}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function SearchBar({
  value,
  onSubmit,
}: {
  value: string
  onSubmit: (term: string) => void
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        onSubmit(String(form.get('q') ?? '').trim())
      }}
      className="flex w-full max-w-md gap-2"
    >
      <label htmlFor="shop-search" className="sr-only">
        Search products
      </label>
      <Input
        key={value}
        id="shop-search"
        name="q"
        type="search"
        defaultValue={value}
        placeholder="Search bundles, wigs, shampoo…"
        leadingIcon={<Search className="size-4" aria-hidden />}
      />
      <Button type="submit" size="md" variant="outline">
        Search
      </Button>
    </form>
  )
}

function Assurance({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-bronze shadow-xs">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  )
}

/** Apply a partial filter state onto a mutable search-params bag. */
function applyPatch(next: URLSearchParams, patch: Partial<ShopFilterState>): void {
  const set = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === '' || value === false) next.delete(key)
    else next.set(key, String(value))
  }

  if ('kind' in patch) set(PARAM.kind, patch.kind)
  if ('category' in patch) set(PARAM.category, patch.category)
  if ('hairClass' in patch) set(PARAM.hairClass, patch.hairClass)
  if ('minPrice' in patch) set(PARAM.min, patch.minPrice)
  if ('maxPrice' in patch) set(PARAM.max, patch.maxPrice)
  if ('inStockOnly' in patch) set(PARAM.stock, patch.inStockOnly ? '1' : undefined)
  if ('search' in patch) set(PARAM.search, patch.search)
  if ('sort' in patch) set(PARAM.sort, patch.sort)
}
