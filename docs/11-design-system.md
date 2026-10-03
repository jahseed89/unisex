# 11 · Design system

The visual language is **editorial luxe**: warm neutral paper, a high-contrast serif for display
type, a quiet sans for everything else, thin rules, and a single bronze accent used sparingly. It
should read as a magazine feature about hair rather than as a booking widget.

Everything below is defined in `src/styles/index.css`. There is **no `tailwind.config.js`** — Tailwind
v4 is configured CSS-first through an `@theme` block, and the `@tailwindcss/vite` plugin is registered
in `vite.config.ts`.

---

## Colour tokens

Declared in `@theme`, so each generates a Tailwind utility: `--color-bronze` gives `bg-bronze`,
`text-bronze`, `border-bronze`, and so on.

### Surfaces — the paper stack

| Token | Hex | Use |
| --- | --- | --- |
| `--color-canvas` | `#fbf8f4` | The page background. Everything else sits on it. |
| `--color-sand` | `#f4eee6` | Alternating section tone (`<Section tone="sand" />`), hover states, skeleton base, `MediaFrame` fallback. |
| `--color-blush` | `#ebdfd5` | Active nav item, selected chip, `::selection`, avatar fallback. |
| `--color-surface` | `#ffffff` | Cards, dialogs, sheets, popovers — anything that needs to lift off the canvas. |

The four are one ramp, not four colours: canvas → sand → blush, with white reserved for elevation. A
component should pick the next step up the ramp, never a colour from outside it.

### Ink — text and rules

| Token | Hex | Use |
| --- | --- | --- |
| `--color-ink` | `#1a1715` | Headings and primary body text. Solid buttons (`bg-ink text-canvas`). |
| `--color-ink-soft` | `#3d3630` | Secondary text, prose body, ghost buttons. |
| `--color-muted` | `#6f655d` | Captions, helper text, metadata. |
| `--color-faint` | `#9a9088` | Decoration and disabled states only — **not body text** (see the contrast table). |
| `--color-line` | `#e6ddd2` | Default border. Applied globally: `*, *::before, *::after { border-color: var(--color-line) }`, so a bare `border` is always on-brand. |
| `--color-line-strong` | `#d4c7b8` | Inputs, outline buttons, dividers that need more presence. |

### Accent

| Token | Hex | Use |
| --- | --- | --- |
| `--color-bronze` | `#a98467` | Accent **surfaces** only: the `accent` button background, badge fills, active nav markers, the `eyebrow` gradient segment. |
| `--color-bronze-dark` | `#8a6a51` | Accent **text**. The only bronze permitted for type on canvas. |
| `--color-bronze-light` | `#c9ab8f` | Hover/disabled tints and the `rule-editorial` highlight. |
| `--color-clay` | `#b5714f` | Warm secondary used in placeholder gradients and the low-stock tone. |

The contract is *"one CTA per view in bronze; primary actions in `ink`"*. `ink` is the default button
variant; `bronze` is an accent, not a default.

### Status

`--color-success #3f6b4f` · `--color-warning #9a6b1f` · `--color-danger #9c3b2e` · `--color-info #3c5a76`

Mapped to domain enums by `statusTone()` in `src/components/ui/Badge.tsx`, so a status badge never
requires a page to know the palette:

| Tone | Values |
| --- | --- |
| `success` | `confirmed`, `completed`, `paid`, `published`, `active`, `delivered`, `hired` |
| `warning` | `pending`, `draft`, `submitted`, `screening`, `awaiting_payment`, `on_hold` |
| `info` | `checked_in`, `in_progress`, `processing`, `out_for_delivery`, `shortlisted`, `interview_scheduled`, `interviewed` |
| `danger` | `cancelled`, `no_show`, `rejected`, `failed`, `returned`, `voided` |
| `accent` | `ready_for_pickup`, `offer`, `partially_paid` |
| `default` | `archived`, `withdrawn`, `closed`, `refunded`, `partially_refunded`, anything unknown |

---

## Typography

```css
--font-display: 'Fraunces Variable', 'Fraunces', ui-serif, Georgia, serif;
--font-sans:    'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
```

Both are **self-hosted** through `@fontsource-variable/*`, imported at the top of `index.css`. The
`dist/assets/` output carries the latin, latin-ext, cyrillic-ext, greek and vietnamese woff2 subsets
for Inter and latin, latin-ext and vietnamese for Fraunces. Self-hosting means no third-party font
request, no FOIT on a slow Lagos connection, and no analytics-side tracking of a visitor's font fetch.

