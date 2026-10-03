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

/**
 * Placeholder artwork for slots with no photograph yet.
 *
 * Three layers, all in the brand's warm neutral range: a tonal ground, an arch
 * that reads as a salon mirror, and a fine strand texture. Deterministic on
 * `seed` so a grid of unphotographed tiles stays visually stable rather than
 * reshuffling between renders, with only a narrow hue range so the grid reads
 * as one palette.
 */
function Placeholder({ seed, alt }: { seed: string; alt: string }) {
  const value = hash(seed)
  const hue = 26 + (value % 8)
  const angle = 96 + (value % 24)
  const archX = 58 + (value % 24)
  const uid = `ph-${value}`

  return (
    <div
      className="media-placeholder absolute inset-0"
      role="img"
      aria-label={alt}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, hsl(${hue} 26% 93%) 0%, hsl(${hue + 4} 20% 88%) 48%, hsl(${hue - 3} 22% 83%) 100%)`,
      }}
    >
      <svg className="size-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          {/* Strand texture: fine, low contrast, reads as hair at any scale. */}
          <pattern
            id={`${uid}-strand`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${(value % 24) - 12})`}
          >
            <path
              d="M0 7 Q 1.75 1.5 3.5 7 T 7 7"
              fill="none"
              stroke={`hsl(${hue} 26% 38%)`}
              strokeWidth="0.55"
              opacity="0.5"
            />
          </pattern>

          {/* Mirror arch: a vertical highlight, as if lit from a fitting room. */}
          <linearGradient id={`${uid}-arch`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBF8F4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FBF8F4" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width="200" height="200" fill={`url(#${uid}-strand)`} opacity="0.34" />

        <path
          d={`M ${archX} 200 L ${archX} ${70} Q 100 ${18} ${200 - archX} ${70} L ${200 - archX} 200 Z`}
          fill={`url(#${uid}-arch)`}
        />
        <path
          d={`M ${archX} 200 L ${archX} ${70} Q 100 ${18} ${200 - archX} ${70} L ${200 - archX} 200`}
          fill="none"
          stroke={`hsl(${hue} 30% 34%)`}
          strokeWidth="0.7"
          opacity="0.28"
        />
      </svg>
    </div>
  )
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
          // React 18 only forwards the lowercase DOM attribute; `fetchPriority`
          // type-checks but warns on every image in the console. React 19 accepts
          // the camelCase form, so this can go back to `fetchPriority` then.
          {...{ fetchpriority: priority ? 'high' : 'auto' }}
          onError={() => setFailed(true)}
          className={cn('size-full object-cover', imgClassName)}
        />
      ) : (
        <Placeholder seed={seed} alt={alt} />
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
