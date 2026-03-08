import { useState, useCallback, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import { readCollapseState, persistCollapseState } from './collapse-storage'

// ── Types ────────────────────────────────────────────────────────────────────

interface InstrumentLineObj {
  label: string
  details: string[]
  note?: string
}

type InstrumentLineValue = string | InstrumentLineObj

interface InstrumentSectionValue {
  section: string
  instruments: InstrumentLineValue[]
}

interface InstrumentationValue {
  grouped: boolean
  label?: string
  instruments: string[]
  sections: InstrumentSectionValue[]
}

interface CategorizationValue {
  tags: string[]
  instrumentation: InstrumentationValue
  searchKeywords: string[]
}

const DEFAULT_INSTRUMENTATION: InstrumentationValue = {
  grouped: false,
  instruments: [],
  sections: [],
}

const DEFAULT_CATEGORIZATION: CategorizationValue = {
  tags: [],
  instrumentation: { ...DEFAULT_INSTRUMENTATION },
  searchKeywords: [],
}

interface ArraySectionConfig {
  key: 'tags' | 'searchKeywords'
  label: string
  placeholder: string
  description?: string
}

const SIMPLE_SECTIONS: ArraySectionConfig[] = [
  { key: 'tags', label: 'Tags', placeholder: 'Add a tag\u2026' },
  {
    key: 'searchKeywords',
    label: 'Search Keywords',
    placeholder: 'Add a keyword\u2026',
    description: 'Additional terms that should find this work (e.g. performer surnames)',
  },
]

// ── Styles ───────────────────────────────────────────────────────────────────

const KUI_FONT = 'var(--kui-typography-font-family-base, system-ui, sans-serif)'

const panelStyle: CSSProperties = {
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  fontFamily: KUI_FONT,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  cursor: 'pointer',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  color: 'var(--kui-color-scale-slate11)',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: KUI_FONT,
  transition: 'background-color 0.15s',
}

const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const chevronStyle = (open: boolean): CSSProperties => ({
  display: 'inline-block',
  width: '16px',
  height: '16px',
  lineHeight: '16px',
  textAlign: 'center',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate9)',
  transition: 'transform 0.2s',
  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
})

const badgeStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--kui-color-scale-slate9)',
  backgroundColor: 'var(--kui-color-scale-slate4)',
  borderRadius: '10px',
}

const activeBadgeStyle: CSSProperties = {
  ...badgeStyle,
  color: 'var(--kui-color-scale-amber11)',
  backgroundColor: 'var(--kui-color-scale-amber4)',
}

const bodyStyle = (open: boolean): CSSProperties => ({
  maxHeight: open ? '2400px' : '0px',
  overflow: 'hidden',
  transition: 'max-height 0.25s ease-in-out',
})

const bodyInnerStyle: CSSProperties = {
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'var(--kui-color-scale-slate9)',
}

const sectionDescStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate8)',
}

const chipContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  marginTop: '6px',
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 4px 2px 8px',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--kui-color-scale-slate11)',
  backgroundColor: 'var(--kui-color-scale-slate4)',
  borderRadius: '4px',
  maxWidth: '100%',
}

const chipTextStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const chipRemoveStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  padding: 0,
  border: 'none',
  borderRadius: '3px',
  backgroundColor: 'transparent',
  color: 'var(--kui-color-scale-slate9)',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  fontFamily: KUI_FONT,
  flexShrink: 0,
}

const addRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  marginTop: '6px',
}

const addInputStyle: CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate11)',
  backgroundColor: 'var(--kui-color-scale-slate1)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  fontFamily: KUI_FONT,
}

const emptyStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate8)',
  fontStyle: 'italic',
}

const smallBtnStyle: CSSProperties = {
  padding: '3px 8px',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--kui-color-scale-slate11)',
  backgroundColor: 'var(--kui-color-scale-slate4)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: KUI_FONT,
}

const toggleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '4px',
}

const toggleLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate10)',
  cursor: 'pointer',
  userSelect: 'none',
}

const sectionCardStyle: CSSProperties = {
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '4px',
  backgroundColor: 'var(--kui-color-scale-slate1)',
  padding: '10px',
  marginTop: '6px',
}

const sectionHeaderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '8px',
}

const sectionNameInputStyle: CSSProperties = {
  ...addInputStyle,
  fontWeight: 600,
  fontSize: '12px',
}

