import { X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils/cn'

/**
 * Dialog / modal. Radix supplies focus trapping, escape handling, scroll lock
 * and `aria-modal` semantics; this file only supplies the editorial styling.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const OVERLAY = cn(
  'fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]',
  'data-[state=open]:animate-[var(--animate-fade-in)]',
  'data-[state=closed]:animate-[var(--animate-fade-in)] data-[state=closed]:opacity-0',
)

export function DialogContent({
  className,
  children,
  size = 'md',
  hideClose,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideClose?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={OVERLAY} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg',
          'data-[state=open]:animate-[var(--animate-fade-up)]',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
          size === 'xl' && 'max-w-4xl',
          size === 'full' && 'max-w-6xl',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-4 top-4 z-10 rounded-sm p-1.5 text-muted transition-colors',
              'hover:bg-sand hover:text-ink focus-visible:outline-2 focus-visible:outline-bronze',
            )}
          >
            <X className="size-4.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('shrink-0 space-y-1.5 border-b border-line px-6 py-5 pr-14', className)}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-semibold text-ink', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm leading-relaxed text-muted', className)}
      {...props}
    />
  )
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2.5 border-t border-line bg-sand/40 px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Sheet — the same primitive, anchored to the bottom on mobile and the right on
// desktop. Used for filters, the mobile nav drawer and the cart summary.
// ---------------------------------------------------------------------------
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({
  className,
  children,
  side = 'right',
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'right' | 'left' | 'bottom'
  title: string
  description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={OVERLAY} />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-surface shadow-lg',
          'data-[state=open]:animate-[var(--animate-fade-up)]',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-line safe-bottom',
          side === 'right' && cn('inset-y-0 right-0 w-[min(26rem,92vw)] border-l border-line'),
          side === 'left' && cn('inset-y-0 left-0 w-[min(22rem,88vw)] border-r border-line'),
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
      {...props}
    />
  )
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)} {...props} />
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 gap-2.5 border-t border-line bg-sand/40 px-5 py-4',
        className,
      )}
      {...props}
    />
  )
}
