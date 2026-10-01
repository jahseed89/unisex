import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, LogOut, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  getProfile,
  listNotificationPreferences,
  qk,
  setNotificationPreference,
  updateProfile,
  type NotificationPreference,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { toE164 } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui'
import {
  HairProfileSection,
  HealthSection,
  NotificationPreferencesSection,
  PersonalSection,
  PrivacySection,
  ProfileFormProvider,
  profileSchema,
  type ProfileValues,
} from '@/features/account/components/ProfileForm'
import type { PrivacyValues } from '@/features/account/components/profileOptions'
import type {
  HairClass,
  HairTexture,
  NotificationChannel,
  Profile,
  UserGender,
} from '@/types'

/**
 * Profile and preferences.
 *
 * Split into three writes on purpose:
 *  - the personal / hair / health sections are one `updateProfile` so a single
 *    "Save changes" is atomic and reports one set of inline errors;
 *  - notification preferences are per-cell writes to `notification_preferences`,
 *    because a failed toggle should not roll back unrelated edits;
 *  - the privacy switches are per-field writes to `profiles` for the same
 *    reason.
 */

const TABS = [
  { value: 'personal', label: 'Personal' },
  { value: 'hair', label: 'Hair profile' },
  { value: 'safety', label: 'Health & safety' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'privacy', label: 'Privacy' },
] as const

type Tab = (typeof TABS)[number]['value']

const DEFAULT_PRIVACY: PrivacyValues = {
  marketing_opt_in: true,
  whatsapp_opt_in: true,
  sms_opt_in: true,
  email_opt_in: true,
}

