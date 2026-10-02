import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Scissors,
  ShoppingBag,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { site } from '@/config/site'
import { initials } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCartCount } from '@/features/cart/CartProvider'
import { useUnreadCount } from '@/features/notifications/useNotifications'
import { Button } from '@/components/ui'
import { RouteLoader } from './RouteLoader'
import { RouteChangeTracker } from './RouteChangeTracker'

/**
 * Shell for every signed-in surface: /account, /staff and /admin.
 *
 * The navigation set is derived from the user's roles, so an administrator sees
 * every area while a customer sees only their own. Client-side visibility is a
 * convenience — RLS on the server is what actually protects the data.
 */

interface NavEntry {
  to: string
  label: string
  Icon: typeof LayoutDashboard
  end?: boolean
  badge?: number
}

export function DashboardLayout() {
  const { profile, isStaff, isAdmin, signOut } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  const accountNav: NavEntry[] = [
    { to: '/account', label: 'Overview', Icon: LayoutDashboard, end: true },
    { to: '/account/appointments', label: 'Appointments', Icon: CalendarDays },
    { to: '/account/orders', label: 'Orders', Icon: ShoppingBag },
    { to: '/account/wishlist', label: 'Wishlist', Icon: Package },
    { to: '/account/profile', label: 'Profile', Icon: UserRound },
    { to: '/account/notifications', label: 'Notifications', Icon: Bell },
  ]

  const staffNav: NavEntry[] = [
    { to: '/staff', label: 'My day', Icon: LayoutDashboard, end: true },
    { to: '/staff/diary', label: 'Diary', Icon: CalendarDays },
    { to: '/staff/requirements', label: 'Requirements', Icon: ClipboardList },
    { to: '/staff/clients', label: 'Clients', Icon: Users },
  ]

  const adminNav: NavEntry[] = [
    { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard, end: true },
    { to: '/admin/bookings', label: 'Bookings', Icon: CalendarDays },
    { to: '/admin/services', label: 'Services', Icon: Scissors },
    { to: '/admin/products', label: 'Products', Icon: Package },
    { to: '/admin/inventory', label: 'Inventory', Icon: Package },
    { to: '/admin/orders', label: 'Orders', Icon: ShoppingBag },
    { to: '/admin/customers', label: 'Customers', Icon: Users },
    { to: '/admin/careers', label: 'Careers', Icon: Users },
  ]

  const navItems = [
    ...(isAdmin ? adminNav : []),
    // Administrators also get the operational views, staff get theirs.
    ...(isStaff && !isAdmin ? staffNav : []),
    ...accountNav,
  ]

  const cartCount = useCartCount()
  const unread = useUnreadCount()

  const homePath = isAdmin ? '/admin' : isStaff ? '/staff' : '/account'

  return (
    <div className="min-h-dvh bg-canvas">
      <RouteChangeTracker />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/92 backdrop-blur-md">
        <div className="container-page">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNavOpen((open) => !open)}
                className="rounded-sm p-2 text-ink-soft transition-colors hover:bg-sand hover:text-ink lg:hidden"
                aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={navOpen}
              >
                {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>

              <Link to={homePath} className="flex items-baseline gap-1.5">
                <span className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-ink">
                  {site.wordmark.primary}
                </span>
                <span className="font-display text-sm font-light uppercase tracking-[0.14em] text-bronze">
                  {site.wordmark.accent}
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-1.5">
              <Link
                to="/account/notifications"
                className="relative rounded-sm p-2.5 text-ink-soft transition-colors hover:bg-sand hover:text-ink"
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              >
                <Bell className="size-[1.125rem]" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-bronze text-[0.5625rem] font-semibold text-white tabular-nums">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>

              <Link
                to="/cart"
                className="relative rounded-sm p-2.5 text-ink-soft transition-colors hover:bg-sand hover:text-ink"
                aria-label={`Cart, ${cartCount} items`}
              >
                <ShoppingBag className="size-[1.125rem]" />
                {cartCount > 0 && (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-bronze text-[0.5625rem] font-semibold text-white tabular-nums">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>

              <div className="ml-1 flex items-center gap-2.5 border-l border-line pl-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blush text-[0.6875rem] font-semibold text-bronze-dark"
                  aria-hidden
                >
                  {initials(profile?.full_name)}
                </span>
                <span className="hidden max-w-32 truncate text-sm text-ink sm:block">
                  {profile?.full_name ?? 'Account'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container-page flex gap-8 py-8">
        {/* Sidebar — desktop */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav aria-label="Dashboard" className="sticky top-24 space-y-1">
            {navItems.map(({ to, label, Icon, end, badge }) => (
              <NavLink
                key={to + label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'bg-blush/60 font-medium text-ink'
                      : 'text-ink-soft hover:bg-sand hover:text-ink',
                  )
                }
              >
                <Icon className="size-4 shrink-0 text-bronze" aria-hidden />
                <span className="flex-1">{label}</span>
                {badge ? (
                  <span className="rounded-pill bg-bronze px-1.5 py-0.5 text-[0.625rem] font-semibold text-white tabular-nums">
                    {badge}
                  </span>
                ) : null}
              </NavLink>
            ))}

            <div className="!mt-6 space-y-1 border-t border-line pt-4">
              <Link
                to="/"
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-sand hover:text-ink"
              >
                <ChevronLeft className="size-4 text-muted" aria-hidden />
                Back to the site
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-sand hover:text-ink"
              >
                <LogOut className="size-4 text-muted" aria-hidden />
                Sign out
              </button>
            </div>
          </nav>
        </aside>

        {/* Drawer — mobile */}
        {navOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-ink/30"
              onClick={() => setNavOpen(false)}
              aria-hidden
            />
            <nav
              aria-label="Dashboard"
              className="absolute inset-y-0 left-0 w-[min(17rem,86vw)] overflow-y-auto border-r border-line bg-canvas p-4 shadow-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  {isAdmin ? 'Administrator' : isStaff ? 'Staff' : 'Your account'}
                </p>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  className="rounded-sm p-1.5 text-muted hover:bg-sand hover:text-ink"
                  aria-label="Close navigation"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-1">
                {navItems.map(({ to, label, Icon, end }) => (
                  <NavLink
                    key={to + label}
                    to={to}
                    end={end}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                        isActive ? 'bg-blush/60 font-medium text-ink' : 'text-ink-soft hover:bg-sand',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0 text-bronze" aria-hidden />
                    {label}
                  </NavLink>
                ))}
              </div>

              <div className="mt-6 space-y-1 border-t border-line pt-4">
                <Link
                  to="/"
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-soft"
                >
                  <ChevronLeft className="size-4 text-muted" aria-hidden />
                  Back to the site
                </Link>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={<RouteLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
