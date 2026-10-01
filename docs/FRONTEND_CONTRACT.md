# Frontend implementation contract

Every page module in this repository follows these rules. Read this before
writing any code, and do not invent a parallel pattern — the value here is
consistency.

---

## 1. Module shape

Every page file exports **exactly one default component**:

```tsx
export default function ServiceDetailPage() { ... }
```

No named page exports. No barrel files inside `pages/`. The router already
lazily imports them by default export.

---

## 2. Imports — use the aliases, never relative paths

```tsx
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'

import { getServiceBySlug } from '@/lib/api'          // data access
import { qk } from '@/lib/query/keys'                 // cache keys
import { Button, Badge, Card } from '@/components/ui' // primitives
import { ServiceCard, PageHeader } from '@/components/shared/Cards'
import { FaqList, Section } from '@/components/shared/Blocks'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { useSeo, serviceSchema } from '@/components/seo/Seo'
import { formatNaira, formatDateTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/supabase/errors'
import type { ServiceCatalogEntry } from '@/types'
```

**Never** import from `@/lib/api/catalog` or any other deep path — always the
`@/lib/api` barrel.

---

## 3. Data fetching

TanStack Query only. Never `useEffect` + `fetch`.

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: qk.service(slug),
  queryFn: () => getServiceBySlug(slug),
  enabled: Boolean(slug),
  staleTime: 5 * 60_000,
})
```

- **Cache keys must come from `qk`.** Never hand-write a key array.
- Always set `enabled` when a param can be empty.
- Mutations: `useMutation` + `toast` on success and on error, then
  `queryClient.invalidateQueries({ queryKey: qk.something() })`.
- Errors: render `errorMessage(error)` into an `<Alert variant="danger">`.

Loading states use `CardGridSkeleton`, `HeroSkeleton` or `ContentSkeleton` from
`@/components/layout/RouteLoader`. Never a bare "Loading..." string.

---

## 4. The three visual states

Every data-backed screen must handle all three:

| State | Pattern |
|---|---|
| Loading | `<CardGridSkeleton count={6} />` or `<HeroSkeleton />` |
| Error | `<Alert variant="danger" title="...">{errorMessage(error)}</Alert>` plus a retry `<Button onClick={() => refetch()}>` |
| Empty | `<EmptyState icon={...} title="..." description="..." action={<Button asChild><Link to="...">...</Link></Button>} />` |

---

## 5. Design language

"Editorial luxe": warm neutrals, serif display type, generous whitespace, thin
rules, minimal decoration.

- **Sections**: `<section className="section-y bg-canvas">` or use `<Section tone="sand" />`.
- **Containers**: always `container-page`.
- **Masthead**: `<PageHeader eyebrow title description breadcrumb action />`.
- **Grid**: `grid gap-5 sm:grid-cols-2 lg:grid-cols-3`.
- **Cards**: use the shared `ServiceCard` / `ProductCard` / `StylistCard` / `JobCard`.
  Do not hand-roll product or service cards — they encode the pricing, badge and
  image-fallback rules already.
- **Images**: always through `<MediaFrame src={...} alt={...} seed={...} />`.
  It renders a deterministic on-brand placeholder when photography is missing.
  Never a bare `<img>`.
- **Accent**: `text-bronze`, `bg-bronze`, `border-bronze`. One CTA per view in
  bronze; primary actions in `ink`.
- **Typography**: `font-display` is applied to headings automatically. Use
  `eyebrow`, `display-section`, `display-hero`, `lede` utility classes for
  editorial type rather than arbitrary sizes.

---

## 6. Accessibility (non-negotiable)

- One `<h1>` per page. Section headings `<h2>`.
- Every icon-only control needs an `aria-label`.
- Every image needs meaningful `alt` text — describe the subject, not "image".
- Inputs always have a `<label>`; use `<Field label htmlFor error>`.
- Async regions need `aria-live` or `role="status"`.
- Keyboard: no `onClick` on `<div>`/`<span>` — use `<button>`.
- Tap targets ≥ 44px on mobile (use `size="lg"` or `h-12` controls).

---

## 7. SEO — every public page calls `useSeo`

```tsx
useSeo({
  title: service.name,
  description: service.summary,
  path: `/services/${service.slug}`,
  image: service.image_url,
  jsonLd: [serviceSchema({ ... }), breadcrumbSchema([...])],
})
```

`useSeo` runs in an effect, so it must not be conditional or loop-dependent.
Build the JSON-LD with `useMemo` when it depends on data.

Available builders in `@/components/seo/Seo`:
`organizationSchema`, `breadcrumbSchema`, `serviceSchema`, `productSchema`,
`jobSchema`, `faqSchema`, `reviewSchema`.

---

## 8. Money and dates — never hand-format

```tsx
formatNaira(price)                  // ₦45,000
formatNaira(price, { compact: true }) // ₦45k
formatPriceRange(from, to)          // ₦35k – ₦140k
formatDate(iso)                     // Mon, 3 Mar 2025
formatDateTime(iso)                 // "Today at 2:30 PM"
formatRelative(iso)                 // 3 days ago
formatDuration(minutes)             // 5 hr 30 min
```

---

## 9. Analytics

Fire domain events through `analytics` from `@/lib/analytics`:

```tsx
analytics.viewService(service.slug, service.name, service.price_from)
analytics.addToCart(slug, price, qty)
analytics.beginCheckout(total, itemCount)
```

Consent-aware; a no-op without consent. Never call `gtag` directly.

---

## 10. Auth-aware UI

```tsx
const { user, isAuthenticated, profile, isStaff, isAdmin } = useAuth()
```

- Render account-aware CTAs, but **never gate data on it** — RLS already protects
  the data, and the guards (`RequireAuth`, `RequireRole`) handle routing.
- A user may browse everything anonymously. Prompting for sign-in should use
  `<Alert variant="info">` with a link, not a redirect.

---

## 11. TypeScript

- `strict` is on, plus `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`. Do not silence these — fix the code.
- Row types come from `@/types`. Add a new type there rather than inlining a
  shape.
- API functions already unwrap PostgREST errors, so a rejected query always
  carries a safe message via `errorMessage()`.

---

## 12. Before you finish

Run both of these and make sure they are clean:

```bash
npx tsc -b --noEmit
npx eslint <the files you changed>
```

Then verify in the browser if you can: `npm run dev`.

---

## 13. File ownership (to avoid collisions)

Do not edit files outside your assigned list. If you need a change in a shared
file (`qk`, `Seo.tsx`, `App.tsx`, a primitive), work around it locally and note
it in your summary instead.
