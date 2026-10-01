import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/query/keys'
import { countUnread } from '@/lib/api/account'
import { useAuth } from '@/features/auth/AuthProvider'

/** Unread badge count for the dashboard header. Anonymous users get 0. */
export function useUnreadCount(): number {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: qk.unreadCount(user?.id ?? 'anonymous'),
    queryFn: () => countUnread(user!.id),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  return data ?? 0
}
