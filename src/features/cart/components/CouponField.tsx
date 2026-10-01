import { useId, useState } from 'react'
import { AlertCircle, CheckCircle2, Tag, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * Promo code field.
 *
 * The parent owns the code (it lives in the cart, server-side); this only
 * collects the input and reports the outcome. The success/error copy is the
 * message the coupon RPC returned, so the UI never invents one.
 */
export interface CouponFieldProps {
  /** Currently applied code, from `cart.totals.coupon_code`. */
  code: string | null
  /** `cart.totals.coupon_message` — the server's own verdict. */
  message: string | null
  onApply: (code: string) => void | Promise<unknown>
  onRemove?: () => void
  disabled?: boolean
  className?: string
}

export function CouponField({
  code,
  message,
  onApply,
  onRemove,
  disabled = false,
  className,
}: CouponFieldProps) {
  const inputId = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onApply(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {code ? (
        <div className="flex items-center gap-2.5 rounded-md border border-success/25 bg-success/[0.06] px-3.5 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-medium">{code.toUpperCase()}</span> applied
            {message ? <span className="text-muted"> — {message}</span> : null}
          </p>
          {onRemove && (
            <button
              type="button"
              onClick={() => void onRemove()}
              className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:bg-sand hover:text-ink"
              aria-label={`Remove promo code ${code}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={inputId} className="text-[0.8125rem] font-medium text-ink-soft">
            Promo code
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
              leadingIcon={<Tag className="size-4" aria-hidden />}
              className="uppercase"
              disabled={disabled}
            />
            <Button
              type="submit"
              variant="outline"
              size="md"
              loading={busy}
              loadingText="Checking"
              disabled={disabled || value.trim().length === 0}
            >
              Apply
            </Button>
          </div>
        </form>
      )}

      {message && !code && (
        <p role="status" className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
      )}
    </div>
  )
}
