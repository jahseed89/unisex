import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarCheck,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  UserCheck,
} from 'lucide-react'

import {
  getApplicationAdmin,
  getCvDownloadUrl,
  qk,
  setApplicationStatus,
} from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Rating,
  RatingInput,
  Select,
  Textarea,
} from '@/components/ui'
import {
  AdminShell,
  AsyncSection,
  ConfirmDialog,
  DetailList,
  EmptyState,
  Panel,
  StatusBadge,
} from '../components/adminKit'
import { fromDateTimeLocal, toDateTimeLocal } from '../components/adminFormat'
import { errorMessage } from '@/lib/supabase/errors'
import {
  formatDateTime,
  formatRelative,
  humanise,
  pluralise,
  whatsappLink,
} from '@/lib/utils/format'
import type { ApplicationStatus, Job, JobApplication } from '@/types'

/**
 * A single application.
 *
 * `getApplicationAdmin` returns the application, its vacancy and the status event
 * history in one read, which is what lets this screen show the decision trail and
 * the screening answers without a second round trip that could disagree with it.
 *
 * Every status move goes through `fn_set_application_status`, which stamps the
 * event and notifies the candidate. `hired` additionally increments the vacancy's
 * filled count and closes it once every opening is taken.
 */

const STAGES: ApplicationStatus[] = [
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

export default function AdminApplicationDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<ApplicationStatus | null>(null)
  const [note, setNote] = useState('')
  const [rating, setRating] = useState(0)
  const [interviewAt, setInterviewAt] = useState('')

  const query = useQuery({
    queryKey: qk.application(id),
    enabled: Boolean(id),
    queryFn: () => getApplicationAdmin(id),
    staleTime: 30_000,
  })

  const cvQuery = useMutation({
    mutationFn: (path: string) => getCvDownloadUrl(path),
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.success('Signed link opened. It expires in 10 minutes.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const stageMutation = useMutation({
    mutationFn: (input: {
      status: ApplicationStatus
      note?: string
      rating?: number
      interviewAt?: string
    }) =>
      setApplicationStatus({
        applicationId: id,
        status: input.status,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...(input.rating && input.rating > 0 ? { rating: input.rating } : {}),
        ...(input.interviewAt ? { interviewAt: input.interviewAt } : {}),
      }),
    onSuccess: (application) => {
      toast.success(
        `${application.full_name} moved to ${humanise(application.status).toLowerCase()}.`,
      )
      setStage(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: qk.application(id) })
      void queryClient.invalidateQueries({ queryKey: qk.adminApplications({}) })
      void queryClient.invalidateQueries({ queryKey: qk.adminJobs() })
    },
    onError: (error) => {
      setStage(null)
      toast.error(errorMessage(error))
    },
  })

  const application = query.data
  const job = application?.job ?? null
  const events = application?.events ?? []
  const isClosed = application ? ['hired', 'rejected', 'withdrawn'].includes(application.status) : false

  const move = (next: ApplicationStatus) => {
    setStage(next)
    setNote('')
    setRating(application?.rating ?? 0)
    setInterviewAt(toDateTimeLocal(application?.interview_at))
  }

  const portfolioUrls = [
    application?.portfolio_url,
    ...(application?.portfolio_urls ?? []),
  ].filter((url): url is string => Boolean(url))

  return (
    <AdminShell
      eyebrow="Administration"
      title={application ? application.full_name : 'Application'}
      breadcrumb={[
        { label: 'Admin', to: '/admin' },
        { label: 'Careers', to: '/admin/careers' },
        { label: 'Applications', to: '/admin/careers/applications' },
      ]}
      description={job ? `Applied for ${job.title}` : undefined}
      actions={
        <>
          {application && <StatusBadge status={application.status} />}
          <Button asChild variant="outline">
            <Link to="/admin/careers/applications">
              <ArrowLeft aria-hidden />
              All applications
            </Link>
          </Button>
        </>
      }
    >
      <AsyncSection
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={application === null && !query.isLoading}
        empty={
          <EmptyState
            icon={<UserCheck aria-hidden />}
            title="That application could not be found"
            description="It may have been withdrawn and removed, or the link may be out of date."
            action={
              <Button asChild>
                <Link to="/admin/careers/applications">Back to applications</Link>
              </Button>
            }
          />
        }
        skeleton={<div className="h-96 animate-pulse rounded-lg bg-sand/60" />}
      >
        {application && (
          <>
            {/* Quick actions ------------------------------------------- */}
            <Panel
              title="Move this application"
              description="Each move stamps the history and notifies the candidate."
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="solid" onClick={() => move('shortlisted')}>
                  <Star aria-hidden />
                  Shortlist
                </Button>
                <Button
                  variant="outline"
                  onClick={() => move('interview_scheduled')}
                >
                  <CalendarCheck aria-hidden />
                  Schedule interview
                </Button>
                <Button variant="outline" onClick={() => move('hired')}>
                  <UserCheck aria-hidden />
                  Mark hired
                </Button>
                <Button variant="outline" onClick={() => move('screening')}>
                  Move to screening
                </Button>
                <Button
                  variant="destructiveOutline"
                  onClick={() => move('rejected')}
                  className="sm:ml-auto"
                >
                  Reject
                </Button>
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <Field
                  label="Or move to any stage"
                  htmlFor="stage-select"
                  hint="The same pipeline, with the note and rating fields."
                >
                  <Select
                    id="stage-select"
                    value={application.status}
                    onChange={(event) => move(event.target.value as ApplicationStatus)}
                    options={STAGES.map((value) => ({ value, label: humanise(value) }))}
                  />
                </Field>
              </div>

              {isClosed && (
                <Alert variant="info" className="mt-4">
                  This application is {humanise(application.status).toLowerCase()}. The history below
                  is the permanent record — move it back only if the decision was a mistake.
                </Alert>
              )}
            </Panel>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-5">
                {/* Applicant -------------------------------------------- */}
                <Panel
                  title="Applicant"
                  action={
                    application.rating ? (
                      <Rating value={application.rating} size="sm" showValue />
                    ) : undefined
                  }
                >
                  <DetailList
                    columns={2}
                    items={[
                      { label: 'Name', value: application.full_name },
                      { label: 'Reference', value: application.reference },
                      { label: 'Location', value: application.location ?? 'Not stated' },
                      {
                        label: 'Experience',
                        value:
                          application.experience_years !== null
                            ? pluralise(application.experience_years, 'year')
                            : 'Not stated',
                      },
                      {
                        label: 'Submitted',
                        value: `${formatDateTime(application.submitted_at)} (${formatRelative(
                          application.submitted_at,
                        )})`,
                      },
                      {
                        label: 'Reviewed',
                        value: application.reviewed_at
                          ? formatDateTime(application.reviewed_at)
                          : 'Not yet',
                      },
                      {
                        label: 'Interview',
                        value: application.interview_at
                          ? formatDateTime(application.interview_at)
                          : 'Not scheduled',
                      },
                    ]}
                  />

                  <div className="mt-5 space-y-2 border-t border-line pt-4">
                    <a
                      href={`mailto:${application.email}`}
                      className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                    >
                      <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
                      <span className="truncate">{application.email}</span>
                    </a>

                    {application.phone_e164 && (
                      <>
                        <a
                          href={`tel:${application.phone_e164}`}
                          className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                        >
                          <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
                          {application.phone_e164}
                        </a>
                        <a
                          href={whatsappLink(
                            `Hello ${application.full_name.split(' ')[0] ?? ''} — thank you for applying to Unisex Hair Studio.`,
                            application.phone_e164,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                        >
                          <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
                          Message on WhatsApp
                        </a>
                      </>
                    )}

                    {application.location && (
                      <p className="flex items-center gap-2.5 px-1 py-1 text-sm text-muted">
                        <MapPin className="size-4 shrink-0 text-bronze" aria-hidden />
                        {application.location}
                      </p>
                    )}
                  </div>
                </Panel>

                {/* CV -------------------------------------------------- */}
                <Panel
                  title="Curriculum vitae"
                  description="Stored in a private bucket. The link is signed and expires in ten minutes."
                >
                  {application.cv_path ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <FileText className="size-5 shrink-0 text-bronze" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {application.cv_file_name ?? 'Curriculum vitae'}
                        </p>
                        <p className="text-xs text-muted">
                          {application.cv_bytes
                            ? `${Math.max(1, Math.round(application.cv_bytes / 1024))} KB`
                            : 'Size unknown'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => cvQuery.mutate(application.cv_path!)}
                        loading={cvQuery.isPending}
                        loadingText="Signing…"
                      >
                        <Download aria-hidden />
                        Download
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      No CV was uploaded with this application.
                    </p>
                  )}
                </Panel>

                {/* Screening answers ----------------------------------- */}
                <ScreeningPanel application={application} job={job} />

                {/* Cover letter & portfolio --------------------------- */}
                {(application.cover_letter || portfolioUrls.length > 0) && (
                  <Panel title="Cover letter & portfolio">
                    {application.cover_letter && (
                      <div>
                        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                          Cover letter
                        </p>
                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                          {application.cover_letter}
                        </p>
                      </div>
                    )}

                    {portfolioUrls.length > 0 && (
                      <div className={application.cover_letter ? 'mt-5 border-t border-line pt-4' : ''}>
                        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                          Portfolio links
                        </p>
                        <ul className="mt-2 space-y-2">
                          {portfolioUrls.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
                              >
                                <ExternalLink className="size-3.5 shrink-0 text-bronze" aria-hidden />
                                <span className="truncate">{url}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Panel>
                )}
              </div>

              <div className="space-y-5">
                {/* Vacancy -------------------------------------------- */}
                {job && <VacancyPanel job={job} />}

                {/* History -------------------------------------------- */}
                <Panel
                  title="Decision history"
                  description="Every stage change, written by the database when it happened."
                >
                  {events.length === 0 ? (
                    <p className="text-sm text-muted">No stage changes recorded yet.</p>
                  ) : (
                    <ol>
                      {events.map((event, index) => (
                        <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                          {index < events.length - 1 && (
                            <span
                              className="absolute top-5 left-[0.4375rem] h-full w-px bg-line"
                              aria-hidden
                            />
                          )}
                          <span
                            className="relative mt-1 size-3.5 shrink-0 rounded-full border-2 border-bronze bg-surface"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink">
                              {event.from_status && (
                                <>
                                  <span className="text-muted">{humanise(event.from_status)}</span>
                                  <span className="mx-1.5 text-faint" aria-label="to">
                                    →
                                  </span>
                                </>
                              )}
                              <span className="font-medium">{humanise(event.to_status)}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {formatDateTime(event.created_at)}
                            </p>
                            {event.note && (
                              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                                {event.note}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>

                {application.stage_notes && (
                  <Panel title="Stage notes">
                    <p className="text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                      {application.stage_notes}
                    </p>
                  </Panel>
                )}
              </div>
            </div>
          </>
        )}
      </AsyncSection>

      {/* Stage move ---------------------------------------------------- */}
      <ConfirmDialog
        open={stage !== null}
        onOpenChange={(open) => !open && setStage(null)}
        title={stage ? `Move to ${humanise(stage).toLowerCase()}` : ''}
        description={application ? `${application.full_name} · ${application.reference}` : undefined}
        tone={stage === 'rejected' || stage === 'withdrawn' ? 'danger' : 'default'}
        confirmLabel={stage === 'rejected' ? 'Reject application' : 'Move application'}
        pending={stageMutation.isPending}
        body={
          <div className="space-y-4">
            <Field
              label="Internal note"
              htmlFor="stage-note"
              hint="Stored on the history and sent to the candidate with the status message."
            >
              <Textarea
                id="stage-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Portfolio is strong on braiding; shortlist for Tuesday."
              />
            </Field>

            <RatingInput
              value={rating}
              onChange={setRating}
              label="Candidate rating"
            />

            <Field
              label="Interview date and time"
              htmlFor="stage-interview"
              hint="Required for an interview-scheduled move. Sent to the candidate."
            >
              <Input
                id="stage-interview"
                type="datetime-local"
                value={interviewAt}
                onChange={(event) => setInterviewAt(event.target.value)}
              />
            </Field>
          </div>
        }
        consequence={
          stage === 'hired' ? (
            <span className="block space-y-1.5">
              <span className="block">
                The candidate is notified, their rating and interview history are kept, and the
                vacancy's filled count goes up by one.
              </span>
              {job && job.filled_count + 1 >= job.openings && (
                <span className="block font-medium">
                  That fills the last opening on “{job.title}”, so the vacancy closes automatically.
                </span>
              )}
            </span>
          ) : stage === 'rejected' ? (
            <span className="block">
              The candidate is told they were not selected, with the note above as the reason. This
              is visible to them, so write it as you would want to receive it.
            </span>
          ) : stage === 'withdrawn' ? (
            <span className="block">
              Marks the application as withdrawn. Candidates withdraw their own; using this records
              that they did.
            </span>
          ) : (
            <span className="block">
              The stage change is recorded with your note, and the candidate receives the matching
              notification.
            </span>
          )
        }
        onConfirm={() => {
          if (!stage) return
          stageMutation.mutate({
            status: stage,
            note,
            rating,
            ...(interviewAt ? { interviewAt: fromDateTimeLocal(interviewAt) ?? undefined } : {}),
          })
        }}
      />
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function ScreeningPanel({
  application,
  job,
}: {
  application: JobApplication
  job: Job | null
}) {
  const answers = application.answers ?? {}
  const questions = job?.screening_questions ?? []
  const extraKeys = Object.keys(answers).filter(
    (key) => !questions.some((question) => question.key === key),
  )

  if (questions.length === 0 && extraKeys.length === 0) {
    return (
      <Panel title="Screening answers">
        <p className="text-sm text-muted">
          This vacancy asked no screening questions, and the applicant left no extra answers.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Screening answers"
      description="Matched against the questions the vacancy asked."
    >
      {questions.length > 0 && (
        <DetailList
          columns={1}
          items={questions.map((question) => ({
            label: question.label,
            value:
              answers[question.key]?.trim() || (
                <span className="text-faint">
                  {question.required ? 'Not answered' : 'Not answered'}
                </span>
              ),
          }))}
        />
      )}

      {extraKeys.length > 0 && (
        <div className={questions.length > 0 ? 'mt-5 border-t border-line pt-4' : ''}>
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
            Other answers
          </p>
          <div className="mt-2">
            <DetailList
              columns={1}
              items={extraKeys.map((key) => ({
                label: humanise(key),
                value: answers[key] || <span className="text-faint">Not answered</span>,
              }))}
            />
          </div>
        </div>
      )}
    </Panel>
  )
}

function VacancyPanel({ job }: { job: Job }) {
  return (
    <Panel
      title="Vacancy"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/careers">Manage</Link>
        </Button>
      }
    >
      <DetailList
        columns={1}
        items={[
          { label: 'Title', value: job.title },
          { label: 'Department', value: job.department ?? 'Studio' },
          { label: 'Employment type', value: humanise(job.employment_type) },
          {
            label: 'Openings',
            value: (
              <span className="flex items-center gap-2">
                {job.filled_count} / {job.openings}
                <Badge variant="outline" size="sm">
                  {humanise(job.status)}
                </Badge>
              </span>
            ),
          },
          {
            label: 'Closes',
            value: job.closes_at ? formatDateTime(job.closes_at) : 'Open ended',
          },
        ]}
      />
      <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-muted">
        {job.summary}
      </p>
    </Panel>
  )
}
