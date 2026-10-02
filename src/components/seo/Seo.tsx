import { useEffect } from 'react'
import { absoluteUrl, site } from '@/config/site'

/**
 * Head management for a single-page app.
 *
 * Rather than depend on a helmet library, this mutates the document head
 * directly and keeps a registry of every tag it created, so unmounting a route
 * removes exactly what that route added and cannot leak tags into the next one.
 *
 * The build step (`scripts/generate-seo.mjs`) pre-renders the same tags into
 * static HTML shells for crawlers that do not execute JavaScript.
 */

const MANAGED = 'data-seo-managed'

export interface SeoProps {
  title: string
  description?: string
  /** Absolute path, e.g. `/services/knotless-braids`. */
  path?: string
  /**
   * Accepts null so a database column can be passed straight through
   * (`image={page?.hero_image_url}`) without `?? undefined` at every call site.
   */
  image?: string | null
  type?: 'website' | 'article' | 'product' | 'profile'
  noindex?: boolean
  nofollow?: boolean
  /** JSON-LD graph nodes. Objects are serialised to `application/ld+json`. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /** Suppress the "| Black Chery Unisex Studio" suffix for the home page. */
  bareTitle?: boolean
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------
function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    tag.setAttribute(MANAGED, '')
    document.head.appendChild(tag)
  }
  tag.content = content
}

function upsertLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = rel
    tag.setAttribute(MANAGED, '')
    document.head.appendChild(tag)
  }
  tag.href = href
}

/** All JSON-LD blocks created by the current page. */
let jsonLdTags: HTMLScriptElement[] = []

function replaceJsonLd(nodes: Record<string, unknown> | Record<string, unknown>[] | undefined) {
  for (const tag of jsonLdTags) tag.remove()
  jsonLdTags = []

  if (!nodes) return
  const list = Array.isArray(nodes) ? nodes : [nodes]

  for (const node of list) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute(MANAGED, '')
    try {
      script.textContent = JSON.stringify(node)
      document.head.appendChild(script)
      jsonLdTags.push(script)
    } catch {
      // A malformed node must never break rendering.
      if (import.meta.env.DEV) console.warn('[seo] invalid JSON-LD node', node)
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSeo({
  title,
  description,
  path,
  image,
  type = 'website',
  noindex = false,
  nofollow = false,
  jsonLd,
  bareTitle = false,
}: SeoProps): void {
  const fullTitle = bareTitle ? title : `${title} | ${site.name}`
  const url = absoluteUrl(path ?? window.location.pathname)
  const metaDescription = description ?? site.shortDescription
  const imageUrl = image ? absoluteUrl(image) : absoluteUrl('/og-image.jpg')

  useEffect(() => {
    document.title = fullTitle

    upsertMeta('meta[name="description"]', 'name', 'description', metaDescription)
    upsertMeta('meta[name="robots"]', 'name', 'robots',
      `${noindex ? 'noindex' : 'index'}, ${nofollow ? 'nofollow' : 'follow'}, max-image-preview:large`)
    upsertLink('canonical', url)

    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', metaDescription)
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url)
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type)
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', site.name)
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl)
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', site.locale.replace('-', '_'))

    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metaDescription)
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl)

    replaceJsonLd(jsonLd)
  }, [fullTitle, metaDescription, url, imageUrl, type, noindex, nofollow, jsonLd, bareTitle])
}

// ---------------------------------------------------------------------------
// Structured-data builders
// ---------------------------------------------------------------------------
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    '@id': `${site.url}/#studio`,
    name: site.name,
    legalName: site.legalName,
    // Proprietor is machine-readable here rather than only in visible copy, so
    // search engines can attribute the business to a person.
    founder: {
      '@type': 'Person',
      name: site.owner.name,
      jobTitle: site.owner.role,
    },
    employee: {
      '@type': 'Person',
      name: site.owner.name,
      jobTitle: site.owner.role,
    },
    description: site.shortDescription,
    url: site.url,
    telephone: site.contact.phone,
    email: site.contact.email,
    priceRange: '₦₦',
    currenciesAccepted: 'NGN',
    paymentAccepted: 'Credit Card, Bank Transfer, USSD, Mobile Money, Cash',
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    sameAs: Object.values(site.social),
  }
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}

export function serviceSchema(input: {
  name: string
  description: string
  slug: string
  priceFrom: number
  priceTo?: number | null
  durationMinutes: number
  image?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: absoluteUrl(`/services/${input.slug}`),
    image: input.image ? absoluteUrl(input.image) : undefined,
    serviceType: 'Hair salon',
    provider: { '@type': 'HairSalon', '@id': `${site.url}/#studio` },
    areaServed: { '@type': 'City', name: 'Lagos' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'NGN',
      lowPrice: input.priceFrom,
      highPrice: input.priceTo ?? input.priceFrom,
      offerCount: input.priceTo ? 2 : 1,
    },
    ...(input.durationMinutes
      ? { estimatedDuration: `PT${input.durationMinutes}M` }
      : {}),
  }
}

export function productSchema(input: {
  name: string
  description: string
  slug: string
  sku?: string | null
  price: number
  image?: string | null
  rating?: number | null
  reviewCount?: number
  inStock?: boolean
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    url: absoluteUrl(`/shop/${input.slug}`),
    image: input.image ? [absoluteUrl(input.image)] : undefined,
    sku: input.sku ?? undefined,
    brand: { '@type': 'Brand', name: 'Black Chery Unisex Studio' },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/shop/${input.slug}`),
      priceCurrency: 'NGN',
      price: input.price,
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
    ...(input.rating && input.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.rating,
            reviewCount: input.reviewCount,
          },
        }
      : {}),
  }
}

export function jobSchema(input: {
  title: string
  description: string
  slug: string
  postedAt: string | null
  employmentType: string
  salaryMin?: number | null
  salaryMax?: number | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: input.title,
    description: input.description,
    url: absoluteUrl(`/careers/${input.slug}`),
    datePosted: input.postedAt ?? undefined,
    employmentType: input.employmentType.replace('_', ' ').toUpperCase(),
    hiringOrganization: {
      '@type': 'Organization',
      name: site.name,
      sameAs: site.url,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: site.address.locality,
        addressRegion: site.address.region,
        addressCountry: site.address.country,
      },
    },
    ...(input.salaryMin
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'NGN',
            ...(input.salaryMax
              ? {
                  value: {
                    '@type': 'QuantitativeValue',
                    minValue: input.salaryMin,
                    maxValue: input.salaryMax,
                    unitText: 'MONTH',
                  },
                }
              : { value: { '@type': 'QuantitativeValue', value: input.salaryMin, unitText: 'MONTH' } }),
          },
        }
      : {}),
  }
}

export function faqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

export function reviewSchema(reviews: {
  rating: number
  body: string
  author?: string | null
  date: string
}[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    review: reviews.map((review) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
      name: review.body.slice(0, 60),
      reviewBody: review.body,
      author: { '@type': 'Person', name: review.author ?? 'Black Chery Unisex Studio client' },
      datePublished: review.date,
    })),
  }
}
