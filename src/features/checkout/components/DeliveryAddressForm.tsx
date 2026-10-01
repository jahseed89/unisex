import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { MapPin } from 'lucide-react'

import { Field, Input, Select } from '@/components/ui'
import { DELIVERABLE_STATE, NIGERIAN_STATES, type CheckoutValues } from './schema'

/**
 * Lagos delivery address.
 *
 * The fields are registered on the parent form so one submission carries the
 * whole checkout; this component only lays them out and surfaces the zod
 * messages.
 */
export function DeliveryAddressForm({
  register,
  errors,
  className,
}: {
  register: UseFormRegister<CheckoutValues>
  errors: FieldErrors<CheckoutValues>
  className?: string
}) {
  const addressErrors = errors.address

  return (
    <div className={className}>
      <p className="mb-4 flex items-start gap-2 text-sm leading-relaxed text-muted">
        <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
        We deliver within Lagos only, the next working day. Outside Lagos, choose pick-up or message us
        on WhatsApp and we will look for a courier.
      </p>

      <div className="space-y-4">
        <Field label="Address" htmlFor="address-line1" required error={addressErrors?.line1?.message}>
          <Input
            id="address-line1"
            autoComplete="address-line1"
            placeholder="12b Bourdillon Road"
            invalid={Boolean(addressErrors?.line1)}
            {...register('address.line1')}
          />
        </Field>

        <Field
          label="Apartment, floor or block"
          htmlFor="address-line2"
          hint="Optional, but it helps the rider find you."
          error={addressErrors?.line2?.message}
        >
          <Input
            id="address-line2"
            autoComplete="address-line2"
            placeholder="3rd floor, green gate"
            {...register('address.line2')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Area / city"
            htmlFor="address-city"
            required
            error={addressErrors?.city?.message}
          >
            <Input
              id="address-city"
              autoComplete="address-level2"
              placeholder="Victoria Island"
              invalid={Boolean(addressErrors?.city)}
              {...register('address.city')}
            />
          </Field>

          <Field label="State" htmlFor="address-state" required error={addressErrors?.state?.message}>
            <Select
              id="address-state"
              invalid={Boolean(addressErrors?.state)}
              options={NIGERIAN_STATES.map((state) => ({
                value: state.value,
                label:
                  state.value === DELIVERABLE_STATE ? state.label : `${state.label} — coming soon`,
                disabled: state.value !== DELIVERABLE_STATE,
              }))}
              {...register('address.state')}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Landmark"
            htmlFor="address-landmark"
            hint="Optional — the bus stop, junction or mall."
            error={addressErrors?.landmark?.message}
          >
            <Input
              id="address-landmark"
              placeholder="Opposite the red roof bakery"
              {...register('address.landmark')}
            />
          </Field>

          <Field
            label="Phone for the rider"
            htmlFor="address-phone"
            required
            error={addressErrors?.phone?.message}
          >
            <Input
              id="address-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0803 000 0000"
              invalid={Boolean(addressErrors?.phone)}
              {...register('address.phone')}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
