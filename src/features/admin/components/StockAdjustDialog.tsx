import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Minus, Plus } from 'lucide-react'

import {
  Alert,
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
  Textarea,
  qk,
  adjustStock,
} from '@/components/ui'
import { errorMessage } from '@/lib/supabase/errors'
import { Button as ButtonPrimitive } from '@/components/ui'
import { SaveStatus, numberOr } from './adminKit'
import type { SaveState } from './adminKit'

/**
 * Stock adjustment dialog, shared by the inventory screen and the product
 * variant editor.
 *
 * Stock is only ever moved through `fn_adjust_stock`: the database guard
 * trigger rejects a direct write to `product_variants.stock_on_hand`, and the
 * ledger it appends to is the only auditable record of what happened. The UI
 * says so rather than pretending the number is a free-text field.
 */

const REASONS = [
  { value: 'restock', label: 'Restock — new stock received' },
  { value: 'adjustment', label: 'Adjustment — stock count correction' },
  { value: 'wastage', label: 'Wastage — product used or spilled' },
  { value: 'damage', label: 'Damage — broken or unsellable' },
  { value: 'return', label: 'Return — customer returned an item' },
  { value: 'transfer', label: 'Transfer — moved between locations' },
] as const

type Reason = (typeof REASONS)[number]['value']

export interface StockAdjustTarget {
  variantId: string
  sku: string
  name: string
  productName: string
  stockOnHand: number
  /** Existing variants must move through the ledger; new ones are seeded on save. */
  isNew?: boolean
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: StockAdjustTarget | null
}) {
  const queryClient = useQueryClient()
  const [delta, setDelta] = useState('0')
  const [reason, setReason] = useState<Reason>('restock')
  const [note, setNote] = useState('')
  const [state, setState] = useState<SaveState>('idle')

  useEffect(() => {
    if (open) {
      setDelta('0')
      setReason('restock')
      setNote('')
      setState('idle')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('No variant selected')
      return adjustStock({
        variantId: target.variantId,
        delta: numberOr(delta, 0),
        reason,
        note: note.trim() || undefined,
      })
    },
    onSuccess: (variant) => {
      setState('saved')
      toast.success(`Stock updated — ${variant.sku} is now ${variant.stock_on_hand} on hand.`)
      void queryClient.invalidateQueries({ queryKey: qk.inventory() })
      void queryClient.invalidateQueries({ queryKey: qk.adminVariants(variant.product_id) })
      void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
      void queryClient.invalidateQueries({ queryKey: qk.dashboard('', '') })
      void queryClient.invalidateQueries({ queryKey: qk.staffDiary('', '') })
      onOpenChange(false)
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  if (!target) return null

  const amount = numberOr(delta, 0)
  const resulting = target.stockOnHand + amount
  const wouldGoNegative = resulting < 0

  const bump = (by: number) =>
    setDelta((current) => String(numberOr(current, 0) + by))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {target.productName} · {target.name} · SKU {target.sku}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Alert variant="info" title="Stock moves through the ledger">
            Every adjustment writes an inventory movement, so the balance below is
            what will be recorded. Editing the absolute figure directly is not
            possible — the database rejects it.
          </Alert>

          <div className="flex items-baseline justify-between rounded-md border border-line bg-sand/50 px-3.5 py-3">
            <span className="text-[0.8125rem] text-muted">Current on hand</span>
            <span className="font-display text-lg font-semibold tabular-nums text-ink">
              {target.stockOnHand}
            </span>
          </div>

          <Field
            label="Change"
            htmlFor="stock-delta"
            required
            hint="Use a minus sign to remove stock. The resulting balance must not fall below zero."
          >
            <div className="flex gap-2">
              <ButtonPrimitive
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease by one"
                onClick={() => bump(-1)}
              >
                <Minus aria-hidden />
              </ButtonPrimitive>
              <Input
                id="stock-delta"
                type="number"
                inputMode="numeric"
                value={delta}
                invalid={wouldGoNegative}
                onChange={(event) => setDelta(event.target.value)}
              />
              <ButtonPrimitive
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase by one"
                onClick={() => bump(1)}
              >
                <Plus aria-hidden />
              </ButtonPrimitive>
            </div>
          </Field>

          <div className="flex flex-wrap gap-2">
            {[-10, -1, 1, 10].map((step) => (
              <ButtonPrimitive
                key={step}
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => bump(step)}
              >
                {step > 0 ? `+${step}` : step}
              </ButtonPrimitive>
            ))}
          </div>

          <Field label="Reason" htmlFor="stock-reason" required>
            <Select
              id="stock-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as Reason)}
              options={REASONS.map((option) => ({ ...option }))}
            />
          </Field>

          <Field label="Note" htmlFor="stock-note" hint="Optional. Helps the next person understand the movement.">
            <Textarea
              id="stock-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Delivery from Sunmile, 24 units, invoice SM-4471"
            />
          </Field>

          <div className="rounded-md border border-line px-3.5 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted">Balance after this adjustment</span>
              <span
                className={
                  wouldGoNegative
                    ? 'font-semibold tabular-nums text-danger'
                    : 'font-semibold tabular-nums text-ink'
                }
              >
                {wouldGoNegative ? `${resulting} — not allowed` : resulting}
              </span>
            </div>
          </div>

          <SaveStatus state={state} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            loadingText="Recording…"
            disabled={amount === 0 || wouldGoNegative}
          >
            Record adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
