import {
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import type { BasicFormField, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

type SectionType = 'hero' | 'featured-work' | 'select-works' | 'contact'

interface SectionBlock {
  discriminant: SectionType
  value: Record<string, unknown>
}

interface SectionItem {
  block: SectionBlock
}

interface SelectOption {
  label: string
  value: string
}

interface AccordionSectionsFieldConfig {
  label: string
  description?: string
  heroOptions: SelectOption[]
}

// ── Section metadata ─────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  'featured-work': 'Featured Work',
  'select-works': 'Select Works',
  contact: 'Contact',
}

const SECTION_TYPES: SectionType[] = ['hero', 'featured-work', 'select-works', 'contact']

const SORT_ORDER_OPTIONS: SelectOption[] = [
  { label: 'Selected order', value: 'selected-order' },
  { label: 'Random', value: 'random' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'By title', value: 'title' },
]

// ── Default values per section type ──────────────────────────────────────────

function defaultValueForSection(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return {
        heroTitle: '',
        heroSubtitle: 'Composer',
        heroTagline: 'Original concert music for acoustic instruments and ensembles.',
        heroTaglineAsBlockquote: false,
        heroTaglineCitation: '',
        actions: {
          listenNow: { visible: true, label: 'Listen Now' },
          searchMusic: { visible: true, label: 'Search Music' },
        },
        preferredHeroId: null,
        fallbackHeroId: null,
        defaultFilter: 'saturate(0.72) contrast(1.06) brightness(0.72)',
      }
    case 'featured-work':
      return {
        sectionTitle: 'Featured Recording',
        activeSectionTitle: 'Currently Playing',
        buttonText: 'More Details',
      }
    case 'select-works':
      return {
        sectionTitle: 'Select Works',
        ignoreSelected: false,
        showAllIfNoSelected: true,
        sortOrder: 'random',
      }
    case 'contact':
      return {
        contactIntro:
          'Whether you are interested in a score, a performance, or something else, I would be glad to hear from you.',
        sectionTitle: 'Contact',
      }
  }
}

// ── Nested value helpers ─────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.')
  const result = { ...obj }

  if (keys.length === 1) {
    result[keys[0]] = value
    return result
  }

  // Deep clone the nested path
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nested = current[key]
    const clone = nested && typeof nested === 'object' ? { ...(nested as Record<string, unknown>) } : {}
    current[key] = clone
    current = clone
  }
  current[keys[keys.length - 1]] = value
  return result
}

// ── CSS injection ───────────────────────────────────────────────────────────
//
// Inject a <style> block once for the accordion chrome. Form field inputs
// continue to use inline styles with KUI custom properties.

const ACCORDION_TRANSITION_MS = 160 // matches KUI --kui-animation-duration-short
const HP_ACCORDION_STYLE_ID = 'hp-accordion-styles'

