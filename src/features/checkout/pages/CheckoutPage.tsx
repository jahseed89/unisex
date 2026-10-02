import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CreditCard,
  Landmark,
  Lock,
  MessageCircle,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react'

import {
  checkout,
  getLocations,
  listAppointments,
  qk,
  requestBankTransfer,
  startPayment,
  type CheckoutInput,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { formatDateTime, formatNaira, toE164, whatsappLink } from '@/lib/utils/format'
import { site } from '@/config/site'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { CouponField } from '@/features/cart/components/CouponField'
import { TotalsPanel } from '@/features/cart/components/TotalsPanel'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  RadioCards,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { useSeo } from '@/components/seo/Seo'
import { BankTransferPanel } from '@/features/checkout/components/BankTransferPanel'
import { CheckoutSummaryCard, SummaryAccordion } from '@/features/checkout/components/CheckoutSummary'
import { DeliveryAddressForm } from '@/features/checkout/components/DeliveryAddressForm'
import { StepIndicator } from '@/features/checkout/components/StepIndicator'
import {
  CHECKOUT_STEPS,
  STEP_FIELDS,
  checkoutSchema,
  defaultCheckoutValues,
  type CheckoutValues,
} from '@/features/checkout/components/schema'
import type { CartPayload, CartTotals, Order } from '@/types'

/**
 * Checkout.
 *
 * Four steps, one form. The order is created by `fn_checkout` at the moment of
 * payment — never before — and is cached in a ref so a failed Paystack
 * initialisation can be retried without raising a duplicate order. Money is
 * only ever read from `cart.totals` or from the order the server returns.
 */
export default function CheckoutPage() {
  const { cart, isLoading: cartLoading, error: cartError, refresh, applyCouponCode, clearCoupon } = useCart()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [payError, setPayError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [transfer, setTransfer] = useState<{ instructions: string; reference: string } | null>(null)
  const orderRef = useRef<Order | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const analyticsSent = useRef(false)

  useSeo({
    title: 'Checkout',
    description: 'Complete your Black Chery Unisex Studio order — collect in Lagos or get it delivered.',
    path: '/checkout',
    noindex: true,
  })

  const userId = user?.id
  const locationsQuery = useQuery({
    queryKey: qk.locations(),
    queryFn: getLocations,
    staleTime: 10 * 60_000,
  })

  // Cross-sell context: a returning client with a chair booked this week.
  const upcomingQuery = useQuery({
    queryKey: qk.appointments(userId ?? 'anonymous', 'upcoming'),
    queryFn: () => listAppointments(userId!, { upcomingOnly: true, limit: 1 }),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data])

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    mode: 'onTouched',
    defaultValues: defaultCheckoutValues({}),
  })

  const { register, setValue, watch, trigger, handleSubmit, getValues, formState } = form
  const values = watch()
  const errors = formState.errors

  // Prefill from the profile once it arrives, without stomping on typed input.
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current) return
    if (!profile && !user) return
    prefilled.current = true
    const current = getValues()
    if (!current.contactName && (profile?.full_name ?? user?.user_metadata.full_name)) {
      const fallback = profile?.full_name ?? (user?.user_metadata.full_name as string | undefined)
      if (fallback) setValue('contactName', fallback)
    }
    if (!current.contactEmail) setValue('contactEmail', profile?.email ?? user?.email ?? '')
    if (!current.contactPhone) setValue('contactPhone', profile?.phone_e164 ?? user?.phone ?? '')
  }, [profile, user, setValue, getValues])

  // Preselect the primary studio.
  useEffect(() => {
    if (locations.length === 0 || getValues('locationId')) return
    const primary = locations.find((location) => location.is_primary) ?? locations[0]
    if (primary) setValue('locationId', primary.id)
  }, [locations, setValue, getValues])

  // `begin_checkout` once per visit, with the server's own total.
  useEffect(() => {
    if (analyticsSent.current || !cart) return
    analyticsSent.current = true
    analytics.beginCheckout(cart.totals.total, cart.totals.item_count)
  }, [cart])

  const goNext = async () => {
    const fields = STEP_FIELDS[step] ?? []
    if (fields.length === 0) {
      setStep((current) => Math.min(CHECKOUT_STEPS.length, current + 1))
      return
    }
    const valid = await trigger(fields, { shouldFocus: true })
    if (valid) setStep((current) => Math.min(CHECKOUT_STEPS.length, current + 1))
  }

  // Once the order exists the cart is emptied server-side, so the review falls
  // back to the order's own figures.
  const displayCart: CartPayload | null = useMemo(() => {
    if (cart && cart.items.length > 0) return cart
    return order ? { cart: null, items: [], totals: orderTotals(order) } : null
  }, [cart, order])

  const submit = handleSubmit((formValues) => {
    void placeOrder(formValues)
  })

  const placeOrder = async (formValues: CheckoutValues) => {
    if (!cart && !orderRef.current) return
    setPayError(null)
    setPaying(true)

    try {
      let current = orderRef.current

      if (!current) {
        const cartId = cart?.cart?.id
        if (!cartId) throw new Error('Your bag has expired. Add the items again and we will pick up from there.')

        const input: CheckoutInput = {
          cartId,
          contactName: formValues.contactName.trim(),
          contactEmail: formValues.contactEmail.trim().toLowerCase(),
          contactPhone: toE164(formValues.contactPhone) ?? formValues.contactPhone.trim(),
          fulfilmentType: formValues.fulfilmentType,
          locationId: formValues.fulfilmentType === 'pickup' ? formValues.locationId : null,
          deliveryAddress:
            formValues.fulfilmentType === 'delivery'
              ? {
                  line1: formValues.address.line1.trim(),
                  line2: formValues.address.line2.trim() || undefined,
                  city: formValues.address.city.trim(),
                  state: formValues.address.state,
                  landmark: formValues.address.landmark.trim() || undefined,
                  phone: toE164(formValues.address.phone) ?? formValues.address.phone.trim(),
                }
              : null,
          notes: formValues.notes.trim() || undefined,
          couponCode: cart?.totals.coupon_code ?? undefined,
        }

        current = await checkout(input)
        orderRef.current = current
        setOrder(current)
        void refresh()
      }

      if (formValues.paymentMethod === 'transfer') {
        setTransfer(await requestBankTransfer(current))
        return
      }

      const session = await startPayment(current, current.contact_email)
      window.location.href = session.authorizationUrl
    } catch (error) {
      setPayError(
        errorMessage(
          error,
          'We could not start the payment. Nothing has been charged — please try again.',
        ),
      )
    } finally {
      setPaying(false)
    }
  }

  const goToSuccess = () => {
    if (!order) return
    void navigate(
      `/checkout/success?order=${encodeURIComponent(order.order_number)}&order_id=${encodeURIComponent(order.id)}`,
    )
  }

  // --- States -------------------------------------------------------------
  if (cartLoading && !cart) {
    return (
      <div className="container-page section-y">
        <CheckoutSkeleton />
      </div>
    )
  }

  if (cartError && !order) {
    return (
      <div className="container-page section-y">
        <Alert
          variant="danger"
          title="We could not load your bag"
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {cartError}
        </Alert>
      </div>
    )
  }

  if (!cart || (cart.items.length === 0 && !order)) {
    return (
      <div className="container-page section-y">
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden />}
          title="There is nothing to check out"
          description="Your bag is empty. Have a look at the pieces our clients keep coming back for."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/shop">Back to the shop</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const selectedLocation = locations.find((location) => location.id === values.locationId)
  const total = order?.total ?? cart.totals.total
  const isDelivery = values.fulfilmentType === 'delivery'
  const upcoming = upcomingQuery.data?.[0]
  const whatsappHref = whatsappLink(
    order
      ? `Hi! I placed order ${order.order_number} on the Black Chery Unisex Studio site but I am having trouble paying. Can you help me complete it?`
      : 'Hi! I am trying to pay for my Black Chery Unisex Studio order but the payment page will not open. Can you help?',
  )

  return (
    <>
      <div className="border-b border-line bg-sand/50">
        <div className="container-page py-8 md:py-10">
          <h1 className="display-section">Checkout</h1>
          <StepIndicator className="mt-6" current={step} onStepClick={(target) => setStep(target)} />
        </div>
      </div>

      <div className="container-page section-y">
        <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
          <div className="min-w-0">
            {displayCart && <SummaryAccordion cart={displayCart} className="mb-6 lg:hidden" />}

            {upcoming && !order && (
              <Alert variant="info" className="mb-6" title="You are in the studio this week">
                Your appointment is {formatDateTime(upcoming.starts_at)}. We will bag your order and
                keep it behind the desk — collect both in one trip.
              </Alert>
            )}

            {/* Step 1 — contact ---------------------------------------- */}
            {step === 1 && (
              <StepSection
                title="Contact details"
                description="Where should we send the receipt and any delivery updates?"
              >
                <div className="space-y-4">
                  <Field
                    label="Full name"
                    htmlFor="contact-name"
                    required
                    error={errors.contactName?.message}
                  >
                    <Input
                      id="contact-name"
                      autoComplete="name"
                      placeholder="Ada Obi"
                      invalid={Boolean(errors.contactName)}
                      {...register('contactName')}
                    />
                  </Field>

                  <Field
                    label="Email address"
                    htmlFor="contact-email"
                    required
                    hint="Paystack sends the receipt here."
                    error={errors.contactEmail?.message}
                  >
                    <Input
                      id="contact-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="ada@example.com"
                      invalid={Boolean(errors.contactEmail)}
                      {...register('contactEmail')}
                    />
                  </Field>

                  <Field
                    label="Phone number"
                    htmlFor="contact-phone"
                    required
                    hint="We will use this for delivery calls only."
                    error={errors.contactPhone?.message}
                  >
                    <Input
                      id="contact-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0803 000 0000"
                      invalid={Boolean(errors.contactPhone)}
                      {...register('contactPhone')}
                    />
                  </Field>
                </div>

                <StepActions
                  onBack={undefined}
                  onNext={() => void goNext()}
                  nextLabel="Continue to fulfilment"
                />
              </StepSection>
            )}

            {/* Step 2 — fulfilment ------------------------------------- */}
            {step === 2 && (
              <StepSection
                title="How would you like it?"
                description="Pick-up is free and usually ready the same working day."
              >
                <RadioCards
                  name="fulfilment"
                  aria-label="Fulfilment method"
                  columns={2}
                  value={values.fulfilmentType}
                  onChange={(value) => setValue('fulfilmentType', value, { shouldValidate: true })}
                  options={[
                    {
                      value: 'pickup',
                      label: 'Collect in store',
                      description: 'Free · ready the same working day',
                    },
                    {
                      value: 'delivery',
                      label: 'Deliver in Lagos',
                      description:
                        cart.totals.shipping > 0
                          ? `${formatNaira(cart.totals.shipping)} · next working day`
                          : 'Free on this order',
                    },
                  ]}
                />

                {isDelivery ? (
                  <div className="mt-6">
                    <DeliveryAddressForm
                      register={register}
                      errors={errors as FieldErrors<CheckoutValues>}
                    />
                    <p className="mt-4 rounded-md border border-line bg-sand/40 p-3.5 text-xs leading-relaxed text-muted">
                      <Truck className="mr-1.5 inline size-3.5 -translate-y-px text-bronze" aria-hidden />
                      Delivery on this order:{' '}
                      <strong className="font-medium text-ink">
                        {cart.totals.shipping > 0 ? formatNaira(cart.totals.shipping) : 'free'}
                      </strong>
                      {cart.totals.free_shipping_threshold
                        ? ` — free above ${formatNaira(cart.totals.free_shipping_threshold)}.`
                        : '.'}{' '}
                      Next working day across Lagos, and the rider calls before leaving the studio.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    <Field
                      label="Collect from"
                      htmlFor="pickup-location"
                      required
                      error={errors.locationId?.message}
                    >
                      <Select
                        id="pickup-location"
                        invalid={Boolean(errors.locationId)}
                        placeholder="Choose a studio"
                        value={values.locationId}
                        onChange={(event) =>
                          setValue('locationId', event.target.value, { shouldValidate: true })
                        }
                        options={locations.map((location) => ({
                          value: location.id,
                          label: `${location.name} — ${location.city}`,
                        }))}
                      />
                    </Field>

                    {selectedLocation && (
                      <div className="rounded-md border border-line bg-sand/40 p-4">
                        <p className="flex items-start gap-2 text-sm font-medium text-ink">
                          <Store className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                          {selectedLocation.name}
                        </p>
                        <p className="mt-1 pl-6 text-sm leading-relaxed text-muted">
                          {selectedLocation.address_line1}
                          {selectedLocation.address_line2 ? `, ${selectedLocation.address_line2}` : ''}
                          <br />
                          {selectedLocation.city}, {selectedLocation.state}
                          {selectedLocation.phone ? ` · ${selectedLocation.phone}` : ''}
                        </p>
                      </div>
                    )}

                    {locationsQuery.isError && (
                      <Alert
                        variant="warning"
                        title="We could not load our studios"
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void locationsQuery.refetch()}
                          >
                            Retry
                          </Button>
                        }
                      >
                        {errorMessage(locationsQuery.error)}
                      </Alert>
                    )}
                  </div>
                )}

                <StepActions onBack={() => setStep(1)} onNext={() => void goNext()} />
              </StepSection>
            )}

            {/* Step 3 — review ----------------------------------------- */}
            {step === 3 && (
              <StepSection
                title="Check the order"
                description="Prices, delivery and tax are calculated by our system — this is the same figure your card will be charged."
              >
                <div className="space-y-6">
                  {cart.items.length > 0 && (
                    <ul className="divide-y divide-line border-y border-line">
                      {cart.items.map((line) => (
                        <li key={line.id} className="flex items-baseline justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{line.product_name}</p>
                            <p className="text-xs text-muted">
                              {line.variant_name} · {line.quantity} ×{' '}
                              {formatNaira(line.unit_price)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                            {formatNaira(line.line_total)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {cart.items.length > 0 && (
                    <div className="rounded-md border border-line bg-surface p-4">
                      <TotalsPanel totals={cart.totals} showProgress />
                    </div>
                  )}

                  {cart.items.length > 0 && (
                    <CouponStep
                      code={cart.totals.coupon_code}
                      message={cart.totals.coupon_message}
                      onApply={(code) => applyCouponCode(code)}
                      onRemove={() => void clearCoupon()}
                    />
                  )}

                  <Field
                    label="Note for the studio"
                    htmlFor="order-notes"
                    hint="Colour choices, delivery timing, gift wrapping — anything we should know."
                    error={errors.notes?.message}
                  >
                    <Textarea
                      id="order-notes"
                      rows={3}
                      placeholder="Please call before you send the rider."
                      invalid={Boolean(errors.notes)}
                      {...register('notes')}
                    />
                  </Field>

                  <div>
                    <p className="mb-3 text-[0.8125rem] font-medium text-ink-soft">
                      How would you like to pay?
                    </p>
                    <RadioCards
                      name="paymentMethod"
                      aria-label="Payment method"
                      columns={2}
                      value={values.paymentMethod}
                      onChange={(value) => setValue('paymentMethod', value, { shouldValidate: true })}
                      options={[
                        {
                          value: 'card',
                          label: 'Card or USSD',
                          description: 'Paystack · instant confirmation',
                        },
                        {
                          value: 'transfer',
                          label: 'Bank transfer',
                          description: 'We confirm once it clears',
                        },
                      ]}
                    />
                  </div>
                </div>

                <StepActions onBack={() => setStep(2)} onNext={() => void goNext()} />
              </StepSection>
            )}

            {/* Step 4 — pay -------------------------------------------- */}
            {step === 4 && (
              <StepSection
                title="Pay and confirm"
                description={
                  values.paymentMethod === 'transfer'
                    ? 'We will show our account details and hold your order until the transfer clears.'
                    : 'You will be taken to Paystack to complete payment securely.'
                }
              >
                {transfer && order ? (
                  <div className="space-y-5">
                    <BankTransferPanel
                      instructions={transfer.instructions}
                      reference={transfer.reference}
                    />
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <Button fullWidth size="lg" onClick={goToSuccess}>
                        View my order
                      </Button>
                      <Button asChild fullWidth size="lg" variant="outline">
                        <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                          Send transfer receipt
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <Card className="p-5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bronze/12 text-bronze-dark">
                          {values.paymentMethod === 'transfer' ? (
                            <Landmark className="size-5" aria-hidden />
                          ) : (
                            <CreditCard className="size-5" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">
                            {values.paymentMethod === 'transfer' ? 'Bank transfer' : 'Paystack secure checkout'}
                          </p>
                          <p className="text-xs text-muted">
                            {isDelivery ? 'Delivery to your address' : `Collect from ${selectedLocation?.name ?? 'the studio'}`}
                          </p>
                        </div>
                        <Badge variant={values.paymentMethod === 'transfer' ? 'warning' : 'success'}>
                          {formatNaira(total)}
                        </Badge>
                      </div>

                      <div className="mt-4 border-t border-line pt-4 text-sm">
                        <dl className="space-y-2">
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Name</dt>
                            <dd className="text-ink">{values.contactName || '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Email</dt>
                            <dd className="truncate text-ink">{values.contactEmail || '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Phone</dt>
                            <dd className="text-ink">{toE164(values.contactPhone) ?? '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-4 border-t border-line pt-2">
                            <dt className="font-medium text-ink">Amount due</dt>
                            <dd className="font-display text-lg font-semibold tabular-nums text-ink">
                              {formatNaira(total)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </Card>

                    {payError && (
                      <Alert
                        variant="danger"
                        title="Payment could not be started"
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void placeOrder(getValues())}
                            loading={paying}
                          >
                            Retry
                          </Button>
                        }
                      >
                        <p>{payError}</p>
                        <p className="mt-2">
                          Still stuck? Message the studio on WhatsApp and we will take the payment for
                          you.{' '}
                          <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-bronze-dark underline underline-offset-4"
                          >
                            <MessageCircle className="size-3.5" aria-hidden />
                            Chat with us
                          </a>
                        </p>
                      </Alert>
                    )}

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <Button
                        type="submit"
                        size="xl"
                        fullWidth
                        variant="accent"
                        loading={paying}
                        loadingText="Opening Paystack…"
                      >
                        <Lock className="size-4.5" aria-hidden />
                        {values.paymentMethod === 'transfer'
                          ? `Show transfer details · ${formatNaira(total)}`
                          : `Pay ${formatNaira(total)} securely`}
                      </Button>
                      {order && (
                        <Button size="xl" variant="outline" onClick={goToSuccess}>
                          View order
                        </Button>
                      )}
                    </div>

                    <p className="text-xs leading-relaxed text-muted">
                      By paying you confirm the details above. Stock is re-checked at this moment, so
                      an item that sold out while you were filling in the form will be flagged before
                      your card is charged.
                    </p>
                  </div>
                )}

                {!transfer && (
                  <div className="mt-5">
                    <Button variant="ghost" size="md" onClick={() => setStep(3)}>
                      <ArrowLeft className="size-4" aria-hidden />
                      Back to review
                    </Button>
                  </div>
                )}
              </StepSection>
            )}
          </div>

          {/* Desktop summary ------------------------------------------- */}
          <aside className="hidden lg:block" aria-label="Order summary">
            <div className="sticky top-40">
              {displayCart && <CheckoutSummaryCard cart={displayCart} />}
              <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
                <Truck className="mt-0.5 size-3.5 shrink-0 text-bronze" aria-hidden />
                Lagos delivery only, next working day. Free pick-up at the studio.
              </p>
              <p className="mt-3 px-1 text-xs text-muted">
                Need help?{' '}
                <a
                  href={whatsappLink('Hi! I need help checking out on the Black Chery Unisex Studio site.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bronze-dark underline underline-offset-4"
                >
                  WhatsApp the studio
                </a>{' '}
                on {site.contact.phone}.
              </p>
            </div>
          </aside>
        </form>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Step shell
// ---------------------------------------------------------------------------
function StepSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title}>
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function StepActions({
  onBack,
  onNext,
  nextLabel = 'Continue',
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button size="lg" variant="accent" onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  )
}

function CouponStep({
  code,
  message,
  onApply,
  onRemove,
}: {
  code: string | null
  message: string | null
  onApply: (code: string) => void | Promise<unknown>
  onRemove: () => void
}) {
  // The same field the bag uses, so a code behaves identically in both places.
  return <CouponField code={code} message={message} onApply={onApply} onRemove={onRemove} />
}

/**
 * Present an order's money as a totals block.
 *
 * Purely a rename of fields the server already computed — no arithmetic.
 */
function orderTotals(order: Order): CartTotals {
  return {
    subtotal: order.subtotal,
    discount: order.discount_total,
    shipping: order.shipping_total,
    tax: order.tax_total,
    total: order.total,
    item_count: 0,
    free_shipping_threshold: null,
    coupon_code: order.coupon_code,
    coupon_message: null,
  }
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12" aria-hidden>
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-12 w-40 rounded-md" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  )
}
