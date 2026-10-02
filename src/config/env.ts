/**
 * Environment configuration.
 *
 * Every `VITE_*` value is inlined into the public bundle at build time, so this
 * file must never read a secret. Secrets (Paystack secret key, WhatsApp token,
 * SMTP credentials) belong in Supabase Edge Function environment variables.
 */

function read(key: string, fallback = ''): string {
  const value = import.meta.env[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readBool(key: string, fallback = false): boolean {
  const value = read(key)
  if (value === '') return fallback
  return value === 'true' || value === '1'
}

const supabaseUrl = read('VITE_SUPABASE_URL')
const supabaseAnonKey = read('VITE_SUPABASE_ANON_KEY')

/** Placeholders left in .env.example must not be treated as configured. */
const looksConfigured =
  supabaseUrl.length > 0 &&
  supabaseAnonKey.length > 0 &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnonKey.includes('your-anon-public-key')

export const env = {
  app: {
    url: read('VITE_APP_URL', 'http://localhost:5173'),
    env: read('VITE_APP_ENV', 'development'),
    get isProduction() {
      return this.env === 'production'
    },
    get isDevelopment() {
      return this.env === 'development'
    },
  },

  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    get configured() {
      return looksConfigured
    },
  },

  /**
   * Runs the entire UI against realistic local fixtures with no Supabase
   * connection. Auto-enabled when credentials are absent so the app is never a
   * blank screen for a reviewer.
   */
  get useMocks() {
    return readBool('VITE_USE_MOCKS') || !looksConfigured
  },

  payments: {
    provider: 'paystack' as const,
    publicKey: read('VITE_PAYSTACK_PUBLIC_KEY'),
    get enabled() {
      return readBool('VITE_PAYSTACK_ENABLED') && this.publicKey.length > 0
    },
  },

  whatsapp: {
    get enabled() {
      return readBool('VITE_WHATSAPP_ENABLED')
    },
    number: read('VITE_WHATSAPP_PHONE_NUMBER'),
    get linkBase() {
      return `https://wa.me/${this.number.replace(/\D/g, '')}`
    },
  },

  analytics: {
    gaId: read('VITE_GA_MEASUREMENT_ID'),
    plausibleDomain: read('VITE_PLAUSIBLE_DOMAIN'),
    get enabled() {
      return readBool('VITE_ENABLE_ANALYTICS') &&
        (this.gaId.length > 0 || this.plausibleDomain.length > 0)
    },
  },

  support: {
    email: read('VITE_SUPPORT_EMAIL', 'hello@blackcheryunisexstudio.com'),
    phone: read('VITE_SUPPORT_PHONE', '+2348000000000'),
  },
} as const

export type Env = typeof env

/**
 * Single place to explain a misconfigured environment in the UI instead of
 * failing with an opaque network error.
 */
export function configurationNotice(): string | null {
  if (env.useMocks) {
    if (env.supabase.configured) {
      return 'Mock mode is on — data is local fixtures, nothing is saved to the database.'
    }
    return 'Preview mode — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to connect the database.'
  }
  return null
}
