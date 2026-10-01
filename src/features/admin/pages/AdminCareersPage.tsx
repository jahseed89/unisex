import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowUpRight, Briefcase, Plus, Users, X } from 'lucide-react'

import { qk, saveJob } from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  ChipRow,
  Panel,
  SaveStatus,
  StringListEditor,
  TabPanel,
  Tabs,
} from '../components/adminKit'
import type { SaveState } from '../components/adminKit'
import {
  listApplicationStatusCounts,
  listJobsAdminDetailed,
} from '../components/adminReads'
import type { JobAdmin } from '../components/adminReads'
import { numberOr, numberOrNull, toInputValue } from '../components/adminFormat'
import { errorMessage } from '@/lib/supabase/errors'
import { formatDate, formatNaira, humanise, slugify } from '@/lib/utils/format'
import type {
  ApplicationStatus,
  EmploymentType,
  JobStatus,
  ScreeningQuestion,
} from '@/types'

/**
 * Vacancy administration.
 *
 * `filled_count` is owned by the database — `fn_set_application_status` closes a
 * vacancy automatically once an applicant is marked hired — so this screen shows
 * the progress rather than offering a field that would fight the trigger.
 */

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'apprenticeship', label: 'Apprenticeship' },
  { value: 'freelance', label: 'Freelance' },
]