const HP_ACCORDION_CSS = `
  .hp-accordion {
    display: flex;
    flex-direction: column;
    font-family: var(--kui-typography-font-family-base, inherit);
  }
  .hp-accordion__header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  /* ── Section card ─────────────────────────────────────────── */
  .hp-section {
    margin-bottom: 0.55rem;
    border: 1px solid var(--kui-color-scale-slate5);
    border-radius: var(--kui-size-radius-medium);
    background: transparent;
    overflow: hidden;
    transition:
      border-color ${ACCORDION_TRANSITION_MS}ms ease,
      background-color ${ACCORDION_TRANSITION_MS}ms ease,
      box-shadow ${ACCORDION_TRANSITION_MS}ms ease;
  }
  .hp-section[data-open="true"] {
    border-color: var(--kui-color-scale-slate7);
    background: var(--kui-color-scale-slate3);
  }
  .hp-section:has(> .hp-section__summary:hover) {
    border-color: var(--kui-color-scale-slate7);
    box-shadow: 0 0 0 1px rgba(128, 128, 128, 0.08);
  }

  /* ── Summary header ───────────────────────────────────────── */
  .hp-section__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.7rem 0.8rem;
    border-radius: calc(var(--kui-size-radius-medium) - 1px);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: var(--kui-typography-font-weight-semibold, 600);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--kui-color-scale-slate10);
    user-select: none;
    -webkit-user-select: none;
    transition:
      color ${ACCORDION_TRANSITION_MS}ms ease,
      background-color ${ACCORDION_TRANSITION_MS}ms ease;
    list-style: none;
    border: none;
    background: none;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    line-height: 1;
    overflow: hidden;
  }
  .hp-section__summary:hover {
    color: var(--kui-color-scale-slate12);
  }
  .hp-section[data-open="true"] > .hp-section__summary {
    color: var(--kui-color-scale-slate12);
  }
  .hp-section__summary-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }

  /* ── Chevron icon ─────────────────────────────────────────── */
  .hp-section__chevron {
    width: 0.85rem;
    height: 0.85rem;
    flex-shrink: 0;
    color: var(--kui-color-scale-slate11);
    transform: rotate(0deg);
    transition:
      transform ${ACCORDION_TRANSITION_MS}ms ease,
      color ${ACCORDION_TRANSITION_MS}ms ease;
  }
  .hp-section[data-open="true"] .hp-section__chevron {
    transform: rotate(90deg);
  }
  .hp-section__summary:hover .hp-section__chevron {
    color: var(--kui-color-scale-slate12);
  }

  /* ── Action buttons ───────────────────────────────────────── */
  .hp-section__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .hp-section__action-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--kui-size-radius-small);
    background: transparent;
    color: var(--kui-color-scale-slate9);
    padding: 0.2rem;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease;
    line-height: 1;
    font-size: 0;
  }
  .hp-section__action-btn:hover:not(:disabled) {
    background: var(--kui-color-scale-slate5);
    color: var(--kui-color-scale-slate12);
  }
  .hp-section__action-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* ── Animated body (always mounted, grid-template-rows transition) ── */
  .hp-section__body {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    padding: 0 0.8rem;
    pointer-events: none;
    transition:
      grid-template-rows ${ACCORDION_TRANSITION_MS}ms ease,
      opacity ${ACCORDION_TRANSITION_MS}ms ease,
      padding-bottom ${ACCORDION_TRANSITION_MS}ms ease;
  }
  .hp-section[data-open="true"] > .hp-section__body {
    grid-template-rows: 1fr;
    opacity: 1;
    padding-bottom: 0.8rem;
    pointer-events: auto;
  }
  .hp-section__body-inner {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding-top: 0.15rem;
    transition: padding-top ${ACCORDION_TRANSITION_MS}ms ease;
  }
  .hp-section:not([data-open="true"]) > .hp-section__body > .hp-section__body-inner {
    padding-top: 0;
  }

  /* ── Drag handle ─────────────────────────────────────────── */
  .hp-section__drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    color: var(--kui-color-scale-slate7);
    padding: 0.15rem 0.1rem;
    flex-shrink: 0;
    touch-action: none;
    border-radius: var(--kui-size-radius-small);
    transition: color ${ACCORDION_TRANSITION_MS}ms ease;
  }
  .hp-section__drag-handle:hover {
    color: var(--kui-color-scale-slate10);
  }

  /* ── Drag-and-drop states ──────────────────────────────────── */
  .hp-section--dragging {
    opacity: 0.35;
  }
  .hp-section[data-drop-position="above"] {
    box-shadow: 0 -3px 0 0 var(--kui-color-scale-indigo9),
      0 -6px 12px -4px color-mix(in oklch, var(--kui-color-scale-indigo9) 35%, transparent);
  }
  .hp-section[data-drop-position="below"] {
    box-shadow: 0 3px 0 0 var(--kui-color-scale-indigo9),
      0 6px 12px -4px color-mix(in oklch, var(--kui-color-scale-indigo9) 35%, transparent);
  }

  /* ── Add section button ───────────────────────────────────── */
  .hp-add-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    font-size: 0.78rem;
    font-weight: var(--kui-typography-font-weight-semibold, 600);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kui-color-scale-slate10);
    background: var(--kui-color-scale-slate2);
    border: 1px dashed var(--kui-color-scale-slate6);
    border-radius: var(--kui-size-radius-medium);
    cursor: pointer;
    transition:
      background-color ${ACCORDION_TRANSITION_MS}ms ease,
      border-color ${ACCORDION_TRANSITION_MS}ms ease,
      color ${ACCORDION_TRANSITION_MS}ms ease;
    line-height: 1;
    margin-top: 0.15rem;
  }
  .hp-add-btn:hover {
    background: var(--kui-color-scale-slate3);
    border-color: var(--kui-color-scale-slate8);
    color: var(--kui-color-scale-slate12);
  }

  /* ── Add section dropdown menu ────────────────────────────── */
  .hp-add-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--kui-color-scale-slate3);
    border: 1px solid var(--kui-color-scale-slate6);
    border-radius: var(--kui-size-radius-medium);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    z-index: 11;
    min-width: 180px;
  }
  .hp-add-menu-item {
    display: block;
    width: 100%;
    padding: 0.55rem 0.85rem;
    font-size: 0.82rem;
    color: var(--kui-color-scale-slate12);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 120ms ease;
  }
  .hp-add-menu-item:hover {
    background: var(--kui-color-scale-slate5);
  }

  /* ── Reduced motion ───────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .hp-section,
    .hp-section__summary,
    .hp-section__chevron,
    .hp-section__body,
    .hp-section__body-inner,
    .hp-section__action-btn,
    .hp-add-btn {
      transition-duration: 0ms !important;
    }
  }
`

