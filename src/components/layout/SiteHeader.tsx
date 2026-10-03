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
          {/*
            * Three zones on desktop — brand, primary nav, account actions.
            *
            * Grid rather than `justify-between`: that parked the nav in whatever
            * space was left over, so it slid sideways every time the right-hand
            * zone changed width (an anonymous "Log in" button vs. a named
            * account pill). The outer columns size to their content — so neither
            * the wordmark nor the actions can be squeezed — and the nav centres
            * itself in the `1fr` between them.
            */}
          <div className="grid h-16 grid-cols-[auto_1fr] items-center gap-x-4 lg:h-[4.5rem] xl:grid-cols-[auto_minmax(0,1fr)_auto]">
            {/* Brand */}
            <Link
              to="/"
              className="group flex shrink-0 items-baseline gap-1.5 justify-self-start"
              aria-label={`${site.name} — home`}
            >
              <span className="font-display text-[1.0625rem] font-semibold uppercase tracking-[0.16em] text-ink">
                {site.wordmark.primary}
              </span>
              <span className="font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-bronze transition-colors group-hover:text-bronze-dark">
                {site.wordmark.accent}
              </span>
              {/* The wordmark is wide; the suffix is dropped across the range
                  where the full nav shares the row, and returns at 2xl. */}
              <span className="hidden font-display text-[1.0625rem] font-light uppercase tracking-[0.16em] text-ink-soft sm:inline xl:hidden 2xl:inline">
                {site.wordmark.suffix}
              </span>
            </Link>

            {/*
              * Primary navigation.
              *
              * The full eight-item bar needs roughly 1.15k px of row, so it only
              * replaces the drawer from `xl` (1280px) up. At `lg` (1024px) there
              * was ~240px too little: flex-shrink broke labels such as "Book
              * Appointment" onto two lines, and `overflow-x: hidden` on <body>
              * hid the overflow instead of letting it scroll. `whitespace-nowrap`
              * and `shrink-0` make that failure mode impossible now.
              */}
            <nav aria-label="Primary" className="hidden xl:block">
              <ul className="flex items-center justify-center gap-0.5">
                {primaryNav.map((item) => (
                  <li key={item.to} className="shrink-0">
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'relative block whitespace-nowrap rounded-sm px-2.5 py-2 text-sm transition-colors duration-200',
                          'after:absolute after:inset-x-2.5 after:bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-bronze after:transition-transform after:duration-300',
                          'hover:text-ink hover:after:scale-x-100',
                          isActive
                            ? 'text-ink after:scale-x-100'
                            : item.highlight
                              ? 'text-bronze-dark hover:text-bronze'
                              : 'text-ink-soft',
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
            <div className="flex items-center justify-end gap-1 xl:justify-self-end">
              <Link
                to="/shop"
                className="hidden size-11 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-sand hover:text-ink sm:flex"
                aria-label="Search products"
              >
                <Search className="size-[1.125rem]" aria-hidden />
              </Link>

              <Link
                to="/cart"
                className="relative flex size-11 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-sand hover:text-ink"
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <ShoppingBag className="size-[1.125rem]" aria-hidden />
                {cartCount > 0 && (
                  <span className="absolute right-1 top-1 flex size-[1.125rem] items-center justify-center rounded-full bg-bronze text-[0.625rem] font-semibold text-white tabular-nums">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>

              {/* Login / signup lives in the navigation bar, as required. */}
              {isAuthenticated ? (
                <Link
                  to={isStaff ? '/staff' : '/account'}
                  className="ml-1 hidden h-10 items-center gap-2 rounded-sm border border-line-strong px-3 text-sm text-ink transition-colors hover:border-ink hover:bg-sand sm:flex"
                >
                  <span className="max-w-24 truncate">
                    {profile?.full_name?.split(' ')[0] ?? 'My account'}
                  </span>
                </Link>
              ) : (
                <Link
                  to="/auth/sign-in"
                  className="ml-1 hidden items-center rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-ink-soft sm:flex"
                >
                  Log in
                </Link>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex size-11 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-sand hover:text-ink xl:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? (
                  <X className="size-5" aria-hidden />
                ) : (
                  <Menu className="size-5" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer — replaces the inline nav below `xl` */}
      <div
        id="mobile-menu"
        ref={drawerRef}
        className={cn(
          'fixed inset-0 z-30 xl:hidden',
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
            // Anchored to the header, whose height steps 4rem -> 4.5rem at `lg`.
            'absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-canvas lg:top-[4.5rem] lg:max-h-[calc(100dvh-4.5rem)]',
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
                      // `gap` rather than `justify-between`: with a single
                      // highlighted item, opposite edges flung the badge to the
                      // far side of the row while every other label sat flush left.
                      'flex items-center gap-2.5 py-3.5 text-base transition-colors',
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
