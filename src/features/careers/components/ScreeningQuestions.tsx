import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui'
import { FormField } from '@/features/auth/components/FormField'
import type { ScreeningQuestion } from '@/types'

/**
 * Renders a vacancy's `screening_questions` array.
 *
 * The shape is data-driven — `{ key, label, type, required, options }` — so
 * this maps `type` onto the right control and nothing else. `select` falls back
 * to a text input when the question has no `options`, which keeps a
 * misconfigured question answerable rather than unanswerable.
 *
 * Answers live in one `Record<string, string>` owned by the page.
 */
export function ScreeningQuestions({
  questions,
  answers,
  onChange,
  className,
}: {
  questions: ScreeningQuestion[]
  answers: Record<string, string>
  onChange: (key: string, value: string) => void
  className?: string
}) {
  if (questions.length === 0) return null

  return (
    <div className={className}>
      <ol className="space-y-6">
        {questions.map((question, index) => (
          <li key={question.key}>
            <ScreeningField
              question={question}
              index={index + 1}
              value={answers[question.key] ?? ''}
              onChange={(value) => onChange(question.key, value)}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}

function ScreeningField({
  question,
  index,
  value,
  onChange,
}: {
  question: ScreeningQuestion
  index: number
  value: string
  onChange: (value: string) => void
}) {
  const id = `screening-${question.key}`
  const required = Boolean(question.required)
  const label = `${index}. ${question.label}${required ? '' : ' (optional)'}`

  // A yes/no style question is a checkbox, not a select — one tap instead of two.
  if (question.type === 'select' && isYesNo(question)) {
    const checked = value === 'yes'
    return (
      <Checkbox
        id={id}
        checked={checked}
        onChange={(event) => onChange(event.target.checked ? 'yes' : 'no')}
        label={label}
        description={question.placeholder}
      />
    )
  }

  if (question.type === 'textarea') {
    return (
      <FormField
        label={label}
        required={required}
        hint={question.placeholder ?? 'A few sentences is plenty.'}
      >
        <Textarea
          id={id}
          rows={5}
          maxLength={2_000}
          value={value}
          placeholder={question.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormField>
    )
  }

  if (question.type === 'select') {
    return (
      <Field label={label} htmlFor={id} required={required} hint={question.placeholder}>
        <Select
          id={id}
          value={value}
          placeholder="Choose one"
          onChange={(event) => onChange(event.target.value)}
          options={(question.options ?? []).map((option) => ({ value: option, label: option }))}
        />
      </Field>
    )
  }

  const inputType =
    question.type === 'url'
      ? 'url'
      : question.type === 'tel'
        ? 'tel'
        : question.type === 'email'
          ? 'email'
          : question.type === 'number'
            ? 'number'
            : question.type === 'date'
              ? 'date'
              : 'text'

  const inputMode = question.type === 'tel' ? 'tel' : question.type === 'number' ? 'numeric' : undefined

  return (
    <FormField label={label} required={required} hint={question.placeholder}>
      <Input
        id={id}
        type={inputType}
        inputMode={inputMode}
        autoComplete={question.type === 'email' ? 'email' : question.type === 'tel' ? 'tel' : 'off'}
        value={value}
        placeholder={question.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}

/** Yes/no detection, so those render as a checkbox. */
function isYesNo(question: ScreeningQuestion): boolean {
  if (question.options && question.options.length === 2) {
    const normalised = question.options.map((option) => option.toLowerCase())
    return (
      (normalised.includes('yes') && normalised.includes('no')) ||
      (normalised.includes('true') && normalised.includes('false'))
    )
  }
  return false
}
