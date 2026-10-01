import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const alertVariants = cva('rounded-md border p-4 flex gap-3', {
  variants: {
    variant: {
      info: 'border-info/25 bg-info/[0.06] text-ink',
      success: 'border-success/25 bg-success/[0.06] text-ink',
      warning: 'border-warning/30 bg-warning/[0.07] text-ink',
      danger: 'border-danger/30 bg-danger/[0.06] text-ink',
      neutral: 'border-line bg-sand/60 text-ink',
    },
  },
  defaultVariants: { variant: 'info' },
})

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  neutral: Info,
}

const TONE = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string
  action?: React.ReactNode
}

export function Alert({ className, variant = 'info', title, action, children, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? 'info']

  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      role={variant === 'danger' ? 'alert' : 'status'}
      {...props}
    >
      <Icon className={cn('mt-0.5 size-4.5 shrink-0', TONE[variant ?? 'info'])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="text-sm leading-relaxed text-ink-soft">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table — responsive by default: a real table on desktop, stacked cards on mobile
// ---------------------------------------------------------------------------
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-left text-sm', className)}
        {...props}
      />
    </div>
  )
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-line text-[0.6875rem] uppercase tracking-wider text-muted', className)}
      {...props}
    />
  )
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-4 py-2.5 font-semibold', className)} {...props} />
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-sand/40', className)} {...props} />
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-ink-soft', className)} {...props} />
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
}) {
  if (pageCount <= 1) return null

  const pages = buildPageList(page, pageCount)

  return (
    <nav
      className={cn('flex items-center justify-center gap-1', className)}
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="rounded-sm px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-sand disabled:pointer-events-none disabled:opacity-40"
      >
        Previous
      </button>

      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1.5 text-sm text-faint" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onPageChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(
              'min-w-9 rounded-sm px-2.5 py-1.5 text-sm tabular-nums transition-colors',
              entry === page
                ? 'bg-ink text-canvas font-medium'
                : 'text-ink-soft hover:bg-sand',
            )}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
        className="rounded-sm px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-sand disabled:pointer-events-none disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}

/** 1 … 4 5 6 … 20 — always shows first, last and a window around the current page. */
function buildPageList(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const pages = new Set<number>([1, pageCount, page])
  for (const offset of [-1, 1]) {
    const candidate = page + offset
    if (candidate > 1 && candidate < pageCount) pages.add(candidate)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | 'gap')[] = []

  sorted.forEach((value, index) => {
    if (index > 0 && value - (sorted[index - 1] as number) > 1) result.push('gap')
    result.push(value)
  })

  return result
}
