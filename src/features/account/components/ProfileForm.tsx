import { useId, useState, type ReactNode } from 'react'
import { FormProvider, useFormContext, useWatch, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Plus, X } from 'lucide-react'

import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  RadioCards,
  Select,
  Switch,
  Textarea,
} from '@/components/ui'
import { FormField } from '@/features/auth/components/FormField'
import { toE164 } from '@/lib/utils/format'
import {
  COMMON_ALLERGENS,
  GENDER_OPTIONS,
  HAIR_CLASS_OPTIONS,
  HAIR_TEXTURE_OPTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type PrivacyValues,
} from './profileOptions'
import type { HairTexture, NotificationChannel } from '@/types'

/**
 * Profile form sections.
 *
 * All of them read and write the same react-hook-form instance via
 * `FormProvider`, so a single "Save changes" persists personal details, hair
 * profile and health notes in one `updateProfile` call with one set of inline
 * errors.
 *
 * Notification preferences and the privacy switches are deliberately *not* in
 * this form — each toggle is its own mutation against
 * `notification_preferences` or `profiles`, so a failed toggle never silently
 * reverts along with an unrelated failed save.
 */

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Tell us the name you would like on your appointment.')
    .max(120, 'That name looks unusually long.'),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || toE164(value) !== null,
      'Enter a Nigerian number we can reach you on, e.g. 0803 123 4567.',
    ),
  dateOfBirth: z
    .string()
    .refine((value) => {
      if (!value) return true
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return false
      const age = (Date.now() - parsed.getTime()) / (365.25 * 86_400_000)
      return age >= 13 && age < 120
    }, 'Enter a date of birth that makes sense.'),
  gender: z.enum(['female', 'male', 'non_binary', 'other', 'prefer_not_to_say']),
  bio: z.string().trim().max(600, 'Keep it under 600 characters.'),
  hairClass: z.enum(['human', 'synthetic', 'blend', 'vegan']),
  hairTexture: z.enum(['straight', 'wavy', 'curly', 'coily', 'kinky']),
  allergies: z.array(z.string().trim().min(1).max(60)),
  accessibilityNeeds: z.string().trim().max(800, 'Keep it under 800 characters.'),
})

export type ProfileValues = z.infer<typeof profileSchema>

export function ProfileFormProvider({
  form,
  children,
}: {
  form: UseFormReturn<ProfileValues>
  children: ReactNode
}) {
  return <FormProvider {...form}>{children}</FormProvider>
}

/** Narrow the provider's context to our own value shape. */
function useProfileForm(): UseFormReturn<ProfileValues> {
  return useFormContext<ProfileValues>()
}

