import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui'

/** Inline page-level spinner, used as a Suspense fallback. */
export function RouteLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-[var(--animate-spin-slow)] text-bronze" aria-hidden />
        <p className="text-sm text-muted">{label}…</p>
      </div>
    </div>
  )
}

/** Card-grid placeholder, so layouts do not jump when data arrives. */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="space-y-2.5 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Full-bleed banner placeholder for hero sections. */
export function HeroSkeleton() {
  return (
    <div className="container-page section-y" aria-hidden>
      <div className="max-w-2xl space-y-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-3 pt-3">
          <Skeleton className="h-12 w-40 rounded-md" />
          <Skeleton className="h-12 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}

/** Generic text-block skeleton. */
export function ContentSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${100 - i * 7}%` }} />
      ))}
    </div>
  )
}
