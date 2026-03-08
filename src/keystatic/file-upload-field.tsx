import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import {
  useFileUpload,
  statusMessageStyle,
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

type FileUploadKind = 'audio' | 'score'

interface FileUploadFieldConfig {
  label: string
  kind: FileUploadKind
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

const dropZoneStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '20px 16px',
  border: '2px dashed var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  maxWidth: '480px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background-color 0.15s',
}

const dropZoneActiveStyle: CSSProperties = {
  ...dropZoneStyle,
  borderColor: 'var(--kui-color-scale-amber7)',
  backgroundColor: 'var(--kui-color-scale-amber3)',
}

const fileInfoStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  maxWidth: '480px',
  backgroundColor: 'var(--kui-color-scale-slate2)',
}

const fileIconStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '4px',
  backgroundColor: 'var(--kui-color-scale-slate4)',
  color: 'var(--kui-color-scale-slate10)',
  fontSize: '14px',
  fontWeight: 600,
  flexShrink: 0,
}

const fileDetailsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
}

const fileNameStyle: CSSProperties = {
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: 'var(--kui-color-scale-slate11)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const fileSizeStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate8)',
}

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate8)',
  textAlign: 'center',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '2px',
}

const pendingBadgeStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate8)',
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

// ── Config per kind ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<
  FileUploadKind,
  {
    stem: string
    extensions: string[]
    accept: string
    iconLabel: string
    emptyText: string
  }
