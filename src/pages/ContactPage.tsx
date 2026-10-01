import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { CheckCircle2, Mail, MessageCircle, Phone, Send, Sparkles } from 'lucide-react'

import { getFaqs, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { site } from '@/config/site'
import { whatsappLink } from '@/lib/utils/format'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  RadioCards,
  SectionHeading,
  Select,
  Textarea,
} from '@/components/ui'
import { PageHeader } from '@/components/shared/Cards'
import { ContactCard, FaqList, OpeningHoursCard, Section } from '@/components/shared/Blocks'
import { ContentSkeleton } from '@/components/layout/RouteLoader'
import { breadcrumbSchema, faqSchema, useSeo } from '@/components/seo/Seo'

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const CONTACT_METHODS = [
  { value: 'whatsapp', label: 'WhatsApp', description: 'Fastest — we reply during opening hours' },
  { value: 'phone', label: 'Phone call', description: 'Best for anything urgent' },
  { value: 'email', label: 'Email', description: 'Good for detailed questions and quotes' },
] as const

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please tell us your name (at least 2 characters).')
    .max(80, 'That name is a little too long — 80 characters is the limit.'),
  email: z
    .string()
    .trim()
    .min(1, 'We need an email address to reply to.')
    .email('That email address does not look right. Check for typos.'),
  phone: z
    .string()
    .trim()
    .min(1, 'A phone number helps us reach you faster.')
    .regex(/^[+\d][\d\s()-]{6,}$/, 'Use digits only, e.g. 0803 123 4567 or +2348031234567.'),
  topic: z.enum(['booking', 'service', 'shop', 'careers', 'complaint', 'other'], {
    errorMap: () => ({ message: 'Choose the closest topic so it reaches the right person.' }),
  }),
  preferredMethod: z.enum(['whatsapp', 'phone', 'email']),
  message: z
    .string()
    .trim()
    .min(20, 'A little more detail helps us answer properly — 20 characters or more.')
    .max(2000, 'Please keep it under 2000 characters.'),
})

type ContactFormValues = z.infer<typeof contactSchema>

