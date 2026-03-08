import { useState, useCallback, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'
import { readCollapseState, persistCollapseState } from './collapse-storage'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreOverrides {
  viewerWatermark: '' | 'enabled' | 'disabled'
  viewerGating: '' | 'gated' | 'ungated'
  pdfWatermarked: '' | 'enabled' | 'disabled'
  pdfOriginal: '' | 'enabled' | 'disabled'
  pdfWatermarkedGating: '' | 'gated' | 'ungated'
  pdfOriginalGating: '' | 'gated' | 'ungated'
}

const DEFAULT_OVERRIDES: ScoreOverrides = {
  viewerWatermark: '',
  viewerGating: '',
  pdfWatermarked: '',
  pdfOriginal: '',
  pdfWatermarkedGating: '',
  pdfOriginalGating: '',
}

type EnabledDisabledValue = '' | 'enabled' | 'disabled'
type GatedUngatedValue = '' | 'gated' | 'ungated'

interface SelectConfig {
  key: keyof ScoreOverrides
  label: string
  options: Array<{ label: string; value: string }>
}

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
  maxHeight: open ? '600px' : '0px',
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

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
}

const fieldGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const fieldLabelStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--kui-color-scale-slate10)',
}

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate11)',
  backgroundColor: 'var(--kui-color-scale-slate1)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  fontFamily: KUI_FONT,
  cursor: 'pointer',
  appearance: 'auto',
}

// ── Select configs ───────────────────────────────────────────────────────────

const ENABLED_DISABLED_OPTIONS = [
  { label: 'Use site default', value: '' },
  { label: 'Enabled', value: 'enabled' },
  { label: 'Disabled', value: 'disabled' },
]

const GATED_UNGATED_OPTIONS = [
  { label: 'Use site default', value: '' },
  { label: 'Always gated', value: 'gated' },
  { label: 'Always ungated', value: 'ungated' },
]

const VIEWER_SELECTS: SelectConfig[] = [
  { key: 'viewerWatermark', label: 'Watermark', options: ENABLED_DISABLED_OPTIONS },
  { key: 'viewerGating', label: 'Access control', options: GATED_UNGATED_OPTIONS },
]

