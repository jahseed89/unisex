import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import '@/styles/index.css'
import { App } from './App'
import { queryClient } from '@/lib/query/client'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { CartProvider } from '@/features/cart/CartProvider'
import { initAnalytics } from './lib/analytics'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

initAnalytics()

// No <BrowserRouter> here on purpose: App.tsx builds its router with
// createBrowserRouter + RouterProvider, and nesting a second Router throws
// "You cannot render a <Router> inside another <Router>".
//
// Provider order matters: auth resolves the session that the cart keys its
// guest/account cache on, so AuthProvider must wrap CartProvider.
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: 'font-sans',
            description: 'text-muted',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)