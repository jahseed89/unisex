import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  addToCart as addToCartApi,
  applyCoupon,
  getCart,
  removeCartItem,
  updateCartItem,
} from '@/lib/api/commerce'
import { qk } from '@/lib/query/keys'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { analytics } from '@/lib/analytics'
import type { CartPayload } from '@/types'

/**
 * Cart state for the whole app.
 *
 * Guests get an opaque session token persisted to localStorage; the token is
 * only ever used server-side to scope their cart and is merged into their
 * account cart on sign-in (see `fn_merge_carts`).
 */

const SESSION_TOKEN_KEY = 'uhs:cart-token'

function readSessionToken(): string {
  if (typeof localStorage === 'undefined') return ''
  const existing = localStorage.getItem(SESSION_TOKEN_KEY)
  if (existing) return existing

  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

  localStorage.setItem(SESSION_TOKEN_KEY, token)
  return token
}

interface CartContextValue {
  cart: CartPayload | null
  isLoading: boolean
  error: string | null
  sessionToken: string
  itemCount: number
  subtotal: number
  addItem: (variantId: string, quantity?: number, meta?: { slug: string; price: number }) => Promise<void>
  setQuantity: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  applyCouponCode: (code: string) => Promise<boolean>
  clearCoupon: () => Promise<void>
  refresh: () => Promise<void>
}

const EMPTY_TOTALS = {
  subtotal: 0,
  discount: 0,
  shipping: 0,
  tax: 0,
  total: 0,
  item_count: 0,
  free_shipping_threshold: null,
  coupon_code: null,
  coupon_message: null,
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [sessionToken] = useState(readSessionToken)

  const cartQuery = useQuery({
    queryKey: qk.cart(isAuthenticated ? undefined : sessionToken),
    queryFn: () => getCart(isAuthenticated ? null : sessionToken),
    // Cart contents change from several screens at once; keep it fresh.
    staleTime: 10_000,
    retry: 1,
  })

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['cart'] })
  }, [queryClient])

  // A sign-in can change which cart is authoritative, and `fn_merge_carts` may
  // have combined the two. Force a refetch rather than trusting the cache.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['cart'] })
  }, [isAuthenticated, queryClient])

  const addMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      addToCartApi(variantId, quantity, sessionToken),
    onSuccess: async (_data, variables) => {
      await invalidate()
      analytics.addToCart(variables.variantId, 0, variables.quantity)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItem(itemId, quantity),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSuccess: invalidate,
  })

  const couponMutation = useMutation({
    mutationFn: (code: string) => applyCoupon(code),
    onSuccess: invalidate,
  })

  const cart = cartQuery.data ?? null

  // Defined before the memo so the object literal can reference them without
  // creating a circular type inference.
  const addItem = useCallback<CartContextValue['addItem']>(
    async (variantId, quantity = 1, meta) => {
      try {
        await addMutation.mutateAsync({ variantId, quantity })
        if (meta) analytics.addToCart(meta.slug, meta.price, quantity)
        toast.success(quantity > 1 ? `${quantity} added to your bag` : 'Added to your bag', {
          action: { label: 'View bag', onClick: () => (window.location.href = '/cart') },
        })
      } catch (error) {
        toast.error(errorMessage(error, 'Could not add that to your bag.'))
        throw error
      }
    },
    [addMutation],
  )

  const removeItem = useCallback<CartContextValue['removeItem']>(
    async (itemId) => {
      try {
        await removeMutation.mutateAsync(itemId)
        toast('Removed from your bag')
      } catch (error) {
        toast.error(errorMessage(error, 'Could not remove that item.'))
      }
    },
    [removeMutation],
  )

  const setQuantity = useCallback<CartContextValue['setQuantity']>(
    async (itemId, quantity) => {
      if (quantity <= 0) return removeItem(itemId)
      try {
        await updateMutation.mutateAsync({ itemId, quantity })
      } catch (error) {
        toast.error(errorMessage(error, 'Could not update that item.'))
      }
    },
    [removeItem, updateMutation],
  )

  const applyCouponCode = useCallback<CartContextValue['applyCouponCode']>(
    async (code) => {
      try {
        const result = await couponMutation.mutateAsync(code)
        if (result.is_valid) {
          toast.success(`${code.toUpperCase()} applied`)
          return true
        }
        toast.error(result.message)
        return false
      } catch (error) {
        toast.error(errorMessage(error, 'Could not apply that code.'))
        return false
      }
    },
    [couponMutation],
  )

  const clearCoupon = useCallback<CartContextValue['clearCoupon']>(async () => {
    try {
      await couponMutation.mutateAsync('')
      await invalidate()
    } catch {
      toast.error('Could not remove the promo code.')
    }
  }, [couponMutation, invalidate])

  const refresh = useCallback<CartContextValue['refresh']>(async () => {
    await invalidate()
  }, [invalidate])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isLoading: cartQuery.isLoading,
      error: cartQuery.error ? errorMessage(cartQuery.error) : null,
      sessionToken,
      itemCount: cart?.totals.item_count ?? 0,
      subtotal: cart?.totals.subtotal ?? 0,
      addItem,
      setQuantity,
      removeItem,
      applyCouponCode,
      clearCoupon,
      refresh,
    }),
    [
      addItem,
      applyCouponCode,
      cart,
      cartQuery.error,
      cartQuery.isLoading,
      clearCoupon,
      refresh,
      removeItem,
      sessionToken,
      setQuantity,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside <CartProvider>')
  return context
}

/** Convenience for headers and badges: just the count. */
export function useCartCount(): number {
  return useCart().itemCount
}

export { EMPTY_TOTALS }