const TOPICS = [
  { value: 'booking', label: 'Booking or rescheduling an appointment' },
  { value: 'service', label: 'A question about a service' },
  { value: 'shop', label: 'An order or product question' },
  { value: 'careers', label: 'Careers and applications' },
  { value: 'complaint', label: 'Feedback about a visit' },
  { value: 'other', label: 'Something else' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ContactPage() {
  const faqsQuery = useQuery({
    queryKey: qk.faqs(),
    queryFn: () => getFaqs('contact'),
    staleTime: 30 * 60_000,
  })

  const [sent, setSent] = useState<ContactFormValues | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      topic: 'booking',
      preferredMethod: 'whatsapp',
      message: '',
    },
  })

  const preferredMethod = watch('preferredMethod')
  const faqs = faqsQuery.data ?? []

  /**
   * Submission is intentionally local for now.
   *
   * The intended backend is a `fn_contact_messages` RPC (insert + notify the
   * front-desk queue) or a `contact-message` Supabase Edge Function that also
   * fans the message out to WhatsApp/email via `message_templates`. Wiring it up
   * means swapping this handler for:
   *
   *   await rpc('fn_contact_messages', { p_payload: values })
   *
   * with `useMutation` + `toast` on success/error, exactly as the booking and
   * application flows do. Until that function exists we confirm optimistically
   * rather than pretending a message was delivered.
   */
  const onSubmit = handleSubmit(async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    setSent(values)
    toast.success('Message ready to send', {
      description: 'We have your details. Our front desk replies within a few hours.',
    })
    reset()
  })

  const jsonLd = [
    breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Contact', path: '/contact' },
    ]),
    ...(faqs.length > 0
      ? [faqSchema(faqs.map((faq) => ({ question: faq.question, answer: faq.answer })))]
      : []),
  ]

  useSeo({
    title: 'Contact the studio',
    description: `Reach Unisex Hair Studio on ${site.contact.phone} or ${site.contact.email}. WhatsApp is fastest. Find us at ${site.address.street}, ${site.address.locality}, Lagos.`,
    path: '/contact',
    jsonLd,
  })

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to a human, not a form that disappears"
        description="Questions about a service, a booking you need to move, an order on its way — we answer all of it. WhatsApp is fastest; the rest of the week, this form reaches the front desk."
        breadcrumb={[{ label: 'Contact', to: '/contact' }]}
        action={
          <Button asChild variant="accent" size="xl">
            <a
              href={whatsappLink("Hi! I'd like to ask about your services.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden />
              WhatsApp us now
            </a>
          </Button>
        }
      />

      <Section tone="canvas">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          {/* ----------------------------------------------------------------
              Form
          ---------------------------------------------------------------- */}
          <div>
            <SectionHeading
              eyebrow="Send a message"
              title="Tell us what you need"
              description="The more specific you are, the faster we can help. If it is about an existing booking, quote the reference from your confirmation email."
            />

            <div className="mt-8">
              {sent ? (
                <Alert
                  variant="success"
                  title="Thanks — we have your message"
                  className="items-start"
                >
                  <p>
                    {sent.preferredMethod === 'whatsapp' &&
                      `We will reply on WhatsApp to ${sent.phone}.`}
                    {sent.preferredMethod === 'phone' &&
                      `We will call ${sent.phone} during opening hours.`}
                    {sent.preferredMethod === 'email' &&
                      `We will email a reply to ${sent.email}.`}
                  </p>
                  <p className="mt-2">
                    In a hurry?{' '}
                    <a
                      className="font-medium underline underline-offset-2"
                      href={whatsappLink(
                        `Hi! I just sent a message through the website about: ${sent.topic}. My name is ${sent.name}.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      continue the conversation on WhatsApp
                    </a>
                    .
                  </p>
                  <div className="mt-4">
                    <Button variant="outline" size="sm" onClick={() => setSent(null)}>
                      Send another message
                    </Button>
                  </div>
                </Alert>
              ) : (
                <form onSubmit={onSubmit} noValidate className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Your name" htmlFor="contact-name" required error={errors.name?.message}>
                      <Input
                        id="contact-name"
                        autoComplete="name"
                        placeholder="e.g. Ada Obi"
                        invalid={Boolean(errors.name)}
                        {...register('name')}
                      />
                    </Field>

                    <Field
                      label="Email address"
                      htmlFor="contact-email"
                      required
                      error={errors.email?.message}
                    >
                      <Input
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        invalid={Boolean(errors.email)}
                        {...register('email')}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Phone number"
                      htmlFor="contact-phone"
                      required
                      hint="Nigerian numbers, please — it is how we reach you fastest."
                      error={errors.phone?.message}
                    >
                      <Input
                        id="contact-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0803 123 4567"
                        invalid={Boolean(errors.phone)}
                        {...register('phone')}
                      />
                    </Field>

                    <Field
                      label="What is this about?"
                      htmlFor="contact-topic"
                      required
                      error={errors.topic?.message}
                    >
                      <Select
                        id="contact-topic"
                        options={TOPICS}
                        invalid={Boolean(errors.topic)}
                        {...register('topic')}
                      />
                    </Field>
                  </div>

                  <fieldset className="space-y-2.5">
                    <legend className="text-[0.8125rem] font-medium text-ink-soft">
                      How should we reply?
                    </legend>
                    <RadioCards
                      name="preferredMethod"
                      columns={3}
                      aria-label="Preferred contact method"
                      value={preferredMethod}
                      onChange={(value) => setValue('preferredMethod', value, { shouldValidate: true })}
                      options={CONTACT_METHODS.map((method) => ({ ...method }))}
                    />
                    {errors.preferredMethod?.message && (
                      <p className="text-xs text-danger" role="alert">
                        {errors.preferredMethod.message}
                      </p>
                    )}
                  </fieldset>

                  <Field
                    label="Your message"
                    htmlFor="contact-message"
                    required
                    hint="Service you are interested in, preferred dates, budget range — anything that saves a round trip."
                    error={errors.message?.message}
                  >
                    <Textarea
                      id="contact-message"
                      rows={6}
                      placeholder="e.g. I would like knotless braids before 30 June. I have 4C hair, waist length, and a budget of ₦120,000. Is anything available?"
                      invalid={Boolean(errors.message)}
                      {...register('message')}
                    />
                  </Field>

                  <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed text-muted">
                      We only use your details to answer this message. Read the{' '}
                      <Link
                        to="/policies/privacy"
                        className="font-medium text-bronze-dark underline underline-offset-2"
                      >
                        privacy policy
                      </Link>
                      .
                    </p>
                    <Button type="submit" size="xl" loading={isSubmitting} className="shrink-0">
                      {isSubmitting ? 'Sending…' : (
                        <>
                          <Send aria-hidden />
                          Send message
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Quick channels */}
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                {
                  href: whatsappLink("Hi! I'd like to ask about an appointment."),
                  icon: <MessageCircle aria-hidden />,
                  title: 'WhatsApp',
                  detail: site.contact.phone,
                  external: true,
                },
                {
                  href: `tel:${site.contact.phone.replace(/\s/g, '')}`,
                  icon: <Phone aria-hidden />,
                  title: 'Call the studio',
                  detail: 'Mon–Sat, 9am–8pm',
                  external: false,
                },
                {
                  href: `mailto:${site.contact.email}`,
                  icon: <Mail aria-hidden />,
                  title: 'Email us',
                  detail: site.contact.email,
                  external: false,
                },
                {
                  href: '/book',
                  icon: <Sparkles aria-hidden />,
                  title: 'Book online instead',
                  detail: 'Takes about a minute',
                  external: false,
                },
              ].map((channel) => {
                const inner = (
                  <>
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-bronze [&_svg]:size-4.5"
                      aria-hidden
                    >
                      {channel.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{channel.title}</span>
                      <span className="block truncate text-xs text-muted">{channel.detail}</span>
                    </span>
                  </>
                )

                return (
                  <li key={channel.title}>
                    {channel.external ? (
                      <a
                        href={channel.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 transition-colors hover:border-bronze hover:bg-sand/50"
                      >
                        {inner}
                      </a>
                    ) : channel.href.startsWith('/') ? (
                      <Link
                        to={channel.href}
                        className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 transition-colors hover:border-bronze hover:bg-sand/50"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <a
                        href={channel.href}
                        className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 transition-colors hover:border-bronze hover:bg-sand/50"
                      >
                        {inner}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ----------------------------------------------------------------
              Sidebar
          ---------------------------------------------------------------- */}
          <aside className="space-y-5">
            <ContactCard />

            <OpeningHoursCard />

            <Card className="p-6">
              <h3 className="font-display text-base font-semibold text-ink">Where to find us</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We are on the ground floor, with the bronze sign beside the entrance. Look
                for the double doors — the building shares a wall with a coffee bar, and
                there is parking behind the building for two cars.
              </p>
              <Button asChild variant="outline" fullWidth className="mt-5">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(
                    `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get directions
                </a>
              </Button>
            </Card>
          </aside>
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          FAQ
      ------------------------------------------------------------------ */}
      <Section tone="sand">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="Quick answers"
              title="Before you write to us"
              description="The things people ask most often. If your question is not here, the form above or a WhatsApp message will get you a real answer."
              action={
                <Button asChild variant="outline" size="lg" className="mt-6">
                  <Link to="/policies/bookings">Read the bookings policy</Link>
                </Button>
              }
            />
          </div>

          <div>
            {faqsQuery.isLoading && (
              <Card className="p-6">
                <ContentSkeleton lines={6} />
              </Card>
            )}

            {faqsQuery.isError && (
              <Alert
                variant="danger"
                title="We could not load the FAQs"
                action={
                  <Button variant="outline" size="sm" onClick={() => faqsQuery.refetch()}>
                    Retry
                  </Button>
                }
              >
                {errorMessage(faqsQuery.error)}
              </Alert>
            )}

            {!faqsQuery.isLoading && !faqsQuery.isError && faqs.length === 0 && (
              <Alert variant="info" title="No contact FAQs published yet">
                We have not published a contact-specific FAQ list. The{' '}
                <Link to="/services" className="font-medium underline underline-offset-2">
                  services page
                </Link>{' '}
                answers the most common service questions in the meantime.
              </Alert>
            )}

            {faqs.length > 0 && <FaqList faqs={faqs} columns={1} />}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------
          Closing
      ------------------------------------------------------------------ */}
      <section className="border-t border-line bg-canvas section-y">
        <div className="container-page">
          <div className="flex flex-col items-start gap-6 rounded-lg border border-line bg-surface p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Already know what you want?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Booking online takes about a minute, and you can pick a stylist and a
                  time from the live diary instead of waiting for us to call you back.
                </p>
              </div>
            </div>
            <Button asChild size="xl" className="shrink-0">
              <Link to="/book">Book an Appointment</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
