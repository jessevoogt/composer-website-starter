import { useRef, useCallback, useMemo, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TokenDef {
  /** Token name without braces, e.g. "firstName" */
  name: string
  /** Short description shown on hover, e.g. "Recipient's first name" */
  description: string
  /** If true, also show a conditional block opener pill for this token */
  conditional?: boolean
}

interface TokenizedTextFieldConfig {
  label: string
  description?: string
  defaultValue?: string
  tokens: TokenDef[]
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

/** Amber-tinted pill for conditional block tags. */
const conditionalPillStyle: CSSProperties = {
  ...pillStyle,
  color: '#92400e',
  backgroundColor: '#fef3c7',
  border: '1px solid #fcd34d',
}

const conditionalPillHoverStyle: CSSProperties = {
  ...conditionalPillStyle,
  backgroundColor: '#fde68a',
}

const sectionLabelStyle: CSSProperties = {
  margin: '8px 0 4px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const sectionHintStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  color: '#9ca3af',
  lineHeight: '1.4',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '220px',
  padding: '10px 12px',
  fontSize: '14px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  lineHeight: '1.6',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  resize: 'vertical',
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
  variant = 'token',
}: {
  label: string
  title: string
  insertText: string
  onInsert: (tokenStr: string) => void
  variant?: 'token' | 'conditional'
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const baseStyle = variant === 'conditional' ? conditionalPillStyle : pillStyle
  const hoverStyle = variant === 'conditional' ? conditionalPillHoverStyle : pillHoverStyle

  return (
    <button
      ref={ref}
      type="button"
      title={title}
      style={baseStyle}
      onMouseEnter={() => {
        if (ref.current) Object.assign(ref.current.style, hoverStyle)
      }}
      onMouseLeave={() => {
        if (ref.current) Object.assign(ref.current.style, baseStyle)
      }}
      onClick={() => onInsert(insertText)}
    >
      {label}
    </button>
  )
}

// ── Input component ──────────────────────────────────────────────────────────

function TokenizedTextInput({
  value,
  onChange,
  tokens,
  description,
}: FormFieldInputProps<string> & { tokens: TokenDef[]; description?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const conditionalTokens = useMemo(() => tokens.filter((t) => t.conditional), [tokens])

  const insertToken = useCallback(
    (tokenStr: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        // If no cursor position, append to end
        onChange(value + tokenStr)
        return
      }

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.slice(0, start) + tokenStr + value.slice(end)

      onChange(newValue)

      // Restore cursor position after the token
      const newCursorPos = start + tokenStr.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
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
      {conditionalTokens.length > 0 && (
        <>
          <p style={sectionLabelStyle}>Conditional blocks</p>
          <p style={sectionHintStyle}>
            Content inside these blocks only appears when the token has a value.
            Use <code style={{ fontSize: '11px' }}>{'{{#if false}}'}</code> to disable a block
            or <code style={{ fontSize: '11px' }}>{'{{#if true}}'}</code> to force it on.
          </p>
          <div style={pillContainerStyle}>
            {conditionalTokens.map((token) => (
              <TokenPill
                key={`if-${token.name}`}
                label={`{{#if ${token.name}}}`}
                title={`Show enclosed content only when ${token.description.toLowerCase()} is available`}
                insertText={`{{#if ${token.name}}}`}
                onInsert={insertToken}
                variant="conditional"
              />
            ))}
            <TokenPill
              label="{{#if false}}"
              title="Disable enclosed content (block is always hidden)"
              insertText="{{#if false}}"
              onInsert={insertToken}
              variant="conditional"
            />
            <TokenPill
              label="{{#if true}}"
              title="Force enclosed content on (block is always shown)"
              insertText="{{#if true}}"
              onInsert={insertToken}
              variant="conditional"
            />
            <TokenPill
              label="{{/if}}"
              title="Close a conditional block"
              insertText="{{/if}}"
              onInsert={insertToken}
              variant="conditional"
            />
          </div>
        </>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}

        style={textareaStyle}
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
 * Custom Keystatic form field that renders a textarea with clickable token
 * "pill" buttons. Clicking a pill inserts the token at the cursor position.
 *
 * Tokens with `conditional: true` also produce `{{#if tokenName}}` / `{{/if}}`
 * pills in a separate "Conditional blocks" section. These wrap content that
 * should only appear when the token resolves to a non-empty value.
 *
 * Usage in keystatic.config.ts:
 *
 * ```ts
 * emailMessage: tokenizedTextField({
 *   label: 'Email body template',
 *   tokens: [
 *     { name: 'firstName', description: "Recipient's first name" },
 *     { name: 'pdfLink', description: 'PDF download link', conditional: true },
 *   ],
 * })
 * ```
 */
export function tokenizedTextField(
  cfg: TokenizedTextFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<string>) {
      return (
        <TokenizedTextInput
          {...props}
          tokens={cfg.tokens}
          description={cfg.description}
        />
      )
    },

    defaultValue: () => cfg.defaultValue ?? '',

    parse(value: FormFieldStoredValue): string {
      return typeof value === 'string' ? value : ''
    },

    serialize(value: string) {
      return { value: value || undefined }
    },

    validate(value: string): string {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): string {
        return typeof value === 'string' ? value : ''
      },
    },
  }
}
