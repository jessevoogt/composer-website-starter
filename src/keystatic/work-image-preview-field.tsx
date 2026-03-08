import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
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

type WorkImagePreviewKind = 'thumbnail' | 'recordingPhoto'

interface WorkImagePreviewFieldConfig {
  label: string
  kind: WorkImagePreviewKind
}

interface PreviewContext {
  workSlug: string | null
  sourceFolder: string | null
  sourceFilename: string
  generatedPath: string | null
}

// ── Styles ──────────────────────────────────────────────────────────────────

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

const setupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate10)',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  border: '1px solid var(--kui-color-scale-slate4)',
  borderRadius: '6px',
  lineHeight: '1.5',
  maxWidth: '560px',
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

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract work slug from edit URL, or null if on create page. */
function getWorkSlug() {
  if (typeof window === 'undefined') return null

  const match = window.location.pathname.match(/\/keystatic\/collection\/works\/item\/([^/]+)/)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/** Check if we're on a create page (not an edit page). */
function isCreateMode() {
  if (typeof window === 'undefined') return false
  return window.location.pathname.includes('/keystatic/collection/works/create')
}

/**
 * Read the slug from Keystatic's slug input in the create form DOM.
 * Keystatic renders the slug as a read-only preview next to the title input.
 */
function findSlugInput(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null
  // Keystatic's slug field renders an input for the slug value
  // It has [name="slug"] or is within a slug field container
  const slugInputs = document.querySelectorAll<HTMLInputElement>('input[name="slug"]')
  if (slugInputs.length === 1) return slugInputs[0]
  // Fallback: look for a disabled/readonly input near the title
  const allInputs = document.querySelectorAll<HTMLInputElement>('input')
  for (const input of allInputs) {
    if (input.readOnly && input.value && /^[a-z0-9-]+$/.test(input.value)) {
      // Check if it's inside a slug field container
      const parent = input.closest('[data-field]')
      if (parent?.getAttribute('data-field') === 'slug') return input
    }
  }
  return null
}

function buildPreviewContext(kind: WorkImagePreviewKind, workSlug: string | null, recordingFolder: string): PreviewContext {
  if (!workSlug) {
    return {
      workSlug: null,
      sourceFolder: null,
      sourceFilename: kind === 'thumbnail' ? 'thumbnail.jpg' : 'photo.jpg',
      generatedPath: null,
    }
  }

  if (kind === 'thumbnail') {
    const fileName = `${workSlug}-thumbnail-740w.webp`
    return {
      workSlug,
      sourceFolder: `source/works/${workSlug}/`,
      sourceFilename: 'thumbnail.jpg',
      generatedPath: `/assets/images/works/${fileName}`,
    }
  }

  const folder = recordingFolder.trim()
  const folderPlaceholder = folder || '<folder-name>'
  const fileName = folder ? `${workSlug}-${folder}-photo-740w.webp` : ''

  return {
    workSlug,
    sourceFolder: `source/works/${workSlug}/recordings/${folderPlaceholder}/`,
    sourceFilename: 'photo.jpg',
    generatedPath: fileName ? `/assets/images/works/${fileName}` : null,
  }
}

function getGeneratedFilename(pathname: string | null) {
  if (!pathname) return null
  const segments = pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1] ?? '')
}

/**
 * Convert a generated asset path like `/assets/images/works/foo-thumbnail-740w.webp`
 * into a Vite dev-mode URL by mapping through `src/assets/`.
 *
 * We probe the image by URL instead of importing the static `works-images.ts`
 * manifest — the static import creates an HMR chain that reaches
 * `keystatic-entry.jsx`, causing a full React re-mount and tree-state loss
 * on every ingest-pipeline run (→ "Entry not found" after creation).
 */
