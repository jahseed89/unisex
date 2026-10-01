import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Search, Users } from 'lucide-react'

import { listApplications, listJobsAdmin, qk } from '@/lib/api'
import {
  Button,
  Field,
  Input,
  Pagination,
  Rating,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  Chip,
  ChipRow,
  EmptyState,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { listApplicationStatusCounts } from '../components/adminReads'
import { formatDateTime, formatRelative, humanise } from '@/lib/utils/format'
import type { ApplicationStatus } from '@/types'

/**
 * The application pipeline.
 *
 * Laid out as a table rather than a kanban board: nine statuses including
 * rejected and withdrawn is too many columns to read side by side at the width a
 * laptop gives us, and the stage chips give the same at-a-glance picture. Every
 * row links to the application, where the move happens.
 */

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

const PAGE_SIZE = 25

export default function AdminApplicationsPage() {
  const [params, setParams] = useSearchParams()

  const jobId = params.get('jobId') ?? ''
  const search = params.get('search') ?? ''
  const statuses = (params.get('status') ?? '').split(',').filter(Boolean)
  const page = Math.max(1, Number(params.get('page')) || 1)

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const jobsQuery = useQuery({
    queryKey: qk.adminJobs(),
    queryFn: () => listJobsAdmin(),
    staleTime: 5 * 60_000,
  })

  const countsQuery = useQuery({
    queryKey: qk.adminApplications({ scope: 'counts' }),
    queryFn: listApplicationStatusCounts,
    staleTime: 60_000,
  })

  const applicationsQuery = useQuery({
    queryKey: qk.adminApplications({
      ...(jobId ? { jobId } : {}),
      ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
      ...(search ? { search } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    queryFn: () =>
      listApplications(
        {
          ...(jobId ? { jobId } : {}),
          ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
          ...(search ? { search } : {}),
        },
        page,
        PAGE_SIZE,
      ),
    staleTime: 30_000,
  })

  const jobs = jobsQuery.data ?? []
  const jobTitle = (id: string) => jobs.find((job) => job.id === id)?.title ?? 'Vacancy'
  const counts = countsQuery.data ?? {}
  const applications = applicationsQuery.data?.data ?? []
  const count = applicationsQuery.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const hasFilters = Boolean(jobId) || Boolean(search) || statuses.length > 0

  const toggleStatus = (status: ApplicationStatus) => {
    const next = statuses.includes(status)
      ? statuses.filter((value) => value !== status)
      : [...statuses, status]
    update({ status: next.join(',') })
  }

  return (
    <AdminShell
      eyebrow="Administration"
      title="Applications"
      breadcrumb={[
        { label: 'Admin', to: '/admin' },
        { label: 'Careers', to: '/admin/careers' },
      ]}
      description="Every candidate on file. Move one through the pipeline from its detail screen, where the CV, screening answers and full history live."
      actions={
        <Button asChild variant="outline">
          <Link to="/admin/careers">Manage vacancies</Link>
        </Button>
      }
    >
      <Panel
        title="Filters"
        action={
          hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Reset
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vacancy" htmlFor="application-job">
              <Select
                id="application-job"
                value={jobId}
                onChange={(event) => update({ jobId: event.target.value })}
                placeholder="Every vacancy"
                options={jobs.map((job) => ({ value: job.id, label: job.title }))}
              />
            </Field>
            <Field label="Name" htmlFor="application-search" hint="Matches the applicant's full name.">
              <Input
                id="application-search"
                type="search"
                value={search}
                placeholder="Adaeze"
                onChange={(event) => update({ search: event.target.value })}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-soft">Stage</p>
            <ChipRow
              label="Application stage"
              clearLabel="All stages"
              onClear={hasFilters ? () => update({ status: '' }) : undefined}
            >
              {PIPELINE.map((status) => (
                <Chip
                  key={status}
                  active={statuses.includes(status)}
                  onClick={() => toggleStatus(status)}
                  count={counts[status] ?? 0}
                >
                  {humanise(status)}
                </Chip>
              ))}
            </ChipRow>
          </div>
        </div>
      </Panel>

      <div className="mt-5">
        <Panel
          title="Pipeline"
          description={
            applicationsQuery.isLoading
              ? 'Loading applications…'
              : `${count} application${count === 1 ? '' : 's'} match`
          }
          bodyClassName="p-0"
        >
          <AsyncSection
            isLoading={applicationsQuery.isLoading}
            isError={applicationsQuery.isError}
            error={applicationsQuery.error}
            onRetry={() => void applicationsQuery.refetch()}
            isEmpty={applications.length === 0}
            empty={
              <div className="p-5">
                <EmptyState
                  icon={hasFilters ? <Search aria-hidden /> : <Users aria-hidden />}
                  title={
                    hasFilters ? 'No applications match these filters' : 'No applications yet'
                  }
                  description={
                    hasFilters
                      ? 'Clear a stage or widen the search to see more.'
                      : 'Applications appear here as soon as somebody applies for a vacancy.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="outline"
                        onClick={() => setParams(new URLSearchParams(), { replace: true })}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link to="/admin/careers">Review vacancies</Link>
                      </Button>
                    )
                  }
                />
              </div>
            }
            skeleton={<div className="h-80 animate-pulse bg-sand/60" />}
            className="p-5"
          >
            <>
              <Table>
                <caption className="sr-only">
                  Applications, page {page} of {pageCount}
                </caption>
                <THead>
                  <tr>
                    <TH scope="col">Applicant</TH>
                    <TH scope="col">Vacancy</TH>
                    <TH scope="col">Location</TH>
                    <TH scope="col">Experience</TH>
                    <TH scope="col">Submitted</TH>
                    <TH scope="col">Interview</TH>
                    <TH scope="col">Rating</TH>
                    <TH scope="col">Stage</TH>
                  </tr>
                </THead>
                <TBody>
                  {applications.map((application) => (
                    <TR key={application.id}>
                      <TD className="max-w-[15rem]">
                        <Link
                          to={`/admin/careers/applications/${application.id}`}
                          className="block truncate font-medium text-ink transition-colors hover:text-bronze-dark"
                        >
                          {application.full_name}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {application.email}
                        </span>
                      </TD>
                      <TD className="max-w-[13rem] truncate text-sm">
                        {jobTitle(application.job_id)}
                      </TD>
                      <TD className="max-w-[10rem] truncate text-sm">
                        {application.location ?? '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-sm tabular-nums">
                        {application.experience_years !== null
                          ? `${application.experience_years} yr`
                          : '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-sm">
                        <span title={formatDateTime(application.submitted_at)}>
                          {formatRelative(application.submitted_at)}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-sm">
                        {application.interview_at
                          ? formatDateTime(application.interview_at)
                          : '—'}
                      </TD>
                      <TD>
                        {application.rating ? (
                          <Rating value={application.rating} size="sm" />
                        ) : (
                          <span className="text-xs text-faint">—</span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={application.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              <div className="mt-5 flex flex-col items-center gap-3 border-t border-line px-5 py-4">
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onPageChange={(next) => update({ page: String(next) })}
                />
                <p className="text-xs text-muted">
                  Page {page} of {pageCount} · {count} in total
                </p>
              </div>
            </>
          </AsyncSection>
        </Panel>
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Briefcase className="size-3.5 shrink-0 text-bronze" aria-hidden />
        Stage counts cover every vacancy. Marking an applicant hired closes the vacancy automatically
        once every opening is filled.
      </p>
    </AdminShell>
  )
}
