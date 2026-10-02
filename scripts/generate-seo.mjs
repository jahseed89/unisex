/**
 * SEO build step.
 *
 * A client-rendered SPA is a poor experience for crawlers that do not execute
 * JavaScript, so this emits, into `dist/`:
 *
 *   1. sitemap.xml            — every indexable route with lastmod + priority
 *   2. robots.txt             — allow public, disallow app surfaces, sitemap ref
 *   3. <route>/index.html     — a prerendered shell per SEO-critical route,
 *                               carrying the same title/description/canonical/
 *                               JSON-LD the SPA sets at runtime
 *
 * The shells are pure static HTML: no bundler, no SSR runtime, no extra
 * dependency. If you later migrate to SSR or ISR, delete step 3 and keep
 * steps 1-2.
 *
 * Dynamic routes (service slugs, product slugs, job slugs) come from
 * `scripts/seo-routes.generated.json` when present. Produce it from a live
 * database with `npm run seo:generate -- --fetch`; otherwise only the curated
 * static routes below are emitted and dynamic pages rely on runtime <head>.
 *
 * Usage:
 *   node scripts/generate-seo.mjs [--fetch] [--out dist]
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const shouldFetch = args.includes('--fetch')
const outIndex = args.indexOf('--out')
const outDir = join(root, outIndex !== -1 ? args[outIndex + 1] : 'dist')

// ---------------------------------------------------------------------------
// Site constants — kept in step with src/config/site.ts
// ---------------------------------------------------------------------------
const SITE = {
  url: (process.env.VITE_APP_URL || 'https://blackcheryunisexstudio.com').replace(/\/$/, ''),
  name: 'Black Chery Unisex Studio',
  description:
    'Black Chery Unisex Studio is a premium unisex salon in Lagos, Nigeria. Book hair, braids, locs, colour and styling appointments, shop wigs, extensions and hair care, and join our team.',
  locale: 'en_NG',
  twitter: '@blackcheryunisexstudio',
  // Mirrors site.owner in src/config/site.ts.
  owner: {
    name: 'Wisdom Ocran',
    role: 'Founder & Head Stylist',
  },
}

/** Routes that must never be indexed. */
const BLOCKED = [
  '/account',
  '/staff',
  '/admin',
  '/checkout',
  '/auth',
  '/cart',
  '/search',
]

// ---------------------------------------------------------------------------
// Curated static routes
// ---------------------------------------------------------------------------
const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changefreq: 'weekly', title: `${SITE.name} | Premium Unisex Salon, Bookings & Products`, description: SITE.description },
  { path: '/about', priority: 0.8, changefreq: 'monthly', title: `About Us | ${SITE.name}`, description: 'The story, the team and the values behind Black Chery Unisex Studio — a premium unisex salon in Lagos for braids, locs, hair, colour and styling.' },
  { path: '/services', priority: 0.95, changefreq: 'weekly', title: `Salon Services & Prices | ${SITE.name}`, description: 'Browse knotless braids, box braids, locs, silk press, balayage, haircuts and treatments. See prices, durations and aftercare advice, then book online.' },
  { path: '/book', priority: 0.95, changefreq: 'weekly', title: `Book an Appointment | ${SITE.name}`, description: 'Pick your service, stylist and time. Share your hair details and reference images so your stylist is ready before you arrive.' },
  { path: '/shop', priority: 0.9, changefreq: 'daily', title: `Shop Wigs, Extensions & Hair Care | ${SITE.name}`, description: 'Buy the exact hair we install. Human hair wigs, bundles, frontals, protein treatments, oils and accessories.' },
  { path: '/gallery', priority: 0.7, changefreq: 'weekly', title: `Hair Gallery | ${SITE.name}`, description: 'Real work from our chairs — braids, locs, colour, cuts and styling, photographed in the studio.' },
  { path: '/careers', priority: 0.8, changefreq: 'weekly', title: `Careers at ${SITE.name} — Join Our Team`, description: 'Open roles for stylists, colourists and front desk. Apply online with your CV and portfolio.' },
  { path: '/contact', priority: 0.7, changefreq: 'monthly', title: `Contact & Directions | ${SITE.name}`, description: 'Visit us in Victoria Island, Lagos. Opening hours, phone, WhatsApp and directions.' },
  { path: '/policies/privacy', priority: 0.3, changefreq: 'yearly', title: `Privacy Policy | ${SITE.name}`, description: 'How Black Chery Unisex Studio collects, uses and protects your personal data.' },
  { path: '/policies/terms', priority: 0.3, changefreq: 'yearly', title: `Terms of Service | ${SITE.name}`, description: 'The terms that apply when you book an appointment or buy from Black Chery Unisex Studio.' },
  { path: '/policies/bookings', priority: 0.4, changefreq: 'monthly', title: `Booking & Cancellation Policy | ${SITE.name}`, description: 'Booking windows, notice periods, deposits and our 24-hour cancellation policy.' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const escapeXml = (value) =>
  value.replace(/[<>&'"]/g, (char) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[char]};`)

const escapeHtml = (value) =>
  value.replace(/[&<>"]/g, (char) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[char]};`)

const absolute = (path) => `${SITE.url}${path === '/' ? '' : path}`

const today = new Date().toISOString().slice(0, 10)

function log(step, message) {
  console.log(`  ${step} ${message}`)
}

/** Organisation node, reused across every page so entities stay connected. */
function organizationNode() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    '@id': `${SITE.url}/#studio`,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    telephone: '+234-800-000-0000',
    email: 'hello@blackcheryunisexstudio.com',
    priceRange: '₦₦',
    // Matches the runtime organizationSchema() in src/components/seo/Seo.tsx.
    founder: {
      '@type': 'Person',
      name: SITE.owner.name,
      jobTitle: SITE.owner.role,
    },
    employee: {
      '@type': 'Person',
      name: SITE.owner.name,
      jobTitle: SITE.owner.role,
    },
    currenciesAccepted: 'NGN',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '12 Adeola Odeku Street',
      addressLocality: 'Victoria Island',
      addressRegion: 'Lagos',
      postalCode: '106104',
      addressCountry: 'NG',
    },
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '09:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday'], opens: '09:00', closes: '20:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '10:00', closes: '20:00' },
    ],
    sameAs: [
      'https://instagram.com/blackcheryunisexstudio',
      'https://facebook.com/blackcheryunisexstudio',
      'https://tiktok.com/@blackcheryunisexstudio',
    ],
  }
}

