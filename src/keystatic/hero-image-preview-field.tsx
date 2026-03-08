import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import {
  useFileUpload,
  dropZoneOverlayStyle,
  dropZoneOverlayTextStyle,
  statusMessageStyle,
  fileInputWrapperStyle,
  fileInputLabelStyle,
  hiddenInputStyle,
} from './use-file-upload'
import {
  storePendingFile,
  getAllPendingFiles,
  deletePendingFile,
  rekeyPendingFile,
  cleanupStaleFiles,
} from './pending-file-store'

// ── Types ────────────────────────────────────────────────────────────────────

interface HeroImagePreviewFieldConfig {
  label: string
  description?: string
}

// ── Styles ───────────────────────────────────────────────────────────────────

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate9)',
  lineHeight: '1.4',
}

const imageWrapperStyle: CSSProperties = {
  position: 'relative',
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  maxWidth: '480px',
}

const imageStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 'auto',
  maxHeight: '270px',
  objectFit: 'cover',
}

const filenameStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: '11px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: 'var(--kui-color-scale-slate9)',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  borderTop: '1px solid var(--kui-color-scale-slate5)',
}

const emptyDropZoneStyle: CSSProperties = {
  position: 'relative',
  padding: '32px 16px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate8)',
  textAlign: 'center',
  border: '2px dashed var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  maxWidth: '480px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background-color 0.15s',
}

const emptyDropZoneActiveStyle: CSSProperties = {
  ...emptyDropZoneStyle,
  borderColor: 'var(--kui-color-scale-amber7)',
  backgroundColor: 'var(--kui-color-scale-amber3)',
}

const localPreviewBadgeStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate9)',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  borderTop: '1px solid var(--kui-color-scale-slate5)',
  fontStyle: 'italic',
}

const removeButtonStyle: CSSProperties = {
  padding: '5px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#dc2626',
  backgroundColor: 'transparent',
  border: '1px solid #fca5a5',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.15s, border-color 0.15s',
}

// ── Image extensions to probe ────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'webp', 'png']

// ── Helpers ──────────────────────────────────────────────────────────────────

