import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  statusTone,
} from '@/components/ui'
import { Breadcrumbs } from '@/components/shared/Cards'
import { errorMessage } from '@/lib/supabase/errors'
import { cn } from '@/lib/utils/cn'
import { humanise } from '@/lib/utils/format'

/**
 * Shared building blocks for the administrator surfaces.
 *
 * `DashboardLayout` already owns `container-page` and the vertical rhythm, so
 * `AdminShell` mirrors the shared `PageHeader` masthead (eyebrow → h1 → lede →
 * breadcrumb → action) without re-wrapping the container. Everything else here
 * is a thin, unopinionated wrapper over `@/components/ui`.
 */

// ---------------------------------------------------------------------------
// Shell & layout
// ---------------------------------------------------------------------------

export function AdminShell({
  eyebrow,
  title,
  description,
  breadcrumb,
  actions,
  children,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  breadcrumb?: { label: string; to: string }[]
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-7">
      <header className="border-b border-line pb-6">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3">
            <Breadcrumbs items={breadcrumb} />
          </nav>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-ink md:text-[2.125rem]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
          )}
        </div>
      </header>

      {children}
    </div>
  )
}

/** Titled card. The heading is an `<h2>` so it nests correctly under the page. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <Card className={className} id={id}>
      {(title || action) && (
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            )}
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </CardHeader>
      )}
      <CardContent className={bodyClassName}>{children}</CardContent>
    </Card>
  )
}

/** Definition grid for record detail — label/value pairs, no markup per page. */
export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[]
  className?: string
  columns?: 1 | 2 | 3
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Loading / error / empty
// ---------------------------------------------------------------------------

export function AsyncSection({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  empty,
  skeleton,
  children,
  className,
}: {
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry?: () => void
  isEmpty?: boolean
  empty?: ReactNode
  skeleton?: ReactNode
  children: ReactNode
  className?: string
}) {
  if (isLoading) {
    return (
      <div className={className}>
        {skeleton ?? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        )}
      </div>
    )
  }

  if (isError) {
    return (
      <Alert
        variant="danger"
        title="This data could not be loaded"
        action={
          onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {errorMessage(error)}
      </Alert>
    )
  }

  if (isEmpty) {
    return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  }

  return <div className={className}>{children}</div>
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: string
  className?: string
  dot?: boolean
}) {
  return (
    <Badge variant={statusTone(status)} size="sm" dot={dot} className={className}>
      {humanise(status)}
    </Badge>
  )
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Announced status for in-flight saves; never a bare loading string. */
export function SaveStatus({
  state,
  message,
  className,
}: {
  state: SaveState
  message?: string
  className?: string
}) {
  const text =
    state === 'saving'
      ? (message ?? 'Saving…')
      : state === 'saved'
        ? (message ?? 'Changes saved')
        : state === 'error'
          ? (message ?? 'Could not save — nothing was changed')
          : ''

  return (
    <p
      aria-live="polite"
      role="status"
      className={cn(
        'text-xs',
        state === 'error' ? 'text-danger' : state === 'saved' ? 'text-success' : 'text-muted',
        className,
      )}
    >
      {text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Filters & tabs
// ---------------------------------------------------------------------------

/** Toggleable filter chip. `aria-current` marks the active selection. */
export function Chip({
  active,
  onClick,
  children,
  count,
  className,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  count?: number
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-pill border px-3 text-[0.8125rem] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line-strong bg-transparent text-ink-soft hover:border-ink hover:bg-sand',
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('tabular-nums', active ? 'text-canvas/70' : 'text-faint')}>
          {count}
        </span>
      )}
    </button>
  )
}

export function ChipRow({
  label,
  children,
  className,
  onClear,
  clearLabel = 'Clear',
}: {
  label: string
  children: ReactNode
  className?: string
  onClear?: () => void
  clearLabel?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label={label}>
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          {clearLabel}
        </button>
      )}
    </div>
  )
}

