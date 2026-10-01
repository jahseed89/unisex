import { useId } from 'react'
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react'

import { Button, Checkbox, Input } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import {
  HAIR_CLASS_OPTIONS,
  KIND_LABELS,
  PRICE_BANDS,
  type ShopFilterState,
} from './filters'
import type { HairClass, ProductCategory, ProductKind } from '@/types'

/**
 * Faceted filters.
 *
 * Rendered twice — once in the desktop sidebar, once inside the mobile bottom
 * sheet. It is therefore a pure function of its props: all state lives in the
 * page, which owns the query string.
 */
export interface ShopFiltersProps {
  state: ShopFilterState
  categories: ProductCategory[]
  onChange: (patch: Partial<ShopFilterState>) => void
  onClear: () => void
  /** Present when rendered in the mobile sheet, to close it on apply. */
  onDone?: () => void
  className?: string
}

export function ShopFilters({
  state,
  categories,
  onChange,
  onClear,
  onDone,
  className,
}: ShopFiltersProps) {
  const minId = useId()
  const maxId = useId()

  return (
    <div className={cn('space-y-7', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <SlidersHorizontal className="size-4 text-bronze" aria-hidden />
          Filters
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </Button>
      </div>

      {/* Type ------------------------------------------------------ */}
      <FilterGroup legend="Type">
        <PillGroup>
          {(Object.keys(KIND_LABELS) as ProductKind[]).map((kind) => (
            <Pill
              key={kind}
              active={state.kind === kind}
              onClick={() => onChange({ kind: state.kind === kind ? undefined : kind })}
            >
              {KIND_LABELS[kind]}
            </Pill>
          ))}
        </PillGroup>
      </FilterGroup>

      {/* Category ------------------------------------------------- */}
      {categories.length > 0 && (
        <FilterGroup legend="Category">
          <PillGroup>
            {categories.map((category) => (
              <Pill
                key={category.id}
                active={state.category === category.slug}
                onClick={() =>
                  onChange({
                    category: state.category === category.slug ? undefined : category.slug,
                  })
                }
              >
                {category.name}
              </Pill>
            ))}
          </PillGroup>
        </FilterGroup>
      )}

      {/* Hair class ----------------------------------------------- */}
      <FilterGroup legend="Hair class">
        <ul className="space-y-2">
          {HAIR_CLASS_OPTIONS.map((option) => {
            const active = state.hairClass === option.value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange({ hairClass: active ? undefined : (option.value as HairClass) })
                  }
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-bronze bg-bronze/[0.06]'
                      : 'border-line hover:border-line-strong hover:bg-sand/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors',
                      active ? 'border-bronze bg-bronze text-white' : 'border-line-strong',
                    )}
                    aria-hidden
                  >
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </FilterGroup>

      {/* Price ---------------------------------------------------- */}
      <FilterGroup legend="Price">
        <PillGroup>
          {PRICE_BANDS.map((band) => {
            const active = band.min === state.minPrice && band.max === state.maxPrice
            return (
              <Pill
                key={band.id}
                active={active}
                onClick={() =>
                  active
                    ? onChange({ minPrice: undefined, maxPrice: undefined })
                    : onChange({ minPrice: band.min, maxPrice: band.max })
                }
              >
                {band.label}
              </Pill>
            )
          })}
        </PillGroup>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={minId}
              className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft"
            >
              Min
            </label>
            <Input
              id={minId}
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder="₦0"
              // Re-keyed so the field resets when a band chip changes the range.
              key={`min-${state.minPrice ?? ''}`}
              defaultValue={state.minPrice ?? ''}
              onBlur={(event) => {
                const value = Number.parseInt(event.target.value, 10)
                onChange({ minPrice: Number.isFinite(value) && value > 0 ? value : undefined })
              }}
            />
          </div>
          <div>
            <label
              htmlFor={maxId}
              className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft"
            >
              Max
            </label>
            <Input
              id={maxId}
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder="Any"
              key={`max-${state.maxPrice ?? ''}`}
              defaultValue={state.maxPrice ?? ''}
              onBlur={(event) => {
                const value = Number.parseInt(event.target.value, 10)
                onChange({ maxPrice: Number.isFinite(value) && value > 0 ? value : undefined })
              }}
            />
          </div>
        </div>
      </FilterGroup>

      {/* Availability --------------------------------------------- */}
      <div className="border-t border-line pt-5">
        <Checkbox
          id="in-stock-only"
          checked={state.inStockOnly}
          onChange={(event) => onChange({ inStockOnly: event.target.checked })}
          label="In stock only"
          description="Hide pieces that are currently sold out."
        />
      </div>

      {onDone && (
        <div className="safe-bottom sticky bottom-0 -mx-5 border-t border-line bg-surface px-5 py-4">
          <Button fullWidth size="lg" variant="accent" onClick={onDone}>
            Show results
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function FilterGroup({
  legend,
  children,
}: {
  legend: string
  children: React.ReactNode
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}

function PillGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

function Pill({
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
        'min-h-11 rounded-pill border px-3.5 text-[0.8125rem] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
