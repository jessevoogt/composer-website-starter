import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

interface TextFieldWithPlaceholderConfig {
  label: string
  description?: string
  defaultValue?: string
  placeholder?: string
  /** When set, renders `data-keystatic-field` on the input for cross-field DOM queries. */
  fieldName?: string
}

// ── Dark/light mode detection ────────────────────────────────────────────────
// Keystatic sets `color-scheme: dark` on the root element when in dark mode.
// Fall back to `prefers-color-scheme` media query.

function detectDark(): boolean {
  if (typeof window === 'undefined') return false
  const cs = getComputedStyle(document.documentElement).colorScheme
  if (cs === 'dark') return true
  if (cs === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function useIsDark(): boolean {
  const [dark, setDark] = useState(detectDark)

  useEffect(() => {
    // Re-check when Keystatic toggles its theme (changes class on <html>).
    const observer = new MutationObserver(() => setDark(detectDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

    // Also listen for OS-level scheme changes.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setDark(detectDark())
    mq.addEventListener('change', handler)

    return () => {
      observer.disconnect()
      mq.removeEventListener('change', handler)
    }
  }, [])

  return dark
}

// ── Colour tokens ────────────────────────────────────────────────────────────
// Matched from Keystatic's native field rendering in both modes.

const colours = {
  dark: { label: '#b9b9b9', description: '#909090', input: '#b9b9b9', border: '#b9b9b9', bg: 'transparent' },
  light: { label: '#4b4b4b', description: '#6e6e6e', input: '#4b4b4b', border: '#4b4b4b', bg: 'transparent' },
} as const

// ── Input component ──────────────────────────────────────────────────────────

function PlaceholderTextInput({
  value,
  onChange,
  placeholder,
  label,
  description,
  fieldName,
}: FormFieldInputProps<string> & {
  placeholder?: string
  label: string
  description?: string
  fieldName?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const isDark = useIsDark()
  const c = isDark ? colours.dark : colours.light

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: 500,
    color: c.label,
    lineHeight: '1.4',
  }

  const descriptionStyle: CSSProperties = {
    margin: '0 0 8px',
    fontSize: '12px',
    color: c.description,
    lineHeight: '1.4',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    lineHeight: '1.4',
    color: c.input,
    backgroundColor: c.bg,
    border: `1px solid ${c.border}`,
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {description && <p style={descriptionStyle}>{description}</p>}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={inputStyle}
        {...(fieldName ? { 'data-keystatic-field': fieldName } : {})}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#6366f1'
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = c.border
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Custom Keystatic form field that renders a plain text input with
 * HTML placeholder support and reliable default-value handling.
 *
 * Keystatic's built-in `fields.text()` does not support the HTML `placeholder`
 * attribute, and its `defaultValue` only applies when a singleton is first
 * created — not when a new field is added to an existing singleton whose YAML
 * doesn't yet contain the key. This custom field solves both problems.
 *
 * Renders an accessible `<label>` + `<input>` pair with colours matched to
 * Keystatic's native fields in both dark and light modes.
 *
 * Usage in keystatic.config.ts:
 *
 * ```ts
 * mySuffix: textFieldWithPlaceholder({
 *   label: 'Suffix',
 *   description: 'Appended to filenames.',
 *   defaultValue: 'PERUSAL SCORE',
 *   placeholder: 'e.g. PERUSAL SCORE',
 * })
 * ```
 */
export function textFieldWithPlaceholder(
  cfg: TextFieldWithPlaceholderConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <PlaceholderTextInput
          {...props}
          placeholder={cfg.placeholder}
          label={cfg.label}
          description={cfg.description}
          fieldName={cfg.fieldName}
        />
      )
    },

    defaultValue: () => cfg.defaultValue ?? '',

    parse(value: FormFieldStoredValue): string {
      return typeof value === 'string' ? value : (cfg.defaultValue ?? '')
    },

    serialize(value: string) {
      return { value: value || undefined }
    },

    validate(value: string): string {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): string {
        return typeof value === 'string' ? value : (cfg.defaultValue ?? '')
      },
    },
  }
}
