import { Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { RouteLoader } from './RouteLoader'
import { RouteChangeTracker } from './RouteChangeTracker'

/**
 * Public site shell: header, main landmark, footer.
 *
 * `ScrollRestoration` handles in-page navigation; the `useEffect` below covers
 * the one case it cannot — moving between routes with different scroll heights,
 * where the browser restores a position beyond the new document.
 */
export function SiteLayout() {
  const { hash } = useLocation()

  // Jump to the top on route change unless the URL names an anchor.
  if (!hash) {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <RouteChangeTracker />
      <SiteHeader />

      <main id="main" className="flex-1" tabIndex={-1}>
        <Suspense fallback={<RouteLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter />
      <ScrollRestoration />
    </div>
  )
}
