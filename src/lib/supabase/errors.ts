import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Normalises every failure the data layer can produce into one shape, so UI code
 * never has to branch on PostgREST vs RPC vs network vs RLS.
 */
export class ApiError extends Error {
  readonly code?: string
  readonly detail?: string
  readonly hint?: string
  readonly status?: number

  constructor(
    message: string,
    options: { code?: string; detail?: string; hint?: string; status?: number } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.detail = options.detail
    this.hint = options.hint
    this.status = options.status
  }

  static fromPostgrest(error: PostgrestError): ApiError {
    return new ApiError(error.message || 'Database request failed', {
      code: error.code,
      detail: error.details,
      hint: error.hint,
    })
  }

  static fromPostgrestLike(error: unknown): ApiError {
    if (error instanceof ApiError) return error
    if (error instanceof Error) return new ApiError(error.message)
    return new ApiError('Unexpected database error')
  }

  /** True when the caller simply needs to sign in or refresh their session. */
  get isAuthError(): boolean {
    return this.code === 'PGRST301' || /auth|jwt|session/i.test(this.message)
  }

  /**
   * True for the two error classes that are part of normal operation and should
   * render as an inline, recoverable message rather than a toast.
   */
  get isExpected(): boolean {
    return (
      this.code === '23505' || // unique_violation
      this.code === '23503' || // foreign_key_violation
      this.code === '23514' || // check_violation
      this.code === 'P0001' || // raise_exception
      this.code === 'P0002' || // no_data_found
      this.code === '42501' // insufficient_privilege
    )
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error && typeof error === 'object' && 'message' in error && 'code' in error) {
    return ApiError.fromPostgrest(error as PostgrestError)
  }
  return ApiError.fromPostgrestLike(error)
}

/** True when a value is an {@link ApiError}. Narrows `unknown` in catch blocks. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/** A single, user-facing sentence for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const apiError = toApiError(error)
  if (!apiError.message) return fallback
  // Postgres constraint names leak internals; keep messages client-safe.
  return apiError.message
    .replace(/^violates (foreign key|check|not-null) constraint "[\w_]+"$/i, 'That change is not allowed.')
    .replace(/^duplicate key value violates unique constraint "[\w_]+"$/i, 'That already exists.')
}