function breadcrumbNode(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absolute(crumb.path),
    })),
  }
}

/** Build the per-route JSON-LD graph. */
function jsonLdFor(route) {
  const trail = route.breadcrumb ?? [{ label: 'Home', path: '/' }]
  return [organizationNode(), breadcrumbNode(trail), ...(route.jsonLd ?? [])]
}

// ---------------------------------------------------------------------------
// Dynamic routes
// ---------------------------------------------------------------------------
async function loadDynamicRoutes() {
  const file = join(root, 'scripts', 'seo-routes.generated.json')

  try {
    await access(file)
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (Array.isArray(parsed) && parsed.length > 0) {
      log('+', `${parsed.length} dynamic routes from seo-routes.generated.json`)
      return parsed
    }
    log('!', 'seo-routes.generated.json was empty')
  } catch {
    // Absent by design; static routes still work.
  }

  return []
}

async function fetchDynamicRoutes() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    log('!', '--fetch needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; skipping')
    return []
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [services, products, jobs] = await Promise.all([
    supabase.from('services').select('slug, name, summary, price_from, price_to, duration_minutes, updated_at').eq('status', 'active'),
    supabase.from('products').select('slug, name, summary, base_price, updated_at').eq('status', 'active'),
    supabase.from('jobs').select('slug, title, summary, description, employment_type, salary_min, salary_max, published_at').eq('status', 'open'),
  ])

  for (const [name, result] of [['services', services], ['products', products], ['jobs', jobs]]) {
    if (result.error) log('!', `${name}: ${result.error.message}`)
  }

  const routes = []

  for (const row of services.data ?? []) {
    routes.push({
      path: `/services/${row.slug}`,
      changefreq: 'weekly',
      priority: 0.8,
      lastmod: row.updated_at?.slice(0, 10) ?? today,
      title: `${row.name} | ${SITE.name}`,
      description: row.summary,
      breadcrumb: [
        { label: 'Home', path: '/' },
        { label: 'Services', path: '/services' },
        { label: row.name, path: `/services/${row.slug}` },
      ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: row.name,
          description: row.summary,
          url: absolute(`/services/${row.slug}`),
          serviceType: 'Hair salon',
          provider: { '@id': `${SITE.url}/#studio` },
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'NGN',
            lowPrice: row.price_from,
            ...(row.price_to ? { highPrice: row.price_to } : {}),
          },
          estimatedDuration: `PT${row.duration_minutes}M`,
        },
      ],
    })
  }

  for (const row of products.data ?? []) {
    routes.push({
      path: `/shop/${row.slug}`,
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: row.updated_at?.slice(0, 10) ?? today,
      title: `${row.name} | ${SITE.name}`,
      description: row.summary,
      breadcrumb: [
        { label: 'Home', path: '/' },
        { label: 'Shop', path: '/shop' },
        { label: row.name, path: `/shop/${row.slug}` },
      ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: row.name,
          description: row.summary,
          url: absolute(`/shop/${row.slug}`),
          brand: { '@type': 'Brand', name: SITE.name },
          offers: {
            '@type': 'Offer',
            priceCurrency: 'NGN',
            price: row.base_price,
            availability: 'https://schema.org/InStock',
          },
        },
      ],
    })
  }

  for (const row of jobs.data ?? []) {
    routes.push({
      path: `/careers/${row.slug}`,
      changefreq: 'daily',
      priority: 0.8,
      lastmod: (row.published_at ?? today).slice(0, 10),
      title: `${row.title} — Careers at ${SITE.name}`,
      description: row.summary,
      breadcrumb: [
        { label: 'Home', path: '/' },
        { label: 'Careers', path: '/careers' },
        { label: row.title, path: `/careers/${row.slug}` },
      ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'JobPosting',
          title: row.title,
          description: row.summary,
          url: absolute(`/careers/${row.slug}`),
          datePosted: (row.published_at ?? today).slice(0, 10),
          employmentType: String(row.employment_type).replace('_', ' ').toUpperCase(),
          hiringOrganization: { '@id': `${SITE.url}/#studio` },
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Victoria Island',
              addressRegion: 'Lagos',
              addressCountry: 'NG',
            },
          },
        },
      ],
    })
  }

  if (routes.length > 0) {
    await writeFile(
      join(root, 'scripts', 'seo-routes.generated.json'),
      JSON.stringify(routes, null, 2),
    )
    log('+', `wrote scripts/seo-routes.generated.json (${routes.length} routes)`)
  }

  return routes
}

