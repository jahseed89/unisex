import { useCallback, useEffect, useRef, useState } from 'react'

import type { RequirementDraft } from '@/types'

/**
 * Requirements draft state.
 *
 * The form is long, so a refresh — or an accidental back out to a service page —
 * must not cost the customer their answers. The text is mirrored into
 * `sessionStorage` (tab-scoped, never sent anywhere) while the reference images
 * stay as `File` objects plus object URLs in memory; those are attached to the
 * requirement once the appointment exists, so they deliberately do not survive
 * a reload.
 */

const STORAGE_KEY = 'uhs:booking-requirement'
export const MAX_IMAGES = 5
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export interface DraftImage {
  id: string
  file: File
  /** Object URL for the local thumbnail. Revoked when the image is dropped. */
  url: string
  name: string
  bytes: number
}

export interface ImageRejection {
  name: string
  reason: string
}

const EMPTY_DRAFT: RequirementDraft = { desired_style: '' }

function readStoredDraft(): RequirementDraft {
  if (typeof sessionStorage === 'undefined') return EMPTY_DRAFT
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw) as Partial<RequirementDraft>
    return { ...EMPTY_DRAFT, ...parsed }
  } catch {
    return EMPTY_DRAFT
  }
}

export interface UseRequirementDraft {
  draft: RequirementDraft
  update: (patch: Partial<RequirementDraft>) => void
  reset: () => void
  toggleGoal: (value: string) => void
  toggleScalpCondition: (value: string) => void
  setAllergies: (value: string) => void
  images: DraftImage[]
  addImages: (files: File[]) => ImageRejection[]
  removeImage: (id: string) => void
}

export function useRequirementDraft(): UseRequirementDraft {
  const [draft, setDraft] = useState<RequirementDraft>(readStoredDraft)
  const [images, setImages] = useState<DraftImage[]>([])
  // Latest-value ref, so callbacks stay stable and the unmount cleanup still
  // knows which object URLs to revoke.
  const imagesRef = useRef<DraftImage[]>([])
  imagesRef.current = images

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // A blocked or full sessionStorage must never break the form.
    }
  }, [draft])

  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.url)
    },
    [],
  )

  const update = useCallback((patch: Partial<RequirementDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }))
  }, [])

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
    setImages((previous) => {
      for (const image of previous) URL.revokeObjectURL(image.url)
      return []
    })
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore — the in-memory reset above is what matters.
    }
  }, [])

  const toggleGoal = useCallback((value: string) => {
    setDraft((previous) => {
      const current = previous.hair_goals ?? []
      return {
        ...previous,
        hair_goals: current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value],
      }
    })
  }, [])

  const toggleScalpCondition = useCallback((value: string) => {
    setDraft((previous) => {
      const current = previous.scalp_conditions ?? []
      // "None of these" is mutually exclusive with every other condition.
      if (value === 'none') {
        return { ...previous, scalp_conditions: current.includes('none') ? [] : ['none'] }
      }
      const withoutNone = current.filter((entry) => entry !== 'none')
      return {
        ...previous,
        scalp_conditions: withoutNone.includes(value)
          ? withoutNone.filter((entry) => entry !== value)
          : [...withoutNone, value],
      }
    })
  }, [])

  const setAllergies = useCallback((value: string) => {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    setDraft((previous) => ({ ...previous, allergies: items }))
  }, [])

  const addImages = useCallback((files: File[]): ImageRejection[] => {
    const rejections: ImageRejection[] = []
    const accepted: File[] = []
    let room = MAX_IMAGES - imagesRef.current.length

    for (const file of files) {
      if (room <= 0) {
        rejections.push({
          name: file.name,
          reason: `Only ${MAX_IMAGES} reference images per booking.`,
        })
        continue
      }
      if (!file.type.startsWith('image/')) {
        rejections.push({ name: file.name, reason: 'That is not an image file.' })
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        rejections.push({ name: file.name, reason: 'Larger than the 10MB limit.' })
        continue
      }
      room -= 1
      accepted.push(file)
    }

    if (accepted.length > 0) {
      const additions: DraftImage[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        bytes: file.size,
      }))
      setImages((previous) => [...previous, ...additions])
    }

    return rejections
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((previous) => {
      const target = previous.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return previous.filter((image) => image.id !== id)
    })
  }, [])

  return { draft, update, reset, toggleGoal, toggleScalpCondition, setAllergies, images, addImages, removeImage }
}

/** "1.4 MB" — used on the upload tiles, so it stays local to the feature. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