### Roles

`body` is Inter. Headings are Fraunces, applied by a base rule rather than per component:

```css
h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-variation-settings: 'SOFT' 0, 'WONK' 0, 'opsz' 40;
  letter-spacing: -0.015em;
  text-wrap: balance;
  color: var(--color-ink);
}
```

Fraunces is a variable font with optical size, softness and "wonk" axes. Section headings run at
`opsz 40` with the wonk off, which is the restrained register; the hero turns it on:

```css
.display-hero {
  font-size: var(--text-hero);
  line-height: 0.95;
  letter-spacing: -0.03em;
  font-variation-settings: 'SOFT' 20, 'WONK' 1, 'opsz' 144;
}
```

That is the whole expressive range of the brand: one element per page gets the wonk.

### Scale

| Class | Size | Notes |
| --- | --- | --- |
| `display-hero` | `clamp(2.75rem, 7vw, 5.5rem)` | One per page. Line-height 0.95, tracking −0.03em. |
| `display-section` | `clamp(2rem, 4.2vw, 3.25rem)` | Section headings. Line-height 1.05, tracking −0.025em. |
| `lede` | `clamp(1rem, 1.4vw, 1.1875rem)` | Introductory paragraph, `color: muted`, line-height 1.6. |
| `eyebrow` | `0.6875rem` | Uppercase, `letter-spacing: 0.18em`, weight 600, `color: bronze-dark`. The section label above a heading. |
| Body | Tailwind's `text-sm` / `text-base` | Inter, default 1.5-ish leading from the browser. |
| Button | `0.8125rem` → `1rem` | `sm` … `xl`, weight 500. |

