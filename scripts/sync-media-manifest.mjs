/**
 * Scans public/images and writes src/config/media.generated.ts.
 *
 * The hand-authored manifest in src/config/media.ts declares every photo slot
 * the site expects, with alt text and focal point. This script records which of
 * those files actually exist, so the app can return `null` for the ones that
 * do not and let MediaFrame draw its on-brand placeholder instead of shipping
 * a broken image icon.
 *
 * Dropping a correctly-named photo into public/images and re-running this is
 * the entire workflow for publishing studio photography — no component, fixture
 * or database change required.
 *
 * Run automatically by `npm run dev` and `npm run build`.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const imageDir = join(root, 'public', 'images')
const outFile = join(root, 'src', 'config', 'media.generated.ts')

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.vite'])

/** Yields every image path under public/images, relative and POSIX-separated. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')).toLowerCase())) {
      yield relative(imageDir, full).split(sep).join('/')
    }
  }
}

let files = []
try {
  files = [...walk(imageDir)].sort()
} catch {
  // No public/images yet. That is a valid state, not an error.
}

const body = files.length
  ? files.map((f) => `  '${f}': true,`).join('\n')
  : '  // No photography has been published yet.'

const source = `/**
 * GENERATED FILE — do not edit.
 *
 * Produced by scripts/sync-media-manifest.mjs from the contents of
 * public/images. Run \`npm run media:sync\` after adding or removing photos.
 *
 * Presence of a key is the signal that a photo has been published; absence
 * means MediaFrame should render its placeholder.
 */

export const PUBLISHED_PHOTOS: Record<string, true> = {
${body}
}
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, source, 'utf8')

console.log(
  files.length
    ? `media manifest: ${files.length} photo(s) published`
    : 'media manifest: no photos yet — placeholders will render',
)