function ensureAccordionStyles(): void {
  if (document.getElementById(HP_ACCORDION_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = HP_ACCORDION_STYLE_ID
  style.textContent = HP_ACCORDION_CSS
  document.head.append(style)
}

// ── Shared inline styles for form fields ────────────────────────────────────

const fieldGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-slate12)',
  lineHeight: '1.4',
}

const descriptionStyle: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--kui-color-scale-slate9)',
  lineHeight: '1.4',
  margin: 0,
}

const textInputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  lineHeight: '1.5',
  color: 'var(--kui-color-scale-slate12)',
  backgroundColor: 'var(--kui-color-scale-slate1)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: 'var(--kui-size-radius-regular)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.15s',
}

const textareaStyle: CSSProperties = {
  ...textInputStyle,
  minHeight: '72px',
  resize: 'vertical' as const,
}

const selectStyle: CSSProperties = {
  ...textInputStyle,
  paddingRight: '2rem',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.6rem center',
  backgroundSize: '0.9rem',
}

const checkboxWrapperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '4px 0',
}

const checkboxInputStyle: CSSProperties = {
  marginTop: '3px',
  accentColor: 'var(--kui-color-scale-indigo9)',
  width: '16px',
  height: '16px',
  flexShrink: 0,
  cursor: 'pointer',
}

const checkboxLabelStyle: CSSProperties = {
  fontSize: '14px',
  color: 'var(--kui-color-scale-slate12)',
  lineHeight: '1.4',
  cursor: 'pointer',
  userSelect: 'none' as const,
}

const subGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '12px',
  border: '1px solid var(--kui-color-scale-slate4)',
  borderRadius: 'var(--kui-size-radius-regular)',
  backgroundColor: 'var(--kui-color-scale-slate2)',
}

const subGroupLabelStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-slate11)',
  letterSpacing: '0.01em',
}

// ── Reusable input components ────────────────────────────────────────────────

function TextField({
  label: fieldLabel,
  description,
  value,
  onChange,
  multiline,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  const id = useRef(`field-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <div style={fieldGroupStyle}>
      <label htmlFor={id} style={labelStyle}>
        {fieldLabel}
      </label>
      {description && <p style={descriptionStyle}>{description}</p>}
      {multiline ? (
        <textarea id={id} style={textareaStyle} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <input id={id} type="text" style={textInputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function CheckboxField({
  label: fieldLabel,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useRef(`field-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <div style={fieldGroupStyle}>
      <div style={checkboxWrapperStyle}>
        <input
          id={id}
          type="checkbox"
          style={checkboxInputStyle}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} style={checkboxLabelStyle}>
          {fieldLabel}
        </label>
      </div>
      {description && <p style={{ ...descriptionStyle, paddingLeft: '24px' }}>{description}</p>}
    </div>
  )
}

