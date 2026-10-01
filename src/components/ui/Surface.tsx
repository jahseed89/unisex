import { cn } from '@/lib/utils/cn'

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-surface',
        interactive &&
          'transition-all duration-200 hover:border-line-strong hover:shadow-md',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1 p-5 pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-ink', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-3 border-t border-line px-5 py-4', className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Section heading — the editorial page/section masthead
// ---------------------------------------------------------------------------
export interface SectionHeadingProps {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'left' | 'center'
  action?: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  action,
  className,
  as: Tag = 'h2',
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        align === 'center' && 'items-center text-center',
        action && 'sm:flex-row sm:items-end sm:justify-between sm:gap-8',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <Tag className="display-section">{title}</Tag>
        {description && (
          <p className={cn('lede mt-4', align === 'center' && 'mx-auto max-w-xl')}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat — dashboard figure
// ---------------------------------------------------------------------------
export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  trend?: { value: number; label?: string }
  icon?: React.ReactNode
  className?: string
}) {
  const positive = (trend?.value ?? 0) >= 0

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-muted">{label}</p>
        {icon && <span className="text-bronze [&_svg]:size-4.5">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[1.75rem] leading-none font-semibold tracking-tight text-ink">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend && (
          <span className={cn('font-medium', positive ? 'text-success' : 'text-danger')}>
            {positive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(0)}%
          </span>
        )}
        {(trend?.label || hint) && (
          <span className="text-muted">{trend?.label ?? hint}</span>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-sand/40 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface text-bronze shadow-xs [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden {...props} />
}

/** Screen-reader-only live region for async status. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]">
      {children}
    </span>
  )
}

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} {...props} />
}
