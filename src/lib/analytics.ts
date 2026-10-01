/**
 * Analytics.
 *
 * Deliberately provider-agnostic and consent-aware: nothing is sent until the
 * visitor opts in, and no identifier is created that we cannot delete on
 * request. Events are also mirrored to `window.dataLayer` so GTM can pick them up
 * without changing call sites.
 */

import { env } from '@/config/env'

const CONSENT_KEY = 'uhs:analytics-consent'
const DEBUG_PREFIX = '[analytics]'

type Consent = 'granted' | 'denied' | 'unknown'

export interface AnalyticsEvent {
  event: string
  [key: string]: string | number | boolean | undefined
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------
export function getConsent(): Consent {
  if (typeof localStorage === 'undefined') return 'unknown'
  const stored = localStorage.getItem(CONSENT_KEY)
  return stored === 'granted' || stored === 'denied' ? stored : 'unknown'
}

export function hasAnalyticsConsent(): boolean {
  return getConsent() === 'granted'
}

export function setConsent(consent: Exclude<Consent, 'unknown'>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONSENT_KEY, consent)
  if (consent === 'granted') {
    loadScripts()
    trackPageView(window.location.pathname + window.location.search, document.title)
  }
}

// ---------------------------------------------------------------------------
// Loading third-party scripts
// ---------------------------------------------------------------------------
let scriptsLoaded = false

function loadScripts(): void {
  if (scriptsLoaded || typeof document === 'undefined') return
  if (!env.analytics.enabled) return
  scriptsLoaded = true

  if (env.analytics.gaId) {
    // GA4
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${env.analytics.gaId}`
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    // gtag is called with positional arguments, not a record, so the shim
    // wraps them before they reach the dataLayer.
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push({ gtag: args })
    }
    window.gtag('js', new Date())
    window.gtag('config', env.analytics.gaId, {
      anonymize_ip: true,
      send_page_view: false, // reported manually on SPA navigation
    })
  }

  if (env.analytics.plausibleDomain) {
    const script = document.createElement('script')
    script.defer = true
    script.dataset.domain = env.analytics.plausibleDomain
    script.src = 'https://plausible.io/js/script.js'
    document.head.appendChild(script)
  }
}

export function initAnalytics(): void {
  if (getConsent() === 'granted') {
    loadScripts()
    trackPageView(window.location.pathname + window.location.search, document.title)
  } else if (env.app.isDevelopment) {
    console.debug(DEBUG_PREFIX, 'waiting for consent before loading analytics')
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export function trackEvent({ event, ...params }: AnalyticsEvent): void {
  if (!hasAnalyticsConsent()) return

  // GTM / GA4 event bus
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...params })

  if (window.gtag) window.gtag('event', event, params)
}

export function trackPageView(path: string, title?: string, url?: string): void {
  if (!hasAnalyticsConsent() || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: url ?? window.location.href,
  })
}

// ---------------------------------------------------------------------------
// Typed domain events — one place to change a measurement name
// ---------------------------------------------------------------------------
export const analytics = {
  bookingStarted: (serviceSlug: string, price?: number) =>
    trackEvent({ event: 'begin_booking', service: serviceSlug, value: price }),

  slotSelected: (serviceSlug: string, startsAt: string) =>
    trackEvent({ event: 'select_slot', service: serviceSlug, slot: startsAt }),

  bookingCompleted: (reference: string, value: number) =>
    trackEvent({ event: 'purchase', transaction_id: reference, currency: 'NGN', value }),

  bookingCancelled: (reference: string) =>
    trackEvent({ event: 'cancel_booking', transaction_id: reference }),

  viewService: (slug: string, name: string, price: number) =>
    trackEvent({ event: 'view_item', item_id: slug, item_name: name, value: price }),

  viewProduct: (slug: string, name: string, price: number) =>
    trackEvent({ event: 'view_item', item_id: slug, item_name: name, value: price }),

  addToCart: (slug: string, value: number, quantity: number) =>
    trackEvent({ event: 'add_to_cart', item_id: slug, value, quantity }),

  removeFromCart: (slug: string, value: number, quantity: number) =>
    trackEvent({ event: 'remove_from_cart', item_id: slug, value, quantity }),

  beginCheckout: (value: number, items: number) =>
    trackEvent({ event: 'begin_checkout', value, items }),

  search: (term: string, category?: string) =>
    trackEvent({ event: 'search', search_term: term, ...(category && { item_category: category }) }),

  jobApplicationStarted: (slug: string) =>
    trackEvent({ event: 'begin_application', job: slug }),

  jobApplicationSubmitted: (slug: string) =>
    trackEvent({ event: 'application_submitted', job: slug }),

  signUp: (method: string) => trackEvent({ event: 'sign_up', method }),

  signIn: (method: string) => trackEvent({ event: 'login', method }),

  share: (method: string, content: string) =>
    trackEvent({ event: 'share', method, content_type: content }),

  whatsappClick: (context: string) => trackEvent({ event: 'whatsapp_click', context }),
}

// ---------------------------------------------------------------------------
// Ambient types
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}