function SelectField({
  label: fieldLabel,
  description,
  value,
  onChange,
  options,
  allowEmpty,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  allowEmpty?: boolean
}) {
  const id = useRef(`field-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <div style={fieldGroupStyle}>
      <label htmlFor={id} style={labelStyle}>
        {fieldLabel}
      </label>
      {description && <p style={descriptionStyle}>{description}</p>}
      <select id={id} style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">— None —</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SubGroup({ label: groupLabel, children }: { label: string; children: ReactNode }) {
  return (
    <div style={subGroupStyle}>
      <span style={subGroupLabelStyle}>{groupLabel}</span>
      {children}
    </div>
  )
}

// ── Section-specific renderers ───────────────────────────────────────────────

type SectionFieldUpdater = (path: string, value: unknown) => void

function HeroFields({
  data,
  onUpdate,
  heroOptions,
}: {
  data: Record<string, unknown>
  onUpdate: SectionFieldUpdater
  heroOptions: SelectOption[]
}) {
  const asBlockquote = Boolean(data.heroTaglineAsBlockquote)

  return (
    <>
      <TextField
        label="Hero title"
        description="Large heading on the homepage hero. Defaults to composer name."
        value={String(data.heroTitle ?? '')}
        onChange={(v) => onUpdate('heroTitle', v)}
      />
      <TextField
        label="Hero subtitle"
        description='Shown next to the title (e.g. "Composer")'
        value={String(data.heroSubtitle ?? '')}
        onChange={(v) => onUpdate('heroSubtitle', v)}
      />
      <TextField
        label="Hero tagline"
        description="Descriptive text below the title"
        value={String(data.heroTagline ?? '')}
        onChange={(v) => onUpdate('heroTagline', v)}
        multiline
      />
      <CheckboxField
        label="Render tagline as blockquote"
        description="Wraps the tagline in a blockquote, adds curly quotes, and allows a citation below it."
        checked={asBlockquote}
        onChange={(v) => onUpdate('heroTaglineAsBlockquote', v)}
      />
      {asBlockquote && (
        <TextField
          label="Blockquote citation"
          description="Optional attribution shown below the tagline when blockquote mode is enabled."
          value={String(data.heroTaglineCitation ?? '')}
          onChange={(v) => onUpdate('heroTaglineCitation', v)}
        />
      )}

      <SubGroup label="Hero actions">
        <SubGroup label="Listen button">
          <CheckboxField
            label='Show "Listen Now"'
            checked={Boolean(getNestedValue(data, 'actions.listenNow.visible') ?? true)}
            onChange={(v) => onUpdate('actions.listenNow.visible', v)}
          />
          <TextField
            label='"Listen Now" text'
            description="The button still scrolls to the Featured Recording section."
            value={String(getNestedValue(data, 'actions.listenNow.label') ?? 'Listen Now')}
            onChange={(v) => onUpdate('actions.listenNow.label', v)}
          />
        </SubGroup>
        <SubGroup label="Search button">
          <CheckboxField
            label='Show "Search Music"'
            checked={Boolean(getNestedValue(data, 'actions.searchMusic.visible') ?? true)}
            onChange={(v) => onUpdate('actions.searchMusic.visible', v)}
          />
          <TextField
            label='"Search Music" text'
            description="The button still opens the music search modal."
            value={String(getNestedValue(data, 'actions.searchMusic.label') ?? 'Search Music')}
            onChange={(v) => onUpdate('actions.searchMusic.label', v)}
          />
        </SubGroup>
      </SubGroup>

      <SelectField
        label="Preferred hero image"
        description="Hero image to show by default on the homepage."
        value={String(data.preferredHeroId ?? '')}
        onChange={(v) => onUpdate('preferredHeroId', v || null)}
        options={heroOptions}
        allowEmpty
      />
      <SelectField
        label="Fallback hero image"
        description="Hero image used if the preferred image is not found."
        value={String(data.fallbackHeroId ?? '')}
        onChange={(v) => onUpdate('fallbackHeroId', v || null)}
        options={heroOptions}
        allowEmpty
      />
      <TextField
        label="Default CSS filter"
        description="CSS filter applied to hero images that don't define their own (e.g. saturate(0.72) contrast(1.06) brightness(0.72))."
        value={String(data.defaultFilter ?? '')}
        onChange={(v) => onUpdate('defaultFilter', v)}
      />
    </>
  )
}

function FeaturedWorkFields({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>
  onUpdate: SectionFieldUpdater
}) {
  return (
    <>
      <TextField
        label="Section title"
        description='Heading shown when no recording is playing. Defaults to "Featured Recording".'
        value={String(data.sectionTitle ?? '')}
        onChange={(v) => onUpdate('sectionTitle', v)}
      />
      <TextField
        label="Active section title"
        description='Heading shown when a recording is playing. Defaults to "Currently Playing".'
        value={String(data.activeSectionTitle ?? '')}
        onChange={(v) => onUpdate('activeSectionTitle', v)}
      />
      <TextField
        label="Button text"
        description='Text on the featured work link button. Defaults to "More Details".'
        value={String(data.buttonText ?? '')}
        onChange={(v) => onUpdate('buttonText', v)}
      />
    </>
  )
}

function SelectWorksFields({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>
  onUpdate: SectionFieldUpdater
}) {
  return (
    <>
      <TextField
        label="Section title"
        description='Heading shown above the works carousel. Defaults to "Select Works".'
        value={String(data.sectionTitle ?? '')}
        onChange={(v) => onUpdate('sectionTitle', v)}
      />
      <CheckboxField
        label="Ignore selected works"
        description="When checked, the homepage carousel always uses the full works list."
        checked={Boolean(data.ignoreSelected)}
        onChange={(v) => onUpdate('ignoreSelected', v)}
      />
      <CheckboxField
        label="Show all if none selected"
        description="When checked, the homepage falls back to all works if no works are marked as selected. Ignored when selected works are being ignored."
        checked={Boolean(data.showAllIfNoSelected ?? true)}
        onChange={(v) => onUpdate('showAllIfNoSelected', v)}
      />
      <SelectField
        label="Sort order"
        description="How works are ordered in the homepage carousel."
        value={String(data.sortOrder ?? 'random')}
        onChange={(v) => onUpdate('sortOrder', v)}
        options={SORT_ORDER_OPTIONS}
      />
    </>
  )
}

function ContactFields({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>
  onUpdate: SectionFieldUpdater
}) {
  return (
    <>
      <TextField
        label="Contact intro text"
        description="Introductory text shown above the contact section on the homepage"
        value={String(data.contactIntro ?? '')}
        onChange={(v) => onUpdate('contactIntro', v)}
        multiline
      />
      <TextField
        label="Section title"
        description='Heading shown above the contact section. Defaults to "Contact".'
        value={String(data.sectionTitle ?? '')}
        onChange={(v) => onUpdate('sectionTitle', v)}
      />
    </>
  )
}

// ── SVG icons ────────────────────────────────────────────────────────────────

/** Six-dot grip handle — visually signals "drag to reorder". */
function GripVerticalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

/** Solid caret pointing up — distinct from the outline chevron used for expand/collapse. */
function MoveUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 4L2.5 11h11z" />
    </svg>
  )
}

/** Solid caret pointing down — distinct from the outline chevron used for expand/collapse. */
function MoveDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 12L2.5 5h11z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

// ── Scroll-container height constraint ───────────────────────────────────────
//
// When an accordion body is taller than the available space inside Keystatic's
// scrollable form area, we cap its height with a maxHeight + overflowY: auto,
// then scroll-center the section.  This mirrors Theme Studio's accordion UX.

/** Walk up from `el` to find the nearest scrollable ancestor. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

// ── Main accordion component ─────────────────────────────────────────────────

function AccordionSectionsInput({
  value,
  onChange,
  heroOptions,
}: {
  value: SectionItem[]
  onChange: (value: SectionItem[]) => void
  autoFocus: boolean
  forceValidation: boolean
  heroOptions: SelectOption[]
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Drag-and-drop state
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'above' | 'below' } | null>(null)
  const canDragRef = useRef(false)

  // Refs for each section wrapper element and body-inner element
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const bodyInnerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const constrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inject accordion CSS on first mount
  useLayoutEffect(() => {
    ensureAccordionStyles()
  }, [])

  /** Clear all maxHeight / overflowY constraints on every body-inner. */
  const clearAllConstraints = useCallback(() => {
    bodyInnerRefs.current.forEach((inner) => {
      inner.style.maxHeight = ''
      inner.style.overflowY = ''
    })
  }, [])

  /**
   * After the CSS open transition completes, measure the opened section
   * against its scroll container and apply a height cap if it overflows.
   * Then scroll the section into a centered position.
   */
  useLayoutEffect(() => {
    // Clear previous timer
    if (constrainTimerRef.current) {
      clearTimeout(constrainTimerRef.current)
      constrainTimerRef.current = null
    }

    clearAllConstraints()

    if (openIndex == null) return

    constrainTimerRef.current = setTimeout(() => {
      const sectionEl = sectionRefs.current.get(openIndex)
      const bodyInner = bodyInnerRefs.current.get(openIndex)
      if (!sectionEl || !bodyInner) return

      const scrollParent = findScrollParent(sectionEl)
      if (!scrollParent) {
        sectionEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }

      // Force layout read
      void bodyInner.scrollHeight

      const parentRect = scrollParent.getBoundingClientRect()
      const sectionRect = sectionEl.getBoundingClientRect()

      // If the section already fits entirely within the scroll container, just center it
      if (sectionRect.top >= parentRect.top && sectionRect.bottom <= parentRect.bottom) {
        sectionEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }

      const header = sectionEl.querySelector<HTMLElement>('.hp-section__summary')
      const headerHeight = header?.offsetHeight ?? 40

      const bodyEl = bodyInner.parentElement
      const bodyPadding = bodyEl
        ? parseFloat(getComputedStyle(bodyEl).paddingTop) + parseFloat(getComputedStyle(bodyEl).paddingBottom)
        : 0

      const pad = 8
      const availableHeight = scrollParent.clientHeight - headerHeight - bodyPadding - pad * 2

      if (availableHeight > 0 && bodyInner.scrollHeight > availableHeight) {
        bodyInner.style.maxHeight = `${availableHeight}px`
        bodyInner.style.overflowY = 'auto'
      }

      sectionEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, ACCORDION_TRANSITION_MS + 20)

    return () => {
      if (constrainTimerRef.current) {
        clearTimeout(constrainTimerRef.current)
      }
    }
  }, [openIndex, clearAllConstraints])

  const toggleSection = useCallback((index: number) => {
    clearAllConstraints()
    setOpenIndex((prev) => (prev === index ? null : index))
  }, [clearAllConstraints])

  const updateSectionField = useCallback(
    (sectionIndex: number, fieldPath: string, fieldValue: unknown) => {
      const updated = value.map((item, i) => {
        if (i !== sectionIndex) return item
        return {
          block: {
            ...item.block,
            value: setNestedValue(item.block.value, fieldPath, fieldValue),
          },
        }
      })
      onChange(updated)
    },
    [value, onChange],
  )

  const moveSection = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= value.length) return
      const updated = [...value]
      ;[updated[index], updated[target]] = [updated[target], updated[index]]

      clearAllConstraints()

      // Keep the open index following the moved section
      setOpenIndex((prev) => {
        if (prev === index) return target
        if (prev === target) return index
        return prev
      })

      onChange(updated)
    },
    [value, onChange, clearAllConstraints],
  )

  const removeSection = useCallback(
    (index: number) => {
      const label = SECTION_LABELS[value[index].block.discriminant] ?? 'this section'
      if (!confirm(`Remove "${label}" from the homepage?`)) return
      const updated = value.filter((_, i) => i !== index)

      setOpenIndex((prev) => {
        if (prev === null) return null
        if (prev === index) return null
        if (prev > index) return prev - 1
        return prev
      })

      onChange(updated)
    },
    [value, onChange],
  )

  const addSection = useCallback(
    (type: SectionType) => {
      const newItem: SectionItem = {
        block: {
          discriminant: type,
          value: defaultValueForSection(type),
        },
      }
      const newIndex = value.length
      onChange([...value, newItem])
      clearAllConstraints()
      setOpenIndex(newIndex)
      setAddMenuOpen(false)
    },
    [value, onChange, clearAllConstraints],
  )

  // ── Drag-and-drop handlers ──────────────────────────────────────────────

  const handleDragHandlePointerDown = useCallback(() => {
    canDragRef.current = true
  }, [])

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, index: number) => {
      if (!canDragRef.current) {
        e.preventDefault()
        return
      }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))

      // Build a clean ghost image clipped to just this section card.
      // Append to the section's parent (inside the KUI theme scope) so
      // CSS custom properties like --kui-typography-font-family-base resolve.
      const section = e.currentTarget
      const rect = section.getBoundingClientRect()
      const ghost = section.cloneNode(true) as HTMLElement
      ghost.style.width = `${rect.width}px`
      ghost.style.height = `${rect.height}px`
      ghost.style.overflow = 'hidden'
      ghost.style.position = 'fixed'
      ghost.style.top = '-9999px'
      ghost.style.left = '-9999px'
      ghost.style.pointerEvents = 'none'
      ghost.style.opacity = '0.25'
      const themeParent = section.parentElement ?? document.body
      themeParent.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top)
      // Remove clone after browser has captured the ghost bitmap
      requestAnimationFrame(() => ghost.remove())

      // Delay so the browser captures the ghost before we dim the source
      setTimeout(() => setDragSourceIndex(index), 0)
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, index: number) => {
      if (dragSourceIndex === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const position: 'above' | 'below' = e.clientY < midY ? 'above' : 'below'
      const insertIndex = position === 'above' ? index : index + 1

      // Suppress indicator when drop would be a no-op
      if (insertIndex === dragSourceIndex || insertIndex === dragSourceIndex + 1) {
        setDropTarget(null)
      } else {
        setDropTarget({ index, position })
      }
    },
    [dragSourceIndex],
  )

  const handleDragEnd = useCallback(() => {
    canDragRef.current = false
    setDragSourceIndex(null)
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      if (dragSourceIndex === null || dropTarget === null) return

      const insertIndex = dropTarget.position === 'above' ? dropTarget.index : dropTarget.index + 1
      const updated = [...value]
      const [moved] = updated.splice(dragSourceIndex, 1)
      const finalIndex = insertIndex > dragSourceIndex ? insertIndex - 1 : insertIndex
      updated.splice(finalIndex, 0, moved)

      clearAllConstraints()

      // Keep the open index following the moved item
      setOpenIndex((prev) => {
        if (prev === null) return null
        if (prev === dragSourceIndex) return finalIndex
        if (dragSourceIndex < prev && finalIndex >= prev) return prev - 1
        if (dragSourceIndex > prev && finalIndex <= prev) return prev + 1
        return prev
      })

      onChange(updated)
      setDragSourceIndex(null)
      setDropTarget(null)
    },
    [dragSourceIndex, dropTarget, value, onChange, clearAllConstraints],
  )

  const renderSectionBody = useCallback(
    (section: SectionItem, index: number) => {
      const updater: SectionFieldUpdater = (path, val) => updateSectionField(index, path, val)

      switch (section.block.discriminant) {
        case 'hero':
          return <HeroFields data={section.block.value} onUpdate={updater} heroOptions={heroOptions} />
        case 'featured-work':
          return <FeaturedWorkFields data={section.block.value} onUpdate={updater} />
        case 'select-works':
          return <SelectWorksFields data={section.block.value} onUpdate={updater} />
        case 'contact':
          return <ContactFields data={section.block.value} onUpdate={updater} />
        default:
          return null
      }
    },
    [updateSectionField, heroOptions],
  )

  // Available section types not yet used
  const availableTypes = SECTION_TYPES.filter(
    (type) => !value.some((item) => item.block.discriminant === type),
  )

  return (
    <div className="hp-accordion">
      <div className="hp-accordion__header">
        <span style={labelStyle}>Homepage sections</span>
        <p style={descriptionStyle}>
          Controls which blocks appear and in what order. Click a section to edit its content.
        </p>
      </div>

      {value.map((section, index) => {
        const isOpen = openIndex === index
        const isDragging = dragSourceIndex === index
        const sectionLabel = SECTION_LABELS[section.block.discriminant] ?? section.block.discriminant

        return (
          <div
            key={`${section.block.discriminant}-${index}`}
            className={`hp-section${isDragging ? ' hp-section--dragging' : ''}`}
            data-open={isOpen}
            data-drop-position={dropTarget?.index === index ? dropTarget.position : undefined}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            ref={(el) => {
              if (el) sectionRefs.current.set(index, el)
              else sectionRefs.current.delete(index)
            }}
          >
            {/* Accordion header */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              className="hp-section__summary"
              onClick={() => {
                if (dragSourceIndex !== null) return // ignore clicks during drag
                toggleSection(index)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSection(index)
                }
              }}
            >
              <span
                className="hp-section__drag-handle"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={handleDragHandlePointerDown}
                onPointerUp={() => { canDragRef.current = false }}
              >
                <GripVerticalIcon />
              </span>
              <span className="hp-section__summary-label">
                <svg
                  className="hp-section__chevron"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m9 18 6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {sectionLabel}
              </span>
              <span
                className="hp-section__actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="hp-section__action-btn"
                  title="Move up"
                  aria-label={`Move ${sectionLabel} up`}
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  <MoveUpIcon />
                </button>
                <button
                  type="button"
                  className="hp-section__action-btn"
                  title="Move down"
                  aria-label={`Move ${sectionLabel} down`}
                  disabled={index === value.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  <MoveDownIcon />
                </button>
                <button
                  type="button"
                  className="hp-section__action-btn"
                  title={`Remove ${sectionLabel}`}
                  aria-label={`Remove ${sectionLabel}`}
                  onClick={() => removeSection(index)}
                >
                  <TrashIcon />
                </button>
              </span>
            </div>

            {/* Accordion body — always mounted, animated via CSS grid-template-rows */}
            <div
              className="hp-section__body"
              aria-hidden={!isOpen}
              ref={(el) => {
                if (el) {
                  // Set inert on collapsed bodies to prevent tab navigation
                  if (isOpen) {
                    el.removeAttribute('inert')
                  } else {
                    el.setAttribute('inert', '')
                  }
                }
              }}
            >
              <div
                className="hp-section__body-inner"
                ref={(el) => {
                  if (el) bodyInnerRefs.current.set(index, el)
                  else bodyInnerRefs.current.delete(index)
                }}
              >
                {renderSectionBody(section, index)}
              </div>
            </div>
          </div>
        )
      })}

      {/* Add section */}
      {availableTypes.length > 0 && (
        <div style={{ position: 'relative' }} ref={addMenuRef}>
          <button
            type="button"
            className="hp-add-btn"
            onClick={() => setAddMenuOpen((prev) => !prev)}
            aria-expanded={addMenuOpen}
            aria-haspopup="true"
          >
            <PlusIcon /> Add section
          </button>
          {addMenuOpen && (
            <>
              {/* Click-away backdrop */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <div
                onClick={() => setAddMenuOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10,
                }}
              />
              <div role="menu" className="hp-add-menu">
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    className="hp-add-menu-item"
                    onClick={() => addSection(type)}
                  >
                    {SECTION_LABELS[type]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

export function accordionSectionsField(
  cfg: AccordionSectionsFieldConfig,
): BasicFormField<SectionItem[]> {
  const emptyDefault: SectionItem[] = []

  return {
    kind: 'form',
    label: cfg.label,

    Input(props) {
      return (
        <AccordionSectionsInput
          value={props.value}
          onChange={props.onChange}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- Keystatic field API passes autoFocus for CMS-internal focus management
          autoFocus={props.autoFocus}
          forceValidation={props.forceValidation}
          heroOptions={cfg.heroOptions}
        />
      )
    },

    defaultValue: () => emptyDefault,

    parse(value: FormFieldStoredValue): SectionItem[] {
      if (!Array.isArray(value)) return emptyDefault
      return value.map((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return { block: { discriminant: 'hero' as SectionType, value: {} } }
        }
        const obj = item as Record<string, unknown>
        const block = (obj.block ?? obj) as Record<string, unknown>
        return {
          block: {
            discriminant: (block.discriminant as SectionType) ?? 'hero',
            value: (block.value as Record<string, unknown>) ?? {},
          },
        }
      })
    },

    serialize(value: SectionItem[]) {
      return {
        value: (value.length > 0 ? value : undefined) as FormFieldStoredValue | undefined,
      }
    },

    validate(value: SectionItem[]): SectionItem[] {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): SectionItem[] {
        if (!Array.isArray(value)) return emptyDefault
        return value.map((item: unknown) => {
          if (!item || typeof item !== 'object') {
            return { block: { discriminant: 'hero' as SectionType, value: {} } }
          }
          const obj = item as Record<string, unknown>
          const block = (obj.block ?? obj) as Record<string, unknown>
          return {
            block: {
              discriminant: (block.discriminant as SectionType) ?? 'hero',
              value: (block.value as Record<string, unknown>) ?? {},
            },
          }
        })
      },
    },
  }
}
