import { getSupabase } from '@/lib/supabase/client'
import { ApiError } from '@/lib/supabase/errors'
import { rpc, select } from './db'
import type {
  ApplicationEvent,
  ApplicationStatus,
  Job,
  JobApplication,
} from '@/types'

/**
 * Recruitment client.
 *
 * Vacancies are public. Applications can be submitted without an account; when
 * one exists, `applicant_id` links the application to the account so it shows up
 * in "My applications".
 */

// ---------------------------------------------------------------------------
// Vacancies
// ---------------------------------------------------------------------------
export interface JobFilters {
  department?: string
  search?: string
  employmentType?: string
  limit?: number
}

export async function listJobs(filters: JobFilters = {}): Promise<Job[]> {
  let rows = await select<Job>('jobs', {
    filters: { status: 'open' },
    order: { column: 'published_at', ascending: false },
  })

  if (filters.department) {
    rows = rows.filter((j) => j.department === filters.department)
  }
  if (filters.employmentType) {
    rows = rows.filter((j) => j.employment_type === filters.employmentType)
  }
  if (filters.search) {
    const term = filters.search.toLowerCase()
    rows = rows.filter(
      (j) =>
        j.title.toLowerCase().includes(term) ||
        j.summary.toLowerCase().includes(term) ||
        (j.department ?? '').toLowerCase().includes(term),
    )
  }

  rows.sort(
    (a, b) =>
      Number(b.is_featured) - Number(a.is_featured) || a.title.localeCompare(b.title),
  )

  return filters.limit ? rows.slice(0, filters.limit) : rows
}

export async function getJobBySlug(slug: string): Promise<Job | null> {
  const rows = await select<Job>('jobs', {
    filters: { slug, status: 'open' },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function getJobDepartments(): Promise<string[]> {
  const rows = await select<Job>('jobs', { select: 'department', filters: { status: 'open' } })
  return [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[]
}

export interface JobWithCounts extends Job {
  application_count: number
}

export async function getJobWithCounts(slug: string): Promise<JobWithCounts | null> {
  const job = await getJobBySlug(slug)
  if (!job) return null

  // Counts are approximate and advisory; the real list lives behind /admin.
  const rows = await select<{ status: ApplicationStatus }>('job_applications', {
    select: 'status',
    filters: { job_id: job.id },
  })

  return { ...job, application_count: rows.length }
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
export interface SubmitApplicationInput {
  jobId: string
  fullName: string
  email: string
  phone?: string
  location?: string
  coverLetter?: string
  portfolioUrl?: string
  portfolioUrls?: string[]
  cvPath?: string
  cvFileName?: string
  cvBytes?: number
  answers: Record<string, string>
  experienceYears?: number
  consentContact: boolean
}

export async function submitApplication(input: SubmitApplicationInput): Promise<JobApplication> {
  const payload = {
    job_id: input.jobId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone ?? '',
    location: input.location ?? '',
    cover_letter: input.coverLetter ?? '',
    portfolio_url: input.portfolioUrl ?? '',
    portfolio_urls: input.portfolioUrls ?? [],
    cv_path: input.cvPath ?? '',
    cv_file_name: input.cvFileName ?? '',
    cv_bytes: input.cvBytes ?? 0,
    answers: input.answers,
    experience_years: input.experienceYears ?? null,
    consent_contact: input.consentContact,
  }

  return rpc<JobApplication>('fn_submit_application', { p_payload: payload })
}

/** Applications the signed-in candidate has submitted. */
export async function listMyApplications(userId: string): Promise<JobApplication[]> {
  const applications = await select<JobApplication>('job_applications', {
    filters: { applicant_id: userId },
    order: { column: 'submitted_at', ascending: false },
  })

  if (applications.length === 0) return []

  const jobs = await select<Job>('jobs', {
    select: 'id, slug, title, department, status',
    filters: { id: { in: [...new Set(applications.map((a) => a.job_id))] } },
  })
  const byId = new Map(jobs.map((j) => [j.id, j]))

  return applications.map((a) => ({ ...a, job: byId.get(a.job_id) ?? null })) as (JobApplication & {
    job: Job | null
  })[]
}

export async function hasApplied(jobId: string, email: string): Promise<boolean> {
  const rows = await select<{ id: string }>('job_applications', {
    select: 'id',
    filters: { job_id: jobId, email: email.toLowerCase() },
    range: { from: 0, to: 1 },
  })
  return rows.length > 0
}

export async function getApplication(id: string): Promise<JobApplication | null> {
  const rows = await select<JobApplication>('job_applications', {
    filters: { id },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function listApplicationEvents(
  applicationId: string,
): Promise<ApplicationEvent[]> {
  return select<ApplicationEvent>('application_events', {
    filters: { application_id: applicationId },
    order: { column: 'created_at', ascending: true },
  })
}

/**
 * A candidate may withdraw their own application. Authorisation is decided by
 * `fn_withdraw_application`, which accepts either `applicant_id` or a matching
 * profile email — applicants often apply before creating an account.
 */
export async function withdrawApplication(id: string): Promise<JobApplication> {
  return rpc<JobApplication>('fn_withdraw_application', { p_application_id: id })
}

// ---------------------------------------------------------------------------
// CV upload
// ---------------------------------------------------------------------------
const APPLICATIONS_BUCKET = 'applications'
const MAX_CV_BYTES = 10 * 1024 * 1024
const ACCEPTED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export interface CvUpload {
  path: string
  fileName: string
  bytes: number
}

/**
 * Upload a CV to the private `applications` bucket. Guests upload to a random
 * folder (they can never read it back; staff deliver it by email) — signed-in
 * candidates upload under their user id and keep read access.
 */
export async function uploadCv(file: File, userId?: string | null): Promise<CvUpload> {
  if (file.size > MAX_CV_BYTES) {
    throw new ApiError('Your CV must be smaller than 10 MB.')
  }
  if (file.type && !ACCEPTED_CV_TYPES.includes(file.type)) {
    throw new ApiError('Please upload a PDF or Word document.')
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const folder = userId ?? `guest-${crypto.randomUUID()}`
  const path = `${folder}/${crypto.randomUUID()}.${extension}`

  const { error } = await getSupabase().storage
    .from(APPLICATIONS_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/pdf',
      upsert: false,
    })

  if (error) throw new ApiError(error.message)
  return { path, fileName: file.name, bytes: file.size }
}

/** Signed, short-lived download link for a stored CV (staff or owner). */
export async function getCvDownloadUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage
    .from(APPLICATIONS_BUCKET)
    .createSignedUrl(path, 60 * 10)
  if (error) throw new ApiError(error.message)
  return data.signedUrl
}

