import { cloneElement, isValidElement, useId, type ReactElement } from 'react'

import { Label } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * Labelled form control with its hint and error wired to the input.
 *
 * `Field` from the design system renders the same visual treatment but cannot
 * attach `aria-describedby` to a react-hook-form controlled input, so the auth
 * and profile forms use this instead. It clones a single element child and
 * injects `id`, `aria-invalid`, `aria-required` and `aria-describedby`.
 */
export function FormField({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string
  error?: string | undefined
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  const generatedId = useId()
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null

  // Re-use the control's own id when it already has one so <label for> matches.
  const existingId = child?.props.id
  const id = typeof existingId === 'string' ? existingId : generatedId

  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined

  const control = child
    ? cloneElement(child, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby': describedBy,
      })
    : children

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>

      {control}

      {error ? (
        <p id={errorId} role="alert" className="text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
