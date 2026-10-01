import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { MediaFrame } from '@/components/shared/MediaFrame'
import { cn } from '@/lib/utils/cn'

/**
 * Product gallery.
 *
 * One large frame with a thumbnail rail and previous/next controls. Every
 * surface is a `MediaFrame`, so a product without photography still renders a
 * deterministic on-brand placeholder rather than a broken image.
 */
export function ProductGallery({
  images,
  alt,
  seed,
  badge,
  className,
}: {
  images: (string | null)[]
  alt: string
  seed: string
  badge?: React.ReactNode
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const frames = images.length > 0 ? images : [null]
  const active = Math.min(index, frames.length - 1)
  const current = frames[active] ?? null

  const go = (delta: number) => {
    setIndex(((active + delta) % frames.length + frames.length) % frames.length)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="group relative overflow-hidden rounded-lg border border-line bg-surface">
        <MediaFrame
          src={current}
          alt={frames.length > 1 ? `${alt} — image ${active + 1} of ${frames.length}` : alt}
          seed={`${seed}-${active}`}
          aspect="4/5"
          priority
        />

        {badge && <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">{badge}</div>}

        {frames.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 text-ink opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 text-ink opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            <p
              className="absolute bottom-3 right-3 rounded-pill bg-black/55 px-2.5 py-1 text-[0.6875rem] font-medium text-white backdrop-blur-sm"
              aria-hidden
            >
              {active + 1} / {frames.length}
            </p>
          </>
        )}
      </div>

      {frames.length > 1 && (
        <ul className="rail gap-2.5 pb-1" aria-label="Product images">
          {frames.map((image, position) => {
            const selected = position === active
            return (
              <li key={`${image ?? 'placeholder'}-${position}`}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-label={`Show image ${position + 1} of ${frames.length}`}
                  aria-current={selected}
                  className={cn(
                    'block size-[4.5rem] overflow-hidden rounded-md border-2 transition-colors',
                    selected ? 'border-bronze' : 'border-line hover:border-line-strong',
                  )}
                >
                  <MediaFrame
                    src={image}
                    alt={`${alt} thumbnail ${position + 1}`}
                    seed={`${seed}-${position}`}
                    aspect="1/1"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