const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'draft', label: 'Draft — not published' },
  { value: 'open', label: 'Open — accepting applications' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

const QUESTION_TYPES: ScreeningQuestion['type'][] = [
  'text',
  'textarea',
  'email',
  'tel',
  'url',
  'date',
  'number',
  'select',
]

const PIPELINE: ApplicationStatus[] = [
  'submitted',
  'screening',
  'shortlisted',
  'interview_scheduled',
  'interviewed',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]

interface QuestionDraft {
  key: string
  label: string
  type: ScreeningQuestion['type']
  required: boolean
}

interface JobDraft {
  id?: string
  title: string
  slug: string
  slugTouched: boolean
  department: string
  employmentType: EmploymentType
  summary: string
  description: string
  responsibilities: string[]
  requirements: string[]
  niceToHave: string[]
  benefits: string[]
  salaryMin: string
  salaryMax: string
  isDisclosed: boolean
  openings: string
  minExperience: string
  status: JobStatus
  isFeatured: boolean
  closesAt: string
  questions: QuestionDraft[]
}

const EMPTY_JOB: JobDraft = {
  title: '',
  slug: '',
  slugTouched: false,
  department: '',
  employmentType: 'full_time',
  summary: '',
  description: '',
  responsibilities: [],
  requirements: [],
  niceToHave: [],
  benefits: [],
  salaryMin: '',
  salaryMax: '',
  isDisclosed: true,
  openings: '1',
  minExperience: '',
  status: 'draft',
  isFeatured: false,
  closesAt: '',
  questions: [],
}

export default function AdminCareersPage() {
  const [tab, setTab] = useState('vacancies')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<JobDraft | null>(null)

  const jobsQuery = useQuery({
    queryKey: qk.adminJobs(),
    queryFn: () => listJobsAdminDetailed(status || undefined),
    staleTime: 60_000,
  })

  const countsQuery = useQuery({
    queryKey: qk.adminApplications({ status: 'all' }),
    queryFn: listApplicationStatusCounts,
    staleTime: 60_000,
  })

  const jobs = jobsQuery.data ?? []
  const counts = countsQuery.data ?? {}
  const totalApplications = Object.values(counts).reduce((sum, value) => sum + value, 0)

  return (
    <AdminShell
      eyebrow="Administration"
      title="Careers"
      breadcrumb={[{ label: 'Admin', to: '/admin' }]}
      description="Vacancies live on the public careers page the moment they are published. Applications move through the pipeline separately."
      actions={
        tab === 'vacancies' ? (
          <Button onClick={() => setDraft({ ...EMPTY_JOB })}>
            <Plus aria-hidden />
            New vacancy
          </Button>
        ) : undefined
      }
    >
      <Tabs
        label="Recruitment administration"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'vacancies', label: 'Vacancies', count: jobs.length },
          {
            id: 'applications',
            label: 'Applications',
            count: totalApplications || undefined,
          },
        ]}
      />

      {/* ----------------------------------------------------------------
          Vacancies
      ---------------------------------------------------------------- */}
      <TabPanel id="vacancies" value={tab}>
        <div className="space-y-5">
          <Panel title="Pipeline">
            <p className="text-sm text-muted">
              Where every application currently sits. Counts are live across all vacancies.
            </p>
            <div className="mt-3">
              <ChipRow label="Pipeline stages">
                {PIPELINE.map((value) => (
                  <Link
                    key={value}
                    to={`/admin/careers/applications?status=${value}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line-strong px-3 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:border-ink hover:bg-sand"
                  >
                    {humanise(value)}
                    <span className="tabular-nums text-faint">{counts[value] ?? 0}</span>
                  </Link>
                ))}
              </ChipRow>
            </div>
          </Panel>

          <Panel
            title="Vacancies"
            description={
              jobsQuery.isLoading ? 'Loading vacancies…' : `${jobs.length} in total`
            }
            action={
              <div className="w-44">
                <Select
                  aria-label="Filter vacancies by status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  placeholder="Any status"
                  options={JOB_STATUSES.map((option) => ({
                    value: option.value,
                    label: option.label.split(' — ')[0] ?? option.value,
                  }))}
                />
              </div>
            }
            bodyClassName="p-0"
          >
            <AsyncSection
              isLoading={jobsQuery.isLoading}
              isError={jobsQuery.isError}
              error={jobsQuery.error}
              onRetry={() => void jobsQuery.refetch()}
              isEmpty={jobs.length === 0}
              empty={
                <div className="p-8 text-center">
                  <Briefcase className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
                  <p className="text-sm text-muted">
                    No vacancies yet. Create one and publish it to start receiving applications.
                  </p>
                </div>
              }
              skeleton={<div className="h-64 animate-pulse bg-sand/60" />}
              className="p-5"
            >
              <>
                <div className="hidden lg:block">
                  <Table>
                    <caption className="sr-only">Vacancies</caption>
                    <THead>
                      <tr>
                        <TH scope="col">Role</TH>
                        <TH scope="col">Department</TH>
                        <TH scope="col">Type</TH>
                        <TH scope="col">Filled</TH>
                        <TH scope="col">Salary</TH>
                        <TH scope="col">Published</TH>
                        <TH scope="col">Closes</TH>
                        <TH scope="col">Views</TH>
                        <TH scope="col">Status</TH>
                        <TH scope="col" className="text-right">Actions</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {jobs.map((job) => (
                        <TR key={job.id}>
                          <TD className="max-w-[16rem]">
                            <span className="block truncate font-medium text-ink">{job.title}</span>
                            <span className="block truncate text-xs text-muted">
                              /{job.slug}
                            </span>
                          </TD>
                          <TD className="text-sm">{job.department ?? '—'}</TD>
                          <TD className="text-sm">{humanise(job.employment_type)}</TD>
                          <TD className="min-w-[7rem]">
                            <FilledProgress job={job} />
                          </TD>
                          <TD className="whitespace-nowrap text-sm tabular-nums text-ink">
                            {job.is_disclosed && job.salary_min
                              ? `${formatNaira(job.salary_min, { compact: true })}${
                                  job.salary_max
                                    ? ` – ${formatNaira(job.salary_max, { compact: true })}`
                                    : ''
                                }`
                              : 'Not disclosed'}
                          </TD>
                          <TD className="whitespace-nowrap text-sm">
                            {job.published_at ? formatDate(job.published_at) : '—'}
                          </TD>
                          <TD className="whitespace-nowrap text-sm">
                            {job.closes_at ? formatDate(job.closes_at) : 'Open ended'}
                          </TD>
                          <TD className="text-sm tabular-nums text-muted">{job.views_count}</TD>
                          <TD>
                            <Badge variant={toneForJob(job.status)} size="sm" dot>
                              {humanise(job.status)}
                            </Badge>
                          </TD>
                          <TD>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDraft(toJobDraft(job))}
                              >
                                Edit
                              </Button>
                              <Button asChild variant="ghost" size="sm">
                                <Link
                                  to={`/admin/careers/applications?jobId=${job.id}`}
                                  aria-label={`View applications for ${job.title}`}
                                >
                                  <Users aria-hidden />
                                  Applications
                                </Link>
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>

                <ul className="space-y-3 lg:hidden">
                  {jobs.map((job) => (
                    <li key={job.id} className="rounded-md border border-line px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{job.title}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {job.department ?? 'Studio'} · {humanise(job.employment_type)}
                          </p>
                        </div>
                        <Badge variant={toneForJob(job.status)} size="sm" dot>
                          {humanise(job.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 border-t border-line pt-3">
                        <FilledProgress job={job} />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setDraft(toJobDraft(job))}
                        >
                          Edit
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/careers/applications?jobId=${job.id}`}>
                            Applications
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            </AsyncSection>
          </Panel>
        </div>
      </TabPanel>

      {/* ----------------------------------------------------------------
          Applications tab — a doorway, the pipeline itself lives elsewhere
      ---------------------------------------------------------------- */}
      <TabPanel id="applications" value={tab}>
        <Panel title="Applications">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted">
              {totalApplications} application{totalApplications === 1 ? '' : 's'} on file across{' '}
              {jobs.length} vacancy{jobs.length === 1 ? '' : 'ies'}. Shortlist, schedule interviews
              and record decisions in the pipeline.
            </p>
            <Button asChild>
              <Link to="/admin/careers/applications">
                Open the application pipeline
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          </div>
        </Panel>
      </TabPanel>

      {draft && (
        <JobSheet draft={draft} onClose={() => setDraft(null)} onSaved={() => setDraft(null)} />
      )}
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toneForJob(status: JobStatus): 'success' | 'warning' | 'default' | 'info' {
  if (status === 'open') return 'success'
  if (status === 'draft' || status === 'on_hold') return 'warning'
  if (status === 'closed') return 'info'
  return 'default'
}

function FilledProgress({ job }: { job: JobAdmin }) {
  const percent = Math.min(100, Math.round((job.filled_count / Math.max(1, job.openings)) * 100))
  const full = job.filled_count >= job.openings

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-ink">
          {job.filled_count} / {job.openings}
        </span>
        {full && (
          <span className="font-medium text-success">
            {job.status === 'closed' ? 'Closed' : 'Closing on hire'}
          </span>
        )}
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-pill bg-sand"
        role="img"
        aria-label={`${job.filled_count} of ${job.openings} positions filled`}
      >
        <div
          className={full ? 'h-full rounded-pill bg-success' : 'h-full rounded-pill bg-bronze'}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function toJobDraft(job: JobAdmin): JobDraft {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    slugTouched: true,
    department: job.department ?? '',
    employmentType: job.employment_type,
    summary: job.summary,
    description: job.description,
    responsibilities: job.responsibilities ?? [],
    requirements: job.requirements ?? [],
    niceToHave: job.nice_to_have ?? [],
    benefits: job.benefits ?? [],
    salaryMin: toInputValue(job.salary_min),
    salaryMax: toInputValue(job.salary_max),
    isDisclosed: job.is_disclosed,
    openings: String(job.openings),
    minExperience: toInputValue(job.min_experience_years),
    status: job.status,
    isFeatured: job.is_featured,
    closesAt: job.closes_at ?? '',
    questions: (job.screening_questions ?? []).map((question) => ({
      key: question.key,
      label: question.label,
      type: question.type,
      required: Boolean(question.required),
    })),
  }
}

// ---------------------------------------------------------------------------
// Job sheet
// ---------------------------------------------------------------------------

function JobSheet({
  draft: initial,
  onClose,
  onSaved,
}: {
  draft: JobDraft
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')

  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    setDraft((current) =>
      current.slugTouched ? current : { ...current, slug: slugify(current.title) },
    )
  }, [draft.title])

  const mutation = useMutation({
    mutationFn: () => {
      const questions: ScreeningQuestion[] = draft.questions
        .filter((question) => question.key.trim() && question.label.trim())
        .map((question) => ({
          key: slugify(question.key),
          label: question.label.trim(),
          type: question.type,
          ...(question.required ? { required: true } : {}),
        }))

      return saveJob({
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title.trim(),
        slug: draft.slug || slugify(draft.title),
        department: draft.department.trim() || null,
        employment_type: draft.employmentType,
        summary: draft.summary.trim(),
        description: draft.description.trim(),
        responsibilities: draft.responsibilities,
        requirements: draft.requirements,
        nice_to_have: draft.niceToHave,
        benefits: draft.benefits,
        salary_min: numberOrNull(draft.salaryMin),
        salary_max: numberOrNull(draft.salaryMax),
        is_disclosed: draft.isDisclosed,
        openings: numberOr(draft.openings, 1),
        min_experience_years: numberOrNull(draft.minExperience),
        status: draft.status,
        is_featured: draft.isFeatured,
        closes_at: draft.closesAt ? `${draft.closesAt}T00:00:00` : null,
        screening_questions: questions,
      })
    },
    onSuccess: (job) => {
      setState('saved')
      toast.success(`${job.title} saved.`)
      void queryClient.invalidateQueries({ queryKey: qk.adminJobs() })
      void queryClient.invalidateQueries({ queryKey: qk.jobs() })
      onSaved()
      onClose()
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  const salaryMin = numberOrNull(draft.salaryMin)
  const salaryMax = numberOrNull(draft.salaryMax)
  const salaryInverted = salaryMin !== null && salaryMax !== null && salaryMax < salaryMin
  const invalid = !draft.title.trim() || !draft.summary.trim() || !draft.description.trim()

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" title={draft.id ? 'Edit vacancy' : 'New vacancy'}>
        <SheetHeader className="flex-col items-start gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            {draft.id ? 'Edit vacancy' : 'New vacancy'}
          </h2>
          <p className="text-sm text-muted">
            A vacancy appears on the public careers page as soon as it is open.
          </p>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!invalid && !salaryInverted) mutation.mutate()
          }}
        >
          <SheetBody className="space-y-6">
            <fieldset className="space-y-4">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                The role
              </legend>

              <Field label="Title" htmlFor="job-title" required>
                <Input
                  id="job-title"
                  value={draft.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder="Senior Braids Artist"
                />
              </Field>

              <Field label="Slug" htmlFor="job-slug" required hint="Used in the careers URL.">
                <Input
                  id="job-slug"
                  value={draft.slug}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                      slugTouched: true,
                    }))
                  }
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="job-department" hint="e.g. Braids, Colour, Front of House">
                  <Input
                    id="job-department"
                    value={draft.department}
                    onChange={(event) => set('department', event.target.value)}
                  />
                </Field>
                <Field label="Employment type" htmlFor="job-type">
                  <Select
                    id="job-type"
                    value={draft.employmentType}
                    onChange={(event) =>
                      set('employmentType', event.target.value as EmploymentType)
                    }
                    options={EMPLOYMENT_TYPES.map((option) => ({ ...option }))}
                  />
                </Field>
              </div>

              <Field
                label="Summary"
                htmlFor="job-summary"
                required
                hint="Two or three sentences. This is the teaser on the careers page."
              >
                <Textarea
                  id="job-summary"
                  rows={3}
                  value={draft.summary}
                  onChange={(event) => set('summary', event.target.value)}
                />
              </Field>

              <Field label="Full description" htmlFor="job-description" required hint="Markdown is supported.">
                <Textarea
                  id="job-description"
                  rows={8}
                  value={draft.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              </Field>
            </fieldset>

            <fieldset className="space-y-5 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                The detail
              </legend>

              <StringListEditor
                legend="Responsibilities"
                values={draft.responsibilities}
                onChange={(next) => set('responsibilities', next)}
                placeholder="Consult with every client before you start"
                max={15}
              />
              <StringListEditor
                legend="Requirements"
                values={draft.requirements}
                onChange={(next) => set('requirements', next)}
                placeholder="3+ years braiding experience"
                max={15}
              />
              <StringListEditor
                legend="Nice to have"
                values={draft.niceToHave}
                onChange={(next) => set('niceToHave', next)}
                placeholder="Fluent in Yoruba"
                max={15}
              />
              <StringListEditor
                legend="Benefits"
                values={draft.benefits}
                onChange={(next) => set('benefits', next)}
                placeholder="Product commission"
                max={15}
              />
            </fieldset>

            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Terms
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Salary from" htmlFor="job-salary-min" hint="Monthly, in naira.">
                  <Input
                    id="job-salary-min"
                    type="number"
                    min={0}
                    step={50000}
                    value={draft.salaryMin}
                    onChange={(event) => set('salaryMin', event.target.value)}
                  />
                </Field>
                <Field
                  label="Salary to"
                  htmlFor="job-salary-max"
                  error={salaryInverted ? 'Must be at least the lower figure.' : undefined}
                >
                  <Input
                    id="job-salary-max"
                    type="number"
                    min={0}
                    step={50000}
                    invalid={salaryInverted}
                    value={draft.salaryMax}
                    onChange={(event) => set('salaryMax', event.target.value)}
                  />
                </Field>
              </div>

              <Checkbox
                id="job-disclosed"
                checked={draft.isDisclosed}
                onChange={(event) => set('isDisclosed', event.target.checked)}
                label="Publish the salary range"
                description="When off, the page says “competitive” and the figures are hidden."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Openings"
                  htmlFor="job-openings"
                  required
                  hint="Filled automatically as candidates are hired."
                >
                  <Input
                    id="job-openings"
                    type="number"
                    min={1}
                    value={draft.openings}
                    onChange={(event) => set('openings', event.target.value)}
                  />
                </Field>
                <Field label="Minimum experience (years)" htmlFor="job-experience">
                  <Input
                    id="job-experience"
                    type="number"
                    min={0}
                    step={0.5}
                    value={draft.minExperience}
                    onChange={(event) => set('minExperience', event.target.value)}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Screening questions
              </legend>
              <p className="text-xs leading-relaxed text-muted">
                Asked on the application form, and shown on the application detail screen. The key is
                what the answer is stored against.
              </p>

              {draft.questions.map((question, index) => (
                <div
                  key={index}
                  className="rounded-md border border-line p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label="Key" htmlFor={`question-key-${index}`}>
                      <Input
                        id={`question-key-${index}`}
                        value={question.key}
                        placeholder="salary_expectation"
                        onChange={(event) =>
                          set(
                            'questions',
                            draft.questions.map((item, i) =>
                              i === index ? { ...item, key: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Label" htmlFor={`question-label-${index}`}>
                      <Input
                        id={`question-label-${index}`}
                        value={question.label}
                        placeholder="What salary are you expecting?"
                        onChange={(event) =>
                          set(
                            'questions',
                            draft.questions.map((item, i) =>
                              i === index ? { ...item, label: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Remove question ${index + 1}`}
                        onClick={() =>
                          set(
                            'questions',
                            draft.questions.filter((_item, i) => i !== index),
                          )
                        }
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Field label="Answer type" htmlFor={`question-type-${index}`} className="w-44">
                      <Select
                        id={`question-type-${index}`}
                        value={question.type}
                        onChange={(event) =>
                          set(
                            'questions',
                            draft.questions.map((item, i) =>
                              i === index
                                ? { ...item, type: event.target.value as ScreeningQuestion['type'] }
                                : item,
                            ),
                          )
                        }
                        options={QUESTION_TYPES.map((type) => ({ value: type, label: type }))}
                      />
                    </Field>
                    <Checkbox
                      id={`question-required-${index}`}
                      checked={question.required}
                      onChange={(event) =>
                        set(
                          'questions',
                          draft.questions.map((item, i) =>
                            i === index ? { ...item, required: event.target.checked } : item,
                          ),
                        )
                      }
                      label="Required"
                    />
                  </div>
                </div>
              ))}

              <Button
                variant="subtle"
                size="sm"
                onClick={() =>
                  set('questions', [
                    ...draft.questions,
                    { key: '', label: '', type: 'text', required: false },
                  ])
                }
              >
                <Plus aria-hidden />
                Add screening question
              </Button>
            </fieldset>

            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                Publishing
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status" htmlFor="job-status">
                  <Select
                    id="job-status"
                    value={draft.status}
                    onChange={(event) => set('status', event.target.value as JobStatus)}
                    options={JOB_STATUSES.map((option) => ({ ...option }))}
                  />
                </Field>
                <Field
                  label="Closes on"
                  htmlFor="job-closes"
                  hint="Optional. Leave empty for an open-ended vacancy."
                >
                  <Input
                    id="job-closes"
                    type="date"
                    value={draft.closesAt}
                    onChange={(event) => set('closesAt', event.target.value)}
                  />
                </Field>
              </div>

              <div className="rounded-md border border-line px-4 py-3.5">
                <Switch
                  checked={draft.isFeatured}
                  onCheckedChange={(value) => set('isFeatured', value)}
                  label="Featured role"
                  aria-label="Feature this vacancy on the careers page"
                />
              </div>

              {draft.status === 'open' && draft.id && (
                <Alert variant="info">
                  This vacancy is live on the careers page. Changing the status to closed or draft
                  removes it from the public list immediately.
                </Alert>
              )}
            </fieldset>

            <SaveStatus state={state} />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="ml-auto"
              loading={mutation.isPending}
              loadingText="Saving…"
              disabled={invalid || salaryInverted}
            >
              {draft.id ? 'Save vacancy' : 'Create vacancy'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
