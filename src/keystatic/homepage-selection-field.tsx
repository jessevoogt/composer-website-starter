import { useCallback, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

interface HomepageSelectionValue {
  selected: boolean
  selectedOrder: number | null
}

const DEFAULT_SELECTION: HomepageSelectionValue = {
  selected: false,
  selectedOrder: null,
}

// ── Styles ───────────────────────────────────────────────────────────────────

const KUI_FONT = 'var(--kui-typography-font-family-base, system-ui, sans-serif)'

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  fontFamily: KUI_FONT,
}

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate11)',
  cursor: 'pointer',
}

const orderGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const orderLabelStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--kui-color-scale-slate10)',
}

const orderInputStyle = (disabled: boolean): CSSProperties => ({
  width: '60px',
  padding: '4px 8px',
  fontSize: '13px',
  color: disabled ? 'var(--kui-color-scale-slate8)' : 'var(--kui-color-scale-slate11)',
  backgroundColor: disabled ? 'var(--kui-color-scale-slate3)' : 'var(--kui-color-scale-slate1)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  fontFamily: KUI_FONT,
})

const descStyle: CSSProperties = {
  margin: 0,
  fontSize: '11px',
  color: 'var(--kui-color-scale-slate8)',
  flexBasis: '100%',
}

// ── Component ────────────────────────────────────────────────────────────────

function HomepageSelectionPanel({
  value,
  onChange,
}: {
  value: HomepageSelectionValue
  onChange: (next: HomepageSelectionValue) => void
}) {
  const handleSelectedChange = useCallback(
    (checked: boolean) => {
      onChange({
        selected: checked,
        selectedOrder: checked ? value.selectedOrder : null,
      })
    },
    [value.selectedOrder, onChange],
  )

  const handleOrderChange = useCallback(
    (raw: string) => {
      const num = parseInt(raw, 10)
      onChange({ ...value, selectedOrder: isNaN(num) ? null : num })
    },
    [value, onChange],
  )

  return (
    <div style={containerStyle}>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={value.selected}
          onChange={(e) => handleSelectedChange(e.target.checked)}
        />
        Selected work
      </label>

      <div style={orderGroupStyle}>
        <span style={orderLabelStyle}>Position:</span>
        <input
          type="number"
          style={orderInputStyle(!value.selected)}
          value={value.selectedOrder ?? ''}
          onChange={(e) => handleOrderChange(e.target.value)}
          disabled={!value.selected}
          placeholder="#"
          aria-label="Selected order"
        />
      </div>

      <p style={descStyle}>
        Show this work in the selected works section on the homepage. Lower position number = appears first.
      </p>
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

export function homepageSelectionField(cfg: {
  label: string
}): BasicFormField<HomepageSelectionValue, HomepageSelectionValue, HomepageSelectionValue> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<HomepageSelectionValue>) {
      return <HomepageSelectionPanel value={props.value} onChange={props.onChange} />
    },

    defaultValue: () => ({ ...DEFAULT_SELECTION }),

    parse(value: FormFieldStoredValue): HomepageSelectionValue {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_SELECTION }
      }
      const obj = value as Record<string, unknown>
      return {
        selected: obj.selected === true,
        selectedOrder: typeof obj.selectedOrder === 'number' ? obj.selectedOrder : null,
      }
    },

    serialize(value: HomepageSelectionValue) {
      return { value: value as unknown as FormFieldStoredValue }
    },

    validate(value: HomepageSelectionValue): HomepageSelectionValue {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): HomepageSelectionValue {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { ...DEFAULT_SELECTION }
        }
        const obj = value as Record<string, unknown>
        return {
          selected: obj.selected === true,
          selectedOrder: typeof obj.selectedOrder === 'number' ? obj.selectedOrder : null,
        }
      },
    },
  }
}
