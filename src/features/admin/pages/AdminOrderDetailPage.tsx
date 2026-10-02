import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  Wallet,
} from 'lucide-react'

import { qk, recordOfflinePayment, setOrderStatus } from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@/components/ui'
import { MediaFrame } from '@/components/shared/MediaFrame'
import {
  AdminShell,
  AsyncSection,
  ConfirmDialog,
  DetailList,
  EmptyState,
  Panel,
  SaveStatus,
  StatusBadge,
} from '../components/adminKit'
import { numberOr } from '../components/adminFormat'
import { getOrderAdmin, sortPayments } from '../components/adminReads'
import { errorMessage } from '@/lib/supabase/errors'
import { formatDateTime, formatNaira, humanise, whatsappLink } from '@/lib/utils/format'
import type { OrderStatus } from '@/types'

/**
 * A single order and the workflow around it.
 *
 * Totals are read, never recomputed: `fn_checkout` wrote subtotal, discount,
 * shipping, tax and total, and the line items are immutable snapshots. The
 * status workflow, tracking, courier and the internal note all go through
 * `fn_set_order_status`, which is the only endpoint allowed to move an order —
 * so there is exactly one place that can and one audit trail to read.
 */

/** Forward workflow mirroring `fn_set_order_status`. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: ['refunded'],
  refunded: [],
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Confirm order',
  processing: 'Start processing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
  returned: 'Mark returned',
  refunded: 'Mark refunded',
  cancelled: 'Cancel order',
}

const OFFLINE_PROVIDERS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'Card terminal (POS)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'moniepoint', label: 'Moniepoint' },
] as const

type OfflineProvider = (typeof OFFLINE_PROVIDERS)[number]['value']

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const [target, setTarget] = useState<OrderStatus | null>(null)
  const [moveNote, setMoveNote] = useState('')
  const [tracking, setTracking] = useState('')
  const [courier, setCourier] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payProvider, setPayProvider] = useState<OfflineProvider>('cash')
  const [payReference, setPayReference] = useState('')
  const [payNote, setPayNote] = useState('')

  const orderQuery = useQuery({
    queryKey: qk.order(id),
    enabled: Boolean(id),
    // The same row `getOrder` returns, plus `internal_notes` and `cancel_reason`,
    // which the shared `Order` type omits. See adminReads.getOrderAdmin.
    queryFn: () => getOrderAdmin(id),
    staleTime: 30_000,
  })

  const order = orderQuery.data
  const isLoading = orderQuery.isLoading
  const error = orderQuery.error

  useEffect(() => {
    if (!order) return
    setInternalNote(order.internal_notes ?? '')
    setTracking(order.tracking_number ?? '')
    setCourier(order.courier ?? '')
  }, [order])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.order(id) })
    void queryClient.invalidateQueries({ queryKey: qk.adminOrders({}) })
    void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
    void queryClient.invalidateQueries({ queryKey: qk.inventory() })
  }

  const statusMutation = useMutation({
    mutationFn: (input: {
      status: OrderStatus
      note?: string
      tracking?: string
      courier?: string
    }) =>
      setOrderStatus({
        orderId: id,
        status: input.status,
        ...(input.note ? { note: input.note } : {}),
        ...(input.tracking ? { tracking: input.tracking } : {}),
        ...(input.courier ? { courier: input.courier } : {}),
      }),
    onSuccess: (updated) => {
      toast.success(`Order ${updated.order_number} is now ${humanise(updated.status).toLowerCase()}.`)
      setTarget(null)
      setMoveNote('')
      invalidate()
    },
    onError: (mutationError) => {
      setTarget(null)
      // The server refuses to cancel a paid order without a refund first; its
      // message is more useful than anything the client could invent.
      toast.error(errorMessage(mutationError))
    },
  })

  const paymentMutation = useMutation({
    mutationFn: () =>
      recordOfflinePayment({
        orderId: id,
        amount: numberOr(payAmount, 0),
        provider: payProvider,
        ...(payReference.trim() ? { reference: payReference.trim() } : {}),
        ...(payNote.trim() ? { note: payNote.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Offline payment recorded.')
      setPaymentOpen(false)
      setPayAmount('')
      setPayReference('')
      setPayNote('')
      invalidate()
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  if (!order && !isLoading && !error) {
    return (
      <AdminShell
        eyebrow="Administration"
        title="Order"
        breadcrumb={[
          { label: 'Admin', to: '/admin' },
          { label: 'Orders', to: '/admin/orders' },
        ]}
      >
        <EmptyState
          icon={<Truck aria-hidden />}
          title="That order could not be found"
          description="It may have been removed, or the link may be out of date."
          action={
            <Button asChild>
              <Link to="/admin/orders">Back to orders</Link>
            </Button>
          }
        />
      </AdminShell>
    )
  }

  const outstanding = Number(order?.total ?? 0) - Number(order?.paid_total ?? 0) + Number(order?.refund_total ?? 0)
  const hasPayment = Number(order?.paid_total ?? 0) > 0
  const isClosed = ['cancelled', 'refunded'].includes(order?.status ?? '')
  const moves = order ? (NEXT[order.status] ?? []) : []

  return (
    <AdminShell
      eyebrow="Administration"
      title={order ? `Order ${order.order_number}` : 'Order'}
      breadcrumb={[
        { label: 'Admin', to: '/admin' },
        { label: 'Orders', to: '/admin/orders' },
      ]}
      actions={
        <>
          <StatusBadge status={order?.status ?? 'pending'} />
          <Button asChild variant="outline">
            <Link to="/admin/orders">
              <ArrowLeft aria-hidden />
              All orders
            </Link>
          </Button>
        </>
      }
    >
      <AsyncSection
        isLoading={isLoading}
        isError={Boolean(error)}
        error={error}
        onRetry={() => void orderQuery.refetch()}
        skeleton={<div className="h-96 animate-pulse rounded-lg bg-sand/60" />}
      >
        {order && (
          <>
            {hasPayment && !['cancelled', 'refunded'].includes(order.status) && (
              <Alert variant="warning" title="This order has a payment against it">
                {formatNaira(order.paid_total)} has been taken. The database refuses to cancel a
                paid order — refund it through the payment provider first, then cancel.
              </Alert>
            )}

            {/* Workflow ------------------------------------------------- */}
            <Panel
              className={hasPayment ? 'mt-5' : ''}
              title="Fulfilment"
              description="Only the moves the workflow allows from the current status are offered."
            >
              <div className="flex flex-wrap items-center gap-2.5">
                {moves.length === 0 ? (
                  <p className="text-sm text-muted">
                    This order is closed. The history below is the record.
                  </p>
                ) : (
                  moves.map((move) => (
                    <Button
                      key={move}
                      variant={move === 'cancelled' ? 'destructiveOutline' : 'solid'}
                      onClick={() => {
                        setTarget(move)
                        setMoveNote('')
                      }}
                      disabled={isClosed && move !== 'refunded'}
                    >
                      {NEXT_LABEL[move] ?? humanise(move)}
                    </Button>
                  ))
                )}

                <Button
                  variant="outline"
                  className="ml-auto"
                  onClick={() => {
                    setPayAmount(String(Math.max(0, Math.round(outstanding))))
                    setPaymentOpen(true)
                  }}
                  disabled={isClosed}
                >
                  <Wallet aria-hidden />
                  Record offline payment
                </Button>
              </div>

              {order.status === 'returned' && (
                <p className="mt-3.5 text-xs leading-relaxed text-muted">
                  Marking this order returned has already restocked every line item through the
                  inventory ledger.
                </p>
              )}
            </Panel>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-5">
                {/* Items ---------------------------------------------- */}
                <Panel
                  title="Items"
                  description="Snapshots taken at checkout. Later price or name changes do not rewrite history."
                >
                  <ul className="space-y-3">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3.5 rounded-md border border-line p-3"
                      >
                        <MediaFrame
                          src={item.image_snapshot}
                          alt={
                            item.variant_snapshot
                              ? `${item.name_snapshot}, ${item.variant_snapshot}`
                              : item.name_snapshot
                          }
                          seed={item.sku_snapshot ?? item.id}
                          aspect="square"
                          rounded
                          className="w-16 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{item.name_snapshot}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {item.variant_snapshot ?? 'Standard'}
                            {item.sku_snapshot && ` · ${item.sku_snapshot}`}
                          </p>
                          {Object.keys(item.attributes ?? {}).length > 0 && (
                            <p className="mt-1 text-xs text-muted">
                              {Object.entries(item.attributes)
                                .map(([key, value]) => `${key}: ${String(value)}`)
                                .join(' · ')}
                            </p>
                          )}
                          <p className="mt-1.5 text-xs text-muted">
                            {item.quantity} × {formatNaira(item.unit_price)}
                            {item.refunded_qty > 0 && ` · ${item.refunded_qty} refunded`}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                          {formatNaira(item.line_total)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 border-t border-line pt-4">
                    <DetailList
                      columns={2}
                      items={[
                        { label: 'Subtotal', value: formatNaira(order.subtotal) },
                        {
                          label: 'Discount',
                          value:
                            Number(order.discount_total) > 0
                              ? `−${formatNaira(order.discount_total)}${
                                  order.coupon_code ? ` (${order.coupon_code})` : ''
                                }`
                              : '—',
                        },
                        { label: 'Shipping', value: formatNaira(order.shipping_total) },
                        { label: 'Tax', value: formatNaira(order.tax_total) },
                      ]}
                    />
                    <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                      <span className="font-display text-base font-semibold text-ink">Total</span>
                      <span className="font-display text-lg font-semibold tabular-nums text-ink">
                        {formatNaira(order.total)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Calculated by the checkout function at the time the order was placed.
                    </p>
                  </div>
                </Panel>

                {/* Fulfilment ----------------------------------------- */}
                <Panel title={order.fulfilment_type === 'pickup' ? 'Collection' : 'Delivery'}>
                  {order.fulfilment_type === 'pickup' ? (
                    order.location ? (
                      <DetailList
                        columns={2}
                        items={[
                          { label: 'Location', value: order.location.name },
                          { label: 'Address', value: order.location.address_line1 },
                          { label: 'City', value: `${order.location.city}, ${order.location.state}` },
                          {
                            label: 'Phone',
                            value: order.location.phone ?? '—',
                          },
                        ]}
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        No pickup location was chosen on this order.
                      </p>
                    )
                  ) : (
                    <DetailList
                      columns={2}
                      items={[
                        { label: 'Address line 1', value: order.delivery_address?.line1 ?? '—' },
                        { label: 'Address line 2', value: order.delivery_address?.line2 ?? '—' },
                        { label: 'City', value: order.delivery_address?.city ?? '—' },
                        { label: 'State', value: order.delivery_address?.state ?? '—' },
                        {
                          label: 'Landmark',
                          value: order.delivery_address?.landmark ?? '—',
                        },
                        {
                          label: 'Delivery phone',
                          value: order.delivery_address?.phone ?? order.contact_phone,
                        },
                      ]}
                    />
                  )}

                  {(order.delivery_notes || order.customer_notes) && (
                    <div className="mt-5 space-y-3 border-t border-line pt-4">
                      {order.customer_notes && (
                        <div>
                          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                            Customer note
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                            {order.customer_notes}
                          </p>
                        </div>
                      )}
                      {order.delivery_notes && (
                        <div>
                          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                            Delivery notes
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                            {order.delivery_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Panel>

                {/* Payments ------------------------------------------ */}
                <Panel
                  title="Payments"
                  description={`${formatNaira(order.paid_total)} of ${formatNaira(order.total)} received.`}
                  action={<StatusBadge status={order.payment_status} dot={false} />}
                  bodyClassName="p-0"
                >
                  {sortPayments(order.payments).length === 0 ? (
                    <p className="text-sm text-muted">
                      Nothing has been recorded against this order yet. Use “Record offline
                      payment” for cash, POS or a transfer.
                    </p>
                  ) : (
                    <Table>
                      <caption className="sr-only">Payments against this order</caption>
                      <THead>
                        <tr>
                          <TH scope="col">Reference</TH>
                          <TH scope="col">Provider</TH>
                          <TH scope="col">Status</TH>
                          <TH scope="col">Date</TH>
                          <TH scope="col" className="text-right">Amount</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {sortPayments(order.payments).map((payment) => (
                          <TR key={payment.id}>
                            <TD className="max-w-[12rem] truncate text-xs tabular-nums text-muted">
                              {payment.reference || '—'}
                            </TD>
                            <TD>
                              <Badge variant="outline" size="sm">
                                {humanise(payment.provider)}
                              </Badge>
                            </TD>
                            <TD>
                              <StatusBadge status={payment.status} />
                            </TD>
                            <TD className="whitespace-nowrap text-sm">
                              {payment.paid_at
                                ? formatDateTime(payment.paid_at)
                                : formatDateTime(payment.created_at)}
                            </TD>
                            <TD className="text-right text-sm font-medium tabular-nums text-ink">
                              {formatNaira(payment.amount)}
                              {payment.refunded_amount > 0 && (
                                <span className="block text-xs text-danger">
                                  −{formatNaira(payment.refunded_amount)}
                                </span>
                              )}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </Panel>
              </div>

              <div className="space-y-5">
                {/* Customer ------------------------------------------ */}
                <Panel title="Customer">
                  <p className="text-sm font-semibold text-ink">{order.contact_name}</p>
                  <div className="mt-3 space-y-2">
                    <a
                      href={`tel:${order.contact_phone}`}
                      className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                    >
                      <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
                      {order.contact_phone}
                    </a>
                    <a
                      href={`mailto:${order.contact_email}`}
                      className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                    >
                      <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
                      <span className="truncate">{order.contact_email}</span>
                    </a>
                    <a
                      href={whatsappLink(
                        `Hello ${order.contact_name.split(' ')[0] ?? ''} — this is Black Chery Unisex Studio about your order ${order.order_number}.`,
                        order.contact_phone,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                    >
                      <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
                      Message on WhatsApp
                    </a>
                  </div>

                  {order.customer_id && (
                    <Button asChild variant="ghost" size="sm" className="mt-3">
                      <Link to={`/admin/customers?search=${encodeURIComponent(order.contact_email)}`}>
                        View lifetime history
                      </Link>
                    </Button>
                  )}
                </Panel>

                {/* Record -------------------------------------------- */}
                <Panel title="Record">
                  <DetailList
                    columns={1}
                    items={[
                      { label: 'Placed', value: formatDateTime(order.placed_at) },
                      {
                        label: 'Confirmed',
                        value: order.confirmed_at
                          ? formatDateTime(order.confirmed_at)
                          : 'Not yet',
                      },
                      {
                        label: 'Fulfilled',
                        value: order.fulfilled_at ? formatDateTime(order.fulfilled_at) : 'Not yet',
                      },
                      {
                        label: 'Cancelled',
                        value: order.cancelled_at ? formatDateTime(order.cancelled_at) : '—',
                      },
                      ...(order.cancel_reason
                        ? [{ label: 'Cancel reason', value: order.cancel_reason }]
                        : []),
                      { label: 'Balance outstanding', value: formatNaira(Math.max(0, outstanding)) },
                    ]}
                  />
                </Panel>

                {/* Tracking ------------------------------------------ */}
                <Panel
                  title="Delivery tracking"
                  description="Saved with the next status change, so the courier details go out with the notification."
                >
                  <div className="space-y-4">
                    <Field label="Courier" htmlFor="order-courier">
                      <Input
                        id="order-courier"
                        value={courier}
                        placeholder="GIG Logistics"
                        onChange={(event) => setCourier(event.target.value)}
                      />
                    </Field>
                    <Field label="Tracking number" htmlFor="order-tracking">
                      <Input
                        id="order-tracking"
                        value={tracking}
                        placeholder="GIG-88213-LAG"
                        onChange={(event) => setTracking(event.target.value)}
                      />
                    </Field>
                    {order.tracking_number && (
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                        Currently {order.courier ?? 'unassigned'} · {order.tracking_number}
                      </p>
                    )}
                  </div>
                </Panel>

                {/* Internal note ------------------------------------- */}
                <Panel
                  title="Internal note"
                  description="Staff only. Stored on the order and included in the next status update."
                >
                  <Field label="Note" htmlFor="order-note">
                    <Textarea
                      id="order-note"
                      rows={5}
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                      placeholder="Customer will collect Saturday morning; ring the bell at the side gate."
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <Button
                      onClick={() =>
                        statusMutation.mutate({
                          status: order.status,
                          note: internalNote.trim(),
                          tracking: tracking.trim() || undefined,
                          courier: courier.trim() || undefined,
                        })
                      }
                      loading={statusMutation.isPending}
                      loadingText="Saving…"
                      disabled={isClosed}
                    >
                      Save note &amp; tracking
                    </Button>
                    <SaveStatus
                      state={internalNote === (order.internal_notes ?? '') ? 'idle' : 'idle'}
                      message={
                        internalNote === (order.internal_notes ?? '')
                          ? 'No unsaved changes'
                          : 'Unsaved — press save to store it'
                      }
                    />
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}
      </AsyncSection>

      {/* ----------------------------------------------------------------
          Status change
      ---------------------------------------------------------------- */}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target ? NEXT_LABEL[target] ?? humanise(target) : ''}
        description={order ? `Order ${order.order_number}` : undefined}
        body={
          <Field
            label="Note"
            htmlFor="order-move-note"
            hint="Stored as the internal note and included in the customer notification."
          >
            <Textarea
              id="order-move-note"
              rows={3}
              value={moveNote}
              onChange={(event) => setMoveNote(event.target.value)}
              placeholder="Picked and packed, ready for the rider this afternoon."
            />
          </Field>
        }
        consequence={
          target === 'cancelled' ? (
            <span className="block space-y-1.5">
              <span className="block">
                The order is cancelled and the customer is notified immediately.
              </span>
              <span className="block font-medium">
                {hasPayment
                  ? 'This order has a payment against it, so the database will refuse the cancellation until it is refunded.'
                  : 'Nothing has been paid on this order, so the cancellation will go through.'}
              </span>
            </span>
          ) : target === 'returned' ? (
            <span className="block">
              Every line item is restocked through the inventory ledger and marked refunded in
              quantity. This cannot be undone by moving the status back.
            </span>
          ) : (
            <span className="block">
              The customer receives a notification for this status change, and the timestamp is
              recorded on the order.
            </span>
          )
        }
        confirmLabel={target ? NEXT_LABEL[target] ?? 'Apply' : 'Apply'}
        tone={target === 'cancelled' ? 'danger' : 'default'}
        pending={statusMutation.isPending}
        onConfirm={() => {
          if (!target) return
          statusMutation.mutate({
            status: target,
            note: moveNote.trim() || internalNote.trim() || undefined,
            tracking: tracking.trim() || undefined,
            courier: courier.trim() || undefined,
          })
        }}
      />

      {/* ----------------------------------------------------------------
          Offline payment
      ---------------------------------------------------------------- */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Record an offline payment</DialogTitle>
            <DialogDescription>
              For cash at the counter, a card terminal, or a transfer that has cleared. The order
              total is not changed — the payment is added to the order.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="flex items-baseline justify-between rounded-md border border-line bg-sand/50 px-3.5 py-3 text-sm">
              <span className="text-muted">Outstanding</span>
              <span className="font-semibold tabular-nums text-ink">
                {formatNaira(Math.max(0, outstanding))}
              </span>
            </div>

            <Field label="Amount received" htmlFor="pay-amount" required>
              <Input
                id="pay-amount"
                type="number"
                min={1}
                step={500}
                value={payAmount}
                onChange={(event) => setPayAmount(event.target.value)}
              />
            </Field>

            <Field label="How was it taken" htmlFor="pay-provider" required>
              <Select
                id="pay-provider"
                value={payProvider}
                onChange={(event) => setPayProvider(event.target.value as OfflineProvider)}
                options={OFFLINE_PROVIDERS.map((option) => ({ ...option }))}
              />
            </Field>

            <Field label="Reference" htmlFor="pay-reference" hint="Till receipt, teller reference or transfer ID.">
              <Input
                id="pay-reference"
                value={payReference}
                placeholder="TILL-00921"
                onChange={(event) => setPayReference(event.target.value)}
              />
            </Field>

            <Field label="Note" htmlFor="pay-note">
              <Textarea
                id="pay-note"
                rows={2}
                value={payNote}
                onChange={(event) => setPayNote(event.target.value)}
              />
            </Field>

            <SaveStatus state={paymentMutation.isError ? 'error' : 'idle'} />
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => paymentMutation.mutate()}
              loading={paymentMutation.isPending}
              loadingText="Recording…"
              disabled={numberOr(payAmount, 0) <= 0}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
