import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'

import { SiteLayout } from '@/components/layout/SiteLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { RouteLoader } from '@/components/layout/RouteLoader'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { RequireAccount, RequireAuth, RequireRole } from '@/components/layout/RouteGuards'
import { env, configurationNotice } from '@/config/env'

// ---------------------------------------------------------------------------
// Route table
// Every route is code-split so the initial bundle stays small on mobile, and
// dashboard chunks are never fetched by an anonymous visitor.
// ---------------------------------------------------------------------------
const HomePage = lazy(() => import('@/pages/HomePage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))
const ServicesPage = lazy(() => import('@/pages/ServicesPage'))
const ServiceDetailPage = lazy(() => import('@/pages/ServiceDetailPage'))
const BookingPage = lazy(() => import('@/features/booking/pages/BookingPage'))
const BookingConfirmationPage = lazy(() => import('@/features/booking/pages/BookingConfirmationPage'))
const ShopPage = lazy(() => import('@/features/shop/pages/ShopPage'))
const ProductDetailPage = lazy(() => import('@/features/shop/pages/ProductDetailPage'))
const CartPage = lazy(() => import('@/features/cart/pages/CartPage'))
const CheckoutPage = lazy(() => import('@/features/checkout/pages/CheckoutPage'))
const CheckoutSuccessPage = lazy(() => import('@/features/checkout/pages/CheckoutSuccessPage'))
const CareersPage = lazy(() => import('@/pages/CareersPage'))
const JobDetailPage = lazy(() => import('@/pages/JobDetailPage'))
const JobApplyPage = lazy(() => import('@/features/careers/pages/JobApplyPage'))
const GalleryPage = lazy(() => import('@/pages/GalleryPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const PolicyPage = lazy(() => import('@/pages/PolicyPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const SignInPage = lazy(() => import('@/features/auth/pages/SignInPage'))
const SignUpPage = lazy(() => import('@/features/auth/pages/SignUpPage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'))
const AuthConfirmPage = lazy(() => import('@/features/auth/pages/AuthConfirmPage'))

const AccountOverviewPage = lazy(() => import('@/features/account/pages/AccountOverviewPage'))
const AccountAppointmentsPage = lazy(() => import('@/features/account/pages/AccountAppointmentsPage'))
const AppointmentDetailPage = lazy(() => import('@/features/account/pages/AppointmentDetailPage'))
const AccountOrdersPage = lazy(() => import('@/features/account/pages/AccountOrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/account/pages/OrderDetailPage'))
const WishlistPage = lazy(() => import('@/features/account/pages/WishlistPage'))
const ProfilePage = lazy(() => import('@/features/account/pages/ProfilePage'))
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'))
const MyApplicationsPage = lazy(() => import('@/features/account/pages/MyApplicationsPage'))

const StaffTodayPage = lazy(() => import('@/features/staff/pages/StaffTodayPage'))
const StaffDiaryPage = lazy(() => import('@/features/staff/pages/StaffDiaryPage'))
const StaffRequirementsPage = lazy(() => import('@/features/staff/pages/StaffRequirementsPage'))
const StaffClientsPage = lazy(() => import('@/features/staff/pages/StaffClientsPage'))

const AdminDashboardPage = lazy(() => import('@/features/admin/pages/AdminDashboardPage'))
const AdminBookingsPage = lazy(() => import('@/features/admin/pages/AdminBookingsPage'))
const AdminBookingDetailPage = lazy(() => import('@/features/admin/pages/AdminBookingDetailPage'))
const AdminServicesPage = lazy(() => import('@/features/admin/pages/AdminServicesPage'))
const AdminProductsPage = lazy(() => import('@/features/admin/pages/AdminProductsPage'))
const AdminProductEditPage = lazy(() => import('@/features/admin/pages/AdminProductEditPage'))
const AdminInventoryPage = lazy(() => import('@/features/admin/pages/AdminInventoryPage'))
const AdminOrdersPage = lazy(() => import('@/features/admin/pages/AdminOrdersPage'))
const AdminOrderDetailPage = lazy(() => import('@/features/admin/pages/AdminOrderDetailPage'))
const AdminCustomersPage = lazy(() => import('@/features/admin/pages/AdminCustomersPage'))
const AdminCareersPage = lazy(() => import('@/features/admin/pages/AdminCareersPage'))
const AdminApplicationsPage = lazy(() => import('@/features/admin/pages/AdminApplicationsPage'))
const AdminApplicationDetailPage = lazy(() => import('@/features/admin/pages/AdminApplicationDetailPage'))

/** Suspense fallback for every lazily loaded chunk. */
const Fallback = () => <RouteLoader />
const guarded = (element: React.ReactNode) => <Suspense fallback={<Fallback />}>{element}</Suspense>

const routes: RouteObject[] = [
  // -------------------------------------------------------------------------
  // Public site
  // -------------------------------------------------------------------------
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: guarded(<HomePage />) },
      { path: 'about', element: guarded(<AboutPage />) },
      { path: 'services', element: guarded(<ServicesPage />) },
      { path: 'services/:slug', element: guarded(<ServiceDetailPage />) },
      { path: 'book', element: guarded(<BookingPage />) },
      { path: 'book/confirmed/:reference', element: guarded(<BookingConfirmationPage />) },
      { path: 'shop', element: guarded(<ShopPage />) },
      { path: 'shop/:slug', element: guarded(<ProductDetailPage />) },
      { path: 'cart', element: guarded(<CartPage />) },
      { path: 'gallery', element: guarded(<GalleryPage />) },
      { path: 'careers', element: guarded(<CareersPage />) },
      { path: 'careers/:slug', element: guarded(<JobDetailPage />) },
      { path: 'careers/:slug/apply', element: guarded(<JobApplyPage />) },
      { path: 'contact', element: guarded(<ContactPage />) },
      { path: 'search', element: guarded(<SearchPage />) },
      { path: 'policies/:slug', element: guarded(<PolicyPage />) },

      // Authentication deliberately sits outside the marketing shell.
      {
        path: 'auth',
        children: [
          { index: true, element: <Navigate to="/auth/sign-in" replace /> },
          { path: 'sign-in', element: guarded(<SignInPage />) },
          { path: 'sign-up', element: guarded(<SignUpPage />) },
          { path: 'forgot-password', element: guarded(<ForgotPasswordPage />) },
          { path: 'reset-password', element: guarded(<ResetPasswordPage />) },
          { path: 'confirm', element: guarded(<AuthConfirmPage />) },
        ],
      },

      {
        path: 'checkout',
        element: (
          <RequireAuth>
            {guarded(<CheckoutPage />)}
          </RequireAuth>
        ),
      },
      {
        path: 'checkout/success',
        element: (
          <RequireAuth>
            {guarded(<CheckoutSuccessPage />)}
          </RequireAuth>
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Customer account
  // -------------------------------------------------------------------------
  {
    path: 'account',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: guarded(<AccountOverviewPage />) },
      { path: 'appointments', element: guarded(<AccountAppointmentsPage />) },
      { path: 'appointments/:id', element: guarded(<AppointmentDetailPage />) },
      { path: 'orders', element: guarded(<AccountOrdersPage />) },
      { path: 'orders/:id', element: guarded(<OrderDetailPage />) },
      { path: 'wishlist', element: guarded(<WishlistPage />) },
      { path: 'profile', element: guarded(<ProfilePage />) },
      { path: 'notifications', element: guarded(<NotificationsPage />) },
      { path: 'applications', element: guarded(<MyApplicationsPage />) },
    ],
  },

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------
  {
    path: 'staff',
    element: (
      <RequireAuth>
        <RequireRole roles={['staff', 'supervisor', 'admin']}>
          <DashboardLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: guarded(<StaffTodayPage />) },
      { path: 'diary', element: guarded(<StaffDiaryPage />) },
      { path: 'requirements', element: guarded(<StaffRequirementsPage />) },
      { path: 'clients', element: guarded(<StaffClientsPage />) },
    ],
  },

  // -------------------------------------------------------------------------
  // Administration
  // -------------------------------------------------------------------------
  {
    path: 'admin',
    element: (
      <RequireAuth>
        <RequireRole roles={['admin']}>
          <DashboardLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: guarded(<AdminDashboardPage />) },
      { path: 'bookings', element: guarded(<AdminBookingsPage />) },
      { path: 'bookings/:id', element: guarded(<AdminBookingDetailPage />) },
      { path: 'services', element: guarded(<AdminServicesPage />) },
      { path: 'products', element: guarded(<AdminProductsPage />) },
      { path: 'products/:id', element: guarded(<AdminProductEditPage />) },
      { path: 'inventory', element: guarded(<AdminInventoryPage />) },
      { path: 'orders', element: guarded(<AdminOrdersPage />) },
      { path: 'orders/:id', element: guarded(<AdminOrderDetailPage />) },
      { path: 'customers', element: guarded(<AdminCustomersPage />) },
      { path: 'careers', element: guarded(<AdminCareersPage />) },
      { path: 'careers/applications', element: guarded(<AdminApplicationsPage />) },
      { path: 'careers/applications/:id', element: guarded(<AdminApplicationDetailPage />) },
    ],
  },

  // Catch-all stays last.
  { path: '*', element: guarded(<NotFoundPage />) },
]

const router = createBrowserRouter(routes)

export function App() {
  const notice = configurationNotice()

  if (notice && env.app.isDevelopment) {
    console.info(`[unisex] ${notice}`)
  }

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      {notice && env.app.isDevelopment && (
        <div className="fixed bottom-3 left-3 z-50 max-w-sm rounded-md border border-line bg-surface/95 px-3.5 py-2.5 text-[0.6875rem] leading-relaxed text-muted shadow-md backdrop-blur">
          <span className="font-semibold text-ink">Preview mode</span> — {notice}
        </div>
      )}
    </ErrorBoundary>
  )
}

export { RequireAccount }
