import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import worksImages from '@/utils/works-images'

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

const emptyStyle: CSSProperties = {
  padding: '24px 16px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate8)',
  textAlign: 'center',
  border: '1px dashed var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  maxWidth: '480px',
}

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

function resolveGeneratedAssetSrc(generatedPath: string | null) {
  if (!generatedPath) return null

  const normalizedPath = generatedPath.trim().toLowerCase()
  const matched = worksImages.find((image) => image.path.toLowerCase() === normalizedPath)
  if (!matched) return null

  if (typeof matched.data === 'string') return matched.data
  if (matched.data && typeof matched.data === 'object' && 'src' in matched.data) {
    return matched.data.src
  }

  return null
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

function WorkImagePreview({ kind }: { kind: WorkImagePreviewKind }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [workSlug, setWorkSlug] = useState<string | null>(null)
  const [recordingFolder, setRecordingFolder] = useState('')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setWorkSlug(getWorkSlug())
  }, [])

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

  useEffect(() => {
    const context = buildPreviewContext(kind, workSlug, recordingFolder)
    const resolvedSrc = resolveGeneratedAssetSrc(context.generatedPath)

    if (!resolvedSrc) {
      setImageSrc(null)
      setLoading(false)
      return
    }

    setImageSrc(resolvedSrc)
    setLoading(false)
  }, [kind, recordingFolder, workSlug])

  const context = buildPreviewContext(kind, workSlug, recordingFolder)
  const generatedFilename = getGeneratedFilename(context.generatedPath)
  const sourceBaseName = kind === 'thumbnail' ? 'thumbnail' : 'photo'

  let emptyMessage =
    'No generated image found yet. Add the source file, then run `npm run ingest:works` and `npm run generate:data` (or let the dev watcher finish).'
  if (!workSlug) {
    emptyMessage = 'Save this work first so Keystatic can resolve the preview path.'
  } else if (kind === 'recordingPhoto' && !recordingFolder.trim()) {
    emptyMessage = 'Enter the recording folder name above to preview this generated photo.'
  }

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
          <code>{generatedFilename ?? (kind === 'thumbnail' ? '<work-slug>-thumbnail-740w.webp' : '<work-slug>-<folder-name>-photo-740w.webp')}</code>
        </div>
      </div>

      {loading ? (
        <div style={emptyStyle}>Loading image preview...</div>
      ) : imageSrc ? (
        <div style={imageWrapperStyle}>
          <img
            src={imageSrc}
            alt={kind === 'thumbnail' ? 'Generated work thumbnail preview' : 'Generated recording photo preview'}
            style={imageStyle}
          />
          {generatedFilename && <div style={filenameStyle}>{generatedFilename}</div>}
        </div>
      ) : (
        <div style={emptyStyle}>{emptyMessage}</div>
      )}
    </div>
  )
}

export function workImagePreviewField(
  cfg: WorkImagePreviewFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(_props: FormFieldInputProps<string>) {
      return <WorkImagePreview kind={cfg.kind} />
    },

    defaultValue: () => '',

    parse(_value: FormFieldStoredValue): string {
      return ''
    },

    serialize() {
      return { value: undefined }
    },

    validate(value: string): string {
      return value
    },

    reader: {
      parse(_value: FormFieldStoredValue): string {
        return ''
      },
    },
  }
}
