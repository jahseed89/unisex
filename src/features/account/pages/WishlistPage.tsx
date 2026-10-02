import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Heart, HeartOff, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'

import { listWishlist, qk, toggleWishlist } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { Alert, Button, Card, EmptyState } from '@/components/ui'
import { ProductCard } from '@/components/shared/Cards'
import { CardGridSkeleton } from '@/components/layout/RouteLoader'
import type { ProductCatalogEntry } from '@/types'

/**
 * Saved products.
 *
 * `listWishlist` resolves each entry against the `product_catalog` view, so a
 * piece that has since been archived comes back with `product: null`. Those are
 * surfaced with an explanation rather than silently dropped — a client
 * wondering where their saved bundle went deserves an answer.
 */
export default function WishlistPage() {
  const { user } = useAuth()
  const userId = user?.id

  useSeo({
    title: 'Your wishlist',
    description: 'The wigs, extensions and hair care you have saved at Black Chery Unisex Studio.',
    path: '/account/wishlist',
    noindex: true,
  })

  const query = useQuery({
    queryKey: qk.wishlist(userId ?? 'anonymous'),
    queryFn: () => listWishlist(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const remove = useMutation({
    mutationFn: (productId: string) => toggleWishlist(userId!, productId),
    onSuccess: (stillSaved, productId) => {
      const product = query.data?.find((entry) => entry.product_id === productId)?.product
      if (stillSaved) {
        analytics.removeFromCart(product?.slug ?? productId, 0, 1)
        toast.success('Saved to your wishlist')
      } else {
        toast('Removed from your wishlist', {
          description: product?.name,
        })
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not update your wishlist.'))
    },
  })

  const entries = query.data ?? []
  const available = entries.filter((entry) => entry.product !== null)
  const unavailable = entries.filter((entry) => entry.product === null)
  const isEmpty = !query.isLoading && !query.isError && entries.length === 0

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2.5">Saved for later</p>
        <h1 className="display-section">Wishlist</h1>
        <p className="lede mt-3">
          Pieces you have set aside. Prices move as stock changes, so nothing is reserved — but we
          will tell you when something on here goes on offer.
        </p>
      </header>

      {query.isLoading && <CardGridSkeleton count={6} className="grid-cols-2 lg:grid-cols-3" />}

      {!query.isLoading && query.isError && (
        <Alert
          variant="danger"
          title="We could not load your wishlist"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      )}

      {isEmpty && (
        <EmptyState
          icon={<Heart className="size-5" aria-hidden />}
          title="Nothing saved yet"
          description="Tap the heart on any piece in the boutique to keep it here. Most clients start with a bundle and a closure, then add the care that keeps them moving."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/shop">Browse the boutique</Link>
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && entries.length > 0 && (
        <>
          {unavailable.length > 0 && (
            <Alert variant="neutral" title={`${unavailable.length} saved item${unavailable.length === 1 ? '' : 's'} no longer available`}>
              {unavailable.length === 1
                ? 'One piece you saved has been retired from the boutique. Remove it to tidy your list.'
                : `${unavailable.length} pieces you saved have been retired from the boutique. Remove them to tidy your list.`}
            </Alert>
          )}

          {unavailable.length > 0 && (
            <Card className="divide-y divide-line p-0">
              {unavailable.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">No longer in the boutique</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Saved{' '}
                      <time dateTime={entry.created_at}>
                        {new Date(entry.created_at).toLocaleDateString('en-NG', {
                          dateStyle: 'medium',
                        })}
                      </time>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending && remove.variables === entry.product_id}
                    onClick={() => remove.mutate(entry.product_id)}
                  >
                    <HeartOff className="size-4" aria-hidden />
                    Remove
                    <span className="sr-only"> this saved item</span>
                  </Button>
                </div>
              ))}
            </Card>
          )}

          {available.length > 0 && (
            <>
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
                {available.map((entry) => (
                  <li key={entry.id} className="flex flex-col">
                    <div className="relative flex">
                      <ProductCard
                        product={entry.product as ProductCatalogEntry}
                        className="w-full"
                      />
                      <button
                        type="button"
                        onClick={() => remove.mutate(entry.product_id)}
                        disabled={
                          remove.isPending && remove.variables === entry.product_id
                        }
                        aria-label={`Remove ${entry.product?.name ?? 'this item'} from your wishlist`}
                        className="absolute right-2 top-2 z-10 flex size-9 items-center justify-center rounded-full bg-surface/90 text-bronze-dark shadow-sm backdrop-blur transition-colors hover:bg-surface hover:text-danger disabled:opacity-50"
                      >
                        <Heart className="size-4 fill-current" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex justify-center pt-2">
                <Button asChild variant="outline" size="lg">
                  <Link to="/shop">
                    <ShoppingBag className="size-4" aria-hidden />
                    Keep browsing
                  </Link>
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
