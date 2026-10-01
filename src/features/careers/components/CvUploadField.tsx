import { useRef, useState } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'

import { errorMessage } from '@/lib/supabase/errors'
import { Button } from '@/components/ui'
import { formatFileSize } from '@/features/account/components/accountUi'
import type { CvUpload } from '@/lib/api'

/**
 * CV picker.
 *
 * Validation happens in `uploadCv` (extension, MIME, 10 MB ceiling) so the rules
 * live in one place; this component only previews what came back and gives the
 * candidate a way to remove it. Guests are allowed — the upload path simply
 * lands in a random folder they cannot read back.
 */

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function CvUploadField({
  value,
  onChange,
  onUpload,
  uploading,
  error,
  hint,
}: {
  value: CvUpload | null
  onChange: (value: CvUpload | null) => void
  onUpload: (file: File) => void
  uploading: boolean
  error: string | null
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const pick = (file: File | undefined) => {
    setLocalError(null)
    if (!file) return

    // Cheap client-side checks first, so an obvious mistake never uploads.
    if (file.size > MAX_BYTES) {
      setLocalError(`That file is ${formatFileSize(file.size)}. The limit is 10 MB.`)
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['pdf', 'doc', 'docx'].includes(extension)) {
      setLocalError('Please upload a PDF or Word document (.pdf, .doc or .docx).')
      return
    }

    onUpload(file)
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[0.8125rem] font-medium text-ink-soft">CV / résumé</p>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-success/25 bg-success/[0.06] p-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-success">
            <FileText className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{value.fileName}</p>
            <p className="mt-0.5 text-xs text-muted">
              {formatFileSize(value.bytes)} · uploaded and ready to send
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 hover:text-danger"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove
            <span className="sr-only"> {value.fileName}</span>
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-describedby="cv-hint"
          className="flex min-h-[6rem] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-sand/40 px-4 py-6 text-center transition-colors hover:border-bronze hover:bg-sand/70 disabled:opacity-60"
        >
          <Upload className="size-5 text-bronze" aria-hidden />
          <span className="text-sm font-medium text-ink">
            {uploading ? 'Uploading…' : 'Choose a file or drop it here'}
          </span>
          <span className="text-xs text-muted">PDF or Word · up to 10 MB</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Upload your CV"
        disabled={uploading}
        onChange={(event) => {
          pick(event.target.files?.[0])
        }}
      />

      <p id="cv-hint" className="text-xs leading-relaxed text-muted">
        {localError ? (
          <span role="alert" className="text-danger">
            {localError}
          </span>
        ) : error ? (
          <span role="alert" className="text-danger">
            {errorMessage(error, 'That upload failed. Please try again.')}
          </span>
        ) : (
          hint ??
          'A one-page CV is fine. If you have a portfolio or Instagram, the links step above matters more than the CV.'
        )}
      </p>
    </div>
  )
}
