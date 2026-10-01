import { Link } from 'react-router-dom'
import { ChevronRight, Clock, MapPin, Sparkles } from 'lucide-react'
import {
  formatDateTime,
  formatDuration,
  formatNaira,
  formatPriceRange,
} from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { site } from '@/config/site'
import { Badge, Card, Rating } from '@/components/ui'
import { Avatar, MediaFrame } from './MediaFrame'
import type {
  AppointmentDetail,
  Job,
  ProductCatalogEntry,
  PublicStaff,
  ServiceCatalogEntry,
} from '@/types'

// ---------------------------------------------------------------------------
// Page masthead
// ---------------------------------------------------------------------------
export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumb,
  action,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  breadcrumb?: { label: string; to: string }[]
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('border-b border-line bg-sand/50', className)}>
      <div className="container-page py-12 md:py-16">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-5">
            <Breadcrumbs items={breadcrumb} />
          </nav>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h1 className="display-section">{title}</h1>
            {description && <p className="lede mt-4">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {children && <div className="mt-8">{children}</div>}
      </div>
    </header>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; to: string }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <li>
        <Link to="/" className="transition-colors hover:text-ink">
          Home
        </Link>
      </li>
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <li key={item.to} className="flex items-center gap-1.5">
            <ChevronRight className="size-3 text-faint" aria-hidden />
            {isLast ? (
              <span className="font-medium text-ink" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="transition-colors hover:text-ink">
                {item.label}
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Service card
// ---------------------------------------------------------------------------
export function ServiceCard({
  service,
  className,
  priority,
}: {
  service: ServiceCatalogEntry
  className?: string
  priority?: boolean
}) {
  return (
    <Card
      interactive
      className={cn(
        'group flex flex-col overflow-hidden transition-shadow duration-300 hover:shadow-lg',
        className,
      )}
    >
      <Link to={`/services/${service.slug}`} className="block">
        <div className="relative">
          <MediaFrame
            src={service.image_url}
            alt={service.name}
            seed={service.slug}
            aspect="4/3"
            priority={priority}
            imgClassName="transition-transform duration-500 ease-[var(--ease-editorial)] group-hover:scale-[1.04]"
          />
          {service.badge && (
            <Badge variant="onImage" size="sm" className="absolute left-3 top-3">
              {service.badge}
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          {service.category_name && (
            <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
              {service.category_name}
            </p>
          )}

          <h3 className="font-display text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-bronze-dark">
            {service.name}
          </h3>

          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{service.summary}</p>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
            <span className="text-sm font-semibold text-ink">
              {formatPriceRange(service.price_from, service.price_to)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Clock className="size-3.5" aria-hidden />
              {formatDuration(service.duration_minutes)}
            </span>
          </div>

          {service.rating_count > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <Rating value={service.rating_avg} size="sm" showValue />
            </div>
          )}
        </div>
      </Link>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------
export function ProductCard({
  product,
  className,
  priority,
  onQuickAdd,
}: {
  product: ProductCatalogEntry
  className?: string
  priority?: boolean
  onQuickAdd?: (product: ProductCatalogEntry) => void
}) {
  const price = product.variant_price ?? product.base_price
  const onSale = product.variant_compare_at_price ?? product.compare_at_price
  const outOfStock = product.available_stock <= 0
  const lowStock = !outOfStock && product.available_stock <= 3
  const discount = onSale && onSale > price ? Math.round(((onSale - price) / onSale) * 100) : null

  return (
    <Card
      interactive
      className={cn('group flex flex-col overflow-hidden', className)}
    >
      <Link to={`/shop/${product.slug}`} className="flex flex-1 flex-col">
        <div className="relative">
          <MediaFrame
            src={product.variant_image_url ?? product.image_url}
            alt={product.name}
            seed={product.slug}
            aspect="square"
            priority={priority}
            imgClassName="transition-transform duration-500 ease-[var(--ease-editorial)] group-hover:scale-[1.04]"
          />

          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {discount && (
              <Badge variant="solid" size="sm">
                −{discount}%
              </Badge>
            )}
            {product.is_best_seller && (
              <Badge variant="accent" size="sm">
                Best seller
              </Badge>
            )}
          </div>

          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-canvas/70 backdrop-blur-[1px]">
              <Badge variant="default" size="lg">
                Out of stock
              </Badge>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {product.brand && (
            <p className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted">
              {product.brand}
            </p>
          )}

          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors group-hover:text-bronze-dark">
            {product.name}
          </h3>

          {product.variant_name && product.variant_name !== 'Standard' && (
            <p className="mt-1 text-xs text-muted">{product.variant_name}</p>
          )}

          <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-3">
            <span className="text-[0.9375rem] font-semibold text-ink">{formatNaira(price)}</span>
            {onSale && onSale > price && (
              <span className="text-xs text-faint line-through">{formatNaira(onSale)}</span>
            )}
          </div>

          {lowStock && (
            <p className="mt-1.5 text-xs font-medium text-clay">
              Only {product.available_stock} left
            </p>
          )}

          {product.rating_count > 0 && (
            <div className="mt-2">
              <Rating value={product.rating_avg} size="sm" />
            </div>
          )}
        </div>
      </Link>

      {!outOfStock && onQuickAdd && product.variant_id && (
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => onQuickAdd(product)}
            className="w-full rounded-sm border border-line-strong py-2 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-sand"
          >
            Add to bag
          </button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Stylist card
// ---------------------------------------------------------------------------
export function StylistCard({
  stylist,
  className,
}: {
  stylist: PublicStaff
  className?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <MediaFrame
        src={stylist.photo_url}
        alt={stylist.full_name}
        seed={stylist.full_name}
        aspect="4/5"
        imgClassName="object-cover object-top"
      />
      <div className="p-5">
        <h3 className="font-display text-base font-semibold text-ink">{stylist.full_name}</h3>
        {stylist.title && <p className="mt-0.5 text-xs text-bronze-dark">{stylist.title}</p>}

        {stylist.headline && (
          <p className="mt-2.5 text-sm leading-relaxed text-muted">{stylist.headline}</p>
        )}

        {stylist.specialities.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {stylist.specialities.slice(0, 3).map((item) => (
              <Badge key={item} size="sm" variant="default">
                {humaniseTag(item)}
              </Badge>
            ))}
          </div>
        )}

        {stylist.rating_count > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <Rating value={stylist.rating_avg} size="sm" showValue />
          </div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Job card
// ---------------------------------------------------------------------------
export function JobCard({ job, className }: { job: Job; className?: string }) {
  return (
    <Card
      interactive
      className={cn('group p-5 transition-shadow hover:shadow-md', className)}
    >
      <Link to={`/careers/${job.slug}`} className="block">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-bronze-dark">
                {job.title}
              </h3>
              {job.is_featured && (
                <Badge variant="accent" size="sm">
                  Featured
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted">
              {job.department && (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-bronze" aria-hidden />
                  {job.department}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-bronze" aria-hidden />
                {site.address.locality}
              </span>
              <span>{humaniseTag(job.employment_type)}</span>
            </div>
          </div>

          {job.salary_min && (
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink">
                {formatNaira(job.salary_min, { compact: true })}
                {job.salary_max ? ` – ${formatNaira(job.salary_max, { compact: true })}` : ''}
              </p>
              <p className="text-[0.6875rem] text-muted">per {job.salary_period.replace('ly', '')}</p>
            </div>
          )}
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{job.summary}</p>

        <p className="mt-4 text-sm font-medium text-bronze-dark">View role →</p>
      </Link>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Appointment summary — reused on confirmation, account and staff screens
// ---------------------------------------------------------------------------
export function AppointmentSummary({
  appointment,
  className,
}: {
  appointment: AppointmentDetail
  className?: string
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex gap-4">
        <MediaFrame
          src={appointment.service?.image_url}
          alt={appointment.service?.name ?? 'Service'}
          seed={appointment.service?.slug ?? appointment.id}
          aspect="1/1"
          rounded
          className="w-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-ink">
            {appointment.service?.name ?? 'Salon service'}
          </h3>
          {appointment.variant && (
            <p className="mt-0.5 text-xs text-muted">{appointment.variant.label}</p>
          )}
          <p className="mt-2 text-sm text-ink-soft">{formatDateTime(appointment.starts_at)}</p>
          <p className="text-xs text-muted">{formatDuration(appointment.duration_minutes)}</p>
        </div>
      </div>

      <dl className="space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Reference</dt>
          <dd className="font-medium tabular-nums text-ink">{appointment.reference}</dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-muted">Stylist</dt>
          <dd className="flex items-center gap-2 text-ink">
            {appointment.staff ? (
              <>
                <Avatar src={appointment.staff.photo_url} name={appointment.staff.full_name} size="xs" />
                {appointment.staff.full_name}
              </>
            ) : (
              'To be assigned'
            )}
          </dd>
        </div>

        {appointment.location && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Location</dt>
            <dd className="text-right text-ink">
              {appointment.location.name}
              <br />
              <span className="text-xs text-muted">
                {appointment.location.address_line1}, {appointment.location.city}
              </span>
            </dd>
          </div>
        )}

        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="text-muted">{appointment.deposit_paid > 0 ? 'Balance due' : 'Total'}</dt>
          <dd className="font-semibold text-ink">
            {formatNaira(appointment.balance_due || appointment.total)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Re-exported so existing card consumers keep working; the implementation
// now lives with the other formatters.
export { formatDuration } from '@/lib/utils/format'

function humaniseTag(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