/** `profiles.phone_e164` → something a Nigerian phone field can display. */
function displayPhone(e164: string | null): string {
  if (!e164) return ''
  const digits = e164.replace(/\D/g, '')
  // 2348031234567 → 0803 123 4567
  if (digits.startsWith('234') && digits.length >= 13) {
    const local = `0${digits.slice(3)}`
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`.trim()
  }
  return e164
}

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('personal')
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useSeo({
    title: 'Your profile',
    description: 'Your details, hair profile, notification preferences and privacy settings.',
    path: '/account/profile',
    noindex: true,
  })

  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: () => getProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const prefsQuery = useQuery({
    queryKey: ['notification-preferences', userId ?? 'anonymous'],
    queryFn: () => listNotificationPreferences(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  })

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      dateOfBirth: '',
      gender: 'prefer_not_to_say',
      bio: '',
      hairClass: 'human',
      hairTexture: 'coily',
      allergies: [],
      accessibilityNeeds: '',
    },
    mode: 'onBlur',
  })

  // Seed the form once the row lands, then leave it alone so an in-progress edit
  // is never overwritten by a background refetch.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    const row = profileQuery.data ?? profile
    if (seeded || !row) return

    form.reset({
      fullName: row.full_name ?? '',
      phone: displayPhone(row.phone_e164),
      dateOfBirth: row.date_of_birth ?? '',
      gender: (row.gender ?? 'prefer_not_to_say') as UserGender,
      bio: row.bio ?? '',
      hairClass: (row.hair_class ?? 'human') as HairClass,
      hairTexture: (row.hair_texture ?? 'coily') as HairTexture,
      allergies: row.allergies ?? [],
      accessibilityNeeds: row.accessibility_needs ?? '',
    })
    setSeeded(true)
  }, [form, profile, profileQuery.data, seeded])

  // --- Privacy (per-field) -------------------------------------------------
  const [privacy, setPrivacy] = useState<PrivacyValues>(DEFAULT_PRIVACY)
  const [pendingPrivacy, setPendingPrivacy] = useState<keyof PrivacyValues | undefined>(undefined)
  const [seededPrivacy, setSeededPrivacy] = useState(false)

  useEffect(() => {
    const row = profileQuery.data ?? profile
    if (seededPrivacy || !row) return
    setPrivacy({
      marketing_opt_in: row.marketing_opt_in,
      whatsapp_opt_in: row.whatsapp_opt_in,
      sms_opt_in: row.sms_opt_in,
      email_opt_in: row.email_opt_in,
    })
    setSeededPrivacy(true)
  }, [profile, profileQuery.data, seededPrivacy])

  const privacyMutation = useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      setPendingPrivacy(Object.keys(patch)[0] as keyof PrivacyValues)
      return updateProfile(userId!, patch)
    },
    onSuccess: () => {
      toast.success('Preference saved')
      setPendingPrivacy(undefined)
      void queryClient.invalidateQueries({ queryKey: qk.profile(userId) })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not save that preference.'))
      setPendingPrivacy(undefined)
      // Snap the switch back to what the server still believes.
      const row = profileQuery.data ?? profile
      if (row) setPrivacy((current) => ({ ...current, ...pick(row) }))
    },
  })

  // --- Save profile --------------------------------------------------------
  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      updateProfile(userId!, {
        full_name: values.fullName,
        phone_e164: values.phone.trim() ? toE164(values.phone.trim()) : null,
        date_of_birth: values.dateOfBirth || null,
        gender: values.gender,
        bio: values.bio.trim() || null,
        hair_class: values.hairClass,
        hair_texture: values.hairTexture,
        allergies: values.allergies,
        accessibility_needs: values.accessibilityNeeds.trim() || null,
        onboarding_step: 'complete',
      }),
    onSuccess: (saved) => {
      toast.success('Profile saved', {
        description: 'Your stylist will see this on every requirement from now on.',
      })
      queryClient.setQueryData(qk.profile(userId), saved)
      void queryClient.invalidateQueries({ queryKey: qk.profile(userId) })
      void form.reset(form.getValues(), { keepDirtyValues: false, keepDefaultValues: false })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not save your profile.'))
    },
  })

  // --- Notification preferences -------------------------------------------
  const [prefOverrides, setPrefOverrides] = useState<Record<string, boolean>>({})
  const [pendingPref, setPendingPref] = useState<string | undefined>(undefined)

  // Reset optimistic overrides whenever a fresh server set arrives.
  useEffect(() => {
    setPrefOverrides({})
  }, [prefsQuery.data])

  const prefValues = useMemo(() => {
    const fromServer: Record<string, boolean> = {}
    for (const row of (prefsQuery.data ?? []) as NotificationPreference[]) {
      fromServer[`${row.type}|${row.channel}`] = row.enabled
    }
    // Missing rows mean "default on", which the section already assumes.
    return { ...fromServer, ...prefOverrides }
  }, [prefsQuery.data, prefOverrides])

  const prefMutation = useMutation({
    mutationFn: ({ type, channel, enabled }: { type: string; channel: NotificationChannel; enabled: boolean }) =>
      setNotificationPreference(userId!, type, channel, enabled),
    onMutate: ({ type, channel, enabled }) => {
      const slot = `${type}|${channel}`
      setPendingPref(slot)
      setPrefOverrides((current) => ({ ...current, [slot]: enabled }))
    },
    onSuccess: (_result, variables) => {
      setPendingPref(undefined)
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences', userId] })
      toast.success('Saved', {
        description: `${variables.channel.replace('_', ' ')} · ${variables.type}`,
      })
    },
    onError: (error, variables) => {
      const slot = `${variables.type}|${variables.channel}`
      // Undo the optimistic flip so the switch matches the server again.
      setPrefOverrides((current) => {
        const next = { ...current }
        delete next[slot]
        return next
      })
      setPendingPref(undefined)
      toast.error(errorMessage(error, 'We could not save that preference.'))
    },
  })

  const row = profileQuery.data ?? profile
  const loading = profileQuery.isLoading && !row

  const dirtyFields = form.formState.dirtyFields
  const hasUnsavedChanges = Object.keys(dirtyFields).length > 0

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2.5">Your details</p>
        <h1 className="display-section">Profile</h1>
        <p className="lede mt-3">
          Saved once, used everywhere. This pre-fills your requirement forms, tells your stylist
          what to plan for, and decides which reminders reach you.
        </p>
      </header>

      {loading && <ProfileSkeleton />}

      {!loading && profileQuery.isError && (
        <Alert
          variant="danger"
          title="We could not load your profile"
          action={
            <Button size="sm" variant="outline" onClick={() => void profileQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(profileQuery.error)}
        </Alert>
      )}

      {!loading && row && (
        <ProfileFormProvider form={form}>
          {/* Tabs ---------------------------------------------------- */}
          <div
            className="flex flex-wrap gap-1.5 border-b border-line pb-3"
            role="tablist"
            aria-label="Profile sections"
          >
            {TABS.map((entry) => {
              const active = tab === entry.value
              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  id={`profile-tab-${entry.value}`}
                  aria-selected={active}
                  aria-controls={`profile-panel-${entry.value}`}
                  onClick={() => setTab(entry.value)}
                  className={cn(
                    'min-h-11 rounded-md px-3.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-ink text-canvas'
                      : 'text-ink-soft hover:bg-sand hover:text-ink',
                  )}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>

          <div
            id={`profile-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`profile-tab-${tab}`}
            tabIndex={-1}
            className="space-y-6"
          >
            {/* --- Personal, hair, safety: one shared form ------------- */}
            {(tab === 'personal' || tab === 'hair' || tab === 'safety') && (
              <form
                noValidate
                className="space-y-6"
                onSubmit={form.handleSubmit((values) => save.mutate(values))}
              >
                <Card className="p-5 md:p-6">
                  {tab === 'personal' && (
                    <PersonalSection
                      email={row.email}
                      phoneVerified={row.phone_verified_at !== null}
                    />
                  )}
                  {tab === 'hair' && <HairProfileSection />}
                  {tab === 'safety' && <HealthSection />}
                </Card>

                <SaveBar
                  isSaving={save.isPending}
                  isDirty={hasUnsavedChanges}
                  onSave={() => form.handleSubmit((values) => save.mutate(values))()}
                  onReset={() => form.reset()}
                  error={save.isError ? errorMessage(save.error) : null}
                />
              </form>
            )}

            {/* --- Notifications --------------------------------------- */}
            {tab === 'notifications' && (
              <Card className="p-5 md:p-6">
                <h2 className="font-display text-lg font-semibold text-ink">
                  How we reach you
                </h2>

                {prefsQuery.isLoading && (
                  <div className="mt-5 space-y-3" aria-hidden>
                    {[0, 1, 2, 3].map((index) => (
                      <Skeleton key={index} className="h-16 rounded-md" />
                    ))}
                  </div>
                )}

                {prefsQuery.isError && (
                  <Alert variant="danger" title="We could not load your preferences" className="mt-5">
                    {errorMessage(prefsQuery.error)}
                  </Alert>
                )}

                {!prefsQuery.isLoading && !prefsQuery.isError && (
                  <div className="mt-4">
                    <NotificationPreferencesSection
                      values={prefValues}
                      pending={pendingPref}
                      onToggle={(type, channel, enabled) =>
                        prefMutation.mutate({ type, channel, enabled })
                      }
                    />
                  </div>
                )}
              </Card>
            )}

            {/* --- Privacy -------------------------------------------- */}
            {tab === 'privacy' && (
              <Card className="p-5 md:p-6">
                <h2 className="font-display text-lg font-semibold text-ink">Privacy & permissions</h2>
                <p className="mt-1 text-sm text-muted">
                  Changes here save immediately — there is nothing to submit.
                </p>
                <div className="mt-4">
                  <PrivacySection
                    values={privacy}
                    pending={pendingPrivacy}
                    onChange={(key, value) => {
                      setPrivacy((current) => ({ ...current, [key]: value }))
                      privacyMutation.mutate({ [key]: value })
                    }}
                  />
                </div>
              </Card>
            )}
          </div>

          {/* --- Danger zone ------------------------------------------ */}
          <Card className="border-danger/25 p-5 md:p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <AlertTriangle className="size-4.5 text-danger" aria-hidden />
              Danger zone
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Signing out clears every cached query on this device. Nothing is deleted — your
              appointments, orders and history stay exactly where they are.
            </p>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <Button variant="outline" size="lg" onClick={() => setSignOutOpen(true)}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
              <Button variant="destructiveOutline" size="lg" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden />
                Delete my account
              </Button>
            </div>
          </Card>
        </ProfileFormProvider>
      )}

      {/* Sign-out confirmation */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Sign out of Unisex Hair Studio?</DialogTitle>
            <DialogDescription>
              You will need your email and password to come back.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              Your bag is kept — it merges back into your account the next time you sign in.
            </p>
            <Field label="Or go somewhere else instead" htmlFor="sign-out-elsewhere">
              <Input id="sign-out-elsewhere" readOnly value={user?.email ?? ''} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutOpen(false)}>
              Stay signed in
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setSignOutOpen(false)
                await signOut()
                navigate('/', { replace: true })
              }}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account deletion — contact route */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete my account</DialogTitle>
            <DialogDescription>
              Deletion is handled by a person, not a button.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              We cannot delete an account from the browser — there are appointment records, tax
              receipts and order history attached to it that have to be dealt with properly first.
              Email us and we will action it within five working days.
            </p>
            <Textarea
              rows={3}
              readOnly
              value={`Subject: Account deletion request — ${row?.email ?? ''}`}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button asChild variant="danger">
              <a href="mailto:hello@unisexhairstudio.com?subject=Account%20deletion%20request">
                Email us
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs leading-relaxed text-muted">
        Need something changed that is not here?{' '}
        <Link to="/contact" className="text-bronze-dark underline underline-offset-4">
          Contact the studio
        </Link>{' '}
        and we will sort it.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save bar
