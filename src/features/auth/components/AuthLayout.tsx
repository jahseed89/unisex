import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'

import { site } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { whatsappLink } from '@/lib/utils/format'
import { GoogleMark } from './GoogleMark'

/**
 * Layout for every `/auth/*` screen.
 *
 * The router mounts these inside the marketing shell, so this deliberately adds
 * no header or footer of its own — just the split panel the brief asks for:
 * the form on the left, a warm brand panel on the right at `lg` and above,
 * stacked below it on mobile.
 */
export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  className,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-b border-line bg-canvas', className)}>
      <div className="mx-auto grid w-full max-w-[90rem] lg:grid-cols-[1fr_minmax(0,38rem)]">
        {/* Form column ---------------------------------------------------- */}
        <div className="flex items-center justify-center px-[var(--spacing-gutter)] py-12 lg:py-20">
          <div className="w-full max-w-[26rem]">
            <Link
              to="/"
              className="inline-flex items-baseline gap-1.5 transition-opacity hover:opacity-80"
              aria-label={`${site.name} — back to the home page`}
            >
              <span className="font-display text-[1.0625rem] font-semibold uppercase tracking-[0.16em] text-ink">
                {site.wordmark.primary}
              </span>
              <span className="font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-bronze">
                {site.wordmark.accent}
              </span>
              <span className="font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-ink-soft">
                {site.wordmark.suffix}
              </span>
            </Link>

            <div className="mt-9">
              {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
              <h1 className="display-section">{title}</h1>
              {description && (
                <div className="lede mt-4 text-[0.9375rem]">{description}</div>
              )}
            </div>

            <div className="mt-8">{children}</div>

            {footer && (
              <div className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-muted">
                {footer}
              </div>
            )}
          </div>
        </div>

        {/* Brand panel ---------------------------------------------------- */}
        <BrandPanel />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brand panel
// ---------------------------------------------------------------------------
function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden bg-ink lg:block"
      aria-label="About Unisex Hair Studio"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(120% 90% at 100% 0%, rgba(169,132,103,0.35) 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(181,113,79,0.28) 0%, transparent 60%)',
        }}
        aria-hidden
      />

      <div className="relative flex h-full flex-col justify-between gap-10 p-12 xl:p-16">
        <div>
          <p className="eyebrow text-bronze-light">Your chair is waiting</p>
          <p className="mt-5 font-display text-[2rem] leading-[1.15] text-canvas xl:text-[2.5rem]">
            An account keeps your brief, your references and your appointments in one place.
          </p>
          <div className="rule-editorial mt-7" aria-hidden />
        </div>

        <ul className="space-y-5">
          <Assurance
            icon={<Sparkles className="size-4" aria-hidden />}
            title="Your hair profile travels with you"
            body="Texture, length, allergies and accessibility needs are saved once and pre-filled on every requirement form."
          />
          <Assurance
            icon={<ShieldCheck className="size-4" aria-hidden />}
            title="Reschedule without a phone call"
            body="Move a booking to a better slot yourself — availability is live, so what you see is what is genuinely free."
          />
          <Assurance
            icon={<MessageCircle className="size-4" aria-hidden />}
            title="WhatsApp if you would rather talk"
            body="A human replies during opening hours, usually within the hour."
          />
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/12 pt-6 text-xs text-white/60">
          <p>
            {site.address.street} · {site.address.locality}, {site.address.region}
          </p>
          <a
            href={whatsappLink("Hi! I'd like to ask about an appointment at Unisex Hair Studio.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-bronze-light transition-colors hover:text-white"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            Message us
          </a>
        </div>
      </div>
    </aside>
  )
}

function Assurance({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-bronze/30 text-bronze-light">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[0.9375rem] font-semibold text-canvas">{title}</span>
        <span className="mt-1 block text-[0.8125rem] leading-relaxed text-white/65">{body}</span>
      </span>
    </li>
  )
}

/** "← Back to the studio" — the escape hatch on every auth screen. */
export function BackToSite({ label = 'Back to the studio' }: { label?: string }) {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  )
}

export { GoogleMark }
