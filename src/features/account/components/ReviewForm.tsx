import { useState } from 'react'

import { Alert, Button, Field, RatingInput, Textarea } from '@/components/ui'

/**
 * Review form.
 *
 * Plain state rather than react-hook-form: three fields, one mutation, and the
 * page above already owns the success toast. The rating is a radiogroup from the
 * design system, so keyboard users get arrow-key selection for free.
 */
export interface ReviewValues {
  rating: number
  title: string
  body: string
}

const MIN_BODY = 20
const MAX_BODY = 2_000

export function ReviewForm({
  onSubmit,
  isSubmitting,
  error,
  stylistName,
  serviceName,
}: {
  onSubmit: (values: ReviewValues) => void
  isSubmitting: boolean
  error: string | null
  stylistName: string | null
  serviceName: string | null
}) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [touched, setTouched] = useState(false)

  const ratingError = touched && rating === 0 ? 'Choose a star rating.' : undefined
  const bodyError = touched && body.trim().length < MIN_BODY
    ? `Tell us a little more — at least ${MIN_BODY} characters.`
    : undefined
  const valid = rating > 0 && body.trim().length >= MIN_BODY

  const subject = [serviceName, stylistName ? `with ${stylistName}` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <form
      noValidate
      className="mt-4 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (!valid) return
        onSubmit({ rating, title: title.trim(), body: body.trim() })
      }}
    >
      {error && (
        <Alert variant="danger" title="We could not save your review">
          {error}
        </Alert>
      )}

      <div aria-live="polite" className="sr-only">
        {isSubmitting ? 'Sending your review.' : valid ? 'Review ready to send.' : ''}
      </div>

      <RatingInput value={rating} onChange={setRating} label={subject ? `Rate ${subject}` : 'Rating'} />
      {ratingError && (
        <p role="alert" className="text-xs text-danger">
          {ratingError}
        </p>
      )}

      <Field
        label="Headline (optional)"
        htmlFor="review-title"
        hint="A few words that summarise the visit."
      >
        <Textarea
          id="review-title"
          rows={2}
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Exactly the colour I wanted"
        />
      </Field>

      <Field
        label="Your review"
        htmlFor="review-body"
        required
        hint={`${body.trim().length}/${MAX_BODY} characters · at least ${MIN_BODY}.`}
        error={bodyError}
      >
        <Textarea
          id="review-body"
          rows={5}
          maxLength={MAX_BODY}
          value={body}
          invalid={Boolean(bodyError)}
          aria-describedby="review-body-hint"
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="What did the stylist get right? What would you tell a friend? Anything about the salon itself is welcome too."
        />
      </Field>

      <Button type="submit" variant="accent" size="lg" loading={isSubmitting} loadingText="Sending…">
        Publish review
      </Button>

      <p className="text-xs leading-relaxed text-muted">
        Reviews are read before they appear on the site, so yours may take a day or two to show up.
        We publish every rating — the good and the honest.
      </p>
    </form>
  )
}
