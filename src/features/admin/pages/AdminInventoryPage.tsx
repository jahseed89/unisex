import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, History, PackageSearch, TriangleAlert } from 'lucide-react'

import { listInventoryMovements, listLowStock, listProductCategoriesAdmin, qk } from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Pagination,
  Select,
  Stat,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  Chip,
  ChipRow,
  Panel,
} from '../components/adminKit'
import { listVariantsWithProductsAdmin } from '../components/adminReads'
import { StockAdjustDialog } from '../components/StockAdjustDialog'
import type { StockAdjustTarget } from '../components/StockAdjustDialog'
import { formatDateTime, formatNaira, humanise } from '@/lib/utils/format'

/**
 * Inventory.
 *
 * Three views over one dataset: what needs reordering, everything on hand, and
 * the movement ledger. The ledger is the authoritative history — the stock
 * figure on a variant is only ever changed through it.
 *
 * There is deliberately no "inventory value" figure. Cost price exists in the
 * schema but is not exposed through any read the admin surface has, and a
 * retail-value number dressed up as cost would be worse than no number at all.
 */

const PAGE_SIZE = 25

const VARIANT_FILTERS = [
  { id: 'all', label: 'All SKUs' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
  { id: 'backorder', label: 'Backorder' },
] as const

type VariantFilter = (typeof VARIANT_FILTERS)[number]['id']

export default function AdminInventoryPage() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<VariantFilter>(
    (params.get('filter') as VariantFilter) ?? 'all',
  )
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [movementVariant, setMovementVariant] = useState('')
  const [stockTarget, setStockTarget] = useState<StockAdjustTarget | null>(null)

  const lowStockQuery = useQuery({
    queryKey: qk.inventory(),
    queryFn: listLowStock,
    staleTime: 60_000,
  })

  const variantsQuery = useQuery({
    queryKey: qk.inventory('all-variants'),
    queryFn: listVariantsWithProductsAdmin,
    staleTime: 60_000,
  })

  const categoriesQuery = useQuery({
    queryKey: qk.productCategories(),
    queryFn: listProductCategoriesAdmin,
    staleTime: 10 * 60_000,
  })

  const movementsQuery = useQuery({
    queryKey: qk.inventory(movementVariant || undefined),
    queryFn: () => listInventoryMovements(movementVariant || undefined, 100),
    staleTime: 30_000,
  })

  // Defaulted here rather than at each use site: the query returns undefined
  // while loading and on error, and every consumer wants an empty list then.
  const variants = variantsQuery.data ?? []
  const lowStock = lowStockQuery.data ?? []

  const setFilterParam = (next: VariantFilter) => {
    setFilter(next)
    setPage(1)
    const updated = new URLSearchParams(params)
    if (next === 'all') updated.delete('filter')
    else updated.set('filter', next)
    setParams(updated, { replace: true })
  }

  // Client-side over the full variant set: `listLowStock` only returns the rows
  // already below threshold, so it cannot back the search or category filter.
  // The list is one row per SKU, so filtering it inline is cheaper than the
  // query round trip a server-side filter would need.
  const term = search.trim().toLowerCase()
  const filtered = variants.filter((variant) => {
    if (categoryId && variant.category_id !== categoryId) return false
    if (filter === 'low' && variant.stock_on_hand > variant.low_stock_threshold) return false
    if (filter === 'out' && variant.stock_on_hand > 0) return false
    if (filter === 'backorder' && !variant.backorder_allowed) return false
    if (!term) return true
    return (
      variant.sku.toLowerCase().includes(term) ||
      variant.name.toLowerCase().includes(term) ||
      variant.product_name.toLowerCase().includes(term)
    )
  })

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const activeSkus = variants.filter((variant) => variant.is_active)
  const outOfStock = activeSkus.filter((variant) => variant.stock_on_hand === 0)
  const belowThreshold = activeSkus.filter(
    (variant) => variant.stock_on_hand > 0 && variant.stock_on_hand <= variant.low_stock_threshold,
  )
  const onHandUnits = activeSkus.reduce((sum, variant) => sum + variant.stock_on_hand, 0)

  const movements = movementsQuery.data ?? []
  const variantName = (id: string) =>
    variants.find((variant) => variant.id === id)?.sku ?? 'Removed variant'

  return (
    <AdminShell
      eyebrow="Administration"
      title="Inventory"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Stock levels across the boutique. Every change is written to the movement ledger, so a discrepancy always has an explanation."
      actions={
        <Button asChild variant="outline">
          <Link to="/admin/products">Manage products</Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active SKUs" value={activeSkus.length} icon={<Boxes aria-hidden />} hint={`${variants.length} in total, including hidden`} />
        <Stat label="Units on hand" value={onHandUnits} icon={<PackageSearch aria-hidden />} hint="Across every active variant" />
        <Stat
          label="Below threshold"
          value={belowThreshold.length}
          icon={<TriangleAlert aria-hidden />}
          hint="Time to reorder"
        />
        <Stat
          label="Out of stock"
          value={outOfStock.length}
          icon={<TriangleAlert aria-hidden />}
          hint="Active variants with nothing on hand"
        />
      </div>

      {/* ----------------------------------------------------------------
          Low stock
      ---------------------------------------------------------------- */}
      <Panel
        className="mt-5"
        title="Reorder alerts"
        description="Active variants at or below their reorder threshold, worst first."
        bodyClassName="p-0"
      >
        <AsyncSection
          isLoading={lowStockQuery.isLoading}
          isError={lowStockQuery.isError}
          error={lowStockQuery.error}
          onRetry={() => void lowStockQuery.refetch()}
          isEmpty={lowStock.length === 0}
          empty={
            <div className="p-8 text-center">
              <Boxes className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
              <p className="text-sm text-muted">
                Every active SKU is above its reorder threshold. Nothing needs ordering.
              </p>
            </div>
          }
          skeleton={<div className="h-48 animate-pulse bg-sand/60" />}
          className="p-5"
        >
          <ul className="divide-y divide-line">
            {[...lowStock]
              .sort((a, b) => a.stock_on_hand - b.stock_on_hand)
              .map((variant) => (
                <li
                  key={variant.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/products/${variant.product_id}`}
                      className="block truncate text-sm font-medium text-ink transition-colors hover:text-bronze-dark"
                    >
                      {variant.product_name || variant.name}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {variant.name} · {variant.sku}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={
                        variant.stock_on_hand === 0
                          ? 'text-sm font-semibold tabular-nums text-danger'
                          : 'text-sm font-semibold tabular-nums text-warning'
                      }
                    >
                      {variant.stock_on_hand === 0
                        ? 'Out of stock'
                        : `${variant.stock_on_hand} left`}
                    </p>
                    <p className="text-xs text-muted">
                      reorder at {variant.low_stock_threshold}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStockTarget({
                        variantId: variant.id,
                        sku: variant.sku,
                        name: variant.name,
                        productName: variant.product_name || 'Product',
                        stockOnHand: variant.stock_on_hand,
                      })
                    }
                  >
                    Adjust stock
                  </Button>
                </li>
              ))}
          </ul>
        </AsyncSection>
      </Panel>

      {/* ----------------------------------------------------------------
          All variants
      ---------------------------------------------------------------- */}
      <Panel
        className="mt-5"
        title="All variants"
        description={`${filtered.length} of ${variants.length} variants`}
        bodyClassName="p-0"
      >
        <div className="space-y-4 border-b border-line px-5 py-4">
          <ChipRow label="Stock filter">
            {VARIANT_FILTERS.map((option) => (
              <Chip
                key={option.id}
                active={filter === option.id}
                onClick={() => setFilterParam(option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </ChipRow>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Search" htmlFor="variant-search" hint="Matches SKU, variant or product name.">
              <Input
                id="variant-search"
                type="search"
                value={search}
                placeholder="BUN-18, bundles, oil…"
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="Category" htmlFor="variant-category">
              <Select
                id="variant-category"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  setPage(1)
                }}
                placeholder="All categories"
                options={(categoriesQuery.data ?? []).map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />
            </Field>
          </div>
        </div>

        <AsyncSection
          isLoading={variantsQuery.isLoading}
          isError={variantsQuery.isError}
          error={variantsQuery.error}
          onRetry={() => void variantsQuery.refetch()}
          isEmpty={filtered.length === 0}
          empty={
            <div className="p-8 text-center">
              <PackageSearch className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
              <p className="text-sm text-muted">
                {(variants.length) === 0
                  ? 'No variants exist yet. Add one from a product.'
                  : 'No variants match these filters.'}
              </p>
            </div>
          }
          skeleton={<div className="h-72 animate-pulse bg-sand/60" />}
          className="p-5"
        >
          <>
            <Table>
              <caption className="sr-only">All product variants</caption>
              <THead>
                <tr>
                  <TH scope="col">SKU</TH>
                  <TH scope="col">Product</TH>
                  <TH scope="col">Variant</TH>
                  <TH scope="col">Price</TH>
                  <TH scope="col">On hand</TH>
                  <TH scope="col">Safety</TH>
                  <TH scope="col">Reorder at</TH>
                  <TH scope="col">Flags</TH>
                  <TH scope="col" className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {paged.map((variant) => (
                  <TR key={variant.id}>
                    <TD className="font-medium tabular-nums text-ink">{variant.sku}</TD>
                    <TD className="max-w-[13rem] truncate text-sm">{variant.product_name}</TD>
                    <TD className="max-w-[12rem] truncate text-sm">{variant.name}</TD>
                    <TD className="whitespace-nowrap text-sm tabular-nums text-ink">
                      {formatNaira(variant.price)}
                    </TD>
                    <TD>
                      <StockPill
                        stock={variant.stock_on_hand}
                        threshold={variant.low_stock_threshold}
                      />
                    </TD>
                    <TD className="text-sm tabular-nums text-muted">{variant.safety_stock}</TD>
                    <TD className="text-sm tabular-nums text-muted">
                      {variant.low_stock_threshold}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {variant.is_default && (
                          <Badge variant="accent" size="sm">
                            Default
                          </Badge>
                        )}
                        {variant.backorder_allowed && (
                          <Badge variant="info" size="sm">
                            Backorder
                          </Badge>
                        )}
                        {!variant.is_active && (
                          <Badge variant="default" size="sm">
                            Hidden
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setStockTarget({
                              variantId: variant.id,
                              sku: variant.sku,
                              name: variant.name,
                              productName: variant.product_name,
                              stockOnHand: variant.stock_on_hand,
                            })
                          }
                        >
                          Adjust stock
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMovementVariant(variant.id)}
                        >
                          History
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="mt-5 flex flex-col items-center gap-3 border-t border-line px-5 py-4">
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
              <p className="text-xs text-muted">
                Page {page} of {pageCount}
              </p>
            </div>
          </>
        </AsyncSection>
      </Panel>

      {/* ----------------------------------------------------------------
          Movement ledger
      ---------------------------------------------------------------- */}
      <Panel
        className="mt-5"
        title="Movement history"
        description="Append-only. Each row records who moved what, why, and the balance it produced."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/products">Edit products</Link>
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="space-y-4 border-b border-line px-5 py-4">
          <Field
            label="Filter by variant"
            htmlFor="movement-variant"
            hint="Leave empty for the most recent movements across every SKU."
          >
            <Select
              id="movement-variant"
              value={movementVariant}
              onChange={(event) => setMovementVariant(event.target.value)}
              placeholder="All variants"
              options={variants.map((variant) => ({
                value: variant.id,
                label: `${variant.sku} — ${variant.name}`,
              }))}
            />
          </Field>

          {movementVariant && (
            <Alert variant="info">
              Showing the ledger for{' '}
              {variants.find((v) => v.id === movementVariant)?.sku ?? 'this variant'}{' '}
              only.{' '}
              <button
                type="button"
                className="font-medium underline underline-offset-4"
                onClick={() => setMovementVariant('')}
              >
                Show every variant
              </button>
              .
            </Alert>
          )}
        </div>

        <AsyncSection
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          error={movementsQuery.error}
          onRetry={() => void movementsQuery.refetch()}
          isEmpty={movements.length === 0}
          empty={
            <div className="p-8 text-center">
              <History className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
              <p className="text-sm text-muted">
                No stock has been moved yet. Sales, restocks and adjustments all land here.
              </p>
            </div>
          }
          skeleton={<div className="h-64 animate-pulse bg-sand/60" />}
          className="p-5"
        >
          <Table>
            <caption className="sr-only">Inventory movements</caption>
            <THead>
              <tr>
                <TH scope="col">When</TH>
                <TH scope="col">Variant</TH>
                <TH scope="col">Change</TH>
                <TH scope="col">Balance after</TH>
                <TH scope="col">Reason</TH>
                <TH scope="col">Reference</TH>
                <TH scope="col">Actor</TH>
              </tr>
            </THead>
            <TBody>
              {movements.map((movement) => (
                <TR key={movement.id}>
                  <TD className="whitespace-nowrap text-sm">
                    {formatDateTime(movement.created_at)}
                  </TD>
                  <TD className="font-medium tabular-nums text-ink">
                    {variantName(movement.variant_id)}
                  </TD>
                  <TD>
                    <span
                      className={
                        movement.delta >= 0
                          ? 'text-sm font-semibold tabular-nums text-success'
                          : 'text-sm font-semibold tabular-nums text-danger'
                      }
                    >
                      {movement.delta >= 0 ? '+' : ''}
                      {movement.delta}
                    </span>
                  </TD>
                  <TD className="text-sm tabular-nums text-ink">{movement.balance_after}</TD>
                  <TD>
                    <Badge variant="outline" size="sm">
                      {humanise(movement.reason)}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-muted">
                    {movement.reference_type
                      ? `${humanise(movement.reference_type)} ${movement.reference_id ?? ''}`.trim()
                      : '—'}
                    {movement.note && (
                      <span className="block text-xs text-muted">{movement.note}</span>
                    )}
                  </TD>
                  <TD className="text-xs text-muted">
                    {movement.actor_id ? (
                      <span title={movement.actor_id}>
                        Staff member
                        <span className="block text-faint">
                          {movement.actor_id.slice(0, 8)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-faint">System</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </AsyncSection>
      </Panel>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        The ledger is append-only and keeps every movement. This view lists the most recent 100, or
        the most recent movements for one variant when a filter is set.
      </p>

      <StockAdjustDialog
        open={stockTarget !== null}
        onOpenChange={(open) => !open && setStockTarget(null)}
        target={stockTarget}
        onAdjusted={() => {
          void Promise.all([
            lowStockQuery.refetch(),
            variantsQuery.refetch(),
            movementsQuery.refetch(),
          ])
        }}
      />
    </AdminShell>
  )
}

function StockPill({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) {
    return (
      <Badge variant="danger" size="sm">
        Out of stock
      </Badge>
    )
  }
  if (stock <= threshold) {
    return (
      <Badge variant="warning" size="sm">
        {stock} left
      </Badge>
    )
  }
  return <span className="text-sm tabular-nums text-ink">{stock}</span>
}