export interface TabItem {
  id: string
  label: string
  count?: number
}

/**
 * In-page tab bar. Uses the ARIA tab pattern and additionally marks the active
 * tab with `aria-current`, so both assistive-tech conventions resolve.
 */
export function Tabs({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  label: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex flex-wrap gap-1 border-b border-line', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            aria-controls={`panel-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-bronze text-ink'
                : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="rounded-pill bg-sand px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums text-muted">
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  id,
  value,
  children,
}: {
  id: string
  value: string
  children: ReactNode
}) {
  if (id !== value) return null
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className="pt-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  /** Extra controls rendered above the consequence (e.g. a reason textarea). */
  body?: ReactNode
  /** States plainly what will happen, in the user's terms. */
  consequence: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  pending?: boolean
  tone?: 'danger' | 'default'
}

/** Confirmation for every destructive action. Never used without a consequence. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  body,
  consequence,
  confirmLabel,
  cancelLabel = 'Keep it',
  onConfirm,
  pending = false,
  tone = 'danger',
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-4">
          {body}
          <Alert variant={tone === 'danger' ? 'warning' : 'info'}>{consequence}</Alert>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={tone === 'danger' ? 'danger' : 'solid'}
            onClick={onConfirm}
            loading={pending}
            loadingText="Working…"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dirty-state guard
// ---------------------------------------------------------------------------

/**
 * Blocks in-app navigation and the browser unload while a form is dirty.
 * Pair with {@link UnsavedChangesDialog}.
 */
// A hook is safe for Fast Refresh — the rule cannot tell a hook from a constant.
// eslint-disable-next-line react-refresh/only-export-components
export function useUnsavedChanges(isDirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return blocker
}

export function UnsavedChangesDialog({ blocker }: { blocker: ReturnType<typeof useUnsavedChanges> }) {
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.()
      }}
      title="Leave without saving?"
      description="Your edits on this form have not been saved yet."
      consequence="Anything you have typed on this screen will be lost. Save first if you want to keep it."
      confirmLabel="Discard changes"
      cancelLabel="Stay on this page"
      onConfirm={() => blocker.proceed?.()}
    />
  )
}

// ---------------------------------------------------------------------------
// Repeatable list editor
// ---------------------------------------------------------------------------

/** Tag-style repeatable input used for benefits, requirements, and similar. */
export function StringListEditor({
  legend,
  values,
  onChange,
  placeholder,
  hint,
  addLabel = 'Add',
  max,
}: {
  legend: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  hint?: string
  addLabel?: string
  max?: number
}) {
  const [draft, setDraft] = useState('')
  const id = useId()
  const full = max !== undefined && values.length >= max

  const add = () => {
    const value = draft.trim()
    if (!value || full) return
    onChange([...values, value])
    setDraft('')
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-[0.8125rem] font-medium text-ink-soft">{legend}</legend>

      <div className="flex gap-2">
        <Label htmlFor={`${id}-input`} className="sr-only">
          {legend}
        </Label>
        <Input
          id={`${id}-input`}
          value={draft}
          placeholder={placeholder}
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={!draft.trim() || full}
          aria-label={`${addLabel} to ${legend}`}
        >
          <Plus aria-hidden />
          <span className="hidden sm:inline">{addLabel}</span>
        </Button>
      </div>

      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="flex items-center gap-1 rounded-pill border border-line bg-sand py-1 pr-1 pl-2.5 text-xs text-ink"
            >
              <span className="max-w-[16rem] truncate">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                aria-label={`Remove ${value}`}
                className="rounded-full p-1 text-muted transition-colors hover:bg-blush hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && <p className="text-xs text-muted">{hint}</p>}
      {full && <p className="text-xs text-muted">That is the maximum of {max} entries.</p>}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Re-export — every admin view needs an empty state, and pulling it from the
// design-system barrel at a dozen call sites adds nothing.
// ---------------------------------------------------------------------------

export { EmptyState }
