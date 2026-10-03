# Photography

How images reach this site, how to publish one, and why the placeholders look
the way they do.

## The short version

1. Save the photograph in `public/images/` using the filename from the shot list
   in [`src/config/media.ts`](../src/config/media.ts).
2. Run `npm run media:sync` — already part of `npm run dev` and `npm run build`.
3. Reload.

No component, fixture, migration or database change. `src/config/media.ts` is the
shot list; `public/images/README.md` is the same information laid out as a table
for whoever is holding the camera.

Until the studio has shot anything, `npm run media:fetch` fills those slots with
stock photography instead — see [Borrowed photography](#borrowed-photography).

## Two pipelines, on purpose

| | Build-time (`public/images`) | Runtime (Supabase Storage) |
|---|---|---|
| Good for | Hero, the floor, interiors, the gallery | Anything tied to a catalogue record |
| Publish by | Dropping a file in | Admin upload |
| Requires | A deploy | Nothing |
| Registry | `src/config/media.generated.ts`, generated | `studio_media` table |

They do not conflict. The manifest resolves first; `studio_media` covers what is
uploaded after deploy. Nothing forces a choice.

### Why the file path is enough

`scripts/sync-media-manifest.mjs` walks `public/images` and writes which files
exist into a generated module. `resolvePhoto` then returns a URL only for files
that are actually present, and `null` for the rest.

Returning `null` is the load-bearing decision. The fixtures used to return a
picsum URL keyed on a seed string, which meant `src` was always truthy —
`MediaFrame` therefore skipped its placeholder and rendered an arbitrary
photograph of a landscape. A grid of tiles that look *wrong* is worse than a grid
that looks *unfinished*. Now an unphotographed slot renders deliberate artwork,
and the console stays clean because there is no 404 to log.

## The shot list

`src/config/media.ts` declares every slot with:

- `file` — path under `public/images`
- `alt` — what is in the frame, written for someone who cannot see it
- `width` / `height` — intrinsic size, used to reserve layout space
- `focal` — subject position as fractions, applied as `object-position`
- `credit` — **only** for photography the studio does not own

Alt text is required and non-blank. The database enforces it
(`char_length(btrim(alt_text)) > 0`) because an image with no alt text is
invisible to a screen reader, and that is a content bug rather than a cosmetic
one. Decorative images must set `is_decorative` explicitly rather than leaving
alt text empty.

### Transformation pairs

`gallery/transformation-01..04.jpg` is **two before/after pairs**, not four
photos: 01/02 are one client, 03/04 are another. The gallery links them. Shoot
and name them together — out of order, the pairs read as two unrelated changes.

## Placeholder artwork

`MediaFrame` draws three layers when a slot has no photograph: a tonal ground
whose angle is derived from the slot seed, an arch that reads as a salon mirror,
and a fine strand texture. It is deterministic on the seed, so a grid of
unphotographed tiles stays stable between renders instead of reshuffling, and
the hue range is deliberately narrow so the grid reads as one palette.

`.media-placeholder` sets only the base colour and the containing block. The
gradient is applied inline because it is seed-derived and an inline declaration
beats the stylesheet. Layout is deliberately *not* set in CSS — an earlier
`display: grid; place-items: center` fought the SVG and left it unsized.

## Attribution

Studio photography needs no credit. If you add a photograph the studio does not
own, add a `credit` object to its slot:

```ts
credit: {
  author: 'Photographer Name',
  license: 'CC BY-SA 4.0',
  source: 'https://…/canonical-page',
}
```

`publishedCredits()` collects those that are actually published, and
`SiteFooter` renders a **Photo credits** disclosure from them. The link is hidden
when there is nothing to attribute, which is the normal case. Under CC BY and
CC BY-SA visible attribution is a licence condition, not a courtesy — do not
remove that disclosure.

## Storage

Migration `20250101000019_media_pipeline.sql` adds:

- a **`studio`** bucket for wide establishing shots that belong to no record
- **write policies** on `gallery`, `service-images` and `products`. These buckets
  were created public with no write policies at all, so there was previously no
  way for anyone — including an administrator — to put a photograph in them.
  Uploading is now admin-only. Deliberately not widened to supervisors: these
  buckets are world-readable, so a permissive write policy would let any
  authenticated user overwrite studio photography.
- **`studio_media`**, the registry. Alt text, focal point, attribution and the
  optional link to the service, product or stylist the photograph illustrates.
  `unique (bucket, path)` prevents a double-upload creating two rows pointing at
  one object and showing the photograph twice.
- **`fn_public_media(kind)`**, which returns published photography as bucket +
  path rather than a finished URL. There is no server-side source of truth for
  the Supabase project URL, so assembling it client-side avoids a second copy of
  the domain next to `VITE_APP_URL`. `resolvePhotoUrl` in
  `src/lib/api/media.ts` does that.

## Client API

`src/lib/api/media.ts`:

- `resolvePhotoUrl(bucket, path)` — public URL for a storage object
- `listMedia(kind?)` — published photography; returns `[]` rather than throwing
  when Supabase is unconfigured, because a missing registry must not take the
  gallery down when the manifest can still supply images
- `listMediaForAdmin()` — including drafts, for a review queue
- `uploadStudioPhoto(input)` — writes the object, then the registry row, and
  **removes the object if the insert fails**. An unreferenced file in a public
  bucket is still reachable by URL and would otherwise outlive a failed attempt.
- `deleteStudioPhoto(media)` — registry row first, then the object. The reverse
  order would leave a row pointing at a deleted file, which renders as a broken
  image.

## Borrowed photography

`scripts/fetch-stock-photography.mjs` fills slots from Pexels or Unsplash so the
site is not a wall of placeholders before the first shoot. It needs a free API
key in the shell — nothing is written to disk and the key is never committed:

```sh
PEXELS_API_KEY=… npm run media:fetch -- --yes   # Pexels
UNSPLASH_ACCESS_KEY=… npm run media:fetch -- --yes   # Unsplash
```

Omit `--yes` for a dry run that prints the plan without downloading. `--only=braids`
restricts it to matching slots.

How it works:

- **The slot list is read, not retyped.** The script bundles `src/config/media.ts`
  with the esbuild that ships with Vite, so adding a slot to the manifest is
  enough to make it a target and the two can never drift.
- **Size comes from the manifest.** Each slot's declared `width`/`height` become
  the crop, capped at 1200px on the long edge.
- **Resizing is done by the provider's CDN** (`?auto=compress&cs=tinysrgb&fit=crop`
  on Pexels), which also converts to sRGB. Nothing in the repo needs an image
  library, and files land well under the 300 KB standard.
