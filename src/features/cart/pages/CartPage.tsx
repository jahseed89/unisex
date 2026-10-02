import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Lock, ShoppingBag, Trash2 } from 'lucide-react'

import { getProducts, qk } from '@/lib/api'
import { formatNaira, humanise } from '@/lib/utils/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { Alert, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { ProductCard } from '@/components/shared/Cards'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { useSeo } from '@/components/seo/Seo'
import { CouponField } from '@/features/cart/components/CouponField'
import { QuantityStepper } from '@/features/cart/components/QuantityStepper'
import { TotalsPanel } from '@/features/cart/components/TotalsPanel'
import type { CartLine, ProductCatalogEntry } from '@/types'

/**
 * Bag.
 *
 * Every figure below comes from `cart.totals` — `fn_cart_totals` is the only
 * place money is decided. This page reads it, renders it and never recomputes.
 */
export default function CartPage() {
  const { cart, isLoading, error, itemCount, setQuantity, removeItem, applyCouponCode, clearCoupon, refresh } =
    useCart()
  const { isAuthenticated } = useAuth()

  useSeo({
    title: 'Your bag',
    description:
      'Review the wigs, extensions and hair care in your Black Chery Unisex Studio bag, apply a promo code and check out with card or bank transfer.',
    path: '/cart',
    noindex: true,
  })

  const items = useMemo(() => cart?.items ?? [], [cart])
  const totals = cart?.totals

  // Cross-sell: whatever the customer has not already bagged. Fetched even for
  // an empty bag, because that is exactly when we want to suggest something.
  const routineQuery = useQuery({
    queryKey: qk.products({ crossSell: 'routine', kind: 'hair_care', limit: 4 }),
    queryFn: () => getProducts({ kind: 'hair_care', limit: 4, sort: 'featured' }),
    staleTime: 5 * 60_000,
  })

  const suggestions = useMemo(() => {
    const bagged = new Set(items.map((line) => line.product_id))
    return (routineQuery.data ?? []).filter((product) => !bagged.has(product.id)).slice(0, 4)
  }, [routineQuery.data, items])

  const showSkeleton = isLoading && !cart
  const showEmpty = !isLoading && !error && items.length === 0

  return (
    <>
      {/* Masthead — sticks so the count stays visible while scrolling a long bag. */}
      <div className="sticky top-16 z-30 border-b border-line bg-canvas/92 backdrop-blur-md lg:top-[4.5rem]">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <h1 className="font-display text-lg font-semibold text-ink">Your bag</h1>
          <p className="text-sm text-muted" aria-live="polite">
            {itemCount === 0
              ? 'No items yet'
              : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="container-page section-y">
        {showSkeleton && <CartSkeleton />}

        {!showSkeleton && error && (
          <Alert
            variant="danger"
            title="We could not load your bag"
            action={
              <Button size="sm" variant="outline" onClick={() => void refresh()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {showEmpty && (
          <div className="space-y-10">
            <EmptyState
              icon={<ShoppingBag className="size-5" aria-hidden />}
              title="Your bag is empty"
              description="Nothing in here yet. Have a look at the bundles our clients keep coming back for — raw hair, closures, lace fronts and the care that keeps them moving."
              action={
                <Button asChild size="lg" variant="accent">
                  <Link to="/shop">Shop now</Link>
                </Button>
              }
            />
            <RoutineRow
              products={routineQuery.data ?? []}
              title="Where most people start"
            />
          </div>
        )}

        {!showSkeleton && !error && items.length > 0 && totals && (
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
            {/* Line items */}
            <div>
              <ul className="divide-y divide-line border-y border-line">
                {items.map((line) => (
                  <CartLineRow
                    key={line.id}
                    line={line}
                    onQuantityChange={(quantity) => void setQuantity(line.id, quantity)}
                    onRemove={() => void removeItem(line.id)}
                  />
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <Button asChild variant="ghost" size="md">
                  <Link to="/shop">Continue shopping</Link>
                </Button>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="size-3.5" aria-hidden />
                  Secure checkout · pay by card or bank transfer
                </p>
              </div>

              <RoutineRow products={suggestions} className="mt-12" />
            </div>

            {/* Summary */}
            <aside className="lg:sticky lg:top-40 lg:self-start" aria-label="Order summary">
              <Card className="p-5 md:p-6">
                <h2 className="font-display text-lg font-semibold text-ink">Order summary</h2>

                <div className="mt-5">
                  <CouponField
                    code={totals.coupon_code}
                    message={totals.coupon_message}
                    onApply={(code) => applyCouponCode(code)}
                    onRemove={() => void clearCoupon()}
                  />
                </div>

                <div className="mt-5 border-t border-line pt-5">
                  <TotalsPanel totals={totals} showProgress />
                </div>

                <div className="mt-5 space-y-2.5">
                  <Button asChild fullWidth size="lg" variant="accent">
                    <Link to="/checkout">
                      Checkout · {formatNaira(totals.total)}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>

                  {!isAuthenticated && (
                    <p className="text-xs leading-relaxed text-muted">
                      You will be asked to sign in before paying — your bag is saved.{' '}
                      <Link
                        to="/auth/sign-in"
                        className="text-bronze-dark underline underline-offset-4"
                      >
                        Sign in
                      </Link>
                    </p>
                  )}
                </div>
              </Card>

              <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
                Free delivery across Lagos on orders over{' '}
                {totals.free_shipping_threshold
                  ? formatNaira(totals.free_shipping_threshold)
                  : 'the usual threshold'}
                . Pick-up is always free.
              </p>
            </aside>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Line item
// ---------------------------------------------------------------------------
function CartLineRow({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}) {
  const attributes = Object.entries(line.attributes ?? {})
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${humanise(key)}: ${value}`)

  return (
    <li className="flex gap-4 py-5">
      <MediaFrame
        src={line.image_url}
        alt={line.product_name}
        seed={line.product_slug}
        aspect="1/1"
        rounded
        className="w-20 shrink-0 sm:w-24"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium leading-snug text-ink">
              <Link to={`/shop/${line.product_slug}`} className="hover:text-bronze-dark">
                {line.product_name}
              </Link>
            </h3>
            <p className="mt-1 text-xs text-muted">
              {line.variant_name}
              {line.sku ? <span className="text-faint"> · {line.sku}</span> : null}
            </p>
            {attributes.length > 0 && (
              <p className="mt-1 text-xs text-faint">{attributes.join(' · ')}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-sm p-2 text-muted transition-colors hover:bg-sand hover:text-danger"
            aria-label={`Remove ${line.product_name} from your bag`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        {line.exceeds_stock && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-clay">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>Only {line.available_stock} left — reduce the quantity to check out</span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            value={line.quantity}
            onChange={onQuantityChange}
            min={1}
            max={Math.max(1, line.available_stock || 1)}
            label={`Quantity for ${line.product_name}`}
            size="sm"
          />

          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatNaira(line.line_total)}
            </p>
            {line.quantity > 1 && (
              <p className="text-xs tabular-nums text-muted">
                {formatNaira(line.unit_price)} each
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Cross-sell
// ---------------------------------------------------------------------------
function RoutineRow({
  products,
  title = 'Complete your routine',
  className,
}: {
  products: ProductCatalogEntry[]
  title?: string
  className?: string
}) {
  if (products.length === 0) return null

  return (
    <section className={className} aria-labelledby="routine-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="routine-heading" className="font-display text-lg font-semibold text-ink">
          {title}
        </h2>
        <Link
          to="/shop?kind=hair_care"
          className="text-sm text-bronze-dark hover:underline"
        >
          All hair care
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12" aria-hidden>
      <div className="space-y-4">
        {[0, 1].map((row) => (
          <div key={row} className="flex gap-4 border-b border-line py-5">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
