import { Link } from 'react-router-dom'
import { Info, Sparkles } from 'lucide-react'

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
import type { RequirementDraft } from '@/types'
import { ReferenceUploader } from './ReferenceUploader'
import {
  COLOUR_OPTIONS,
  GOAL_OPTIONS,
  LENGTH_OPTIONS,
  SCALP_OPTIONS,
  TEXTURE_OPTIONS,
  TREATMENT_OPTIONS,
} from './requirementOptions'
import {
  MAX_IMAGES,
  type DraftImage,
  type ImageRejection,
} from './useRequirementDraft'

export interface RequirementStepProps {
  draft: RequirementDraft
  update: (patch: Partial<RequirementDraft>) => void
  toggleGoal: (value: string) => void
  toggleScalpCondition: (value: string) => void
  setAllergies: (value: string) => void
  images: DraftImage[]
  onAddImages: (files: File[]) => ImageRejection[]
  onRemoveImage: (id: string) => void
  isAuthenticated: boolean
  /** `pathname + search` of the wizard, so sign-up can return the customer to it. */
  signUpRedirect: string
  /** Set when the customer tried to continue without a desired style. */
  styleError?: string
}

/**
 * The requirements form — the thing that makes this studio different.
 *
 * It reads as a conversation rather than a checkout field list: what you have
 * now, what you want, why, and anything your stylist must know before touching
 * your hair. Everything except the desired style is optional, because a customer
 * who does not know their texture should not be blocked from booking.
 */
