/**
 * Fills image slots with stock salon photography and records the attribution.
 *
 * `src/config/media.ts` is the shot list: every slot declares a file under
 * `public/images`, the alt text that must accompany it, and the intrinsic
 * dimensions used to reserve layout. This script downloads a photograph for each
 * slot from Pexels or Unsplash and writes `src/config/media.credits.ts`, which
 * `publishedCredits()` merges into the footer's attribution disclosure.
 *
 * The manifest is read by bundling it with the esbuild that ships with Vite, so
 * the slot list is never duplicated here — adding a slot to the manifest is
 * enough to make it a target.
 *
 *   PEXELS_API_KEY=…    npm run media:fetch      # preferred
 *   UNSPLASH_ACCESS_KEY=… npm run media:fetch     # alternative
 *
 * Both licenses permit commercial use without attribution; the credits file is
 * written anyway because `docs/12-photography.md` treats visible credit as the
 * norm rather than the exception.
 *
 * Images are fetched through the provider's own resize parameters rather than
 * being re-encoded here, so nothing in this repo needs an image library.
 *
 * Nothing is downloaded unless `--yes` is passed, so a dry run can be inspected
 * first: it prints the plan and exits.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMAGE_DIR = join(root, 'public', 'images')
const CREDITS_FILE = join(root, 'src', 'config', 'media.credits.ts')

const APPLY = process.argv.includes('--yes')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? ''

/**
 * Search terms per slot, keyed by the exact `file` in the manifest.
 *
 * Written per slot rather than per category because the categories are not
 * uniform: `interior` and `team` are landscape, everything else is portrait,
 * and a couple of slots want a very specific subject. A missing key is a hard
 * error — silently skipping would leave a hole nobody notices.
 */
const QUERIES = {
  // Studio-wide establishing shots.
  'studio/hero-01.jpg': { q: 'hair salon styling chairs', orientation: 'landscape' },
  'studio/hero-02.jpg': { q: 'braiding hair salon', orientation: 'portrait' },
  'studio/floor-01.jpg': { q: 'hair salon interior mirrors', orientation: 'landscape' },
  'studio/reception-01.jpg': { q: 'salon reception counter', orientation: 'landscape' },
  'studio/interior-01.jpg': { q: 'hairdressing scissors brushes tools', orientation: 'landscape' },
  'studio/products-01.jpg': { q: 'hair care products bottles shelf', orientation: 'landscape' },
  'studio/about-01.jpg': { q: 'braiding hair', orientation: 'portrait' },
  'studio/team-01.jpg': { q: 'hairdressers working together salon', orientation: 'portrait' },

  // Gallery.
  'gallery/braids-01.jpg': { q: 'knotless braids', orientation: 'portrait' },
  'gallery/braids-02.jpg': { q: 'braiding hair black woman', orientation: 'portrait' },
  'gallery/braids-03.jpg': { q: 'cornrow braids hairstyle', orientation: 'portrait' },
  'gallery/braids-04.jpg': { q: 'braided ponytail hairstyle', orientation: 'portrait' },
  'gallery/locs-01.jpg': { q: 'locs hairstyle', orientation: 'portrait' },
  'gallery/locs-02.jpg': { q: 'dreadlocks woman portrait', orientation: 'portrait' },
  'gallery/locs-03.jpg': { q: 'long dreadlocks updo', orientation: 'portrait' },
  'gallery/locs-04.jpg': { q: 'dreadlocks hair detail', orientation: 'portrait' },
  'gallery/hair-01.jpg': { q: 'haircut woman fresh cut', orientation: 'portrait' },
  'gallery/hair-02.jpg': { q: 'hairdresser cutting hair scissors', orientation: 'portrait' },
  'gallery/hair-03.jpg': { q: 'short haircut fade', orientation: 'portrait' },
  'gallery/hair-04.jpg': { q: 'straight hair blowout', orientation: 'portrait' },
  'gallery/colour-01.jpg': { q: 'balayage hair colour', orientation: 'portrait' },
  'gallery/colour-02.jpg': { q: 'hairdresser applying hair colour', orientation: 'portrait' },
  'gallery/colour-03.jpg': { q: 'blonde highlights hair', orientation: 'portrait' },
  'gallery/colour-04.jpg': { q: 'brunette hair colour result', orientation: 'portrait' },
  'gallery/styling-01.jpg': { q: 'silk press straight hair', orientation: 'portrait' },
  'gallery/styling-02.jpg': { q: 'curly hair styling definition', orientation: 'portrait' },
  'gallery/styling-03.jpg': { q: 'braided updo wedding', orientation: 'portrait' },
  'gallery/styling-04.jpg': { q: 'sleek middle part hairstyle', orientation: 'portrait' },
  'gallery/interior-01.jpg': { q: 'hair salon interior', orientation: 'landscape' },
  'gallery/interior-02.jpg': { q: 'salon product shelf', orientation: 'landscape' },
  'gallery/interior-03.jpg': { q: 'barber chair salon', orientation: 'landscape' },
  'gallery/interior-04.jpg': { q: 'beauty salon waiting area', orientation: 'landscape' },
  'gallery/team-01.jpg': { q: 'hairdresser braiding client', orientation: 'landscape' },
  'gallery/team-02.jpg': { q: 'busy hair salon', orientation: 'landscape' },
  'gallery/team-03.jpg': { q: 'hair colourist working', orientation: 'landscape' },
  'gallery/team-04.jpg': { q: 'stylist sectioning hair', orientation: 'landscape' },
}