// ---------------------------------------------------------------------------
// Output builders
// ---------------------------------------------------------------------------
function sitemap(routes) {
  const urls = routes
    .map((route) => {
      const priority = (route.priority ?? 0.5).toFixed(2)
      return [
        '  <url>',
        `    <loc>${escapeXml(absolute(route.path))}</loc>`,
        `    <lastmod>${route.lastmod ?? today}</lastmod>`,
        `    <changefreq>${route.changefreq ?? 'monthly'}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`
}

function robots() {
  const disallow = BLOCKED.map((path) => `Disallow: ${path}`).join('\n')
  return `# ${SITE.name}
User-agent: *
Allow: /
${disallow}

# Personal, authenticated and transactional surfaces
Disallow: /account/
Disallow: /admin/
Disallow: /staff/
Disallow: /checkout/
Disallow: /cart
Disallow: /auth/
Disallow: /*?*sort=
Disallow: /*?*q=

Sitemap: ${SITE.url}/sitemap.xml
`
}

/**
 * Rewrite an SPA shell with route-specific head tags.
 *
 * The template already carries a default title, description, canonical, OG/Twitter
 * block and one JSON-LD node. Those are removed first, then a complete, single
 * set is injected — otherwise every shell would ship two conflicting
 * Organization nodes and duplicate Open Graph tags, which is exactly the kind of
 * inconsistency that gets a rich result suppressed.
 *
 * The runtime script must not fight the prerendered tags; `useSeo` overwrites
 * them on hydration, which is the intended behaviour.
 */
function prerenderShell(template, route) {
  const url = absolute(route.path)
  const description = route.description ?? SITE.description
  const image = `${SITE.url}/og-image.jpg`
  const jsonLd = JSON.stringify(jsonLdFor(route))
  const marker = '<!-- seo:prerendered -->'

  // --- Strip everything the runtime would manage ---------------------------
  let html = template

  html = html
    // A previous run's block. The root route rewrites dist/index.html in place,
    // so without this the template would grow a fresh head block on every run.
    .replace(/<!-- seo:prerendered -->[\s\S]*?(?=<\/head>)/g, '')
    // Existing JSON-LD (the local business node baked into index.html).
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')
    // Default title and social/search metadata.
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="robots"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')

  const head = [
    marker,
    `<title>${escapeHtml(route.title ?? SITE.name)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta property="og:title" content="${escapeHtml(route.title ?? SITE.name)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="${SITE.twitter}" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title ?? SITE.name)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n    ')

  html = html.replace('</head>', `    ${head}\n  </head>`)

  // An explicit noindex override, e.g. for the 404 shell.
  if (route.noindex) {
    html = html.replace(
      /<meta name="robots" content="[^"]*"/,
      '<meta name="robots" content="noindex, follow"',
    )
  }

  return html
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nSEO generation → ${outDir}\n`)

  const dynamic = shouldFetch ? await fetchDynamicRoutes() : await loadDynamicRoutes()
  const routes = [...STATIC_ROUTES, ...dynamic]

  await mkdir(outDir, { recursive: true })

  // 1. Sitemap
  await writeFile(join(outDir, 'sitemap.xml'), sitemap(routes), 'utf8')
  log('✓', `sitemap.xml (${routes.length} URLs)`)

  // 2. Robots
  await writeFile(join(outDir, 'robots.txt'), robots(), 'utf8')
  log('✓', 'robots.txt')

  // 3. Prerendered shells
  const templatePath = join(outDir, 'index.html')
  let template
  try {
    template = await readFile(templatePath, 'utf8')
  } catch {
    log('!', 'dist/index.html not found — run `vite build` first; skipping prerender')
    console.log('\nDone.\n')
    return
  }

  let written = 0
  for (const route of routes) {
    const html = prerenderShell(template, route)
    const dir = route.path === '/' ? outDir : join(outDir, route.path.replace(/^\//, ''))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html, 'utf8')
    written += 1
  }

  // 404 shell
  await writeFile(
    join(outDir, '404.html'),
    prerenderShell(template, {
      path: '/404',
      title: `Page not found | ${SITE.name}`,
      description: 'That page does not exist.',
      noindex: true,
    }),
    'utf8',
  )

  log('✓', `${written} prerendered shells + 404.html`)
  console.log('\nDone.\n')
}

await main()
