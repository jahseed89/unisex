/**
 * Studio photography — uploaded media.
 *
 * Two ways a photograph reaches the site, and they do not conflict:
 *
 *  - `public/images/**` is the build-time pipeline. Filenames come from
 *    `src/config/media.ts`; `scripts/sync-media-manifest.mjs` records which
 *    exist and the app falls back to its placeholder for the rest. Best for the
 *    hero, the floor, interior shots and the gallery.
 *
 *  - Storage is the runtime pipeline. An administrator uploads through
 *    `uploadStudioPhoto`, the object lands in a public bucket, and a row in
 *    `studio_media` records what it shows. Best for anything tied to a
 *    catalogue record, since that is where an editor is already working.
 *
 * `listMedia` reads the registry. `resolvePhotoUrl` turns a bucket and path
 * into something an `<img>` can load.
 */
import { getSupabase } from '@/lib/supabase/client'
import { select } from './db'
import type { MediaKind } from '@/types'

/** A row of the `studio_media` registry. */
export interface StudioMedia {
  id: string
  bucket: 'gallery' | 'service-images' | 'products' | 'studio'
  path: string
  kind: MediaKind
  alt_text: string
  focal_x: number
  focal_y: number
  intrinsic_width: number | null
  intrinsic_height: number | null
  credit_author: string | null
  credit_license: string | null
  credit_source: string | null
  is_decorative: boolean
  service_id: string | null
  product_id: string | null
  stylist_id: string | null
  display_order: number
  is_published: boolean
  created_at: string
}

/** Bucket ids, mirrored from the storage migration. */
export type MediaBucket = 'gallery' | 'service-images' | 'products' | 'studio'

/**
 * Public URL for a storage object.
 *
 * The project URL comes from the client environment rather than the database:
 * there is no server-side source of truth for it, so assembling the URL here
 * avoids keeping a second copy of the domain next to `VITE_APP_URL`.
 */
export function resolvePhotoUrl(bucket: MediaBucket, path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return ''
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`
}

/**
 * Published photography of a kind, newest first.
 *
 * Falls back to an empty list rather than throwing when Supabase is not
 * configured: a missing registry must not take the gallery down with it, since
 * the build-time manifest can still supply images.
 */
export async function listMedia(kind?: MediaKind): Promise<StudioMedia[]> {
  try {
    return await select<StudioMedia>('studio_media', {
      filters: { is_published: true, ...(kind ? { kind } : {}) },
      order: { column: 'display_order', ascending: true },
      range: { from: 0, to: 199 },
    })
  } catch {
    return []
  }
}

/** Every unpublished entry too — the administrator's review queue. */
export async function listMediaForAdmin(): Promise<StudioMedia[]> {
  return select<StudioMedia>('studio_media', {
    order: { column: 'created_at', ascending: false },
    range: { from: 0, to: 199 },
  })
}

export interface UploadPhotoInput {
  file: File
  bucket: MediaBucket
  kind: MediaKind
  /**
   * Describes the frame. Required even though the type cannot enforce it: an
   * image with no alt text is invisible to a screen reader, and the database
   * rejects blanks, so the failure should surface at the form rather than as a
   * constraint violation.
   */
  alt: string
  focal?: { x: number; y: number }
  intrinsic?: { width: number; height: number }
  credit?: { author: string; license: string; source: string }
  serviceId?: string | null
  productId?: string | null
  stylistId?: string | null
  isPublished?: boolean
}

export interface UploadedPhoto {
  id: string
  url: string
  path: string
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/**
 * Uploads a photograph and registers it.
 *
 * The object is written before the registry row. If the insert then fails the
 * object is removed again, because an unreferenced file in a public bucket is
 * still reachable by URL and would outlive the failed attempt.
 */
export async function uploadStudioPhoto(input: UploadPhotoInput): Promise<UploadedPhoto> {
  const { file, bucket, kind, alt } = input

  const extension = MIME_EXTENSIONS[file.type]
  if (!extension) {
    throw new Error(
      `${file.type || 'That file type'} is not supported. Upload a JPEG, PNG, WebP or AVIF image.`,
    )
  }

  const altText = alt.trim()
  if (!altText) {
    throw new Error('Describe what is in the photograph — it is read aloud to screen reader users.')
  }

  const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`
  const supabase = getSupabase()

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: '31536000', upsert: false })

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  const row = {
    bucket,
    path,
    kind,
    alt_text: altText,
    focal_x: input.focal?.x ?? 0.5,
    focal_y: input.focal?.y ?? 0.5,
    intrinsic_width: input.intrinsic?.width ?? null,
    intrinsic_height: input.intrinsic?.height ?? null,
    credit_author: input.credit?.author ?? null,
    credit_license: input.credit?.license ?? null,
    credit_source: input.credit?.source ?? null,
    service_id: input.serviceId ?? null,
    product_id: input.productId ?? null,
    stylist_id: input.stylistId ?? null,
    is_published: input.isPublished ?? false,
  }

  const { data, error: insertError } = await supabase
    .from('studio_media')
    .insert(row)
    .select('id')
    .single()

  if (insertError) {
    // Roll the object back so a failed upload leaves nothing behind.
    await supabase.storage.from(bucket).remove([path]).catch(() => undefined)
    throw new Error(`Could not register the photograph: ${insertError.message}`)
  }

  return { id: (data as { id: string }).id, url: resolvePhotoUrl(bucket, path), path }
}

/** Retires a photograph and deletes the underlying object. */
export async function deleteStudioPhoto(media: Pick<StudioMedia, 'id' | 'bucket' | 'path'>): Promise<void> {
  const supabase = getSupabase()

  // Registry row first: a dangling object is invisible and harmless, whereas a
  // registry row pointing at a deleted object renders as a broken image.
  const { error } = await supabase.from('studio_media').delete().eq('id', media.id)
  if (error) throw new Error(`Could not remove the photograph: ${error.message}`)

  await supabase.storage.from(media.bucket).remove([media.path]).catch(() => undefined)
}

/**
 * Everything still owed attribution, for the footer credits disclosure.
 *
 * Only borrowed photography appears. The studio's own work needs no credit, so
 * in the normal case this returns nothing and the credits link stays hidden.
 */
export async function listCredits(): Promise<
  Array<{ file: string; author: string; license: string; source: string }>
> {
  const rows = await listMedia()
  return rows
    .filter((row) => row.credit_author && row.credit_license && row.credit_source)
    .map((row) => ({
      file: `${row.bucket}/${row.path}`,
      author: row.credit_author!,
      license: row.credit_license!,
      source: row.credit_source!,
    }))
}