`text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs are cheap, high-value typographic
corrections: a two-line `h1` gets even line lengths instead of a five-word orphan.

Inter is set with `font-feature-settings: 'cv11' 1, 'ss01' 1` (single-storey `a` and `g`, the
disambiguated `l`) and `font-optical-sizing: auto`, so small text gets Inter's optical size rather than
being scaled.

---

## Spacing, radii, elevation

### Spacing rhythm

```css
--spacing-section: clamp(4.5rem, 9vw, 8rem);
--spacing-gutter:  clamp(1.25rem, 4vw, 2.5rem);
```

```css
.container-page { width: 100%; margin-inline: auto; padding-inline: var(--spacing-gutter); max-width: 90rem; }
.section-y      { padding-block: var(--spacing-section); }
```

90rem (1440px) is the measure cap; on a 390px phone the gutter collapses to 1.25rem. Vertical rhythm
is a fluid clamp, so a section breathes 72px on a handset and 128px on a desktop without a breakpoint.
Everything on a page is inside a `.container-page`, and every vertical band is a `.section-y` — those
two classes carry the whole layout system.

The one exception is a dashboard, where vertical space is spent on rows rather than bands:
`DashboardLayout` uses `py-8` and `gap-8` instead of `.section-y`.

### Radii

`xs .25rem` · `sm .375rem` · `md .625rem` · `lg 1rem` · `xl 1.5rem` · `2xl 2rem` · `pill 999px`

Soft, not bubbly. The mapping is consistent: small controls `sm`/`md`, cards `lg`, feature images and
hero panels `xl`/`2xl`, anything that is a capsule `pill`. Avatars are fully round. The
`border-radius: 2px` on `:focus-visible` keeps a focus ring from inheriting a large radius on a pill
button.

### Elevation

```css
--shadow-xs: 0 1px 2px rgba(58, 44, 32, 0.06);
--shadow-sm: 0 2px 8px -2px rgba(58, 44, 32, 0.1), 0 1px 3px rgba(58, 44, 32, 0.04);
--shadow-md: 0 12px 28px -12px rgba(58, 44, 32, 0.18), 0 2px 8px -2px rgba(58, 44, 32, 0.08);
--shadow-lg: 0 28px 56px -24px rgba(58, 44, 32, 0.24), 0 4px 12px -4px rgba(58, 44, 32, 0.1);
--shadow-focus: 0 0 0 2px var(--color-canvas), 0 0 0 4px var(--color-bronze);
```

Every shadow is tinted `rgba(58, 44, 32, …)` — a warm brown, not black. A neutral shadow on a warm
paper reads as dirt. Each step is a two-layer shadow (a tight contact shadow plus a diffuse ambient
one), which is what makes the stack feel like paper rather than glass. Elevation is used sparingly:
`shadow-xs` on resting buttons, `shadow-md` on hover, `shadow-lg` on the mobile nav drawer,
`shadow-focus` nowhere — focus uses `outline`, not a shadow.

---

## Motion

```css
--ease-editorial: cubic-bezier(0.22, 1, 0.36, 1);   /* ease-out-quint: fast out, long settle */
--animate-fade-up:  fade-up  0.6s var(--ease-editorial) both;
--animate-fade-in:  fade-in  0.4s var(--ease-editorial) both;
--animate-shimmer:  shimmer  1.8s linear infinite;
--animate-spin-slow: spin    1.1s linear infinite;
```

One curve for the whole product. `cubic-bezier(0.22, 1, 0.36, 1)` leaves quickly and settles slowly,
which reads as editorial rather than bouncy; using one curve everywhere is what makes unrelated
transitions feel like the same system. `both` fill mode means an element is at its `from` state before
the animation starts and stays at its `to` state after, so a fade-up never flashes.

`--animate-spin-slow` (1.1s rather than Tailwind's 1s) is used for every loading spinner, including
`RouteLoader` and the `Button` loading state.

### Reduced motion

One global override, inside `@layer base`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

It covers all four properties that would otherwise move something — including `scroll-behavior:
smooth`, which is set on `<html class="scroll-smooth">` in `index.html`. Because it is a single global
rule rather than per-component opt-outs, a new component cannot forget it.

---

## Component inventory

Feature code imports primitives from the `@/components/ui` barrel and never reaches into an individual
file, so a restyle is a one-file change.

### Primitives — `src/components/ui/`

| File | Exports |
| --- | --- |
| `Button.tsx` | `Button`, `buttonVariants` |
| `Field.tsx` | `Label`, `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioCards` |
| `Badge.tsx` | `Badge`, `badgeVariants`, `statusTone` |
| `Surface.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `SectionHeading`, `Stat`, `EmptyState`, `Skeleton`, `Divider`, `VisuallyHidden` |
| `Dialog.tsx` | `Dialog` + `DialogTrigger/Close/Content/Header/Title/Description/Body/Footer`, and the same `Sheet*` set |
| `Rating.tsx` | `Rating`, `RatingInput` |
| `Accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `Feedback.tsx` | `Alert`, `Table`, `THead`, `TH`, `TBody`, `TR`, `TD`, `Pagination` |

`Button` is `cva` with **9 variants** (`solid`, `accent`, `outline`, `outline-light`, `ghost`,
`subtle`, `link`, `danger`, `destructiveOutline`) and **6 sizes** (`sm h-9`, `md h-11`, `lg h-12`,
`xl h-14`, `icon size-11`, `iconSm size-9`), plus `fullWidth`, `asChild` (via `@radix-ui/react-slot`,
so a `<Link>` can be a button), and a `loading` state that sets `aria-busy`, swaps in a spinner and
keeps the accessible name via `loadingText`. `md` and `lg` exist specifically to satisfy the 44px
minimum touch target.

Dialogs and sheets are Radix primitives, so focus trapping, `Escape`, scroll locking and
`aria-modal` come from the library rather than from bespoke code.

### Composites — `src/components/shared/`

| File | Exports |
| --- | --- |
| `Cards.tsx` | `PageHeader`, `Breadcrumbs`, `ServiceCard`, `ProductCard`, `StylistCard`, `JobCard`, `AppointmentSummary`, `formatDuration` |
| `Blocks.tsx` | `FaqList`, `TestimonialCard`, `BeforeAfter`, `OpeningHoursCard`, `ContactCard`, `ClosingCta`, `Section` |
| `MediaFrame.tsx` | `MediaFrame`, `Avatar` |

`Section` is the tone wrapper — `tone: 'canvas' | 'sand' | 'ink'` — and it applies `section-y` plus
`container-page` so a page never assembles the rhythm by hand. The card components encode the pricing
band, badge, rating and image-fallback rules; the contract forbids hand-rolling them.

### Chrome — `src/components/layout/`

`SiteHeader` (sticky, scroll-aware `scrolled` state, skip link, primary nav, search, cart badge,
account menu, mobile drawer), `SiteFooter`, `SiteLayout`, `DashboardLayout` (role-derived sidebar,
notification and cart badges), `RouteGuards` (`RequireAuth`, `RequireRole`, `RequireAccount`,
`AccessDenied`), `RouteLoader` (`RouteLoader`, `CardGridSkeleton`, `HeroSkeleton`,
`ContentSkeleton`), `ErrorBoundary`.

The header row is a grid, not a flex row: `grid-cols-[auto_1fr]` on small screens and
`xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` from `xl`, giving three zones — brand, primary nav,
account actions. The outer columns are equal so the nav is optically centred. `justify-between` was the
wrong tool: it parked the nav in whatever space was left over, so the nav shifted sideways whenever the
right-hand zone changed width (an anonymous "Log in" button vs. a named account pill).

The inline nav appears at `xl` (1280px), not `lg`. The eight-item bar needs roughly 1.15k px of row —
brand ≈315px, links ≈680px, actions ≈160px. At `lg` (1024px) there was ~240px too little, and because
`<body>` sets `overflow-x: hidden`, the shortfall could not scroll: flex-shrink broke "Book Appointment"
and "About Us" onto two lines instead. Nav links therefore carry `whitespace-nowrap` and their `<li>`
carries `shrink-0`, so that failure mode cannot recur. Two widths absorb the slack: link padding is
`px-2.5`, and the wordmark's "STUDIO" suffix drops out across `sm`–`2xl` and returns at `2xl`.
Below `xl` the drawer takes over, so its container is `xl:hidden` and it anchors to the header at
`top-16 lg:top-[4.5rem]` to match the stepped header height.

### Feature-local

`features/auth/components` (`AuthLayout`, `FormField`, `PasswordField`, `GoogleMark`),
`features/booking/components` (`BookingProgress`, `DateStrip`, `TimeGrid`, `RequirementStep`,
`ReferenceUploader`), `features/cart/components` (`CouponField`, `QuantityStepper`, `TotalsPanel`),
`features/checkout/components` (`StepIndicator`, `CheckoutSummary`, `DeliveryAddressForm`,
`BankTransferPanel`), `features/shop/components` (`ShopFilters`, `ActiveFilterChips`,
`VariantPicker`, `ProductGallery`, `ProductSections`, `ProductAttributeTable`, `Markdown`),
`features/staff/components` (`AppointmentRow`, `DiaryTimeline`),
`features/account/components` (`AccountRows`, `CancelAppointmentDialog`, `RescheduleDialog`),
`features/admin/components` (`adminKit`, `RevenueChart`, `StockAdjustDialog`).

---

## Accessibility

### Contrast

Computed from the token hex values with the WCAG 2.1 relative-luminance formula (the same arithmetic a
checker runs):

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `ink` on `canvas` | 16.9 : 1 | AAA |
| `ink` on `surface` | 17.8 : 1 | AAA |
| `ink-soft` on `canvas` | 11.2 : 1 | AAA |
| `muted` on `canvas` | 5.4 : 1 | AA for all text |
| `bronze-dark` on `canvas` | 4.7 : 1 | AA for all text — the permitted accent-for-text token |
| `canvas` on `ink` (solid button) | 16.9 : 1 | AAA |
| `success` on `canvas` | 5.8 : 1 | AA |
| `info` on `canvas` | 6.8 : 1 | AA |
| `danger` on `canvas` | 6.4 : 1 | AA |
| `warning` on `canvas` | 4.4 : 1 | Borderline — passes for large text, marginally under AA for body text |
| `bronze` on `canvas` | 3.2 : 1 | Decoration and large text only |
| `faint` on `canvas` | 3.0 : 1 | Decoration and disabled states only |
| **`white` on `bronze`** (the `accent` button, `accent` badge) | **3.4 : 1** | **Fails AA for body text** |
| `white` on `danger` / `success` | 6.8 : 1 / 6.1 : 1 | AA |
| `white` on `bronze-dark` | 4.9 : 1 | AA |

Two rules follow, and both are already the design's practice: `faint` is never body text, and
**`bronze` is never a text colour on canvas** — that is why `.eyebrow` and `Button`'s `link` variant
use `bronze-dark` (4.7 : 1) rather than `bronze` (3.2 : 1).

One violation exists: the `accent` button variant and the `accent` badge fill put white text on
`--color-bronze` for 3.4 : 1. The one-line fix is to move those surfaces to `--color-bronze-dark`,
which yields 4.9 : 1 against white and keeps the visual weight. The same applies to the `rounded-pill`
cart and notification badges in `DashboardLayout`, which are `bg-bronze text-white` at `0.5625rem` —
small text at 3.4 : 1, which is the worst case in the system.

### Focus

```css
:focus-visible { outline: 2px solid var(--color-bronze); outline-offset: 2px; border-radius: 2px; }
```

`:focus-visible` rather than `:focus`, so a mouse click does not paint a ring but a keyboard
interaction always does. The bronze ring on the warm canvas is 3.2 : 1 against `canvas` — above the
3 : 1 that WCAG 2.2 requires for a non-text indicator, though `--shadow-focus` exists for a
higher-contrast variant. `border-radius: 2px` overrides an inherited large radius so the ring follows
the shape of a pill button without becoming a circle.

The first tab stop on every page is a skip link, visually hidden until focused:

```css
.skip-link { position: absolute; left: 1rem; top: -100%; … }
.skip-link:focus { top: 1rem; }
```

paired with `<main id="main" tabIndex={-1}>` in `SiteLayout` and `<a href="#main" className="skip-link">`
in `SiteHeader`.

### Touch targets

Button `md` is `h-11` (44px) and `lg` is `h-12` (48px); `icon` is `size-11`. The comment in
`Button.tsx` says the two most-used mobile sizes exist for the 44px minimum. The header's icon-only
controls are `size-11`, so they meet it too — they were `p-2.5` around an 18px icon, which landed at
38px.

### Keyboard and semantics

The contract, and the code, agree on these:

- One `<h1>` per page, `<h2>` per section; heading levels are not chosen for size.
- Every icon-only control has an `aria-label`, and dynamic ones include the count:
  `aria-label={`Cart, ${cartCount} items`}`, `aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}`.
- Every image has meaningful `alt` text. `MediaFrame` passes `alt` straight through, and its
  placeholder branch is `role="img"` with the same `aria-label`, so an image without photography is
  still described.
- Decorative icons are `aria-hidden` — every `lucide-react` icon in the layout chrome is.
- Async regions announce themselves: `RouteLoader` and the guard spinner are `role="status"
  aria-live="polite"`, and `Button` sets `aria-busy` while loading.
- No `onClick` on a `<div>` or `<span>`. The mobile menu toggle in `DashboardLayout` is a real
  `<button>` with `aria-expanded` and `aria-label`; the nav drawer backdrop is a `div` with
  `aria-hidden` because it is a redundant dismiss target, not a control.
- Inputs always have a label, through `<Field label htmlFor error>`.
- Dialogs are Radix, so focus is trapped, `Escape` closes, and focus returns to the trigger.
- `prefers-reduced-motion` is honoured globally.
- The mobile drawer in `DashboardLayout` is a plain `div` with a close button, not a focus-trapping
  dialog. It should be a `Sheet` — the primitive exists and is unused for it.

---

## Placeholder media

Real photography is not in place yet, and rather than ship broken image icons `MediaFrame` renders
a deterministic, on-brand surface. Three layers: a tonal ground whose gradient angle is derived from
the slot seed, an arch that reads as a salon mirror, and a fine strand texture.

```ts
function hash(value: string): number {          // FNV-1a
  let h = 2166136261
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

const value = hash(seed)                        // seed is usually the slug
const hue   = 26 + (value % 8)                  // 26–33: a narrow warm band
const angle = 96 + (value % 24)
```

The same slug always produces the same composition, so a product grid looks composed rather than
random and re-rendering never causes a visual reshuffle. The palette is constrained to hues 26–33
so a wall of placeholders is unmistakably on-brand.

`.media-placeholder` sets only the base colour and the containing block. The gradient is applied
inline because it is seed-derived and an inline declaration beats the stylesheet. Layout is
deliberately not set in CSS: an earlier `display: grid; place-items: center` fought the SVG and left
it unsized.

Aspects are fixed by prop (`square | 4/3 | 3/2 | 16/9 | 4/5 | auto`, default `4/3`) so a grid of
mixed media does not jitter while loading. `onError` flips the component to the placeholder, so a
broken URL degrades rather than showing the browser's icon. Lazy loading is the default with
`priority` opt-in for above-the-fold imagery (`loading="eager"`, `fetchPriority="high"`,
`decoding="async"`).

A slot with no photograph resolves to `null` rather than to a URL that would 404, which is what
lets the fallback render. See [12 — Photography](./12-photography.md) for the manifest, the shot
list and how to publish a photograph.

`Avatar` uses the same hash for a hue, but falls back to initials on a filled circle
(`initials()` from `src/lib/utils/format.ts` takes the first and last initial) with a
hue-matched background and foreground — a person is more recognisable as "AO" than as a gradient, and
`aria-hidden` because the name is adjacent.

The contract makes `MediaFrame` mandatory: *"Never a bare `<img>`."* That is what keeps the fallback
consistent and guarantees `alt` text is always supplied.