function toDevImageUrl(generatedPath: string | null): string | null {
  if (!generatedPath) return null
  return generatedPath.replace(/^\/assets\//, '/src/assets/')
}

function findScopedFolderInput(root: HTMLElement) {
  let node: HTMLElement | null = root

  while (node) {
    const inputs = node.querySelectorAll<HTMLInputElement>('input[data-keystatic-field="recording-folder"]')
    if (inputs.length === 1) return inputs[0]
    node = node.parentElement
  }

  return document.querySelector<HTMLInputElement>('input[data-keystatic-field="recording-folder"]')
}

/** Build the IndexedDB key for a pending file. */
function pendingFileKey(slug: string, kind: WorkImagePreviewKind, folder: string): string {
  if (kind === 'thumbnail') return `works/${slug}/thumbnail`
  return `works/${slug}/recordings/${folder}/photo`
}

// ── Component ───────────────────────────────────────────────────────────────

function WorkImagePreview({
  kind,
  storedFilename: _storedFilename,
  onFilenameChange,
}: {
  kind: WorkImagePreviewKind
  storedFilename: string
  onFilenameChange: (filename: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [workSlug, setWorkSlug] = useState<string | null>(null)
  const [createSlug, setCreateSlug] = useState<string | null>(null)
  const [recordingFolder, setRecordingFolder] = useState('')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [inCreateMode, setInCreateMode] = useState(false)
  const prevPendingKeyRef = useRef<string | null>(null)

  // Effective slug: edit mode uses URL slug, create mode uses DOM-observed slug
  const effectiveSlug = workSlug ?? createSlug

  // ── Slug detection ────────────────────────────────────────────────────────

  useEffect(() => {
    const slug = getWorkSlug()
    if (slug) {
      setWorkSlug(slug)
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
      if (input?.value) {
        setCreateSlug(input.value)
      }
    }

    // Initial sync
    syncSlug()

    // Watch for DOM changes that might add/update the slug input
    const observer = new MutationObserver(() => syncSlug())
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] })

    // Also listen for input events on the slug field
    const interval = setInterval(syncSlug, 500)

    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [inCreateMode])

  // ── Pending file recovery (edit mode → recover from IndexedDB) ──────────

  useEffect(() => {
    if (!workSlug) return

    // Cleanup stale files on mount
    cleanupStaleFiles().catch(() => {})

    // Check for pending files from create mode
    const prefix = `works/${workSlug}/`
    getAllPendingFiles(prefix)
      .then((files) => {
        for (const pf of files) {
          // Check if this pending file matches our kind
          const isThumbnail = pf.key.includes('/thumbnail')
          const isPhoto = pf.key.includes('/photo')

          if ((kind === 'thumbnail' && isThumbnail) || (kind === 'recordingPhoto' && isPhoto)) {
            // Recover: create preview URL and upload
            const url = URL.createObjectURL(pf.blob)
            setLocalRecoveryUrl(url)

            // Extract filename and notify form
            onFilenameChange(pf.fileName)

            // Build dest path and upload
            const ext = pf.fileName.includes('.') ? pf.fileName.split('.').pop() : 'jpg'
            let dest: string
            if (kind === 'thumbnail') {
              dest = `works/${workSlug}/thumbnail.${ext}`
            } else {
              // Extract folder from key: works/{slug}/recordings/{folder}/photo
              const match = pf.key.match(/recordings\/([^/]+)\/photo/)
              if (!match) return
              dest = `works/${workSlug}/recordings/${match[1]}/photo.${ext}`
            }

            fetch(`/api/dev/file-upload?dest=${encodeURIComponent(dest)}`, {
              method: 'PUT',
              body: pf.blob,
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.ok) {
                  // Upload succeeded, delete from IndexedDB and re-probe after delay
                  deletePendingFile(pf.key).catch(() => {})
                  setTimeout(() => setRefreshKey((k) => k + 1), 1500)
                }
              })
              .catch(() => {})
          }
        }
      })
      .catch(() => {})
  }, [workSlug, kind, onFilenameChange])

  const [localRecoveryUrl, setLocalRecoveryUrl] = useState<string | null>(null)

  // ── Recording folder sync ─────────────────────────────────────────────────

  useEffect(() => {
    if (kind !== 'recordingPhoto' || !rootRef.current) return

    let activeInput: HTMLInputElement | null = null

    const syncFolder = () => {
      const nextValue = activeInput?.value.trim() ?? ''
      setRecordingFolder((current) => (current === nextValue ? current : nextValue))
    }

    const onInput = () => {
      syncFolder()
    }

    const attach = () => {
      const nextInput = rootRef.current ? findScopedFolderInput(rootRef.current) : null

      if (nextInput === activeInput) {
        syncFolder()
        return
      }

      if (activeInput) {
        activeInput.removeEventListener('input', onInput)
        activeInput.removeEventListener('change', onInput)
      }

      activeInput = nextInput

      if (activeInput) {
        activeInput.addEventListener('input', onInput)
        activeInput.addEventListener('change', onInput)
      }

      syncFolder()
    }

    attach()

    const observer = new MutationObserver(() => {
      attach()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (activeInput) {
        activeInput.removeEventListener('input', onInput)
        activeInput.removeEventListener('change', onInput)
      }
    }
  }, [kind])

  // ── Probe for generated image ─────────────────────────────────────────────

  useEffect(() => {
    const context = buildPreviewContext(kind, effectiveSlug, recordingFolder)
    const devUrl = toDevImageUrl(context.generatedPath)

    if (!devUrl) {
      setImageSrc(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const img = new window.Image()
    img.onload = () => {
      setImageSrc(`${devUrl}?t=${refreshKey}`)
      setLoading(false)
    }
    img.onerror = () => {
      setImageSrc(null)
      setLoading(false)
    }
    img.src = `${devUrl}?t=${refreshKey}`
  }, [kind, recordingFolder, effectiveSlug, refreshKey])

  // ── Upload logic ──────────────────────────────────────────────────────────

  const buildDestPath = useCallback(
    (file: File) => {
      // In create mode or without a slug, dest is null → hook will capture file for preview only
      if (!workSlug) return null
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'

      if (kind === 'thumbnail') {
        return `works/${workSlug}/thumbnail.${ext}`
      }

      const folder = recordingFolder.trim()
      if (!folder) return null
      return `works/${workSlug}/recordings/${folder}/photo.${ext}`
    },
    [workSlug, kind, recordingFolder],
  )

  const onUploadSuccess = useCallback(
    (data: { path: string }) => {
      // Store uploaded filename in YAML to mark form dirty and provide hint
      const filename = data.path.split('/').pop() ?? ''
      onFilenameChange(filename)
      // Re-probe after delay for pipeline to generate WebP
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
    accept: 'image/jpeg,image/png,image/webp,image/tiff',
    onSuccess: onUploadSuccess,
  })

  // ── Remove handler ───────────────────────────────────────────────────────

  const [removing, setRemoving] = useState(false)

  const handleRemove = useCallback(async () => {
    if (!workSlug) return

    const sourceBaseName = kind === 'thumbnail' ? 'thumbnail' : 'photo'
    let filePath: string
    if (kind === 'thumbnail') {
      filePath = `works/${workSlug}/${sourceBaseName}.jpg`
    } else {
      const folder = recordingFolder.trim()
      if (!folder) return
      filePath = `works/${workSlug}/recordings/${folder}/${sourceBaseName}.jpg`
    }

    setRemoving(true)
    try {
      const res = await fetch(`/api/dev/file-upload?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.ok) {
        // Clear the YAML field
        onFilenameChange('')
        // Clear local preview
        clearLocalPreview()
        // Clear generated image
        setImageSrc(null)
      }
    } catch {
      // Silently fail — the file may not exist
    } finally {
      setRemoving(false)
    }
  }, [workSlug, kind, recordingFolder, onFilenameChange, clearLocalPreview])

  // ── Create mode: store pending file in IndexedDB ──────────────────────────

  useEffect(() => {
    if (!inCreateMode || !pendingFile || !effectiveSlug) return

    const ext = pendingFile.name.includes('.') ? pendingFile.name.split('.').pop() : 'jpg'
    const filename = kind === 'thumbnail' ? `thumbnail.${ext}` : `photo.${ext}`
    const key = pendingFileKey(effectiveSlug, kind, recordingFolder.trim())

    // Re-key if slug changed
    if (prevPendingKeyRef.current && prevPendingKeyRef.current !== key) {
      rekeyPendingFile(prevPendingKeyRef.current, key).catch(() => {})
    }
    prevPendingKeyRef.current = key

    storePendingFile(key, pendingFile).catch(() => {})
    onFilenameChange(filename)
  }, [inCreateMode, pendingFile, effectiveSlug, kind, recordingFolder, onFilenameChange])

  // Track whether a generated image existed before the most recent upload.
  // Used to decide when to dismiss the local preview:
  //  - First upload (no generated image before): dismiss once the pipeline creates one
  //  - Replacement (generated image existed): keep local preview until component
  //    re-mounts (after save → pipeline → page reload), because the probe would
  //    otherwise show the STALE generated image before the pipeline has run.
  const hadImageBeforeUploadRef = useRef(false)

  useEffect(() => {
    if (localPreviewUrl) {
      hadImageBeforeUploadRef.current = imageSrc !== null
    }
  }, [localPreviewUrl]) // intentionally excludes imageSrc — snapshot at drop time only

  useEffect(() => {
    // First-time upload: dismiss local preview once a generated image appears
    if (localPreviewUrl && imageSrc && !hadImageBeforeUploadRef.current) {
      clearLocalPreview()
    }
    // Replacement: do NOT auto-dismiss — the probe would show the stale old image.
    // The local preview persists until the component re-mounts after pipeline runs.

    // Recovery URLs (create-mode IndexedDB recovery): dismiss once generated image loads
    if (localRecoveryUrl && imageSrc) {
      URL.revokeObjectURL(localRecoveryUrl)
      setLocalRecoveryUrl(null)
    }
  }, [imageSrc, localPreviewUrl, clearLocalPreview, localRecoveryUrl])

  // ── Derived values ────────────────────────────────────────────────────────

  const context = buildPreviewContext(kind, effectiveSlug, recordingFolder)
  const generatedFilename = getGeneratedFilename(context.generatedPath)
  const sourceBaseName = kind === 'thumbnail' ? 'thumbnail' : 'photo'

  const canUpload = effectiveSlug !== null && (kind === 'thumbnail' || recordingFolder.trim() !== '')

  // The preview to show: local (in-memory/recovered) always wins when set
  const activePreviewUrl = localPreviewUrl ?? localRecoveryUrl
  const showLocalPreview = activePreviewUrl !== null
  const showGeneratedPreview = imageSrc !== null && !showLocalPreview

  let emptyMessage =
    'No generated image found yet. Drop an image here or use the button below, then wait for the pipeline to process it.'
  if (!effectiveSlug && inCreateMode) {
    emptyMessage = 'Type a title above to enable image upload.'
  } else if (!effectiveSlug) {
    emptyMessage = 'Save this work first so Keystatic can resolve the preview path.'
  } else if (kind === 'recordingPhoto' && !recordingFolder.trim()) {
    emptyMessage = 'Enter the recording folder name above to preview this generated photo.'
  }

  // Upload status message
  const statusMsg =
    uploadState.status !== 'idle' && uploadState.message ? (
      <div style={statusMessageStyle(uploadState.status)}>{uploadState.message}</div>
    ) : null

  // Whether there's an image that can be removed (generated or local preview, but not in create mode)
  const canRemove = workSlug !== null && (showGeneratedPreview || showLocalPreview) && !removing

  // File input button
  const fileInput = canUpload ? (
    <div style={fileInputWrapperStyle}>
      <label style={fileInputLabelStyle}>
        {showGeneratedPreview || showLocalPreview ? 'Replace' : 'Choose file'}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/tiff"
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
      {!showGeneratedPreview && !showLocalPreview && (
        <span style={{ fontSize: '12px', color: 'var(--kui-color-scale-slate8)' }}>or drag and drop above</span>
      )}
    </div>
  ) : null

  return (
    <div ref={rootRef} style={wrapperStyle}>
      <p style={descriptionStyle}>
        This shows the generated site image, not the source file in <code>source/</code>.
      </p>

      <div style={setupStyle}>
        <div>
          Source folder: <code>{context.sourceFolder ?? 'source/works/<work-slug>/'}</code>
        </div>
        <div>
          Source file: <code>{context.sourceFilename}</code>, <code>{sourceBaseName}.jpeg</code>,{' '}
          <code>{sourceBaseName}.png</code>, <code>{sourceBaseName}.webp</code>, or{' '}
          <code>{sourceBaseName}.tiff</code>
        </div>
        <div>
          Generated file:{' '}
          <code>
            {generatedFilename ??
              (kind === 'thumbnail'
                ? '<work-slug>-thumbnail-740w.webp'
                : '<work-slug>-<folder-name>-photo-740w.webp')}
          </code>
        </div>
      </div>

      {loading ? (
        <div style={emptyDropZoneStyle}>Loading image preview...</div>
      ) : showGeneratedPreview ? (
        <div style={imageWrapperStyle} {...(canUpload ? dropZoneProps : {})}>
          <img
            src={imageSrc!}
            alt={kind === 'thumbnail' ? 'Generated work thumbnail preview' : 'Generated recording photo preview'}
            style={imageStyle}
          />
          {dragOver && (
            <div style={dropZoneOverlayStyle}>
              <span style={dropZoneOverlayTextStyle}>Drop to replace</span>
            </div>
          )}
          {generatedFilename && <div style={filenameStyle}>{generatedFilename}</div>}
          {statusMsg}
        </div>
      ) : showLocalPreview ? (
        <div style={imageWrapperStyle} {...(canUpload ? dropZoneProps : {})}>
          <img
            src={activePreviewUrl!}
            alt={kind === 'thumbnail' ? 'Thumbnail preview (source image)' : 'Photo preview (source image)'}
            style={imageStyle}
          />
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
      ) : (
        <>
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
                {emptyMessage}
                <br />
                <span style={{ fontSize: '11px', color: 'var(--kui-color-scale-slate7)' }}>
                  Accepts .jpg, .png, .webp, .tiff
                </span>
              </>
            ) : (
              emptyMessage
            )}
          </div>
          {statusMsg}
        </>
      )}

      {fileInput}
    </div>
  )
}

// ── Field factory ───────────────────────────────────────────────────────────

/**
 * Keystatic field that previews generated work images (thumbnails and
 * recording photos) and supports drag-and-drop upload.
 *
 * Stores the uploaded source filename in YAML (e.g. `thumbnail.jpg`) which:
 * - Marks the form dirty so Save triggers the ingest pipeline
 * - Acts as a hint for extension probing (avoids 404s)
 *
 * Supports both edit and create mode. In create mode, the file is held in
 * IndexedDB until the entry is saved, then auto-uploaded on the edit page.
 */
export function workImagePreviewField(
  cfg: WorkImagePreviewFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <WorkImagePreview
          kind={cfg.kind}
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
