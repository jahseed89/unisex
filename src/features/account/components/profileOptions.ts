import type { HairClass, HairTexture, NotificationChannel, UserGender } from '@/types'
import type { RadioOption } from '@/components/ui'

/**
 * Option lists and constants for the profile form.
 *
 * Kept out of `ProfileForm.tsx` so that file only exports components, which
 * keeps React Fast Refresh working while the form is being developed.
 */

export const GENDER_OPTIONS: RadioOption<UserGender>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export const HAIR_CLASS_OPTIONS: RadioOption<HairClass>[] = [
  { value: 'human', label: 'Human hair', description: 'Extensions or wigs you already own' },
  { value: 'blend', label: 'Blend', description: 'Human hair mixed with premium fibre' },
  { value: 'synthetic', label: 'Synthetic', description: 'Heat-friendly fibre' },
  { value: 'vegan', label: 'Vegan', description: 'Plant-based or 100% synthetic' },
]

export const HAIR_TEXTURE_OPTIONS: RadioOption<HairTexture>[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'curly', label: 'Curly' },
  { value: 'coily', label: 'Coily' },
  { value: 'kinky', label: 'Kinky' },
]

/** Common sensitivities offered as one-tap chips above the free-text field. */
export const COMMON_ALLERGENS = [
  'Latex',
  'PPD',
  'Ammonia',
  'Silicone',
  'Adhesive',
  'Fragrance',
  'Nut oils',
  'Gluten',
]

export const NOTIFICATION_CATEGORIES = [
  { key: 'booking', label: 'Bookings', description: 'Confirmations, reminders and changes' },
  { key: 'commerce', label: 'Orders', description: 'Order updates, dispatch and delivery' },
  { key: 'recruitment', label: 'Careers', description: 'Application progress and interview invites' },
  { key: 'promotional', label: 'Offers and news', description: 'Occasional studio news and discounts' },
] as const

export const NOTIFICATION_CHANNELS: {
  key: NotificationChannel
  label: string
  description: string
}[] = [
  { key: 'in_app', label: 'In app', description: 'Shows in your account' },
  { key: 'email', label: 'Email', description: 'To your account email' },
  { key: 'sms', label: 'SMS', description: 'To your saved phone number' },
  { key: 'whatsapp', label: 'WhatsApp', description: 'To your saved WhatsApp number' },
]

/** The four marketing/messaging permissions held on `profiles`. */
export interface PrivacyValues {
  marketing_opt_in: boolean
  whatsapp_opt_in: boolean
  sms_opt_in: boolean
  email_opt_in: boolean
}
