import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

/**
 * Account sub-sections.
 *
 * The dashboard shell supplies the page chrome, so these are deliberately flat
 * — a heading, an optional action, then content. Every account page uses them
 * so the vertical rhythm stays identical from Overview to Orders.
 */
export function AccountSection({
  id,
  title,
  description,
  action,
  children,
  className,
  headingLevel = 'h2',
}: {
  /** Anchor id, so the shell's skip links and deep links can target it. */
  id?: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  headingLevel?: 'h2' | 'h3'
}) {
  const Tag = headingLevel

  return (
    <section id={id} className={cn('space-y-4', className)} aria-labelledby={id ? `${id}-heading` : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Tag id={id ? `${id}-heading` : undefined} className="font-display text-lg font-semibold text-ink">
            {title}
          </Tag>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {children}
    </section>
  )
}

/** Standard "see everything" link for a section header. */
export function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-bronze-dark transition-colors hover:text-bronze"
    >
      {label}
      <ChevronRight className="size-3.5" aria-hidden />
    </Link>
  )
}
