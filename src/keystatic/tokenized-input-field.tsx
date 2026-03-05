import { useRef, useCallback, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import type { TokenDef } from './tokenized-text-field'

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenizedInputFieldConfig {
  label: string
  description?: string
  defaultValue?: string
  placeholder?: string
  tokens: TokenDef[]
  /** When set, renders `data-keystatic-field` on the input for cross-field DOM queries. */
  fieldName?: string
}

// ── Styles (inline — Keystatic admin doesn't share project Tailwind) ─────────

const pillContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginBottom: '8px',
}

const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: '#1e40af',
  backgroundColor: '#dbeafe',
  border: '1px solid #93c5fd',
  borderRadius: '9999px',
  cursor: 'pointer',
  lineHeight: '1.4',
  userSelect: 'none' as const,
  transition: 'background-color 0.15s',
}

const pillHoverStyle: CSSProperties = {
  ...pillStyle,
  backgroundColor: '#bfdbfe',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  lineHeight: '1.4',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const descriptionStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '1.4',
}

// ── Pill button ──────────────────────────────────────────────────────────────

function TokenPill({
  label,
  title,
  insertText,
  onInsert,
}: {
  label: string
  title: string
  insertText: string
  onInsert: (tokenStr: string) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  return (
    <button
      ref={ref}
      type="button"
      title={title}
      style={pillStyle}
      onMouseEnter={() => {
        if (ref.current) Object.assign(ref.current.style, pillHoverStyle)
      }}
      onMouseLeave={() => {
        if (ref.current) Object.assign(ref.current.style, pillStyle)
      }}
      onClick={() => onInsert(insertText)}
    >
      {label}
    </button>
  )
}

// ── Input component ──────────────────────────────────────────────────────────

function TokenizedSingleLineInput({
  value,
  onChange,
  tokens,
  description,
  placeholder,
  fieldName,
}: FormFieldInputProps<string> & { tokens: TokenDef[]; description?: string; placeholder?: string; fieldName?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const insertToken = useCallback(
    (tokenStr: string) => {
      const input = inputRef.current
      if (!input) {
        onChange(value + tokenStr)
        return
      }

      const start = input.selectionStart ?? value.length
      const end = input.selectionEnd ?? value.length
      const newValue = value.slice(0, start) + tokenStr + value.slice(end)

      onChange(newValue)

      const newCursorPos = start + tokenStr.length
      requestAnimationFrame(() => {
        input.focus()
        input.setSelectionRange(newCursorPos, newCursorPos)
      })
    },
    [value, onChange],
  )

  return (
    <div>
      {description && <p style={descriptionStyle}>{description}</p>}
      <div style={pillContainerStyle}>
        {tokens.map((token) => (
          <TokenPill
            key={token.name}
            label={`{{${token.name}}}`}
            title={token.description}
            insertText={`{{${token.name}}}`}
            onInsert={insertToken}
          />
        ))}
      </div>
      <input
        ref={inputRef}
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
          e.currentTarget.style.borderColor = '#d1d5db'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Custom Keystatic form field that renders a single-line input with clickable
 * token "pill" buttons. Clicking a pill inserts the token at the cursor position.
 *
 * Designed for filename templates and other single-line tokenized values.
 * For multi-line templates (e.g. email bodies), use `tokenizedTextField` instead.
 *
 * Usage in keystatic.config.ts:
 *
 * ```ts
 * downloadFilenameFormat: tokenizedInputField({
 *   label: 'PDF download filename format',
 *   defaultValue: '{{composerName}}-{{workTitle}}',
 *   tokens: [
 *     { name: 'composerName', description: 'Composer name' },
 *     { name: 'workTitle', description: 'Title of the composition' },
 *   ],
 * })
 * ```
 */
export function tokenizedInputField(
  cfg: TokenizedInputFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <TokenizedSingleLineInput
          {...props}
          tokens={cfg.tokens}
          description={cfg.description}
          placeholder={cfg.placeholder}
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
