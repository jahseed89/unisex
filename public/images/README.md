# Studio photography

Photographs for this site live here. Nothing in this folder is required — with
it empty, every image slot falls back to an on-brand placeholder drawn by
`MediaFrame`, so the site looks deliberate rather than broken while you are
still shooting.

## Publishing a photograph

1. Save the file **using the exact name** from the manifest below.
2. Run `npm run media:sync` (already part of `npm run dev` and `npm run build`).
3. Reload. The placeholder is replaced by the photograph.

No component, fixture, or database change is needed. The manifest records which
files exist, and `resolvePhoto` starts returning a URL for those that do.

## The shot list

`src/config/media.ts` is the source of truth. It holds every slot with its alt
text, intrinsic dimensions, and focal point. That file is effectively the brief
for the photography session.

| Path | Count | Shows |
|---|---|---|
| `studio/hero-01.jpg`, `hero-02.jpg` | 2 | Wide establishing shots |
| `studio/floor-01.jpg` | 1 | The studio floor |
| `studio/reception-01.jpg` | 1 | Reception and product shelf |
| `studio/interior-01.jpg` | 1 | A styling station, set |
| `studio/products-01.jpg` | 1 | The retail wall |
| `studio/about-01.jpg` | 1 | Braiding in progress |
| `studio/team-01.jpg` | 1 | Stylists working side by side |
| `gallery/braids-01..04.jpg` | 4 | Knotless, install, cornrows, feed-in |
| `gallery/locs-01..04.jpg` | 4 | Loc sculpt, retwist, updo, fresh ends |
| `gallery/hair-01..04.jpg` | 4 | Signature cut, scissor work, crop, blunt cut |
| `gallery/colour-01..04.jpg` | 4 | Balayage, toner, highlights, correction |
| `gallery/styling-01..04.jpg` | 4 | Silk press, curls, bridal updo, sleek blowout |
| `gallery/transformation-01..04.jpg` | 4 | Before/after pairs — **1 & 2 are a pair, 3 & 4 are a pair** |
| `gallery/interior-01..04.jpg` | 4 | Room details |
| `gallery/team-01..04.jpg` | 4 | Stylists at work |
| `stylists/<name-slug>.jpg` | 4 | One headshot per stylist |
| `services/<slug>-01.jpg`, `-02.jpg` | 2 each | Per service |
| `products/<slug>-01..03.jpg` | 3 each | Per product |

### Conventions

- **JPEG, sRGB, under 300 KB.** The gallery renders at most 800px wide; a
  1600px-wide source is more than enough and keeps the page light on mobile data.
- **Portrait for people, landscape for rooms.** Faces and hands sit high in the
  frame so the `4:5` mobile crop keeps them in shot.
- **Get consent.** These are identifiable clients and staff. `studio_media`
  records the alt text but cannot record permission, so keep it elsewhere.

## Transformation pairs

`gallery/transformation-01..04.jpg` is **two before/after pairs**, not four
photos: 01 and 02 are the same client before and after, likewise 03 and 04. The
gallery links 01→02 and 03→04. If you shoot them out of order the pairs will
read as two unrelated changes, so shoot and name them together.

## Attribution

Studio photography needs no credit. If you add a photograph the studio does not
own, add a `credit` object to its slot in `src/config/media.ts`:

```ts
credit: {
  author: 'Photographer Name',
  license: 'CC BY-SA 4.0',
  source: 'https://…/canonical-page',
}
```

`publishedCredits()` collects these for the footer disclosure. Attributing
borrowed work is a legal obligation under CC BY and CC BY-SA, not a nicety.