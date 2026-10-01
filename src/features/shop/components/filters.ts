import type { ProductFilters } from '@/lib/api'
import type { HairClass, ProductKind, ProductCategory } from '@/types'

/**
 * Shop filter model.
 *
 * The URL is the single source of truth: every filter lives in the query string
 * so a filtered shop is shareable, survives a refresh and matches the deep
 * links in the site footer (`/shop?kind=wig`).
 */

export type SortKey = NonNullable<ProductFilters['sort']>

export interface ShopFilterState {
  kind?: ProductKind
  category?: string
  hairClass?: HairClass
  minPrice?: number
  maxPrice?: number
  inStockOnly: boolean
  sort: SortKey
  search?: string
}

/** Query-string keys, in the order they read in the URL. */
export const PARAM = {
  kind: 'kind',
  category: 'category',
  hairClass: 'hair_class',
  min: 'min',
  max: 'max',
  stock: 'stock',
  sort: 'sort',
  search: 'q',
} as const

export const KIND_LABELS: Record<ProductKind, string> = {
  wig: 'Wigs',
  extension: 'Extensions',
  hair_care: 'Hair Care',
  styling: 'Styling Tools',
  accessory: 'Accessories',
  tool: 'Tools',
  treatment: 'Treatments',
}

const KINDS = Object.keys(KIND_LABELS) as ProductKind[]

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'rating', label: 'Top rated' },
]

export const HAIR_CLASS_OPTIONS: { value: HairClass; label: string; description: string }[] = [
  { value: 'human', label: 'Human hair', description: '100% ethically sourced human hair' },
  { value: 'blend', label: 'Blend', description: 'Human hair mixed with premium fibre' },
  { value: 'synthetic', label: 'Synthetic', description: 'Heat-friendly fibre, washable and affordable' },
]

export interface PriceBand {
  id: string
  label: string
  min?: number
  max?: number
}

export const PRICE_BANDS: PriceBand[] = [
  { id: 'under-25', label: 'Under ₦25k', max: 25_000 },
  { id: '25-75', label: '₦25k – ₦75k', min: 25_000, max: 75_000 },
  { id: '75-150', label: '₦75k – ₦150k', min: 75_000, max: 150_000 },
  { id: 'over-150', label: '₦150k and above', min: 150_000 },
]

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function isProductKind(value: string | null): value is ProductKind {
  return value !== null && KINDS.includes(value as ProductKind)
}

export function isHairClass(value: string | null): value is HairClass {
  return value !== null && (['human', 'blend', 'synthetic', 'vegan'] as string[]).includes(value)
}

export function isSortKey(value: string | null): value is SortKey {
  return value !== null && SORT_OPTIONS.some((option) => option.value === value)
}

function toAmount(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function parseFilters(params: URLSearchParams): ShopFilterState {
  const kind = params.get(PARAM.kind)
  const hairClass = params.get(PARAM.hairClass)
  const sort = params.get(PARAM.sort)
  const category = params.get(PARAM.category)
  const search = params.get(PARAM.search)?.trim()

  return {
    kind: isProductKind(kind) ? kind : undefined,
    category: category || undefined,
    hairClass: isHairClass(hairClass) ? hairClass : undefined,
    minPrice: toAmount(params.get(PARAM.min)),
    maxPrice: toAmount(params.get(PARAM.max)),
    inStockOnly: params.get(PARAM.stock) === '1',
    sort: isSortKey(sort) ? sort : 'featured',
    search: search || undefined,
  }
}

/** Shape handed to `getProducts` and to `qk.products`. */
export function toProductFilters(state: ShopFilterState): ProductFilters {
  return {
    ...(state.kind ? { kind: state.kind } : {}),
    ...(state.category ? { category: state.category } : {}),
    ...(state.hairClass ? { hairClass: state.hairClass } : {}),
    ...(state.minPrice !== undefined ? { minPrice: state.minPrice } : {}),
    ...(state.maxPrice !== undefined ? { maxPrice: state.maxPrice } : {}),
    ...(state.inStockOnly ? { inStockOnly: true } : {}),
    ...(state.search ? { search: state.search } : {}),
    sort: state.sort,
  }
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export interface ActiveChip {
  /** Query-string key to delete when the chip is dismissed. */
  id: string
  label: string
}

export function activeChips(
  state: ShopFilterState,
  categories: ProductCategory[],
): ActiveChip[] {
  const chips: ActiveChip[] = []

  if (state.kind) {
    chips.push({ id: PARAM.kind, label: KIND_LABELS[state.kind] })
  }

  if (state.category) {
    const category = categories.find((entry) => entry.slug === state.category)
    chips.push({ id: PARAM.category, label: category?.name ?? state.category })
  }

  if (state.hairClass) {
    const label =
      HAIR_CLASS_OPTIONS.find((option) => option.value === state.hairClass)?.label ??
      state.hairClass
    chips.push({ id: PARAM.hairClass, label })
  }

  // A band matches on both bounds; every band sets at least one, so an
  // untouched price filter never matches one by accident.
  const band = PRICE_BANDS.find(
    (candidate) => candidate.min === state.minPrice && candidate.max === state.maxPrice,
  )
  if (band) {
    chips.push({ id: 'price', label: band.label })
  } else if (state.minPrice !== undefined || state.maxPrice !== undefined) {
    const from = state.minPrice !== undefined ? `₦${state.minPrice.toLocaleString('en-NG')}` : '₦0'
    const to = state.maxPrice !== undefined ? `₦${state.maxPrice.toLocaleString('en-NG')}` : 'any'
    chips.push({ id: 'price', label: `${from} – ${to}` })
  }

  if (state.inStockOnly) {
    chips.push({ id: PARAM.stock, label: 'In stock only' })
  }

  if (state.search) {
    chips.push({ id: PARAM.search, label: `“${state.search}”` })
  }

  return chips
}

/** Active chip ids that map to more than one query parameter. */
export const CHIP_PARAM_KEYS: Record<string, string[]> = {
  price: [PARAM.min, PARAM.max],
}
