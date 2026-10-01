import type { HairTexture } from '@/types'

/**
 * Option sets for the requirements form.
 *
 * These map onto the `hair_goals`, `scalp_conditions` and `current_*` columns,
 * which are free-text arrays / enum-ish strings, so the slugs below are what gets
 * persisted. They are declared once and shared between the form (which collects
 * them) and the review step (which labels them back to the customer).
 */

export interface Option {
  value: string
  label: string
  description?: string
}

export const LENGTH_OPTIONS: Option[] = [
  { value: 'short', label: 'Short', description: 'Above the ear' },
  { value: 'shoulder', label: 'Shoulder length' },
  { value: 'bra-back', label: 'Bra-back length' },
  { value: 'waist', label: 'Waist length' },
  { value: 'other', label: 'Something else', description: 'Tell us in the notes' },
]

export const TEXTURE_OPTIONS: { value: HairTexture; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'curly', label: 'Curly' },
  { value: 'coily', label: 'Coily' },
  { value: 'kinky', label: 'Kinky / 4C' },
]

export const COLOUR_OPTIONS: Option[] = [
  { value: 'natural_black', label: 'Natural black' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'dyed', label: 'Dyed — current shade' },
  { value: 'blonde', label: 'Blonde' },
  { value: 'brunette', label: 'Brunette' },
  { value: 'red', label: 'Red' },
  { value: 'grey', label: 'Grey / silver' },
  { value: 'bleached', label: 'Bleached' },
]

export const GOAL_OPTIONS: Option[] = [
  { value: 'growth', label: 'Length & growth' },
  { value: 'protective_style', label: 'A protective style' },
  { value: 'colour_change', label: 'A colour change' },
  { value: 'damage_repair', label: 'Damage repair' },
  { value: 'length', label: 'More length' },
  { value: 'definition', label: 'Definition & shine' },
  { value: 'treatment', label: 'A treatment' },
]

export const SCALP_OPTIONS: Option[] = [
  { value: 'dandruff', label: 'Dandruff' },
  { value: 'dry_scalp', label: 'Dry scalp' },
  { value: 'sensitivity', label: 'Sensitivity' },
  { value: 'alopecia', label: 'Alopecia' },
  { value: 'eczema', label: 'Eczema / psoriasis' },
  { value: 'none', label: 'None of these' },
]

export const TREATMENT_OPTIONS: Option[] = [
  { value: 'relaxer', label: 'Relaxer' },
  { value: 'colour', label: 'Colour / bleach' },
  { value: 'extensions', label: 'Extensions added before' },
  { value: 'braids', label: 'Braids or twists' },
  { value: 'none', label: 'Nothing recently' },
]

/** Human label for a stored slug, falling back to a readable form of the slug. */
export function optionLabel(options: Option[], value?: string | null): string {
  if (!value) return '—'
  const match = options.find((option) => option.value === value)
  if (match) return match.label
  return value
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase())
}

/** Same, but joins several values into one line for the review summary. */
export function optionLabels(options: Option[], values?: string[] | null): string {
  if (!values || values.length === 0) return '—'
  return values.map((value) => optionLabel(options, value)).join(', ')
}

export function textureLabel(value?: HairTexture | '' | null): string {
  if (!value) return '—'
  return optionLabel(
    TEXTURE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    value,
  )
}