const PDF_SELECTS: SelectConfig[] = [
  { key: 'pdfWatermarked', label: 'Watermarked PDF', options: ENABLED_DISABLED_OPTIONS },
  { key: 'pdfOriginal', label: 'Original PDF', options: ENABLED_DISABLED_OPTIONS },
  { key: 'pdfWatermarkedGating', label: 'Watermarked PDF gating', options: GATED_UNGATED_OPTIONS },
  { key: 'pdfOriginalGating', label: 'Original PDF gating', options: GATED_UNGATED_OPTIONS },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseEnum<T extends string>(value: unknown, allowed: T[]): T {
  if (typeof value === 'string' && (allowed as string[]).includes(value)) return value as T
  return allowed[0]
}

function countActive(overrides: ScoreOverrides): number {
  return Object.values(overrides).filter((v) => v !== '').length
}

// ── Component ────────────────────────────────────────────────────────────────

function ScoreOverridesPanel({
  value,
  onChange,
}: {
  value: ScoreOverrides
  onChange: (next: ScoreOverrides) => void
}) {
  const [open, setOpen] = useState(() => readCollapseState('score-overrides', countActive(value) > 0))

  const handleChange = useCallback(
    (key: keyof ScoreOverrides, newValue: string) => {
      onChange({ ...value, [key]: newValue })
    },
    [value, onChange],
  )

  const active = countActive(value)

  return (
    <div style={panelStyle}>
      <button
        type="button"
        style={headerStyle}
        onClick={() => setOpen((prev) => {
          const next = !prev
          persistCollapseState('score-overrides', next)
          return next
        })}
        aria-expanded={open}
      >
        <span style={headerLeftStyle}>
          <span style={chevronStyle(open)} aria-hidden="true">
            ▶
          </span>
          Score &amp; PDF Overrides
        </span>
        <span style={active > 0 ? activeBadgeStyle : badgeStyle}>
          {active > 0 ? `${active} active` : 'all defaults'}
        </span>
      </button>

      <div style={bodyStyle(open)}>
        <div style={bodyInnerStyle}>
          {/* ── Online Viewer ───────────────────────────────────────── */}
          <div>
            <h4 style={sectionHeadingStyle}>Online Viewer</h4>
            <p style={{ margin: '4px 0 8px', fontSize: '11px', color: 'var(--kui-color-scale-slate8)' }}>
              The interactive score viewer on the perusal score page.
            </p>
            <div style={gridStyle}>
              {VIEWER_SELECTS.map((cfg) => (
                <div key={cfg.key} style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>{cfg.label}</label>
                  <select
                    style={selectStyle}
                    value={value[cfg.key]}
                    onChange={(e) => handleChange(cfg.key, e.target.value)}
                  >
                    {cfg.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* ── PDF Downloads ──────────────────────────────────────── */}
          <div>
            <h4 style={sectionHeadingStyle}>PDF Downloads</h4>
            <p style={{ margin: '4px 0 8px', fontSize: '11px', color: 'var(--kui-color-scale-slate8)' }}>
              Downloadable PDF versions of the score (watermarked and/or original).
            </p>
            <div style={gridStyle}>
              {PDF_SELECTS.map((cfg) => (
                <div key={cfg.key} style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>{cfg.label}</label>
                  <select
                    style={selectStyle}
                    value={value[cfg.key]}
                    onChange={(e) => handleChange(cfg.key, e.target.value)}
                  >
                    {cfg.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Keystatic composite field that groups all score/PDF overrides into a
 * single collapsible panel.
 *
 * Stores a nested YAML object under the field key:
 * ```yaml
 * scoreOverrides:
 *   viewerWatermark: ''
 *   viewerGating: ''
 *   pdfWatermarked: ''
 *   pdfOriginal: ''
 *   pdfWatermarkedGating: ''
 *   pdfOriginalGating: ''
 * ```
 *
 * The panel is collapsed by default (when all values are site defaults)
 * and shows a badge with the count of active overrides.
 */
export function scoreOverridesField(cfg: {
  label: string
}): BasicFormField<ScoreOverrides, ScoreOverrides, ScoreOverrides> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<ScoreOverrides>) {
      return <ScoreOverridesPanel value={props.value} onChange={props.onChange} />
    },

    defaultValue: () => ({ ...DEFAULT_OVERRIDES }),

    parse(value: FormFieldStoredValue): ScoreOverrides {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_OVERRIDES }
      }
      const obj = value as Record<string, unknown>
      return {
        viewerWatermark: parseEnum<EnabledDisabledValue>(obj.viewerWatermark, ['', 'enabled', 'disabled']),
        viewerGating: parseEnum<GatedUngatedValue>(obj.viewerGating, ['', 'gated', 'ungated']),
        pdfWatermarked: parseEnum<EnabledDisabledValue>(obj.pdfWatermarked, ['', 'enabled', 'disabled']),
        pdfOriginal: parseEnum<EnabledDisabledValue>(obj.pdfOriginal, ['', 'enabled', 'disabled']),
        pdfWatermarkedGating: parseEnum<GatedUngatedValue>(obj.pdfWatermarkedGating, ['', 'gated', 'ungated']),
        pdfOriginalGating: parseEnum<GatedUngatedValue>(obj.pdfOriginalGating, ['', 'gated', 'ungated']),
      }
    },

    serialize(value: ScoreOverrides) {
      return { value: value as unknown as FormFieldStoredValue }
    },

    validate(value: ScoreOverrides): ScoreOverrides {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): ScoreOverrides {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { ...DEFAULT_OVERRIDES }
        }
        const obj = value as Record<string, unknown>
        return {
          viewerWatermark: parseEnum<EnabledDisabledValue>(obj.viewerWatermark, ['', 'enabled', 'disabled']),
          viewerGating: parseEnum<GatedUngatedValue>(obj.viewerGating, ['', 'gated', 'ungated']),
          pdfWatermarked: parseEnum<EnabledDisabledValue>(obj.pdfWatermarked, ['', 'enabled', 'disabled']),
          pdfOriginal: parseEnum<EnabledDisabledValue>(obj.pdfOriginal, ['', 'enabled', 'disabled']),
          pdfWatermarkedGating: parseEnum<GatedUngatedValue>(obj.pdfWatermarkedGating, ['', 'gated', 'ungated']),
          pdfOriginalGating: parseEnum<GatedUngatedValue>(obj.pdfOriginalGating, ['', 'gated', 'ungated']),
        }
      },
    },
  }
}