// ---------------------------------------------------------------------------
function SaveBar({
  isSaving,
  isDirty,
  onSave,
  onReset,
  error,
}: {
  isSaving: boolean
  isDirty: boolean
  onSave: () => void
  onReset: () => void
  error: string | null
}) {
  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="danger" title="We could not save your profile">
          {error}
        </Alert>
      )}

      <div
        className={cn(
          'sticky bottom-4 flex flex-col gap-3 rounded-lg border bg-surface/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between',
          isDirty ? 'border-bronze/40 shadow-md' : 'border-line',
        )}
      >
        <p className="text-sm text-muted" aria-live="polite">
          {isSaving
            ? 'Saving…'
            : isDirty
              ? 'You have unsaved changes.'
              : 'Everything here is saved.'}
        </p>

        <div className="flex gap-2.5">
          {isDirty && (
            <Button variant="ghost" size="md" onClick={onReset} disabled={isSaving}>
              Discard
            </Button>
          )}
          <Button
            type="button"
            variant="accent"
            size="lg"
            onClick={onSave}
            disabled={!isDirty}
            loading={isSaving}
            loadingText="Saving…"
          >
            <Save className="size-4" aria-hidden />
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}

function pick(row: {
  marketing_opt_in: boolean
  whatsapp_opt_in: boolean
  sms_opt_in: boolean
  email_opt_in: boolean
}): PrivacyValues {
  return {
    marketing_opt_in: row.marketing_opt_in,
    whatsapp_opt_in: row.whatsapp_opt_in,
    sms_opt_in: row.sms_opt_in,
    email_opt_in: row.email_opt_in,
  }
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-11 w-24 rounded-md" />
        ))}
      </div>
      <div className="space-y-5 rounded-lg border border-line bg-surface p-6">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