const instrumentDetailRowStyle: CSSProperties = {
  marginTop: '4px',
  paddingLeft: '12px',
  borderLeft: '2px solid var(--kui-color-scale-slate5)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const noteInputStyle: CSSProperties = {
  ...addInputStyle,
  fontSize: '11px',
  fontStyle: 'italic',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countInstruments(value: InstrumentationValue): number {
  if (!value.grouped) return value.instruments.length
  return value.sections.reduce(
    (sum, s) => sum + s.instruments.length,
    0,
  )
}

function totalItems(value: CategorizationValue): number {
  return value.tags.length + countInstruments(value.instrumentation) + value.searchKeywords.length
}

function badgeText(value: CategorizationValue): string {
  const parts: string[] = []
  if (value.tags.length > 0)
    parts.push(`${value.tags.length} tag${value.tags.length !== 1 ? 's' : ''}`)
  const instrCount = countInstruments(value.instrumentation)
  if (instrCount > 0)
    parts.push(`${instrCount} instrument${instrCount !== 1 ? 's' : ''}`)
  if (value.searchKeywords.length > 0)
    parts.push(`${value.searchKeywords.length} keyword${value.searchKeywords.length !== 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(', ') : 'none'
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function parseInstrumentation(raw: unknown): InstrumentationValue {
  if (!raw || typeof raw !== 'object') {
    // Legacy: might be a string[] at top level
    if (Array.isArray(raw)) {
      return { grouped: false, instruments: parseStringArray(raw), sections: [] }
    }
    return { ...DEFAULT_INSTRUMENTATION }
  }
  const obj = raw as Record<string, unknown>
  if (obj.grouped === true) {
    const sections: InstrumentSectionValue[] = []
    if (Array.isArray(obj.sections)) {
      for (const s of obj.sections) {
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          const sec = s as Record<string, unknown>
          const instruments: InstrumentLineValue[] = []
          if (Array.isArray(sec.instruments)) {
            for (const inst of sec.instruments) {
              if (typeof inst === 'string') {
                instruments.push(inst)
              } else if (inst && typeof inst === 'object' && !Array.isArray(inst)) {
                const io = inst as Record<string, unknown>
                instruments.push({
                  label: String(io.label ?? ''),
                  details: parseStringArray(io.details),
                  ...(io.note ? { note: String(io.note) } : {}),
                })
              }
            }
          }
          sections.push({
            section: String(sec.section ?? ''),
            instruments,
          })
        }
      }
    }
    const labelGrouped = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : undefined
    return { grouped: true, instruments: [], sections, ...(labelGrouped ? { label: labelGrouped } : {}) }
  }
  const labelFlat = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : undefined
  return {
    grouped: false,
    instruments: parseStringArray(obj.instruments),
    sections: [],
    ...(labelFlat ? { label: labelFlat } : {}),
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TagArraySection({
  config,
  items,
  onAdd,
  onRemove,
}: {
  config: ArraySectionConfig
  items: string[]
  onAdd: (key: 'tags' | 'searchKeywords', value: string) => void
  onRemove: (key: 'tags' | 'searchKeywords', index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const input = inputRef.current
        if (!input) return
        const val = input.value.trim()
        if (val && !items.includes(val)) {
          onAdd(config.key, val)
          input.value = ''
        }
      }
    },
    [config.key, items, onAdd],
  )

  return (
    <div>
      <h4 style={sectionHeadingStyle}>{config.label}</h4>
      {config.description && <p style={sectionDescStyle}>{config.description}</p>}

      {items.length > 0 ? (
        <div style={chipContainerStyle}>
          {items.map((item, i) => (
            <span key={`${item}-${i}`} style={chipStyle}>
              <span style={chipTextStyle}>{item}</span>
              <button
                type="button"
                style={chipRemoveStyle}
                onClick={() => onRemove(config.key, i)}
                aria-label={`Remove ${item}`}
                title={`Remove ${item}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p style={emptyStyle}>None</p>
      )}

      <div style={addRowStyle}>
        <input
          ref={inputRef}
          type="text"
          style={addInputStyle}
          placeholder={config.placeholder}
          onKeyDown={handleKeyDown}
          aria-label={`Add ${config.label.toLowerCase()}`}
        />
      </div>
    </div>
  )
}

// ── Instrumentation Section (flat mode) ──────────────────────────────────────

