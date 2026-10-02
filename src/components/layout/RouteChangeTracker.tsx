import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from '@/lib/analytics'
import { site } from '@/config/site'

/**
 * Reports a page view on every client-side navigation.
 *
 * An SPA navigation never reloads the document, so the browser's own load
 * handler fires once and then never again. This has to live inside the router
 * to observe location changes; it is rendered by each layout rather than at the
 * root because `createBrowserRouter` offers no hook above `RouterProvider`.
 *
 * The first render is skipped: `initAnalytics()` already reports the landing
 * page, and reporting it twice would double-count every session.
 */
export function RouteChangeTracker() {
  const location = useLocation()
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }

    // The document title is set by useSeo in the page's own effect, which runs
    // after this one. Read it on the next frame so the title is current.
    const frame = requestAnimationFrame(() => {
      trackPageView(
        location.pathname + location.search,
        document.title,
        `${site.url}${location.pathname}`,
      )
    })

    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.search])

  return null
}