/**
 * Slots deliberately not fetched.
 *
 * `transformation-01..04` are two before/after *pairs* of the same client — the
 * gallery links 01 to 02 and 03 to 04. Stock photography cannot supply that: any
 * two unrelated photos presented as one person's transformation is a false
 * claim about a result, on the page a customer decides whether to book from.
 * These keep drawing their placeholder until the studio shoots them.
 */
const SKIP = new Set([
  'gallery/transformation-01.jpg',
  'gallery/transformation-02.jpg',
  'gallery/transformation-03.jpg',
  'gallery/transformation-04.jpg',
])

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Loads `src/config/media.ts` by bundling it, so slots are read, not retyped. */
async function loadSlots() {
  const esbuild = require('esbuild')
  const entry = join(root, 'src', 'config', 'media.ts')
  const outfile = join(tmpdir(), `unisex-media-manifest-${process.pid}.mjs`)

  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    // `import.meta.env` is a Vite substitution; resolvePhoto is never called
    // here, but stub it so bundling does not warn.
    define: { 'import.meta.env': '{}' },
  })

  const mod = await import(`file://${outfile.replace(/\\/g, '/')}`)
  return [...Object.values(mod.STUDIO_SHOTS), ...Object.values(mod.GALLERY_SLOTS).flat()]
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** Target size: the manifest's declared box, capped so files stay small. */
function targetSize(slot) {
  const cap = 1200
  const scale = Math.min(1, cap / Math.max(slot.width, slot.height))
  const even = (n) => Math.round(n / 2) * 2 // CDN crop wants even edges
  return { w: even(slot.width * scale), h: even(slot.height * scale) }
}

function createProviders() {
  const pexelsKey = process.env.PEXELS_API_KEY?.trim()
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (pexelsKey) return { name: 'Pexels', search: pexelsSearch(pexelsKey) }
  if (unsplashKey) return { name: 'Unsplash', search: unsplashSearch(unsplashKey) }
  return null
}

async function pexelsSearch(key) {
  return async (query, orientation) => {
    const url = new URL('https://api.pexels.com/v1/search')
    url.searchParams.set('query', query)
    url.searchParams.set('orientation', orientation)
    url.searchParams.set('per_page', '12')
    url.searchParams.set('size', 'large')

    const res = await fetch(url, { headers: { Authorization: key } })
    if (!res.ok) throw new Error(`Pexels ${res.status} ${await res.text()}`)
    const json = await res.json()

    return (json.photos ?? []).map((p) => ({
      id: `pexels-${p.id}`,
      width: p.width,
      height: p.height,
      author: p.photographer,
      // Resized by Pexels' CDN, which also converts to sRGB and caps quality.
      url: (w, h) =>
        `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg` +
        `?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`,
      source: p.url,
    }))
  }
}

async function unsplashSearch(key) {
  return async (query, orientation) => {
    const url = new URL('https://api.unsplash.com/search/photos')
    url.searchParams.set('query', query)
    url.searchParams.set('orientation', orientation === 'landscape' ? 'landscape' : 'portrait')
    url.searchParams.set('per_page', '12')

    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } })
    if (!res.ok) throw new Error(`Unsplash ${res.status} ${await res.text()}`)
    const json = await res.json()

    return (json.results ?? []).map((p) => ({
      id: `unsplash-${p.id}`,
      width: p.width,
      height: p.height,
      author: p.user?.name ?? 'Unknown',
      url: (w, h) =>
        `https://images.unsplash.com/photo-${p.id}?fm=jpg&q=72&fit=crop&w=${w}&h=${h}`,
      source: p.links?.html ?? `https://unsplash.com/photos/${p.id}`,
    }))
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const provider = createProviders()
if (!provider) {
  console.error(
    'No API key.\n\n' +
      '  Pexels      https://www.pexels.com/api/      -> PEXELS_API_KEY\n' +
      '  Unsplash    https://unsplash.com/developers  -> UNSPLASH_ACCESS_KEY\n\n' +
      'Both are free. The key stays in your shell or .env.local; this script\n' +
      'never writes it to disk and it is not committed.',
  )
  process.exit(1)
}

