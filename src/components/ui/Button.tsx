import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium transition-all duration-200',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // Primary: warm ink, high contrast, the editorial anchor
        solid:
          'bg-ink text-canvas hover:bg-ink-soft active:bg-ink shadow-xs hover:shadow-sm',
        // Accent: bronze, used sparingly for booking CTAs
        accent:
          'bg-bronze text-white hover:bg-bronze-dark active:bg-bronze-dark shadow-xs hover:shadow-sm',
        // Outline: the default secondary
        outline:
          'border border-line-strong bg-transparent text-ink hover:border-ink hover:bg-sand',
        'outline-light':
          'border border-white/30 bg-transparent text-white hover:border-white hover:bg-white/10',
        ghost: 'bg-transparent text-ink-soft hover:bg-sand hover:text-ink',
        subtle: 'bg-sand text-ink hover:bg-blush',
        link: 'text-bronze-dark underline-offset-4 hover:underline p-0 h-auto',
        danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger',
        destructiveOutline:
          'border border-danger/40 text-danger hover:bg-danger/5 hover:border-danger',
      },
      size: {
        // 44px min touch target on the two most-used mobile sizes.
        sm: 'h-9 px-3.5 text-[0.8125rem] rounded-sm [&_svg]:size-4',
        md: 'h-11 px-5 text-sm rounded-md [&_svg]:size-4',
        lg: 'h-12 px-7 text-[0.9375rem] rounded-md [&_svg]:size-[1.125rem]',
        xl: 'h-14 px-8 text-base rounded-lg [&_svg]:size-5',
        icon: 'size-11 rounded-md [&_svg]:size-5',
        iconSm: 'size-9 rounded-sm [&_svg]:size-4',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'solid', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a router <Link>). */
  asChild?: boolean
  loading?: boolean
  /** Announced to screen readers while `loading`. */
  loadingText?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    asChild = false,
    loading = false,
    loadingText,
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  const isDisabled = disabled || loading

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={asChild ? undefined : isDisabled}
      // A submit button inside a form must not default to type="button".
      type={asChild ? undefined : (type ?? 'button')}
      aria-busy={loading || undefined}
      aria-disabled={asChild && isDisabled ? true : undefined}
      data-loading={loading ? '' : undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-[var(--animate-spin-slow)]" aria-hidden />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

export { buttonVariants }
