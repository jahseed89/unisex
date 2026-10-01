import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import '@/styles/index.css'
import { App } from './App'
import { queryClient } from '@/lib/query/client'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { CartProvider } from '@/features/cart/CartProvider'
import { initAnalytics, trackPageView } from './lib/analytics'
import { site } from './config/site'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

initAnalytics()

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// SPA navigations do not reload the document, so page views are reported from
// the router rather than from the browser's own load handler.
window.addEventListener('popstate', () => {
  trackPageView(window.location.pathname + window.location.search, document.title, site.url)
})
