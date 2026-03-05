import { useState, useCallback, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkEntry {
  title: string
  subtitle: string
  instrumentation: string[]
  composerName: string
  hasWatermarkedPdf: boolean
  hasOriginalPdf: boolean
}

interface FilenamePreviewFieldConfig {
  label: string
  description?: string
  /** Work manifest — keyed by slug, imported from api/pdf-scores.json */
  works: Record<string, WorkEntry>
  /** data-keystatic-field name on the template input */
  templateFieldName: string
  /** data-keystatic-field name on the watermarked suffix input */
  watermarkedSuffixFieldName: string
  /** data-keystatic-field name on the original suffix input */
  originalSuffixFieldName: string
  /** Fallback template when the input is empty */
  defaultTemplate: string
  /** Fallback watermarked suffix when the input is empty */
  defaultWatermarkedSuffix: string
}

interface PreviewRow {
  workTitle: string
  type: 'watermarked' | 'original'
  filename: string
}

// ── Filename resolution (JS port of DownloadHandler::sanitizeFilenameUnicode) ─

/**
 * Resolve a download filename from a template + work metadata.
 *
 * Produces the Unicode version that matches the PHP `filename*` (RFC 5987)
 * Content-Disposition parameter — this is what modern browsers display to the
 * user. Original accented characters are preserved; only filesystem-unsafe
 * characters are stripped.
 */
function resolveDownloadFilename(
  template: string,
  workEntry: WorkEntry,
  type: 'watermarked' | 'original',
  watermarkedSuffix: string,
  originalSuffix: string,
  defaultTemplate: string,
): string {
  // 1. Fallback template
  const tpl = template || defaultTemplate

  // 2. Resolve suffix based on PDF type
  const suffix = type === 'watermarked' ? watermarkedSuffix : originalSuffix

  // 3. Build token map
  const tokens: Record<string, string> = {
    '{{composerName}}': workEntry.composerName ?? '',
    '{{workTitle}}': workEntry.title ?? '',
    '{{workSubtitle}}': workEntry.subtitle ?? '',
    '{{instrumentation}}': Array.isArray(workEntry.instrumentation)
      ? workEntry.instrumentation.join(', ')
      : '',
    '{{downloadDate}}': new Date().toISOString().slice(0, 10),
    '{{suffix}}': suffix,
  }

  // 4. Replace all tokens
  let filename = tpl
  for (const [token, value] of Object.entries(tokens)) {
    filename = filename.split(token).join(value)
  }

  // 5. Strip filesystem-unsafe characters: / \ : * ? " < > |
  //    Also strip control characters (U+0000–U+001F, U+007F).
  // eslint-disable-next-line no-control-regex
  filename = filename.replace(/[/\\:*?"<>|\x00-\x1f\x7f]/g, '')

  // 6. Strip commas (from instrumentation join) — can cause issues
  //    in Content-Disposition header parsing.
  filename = filename.replace(/,/g, '')

  // 7. Trim trailing whitespace + hyphens (handles empty trailing tokens)
  filename = filename.replace(/[\s-]+$/, '')

  // 8. Collapse multiple consecutive spaces
  filename = filename.replace(/ {2,}/g, ' ')

  // 9. Collapse 3+ consecutive hyphens (preserves intentional -- separators)
  filename = filename.replace(/-{3,}/g, '--')

  // 10. Trim leading/trailing hyphens, then whitespace
  filename = filename.replace(/^-+|-+$/g, '').trim()

  // 11. Max 200 chars, trim trailing hyphens/spaces after truncation
  if (filename.length > 200) {
    filename = filename.slice(0, 200).replace(/[-\s]+$/, '')
  }

  // 12. Fallback
  if (filename === '') {
    filename = 'score'
  }

  // 13. Append extension
  return filename + '.pdf'
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Uses Keystatic's --kui-color-scale-* CSS custom properties so the preview
// adapts to both light and dark modes automatically.

const descriptionStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate9)',
  lineHeight: '1.4',
}

const buttonStyle: CSSProperties = {
  padding: '7px 16px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-indigo11)',
  backgroundColor: 'var(--kui-color-scale-indigo3)',
  border: '1px solid var(--kui-color-scale-indigo6)',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
}

const buttonHoverStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: 'var(--kui-color-scale-indigo4)',
}

const panelStyle: CSSProperties = {
  marginTop: '12px',
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  overflow: 'hidden',
}

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  borderBottom: '1px solid var(--kui-color-scale-slate5)',
}

const panelTitleStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-slate11)',
}

const closeBtnStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate10)',
  backgroundColor: 'transparent',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  cursor: 'pointer',
}

const tableWrapperStyle: CSSProperties = {
  maxHeight: '420px',
  overflowY: 'auto',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  borderBottom: '2px solid var(--kui-color-scale-slate5)',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-slate9)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  position: 'sticky' as const,
  top: 0,
  backgroundColor: 'var(--kui-color-scale-slate2)',
  zIndex: 1,
}

const tdStyle: CSSProperties = {
  padding: '5px 12px',
  borderBottom: '1px solid var(--kui-color-scale-slate4)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  color: 'var(--kui-color-scale-slate11)',
}

