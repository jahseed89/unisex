import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap font-medium rounded-pill border',
  {
    variants: {
      variant: {
        default: 'bg-sand text-ink-soft border-line',
        accent: 'bg-bronze/12 text-bronze-dark border-bronze/25',
        outline: 'bg-transparent text-ink-soft border-line-strong',
        success: 'bg-success/10 text-success border-success/25',
        warning: 'bg-warning/10 text-warning border-warning/25',
        danger: 'bg-danger/10 text-danger border-danger/25',
        info: 'bg-info/10 text-info border-info/25',
        solid: 'bg-ink text-canvas border-transparent',
        onImage: 'bg-black/55 text-white border-white/20 backdrop-blur-sm',
      },
      size: {
        sm: 'px-2 py-0.5 text-[0.6875rem]',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-[0.8125rem]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Renders a leading status dot. */
  dot?: boolean
}

export function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  )
}

export { badgeVariants }

/** Human-readable label + tone for any status enum value. */
export function statusTone(
  status: string,
): NonNullable<BadgeProps['variant']> {
  switch (status) {
    // Appointments
    case 'confirmed':
    case 'completed':
    case 'paid':
    case 'published':
    case 'active':
    case 'delivered':
    case 'hired':
      return 'success'
    case 'pending':
    case 'draft':
    case 'submitted':
    case 'screening':
    case 'awaiting_payment':
    case 'on_hold':
      return 'warning'
    case 'checked_in':
    case 'in_progress':
    case 'processing':
    case 'out_for_delivery':
    case 'shortlisted':
    case 'interview_scheduled':
    case 'interviewed':
      return 'info'
    case 'cancelled':
    case 'no_show':
    case 'rejected':
    case 'failed':
    case 'returned':
    case 'voided':
      return 'danger'
    case 'ready_for_pickup':
    case 'offer':
    case 'partially_paid':
      return 'accent'
    case 'archived':
    case 'withdrawn':
    case 'closed':
    case 'refunded':
    case 'partially_refunded':
      return 'default'
    default:
      return 'default'
  }
}