const slots = (await loadSlots()).filter((s) => QUERIES[s.file] && !SKIP.has(s.file))
const target = ONLY ? slots.filter((s) => s.file.includes(ONLY)) : slots

console.log(`Provider: ${provider.name}`)
console.log(`Slots in manifest: ${(await loadSlots()).length}`)
console.log(`Targeting ${target.length} slot(s)\n`)

const missing = slots.filter((s) => !QUERIES[s.file])
if (missing.length) console.log(`No query mapped for: ${missing.map((s) => s.file).join(', ')}\n`)

if (!APPLY) {
  console.log('Dry run. Pass --yes to download. Plan:')
  for (const slot of target) {
    const { w, h } = targetSize(slot)
    const exists = existsSync(join(IMAGE_DIR, slot.file))
    console.log(
      `  ${slot.file.padEnd(34)} ${String(w).padStart(4)}x${String(h).padEnd(4)}` +
        `  "${QUERIES[slot.file].q}"${exists ? '  [already present]' : ''}`,
    )
  }
  process.exit(0)
}

const credits = {}
const used = new Set()
let filled = 0
let failed = 0

for (const slot of target) {
  const spec = QUERIES[slot.file]
  const { w, h } = targetSize(slot)

  try {
    const results = await provider.search(spec.q, spec.orientation)

    // Prefer a fresh photograph, and one whose aspect is close to the slot so
    // the CDN's centre crop does not cut a face in half.
    const wantRatio = w / h
    const pick = results
      .filter((r) => !used.has(r.id))
      .sort((a, b) => Math.abs(a.width / a.height - wantRatio) - Math.abs(b.width / b.height - wantRatio))[0]

    if (!pick) {
      console.log(`  MISS ${slot.file} — no unused result for "${spec.q}"`)
      failed++
      continue
    }

    const res = await fetch(pick.url(w, h))
    if (!res.ok) throw new Error(`image ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length < 4096) throw new Error(`suspiciously small (${bytes.length}b)`)

    const dest = join(IMAGE_DIR, slot.file)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)

    used.add(pick.id)
    credits[slot.file] = {
      author: pick.author,
      license: provider.name === 'Pexels' ? 'Pexels License' : 'Unsplash License',
      source: pick.source,
    }
    filled++
    console.log(
      `  OK   ${slot.file.padEnd(34)} ${String(Math.round(bytes.length / 1024)).padStart(4)} KB  ${pick.id}`,
    )
  } catch (err) {
    console.log(`  FAIL ${slot.file.padEnd(34)} ${err.message}`)
    failed++
  }

  // Stay well inside the 200/hour Pexels budget.
  await new Promise((r) => setTimeout(r, 1200))
}

const existing = existsSync(CREDITS_FILE) ? readFileSync(CREDITS_FILE, 'utf8') : ''
const header = existing.split('*/')[0]
const body = Object.entries(credits)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([file, c]) =>
      `  '${file}': { author: ${JSON.stringify(c.author)}, license: ${JSON.stringify(c.license)}, source: ${JSON.stringify(c.source)} },`,
  )
  .join('\n')

writeFileSync(
  CREDITS_FILE,
  `${header} */

export interface PhotoCredit {
  author: string
  license: string
  source: string
}

/**
 * GENERATED by scripts/fetch-stock-photography.mjs — do not hand-edit.
 *
 * Attribution for borrowed photography, keyed by the slot's \`file\`. Merged into
 * the footer credits disclosure by \`publishedCredits()\` in ./media.
 *
 * Entries whose file is absent from public/images are ignored, so a credit
 * outliving its photograph is harmless.
 */
export const PHOTO_CREDITS: Record<string, PhotoCredit> = {
${body}
}
`,
  'utf8',
)

console.log(`\n${filled} filled, ${failed} failed. Credits -> src/config/media.credits.ts`)
console.log('Run `npm run media:sync` to publish them to the manifest.')