const tdMonoStyle: CSSProperties = {
  padding: '5px 12px',
  borderBottom: '1px solid var(--kui-color-scale-slate4)',
  verticalAlign: 'middle',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  wordBreak: 'break-all' as const,
  whiteSpace: 'normal' as const,
  color: 'var(--kui-color-scale-slate11)',
}

const badgeBase: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  marginRight: '6px',
  fontSize: '10px',
  fontWeight: 700,
  fontFamily: 'system-ui, sans-serif',
  borderRadius: '3px',
  verticalAlign: 'middle',
  letterSpacing: '0.03em',
}

const badgeWmStyle: CSSProperties = {
  ...badgeBase,
  color: 'var(--kui-color-scale-amber11)',
  backgroundColor: 'var(--kui-color-scale-amber3)',
}

const badgeOrigStyle: CSSProperties = {
  ...badgeBase,
  color: 'var(--kui-color-scale-green11)',
  backgroundColor: 'var(--kui-color-scale-green3)',
}

const errorStyle: CSSProperties = {
  marginTop: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-red11)',
  backgroundColor: 'var(--kui-color-scale-red3)',
  border: '1px solid var(--kui-color-scale-red9)',
  borderRadius: '6px',
}

const footnoteStyle: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate8)',
  borderTop: '1px solid var(--kui-color-scale-slate5)',
  lineHeight: '1.4',
}

// ── Preview panel component ──────────────────────────────────────────────────

function FilenamePreviewPanel({
  works,
  templateFieldName,
  watermarkedSuffixFieldName,
  originalSuffixFieldName,
  defaultTemplate,
  defaultWatermarkedSuffix,
  description,
}: FilenamePreviewFieldConfig) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hovering, setHovering] = useState(false)

  const handlePreview = useCallback(() => {
    // Query sibling field values from the DOM via data attributes
    const templateInput = document.querySelector<HTMLInputElement>(
      `input[data-keystatic-field="${templateFieldName}"]`,
    )
    const wmSuffixInput = document.querySelector<HTMLInputElement>(
      `input[data-keystatic-field="${watermarkedSuffixFieldName}"]`,
    )
    const origSuffixInput = document.querySelector<HTMLInputElement>(
      `input[data-keystatic-field="${originalSuffixFieldName}"]`,
    )

    if (!templateInput) {
      setError('Could not find the filename format field. Make sure it appears above this preview.')
      return
    }

    const template = templateInput.value || defaultTemplate
    const wmSuffix = wmSuffixInput?.value ?? defaultWatermarkedSuffix
    const origSuffix = origSuffixInput?.value ?? ''

    const entries = Object.entries(works)
    const resolved: PreviewRow[] = []

    for (const [, work] of entries) {
      if (work.hasWatermarkedPdf) {
        resolved.push({
          workTitle: work.title,
          type: 'watermarked',
          filename: resolveDownloadFilename(template, work, 'watermarked', wmSuffix, origSuffix, defaultTemplate),
        })
      }
      if (work.hasOriginalPdf) {
        resolved.push({
          workTitle: work.title,
          type: 'original',
          filename: resolveDownloadFilename(template, work, 'original', wmSuffix, origSuffix, defaultTemplate),
        })
      }
    }

    setRows(resolved)
    setIsOpen(true)
    setError(null)
  }, [
    works,
    templateFieldName,
    watermarkedSuffixFieldName,
    originalSuffixFieldName,
    defaultTemplate,
    defaultWatermarkedSuffix,
  ])

  return (
    <div>
      {description && <p style={descriptionStyle}>{description}</p>}
      <button
        type="button"
        onClick={handlePreview}
        style={hovering ? buttonHoverStyle : buttonStyle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {isOpen ? 'Refresh preview' : 'Preview download filenames'}
      </button>

      {error && <p style={errorStyle}>{error}</p>}

      {isOpen && rows && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span style={panelTitleStyle}>
              Resolved filenames ({rows.length} file{rows.length !== 1 ? 's' : ''})
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={closeBtnStyle}
            >
              Close
            </button>
          </div>
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Work</th>
                  <th style={thStyle}>Download filename</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.workTitle}-${row.type}`}>
                    <td style={tdStyle}>{row.workTitle}</td>
                    <td style={tdMonoStyle}>
                      <span style={row.type === 'watermarked' ? badgeWmStyle : badgeOrigStyle}>
                        {row.type === 'watermarked' ? 'WM' : 'ORIG'}
                      </span>
                      {row.filename}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={footnoteStyle}>
            {'{{downloadDate}}'} resolves to today. In production it will be the actual download
            date. Accented characters are preserved via the Content-Disposition{' '}
            <code>filename*</code> header (RFC 5987). Older browsers that don&apos;t support this
            will see a transliterated ASCII fallback.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Display-only Keystatic field that previews resolved download filenames.
 *
 * Reads the current (unsaved) template and suffix values from sibling inputs
 * via `data-keystatic-field` DOM attributes, then resolves filenames for every
 * work in the manifest using the same algorithm as the PHP download handler.
 *
 * This field never writes to YAML — `serialize` always returns `{ value: undefined }`.
 */
export function filenamePreviewField(
  cfg: FilenamePreviewFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(_props: FormFieldInputProps<string>) {
      return <FilenamePreviewPanel {...cfg} />
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
