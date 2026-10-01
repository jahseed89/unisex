import { forwardRef } from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Accordion. Uses a plus/minus indicator rather than a chevron, which reads more
 * clearly at editorial type sizes and communicates expand/collapse better.
 */
export const Accordion = AccordionPrimitive.Root

export const AccordionItem = forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('border-b border-line last:border-b-0', className)}
      {...props}
    />
  )
})

export const AccordionTrigger = forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'group flex flex-1 items-start justify-between gap-4 py-4 text-left',
          'font-display text-[0.9375rem] font-medium leading-snug text-ink transition-colors',
          'hover:text-bronze-dark disabled:pointer-events-none',
          className,
        )}
        {...props}
      >
        {children}
        <span
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition-colors group-hover:border-bronze group-hover:text-bronze"
          aria-hidden
        >
          <Plus className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-45" />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})

export const AccordionContent = forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden',
        'data-[state=closed]:animate-[var(--animate-fade-in)]',
        className,
      )}
      {...props}
    >
      <div className="pb-5 pr-8">{children}</div>
    </AccordionPrimitive.Content>
  )
})
