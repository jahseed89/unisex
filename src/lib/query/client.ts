import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query defaults.
 *
 * `staleTime` is deliberately non-zero: this is a catalogue where data changes
 * on the order of hours, so background refetching on every window focus would
 * waste mobile data for no benefit.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Never retry an authorisation or validation failure; it will not pass.
        const code = (error as { code?: string })?.code
        if (code === '42501' || code === 'PGRST301' || code === '23505') return false
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
})

/** Wipe every cached query — used on sign-out and on role change. */
export function resetQueryCache(): void {
  queryClient.clear()
}
