import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        // Server-side helpers (Edge Functions) proxied during dev to dodge CORS
        '/functions': {
          target: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/functions/, '/functions'),
        },
      },
    },
    build: {
      target: 'es2022',
      cssTarget: 'chrome110',
      sourcemap: !isProd,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            query: ['@tanstack/react-query'],
            charts: ['recharts'],
            forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
    esbuild: {
      legalComments: 'none',
    },
  }
})