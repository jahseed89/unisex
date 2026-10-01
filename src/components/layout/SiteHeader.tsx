import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Search, ShoppingBag, X } from 'lucide-react'
import { site, primaryNav } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCartCount } from '@/features/cart/CartProvider'
import { Button } from '@/components/ui'

/**
 * Public site header.
 *
 * Mobile-first: a compact bar plus a full-height drawer. The account control is
 * always visible in the bar, as required by the brief — browsing is anonymous,
 * acting requires an account.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const { isAuthenticated, profile, isStaff } = useAuth()
  const cartCount = useCartCount()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Solid background once the page scrolls, so text never sits on photography.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the drawer on navigation and lock scroll while it is open.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    // Move focus into the drawer so keyboard users are not stranded behind it.
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-all duration-300',
          scrolled || menuOpen
            ? 'border-line bg-canvas/92 backdrop-blur-md'
            : 'border-transparent bg-canvas/70 backdrop-blur-sm',
        )}
      >
        <div className="container-page">
          <div className="flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
            {/* Brand */}
            <Link
              to="/"
              className="group flex shrink-0 items-baseline gap-1.5"
              aria-label={`${site.name} — home`}
            >
              <span className="font-display text-[1.0625rem] font-semibold uppercase tracking-[0.16em] text-ink">
                {site.wordmark.primary}
              </span>
              <span className="font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-bronze transition-colors group-hover:text-bronze-dark">
                {site.wordmark.accent}
              </span>
              <span className="hidden font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-ink-soft sm:inline">
                {site.wordmark.suffix}
              </span>
            </Link>

            {/* Desktop navigation */}
            <nav aria-label="Primary" className="hidden lg:block">
              <ul className="flex items-center gap-0.5">
                {primaryNav.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'relative rounded-sm px-3 py-2 text-sm transition-colors duration-200',
                          'after:absolute after:inset-x-3 after:bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-bronze after:transition-transform after:duration-300',
                          'hover:text-ink hover:after:scale-x-100',
                          isActive ? 'text-ink after:scale-x-100' : 'text-ink-soft',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Link
                to="/shop"
                className="hidden rounded-sm p-2.5 text-ink-soft transition-colors hover:text-ink sm:block"
                aria-label="Search products"
              >
                <Search className="size-[1.125rem]" />
              </Link>

              <Link
                to="/cart"
                className="relative rounded-sm p-2.5 text-ink-soft transition-colors hover:text-ink"
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <ShoppingBag className="size-[1.125rem]" />
                {cartCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex size-[1.125rem] items-center justify-center rounded-full bg-bronze text-[0.625rem] font-semibold text-white tabular-nums">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>

              {/* Login / signup lives in the navigation bar, as required. */}
              {isAuthenticated ? (
                <Link
                  to={isStaff ? '/staff' : '/account'}
                  className="ml-1 hidden items-center gap-2 rounded-sm border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink hover:bg-sand sm:flex"
                >
                  <span className="max-w-24 truncate">
                    {profile?.full_name?.split(' ')[0] ?? 'My account'}
                  </span>
                </Link>
              ) : (
                <Link
                  to="/auth/sign-in"
                  className="ml-1 hidden items-center rounded-sm bg-ink px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink-soft sm:flex"
                >
                  Log in
                </Link>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded-sm p-2.5 text-ink-soft transition-colors hover:text-ink lg:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        id="mobile-menu"
        ref={drawerRef}
        className={cn(
          'fixed inset-0 z-30 lg:hidden',
          menuOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!menuOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-ink/25 transition-opacity duration-300',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />

        <nav
          aria-label="Mobile"
          className={cn(
            'absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-canvas',
            'shadow-md transition-transform duration-300 ease-[var(--ease-editorial)]',
            menuOpen ? 'translate-y-0' : '-translate-y-3 opacity-0',
          )}
        >
          <ul className="container-page divide-y divide-line py-2">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  tabIndex={menuOpen ? 0 : -1}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between py-3.5 text-base transition-colors',
                      isActive ? 'text-bronze-dark' : 'text-ink',
                    )
                  }
                >
                  {item.label}
                  {item.highlight && (
                    <span className="rounded-pill bg-bronze/12 px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-bronze-dark">
                      Popular
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="container-page safe-bottom flex flex-col gap-2.5 border-t border-line py-5">
            {isAuthenticated ? (
              <>
                <Button asChild fullWidth size="lg">
                  <Link to={isStaff ? '/staff' : '/account'}>My account</Link>
                </Button>
                <Button asChild variant="outline" fullWidth size="lg">
                  <Link to={isStaff ? '/staff' : '/account'}>Appointments</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild fullWidth size="lg">
                  <Link to="/auth/sign-up">Create an account</Link>
                </Button>
                <Button asChild variant="outline" fullWidth size="lg">
                  <Link to="/auth/sign-in">Log in</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </>
  )
}