> = {
  audio: {
    stem: 'recording',
    extensions: ['.wav', '.aiff', '.flac', '.mp3'],
    accept: 'audio/wav,audio/aiff,audio/flac,audio/mpeg,.wav,.aiff,.flac,.mp3',
    iconLabel: 'WAV',
    emptyText: 'Drop an audio file here or click to upload',
  },
  score: {
    stem: 'score',
    extensions: ['.pdf'],
    accept: 'application/pdf,.pdf',
    iconLabel: 'PDF',
    emptyText: 'Drop a PDF score here or click to upload',
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getWorkSlug(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/keystatic\/collection\/works\/item\/([^/]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function isCreateMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.includes('/keystatic/collection/works/create')
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

function findScopedFolderInput(root: HTMLElement): HTMLInputElement | null {
  let node: HTMLElement | null = root
  while (node) {
    const inputs = node.querySelectorAll<HTMLInputElement>('input[data-keystatic-field="recording-folder"]')
    if (inputs.length === 1) return inputs[0]
    node = node.parentElement
  }
  return document.querySelector<HTMLInputElement>('input[data-keystatic-field="recording-folder"]')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Extract extension from a stored filename hint (e.g. "score.pdf" → ".pdf"). */
function extFromHint(hint: string): string | null {
  if (!hint) return null
  const idx = hint.lastIndexOf('.')
  if (idx < 0) return null
  return hint.slice(idx).toLowerCase()
}

// ── Component ───────────────────────────────────────────────────────────────

function FileUploadPreview({
  kind,
  description,
  storedFilename,
  onFilenameChange,
}: {
  kind: FileUploadKind
  description?: string
  storedFilename: string
  onFilenameChange: (filename: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [workSlug, setWorkSlug] = useState<string | null>(null)
  const [createSlug, setCreateSlug] = useState<string | null>(null)
  const [inCreateMode, setInCreateMode] = useState(false)
  const [recordingFolder, setRecordingFolder] = useState('')
  const [existingFile, setExistingFile] = useState<{ name: string; size: number } | null>(null)
  const [checking, setChecking] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const prevPendingKeyRef = useRef<string | null>(null)

  const config = KIND_CONFIG[kind]
  const effectiveSlug = workSlug ?? createSlug

  // ── Slug detection ──────────────────────────────────────────────────────

  useEffect(() => {
    const s = getWorkSlug()
    if (s) {
      setWorkSlug(s)
    } else if (isCreateMode()) {
      setInCreateMode(true)
    }
  }, [])

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

  // ── Pending file recovery ───────────────────────────────────────────────

  useEffect(() => {
    if (!workSlug) return

    cleanupStaleFiles().catch(() => {})

    const prefix = kind === 'score' ? `works/${workSlug}/${config.stem}` : `works/${workSlug}/recordings/`
    getAllPendingFiles(prefix)
      .then((files) => {
        for (const pf of files) {
          const isScore = pf.key.includes(`/${config.stem}`)
          const isAudio = kind === 'audio' && pf.key.includes('/recordings/')

          if ((kind === 'score' && isScore) || isAudio) {
            onFilenameChange(pf.fileName)

            // Build dest from the key
            const ext = pf.fileName.includes('.') ? `.${pf.fileName.split('.').pop()}` : config.extensions[0]
            let dest: string
            if (kind === 'score') {
              dest = `works/${workSlug}/${config.stem}${ext}`
            } else {
              const match = pf.key.match(/recordings\/([^/]+)\//)
              if (!match) return
              dest = `works/${workSlug}/recordings/${match[1]}/${config.stem}${ext}`
            }

            fetch(`/api/dev/file-upload?dest=${encodeURIComponent(dest)}`, {
              method: 'PUT',
              body: pf.blob,
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.ok) {
                  deletePendingFile(pf.key).catch(() => {})
                  setTimeout(() => setRefreshKey((k) => k + 1), 500)
                }
              })
              .catch(() => {})
          }
        }
      })
      .catch(() => {})
  }, [workSlug, kind, config.stem, config.extensions, onFilenameChange])

  // ── Recording folder sync ───────────────────────────────────────────────

  useEffect(() => {
    if (kind !== 'audio' || !rootRef.current) return

    let activeInput: HTMLInputElement | null = null
    const syncFolder = () => {
      const nextValue = activeInput?.value.trim() ?? ''
      setRecordingFolder((current) => (current === nextValue ? current : nextValue))
    }
    const onInput = () => syncFolder()

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
    const observer = new MutationObserver(() => attach())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (activeInput) {
        activeInput.removeEventListener('input', onInput)
        activeInput.removeEventListener('change', onInput)
      }
    }
  }, [kind])

  // ── Probe for existing file via HEAD requests ───────────────────────────

  useEffect(() => {
    if (!workSlug) {
      setChecking(false)
      return
    }

    let basePath: string
    if (kind === 'audio') {
      const folder = recordingFolder.trim()
      if (!folder) {
        setExistingFile(null)
        setChecking(false)
        return
      }
      basePath = `works/${workSlug}/recordings/${folder}`
    } else {
      basePath = `works/${workSlug}`
    }

    setChecking(true)

    // Try the stored filename hint first to avoid unnecessary HEAD requests
    const hintExt = extFromHint(storedFilename)
    const extensionsToTry = hintExt
      ? [hintExt, ...config.extensions.filter((e) => e !== hintExt)]
      : config.extensions

    let found = false
    let remaining = extensionsToTry.length

    for (const ext of extensionsToTry) {
      const filePath = `${basePath}/${config.stem}${ext}`
      fetch(`/api/dev/file-upload?probe=${encodeURIComponent(filePath)}`, { method: 'HEAD' })
        .then((res) => {
          if (!found && res.ok) {
            found = true
            const size = parseInt(res.headers.get('x-file-size') || '0', 10)
            setExistingFile({ name: `${config.stem}${ext}`, size })
            setChecking(false)
          } else {
            remaining--
            if (remaining === 0 && !found) {
              setExistingFile(null)
              setChecking(false)
            }
          }
        })
        .catch(() => {
          remaining--
          if (remaining === 0 && !found) {
            setExistingFile(null)
            setChecking(false)
          }
        })
    }
  }, [workSlug, recordingFolder, kind, config.extensions, config.stem, storedFilename, refreshKey])

  // ── Upload logic ────────────────────────────────────────────────────────

  const buildDestPath = useCallback(
    (file: File) => {
      if (!workSlug) return null
      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : config.extensions[0]

      if (kind === 'audio') {
        const folder = recordingFolder.trim()
        if (!folder) return null
        return `works/${workSlug}/recordings/${folder}/${config.stem}${ext}`
      }
      return `works/${workSlug}/${config.stem}${ext}`
    },
    [workSlug, kind, recordingFolder, config.stem, config.extensions],
  )

  const onUploadSuccess = useCallback(
    (data: { path: string }) => {
      const filename = data.path.split('/').pop() ?? ''
      onFilenameChange(filename)
      setTimeout(() => setRefreshKey((k) => k + 1), 500)
    },
    [onFilenameChange],
  )

  const {
    state: uploadState,
    dropZoneProps,
    onFileInputChange,
    dragOver,
    pendingFile,
  } = useFileUpload({
    buildDestPath,
    accept: config.accept,
    onSuccess: onUploadSuccess,
  })

  // ── Create mode: store pending file in IndexedDB ────────────────────────

  useEffect(() => {
    if (!inCreateMode || !pendingFile || !effectiveSlug) return

    const ext = pendingFile.name.includes('.') ? `.${pendingFile.name.split('.').pop()}` : config.extensions[0]
    const filename = `${config.stem}${ext}`
    let key: string
    if (kind === 'score') {
      key = `works/${effectiveSlug}/${config.stem}`
    } else {
      const folder = recordingFolder.trim()
      if (!folder) return
      key = `works/${effectiveSlug}/recordings/${folder}/${config.stem}`
    }

    if (prevPendingKeyRef.current && prevPendingKeyRef.current !== key) {
      rekeyPendingFile(prevPendingKeyRef.current, key).catch(() => {})
    }
    prevPendingKeyRef.current = key

    storePendingFile(key, pendingFile).catch(() => {})
    onFilenameChange(filename)
  }, [inCreateMode, pendingFile, effectiveSlug, kind, recordingFolder, config.stem, config.extensions, onFilenameChange])

  // ── Remove handler ─────────────────────────────────────────────────────

  const [removing, setRemoving] = useState(false)

  const handleRemove = useCallback(async () => {
    if (!workSlug || !existingFile) return

    let filePath: string
    if (kind === 'audio') {
      const folder = recordingFolder.trim()
      if (!folder) return
      filePath = `works/${workSlug}/recordings/${folder}/${existingFile.name}`
    } else {
      filePath = `works/${workSlug}/${existingFile.name}`
    }

    setRemoving(true)
    try {
      const res = await fetch(`/api/dev/file-upload?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.ok) {
        onFilenameChange('')
        setExistingFile(null)
      }
    } catch {
      // Silently fail
    } finally {
      setRemoving(false)
    }
  }, [workSlug, kind, recordingFolder, existingFile, onFilenameChange])

  // ── Determine if upload is possible ─────────────────────────────────────

  const canUpload = effectiveSlug !== null && (kind !== 'audio' || recordingFolder.trim() !== '')

  // Show immediate file info from pending drop (before server round-trip)
  const pendingFileInfo =
    pendingFile && !existingFile
      ? { name: pendingFile.name, size: pendingFile.size }
      : null

  // ── Render ──────────────────────────────────────────────────────────────

  const statusMsg =
    uploadState.status !== 'idle' && uploadState.message ? (
      <div style={statusMessageStyle(uploadState.status)}>{uploadState.message}</div>
    ) : null

  let emptyText = config.emptyText
  if (!effectiveSlug && inCreateMode) {
    emptyText = 'Type a title above to enable file upload.'
  } else if (!effectiveSlug) {
    emptyText = 'Save this work first.'
  } else if (kind === 'audio' && !recordingFolder.trim()) {
    emptyText = 'Enter the recording folder name above first.'
  }

  let sourcePath: string | null = null
  if (effectiveSlug) {
    if (kind === 'audio') {
      const folder = recordingFolder.trim() || '<folder-name>'
      sourcePath = `source/works/${effectiveSlug}/recordings/${folder}/${config.stem}.*`
    } else {
      sourcePath = `source/works/${effectiveSlug}/${config.stem}.*`
    }
  }

  const displayFile = existingFile ?? pendingFileInfo

  return (
    <div ref={rootRef} style={wrapperStyle}>
      {description && <p style={descriptionStyle}>{description}</p>}

      {sourcePath && (
        <div style={{ fontSize: '12px', color: 'var(--kui-color-scale-slate8)' }}>
          Source: <code>{sourcePath}</code>
        </div>
      )}

      {checking ? (
        <div style={dropZoneStyle}>
          <span style={hintStyle}>Checking for existing file...</span>
        </div>
      ) : displayFile ? (
        <>
          <div
            style={
              dragOver
                ? { ...fileInfoStyle, borderColor: 'var(--kui-color-scale-amber7)', backgroundColor: 'var(--kui-color-scale-amber3)' }
                : fileInfoStyle
            }
            {...(canUpload ? dropZoneProps : {})}
          >
            <div style={fileIconStyle}>{config.iconLabel}</div>
            <div style={fileDetailsStyle}>
              <span style={fileNameStyle}>{displayFile.name}</span>
              {displayFile.size > 0 && <span style={fileSizeStyle}>{formatSize(displayFile.size)}</span>}
              {pendingFileInfo && !existingFile && (
                <span style={pendingBadgeStyle}>
                  {inCreateMode ? 'Queued — will upload on save' : 'Uploading…'}
                </span>
              )}
            </div>
          </div>
          {dragOver && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--kui-color-scale-amber11)' }}>Drop to replace</div>
          )}
          {statusMsg}
          {canUpload && (
            <div style={actionsStyle}>
              <label style={fileInputLabelStyle}>
                Replace
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={config.accept}
                  onChange={onFileInputChange}
                  style={hiddenInputStyle}
                />
              </label>
              {workSlug && existingFile && (
                <button
                  type="button"
                  style={removeButtonStyle}
                  onClick={handleRemove}
                  disabled={removing}
                >
                  {removing ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={dragOver ? dropZoneActiveStyle : dropZoneStyle}
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
              <strong style={{ fontSize: '13px', color: 'var(--kui-color-scale-amber11)' }}>Drop file here</strong>
            ) : (
              <>
                <span style={{ fontSize: '13px', color: 'var(--kui-color-scale-slate8)' }}>{emptyText}</span>
                {canUpload && (
                  <span style={{ fontSize: '11px', color: 'var(--kui-color-scale-slate7)' }}>
                    Accepts {config.extensions.join(', ')}
                  </span>
                )}
              </>
            )}
          </div>
          {statusMsg}
          {canUpload && (
            <input
              ref={fileInputRef}
              type="file"
              accept={config.accept}
              onChange={onFileInputChange}
              style={hiddenInputStyle}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Keystatic field with upload support for audio and PDF files.
 *
 * Stores the source filename in YAML (e.g. `score.pdf`, `recording.wav`) which:
 * - Marks the form dirty so Save triggers the ingest pipeline
 * - Acts as a hint for file-existence probing (avoids unnecessary HEAD requests)
 *
 * Supports both edit and create mode. In create mode, the file is held in
 * IndexedDB until the entry is saved, then auto-uploaded on the edit page.
 */
export function fileUploadField(
  cfg: FileUploadFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <FileUploadPreview
          kind={cfg.kind}
          description={cfg.description}
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
