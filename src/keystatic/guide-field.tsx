import { useMemo, type CSSProperties } from 'react'
import { marked } from 'marked'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

interface GuideFieldConfig {
  label: string
  /** Raw markdown string (import via `?raw` from a .md file) */
  content: string
}

// ── Styles (uses Keystatic's --kui-color-scale-* for light/dark compat) ──────

const wrapperStyle: CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: 'var(--kui-color-scale-slate11)',
}

// ── Component ────────────────────────────────────────────────────────────────

function GuideContent({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content) as string, [content])

  return (
    <div style={wrapperStyle}>
      {/* Content is our own static markdown, not user input */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Display-only Keystatic field that renders markdown content.
 *
 * Intended for editorial guidance panels inside singletons.
 * Never writes to YAML — `serialize` always returns `{ value: undefined }`.
 *
 * Usage:
 * ```ts
 * import homepageGuide from './guides/homepage.md?raw'
 *
 * schema: {
 *   _guide: guideField({ label: 'Guide', content: homepageGuide }),
 * }
 * ```
 */
export function guideField(cfg: GuideFieldConfig): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(_props: FormFieldInputProps<string>) {
      return <GuideContent content={cfg.content} />
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
