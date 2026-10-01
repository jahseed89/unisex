import { useRef, useState } from 'react'
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react'

import { Alert, Button } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import {
  MAX_IMAGES,
  formatBytes,
  type DraftImage,
  type ImageRejection,
} from './useRequirementDraft'

export interface ReferenceUploaderProps {
  images: DraftImage[]
  onAdd: (files: File[]) => ImageRejection[]
  onRemove: (id: string) => void
}

/**
 * Reference images.
 *
 * The files are never uploaded from this step — they travel with the booking as
 * `File` objects and are attached to the requirement server-side once the
 * appointment exists. Previews come from `URL.createObjectURL`, which is revoked
 * as soon as an image is removed.
 */
export function ReferenceUploader({ images, onAdd, onRemove }: ReferenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rejections, setRejections] = useState<ImageRejection[]>([])
  const isFull = images.length >= MAX_IMAGES

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setRejections(onAdd(Array.from(files)))
    // Allow re-picking the same file after a rejection.
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!isFull) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (isFull) {
            setRejections([
              {
                name: 'Those files',
                reason: `Only ${MAX_IMAGES} reference images per booking.`,
              },
            ])
            return
          }
          handleFiles(event.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-6 text-center transition-colors duration-200',
          isDragging ? 'border-bronze bg-bronze/[0.06]' : 'border-line-strong bg-sand/40',
          isFull && 'opacity-60',
        )}
      >
        <UploadCloud className="mx-auto size-6 text-bronze" aria-hidden />
        <p className="mt-2.5 text-sm font-medium text-ink">
          Drag photos here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isFull}
            className="font-medium text-bronze-dark underline underline-offset-4 disabled:cursor-not-allowed disabled:no-underline"
          >
            choose files
          </button>
        </p>
        <p className="mt-1 text-xs text-muted">
          Up to {MAX_IMAGES} images, 10MB each. Your stylist sees these before the appointment.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Reference images"
          onChange={(event) => handleFiles(event.target.files)}
          disabled={isFull}
        />
      </div>

      {rejections.length > 0 && (
        <Alert
          variant="warning"
          title="Some files were not added"
          action={
            <Button size="sm" variant="ghost" onClick={() => setRejections([])}>
              Dismiss
            </Button>
          }
        >
          <ul className="space-y-1">
            {rejections.map((rejection, index) => (
              <li key={`${rejection.name}-${index}`}>
                <span className="font-medium">{rejection.name}</span> — {rejection.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id} className="group relative">
              <img
                src={image.url}
                alt={`Reference ${index + 1}: ${image.name}`}
                className="aspect-square w-full rounded-md border border-line object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(image.id)}
                aria-label={`Remove reference ${index + 1}, ${image.name}`}
                className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-full bg-ink/80 text-canvas transition-colors hover:bg-danger"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
              <p className="mt-1 truncate text-[0.625rem] text-muted">{formatBytes(image.bytes)}</p>
            </li>
          ))}
          {!isFull && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-muted transition-colors hover:border-bronze hover:text-bronze-dark"
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-[0.625rem] font-medium">Add more</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