function getHeroSlug(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/keystatic\/collection\/heroes\/item\/([^/]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function isCreateMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.includes('/keystatic/collection/heroes/create')
}

function findSlugInput(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null
  const slugInputs = document.querySelectorAll<HTMLInputElement>('input[name="slug"]')
  if (slugInputs.length === 1) return slugInputs[0]
  const allInputs = document.querySelectorAll<HTMLInputElement>('input')
  for (const input of allInputs) {
    if (input.readOnly && input.value && /^[a-z0-9-]+$/.test(input.value)) {
      const parent = input.closest('[data-field]')
      if (parent?.getAttribute('data-field') === 'slug') return input
    }
  }
  return null
}

/** Extract extension from a filename hint (e.g. "image.jpg" → "jpg"). */
function extFromHint(hint: string): string | null {
  if (!hint) return null
  const parts = hint.split('.')
  if (parts.length < 2) return null
  return parts[parts.length - 1].toLowerCase()
}

// ── Preview component ────────────────────────────────────────────────────────

function HeroImagePreview({
  description,
  storedFilename,
  onFilenameChange,
}: HeroImagePreviewFieldConfig & {
  storedFilename: string
  onFilenameChange: (filename: string) => void
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageFilename, setImageFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState<string | null>(null)
  const [createSlug, setCreateSlug] = useState<string | null>(null)
  const [inCreateMode, setInCreateMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [localRecoveryUrl, setLocalRecoveryUrl] = useState<string | null>(null)
  const prevPendingKeyRef = useRef<string | null>(null)

  const effectiveSlug = slug ?? createSlug

  // ── Slug detection ────────────────────────────────────────────────────────

  useEffect(() => {
    const s = getHeroSlug()
    if (s) {
      setSlug(s)
    } else if (isCreateMode()) {
      setInCreateMode(true)
    }
    setLoading(false)
  }, [])

  // In create mode, observe the slug input in the DOM
  useEffect(() => {
    if (!inCreateMode) return

    const syncSlug = () => {
      const input = findSlugInput()
      if (input?.value) setCreateSlug(input.value)
    }

    syncSlug()
    const observer = new MutationObserver(() => syncSlug())
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] })
    const interval = setInterval(syncSlug, 500)

    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [inCreateMode])

  // ── Pending file recovery ─────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return

    cleanupStaleFiles().catch(() => {})

    const prefix = `heroes/${slug}/`
    getAllPendingFiles(prefix)
      .then((files) => {
        for (const pf of files) {
          const url = URL.createObjectURL(pf.blob)
          setLocalRecoveryUrl(url)
          onFilenameChange(pf.fileName)

          const ext = pf.fileName.includes('.') ? pf.fileName.split('.').pop() : 'jpg'
          const dest = `heroes/${slug}/image.${ext}`

          fetch(`/api/dev/file-upload?dest=${encodeURIComponent(dest)}`, {
            method: 'PUT',
            body: pf.blob,
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.ok) {
                deletePendingFile(pf.key).catch(() => {})
                setTimeout(() => setRefreshKey((k) => k + 1), 1500)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [slug, onFilenameChange])

  // ── Upload logic ──────────────────────────────────────────────────────────

  const buildDestPath = useCallback(
    (file: File) => {
      if (!slug) return null
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      return `heroes/${slug}/image.${ext}`
    },
    [slug],
  )

  const onUploadSuccess = useCallback(
    (data: { path: string }) => {
      const filename = data.path.split('/').pop() ?? ''
      onFilenameChange(filename)
      setTimeout(() => setRefreshKey((k) => k + 1), 1500)
    },
    [onFilenameChange],
  )

  const {
    state: uploadState,
    dropZoneProps,
    onFileInputChange,
    dragOver,
    localPreviewUrl,
    pendingFile,
    clearLocalPreview,
  } = useFileUpload({
    buildDestPath,
    accept: 'image/jpeg,image/png,image/webp',
    onSuccess: onUploadSuccess,
  })

  // ── Create mode: store pending file in IndexedDB ──────────────────────────

  useEffect(() => {
    if (!inCreateMode || !pendingFile || !effectiveSlug) return

    const ext = pendingFile.name.includes('.') ? pendingFile.name.split('.').pop() : 'jpg'
    const filename = `image.${ext}`
    const key = `heroes/${effectiveSlug}/image`

    if (prevPendingKeyRef.current && prevPendingKeyRef.current !== key) {
      rekeyPendingFile(prevPendingKeyRef.current, key).catch(() => {})
    }
    prevPendingKeyRef.current = key

    storePendingFile(key, pendingFile).catch(() => {})
    onFilenameChange(filename)
  }, [inCreateMode, pendingFile, effectiveSlug, onFilenameChange])

  // ── Remove handler ──────────────────────────────────────────────────────

  const [removing, setRemoving] = useState(false)

  const handleRemove = useCallback(async () => {
    if (!slug) return

    const filePath = `heroes/${slug}/image.jpg`
    setRemoving(true)
    try {
      const res = await fetch(`/api/dev/file-upload?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.ok) {
        onFilenameChange('')
        clearLocalPreview()
        setImageSrc(null)
        setImageFilename(null)
      }
    } catch {
      // Silently fail
    } finally {
      setRemoving(false)
    }
  }, [slug, onFilenameChange, clearLocalPreview])

  // ── Hint-first image probing ──────────────────────────────────────────────

  useEffect(() => {
    if (!effectiveSlug) return

    setLoading(true)

    const tryExtension = (ext: string): Promise<string | null> =>
      new Promise((resolve) => {
        const url = `/hero/${effectiveSlug}/image.${ext}?t=${refreshKey}`
        const img = new window.Image()
        img.onload = () => resolve(ext)
        img.onerror = () => resolve(null)
        img.src = url
      })

    const probe = async () => {
      // Try hint from stored filename first (avoids 3 unnecessary 404s)
      const hintExt = extFromHint(storedFilename)
      if (hintExt && IMAGE_EXTENSIONS.includes(hintExt)) {
        const result = await tryExtension(hintExt)
        if (result) {
          setImageSrc(`/hero/${effectiveSlug}/image.${result}?t=${refreshKey}`)
          setImageFilename(`image.${result}`)
          setLoading(false)
          return
        }
      }

      // Hint failed or empty — probe all extensions in parallel (excluding already-tried hint)
      const remaining = IMAGE_EXTENSIONS.filter((e) => e !== hintExt)
      const results = await Promise.all(remaining.map(tryExtension))
      const found = results.find((r) => r !== null)
      if (found) {
        // Don't call onFilenameChange here — that would mark the form dirty
        // just from opening the page. The hint is stored on explicit upload only.
        setImageSrc(`/hero/${effectiveSlug}/image.${found}?t=${refreshKey}`)
        setImageFilename(`image.${found}`)
      } else {
        setImageSrc(null)
        setImageFilename(null)
      }
      setLoading(false)
    }

    probe()
  }, [effectiveSlug, refreshKey, storedFilename])

  // Track whether a generated image existed before the most recent upload.
  // First upload: dismiss local preview once the probe finds a new image.
  // Replacement: keep local preview (the probe would show the stale old image).
  const hadImageBeforeUploadRef = useRef(false)

  useEffect(() => {
    if (localPreviewUrl) {
      hadImageBeforeUploadRef.current = imageSrc !== null
    }
  }, [localPreviewUrl]) // intentionally excludes imageSrc — snapshot at drop time only

  useEffect(() => {
    if (localPreviewUrl && imageSrc && !hadImageBeforeUploadRef.current) {
      clearLocalPreview()
    }
    if (localRecoveryUrl && imageSrc) {
      URL.revokeObjectURL(localRecoveryUrl)
      setLocalRecoveryUrl(null)
    }
  }, [imageSrc, localPreviewUrl, clearLocalPreview, localRecoveryUrl])

  // ── Render ────────────────────────────────────────────────────────────────

  // Local preview always takes priority when set
  const activePreviewUrl = localPreviewUrl ?? localRecoveryUrl
  const showLocalPreview = activePreviewUrl !== null
  const showSourcePreview = imageSrc !== null && !showLocalPreview
  const canUpload = effectiveSlug !== null
  const canRemove = slug !== null && (showSourcePreview || showLocalPreview) && !removing

  if (loading) {
    return (
      <div style={wrapperStyle}>
        {description && <p style={descriptionStyle}>{description}</p>}
        <div style={emptyDropZoneStyle}>Loading image preview...</div>
      </div>
    )
  }

  const statusMsg =
    uploadState.status !== 'idle' && uploadState.message ? (
      <div style={statusMessageStyle(uploadState.status)}>{uploadState.message}</div>
    ) : null

  const fileInput = canUpload ? (
    <div style={fileInputWrapperStyle}>
      <label style={fileInputLabelStyle}>
        {showSourcePreview || showLocalPreview ? 'Replace' : 'Choose file'}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileInputChange}
          style={hiddenInputStyle}
        />
      </label>
      {canRemove && (
        <button
          type="button"
          style={removeButtonStyle}
          onClick={handleRemove}
          disabled={removing}
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      )}
      {!showSourcePreview && !showLocalPreview && (
        <span style={{ fontSize: '12px', color: 'var(--kui-color-scale-slate8)' }}>or drag and drop</span>
      )}
    </div>
  ) : null

  if (showSourcePreview) {
    return (
      <div style={wrapperStyle}>
        {description && <p style={descriptionStyle}>{description}</p>}
        <div style={imageWrapperStyle} {...(canUpload ? dropZoneProps : {})}>
          <img src={imageSrc!} alt="Hero preview" style={imageStyle} />
          {dragOver && (
            <div style={dropZoneOverlayStyle}>
              <span style={dropZoneOverlayTextStyle}>Drop to replace</span>
            </div>
          )}
          <div style={filenameStyle}>{imageFilename}</div>
          {statusMsg}
        </div>
        {fileInput}
      </div>
    )
  }

  if (showLocalPreview) {
    return (
      <div style={wrapperStyle}>
        {description && <p style={descriptionStyle}>{description}</p>}
        <div style={imageWrapperStyle} {...(canUpload ? dropZoneProps : {})}>
          <img src={activePreviewUrl!} alt="Hero preview (source image)" style={imageStyle} />
          {dragOver && (
            <div style={dropZoneOverlayStyle}>
              <span style={dropZoneOverlayTextStyle}>Drop to replace</span>
            </div>
          )}
          <div style={localPreviewBadgeStyle}>
            {inCreateMode ? 'Queued — will upload on save' : 'Source image — awaiting processing'}
          </div>
          {statusMsg}
        </div>
        {fileInput}
      </div>
    )
  }

  // Empty state
  return (
    <div style={wrapperStyle}>
      {description && <p style={descriptionStyle}>{description}</p>}
      <div
        style={dragOver ? emptyDropZoneActiveStyle : emptyDropZoneStyle}
        {...(canUpload ? dropZoneProps : {})}
        onClick={canUpload ? () => fileInputRef.current?.click() : undefined}
        role={canUpload ? 'button' : undefined}
        tabIndex={canUpload ? 0 : undefined}
        onKeyDown={
          canUpload
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }
            : undefined
        }
      >
        {dragOver ? (
          <strong>Drop image here</strong>
        ) : canUpload ? (
          <>
            {inCreateMode && !effectiveSlug
              ? 'Type a label above to enable image upload.'
              : 'No image found. Drop an image here or click to upload.'}
            <br />
            <span style={{ fontSize: '11px', color: 'var(--kui-color-scale-slate7)' }}>Accepts .jpg, .png, .webp</span>
          </>
        ) : (
          'No image found.'
        )}
      </div>
      {statusMsg}
      {canUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileInputChange}
          style={hiddenInputStyle}
        />
      )}
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Keystatic field that previews the hero image and supports drag-and-drop
 * upload.
 *
 * Stores the source filename in YAML (e.g. `image.jpg`) which:
 * - Marks the form dirty so Save triggers the ingest pipeline
 * - Acts as a hint for extension probing (avoids unnecessary 404s)
 *
 * Supports both edit and create mode. In create mode, the file is held in
 * IndexedDB until the entry is saved, then auto-uploaded on the edit page.
 */
export function heroImagePreviewField(
  cfg: HeroImagePreviewFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <HeroImagePreview
          {...cfg}
          storedFilename={props.value}
          onFilenameChange={props.onChange}
        />
      )
    },

    defaultValue: () => '',

    parse(value: FormFieldStoredValue): string {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      return ''
    },

    serialize(value: string) {
      return { value: value || undefined }
    },

    validate(value: string): string {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): string {
        if (typeof value === 'string') return value
        return ''
      },
    },
  }
}