export function RequirementStep({
  draft,
  update,
  toggleGoal,
  toggleScalpCondition,
  setAllergies,
  images,
  onAddImages,
  onRemoveImage,
  isAuthenticated,
  signUpRedirect,
  styleError,
}: RequirementStepProps) {
  const desiredStyleError =
    styleError && !draft.desired_style?.trim()
      ? 'Tell us the style you want — one line is enough.'
      : undefined

  return (
    <div className="space-y-10">
      {!isAuthenticated && (
        <Alert
          variant="info"
          title="Create an account to finish this booking"
          action={
            <ButtonLink to={`/auth/sign-up?redirect=${encodeURIComponent(signUpRedirect)}`} />
          }
        >
          We keep your requirement on your profile so your stylist can read it before you arrive,
          and so you can reschedule or cancel without phoning us. Everything you have entered is
          kept —{' '}
          <Link
            to={`/auth/sign-up?redirect=${encodeURIComponent(signUpRedirect)}`}
            className="font-medium underline underline-offset-4"
          >
            create an account
          </Link>{' '}
          and you will come straight back here.
        </Alert>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Where you are now                                                    */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="space-y-6">
        <legend className="sr-only">Your hair today</legend>

        <div>
          <Question
            label="How long is your hair right now?"
            hint="An estimate is fine — we measure properly on the day."
          >
            <RadioCards
              name="current-length"
              aria-label="Current length"
              columns={2}
              value={draft.current_length}
              onChange={(value) => update({ current_length: value })}
              options={LENGTH_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                description: option.description,
              }))}
            />
          </Question>
        </div>

        <div>
          <Question label="What is your natural texture?">
            <RadioCards
              name="current-texture"
              aria-label="Natural texture"
              columns={3}
              value={draft.current_texture}
              onChange={(value) => update({ current_texture: value })}
              options={TEXTURE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Question>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Current colour"
            htmlFor="req-current-colour"
            hint="If you are unsure, leave it blank."
          >
            <Select
              id="req-current-colour"
              value={draft.current_colour ?? ''}
              onChange={(event) => update({ current_colour: event.target.value || undefined })}
              placeholder="Prefer not to say"
              options={COLOUR_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Field>

          <Field label="Last chemical treatment" htmlFor="req-last-treatment">
            <Select
              id="req-last-treatment"
              value={draft.last_treatment ?? ''}
              onChange={(event) => update({ last_treatment: event.target.value || undefined })}
              placeholder="Prefer not to say"
              options={TREATMENT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Field>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* Where you are going                                                  */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="space-y-6 border-t border-line pt-10">
        <legend className="sr-only">What you want</legend>

        <div>
          <Question
            label="What would you like done?"
            required
            hint="The more specific you are, the closer the first result."
            error={desiredStyleError}
          >
            <Textarea
              id="req-desired-style"
              rows={3}
              required
              value={draft.desired_style ?? ''}
              invalid={Boolean(desiredStyleError)}
              onChange={(event) => update({ desired_style: event.target.value })}
              placeholder="e.g. Shoulder-length knotless braids in 4C, middle part, curly braid out"
            />
          </Question>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Desired colour"
            htmlFor="req-desired-colour"
            hint="Optional — shade name, tone or a photo reference."
          >
            <Input
              id="req-desired-colour"
              value={draft.desired_colour ?? ''}
              onChange={(event) => update({ desired_colour: event.target.value || undefined })}
              placeholder="e.g. warm chestnut"
            />
          </Field>

          <Field label="Desired length" htmlFor="req-desired-length" hint="Optional.">
            <Input
              id="req-desired-length"
              value={draft.desired_length ?? ''}
              onChange={(event) => update({ desired_length: event.target.value || undefined })}
              placeholder="e.g. bra-back length"
            />
          </Field>
        </div>

        <div>
          <Question
            label="What matters most to you?"
            hint="Pick as many as you like — this shapes what we recommend."
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {GOAL_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className="rounded-md border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-line-strong"
                >
                  <Checkbox
                    label={option.label}
                    checked={draft.hair_goals?.includes(option.value) ?? false}
                    onChange={() => toggleGoal(option.value)}
                  />
                </div>
              ))}
            </div>
          </Question>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* Health & safety                                                      */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="space-y-6 border-t border-line pt-10">
        <legend className="sr-only">Health and safety</legend>

        <div>
          <p className="mb-2.5 flex items-center gap-2 text-[0.8125rem] font-medium text-ink-soft">
            <Info className="size-4 text-bronze" aria-hidden />
            Anything we must know before we start
          </p>

          <div className="grid gap-5">
            <Field
              label="Allergies or sensitivities"
              htmlFor="req-allergies"
              hint="Comma separated. Leave blank if none."
            >
              <Input
                id="req-allergies"
                value={(draft.allergies ?? []).join(', ')}
                onChange={(event) => setAllergies(event.target.value)}
                placeholder="e.g. latex, keratin, peanuts"
              />
            </Field>

            <div>
              <Question label="Any scalp conditions?">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SCALP_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className="rounded-md border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <Checkbox
                        label={option.label}
                        checked={draft.scalp_conditions?.includes(option.value) ?? false}
                        onChange={() => toggleScalpCondition(option.value)}
                      />
                    </div>
                  ))}
                </div>
              </Question>
            </div>

            <Field
              label="Medication on your scalp"
              htmlFor="req-medications"
              hint="Optional — retinoids, topical steroids, anything active."
            >
              <Input
                id="req-medications"
                value={draft.medications ?? ''}
                onChange={(event) => update({ medications: event.target.value || undefined })}
                placeholder="e.g. tretinoin, used twice weekly"
              />
            </Field>

            <Field
              label="Accessibility needs"
              htmlFor="req-accessibility"
              hint="Optional — so we can have everything ready when you arrive."
            >
              <Input
                id="req-accessibility"
                value={draft.accessibility_needs ?? ''}
                onChange={(event) =>
                  update({ accessibility_needs: event.target.value || undefined })
                }
                placeholder="e.g. step-free access, seated service"
              />
            </Field>
          </div>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* References + budget                                                  */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="space-y-6 border-t border-line pt-10">
        <legend className="sr-only">References and budget</legend>

        <div>
          <Question
            label="Reference images"
            hint={`Up to ${MAX_IMAGES}. The single most useful thing you can do — show the result you have in mind.`}
          >
            <ReferenceUploader
              images={images}
              onAdd={onAddImages}
              onRemove={onRemoveImage}
            />
          </Question>
        </div>

        <div>
          <Question label="Anything else?">
            <div className="rounded-md border border-line bg-sand/40 p-4">
              <Textarea
                id="req-inspiration-notes"
                rows={4}
                value={draft.inspiration_notes ?? ''}
                onChange={(event) => update({ inspiration_notes: event.target.value })}
                placeholder="Parting, tension, how much you want to be able to style it at home, a braid you saw last week…"
              />
            </div>
          </Question>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Budget you are working with"
            htmlFor="req-budget-min"
            hint="Optional. A range helps us suggest the closest option."
          >
            <Input
              id="req-budget-min"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={draft.budget_min ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                const parsed = Number(raw)
                update({ budget_min: raw === '' ? undefined : parsed })
              }}
              placeholder="₦ 40,000"
            />
          </Field>

          <Field label="Up to" htmlFor="req-budget-max">
            <Input
              id="req-budget-max"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={draft.budget_max ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                const parsed = Number(raw)
                update({ budget_max: raw === '' ? undefined : parsed })
              }}
              placeholder="₦ 90,000"
            />
          </Field>
        </div>

        <div className="rounded-md border border-line bg-sand/40 p-4">
          <Switch
            checked={draft.is_flexible_on_date ?? false}
            onCheckedChange={(checked) => update({ is_flexible_on_date: checked })}
            label="My date is flexible — move me earlier or later if it gets me a better slot"
          />
        </div>
      </fieldset>

      <p className="flex items-start gap-2.5 rounded-md border border-line bg-sand/40 p-4 text-xs leading-relaxed text-muted">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
        This form goes straight to your stylist. They will review it before you arrive and come
        back with any questions, so nothing is decided in the chair on the day.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * `Field` renders a `<label for>`, which is wrong for radio groups and checkbox
 * sets. This pairs the prompt with a `<fieldset>/<legend>` instead.
 */
function Question({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-1 text-[0.8125rem] font-medium text-ink-soft">
        {label}
        {required && (
          <span className="text-clay" aria-hidden>
            *
          </span>
        )}
      </legend>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </fieldset>
  )
}

/** Small internal link-button so the auth prompt can offer a sign-up CTA. */
function ButtonLink({ to }: { to: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={to}>Create account</Link>
    </Button>
  )
}
