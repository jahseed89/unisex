import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  MapPin,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getJobBySlug,
  hasApplied,
  qk,
  submitApplication,
  uploadCv,
  type CvUpload,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { site } from '@/config/site'
import { toE164 } from '@/lib/utils/format'
import { isEmail, normaliseEmail } from '@/features/auth/components/email'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { FormField } from '@/features/auth/components/FormField'
import {
  ApplicationSteps,
  BackToJobLink,
  StepProgress,
  type StepDefinition,
} from '@/features/careers/components/ApplicationSteps'
import { CvUploadField } from '@/features/careers/components/CvUploadField'
import { ScreeningQuestions } from '@/features/careers/components/ScreeningQuestions'
import { PageHeader } from '@/components/shared/Cards'
import type { JobApplication } from '@/types'

/**
 * Job application.
 *
 * A four-step form over one draft object. An applicant does not need an
 * account — but when they have one, the form prefills from the profile and
 * `fn_submit_application` links the application to `applicant_id`, so it shows
 * up in "My applications" instead of vanishing.
 *
 * The step navigation is a guard, not a validator: `canAdvance` is the single
 * place that decides whether the current step is complete, and it is reused by
 * the review step and the submit button.
 */

const STEPS: StepDefinition[] = [
  { id: 'about', label: 'About you', hint: 'How we reach you' },
  { id: 'links', label: 'Links & CV', hint: 'Where your work lives' },
  { id: 'screening', label: 'Questions', hint: 'A few things we need to know' },
  { id: 'letter', label: 'Cover letter', hint: 'Your side of it' },
  { id: 'review', label: 'Review', hint: 'Check and send' },
]

const DRAFT_STEPS = STEPS.filter((step) => step.id !== 'review')
const REVIEW_INDEX = STEPS.length - 1

interface Draft {
  fullName: string
  email: string
  phone: string
  location: string
  portfolioUrl: string
  extraLinks: string[]
  cv: CvUpload | null
  answers: Record<string, string>
  coverLetter: string
  experienceYears: string
  consentContact: boolean
}

function emptyDraft(): Draft {
  return {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    portfolioUrl: '',
    extraLinks: [''],
    cv: null,
    answers: {},
    coverLetter: '',
    experienceYears: '',
    consentContact: false,
  }
}

const URL_HINT = 'Paste the whole link, including https://'

