import { forwardRef, useId } from 'react'
import { AlertCircle, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn(
        'block text-[0.8125rem] font-medium text-ink-soft',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-1 text-clay" aria-hidden>
          *
        </span>
      )}
    </label>
  )
})

// ---------------------------------------------------------------------------
// Field — label, control, hint and error wired together for a11y
// ---------------------------------------------------------------------------
export interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  leadingIcon?: React.ReactNode
  trailingSlot?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leadingIcon, trailingSlot, ...props },
  ref,
) {
  const field = cn(
    'w-full rounded-md border bg-surface text-sm text-ink',
    'placeholder:text-faint',
    'transition-colors duration-200',
    'disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted',
    'read-only:bg-sand',
    'h-11 px-3.5',
    invalid
      ? 'border-danger focus:border-danger'
      : 'border-line-strong hover:border-muted/50 focus:border-bronze',
    leadingIcon && 'pl-10',
    trailingSlot && 'pr-10',
    className,
  )

  if (!leadingIcon && !trailingSlot) {
    return <input ref={ref} className={field} aria-invalid={invalid || undefined} {...props} />
  }

  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted [&_svg]:size-4">
          {leadingIcon}
        </span>
      )}
      <input ref={ref} className={field} aria-invalid={invalid || undefined} {...props} />
      {trailingSlot && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted">{trailingSlot}</span>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink',
        'placeholder:text-faint transition-colors duration-200 resize-y',
        'disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted',
        invalid
          ? 'border-danger focus:border-danger'
          : 'border-line-strong hover:border-muted/50 focus:border-bronze',
        className,
      )}
      {...props}
    />
  )
})

// ---------------------------------------------------------------------------
// Select — a styled native control, for reliability and mobile-native UX
// ---------------------------------------------------------------------------
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  options?: { value: string; label: string; disabled?: boolean }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, options, placeholder, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full appearance-none rounded-md border bg-surface pl-3.5 pr-10 text-sm text-ink',
          'transition-colors duration-200',
          'disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted',
          invalid
            ? 'border-danger focus:border-danger'
            : 'border-line-strong hover:border-muted/50 focus:border-bronze',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode
  description?: string
  invalid?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, invalid, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  const control = (
    <span className="relative inline-flex size-[1.125rem] shrink-0 items-center justify-center">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-invalid={invalid || undefined}
        className={cn(
          'peer size-[1.125rem] cursor-pointer appearance-none rounded-[0.25rem] border bg-surface',
          'transition-all duration-150',
          'checked:border-bronze checked:bg-bronze',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute size-3 scale-0 text-white transition-transform duration-150 peer-checked:scale-100"
        strokeWidth={3}
        aria-hidden
      />
    </span>
  )

  if (!label) return control

  return (
    <div className="flex items-start gap-2.5">
      {control}
      <div className="min-w-0 flex-1">
        <label
          htmlFor={inputId}
          className="cursor-pointer select-none text-sm leading-snug text-ink"
        >
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Radio group — card-style options, used heavily in the booking flow
// ---------------------------------------------------------------------------
export interface RadioOption<T extends string = string> {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export interface RadioCardsProps<T extends string = string> {
  options: RadioOption<T>[]
  value?: T
  onChange?: (value: T) => void
  name: string
  columns?: 1 | 2 | 3
  className?: string
  'aria-label'?: string
}

export function RadioCards<T extends string = string>({
  options,
  value,
  onChange,
  name,
  columns = 1,
  className,
  ...props
}: RadioCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={props['aria-label'] ?? name}
      className={cn(
        'grid gap-2.5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {options.map((option) => {
        const checked = value === option.value
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-all duration-150',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bronze',
              checked
                ? 'border-bronze bg-bronze/[0.06] shadow-xs'
                : 'border-line bg-surface hover:border-line-strong hover:bg-sand/40',
              option.disabled && 'cursor-not-allowed opacity-50 hover:border-line hover:bg-surface',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                checked ? 'border-bronze' : 'border-line-strong',
              )}
              aria-hidden
            >
              {checked && <span className="size-2 rounded-full bg-bronze" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------
export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  label?: string
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, checked = false, onCheckedChange, label, disabled, ...props },
  ref,
) {
  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-bronze' : 'bg-line-strong',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'inline-block size-[1.125rem] transform rounded-full bg-white shadow-xs transition-transform duration-200',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.1875rem]',
        )}
      />
    </button>
  )

  if (!label) return control

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-ink">{label}</span>
      {control}
    </div>
  )
})
