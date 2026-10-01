import { z } from 'zod'

/**
 * Checkout form contract.
 *
 * One schema validates the whole flow; each step triggers only the fields it
 * owns, so a customer never sees an error for a section they have not reached.
 * The database re-validates everything inside `fn_checkout` — this exists to
 * catch typos, not to enforce policy.
 */

export const NIGERIAN_STATES: { value: string; label: string }[] = [
  { value: 'Lagos', label: 'Lagos' },
  { value: 'Abia', label: 'Abia' },
  { value: 'Adamawa', label: 'Adamawa' },
  { value: 'Akwa Ibom', label: 'Akwa Ibom' },
  { value: 'Anambra', label: 'Anambra' },
  { value: 'Bauchi', label: 'Bauchi' },
  { value: 'Bayelsa', label: 'Bayelsa' },
  { value: 'Benue', label: 'Benue' },
  { value: 'Borno', label: 'Borno' },
  { value: 'Cross River', label: 'Cross River' },
  { value: 'Delta', label: 'Delta' },
  { value: 'Ebonyi', label: 'Ebonyi' },
  { value: 'Edo', label: 'Edo' },
  { value: 'Ekiti', label: 'Ekiti' },
  { value: 'Enugu', label: 'Enugu' },
  { value: 'FCT — Abuja', label: 'FCT — Abuja' },
  { value: 'Gombe', label: 'Gombe' },
  { value: 'Imo', label: 'Imo' },
  { value: 'Jigawa', label: 'Jigawa' },
  { value: 'Kaduna', label: 'Kaduna' },
  { value: 'Kano', label: 'Kano' },
  { value: 'Katsina', label: 'Katsina' },
  { value: 'Kebbi', label: 'Kebbi' },
  { value: 'Kogi', label: 'Kogi' },
  { value: 'Kwara', label: 'Kwara' },
  { value: 'Nasarawa', label: 'Nasarawa' },
  { value: 'Niger', label: 'Niger' },
  { value: 'Ogun', label: 'Ogun' },
  { value: 'Ondo', label: 'Ondo' },
  { value: 'Osun', label: 'Osun' },
  { value: 'Oyo', label: 'Oyo' },
  { value: 'Plateau', label: 'Plateau' },
  { value: 'Rivers', label: 'Rivers' },
  { value: 'Sokoto', label: 'Sokoto' },
  { value: 'Taraba', label: 'Taraba' },
  { value: 'Yobe', label: 'Yobe' },
  { value: 'Zamfara', label: 'Zamfara' },
]

/** We courier inside Lagos only for now; the rest are listed but not selectable. */
export const DELIVERABLE_STATE = 'Lagos'

const addressSchema = z.object({
  line1: z.string().trim(),
  line2: z.string().trim(),
  city: z.string().trim(),
  state: z.string(),
  landmark: z.string().trim(),
  phone: z.string().trim(),
})

export const checkoutSchema = z
  .object({
    contactName: z.string().trim().min(2, 'Tell us who to hand the order to'),
    contactEmail: z.string().trim().email('That email address does not look right'),
    contactPhone: z
      .string()
      .trim()
      .min(10, 'We need a number the rider or studio can call'),
    fulfilmentType: z.enum(['pickup', 'delivery']),
    locationId: z.string(),
    address: addressSchema,
    notes: z.string().trim().max(400, 'Keep the note under 400 characters'),
    paymentMethod: z.enum(['card', 'transfer']),
  })
  .superRefine((values, ctx) => {
    if (values.fulfilmentType === 'pickup' && !values.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationId'],
        message: 'Choose the studio you will collect from',
      })
    }

    if (values.fulfilmentType === 'delivery') {
      if (values.address.line1.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', 'line1'],
          message: 'Enter the street address',
        })
      }
      if (values.address.city.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', 'city'],
          message: 'Enter your area or city',
        })
      }
      if (values.address.state !== DELIVERABLE_STATE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', 'state'],
          message: 'We deliver within Lagos for now — choose Lagos, or pick up instead',
        })
      }
      if (values.address.phone.replace(/\D/g, '').length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', 'phone'],
          message: 'A number the rider can call on arrival',
        })
      }
    }
  })

export type CheckoutValues = z.infer<typeof checkoutSchema>

export const CHECKOUT_STEPS = [
  { id: 1, label: 'Contact' },
  { id: 2, label: 'Fulfilment' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Pay' },
] as const

/** Which fields a step owns, for step-scoped validation. */
export const STEP_FIELDS: Record<number, (keyof CheckoutValues)[]> = {
  1: ['contactName', 'contactEmail', 'contactPhone'],
  2: ['fulfilmentType', 'locationId', 'address'],
  3: ['notes', 'paymentMethod'],
  4: [],
}

export function defaultCheckoutValues(input: {
  fullName?: string | null
  email?: string | null
  phone?: string | null
  locationId?: string
}): CheckoutValues {
  return {
    contactName: input.fullName ?? '',
    contactEmail: input.email ?? '',
    contactPhone: input.phone ?? '',
    fulfilmentType: 'pickup',
    locationId: input.locationId ?? '',
    address: { line1: '', line2: '', city: '', state: DELIVERABLE_STATE, landmark: '', phone: '' },
    notes: '',
    paymentMethod: 'card',
  }
}
