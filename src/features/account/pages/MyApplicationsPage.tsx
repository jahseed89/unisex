import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Clock, FileText, Info, MessageCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { listMyApplications, qk, withdrawApplication } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatDateTime, humanise, whatsappLink } from '@/lib/utils/format'
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  statusTone,
} from '@/components/ui'
import { applicationIsActive, statusLabel } from '@/features/account/components/accountUi'
import type { Job, JobApplication } from '@/types'

/**
 * `listMyApplications` actually joins the `jobs` row onto each application
 * (it casts before returning) but declares a bare `JobApplication[]`, so the
 * relation is narrowed here rather than by editing a shared file.
 */
type MyApplication = JobApplication & { job: Job | null }

/**
 * Applications the signed-in candidate has submitted.
 *
 * `listMyApplications` joins the job title on, so a card carries the role it was
 * for without a second request. `stage_notes` is the one field worth surfacing
 * prominently: when a human has written something to you, it belongs at the top.
 */
export default function MyApplicationsPage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null)

  useSeo({
    title: 'Your applications',
    description: 'Track the roles you have applied for at Black Chery Unisex Studio.',
    path: '/account/applications',
    noindex: true,
  })

  const query = useQuery({
    queryKey: [...qk.applications(), userId ?? 'anonymous'],
    queryFn: () => listMyApplications(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const applications = useMemo(
    () => (query.data ?? []) as MyApplication[],
    [query.data],
  )

  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawApplication(id),
    onSuccess: async () => {
      toast.success('Application withdrawn', {
        description: 'We have closed it off. You are welcome to apply again at any time.',
      })
      setWithdrawing(null)
      await queryClient.invalidateQueries({ queryKey: qk.applications() })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not withdraw that application.'))
    },
  })

  const isEmpty = !query.isLoading && !query.isError && applications.length === 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2.5">Careers</p>
          <h1 className="display-section">Your applications</h1>
          <p className="lede mt-3">
            Every role you have applied for, and where it has got to. We aim to reply to every
            application within ten working days.
          </p>
        </div>
        <Button asChild variant="accent" size="lg" className="shrink-0">
          <Link to="/careers">Browse open roles</Link>
        </Button>
      </header>

      {query.isLoading && <ApplicationsSkeleton />}

      {!query.isLoading && query.isError && (
        <Alert
          variant="danger"
          title="We could not load your applications"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      )}

      {isEmpty && (
        <EmptyState
          icon={<Briefcase className="size-5" aria-hidden />}
          title="No applications yet"
          description="We hire for craft, not for a CV template. If you can hold a tension, read colour theory or turn a loc set properly, we want to see your work."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/careers">See open roles</Link>
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && applications.length > 0 && (
        <ul className="space-y-4">
          {applications.map((application) => (
            <li key={application.id}>
              <ApplicationCard
                application={application}
                onWithdraw={() => setWithdrawing(application)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Withdraw confirmation */}
      <Dialog
        open={withdrawing !== null}
        onOpenChange={(open) => {
          if (!open) setWithdrawing(null)
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Withdraw this application?</DialogTitle>
            <DialogDescription>
              {withdrawing?.job?.title ?? 'This application'} · reference{' '}
              {withdrawing?.reference}.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              We close the application off and remove it from the shortlist. Nothing is deleted from
              our records, so if the role comes up again we will know you.
            </p>

            <Alert variant="neutral" title="Changed your mind?">
              If it is the timing or the salary rather than the role, message us instead — that is
              usually a conversation we can have.
            </Alert>

            <Button asChild variant="subtle" fullWidth size="md">
              <a
                href={whatsappLink(
                  `Hi! I'd like to talk about the ${withdrawing?.job?.title ?? 'role'} role before withdrawing my application.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden />
                Message the studio
              </a>
            </Button>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawing(null)}>
              Keep it open
            </Button>
            <Button
              variant="danger"
              loading={withdraw.isPending}
              onClick={() => withdrawing && withdraw.mutate(withdrawing.id)}
            >
              Yes, withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs leading-relaxed text-muted">
        Questions about a decision? Email{' '}
        <a
          href={`mailto:${site.contact.email}`}
          className="text-bronze-dark underline underline-offset-4"
        >
          {site.contact.email}
        </a>{' '}
        with your reference and we will reply to you directly.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
function ApplicationCard({
  application,
  onWithdraw,
}: {
  application: MyApplication
  onWithdraw: () => void
}) {
  const active = applicationIsActive(application.status)

  const timeline: { label: string; state: 'done' | 'current' }[] = [
    { label: 'Submitted', state: 'done' },
    ...(application.reviewed_at
      ? ([{ label: 'Read by the team', state: 'done' }] as const)
      : ([{ label: 'Awaiting review', state: 'current' }] as const)),
    {
      label:
        application.status === 'submitted'
          ? 'Decision pending'
          : statusLabel(application.status),
      state: application.status === 'submitted' ? ('current' as const) : ('done' as const),
    },
  ]

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">
              {application.job?.title ?? 'Role'}
            </h2>
            <Badge variant={statusTone(application.status)} dot>
              {statusLabel(application.status)}
            </Badge>
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {application.job?.department && <span>{application.job.department}</span>}
            <span className="tabular-nums">Ref {application.reference}</span>
            <span>Submitted {formatDate(application.submitted_at)}</span>
          </p>

          {application.interview_at && (
            <p className="mt-3 flex items-center gap-2 rounded-md border border-info/25 bg-info/[0.06] px-3 py-2 text-sm text-ink">
              <Clock className="size-4 shrink-0 text-info" aria-hidden />
              Interview booked for {formatDateTime(application.interview_at)}. We will confirm the
              address nearer the time.
            </p>
          )}

          {application.stage_notes && (
            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-bronze/25 bg-bronze/[0.05] px-3.5 py-3">
              <Info className="mt-0.5 size-4 shrink-0 text-bronze-dark" aria-hidden />
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
                  A note from the team
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {application.stage_notes}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {active ? (
            <Button
              variant="destructiveOutline"
              size="sm"
              onClick={onWithdraw}
              aria-label={`Withdraw application for ${application.job?.title ?? 'this role'}`}
            >
              <XCircle className="size-4" aria-hidden />
              Withdraw
            </Button>
          ) : (
            <p className="text-xs text-muted">
              Closed {formatDate(application.reviewed_at ?? application.submitted_at)}
            </p>
          )}
        </div>
      </div>

      {/* Progress */}
      <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line pt-4">
        {timeline.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            {index > 0 && <span className="h-px w-4 bg-line" aria-hidden />}
            <span
              className={`inline-flex items-center gap-1.5 text-xs ${
                step.state === 'done' ? 'text-ink' : 'text-bronze-dark'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  step.state === 'done' ? 'bg-sage' : 'bg-bronze'
                }`}
                aria-hidden
              />
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {/* Submitted detail */}
      <details className="group mt-4 border-t border-line pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-bronze-dark">
          <FileText className="size-4 text-bronze" aria-hidden />
          What you sent us
          <span className="text-xs font-normal text-muted">
            {Object.keys(application.answers ?? {}).length} screening answer
            {Object.keys(application.answers ?? {}).length === 1 ? '' : 's'}
            {application.experience_years !== null &&
              ` · ${application.experience_years} year${application.experience_years === 1 ? '' : 's'} experience`}
          </span>
        </summary>

        <div className="mt-3 space-y-4 text-sm leading-relaxed">
          {application.cv_file_name && (
            <p className="text-muted">
              CV: <span className="text-ink">{application.cv_file_name}</span>
            </p>
          )}

          {application.portfolio_url && (
            <p className="text-muted">
              Portfolio:{' '}
              <a
                href={application.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-bronze-dark underline underline-offset-4"
              >
                {application.portfolio_url}
              </a>
            </p>
          )}

          {application.portfolio_urls.length > 0 && (
            <ul className="space-y-1">
              {application.portfolio_urls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-bronze-dark underline underline-offset-4"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {application.cover_letter && (
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Cover letter
              </p>
              <p className="mt-1.5 whitespace-pre-line text-ink-soft">{application.cover_letter}</p>
            </div>
          )}

          {Object.keys(application.answers ?? {}).length > 0 && (
            <dl className="space-y-2">
              {Object.entries(application.answers).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                    {humanise(key)}
                  </dt>
                  <dd className="mt-0.5 text-ink-soft">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </details>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function ApplicationsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="space-y-3 rounded-lg border border-line bg-surface p-6">
          <div className="flex justify-between gap-4">
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-5 w-24 rounded-pill" />
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}