/** Resilient `useWatch` — falls back to the schema default when unset. */
function useProfileField<K extends keyof ProfileValues>(
  name: K,
  fallback: ProfileValues[K],
): ProfileValues[K] {
  const { control } = useProfileForm()
  const value = useWatch({ control, name })
  return (value === undefined ? fallback : value) as ProfileValues[K]
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------
export function PersonalSection({
  email,
  phoneVerified,
}: {
  email: string | null
  phoneVerified: boolean
}) {
  const id = useId()
  const { register, setValue, formState } = useProfileForm()
  const { errors } = formState
  const gender = useProfileField('gender', 'prefer_not_to_say')

  return (
    <div className="space-y-6">
      <FormField label="Full name" error={errors.fullName?.message} required>
        <Input
          autoComplete="name"
          placeholder="Ada Okafor"
          invalid={Boolean(errors.fullName)}
          {...register('fullName')}
        />
      </FormField>

      <FormField
        label="Email address"
        hint="Managed by the account you signed in with. To change it, contact us and we will verify the new address first."
      >
        <Input
          id={`${id}-email`}
          type="email"
          readOnly
          disabled
          value={email ?? ''}
          placeholder="No email on this account"
        />
      </FormField>

      <FormField
        label="Phone number"
        error={errors.phone?.message}
        hint={
          phoneVerified
            ? 'Verified — we can send SMS and WhatsApp reminders to this number.'
            : 'Used for appointment reminders. We verify it at your next visit.'
        }
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          invalid={Boolean(errors.phone)}
          {...register('phone')}
        />
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          label="Date of birth"
          error={errors.dateOfBirth?.message}
          hint="Helps us plan colour and chemical work safely."
        >
          <Input
            type="date"
            invalid={Boolean(errors.dateOfBirth)}
            {...register('dateOfBirth')}
          />
        </FormField>

        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-soft">Gender</p>
          <RadioCards
            name={`${id}-gender`}
            aria-label="Gender"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={(value) => setValue('gender', value, { shouldDirty: true })}
            columns={2}
          />
          <input type="hidden" {...register('gender')} />
        </div>
      </div>

      <FormField
        label="About you"
        error={errors.bio?.message}
        hint="Optional. A line about your hair or what you are looking for."
      >
        <Textarea
          rows={4}
          maxLength={600}
          placeholder="Currently 4 inches of coily hair growing out a box dye. Looking for healthy length and a protective style I can sleep in."
          invalid={Boolean(errors.bio)}
          {...register('bio')}
        />
      </FormField>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hair profile
// ---------------------------------------------------------------------------
export function HairProfileSection() {
  const id = useId()
  const { register, setValue, formState } = useProfileForm()
  const { errors } = formState
  const hairClass = useProfileField('hairClass', 'human')
  const hairTexture = useProfileField('hairTexture', 'coily')

  return (
    <div className="space-y-6">
      <Alert variant="info" title="Why we ask">
        This pre-fills your requirement forms so nobody re-explains their texture, length and hair
        history at the counter. It also tells your stylist which products and techniques suit you
        before you arrive.
      </Alert>

      <div>
        <p className="mb-2 text-[0.8125rem] font-medium text-ink-soft">
          What kind of hair are we working with?
        </p>
        <RadioCards
          name={`${id}-hair-class`}
          aria-label="Hair class"
          options={HAIR_CLASS_OPTIONS}
          value={hairClass}
          onChange={(value) => setValue('hairClass', value, { shouldDirty: true })}
          columns={2}
        />
        <input type="hidden" {...register('hairClass')} />
        {errors.hairClass?.message && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {errors.hairClass.message}
          </p>
        )}
      </div>

      <Field
        label="Your natural texture"
        htmlFor={`${id}-texture`}
        error={errors.hairTexture?.message}
        hint="Approximate is fine — textures sit on a spectrum."
        required
      >
        <Select
          id={`${id}-texture`}
          value={hairTexture}
          invalid={Boolean(errors.hairTexture)}
          onChange={(event) =>
            setValue('hairTexture', event.target.value as HairTexture, { shouldDirty: true })
          }
          options={HAIR_TEXTURE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </Field>
      <input type="hidden" {...register('hairTexture')} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health & safety
// ---------------------------------------------------------------------------
export function HealthSection() {
  const { register, setValue, formState } = useProfileForm()
  const { errors } = formState
  const allergies = useProfileField('allergies', [])
  const [draft, setDraft] = useState('')

  const add = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (allergies.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    setValue('allergies', [...allergies, trimmed], { shouldDirty: true })
    setDraft('')
  }

  const remove = (value: string) => {
    setValue(
      'allergies',
      allergies.filter((item) => item !== value),
      { shouldDirty: true },
    )
  }

  const custom = allergies.filter(
    (item) => !COMMON_ALLERGENS.some((known) => known.toLowerCase() === item.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <Alert variant="warning" title="Tell us before any chemical service">
        Colour, bleach, keratin and adhesives all carry risk. Listing your allergies here means your
        stylist sees them on every requirement, not just the first one.
      </Alert>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink-soft">
          Allergies and sensitivities
        </legend>

        {allergies.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {allergies.map((item) => (
              <li key={item}>
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-warning/30 bg-warning/10 py-1 pl-3 pr-1.5 text-xs font-medium text-warning">
                  {item}
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label={`Remove allergy ${item}`}
                    className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-warning/20"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                add(draft)
              }
            }}
            placeholder="Type an allergy and press Enter"
            aria-label="Add an allergy"
            maxLength={60}
          />
          <Button
            type="button"
            variant="outline"
            size="md"
            className="shrink-0"
            disabled={draft.trim().length === 0}
            onClick={() => add(draft)}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>

        <p className="mt-2 text-xs text-muted">
          Press Enter or comma to add. Leave empty if you have none.
        </p>

        <div className="mt-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Common ones — tap to toggle
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_ALLERGENS.map((item) => {
              const added = allergies.some(
                (existing) => existing.toLowerCase() === item.toLowerCase(),
              )
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => (added ? remove(item) : add(item))}
                  aria-pressed={added}
                  className={`min-h-9 rounded-pill border px-3 text-xs font-medium transition-colors ${
                    added
                      ? 'border-bronze bg-bronze/[0.08] text-ink'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      </fieldset>

      {custom.length > 0 && (
        <p className="text-xs text-muted" role="status">
          Saved: {custom.join(', ')}. Not on our common list — which is fine, we just spell it out for
          your stylist.
        </p>
      )}

      <FormField
        label="Accessibility needs"
        error={errors.accessibilityNeeds?.message}
        hint="Anything that affects how we run your appointment — step-free access, extra time, a translator, seating that stays put, no strong fragrance."
      >
        <Textarea
          rows={4}
          maxLength={800}
          placeholder="I use a wheelchair — please book the ground-floor chair. I also need extra time to get in and out."
          invalid={Boolean(errors.accessibilityNeeds)}
          {...register('accessibilityNeeds')}
        />
      </FormField>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function NotificationPreferencesSection({
  values,
  pending,
  onToggle,
}: {
  /** `type|channel` → enabled. A missing key means "default on". */
  values: Record<string, boolean>
  pending: string | undefined
  onToggle: (type: string, channel: NotificationChannel, enabled: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Booking confirmations are always sent — everything else is your call. Changes save
        immediately.
      </p>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Notification preferences by category and channel</caption>
          <thead className="border-b border-line bg-sand/50 text-[0.6875rem] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                Category
              </th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <th key={channel.key} scope="col" className="px-3 py-3 text-center font-semibold">
                  {channel.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <tr key={category.key}>
                <th scope="row" className="px-4 py-3.5 text-left align-top font-normal">
                  <span className="block text-sm font-medium text-ink">{category.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{category.description}</span>
                </th>
                {NOTIFICATION_CHANNELS.map((channel) => {
                  const slot = `${category.key}|${channel.key}`
                  const enabled = values[slot] ?? true
                  const busy = pending === slot

                  return (
                    <td key={channel.key} className="px-3 py-3.5 text-center align-middle">
                      <Switch
                        checked={enabled}
                        disabled={busy}
                        onCheckedChange={(next) => onToggle(category.key, channel.key, next)}
                        label={`${channel.label} notifications for ${category.label.toLowerCase()}`}
                        className="mx-auto"
                      />
                      <span className="sr-only">{channel.description}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------
export function PrivacySection({
  values,
  pending,
  onChange,
}: {
  values: PrivacyValues
  pending: keyof PrivacyValues | undefined
  onChange: (key: keyof PrivacyValues, value: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <Alert variant="neutral" title="What these are">
        The marketing and messaging permissions the studio holds on your profile. Booking
        confirmations and transactional messages are sent regardless — they are part of the service
        you booked, not marketing.
      </Alert>

      <div className="space-y-3">
        <ToggleRow
          id="privacy-marketing"
          label="Studio news and offers"
          description="New services, seasonal offers and gallery posts."
          checked={values.marketing_opt_in}
          disabled={pending === 'marketing_opt_in'}
          onChange={(next) => onChange('marketing_opt_in', next)}
        />
        <ToggleRow
          id="privacy-email"
          label="Email"
          description="Marketing email at your account address."
          checked={values.email_opt_in}
          disabled={pending === 'email_opt_in'}
          onChange={(next) => onChange('email_opt_in', next)}
        />
        <ToggleRow
          id="privacy-whatsapp"
          label="WhatsApp"
          description="Offers and updates on the number saved to your profile."
          checked={values.whatsapp_opt_in}
          disabled={pending === 'whatsapp_opt_in'}
          onChange={(next) => onChange('whatsapp_opt_in', next)}
        />
        <ToggleRow
          id="privacy-sms"
          label="SMS"
          description="Offers and updates by text message."
          checked={values.sms_opt_in}
          disabled={pending === 'sms_opt_in'}
          onChange={(next) => onChange('sms_opt_in', next)}
        />
      </div>

      <div className="border-t border-line pt-5">
        <Checkbox
          id="privacy-contact-points"
          checked
          disabled
          readOnly
          label="Save my phone number for WhatsApp and SMS"
          description="Required to send messages at all. Remove the number from Personal above instead of unticking this."
        />
      </div>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        label={`${label} opt-in`}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}
