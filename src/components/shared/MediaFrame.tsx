import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Image surface with an editorial fallback.
 *
 * Real photography is not yet in place, so rather than shipping broken image
 * icons this renders a deterministic, on-brand placeholder derived from the
 * item's slug. The same slug always produces the same composition, which keeps
 * grids visually stable while the studio's photography is being shot.
 */
export interface MediaFrameProps {
  src?: string | null
  alt: string
  /** Stable seed for the placeholder — usually the slug. */
  seed: string
  aspect?: 'square' | '1/1' | '4/3' | '3/2' | '16/9' | '4/5' | 'auto'
  className?: string
  imgClassName?: string
  priority?: boolean
  rounded?: boolean
  children?: React.ReactNode
}

const ASPECT: Record<NonNullable<MediaFrameProps['aspect']>, string> = {
  square: 'aspect-square',
  '1/1': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '16/9': 'aspect-[16/9]',
  '4/5': 'aspect-[4/5]',
  auto: '',
}

/** Small deterministic hash so a slug always maps to the same placeholder. */
function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function MediaFrame({
  src,
  alt,
  seed,
  aspect = '4/3',
  className,
  imgClassName,
  priority = false,
  rounded = false,
  children,
}: MediaFrameProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  const value = hash(seed)

  // Three warm tones keep placeholders distinguishable but harmonious.
  const hue = 24 + (value % 14)
  const angle = (value % 90) + 10

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-sand',
        ASPECT[aspect],
        rounded && 'rounded-lg',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
          className={cn('size-full object-cover', imgClassName)}
        />
      ) : (
        <div
          className="media-placeholder absolute inset-0"
          role="img"
          aria-label={alt}
          style={{
            backgroundImage: `linear-gradient(${angle}deg, hsl(${hue} 28% 92%) 0%, hsl(${hue + 6} 22% 87%) 45%, hsl(${hue - 4} 25% 84%) 100%)`,
          }}
        >
          <svg
            className="size-full opacity-[0.22]"
            viewBox="0 0 200 200"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <pattern id={`hx-${value}`} width="18" height="18" patternUnits="userSpaceOnUse">
                <path
                  d="M0 9 Q 4.5 0 9 9 T 18 9"
                  fill="none"
                  stroke={`hsl(${hue} 30% 40%)`}
                  strokeWidth="0.9"
                />
              </pattern>
            </defs>
            <rect width="200" height="200" fill={`url(#hx-${value})`} />
          </svg>
        </div>
      )}

      {children}
    </div>
  )
}

/**
 * Circular avatar for stylists and reviewers, with the same placeholder
 * treatment as MediaFrame.
 */
export function Avatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const value = hash(name)
  const hue = 24 + (value % 14)

  const dimension = {
    xs: 'size-7 text-[0.5625rem]',
    sm: 'size-9 text-[0.6875rem]',
    md: 'size-12 text-xs',
    lg: 'size-16 text-sm',
  }[size]

  if (!src || failed) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
          dimension,
          className,
        )}
        style={{
          backgroundColor: `hsl(${hue} 30% 90%)`,
          color: `hsl(${hue} 34% 34%)`,
        }}
        aria-hidden
      >
        {name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full object-cover', dimension, className)}
    />
  )
}