function FlatInstrumentationSection({
  instruments,
  onChange,
}: {
  instruments: string[]
  onChange: (next: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const input = inputRef.current
        if (!input) return
        const val = input.value.trim()
        if (val && !instruments.includes(val)) {
          onChange([...instruments, val])
          input.value = ''
        }
      }
    },
    [instruments, onChange],
  )

  return (
    <>
      {instruments.length > 0 ? (
        <div style={chipContainerStyle}>
          {instruments.map((item, i) => (
            <span key={`${item}-${i}`} style={chipStyle}>
              <span style={chipTextStyle}>{item}</span>
              <button
                type="button"
                style={chipRemoveStyle}
                onClick={() => onChange(instruments.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${item}`}
                title={`Remove ${item}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p style={emptyStyle}>None</p>
      )}
      <div style={addRowStyle}>
        <input
          ref={inputRef}
          type="text"
          style={addInputStyle}
          placeholder="Add an instrument…"
          onKeyDown={handleKeyDown}
          aria-label="Add instrument"
        />
      </div>
    </>
  )
}

// ── Instrument line editor (within a section) ────────────────────────────────

function InstrumentLineEditor({
  item,
  onChange,
  onRemove,
}: {
  item: InstrumentLineValue
  onChange: (next: InstrumentLineValue) => void
  onRemove: () => void
}) {
  const label = typeof item === 'string' ? item : item.label
  const isObj = typeof item !== 'string'
  const details = isObj ? item.details : []
  const note = isObj ? item.note : undefined
  const [expanded, setExpanded] = useState(isObj && (details.length > 0 || Boolean(note)))
  const detailInputRef = useRef<HTMLInputElement>(null)

  const toggleExpanded = useCallback(() => {
    if (!expanded && typeof item === 'string') {
      onChange({ label: item, details: [], note: undefined })
    }
    setExpanded((p) => !p)
  }, [expanded, item, onChange])

  const handleAddDetail = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const input = detailInputRef.current
        if (!input) return
        const val = input.value.trim()
        if (val) {
          const obj = typeof item === 'string' ? { label: item, details: [] } : { ...item }
          obj.details = [...obj.details, val]
          onChange(obj)
          input.value = ''
        }
      }
    },
    [item, onChange],
  )

  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          style={{ ...chipRemoveStyle, fontSize: '10px', color: 'var(--kui-color-scale-slate9)', flexShrink: 0 }}
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={`Toggle details for ${label}`}
          title={expanded ? 'Collapse details' : 'Expand details'}
        >
          <span style={chevronStyle(expanded)} aria-hidden="true">&#9654;</span>
        </button>
        <span style={chipStyle}>
          <span style={chipTextStyle}>{label}</span>
          <button
            type="button"
            style={chipRemoveStyle}
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
          >
            &times;
          </button>
        </span>
      </div>

      {expanded && (
        <div style={instrumentDetailRowStyle}>
          {details.length > 0 && (
            <div style={chipContainerStyle}>
              {details.map((d, di) => (
                <span key={`${d}-${di}`} style={{ ...chipStyle, fontSize: '11px', padding: '1px 3px 1px 6px' }}>
                  <span style={chipTextStyle}>{d}</span>
                  <button
                    type="button"
                    style={{ ...chipRemoveStyle, width: '16px', height: '16px', fontSize: '12px' }}
                    onClick={() => {
                      const obj = typeof item === 'string' ? { label: item, details: [] } : { ...item }
                      obj.details = obj.details.filter((_, idx) => idx !== di)
                      onChange(obj)
                    }}
                    aria-label={`Remove ${d}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={detailInputRef}
            type="text"
            style={{ ...addInputStyle, fontSize: '11px' }}
            placeholder="Add detail (e.g. Piccolo)…"
            onKeyDown={handleAddDetail}
            aria-label={`Add detail for ${label}`}
          />
          <input
            type="text"
            style={noteInputStyle}
            placeholder="Note (e.g. may substitute…)"
            value={note ?? ''}
            onChange={(e) => {
              const obj = typeof item === 'string' ? { label: item, details: [] } : { ...item }
              const val = e.target.value
              onChange(val ? { ...obj, note: val } : { ...obj, note: undefined })
            }}
            aria-label={`Note for ${label}`}
          />
        </div>
      )}
    </div>
  )
}

// ── Section editor (grouped mode) ────────────────────────────────────────────

function SectionEditor({
  section,
  onChange,
  onRemove,
}: {
  section: InstrumentSectionValue
  onChange: (next: InstrumentSectionValue) => void
  onRemove: () => void
}) {
  const [sectionOpen, setSectionOpen] = useState(true)
  const instrumentInputRef = useRef<HTMLInputElement>(null)

  const handleAddInstrument = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const input = instrumentInputRef.current
        if (!input) return
        const val = input.value.trim()
        if (val) {
          onChange({ ...section, instruments: [...section.instruments, val] })
          input.value = ''
        }
      }
    },
    [section, onChange],
  )

  return (
    <div style={sectionCardStyle}>
      <div style={sectionHeaderRowStyle}>
        <button
          type="button"
          style={{ ...chipRemoveStyle, fontSize: '10px', color: 'var(--kui-color-scale-slate9)' }}
          onClick={() => setSectionOpen((p) => !p)}
          aria-expanded={sectionOpen}
          aria-label={`Toggle ${section.section || 'section'}`}
        >
          <span style={chevronStyle(sectionOpen)} aria-hidden="true">&#9654;</span>
        </button>
        <input
          type="text"
          style={sectionNameInputStyle}
          value={section.section}
          onChange={(e) => onChange({ ...section, section: e.target.value })}
          placeholder="Section name (e.g. Woodwinds)"
          aria-label="Section name"
        />
        <span style={{ ...badgeStyle, flexShrink: 0 }}>{section.instruments.length}</span>
        <button
          type="button"
          style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}
          onClick={onRemove}
          aria-label={`Remove section ${section.section}`}
        >
          Remove
        </button>
      </div>

      {sectionOpen && (
        <div style={{ paddingLeft: '24px' }}>
          {section.instruments.map((inst, i) => (
            <InstrumentLineEditor
              key={`${typeof inst === 'string' ? inst : inst.label}-${i}`}
              item={inst}
              onChange={(next) => {
                const updated = [...section.instruments]
                updated[i] = next
                onChange({ ...section, instruments: updated })
              }}
              onRemove={() => {
                onChange({ ...section, instruments: section.instruments.filter((_, idx) => idx !== i) })
              }}
            />
          ))}
          <div style={addRowStyle}>
            <input
              ref={instrumentInputRef}
              type="text"
              style={addInputStyle}
              placeholder="Add instrument…"
              onKeyDown={handleAddInstrument}
              aria-label={`Add instrument to ${section.section}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grouped instrumentation section ──────────────────────────────────────────

function GroupedInstrumentationSection({
  sections,
  onChange,
}: {
  sections: InstrumentSectionValue[]
  onChange: (next: InstrumentSectionValue[]) => void
}) {
  return (
    <>
      {sections.map((sec, i) => (
        <SectionEditor
          key={`section-${i}`}
          section={sec}
          onChange={(next) => {
            const updated = [...sections]
            updated[i] = next
            onChange(updated)
          }}
          onRemove={() => onChange(sections.filter((_, idx) => idx !== i))}
        />
      ))}
      <div style={{ marginTop: '6px' }}>
        <button
          type="button"
          style={smallBtnStyle}
          onClick={() => onChange([...sections, { section: '', instruments: [] }])}
        >
          + Add Section
        </button>
      </div>
    </>
  )
}

// ── Instrumentation section (combined) ───────────────────────────────────────

function InstrumentationSection({
  value,
  onChange,
}: {
  value: InstrumentationValue
  onChange: (next: InstrumentationValue) => void
}) {
  const toggleId = 'instr-grouped-toggle'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={sectionHeadingStyle}>Instrumentation</h4>
        <div style={toggleRowStyle}>
          <label htmlFor={toggleId} style={toggleLabelStyle}>Grouped</label>
          <input
            id={toggleId}
            type="checkbox"
            checked={value.grouped}
            onChange={(e) => {
              onChange({ ...value, grouped: e.target.checked })
            }}
          />
        </div>
      </div>

      {value.grouped && (
        <div style={{ marginTop: '6px' }}>
          <label htmlFor="instr-label-input" style={toggleLabelStyle}>Label</label>
          <input
            id="instr-label-input"
            type="text"
            style={{ ...addInputStyle, marginTop: '4px' }}
            placeholder="e.g. Full Orchestra"
            value={value.label ?? ''}
            onChange={(e) => {
              const val = e.target.value
              onChange({ ...value, label: val || undefined })
            }}
            aria-label="Instrumentation label"
          />
        </div>
      )}

      {value.grouped ? (
        <GroupedInstrumentationSection
          sections={value.sections}
          onChange={(sections) => onChange({ ...value, sections })}
        />
      ) : (
        <FlatInstrumentationSection
          instruments={value.instruments}
          onChange={(instruments) => onChange({ ...value, instruments })}
        />
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

function CategorizationPanel({
  label,
  value,
  onChange,
}: {
  label: string
  value: CategorizationValue
  onChange: (next: CategorizationValue) => void
}) {
  const [open, setOpen] = useState(() => readCollapseState('categorization', false))

  const handleAdd = useCallback(
    (key: 'tags' | 'searchKeywords', item: string) => {
      onChange({ ...value, [key]: [...value[key], item] })
    },
    [value, onChange],
  )

  const handleRemove = useCallback(
    (key: 'tags' | 'searchKeywords', index: number) => {
      onChange({ ...value, [key]: value[key].filter((_, i) => i !== index) })
    },
    [value, onChange],
  )

  const active = totalItems(value)

  return (
    <div style={panelStyle}>
      <button
        type="button"
        style={headerStyle}
        onClick={() => setOpen((prev) => {
          const next = !prev
          persistCollapseState('categorization', next)
          return next
        })}
        aria-expanded={open}
      >
        <span style={headerLeftStyle}>
          <span style={chevronStyle(open)} aria-hidden="true">
            &#9654;
          </span>
          {label}
        </span>
        <span style={active > 0 ? activeBadgeStyle : badgeStyle}>{badgeText(value)}</span>
      </button>

      <div style={bodyStyle(open)}>
        <div style={bodyInnerStyle}>
          <TagArraySection
            config={SIMPLE_SECTIONS[0]}
            items={value.tags}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />

          <InstrumentationSection
            value={value.instrumentation}
            onChange={(instrumentation) => onChange({ ...value, instrumentation })}
          />

          <TagArraySection
            config={SIMPLE_SECTIONS[1]}
            items={value.searchKeywords}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </div>
      </div>
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

export function categorizationField(cfg: {
  label: string
}): BasicFormField<CategorizationValue, CategorizationValue, CategorizationValue> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<CategorizationValue>) {
      return <CategorizationPanel label={cfg.label} value={props.value} onChange={props.onChange} />
    },

    defaultValue: () => ({ ...DEFAULT_CATEGORIZATION, instrumentation: { ...DEFAULT_INSTRUMENTATION } }),

    parse(value: FormFieldStoredValue): CategorizationValue {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_CATEGORIZATION, instrumentation: { ...DEFAULT_INSTRUMENTATION } }
      }
      const obj = value as Record<string, unknown>
      return {
        tags: parseStringArray(obj.tags),
        instrumentation: parseInstrumentation(obj.instrumentation),
        searchKeywords: parseStringArray(obj.searchKeywords),
      }
    },

    serialize(value: CategorizationValue) {
      // Serialize instrumentation: only include the relevant fields
      const instr = value.instrumentation
      let serializedInstr: Record<string, unknown>
      if (instr.grouped) {
        serializedInstr = {
          grouped: true,
          ...(instr.label ? { label: instr.label } : {}),
          sections: instr.sections.map((s) => ({
            section: s.section,
            instruments: s.instruments.map((inst) => {
              if (typeof inst === 'string') return inst
              // Only include object form if there are details or a note
              if (inst.details.length === 0 && !inst.note) return inst.label
              const obj: Record<string, unknown> = { label: inst.label }
              if (inst.details.length > 0) obj.details = inst.details
              if (inst.note) obj.note = inst.note
              return obj
            }),
          })),
        }
      } else {
        serializedInstr = {
          ...(instr.label ? { label: instr.label } : {}),
          instruments: instr.instruments,
        }
      }

      return {
        value: {
          tags: value.tags,
          instrumentation: serializedInstr,
          searchKeywords: value.searchKeywords,
        } as unknown as FormFieldStoredValue,
      }
    },

    validate(value: CategorizationValue): CategorizationValue {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): CategorizationValue {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { ...DEFAULT_CATEGORIZATION, instrumentation: { ...DEFAULT_INSTRUMENTATION } }
        }
        const obj = value as Record<string, unknown>
        return {
          tags: parseStringArray(obj.tags),
          instrumentation: parseInstrumentation(obj.instrumentation),
          searchKeywords: parseStringArray(obj.searchKeywords),
        }
      },
    },
  }
}
