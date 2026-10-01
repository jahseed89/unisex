import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase/client'
import { env } from '@/config/env'
import { resetQueryCache } from '@/lib/query/client'
import type { Profile, RoleKey, SessionState } from '@/types'

/**
 * Authentication and authorisation state.
 *
 * Responsibilities:
 *  - track the Supabase session and mirror it to `profiles` + `user_roles`
 *  - expose a single derived `SessionState` that routes and UI read from
 *  - hard-clear every cached query on sign-out or role change, so a subsequent
 *    sign-in can never render the previous user's data
 */

interface AuthContextValue extends SessionState {
  signUp: (input: SignUpInput) => Promise<SignUpResult>
  signIn: (input: SignInInput) => Promise<void>
  signInWithOtp: (email: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refresh: () => Promise<void>
}

export interface SignUpInput {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface SignUpResult {
  needsEmailConfirmation: boolean
  email: string
}

export interface SignInInput {
  email: string
  password: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

const EMPTY_STATE: SessionState = {
  user: null,
  profile: null,
  roles: [],
  isAuthenticated: false,
  isStaff: false,
  isAdmin: false,
  isLoading: true,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>(EMPTY_STATE)
  const sessionRef = useRef<Session | null>(null)

  /** Load profile + roles for the current user, tolerating a missing trigger. */
  const hydrate = useCallback(
    async (user: User | null): Promise<{ profile: Profile | null; roles: RoleKey[] }> => {
      if (!user) return { profile: null, roles: [] }
      const supabase = getSupabase()

      const [profileResult, rolesResult] = await Promise.allSettled([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.rpc('fn_my_role_keys'),
      ])

      const profile =
        profileResult.status === 'fulfilled' && profileResult.value.data
          ? (profileResult.value.data as Profile)
          : null

      // Every account receives the customer role; an absent array is safe.
      const roles: RoleKey[] =
        rolesResult.status === 'fulfilled' && Array.isArray(rolesResult.value.data)
          ? (rolesResult.value.data as RoleKey[])
          : ['customer']

      return { profile, roles }
    },
    [],
  )

  const applyUser = useCallback(
    async (user: User | null) => {
      if (!user) {
        setState({ ...EMPTY_STATE, isLoading: false })
        return
      }
      const { profile, roles } = await hydrate(user)
      setState({
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          created_at: user.created_at,
          email_confirmed_at: user.email_confirmed_at,
          user_metadata: user.user_metadata ?? {},
        },
        profile,
        roles,
        isAuthenticated: true,
        isStaff: roles.includes('staff') || roles.includes('admin'),
        isAdmin: roles.includes('admin'),
        isLoading: false,
      })
    },
    [hydrate],
  )

  // Initial session + cross-tab subscription.
  useEffect(() => {
    let active = true
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      sessionRef.current = data.session
      void applyUser(data.session?.user ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      sessionRef.current = nextSession

      // TOKEN_REFRESHED fires in place; a full reload would drop in-flight state.
      if (event === 'TOKEN_REFRESHED') return

      // Drop every cached query before the identity changes hands.
      resetQueryCache()
      queryClient.clear()

      void applyUser(nextSession?.user ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [applyUser, queryClient])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async ({ email, password }) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password })
      if (error) throw new AuthError(mapAuthMessage(error.message))
    },
    [],
  )

  const signUp = useCallback<AuthContextValue['signUp']>(
    async ({ email, password, fullName, phone }) => {
      const supabase = getSupabase()

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // Read by the fn_handle_new_user trigger to build the profile.
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${env.app.url}/auth/confirm`,
        },
      })

      if (error) throw new AuthError(mapAuthMessage(error.message))

      // Phone is a separate call because it may require a different channel.
      if (phone && data.user) {
        await supabase.auth.updateUser({ phone }).catch(() => undefined)
      }

      return {
        needsEmailConfirmation: !data.session,
        email,
      }
    },
    [],
  )

  const signInWithOtp = useCallback<AuthContextValue['signInWithOtp']>(async (email) => {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.app.url}/auth/confirm` },
    })
    if (error) throw new AuthError(mapAuthMessage(error.message))
  }, [])

  const signInWithGoogle = useCallback<AuthContextValue['signInWithGoogle']>(async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${env.app.url}/auth/confirm` },
    })
    if (error) throw new AuthError(mapAuthMessage(error.message))
  }, [])

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    await getSupabase().auth.signOut()
    resetQueryCache()
    sessionRef.current = null
    setState({ ...EMPTY_STATE, isLoading: false })
  }, [])

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(async (email) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${env.app.url}/auth/reset-password`,
    })
    if (error) throw new AuthError(mapAuthMessage(error.message))
  }, [])

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async (password) => {
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) throw new AuthError(mapAuthMessage(error.message))
  }, [])

  const refresh = useCallback<AuthContextValue['refresh']>(async () => {
    const { data } = await getSupabase().auth.getSession()
    sessionRef.current = data.session
    await applyUser(data.session?.user ?? null)
  }, [applyUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signUp,
      signInWithOtp,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
      refresh,
    }),
    [state, signIn, signUp, signInWithOtp, signInWithGoogle, signOut, resetPassword, updatePassword, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Split hook so components that only need identity do not re-render on role changes. */
export function useUser(): SessionState['user'] {
  return useAuth().user
}

export function useRoles(): RoleKey[] {
  return useAuth().roles
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Translate GoTrue's technical messages into something a client can act on. */
function mapAuthMessage(message: string): string {
  const normalised = message.toLowerCase()

  if (normalised.includes('invalid login credentials')) {
    return 'That email and password combination is not right.'
  }
  if (normalised.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.'
  }
  if (normalised.includes('user already registered')) {
    return 'An account already exists with that email. Try signing in instead.'
  }
  if (normalised.includes('password should be at least')) {
    return 'Choose a password of at least 6 characters.'
  }
  if (normalised.includes('rate limit') || normalised.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (normalised.includes('unable to validate email')) {
    return 'That does not look like a valid email address.'
  }
  return message
}
