import { insert, select, selectOne, update, upsert, remove } from './db'
import type {
  AppNotification,
  NotificationCategory,
  NotificationChannel,
  Profile,
  ReviewStatus,
  SessionState,
} from '@/types'

/**
 * Session and self-service account client.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function getProfile(userId: string): Promise<Profile | null> {
  return selectOne<Profile>('profiles', { filters: { id: userId }, range: { from: 0, to: 1 } })
}

export async function updateProfile(
  userId: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  return update<Profile>('profiles', userId, patch)
}

/**
 * A profile is created by the `on_auth_user_created` trigger. `upsert` keeps the
 * account form idempotent for the edge case where the trigger has not yet run.
 */
export async function ensureProfile(
  userId: string,
  email: string,
  fullName?: string,
): Promise<Profile> {
  return upsert<Profile>('profiles', {
    id: userId,
    email,
    full_name: fullName ?? null,
  })
}

// ---------------------------------------------------------------------------
// Contact points
// ---------------------------------------------------------------------------
export interface ContactPoint {
  id: string
  profile_id: string
  channel: NotificationChannel
  address: string
  is_primary: boolean
  verified_at: string | null
  is_active: boolean
}

export async function listContactPoints(userId: string): Promise<ContactPoint[]> {
  return select<ContactPoint>('contact_points', {
    filters: { profile_id: userId, is_active: true },
  })
}

export async function saveContactPoint(input: {
  userId: string
  channel: NotificationChannel
  address: string
  isPrimary?: boolean
}): Promise<ContactPoint> {
  return upsert<ContactPoint>('contact_points', {
    profile_id: input.userId,
    channel: input.channel,
    address: input.address,
    is_primary: input.isPrimary ?? false,
    is_active: true,
  } as Partial<ContactPoint>)
}

export async function deleteContactPoint(id: string): Promise<void> {
  return remove('contact_points', id)
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------
export interface NotificationPreference {
  user_id: string
  type: string
  channel: NotificationChannel
  enabled: boolean
  quiet_hours: { start: string; end: string } | null
}

/** Missing rows mean "default on", so an empty list is a valid full set. */
export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  return select<NotificationPreference>('notification_preferences', {
    filters: { user_id: userId },
  })
}

export async function setNotificationPreference(
  userId: string,
  type: string,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<NotificationPreference> {
  return upsert<NotificationPreference>('notification_preferences', {
    user_id: userId,
    type,
    channel,
    enabled,
  })
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<AppNotification[]> {
  return select<AppNotification>('notifications', {
    filters: {
      recipient_id: userId,
      ...(options.unreadOnly ? { is_read: false } : {}),
    },
    order: { column: 'created_at', ascending: false },
    ...(options.limit ? { range: { from: 0, to: options.limit - 1 } } : {}),
  })
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await select<{ id: string }>('notifications', {
    select: 'id',
    filters: { recipient_id: userId, is_read: false },
  })
  return rows.length
}

export async function markNotificationRead(id: string): Promise<void> {
  await update('notifications', id, { is_read: true, read_at: new Date().toISOString() })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { supabase } = await import('@/lib/supabase/client')
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('is_read', false)
  if (error) throw error
}

export async function deleteNotification(id: string): Promise<void> {
  return remove('notifications', id)
}

// ---------------------------------------------------------------------------
// Reviews left by the signed-in customer
// ---------------------------------------------------------------------------
export interface MyReview extends AppNotification {
  service_name?: string | null
}

type ReviewRow = {
  id: string
  customer_id: string
  appointment_id: string | null
  service_id: string | null
  product_id: string | null
  rating: number
  title: string | null
  body: string
  image_urls: string[]
  status: ReviewStatus
}

export async function submitReview(input: {
  customerId: string
  appointmentId?: string | null
  serviceId?: string | null
  productId?: string | null
  rating: number
  title?: string
  body: string
  imageUrls?: string[]
}): Promise<{ id: string; status: ReviewStatus }> {
  return insert<ReviewRow>('reviews', {
    customer_id: input.customerId,
    appointment_id: input.appointmentId ?? null,
    service_id: input.serviceId ?? null,
    product_id: input.productId ?? null,
    rating: input.rating,
    title: input.title ?? null,
    body: input.body,
    image_urls: input.imageUrls ?? [],
    status: 'pending',
  })
}

// ---------------------------------------------------------------------------
// Session shape helpers
// ---------------------------------------------------------------------------

/** Build the derived authorisation state the UI routes on. */
export function deriveSessionState(input: {
  user: SessionState['user']
  profile: Profile | null
  roles: string[] | null
  isLoading?: boolean
}): SessionState {
  const roles = (input.roles ?? []) as SessionState['roles']
  return {
    user: input.user,
    profile: input.profile,
    roles,
    isAuthenticated: Boolean(input.user),
    isStaff: roles.includes('staff') || roles.includes('admin'),
    isAdmin: roles.includes('admin'),
    isLoading: input.isLoading ?? false,
  }
}

/** Where to send a user after sign-in, based on their role. */
export function postSignInPath(state: SessionState): string {
  if (state.isAdmin) return '/admin'
  if (state.isStaff) return '/staff'
  return '/account'
}

export { type NotificationCategory }
