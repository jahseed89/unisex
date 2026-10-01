import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Check,
  Heart,
  MapPin,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Zap,
} from 'lucide-react'

import { getProductBySlug, getProductVariants, getRelatedProducts, listWishlist, qk, toggleWishlist } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { discountPercent, formatNaira } from '@/lib/utils/format'
import { site } from '@/config/site'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { QuantityStepper } from '@/features/cart/components/QuantityStepper'
import { Breadcrumbs, ProductCard } from '@/components/shared/Cards'
import { useSeo, productSchema, breadcrumbSchema } from '@/components/seo/Seo'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Rating,
  Skeleton,
} from '@/components/ui'
import { ProductAttributeTable } from '@/features/shop/components/ProductAttributeTable'
import { ProductGallery } from '@/features/shop/components/ProductGallery'
import { ProductSections } from '@/features/shop/components/ProductSections'
import { VariantPicker, sellableStock } from '@/features/shop/components/VariantPicker'
import type { ProductVariant } from '@/types'

/**
 * Product detail.
 *
 * The variant drives everything in the buy box — price, image, stock and SKU —
 * because a bundle's length and weight change the price and what is actually
 * in the bag. Stock comes from `product_variants`, which the catalogue view
 * summarises per row.
 */
export default function ProductDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addItem } = useCart()
  const { user, isAuthenticated } = useAuth()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const trackedSlug = useRef<string | null>(null)

  const productQuery = useQuery({
    queryKey: qk.product(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  })

  const product = productQuery.data ?? null
  const productId = product?.id ?? ''

  const variantsQuery = useQuery({
    queryKey: qk.products({ variants: productId }),
    queryFn: () => getProductVariants(productId),
    enabled: Boolean(productId),
    staleTime: 5 * 60_000,
  })

  const relatedQuery = useQuery({
    queryKey: qk.products({ related: productId }),
    queryFn: () => getRelatedProducts(productId, 4),
    enabled: Boolean(productId),
    staleTime: 5 * 60_000,
  })

  const wishlistQuery = useQuery({
    queryKey: qk.wishlist(user?.id ?? 'anonymous'),
    queryFn: () => listWishlist(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })

  const wishlistMutation = useMutation({
    mutationFn: (productIdToToggle: string) => toggleWishlist(user!.id, productIdToToggle),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.wishlist(user?.id ?? 'anonymous') })
      toast.success(saved ? 'Saved to your wishlist' : 'Removed from your wishlist')
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Could not update your wishlist.'))
    },
  })

  const variants = useMemo(() => variantsQuery.data ?? [], [variantsQuery.data])

  // Default variant is preselected; the fallback keeps the page usable while
  // the variant list is still loading or if a product has none configured.
  const selected: ProductVariant | null =
    variants.find((variant) => variant.id === selectedId) ??
    variants.find((variant) => variant.is_default) ??
    variants[0] ??
    null

  const stock = selected ? sellableStock(selected) : (product?.available_stock ?? 0)
  const maxQuantity = Math.max(1, Math.min(stock, 20))
  const safeQuantity = Math.min(Math.max(1, quantity), maxQuantity)

  const price = selected?.price ?? product?.variant_price ?? product?.base_price ?? 0
  const compareAt = selected?.compare_at_price ?? product?.variant_compare_at_price ?? product?.compare_at_price ?? null
  const off = discountPercent(price, compareAt)

  const images = useMemo(() => {
    if (!product) return []
    const seen = new Set<string>()
    const list: (string | null)[] = []
    for (const source of [
      selected?.image_url,
      product.variant_image_url,
      product.image_url,
      ...product.gallery_urls,
    ]) {
      if (!source || seen.has(source)) continue
      seen.add(source)
      list.push(source)
    }
    return list
  }, [product, selected])

  const isSaved = (wishlistQuery.data ?? []).some((entry) => entry.product_id === productId)

  const jsonLd = useMemo(() => {
    if (!product) return undefined
    return [
      productSchema({
        name: product.name,
        description: product.summary,
        slug: product.slug,
        sku: selected?.sku ?? product.sku,
        price,
        image: images[0] ?? product.image_url,
        rating: product.rating_avg,
        reviewCount: product.rating_count,
        inStock: stock > 0,
      }),
      breadcrumbSchema([
        { name: 'Shop', path: '/shop' },
        { name: product.name, path: `/shop/${product.slug}` },
      ]),
    ]
  }, [product, selected, price, images, stock])

  useSeo({
    title: product?.name ?? 'Product',
    description: product?.summary ?? 'Shop hair at Unisex Hair Studio, Lagos.',
    path: product ? `/shop/${product.slug}` : `/shop/${slug}`,
    image: images[0] ?? product?.image_url ?? undefined,
    type: 'product',
    jsonLd,
  })

  // One view event per product, not per price change.
  useEffect(() => {
    if (!product || trackedSlug.current === product.slug) return
    trackedSlug.current = product.slug
    analytics.viewProduct(product.slug, product.name, price)
  }, [product, price])

  const toggleSaved = () => {
    if (!product) return
    if (!isAuthenticated) {
      toast.error('Sign in to save pieces to your wishlist.', {
        action: { label: 'Sign in', onClick: () => void navigate('/auth/sign-in') },
      })
      return
    }
    wishlistMutation.mutate(product.id)
  }

  const addToBag = async (thenCheckout: boolean) => {
    if (!product || !selected) return
    setAddError(null)
    setAdding(true)
    try {
      await addItem(selected.id, safeQuantity, { slug: product.slug, price })
      if (thenCheckout) void navigate('/checkout')
    } catch (error) {
      setAddError(errorMessage(error, 'Could not add that to your bag.'))
    } finally {
      setAdding(false)
    }
  }

  // --- States -------------------------------------------------------------
  if (productQuery.isLoading) return <ProductSkeleton />

  if (productQuery.isError) {
    return (
      <div className="container-page section-y">
        <Alert
          variant="danger"
          title="We could not load this product"
          action={
            <Button size="sm" variant="outline" onClick={() => void productQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(productQuery.error)}
        </Alert>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="container-page section-y">
        <EmptyState
          icon={<PackageSearch className="size-5" aria-hidden />}
          title="We could not find that piece"
          description="It may have been renamed, retired from the shelf, or the link is out of date. The boutique is this way."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/shop">Back to the shop</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      {/* The product name is the page <h1> and lives in the buy box, so the
          masthead here is just a slim breadcrumb rail. */}
      <div className="border-b border-line bg-sand/50">
        <nav aria-label="Breadcrumb" className="container-page py-4">
          <Breadcrumbs
            items={[
              { label: 'Shop', to: '/shop' },
              {
                label: product.category_name ?? 'Products',
                to: `/shop?category=${product.category_slug ?? ''}`,
              },
              { label: product.name, to: `/shop/${product.slug}` },
            ]}
          />
        </nav>
      </div>

      <div className="container-page section-y">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Gallery */}
          <div>
            <ProductGallery
              images={images}
              alt={product.name}
              seed={product.slug}
              badge={
                <>
                  {off !== null && <Badge variant="solid">−{off}%</Badge>}
                  {product.is_best_seller && <Badge variant="accent">Best seller</Badge>}
                  {product.is_featured && <Badge variant="onImage">Studio favourite</Badge>}
                </>
              }
            />

            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              <Promise
                icon={<Truck className="size-4" aria-hidden />}
                title="Free pickup in Lagos"
                body="Ready the same working day when you order before 4pm."
              />
              <Promise
                icon={<ShieldCheck className="size-4" aria-hidden />}
                title="Swap if it is not right"
                body="Send a photo within 48 hours and we will make it right."
              />
              <Promise
                icon={<Zap className="size-4" aria-hidden />}
                title="Install help"
                body="Book a fitting with a stylist if you want it fitted for you."
              />
            </ul>
          </div>

          {/* Buy box */}
          <div className="lg:sticky lg:top-40 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {product.brand && (
                  <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
                    {product.brand}
                  </p>
                )}
                <h1 className="mt-1.5 font-display text-2xl leading-tight text-ink md:text-3xl">
                  {product.name}
                </h1>
              </div>

              <button
                type="button"
                onClick={toggleSaved}
                aria-pressed={isSaved}
                aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-soft transition-colors hover:border-ink hover:text-clay"
              >
                <Heart
                  className={`size-5 ${isSaved ? 'fill-clay text-clay' : ''}`}
                  aria-hidden
                />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted">{product.summary}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {product.rating_count > 0 && (
                <Rating value={product.rating_avg} size="sm" showValue />
              )}
              {product.sold_count > 0 && (
                <span className="text-xs text-muted">{product.sold_count} sold</span>
              )}
              {product.is_glueless && (
                <Badge size="sm" variant="accent">
                  Glueless install
                </Badge>
              )}
            </div>

            {/* Price */}
            <div className="mt-6 flex flex-wrap items-baseline gap-3">
              <p className="font-display text-3xl font-semibold tabular-nums text-ink">
                {formatNaira(price)}
              </p>
              {compareAt && compareAt > price && (
                <>
                  <p className="text-base text-faint line-through">{formatNaira(compareAt)}</p>
                  {off !== null && (
                    <Badge variant="danger" size="sm">
                      Save {off}%
                    </Badge>
                  )}
                </>
              )}
            </div>

            {/* Stock */}
            <p className="mt-3" aria-live="polite">
              <StockLine stock={stock} />
            </p>

            {/* Variants */}
            {variants.length > 1 && (
              <VariantPicker
                className="mt-7"
                variants={variants}
                selectedId={selected?.id ?? null}
                onSelect={(variant) => {
                  setSelectedId(variant.id)
                  setQuantity(1)
                  setAddError(null)
                }}
                name={product.name}
              />
            )}

            {/* Quantity + actions */}
            <div className="mt-7 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <QuantityStepper
                  value={safeQuantity}
                  onChange={setQuantity}
                  min={1}
                  max={maxQuantity}
                  disabled={stock <= 0}
                  label={`Quantity of ${selected?.name ?? product.name}`}
                />
                {selected?.sku && (
                  <p className="text-xs text-muted">
                    SKU <span className="tabular-nums">{selected.sku}</span>
                  </p>
                )}
              </div>

              {addError && (
                <Alert variant="danger" title="That did not go through">
                  {addError}
                </Alert>
              )}

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  size="lg"
                  fullWidth
                  loading={adding}
                  disabled={stock <= 0 || !selected}
                  onClick={() => void addToBag(false)}
                >
                  <ShoppingBag className="size-4.5" aria-hidden />
                  {stock <= 0 ? 'Out of stock' : 'Add to bag'}
                </Button>
                <Button
                  size="lg"
                  fullWidth
                  variant="accent"
                  disabled={stock <= 0 || !selected}
                  onClick={() => void addToBag(true)}
                >
                  Buy now
                </Button>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted">
                <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                Collect at {site.address.street}, {site.address.locality} — or get it delivered in
                Lagos.
              </p>
            </div>

            {/* Specification */}
            <ProductAttributeTable className="mt-9" product={product} variant={selected} />
          </div>
        </div>

        {/* Long-form copy */}
        <section className="mt-14 border-t border-line pt-10" aria-label="Product information">
          <h2 className="sr-only">Product information</h2>
          <ProductSections product={product} className="max-w-3xl rounded-lg border border-line bg-surface px-5" />
        </section>

        {/* Related */}
        {relatedQuery.data && relatedQuery.data.length > 0 && (
          <section className="mt-16 border-t border-line pt-10" aria-labelledby="related-heading">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <h2 id="related-heading" className="font-display text-xl font-semibold text-ink">
                Clients also pair this with
              </h2>
              <Link to="/shop" className="text-sm text-bronze-dark hover:underline">
                All products
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {relatedQuery.data.map((item) => (
                <li key={item.id} className="flex">
                  <ProductCard product={item} className="w-full" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function StockLine({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        Out of stock — message us on WhatsApp and we will tell you when it lands.
      </span>
    )
  }
  if (stock <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-clay">
        <span className="size-1.5 rounded-full bg-clay" aria-hidden />
        Only {stock} left in the studio
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
      <Check className="size-3.5" aria-hidden />
      In stock — ready for pickup
    </span>
  )
}

function Promise({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <li className="rounded-md border border-line bg-surface p-3.5">
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="text-bronze">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
    </li>
  )
}

function ProductSkeleton() {
  return (
    <div className="container-page section-y" aria-hidden>
      <Skeleton className="h-3 w-40" />
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="space-y-3">
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <div className="flex gap-2.5">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="size-[4.5rem] rounded-md" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-3 gap-2.5 pt-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
      <Card className="mt-12 p-6">
        <Skeleton className="h-4 w-1/3" />
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </Card>
    