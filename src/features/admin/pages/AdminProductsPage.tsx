import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Package, PackagePlus, Search } from 'lucide-react'

import {
  listProductCategoriesAdmin,
  listProductsAdmin,
  qk,
  saveProduct,
} from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Pagination,
  Rating,
  Select,
  Switch,
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
  ConfirmDialog,
  DetailList,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { listVariantsForProducts, rollupVariants } from '../components/adminReads'
import { errorMessage } from '@/lib/supabase/errors'
import { formatNaira, formatPriceRange, humanise } from '@/lib/utils/format'
import type { ProductCategory, ProductStatus } from '@/types'

/**
 * Product administration.
 *
 * `listProductsAdmin` returns `products` rows, which carry no SKU, price band or
 * stock. Those live on `product_variants`, so the page resolves the variants for
 * the current page in one extra read and joins them in memory — the product
 * pagination and row counts stay server-side and correct.
 *
 * Search note: the server-side filter matches the product name only. The field
 * says so rather than implying a full-text search that does not exist.
 */

const PAGE_SIZE = 25

const STATUSES: ProductStatus[] = ['active', 'draft', 'archived']

export default function AdminProductsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const categoryId = params.get('categoryId') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkTarget, setBulkTarget] = useState<ProductStatus | null>(null)

  const filters = {
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
  }

  const productsQuery = useQuery({
    queryKey: qk.adminProducts({ ...filters, page, pageSize: PAGE_SIZE }),
    queryFn: () => listProductsAdmin(filters, page, PAGE_SIZE),
    staleTime: 30_000,
  })

  const categoriesQuery = useQuery({
    queryKey: qk.productCategories(),
    queryFn: listProductCategoriesAdmin,
    staleTime: 10 * 60_000,
  })

  const products = productsQuery.data?.data ?? []
  const count = productsQuery.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const variantsQuery = useQuery({
    queryKey: qk.adminVariants(`page:${page}:${JSON.stringify(filters)}`),
    queryFn: () => listVariantsForProducts(products.map((product) => product.id)),
    enabled: products.length > 0,
    staleTime: 30_000,
  })

  const rollups = useMemo(
    () => rollupVariants(variantsQuery.data ?? []),
    [variantsQuery.data],
  )

  const categoryName = useMemo(() => {
    const map = new Map(
      (categoriesQuery.data ?? []).map((category) => [category.id, category.name]),
    )
    return (id: string | null) => (id ? (map.get(id) ?? 'Uncategorised') : 'Uncategorised')
  }, [categoriesQuery.data])

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
    setSelected([])
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
    void queryClient.invalidateQueries({ queryKey: qk.products() })
    void queryClient.invalidateQueries({ queryKey: qk.productCategories() })
    void queryClient.invalidateQueries({ queryKey: qk.inventory() })
  }

  const flagMutation = useMutation({
    mutationFn: (input: { id: string; field: 'is_featured' | 'is_best_seller'; value: boolean }) =>
      saveProduct({ id: input.id, [input.field]: input.value }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: ProductStatus }) => {
      const failed: string[] = []
      // Sequential so a large selection cannot fire a burst of writes.
      for (const id of ids) {
        try {
          await saveProduct({ id, status: next })
        } catch {
          failed.push(id)
        }
      }
      return { succeeded: ids.length - failed.length, failed: failed.length }
    },
    onSuccess: (result) => {
      if (result.failed > 0) {
        toast.error(
          `${result.succeeded} updated, ${result.failed} could not be changed.`,
        )
      } else {
        toast.success(`${result.succeeded} product${result.succeeded === 1 ? '' : 's'} updated.`)
      }
      setSelected([])
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const allSelected = products.length > 0 && selected.length === products.length

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  return (
    <AdminShell
      eyebrow="Administration"
      title="Products"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="The boutique catalogue. Prices, stock and status here drive the shop immediately."
      actions={
        <Button asChild>
          <Link to="/admin/products/new">
            <PackagePlus aria-hidden />
            New product
          </Link>
        </Button>
      }
    >
      <Panel title="Filters">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Search"
            htmlFor="product-search"
            hint="Matches the product name."
          >
            <Input
              id="product-search"
              type="search"
              value={search}
              placeholder="Knotless, growth oil…"
              onChange={(event) => update({ search: event.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor="product-category">
            <Select
              id="product-category"
              value={categoryId}
              onChange={(event) => update({ categoryId: event.target.value })}
              placeholder="All categories"
              options={(categoriesQuery.data ?? []).map((category: ProductCategory) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </Field>
          <Field label="Status" htmlFor="product-status">
            <Select
              id="product-status"
              value={status}
              onChange={(event) => update({ status: event.target.value })}
              placeholder="Any status"
              options={STATUSES.map((value) => ({
                value,
                label: humanise(value),
              }))}
            />
          </Field>
        </div>
      </Panel>

      {selected.length > 0 && (
        <div className="mt-4">
          <Alert
            variant="info"
            title={`${selected.length} product${selected.length === 1 ? '' : 's'} selected`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
            }
          >
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Set status:</span>
              {STATUSES.map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkTarget(value)}
                >
                  {humanise(value)}
                </Button>
              ))}
            </span>
          </Alert>
        </div>
      )}

      <div className="mt-5">
        <Panel
          title="Catalogue"
          description={
            productsQuery.isLoading
              ? 'Loading products…'
              : `${count} product${count === 1 ? '' : 's'}`
          }
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={productsQuery.isLoading}
            isError={productsQuery.isError}
            error={productsQuery.error}
            onRetry={() => void productsQuery.refetch()}
            isEmpty={products.length === 0}
            empty={
              <div className="p-5">
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  {search || status || categoryId ? (
                    <Search className="size-6 text-bronze" aria-hidden />
                  ) : (
                    <Package className="size-6 text-bronze" aria-hidden />
                  )}
                  <p className="max-w-sm text-sm text-muted">
                    {search || status || categoryId
                      ? 'No products match these filters.'
                      : 'The catalogue is empty. Create the first product and add its variants.'}
                  </p>
                  <Button asChild>
                    <Link to="/admin/products/new">
                      <PackagePlus aria-hidden />
                      New product
                    </Link>
                  </Button>
                </div>
              </div>
            }
            skeleton={<div className="h-80 animate-pulse bg-sand/60" />}
            className="p-5"
          >
            <>
              <div className="hidden lg:block">
                <Table>
                  <caption className="sr-only">
                    Products, page {page} of {pageCount}
                  </caption>
                  <THead>
                    <tr>
                      <TH scope="col" className="w-10">
                        <Checkbox
                          checked={allSelected}
                          aria-label="Select every product on this page"
                          onChange={(event) =>
                            setSelected(event.target.checked ? products.map((p) => p.id) : [])
                          }
                        />
                      </TH>
                      <TH scope="col">Product</TH>
                      <TH scope="col">SKU</TH>
                      <TH scope="col">Category</TH>
                      <TH scope="col">Price</TH>
                      <TH scope="col">Stock</TH>
                      <TH scope="col">Sold</TH>
                      <TH scope="col">Rating</TH>
                      <TH scope="col">Flags</TH>
                      <TH scope="col">Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {products.map((product) => {
                      const rollup = rollups.get(product.id)
                      return (
                        <TR
                          key={product.id}
                          className="cursor-pointer"
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest('a,button,input,label')) return
                            navigate(`/admin/products/${product.id}`)
                          }}
                        >
                          <TD onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selected.includes(product.id)}
                              aria-label={`Select ${product.name}`}
                              onChange={() => toggle(product.id)}
                            />
                          </TD>
                          <TD className="max-w-[16rem]">
                            <Link
                              to={`/admin/products/${product.id}`}
                              className="block truncate font-medium text-ink transition-colors hover:text-bronze-dark"
                            >
                              {product.name}
                            </Link>
                            <span className="block truncate text-xs text-muted">
                              {humanise(product.kind)} · {product.brand ?? 'No brand'}
                            </span>
                          </TD>
                          <TD className="max-w-[10rem]">
                            {rollup && rollup.skus.length > 0 ? (
                              <span className="text-xs text-muted">
                                {rollup.skus.slice(0, 2).join(', ')}
                                {rollup.skus.length > 2
                                  ? ` +${rollup.skus.length - 2} more`
                                  : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-faint">
                                No variants yet
                              </span>
                            )}
                          </TD>
                          <TD className="text-sm">{categoryName(product.category_id)}</TD>
                          <TD className="whitespace-nowrap text-sm font-medium tabular-nums text-ink">
                            {rollup
                              ? formatPriceRange(rollup.priceMin, rollup.priceMax)
                              : formatNaira(product.base_price)}
                          </TD>
                          <TD className="text-sm tabular-nums">
                            {rollup ? (
                              <StockPill stock={rollup.stock} />
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </TD>
                          <TD className="text-sm tabular-nums text-muted">
                            {product.sold_count}
                          </TD>
                          <TD>
                            {product.rating_count > 0 ? (
                              <Rating value={product.rating_avg} size="sm" showValue />
                            ) : (
                              <span className="text-xs text-faint">—</span>
                            )}
                          </TD>
                          <TD onClick={(event) => event.stopPropagation()}>
                            <div className="flex flex-col gap-1.5">
                              <Switch
                                checked={product.is_featured}
                                onCheckedChange={(value) =>
                                  flagMutation.mutate({
                                    id: product.id,
                                    field: 'is_featured',
                                    value,
                                  })
                                }
                                label={product.is_featured ? 'Featured' : 'Not featured'}
                                aria-label={`${product.is_featured ? 'Remove' : 'Add'} featured flag on ${product.name}`}
                                className="h-5 w-9"
                              />
                              <Switch
                                checked={product.is_best_seller}
                                onCheckedChange={(value) =>
                                  flagMutation.mutate({
                                    id: product.id,
                                    field: 'is_best_seller',
                                    value,
                                  })
                                }
                                label={product.is_best_seller ? 'Best seller' : 'Not best seller'}
                                aria-label={`${product.is_best_seller ? 'Remove' : 'Add'} best seller flag on ${product.name}`}
                                className="h-5 w-9"
                              />
                            </div>
                          </TD>
                          <TD>
                            <StatusBadge status={product.status} />
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </div>

              <ul className="space-y-3 lg:hidden">
                {products.map((product) => {
                  const rollup = rollups.get(product.id)
                  return (
                    <li key={product.id}>
                      <Link
                        to={`/admin/products/${product.id}`}
                        className="block rounded-md border border-line px-4 py-3.5 transition-colors hover:border-bronze hover:bg-sand/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {product.name}
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {humanise(product.kind)} · {categoryName(product.category_id)}
                            </p>
                          </div>
                          <StatusBadge status={product.status} />
                        </div>
                        <div className="mt-3 border-t border-line pt-3">
                          <DetailList
                            columns={2}
                            items={[
                              {
                                label: 'Price',
                                value: rollup
                                  ? formatPriceRange(rollup.priceMin, rollup.priceMax)
                                  : formatNaira(product.base_price),
                              },
                              {
                                label: 'Stock',
                                value: rollup ? <StockPill stock={rollup.stock} /> : '—',
                              },
                            ]}
                          />
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-5 flex flex-col items-center gap-3 border-t border-line px-5 py-4">
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onPageChange={(next) => update({ page: String(next) })}
                />
                <p className="text-xs text-muted">
                  Page {page} of {pageCount} · {count} in total
                </p>
              </div>
            </>
          </AsyncSection>
        </Panel>
      </div>

      <ConfirmDialog
        open={bulkTarget !== null}
        onOpenChange={(open) => !open && setBulkTarget(null)}
        title={
          bulkTarget
            ? `Mark ${selected.length} product${selected.length === 1 ? '' : 's'} as ${humanise(bulkTarget).toLowerCase()}?`
            : 'Bulk update'
        }
        tone={bulkTarget === 'archived' ? 'danger' : 'default'}
        confirmLabel="Apply"
        pending={bulkMutation.isPending}
        consequence={
          bulkTarget === 'archived' ? (
            <span className="block">
              Archived products disappear from the shop immediately. Existing orders keep their
              snapshotted line items, so nothing already sold is affected.
            </span>
          ) : bulkTarget === 'active' ? (
            <span className="block">
              These products become visible on the shop and buyable. Make sure each has at least one
              active variant with stock, or customers will find nothing to buy.
            </span>
          ) : (
            <span className="block">
              Draft products are hidden from the shop and from search. Nothing already in a cart is
              affected.
            </span>
          )
        }
        onConfirm={() => {
          if (bulkTarget) bulkMutation.mutate({ ids: selected, next: bulkTarget })
          setBulkTarget(null)
        }}
      />
    </AdminShell>
  )
}

function StockPill({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <Badge variant="danger" size="sm">
        Out of stock
      </Badge>
    )
  }
  if (stock <= 5) {
    return (
      <Badge variant="warning" size="sm">
        {stock} left
      </Badge>
    )
  }
  return <span className="text-sm tabular-nums text-ink">{stock}</span>
}