export default function JobApplyPage() {
  const { slug = '' } = useParams()
  const { user, profile, isLoading: authLoading } = useAuth()

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [submitted, setSubmitted] = useState<JobApplication | null>(null)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [cvError, setCvError] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  const jobQuery = useQuery({
    queryKey: qk.job(slug),
    queryFn: () => getJobBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  })

  const job = jobQuery.data ?? null

  useSeo({
    title: job ? `Apply — ${job.title}` : 'Apply',
    description: job
      ? `Apply for the ${job.title} role at Unisex Hair Studio, Lagos. Takes about five minutes and no account is required.`
      : 'Apply for a role at Unisex Hair Studio, Lagos.',
    path: `/careers/${slug}/apply`,
    jsonLd: job
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'JobPosting',
            title: job.title,
            description: job.summary,
            url: `${site.url}/careers/${job.slug}`,
            datePosted: job.published_at ?? undefined,
            employmentType: job.employment_type.replace('_', ' ').toUpperCase(),
            hiringOrganization: { '@type': 'Organization', name: site.name },
          },
        ]
      : undefined,
  })

  // --- Analytics: fire once per mount ---------------------------------------
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !job) return
    started.current = true
    analytics.jobApplicationStarted(job.slug)
  }, [job])

  // --- Prefill from the account --------------------------------------------
  useEffect(() => {
    if (prefilled || authLoading) return
    const name = profile?.full_name ?? (user?.email ? user.email.split('@')[0] : null)
    const phone = profile?.phone_e164 ?? user?.phone ?? ''
    if (!name && !phone) {
      setPrefilled(true)
      return
    }

    setDraft((current) => ({
      ...current,
      fullName: current.fullName || (name ?? ''),
      email: current.email || (user?.email ?? ''),
      phone: current.phone || phone,
    }))
    setPrefilled(true)
  }, [authLoading, prefilled, profile, user])

  // --- Already applied? -----------------------------------------------------
  const appliedQuery = useQuery({
    queryKey: [...qk.applications(), slug, draft.email || 'anonymous'],
    queryFn: () => hasApplied(job!.id, normaliseEmail(draft.email)),
    enabled: Boolean(job) && isEmail(draft.email),
    staleTime: 5 * 60_000,
  })

  // --- CV upload ------------------------------------------------------------
  const cvMutation = useMutation({
    mutationFn: (file: File) => uploadCv(file, user?.id ?? null),
    onSuccess: (uploaded) => {
      setDraft((current) => ({ ...current, cv: uploaded }))
      setCvError(null)
      toast.success('CV uploaded')
    },
    onError: (error) => {
      setCvError(errorMessage(error, 'That upload failed. Please try again.'))
    },
  })

  // --- Submit ---------------------------------------------------------------
  const submit = useMutation({
    mutationFn: () =>
      submitApplication({
        jobId: job!.id,
        fullName: draft.fullName.trim(),
        email: normaliseEmail(draft.email),
        phone: draft.phone.trim() ? toE164(draft.phone.trim()) ?? draft.phone.trim() : undefined,
        location: draft.location.trim() || undefined,
        coverLetter: draft.coverLetter.trim() || undefined,
        portfolioUrl: draft.portfolioUrl.trim() || undefined,
        portfolioUrls: draft.extraLinks
          .map((link) => link.trim())
          .filter((link) => link.length > 0),
        cvPath: draft.cv?.path,
        cvFileName: draft.cv?.fileName,
        cvBytes: draft.cv?.bytes,
        answers: draft.answers,
        experienceYears: draft.experienceYears.trim()
          ? Number(draft.experienceYears.trim())
          : undefined,
        consentContact: draft.consentContact,
      }),
    onSuccess: (application) => {
      setSubmitted(application)
      analytics.jobApplicationSubmitted(job!.slug)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not send that application. Please try again.'))
      // Drop back to the first incomplete step so the fix is obvious.
      const firstBad = firstInvalidStep()
      if (firstBad !== null) setStep(firstBad)
    },
  })

  // --- Draft updates --------------------------------------------------------
  const patch = (values: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...values }))
    setErrors({})
  }

  const patchAnswer = (key: string, value: string) => {
    setDraft((current) => ({ ...current, answers: { ...current.answers, [key]: value } }))
    setErrors((current) => ({ ...current, [`answer:${key}`]: undefined }))
  }

  const extraLinks = useMemo(
    () => draft.extraLinks.filter((link) => link.trim().length > 0),
    [draft.extraLinks],
  )

  // --- Validation -----------------------------------------------------------
  function validate(currentStep: number): boolean {
    const next: Partial<Record<string, string>> = {}

    if (currentStep === 0) {
      if (draft.fullName.trim().length < 2) next.fullName = 'Tell us the name to put on the application.'
      if (!isEmail(draft.email)) next.email = 'Enter an email we can reach you on.'
      if (draft.phone.trim() && toE164(draft.phone.trim()) === null) {
        next.phone = 'Enter a Nigerian number, e.g. 0803 123 4567.'
      }
    }

    if (currentStep === 1) {
      if (draft.portfolioUrl.trim() && !isUrl(draft.portfolioUrl.trim())) {
        next.portfolioUrl = 'That does not look like a full link.'
      }
      for (const link of extraLinks) {
        if (!isUrl(link)) {
          next.extraLinks = 'One of those links is incomplete.'
          break
        }
      }
    }

    if (currentStep === 2) {
      for (const question of job?.screening_questions ?? []) {
        if (question.required && !draft.answers[question.key]?.trim()) {
          next[`answer:${question.key}`] = 'This one is required.'
        }
      }
    }

    if (currentStep === 3) {
      if (draft.experienceYears.trim()) {
        const years = Number(draft.experienceYears.trim())
        if (!Number.isFinite(years) || years < 0 || years > 60) {
          next.experienceYears = 'Enter a number of years between 0 and 60.'
        }
      }
      if (!draft.consentContact) {
        next.consentContact = 'We need your consent to contact you about this role.'
      }
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function firstInvalidStep(): number | null {
    for (let index = 0; index < DRAFT_STEPS.length; index++) {
      const saved = errors
      if (!validate(index)) return index
      void saved
    }
    return null
  }

  const goNext = () => {
    if (!validate(step)) return
    const next = Math.min(step + 1, STEPS.length - 1)
    setStep(next)
    scrollToTop()
  }

  const goBack = () => {
    setStep((current) => Math.max(0, current - 1))
    scrollToTop()
  }

  const jumpTo = (index: number) => {
    // Only jump forwards past a complete step.
    if (index > step && !validate(step)) return
    setStep(index)
    scrollToTop()
  }

  const onSubmit = () => {
    const bad = firstInvalidStep()
    if (bad !== null) {
      setStep(bad)
      scrollToTop()
      return
    }
    submit.mutate()
  }

  // --- States ---------------------------------------------------------------

  if (jobQuery.isLoading) return <ApplySkeleton />

  if (jobQuery.isError) {
    return (
      <div className="container-page section-y">
        <Alert
          variant="danger"
          title="We could not load this role"
          action={
            <Button size="sm" variant="outline" onClick={() => void jobQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(jobQuery.error)}
        </Alert>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="container-page section-y">
        <EmptyState
          icon={<Briefcase className="size-5" aria-hidden />}
          title="That role is no longer open"
          description="It may have been filled or withdrawn. There are usually others on the board."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/careers">See open roles</Link>
            </Button>
          }
        />
      </div>
    )
  }

  // --- Confirmation ---------------------------------------------------------
  if (submitted) {
    return <ApplicationConfirmed application={submitted} job={job} />
  }

  const completed = DRAFT_STEPS.filter((_, index) => index < step).map((_, index) => index)

  return (
    <>
      <PageHeader
        eyebrow="Careers"
        title={`Apply — ${job.title}`}
        description={`${job.summary} No account needed — you will get a reference as soon as you send it.`}
        breadcrumb={[
          { label: 'Careers', to: '/careers' },
          { label: job.title, to: `/careers/${job.slug}` },
          { label: 'Apply', to: `/careers/${job.slug}/apply` },
        ]}
        action={
          <Link
            to={`/careers/${job.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to the role
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          {job.department && <Badge variant="accent">{job.department}</Badge>}
          <Badge>{job.employment_type.replace('_', ' ')}</Badge>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden />
            {site.address.locality}, {site.address.region}
          </span>
          {job.closes_at && (
            <span className="text-sm text-muted">
              Closes {new Date(job.closes_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
            </span>
          )}
        </div>
      </PageHeader>

      <div className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start lg:gap-12">
          <div className="min-w-0">
            {/* Stepper */}
            <div className="border-b border-line pb-5">
              <ApplicationSteps
                steps={STEPS}
                current={step}
                completed={completed}
                onSelect={jumpTo}
                className="hidden lg:block"
              />
              <div className="lg:hidden">
                <p className="mb-2 font-display text-sm font-semibold text-ink">
                  {STEPS[step]?.label}
                </p>
                {STEPS[step]?.hint && (
                  <p className="mb-3 text-xs text-muted">{STEPS[step].hint}</p>
                )}
                <StepProgress current={step} total={STEPS.length} />
              </div>
            </div>

            {/* Account benefit */}
            {!user && (
              <Alert variant="info" title="No account needed" className="mt-6">
                You can send this without signing up. If you{' '}
                <Link to="/auth/sign-up" state={{ from: { pathname: `/careers/${slug}/apply` } }} className="text-bronze-dark underline underline-offset-4">
                  create an account
                </Link>{' '}
                first, your application is saved there and you can track it — along with your
                bookings and orders.
              </Alert>
            )}

            {appliedQuery.data === true && (
              <Alert variant="warning" title="You have already applied" className="mt-6">
                We already have an application from this email address for {job.title}. There is no
                need to send a second one — we read every one.{' '}
                {user && (
                  <Link
                    to="/account/applications"
                    className="text-bronze-dark underline underline-offset-4"
                  >
                    Track it in your account
                  </Link>
                )}
              </Alert>
            )}

            <div className="mt-6" aria-live="polite">
              <p className="sr-only">
                Step {step + 1} of {STEPS.length}: {STEPS[step]?.label}
              </p>

              {/* --- Step 1 ------------------------------------------- */}
              {step === 0 && (
                <Card className="space-y-6 p-5 md:p-6">
                  <StepHeading
                    title="About you"
                    body="The basics, so we know who we are talking to and where."
                  />

                  <FormField label="Full name" error={errors.fullName} required>
                    <Input
                      autoComplete="name"
                      placeholder="Ada Okafor"
                      value={draft.fullName}
                      invalid={Boolean(errors.fullName)}
                      onChange={(event) => patch({ fullName: event.target.value })}
                    />
                  </FormField>

                  <FormField label="Email address" error={errors.email} required>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={draft.email}
                      invalid={Boolean(errors.email)}
                      onChange={(event) => patch({ email: event.target.value })}
                    />
                  </FormField>

                  <FormField
                    label="Phone number"
                    error={errors.phone}
                    hint="Optional, but it is how we schedule an interview quickly."
                  >
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0803 123 4567"
                      value={draft.phone}
                      invalid={Boolean(errors.phone)}
                      onChange={(event) => patch({ phone: event.target.value })}
                    />
                  </FormField>

                  <FormField
                    label="Where are you based?"
                    error={errors.location}
                    hint="Town or area. It helps us plan shifts."
                  >
                    <Input
                      placeholder="Lekki, Lagos"
                      value={draft.location}
                      invalid={Boolean(errors.location)}
                      onChange={(event) => patch({ location: event.target.value })}
                    />
                  </FormField>
                </Card>
              )}

              {/* --- Step 2 ------------------------------------------- */}
              {step === 1 && (
                <Card className="space-y-6 p-5 md:p-6">
                  <StepHeading
                    title="Your work"
                    body="Show us what you can do. Links beat adjectives — Instagram, TikTok, a portfolio folder, a client gallery."
                  />

                  <FormField
                    label="Main portfolio link"
                    error={errors.portfolioUrl}
                    hint="Your strongest one — the work you would want us to see first."
                  >
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://instagram.com/yourwork"
                      value={draft.portfolioUrl}
                      invalid={Boolean(errors.portfolioUrl)}
                      onChange={(event) => patch({ portfolioUrl: event.target.value })}
                    />
                  </FormField>

                  <div>
                    <p className="text-[0.8125rem] font-medium text-ink-soft">Other links</p>
                    <p className="mt-1 text-xs text-muted">{URL_HINT}</p>

                    <ul className="mt-3 space-y-2">
                      {draft.extraLinks.map((link, index) => (
                        <li key={index} className="flex gap-2">
                          <Input
                            type="url"
                            inputMode="url"
                            aria-label={`Additional link ${index + 1}`}
                            placeholder="https://…"
                            value={link}
                            invalid={Boolean(errors.extraLinks)}
                            onChange={(event) => {
                              const next = [...draft.extraLinks]
                              next[index] = event.target.value
                              patch({ extraLinks: next })
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            className="shrink-0"
                            onClick={() =>
                              patch({
                                extraLinks: draft.extraLinks.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Trash2 className="size-4" aria-hidden />
                            <span className="sr-only">Remove link {index + 1}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>

                    {errors.extraLinks && (
                      <p role="alert" className="mt-1.5 text-xs text-danger">
                        {errors.extraLinks}
                      </p>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => patch({ extraLinks: [...draft.extraLinks, ''] })}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Add another link
                    </Button>
                  </div>

                  <div className="border-t border-line pt-6">
                    <CvUploadField
                      value={draft.cv}
                      onChange={(cv) => {
                        setDraft((current) => ({ ...current, cv }))
                        setCvError(null)
                      }}
                      onUpload={(file) => cvMutation.mutate(file)}
                      uploading={cvMutation.isPending}
                      error={cvError}
                    />
                  </div>
                </Card>
              )}

              {/* --- Step 3 ------------------------------------------- */}
              {step === 2 && (
                <Card className="space-y-6 p-5 md:p-6">
                  <StepHeading
                    title="A few questions"
                    body="Answer what you can. Anything optional we will not hold against you."
                  />

                  {job.screening_questions.length === 0 ? (
                    <p className="rounded-md border border-dashed border-line-strong bg-sand/40 px-4 py-6 text-center text-sm text-muted">
                      This role has no screening questions — carry on to the cover letter.
                    </p>
                  ) : (
                    <ScreeningQuestions
                      questions={job.screening_questions}
                      answers={draft.answers}
                      onChange={patchAnswer}
                    />
                  )}

                  {/* Surface per-question errors under the list too, so a
                      required field three rows up is not the only signal. */}
                  {Object.entries(errors).some(([key]) => key.startsWith('answer:')) && (
                    <Alert variant="danger" title="A required question is unanswered">
                      Scroll back up — the questions marked in red need an answer before we can send
                      this.
                    </Alert>
                  )}
                </Card>
              )}

              {/* --- Step 4 ------------------------------------------- */}
              {step === 3 && (
                <Card className="space-y-6 p-5 md:p-6">
                  <StepHeading
                    title="Your side of it"
                    body="Optional in form, but it is the part we actually read. Tell us what you want to do here and why this studio."
                  />

                  <FormField
                    label="Cover letter"
                    error={errors.coverLetter}
                    hint="No template, no length limit. A genuine paragraph beats a polished page of nothing."
                  >
                    <Textarea
                      rows={10}
                      maxLength={4_000}
                      placeholder="I have been braiding for four years, mostly in Surulere, and I want to move somewhere the work is taken seriously. What I like about Unisex is…"
                      value={draft.coverLetter}
                      invalid={Boolean(errors.coverLetter)}
                      onChange={(event) => patch({ coverLetter: event.target.value })}
                      aria-describedby="cover-letter-count"
                    />
                  </FormField>

                  <p id="cover-letter-count" className="-mt-3 text-right text-xs text-muted">
                    {draft.coverLetter.trim().length} / 4000
                  </p>

                  <Field
                    label="Years of professional experience"
                    htmlFor="experience-years"
                    error={errors.experienceYears}
                    hint="Whole or part years — whatever is honest."
                  >
                    <Input
                      id="experience-years"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={60}
                      step={0.5}
                      placeholder="4"
                      value={draft.experienceYears}
                      invalid={Boolean(errors.experienceYears)}
                      onChange={(event) => patch({ experienceYears: event.target.value })}
                    />
                  </Field>

                  <div className="border-t border-line pt-5">
                    <Checkbox
                      id="consent-contact"
                      checked={draft.consentContact}
                      invalid={Boolean(errors.consentContact)}
                      aria-describedby={errors.consentContact ? 'consent-error' : 'consent-hint'}
                      label="You may contact me about this application"
                      description="By email, phone or WhatsApp. Required — we cannot process an application without it."
                      onChange={(event) => patch({ consentContact: event.target.checked })}
                    />
                    {errors.consentContact ? (
                      <p id="consent-error" role="alert" className="mt-1.5 pl-7 text-xs text-danger">
                        {errors.consentContact}
                      </p>
                    ) : (
                      <p id="consent-hint" className="sr-only">
                        Required consent to be contacted about this application.
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* --- Step 5 ------------------------------------------- */}
              {step === REVIEW_INDEX && (
                <Card className="space-y-6 p-5 md:p-6">
                  <StepHeading
                    title="Check it over"
                    body="This is exactly what the hiring team sees. Tap any section to go back."
                  />

                  {submit.isError && (
                    <Alert variant="danger" title="We could not send that">
                      {errorMessage(submit.error)}
                    </Alert>
                  )}

                  <ReviewBlock label="About you" onEdit={() => setStep(0)}>
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      <ReviewItem label="Name" value={draft.fullName} />
                      <ReviewItem label="Email" value={draft.email} />
                      <ReviewItem label="Phone" value={draft.phone || 'Not given'} />
                      <ReviewItem label="Location" value={draft.location || 'Not given'} />
                    </dl>
                  </ReviewBlock>

                  <ReviewBlock label="Links & CV" onEdit={() => setStep(1)}>
                    <dl className="space-y-3">
                      <ReviewItem
                        label="Portfolio"
                        value={draft.portfolioUrl || 'Not given'}
                        href={isUrl(draft.portfolioUrl) ? draft.portfolioUrl : undefined}
                      />
                      {extraLinks.map((link) => (
                        <ReviewItem key={link} label="Additional" value={link} href={link} />
                      ))}
                      <ReviewItem
                        label="CV"
                        value={
                          draft.cv
                            ? `${draft.cv.fileName} (${formatBytes(draft.cv.bytes)})`
                            : 'Not uploaded'
                        }
                      />
                    </dl>
                  </ReviewBlock>

                  {(job.screening_questions.length > 0 || draft.answers) && (
                    <ReviewBlock
                      label="Screening answers"
                      onEdit={() => setStep(2)}
                      empty={Object.keys(draft.answers).length === 0}
                    >
                      <dl className="space-y-3">
                        {Object.entries(draft.answers)
                          .filter(([, value]) => value.trim().length > 0)
                          .map(([key, value]) => (
                            <ReviewItem
                              key={key}
                              label={labelForQuestion(job.screening_questions, key)}
                              value={value}
                            />
                          ))}
                      </dl>
                    </ReviewBlock>
                  )}

                  <ReviewBlock label="Cover letter" onEdit={() => setStep(3)}>
                    <dl className="space-y-3">
                      <ReviewItem
                        label="Experience"
                        value={
                          draft.experienceYears.trim()
                            ? `${draft.experienceYears.trim()} year${draft.experienceYears.trim() === '1' ? '' : 's'}`
                            : 'Not given'
                        }
                      />
                      <div>
                        <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                          Letter
                        </dt>
                        <dd className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                          {draft.coverLetter.trim() || 'Not written'}
                        </dd>
                      </div>
                    </dl>
                  </ReviewBlock>

                  {appliedQuery.data === true && (
                    <Alert variant="warning" title="You have already applied">
                      We already have your application from this address. Sending again will not move
                      you forward — but it will not hurt either.
                    </Alert>
                  )}
                </Card>
              )}
            </div>

            {/* Navigation */}
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                size="lg"
                onClick={goBack}
                disabled={step === 0 || submit.isPending}
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>

              {step < REVIEW_INDEX ? (
                <Button variant="accent" size="lg" onClick={goNext}>
                  Continue
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  loading={submit.isPending}
                  loadingText="Sending…"
                  onClick={onSubmit}
                >
                  <Send className="size-4" aria-hidden />
                  Send application
                </Button>
              )}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              We keep applications for twelve months. Nothing you send here is shared with anyone
              outside the studio, and you can ask us to delete it at any time —{' '}
              <a
                href={`mailto:${site.contact.email}`}
                className="text-bronze-dark underline underline-offset-4"
              >
                {site.contact.email}
              </a>
              .
            </p>
          </div>

          {/* Role summary sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-5">
              <h2 className="font-display text-base font-semibold text-ink">The role</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{job.summary}</p>
              <dl className="mt-4 space-y-2.5 text-sm">
                {job.department && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Department</dt>
                    <dd className="text-ink">{job.department}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Type</dt>
                  <dd className="text-ink capitalize">
                    {job.employment_type.replace('_', ' ')}
                  </dd>
                </div>
                {job.salary_min && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Salary</dt>
                    <dd className="text-ink">
                      {job.salary_max ? `${job.salary_min}–${job.salary_max}` : job.salary_min} per{' '}
                      {job.salary_period.replace('ly', '')}
                    </dd>
                  </div>
                )}
                {job.openings > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Openings</dt>
                    <dd className="text-ink">{job.openings}</dd>
                  </div>
                )}
              </dl>

              {job.min_experience_years !== null && (
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  Looking for at least {job.min_experience_years} year
                  {job.min_experience_years === 1 ? '' : 's'} of professional experience — but we
                  read every application, so do not rule yourself out.
                </p>
              )}

              <div className="mt-4 border-t border-line pt-4">
                <BackToJobLink slug={job.slug} />
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-base font-semibold text-ink">What happens next</h2>
              <ol className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
                {[
                  'We read every application within ten working days.',
                  'If it is a fit, we call you for a chat — usually within a week.',
                  'Then a paid half-day in the studio, so you both find out quickly.',
                  'Offer, trial period, and you are on the books.',
                ].map((line, index) => (
                  <li key={line} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blush/60 text-[0.625rem] font-semibold text-bronze-dark">
                      {index + 1}
                    </span>
                    {line}
                  </li>
                ))}
              </ol>
            </Card>
          </aside>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------
function ApplicationConfirmed({
  application,
  job,
}: {
  application: JobApplication
  job: { title: string; slug: string }
}) {
  return (
    <div className="container-page section-y">
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center md:p-10">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-7" aria-hidden />
          </span>

          <p className="eyebrow mb-3">Application received</p>
          <h1 className="display-section">Thank you — it is with us</h1>

          <p className="lede mx-auto mt-4 max-w-lg">
            We have your application for {job.title}. Keep this reference; quote it if you get in
            touch.
          </p>

          <p className="mx-auto mt-6 inline-flex flex-col items-center rounded-lg border border-bronze/30 bg-bronze/[0.06] px-6 py-4">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark">
              Your reference
            </span>
            <span className="mt-1 font-display text-2xl font-semibold tracking-wide text-ink">
              {application.reference}
            </span>
          </p>

          <div className="mt-8 border-t border-line pt-6 text-left">
            <h2 className="font-display text-base font-semibold text-ink">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {[
                {
                  title: 'We read it',
                  body: 'A person reads every application — usually within ten working days.',
                },
                {
                  title: 'A call, if it fits',
                  body: 'We will phone or WhatsApp you for a twenty-minute chat about the role and the studio.',
                },
                {
                  title: 'A paid half-day',
                  body: 'You spend half a day in the salon with the team. You are paid for it, and so are we committing.',
                },
                {
                  title: 'Offer and start',
                  body: 'If it works for both of you, we agree a start date and a trial period.',
                },
              ].map((entry, index) => (
                <li key={entry.title} className="flex gap-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blush/60 text-xs font-semibold text-bronze-dark">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{entry.title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                      {entry.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex flex-col gap-2.5 border-t border-line pt-6 sm:flex-row sm:justify-center">
            <Button asChild size="lg" variant="accent">
              <Link to="/careers">See other open roles</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={`/careers/${job.slug}`}>Back to {job.title}</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted">
            Nothing else to do. We will not add you to a mailing list — if you want studio news, set
            that in your profile after creating an account.
          </p>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  )
}

function ReviewBlock({
  label,
  onEdit,
  children,
  empty,
}: {
  label: string
  onEdit: () => void
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <section className="rounded-lg border border-line p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onEdit}
          className="min-h-11"
        >
          Edit<span className="sr-only"> {label.toLowerCase()}</span>
        </Button>
      </div>
      {empty ? (
        <p className="text-sm text-muted">Nothing answered.</p>
      ) : (
        children
      )}
    </section>
  )
}

function ReviewItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm leading-relaxed break-words text-ink-soft">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bronze-dark underline underline-offset-4"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function labelForQuestion(
  questions: { key: string; label: string }[],
  key: string,
): string {
  return questions.find((question) => question.key === key)?.label ?? key.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_280_000) return `${(bytes / 1_280_000).toFixed(1)} MB`
  if (bytes >= 1_024) return `${Math.max(1, Math.round(bytes / 1_024))} KB`
  return `${bytes} B`
}

function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function ApplySkeleton() {
  return (
    <div className="container-page section-y" aria-hidden>
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5 rounded-lg border border-line bg-surface p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