- **Each photograph is used once.** Results are de-duplicated by provider id, and
  the candidate whose aspect ratio is closest to the slot wins, so a centre crop
  does not cut a face in half.
- **Attribution is written automatically** to `src/config/media.credits.ts`, which
  `publishedCredits()` merges into the footer disclosure. Both licenses permit
  commercial use without attribution; the credits file is written anyway because
  the studio's own photography is the expected end state.

### What it will not fetch

`gallery/transformation-01..04` are two before/after **pairs of the same client**,
and the gallery links 01→02 and 03→04. Stock photography cannot supply that. Two
unrelated photos presented as one person's transformation is a false claim about a
result, on the page a customer decides whether to book from — so these slots are
skipped by design and keep drawing their placeholder until the studio shoots them.

This is also why the script does not simply take the top search hit. A generic
query for this niche returns photographs that are technically hair and useless as
evidence of the work: a marble bust, a duck, a 1950s archival scan. Because the
alt text in the manifest is written as a factual claim about the frame, a
mismatched photograph makes the site assert something untrue. Review the gallery
before shipping stock to production.

## Photography standards

- JPEG, sRGB, **under 300 KB**. The gallery renders at 800px wide at most, so a
  1600px source is generous.
- Portrait for people, landscape for rooms. Faces and hands sit high in the
  frame so the `4:5` mobile crop keeps them in shot — that is what `focal.y` is
  for.
- **Get consent.** These are identifiable clients and staff. `studio_media`
  records what a photograph shows but cannot record permission; keep that
  separately.