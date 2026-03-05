import { useState, useEffect, useCallback, useMemo, type CSSProperties, type DragEvent } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

type SlotKey = 'left' | 'center' | 'right'
type SlotsValue = Record<SlotKey, string[]>

interface ElementDef {
  label: string
  value: string
}

interface HeaderSlotsFieldConfig {
  label: string
  description?: string
  elements: readonly ElementDef[]
  defaultValue?: SlotsValue
}

interface DragSource {
  slot: SlotKey | 'pool'
  index: number
  element: string
}

const SLOT_KEYS: SlotKey[] = ['left', 'center', 'right']
const SLOT_LABELS: Record<SlotKey, string> = { left: 'Left', center: 'Center', right: 'Right' }
const EMPTY_SLOTS: SlotsValue = { left: [], center: [], right: [] }

// ── Dark mode detection ──────────────────────────────────────────────────────

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isDark
}

// ── Theme tokens ─────────────────────────────────────────────────────────────

interface ThemeTokens {
  descriptionColor: string
  columnBg: string
  columnBorder: string
  columnHeaderColor: string
  columnHeaderBorder: string
  columnActiveBorder: string
  columnActiveBg: string
  itemBg: string
  itemBorder: string
  itemColor: string
  dragHandleColor: string
  btnBg: string
  btnBorder: string
  btnColor: string
  removeBtnColor: string
  removeBtnBorder: string
  removeBtnBg: string
  dropIndicatorColor: string
  emptyColor: string
  emptyActiveColor: string
  poolBg: string
  poolBorder: string
  poolItemBg: string
  poolItemBorder: string
  poolItemColor: string
  addBtnColor: string
  addBtnBorder: string
  addBtnBg: string
}

const lightTokens: ThemeTokens = {
  descriptionColor: '#6b7280',
  columnBg: '#fafafa',
  columnBorder: '#e5e7eb',
  columnHeaderColor: '#6b7280',
  columnHeaderBorder: '#e5e7eb',
  columnActiveBorder: '#818cf8',
  columnActiveBg: '#eef2ff',
  itemBg: '#fff',
  itemBorder: '#e5e7eb',
  itemColor: '#1f2937',
  dragHandleColor: '#9ca3af',
  btnBg: '#f9fafb',
  btnBorder: '#e5e7eb',
  btnColor: '#6b7280',
  removeBtnColor: '#ef4444',
  removeBtnBorder: '#fecaca',
  removeBtnBg: '#fef2f2',
  dropIndicatorColor: '#818cf8',
  emptyColor: '#9ca3af',
  emptyActiveColor: '#818cf8',
  poolBg: '#f9fafb',
  poolBorder: '#d1d5db',
  poolItemBg: '#fff',
  poolItemBorder: '#d1d5db',
  poolItemColor: '#1f2937',
  addBtnColor: '#4f46e5',
  addBtnBorder: '#c7d2fe',
  addBtnBg: '#eef2ff',
}

const darkTokens: ThemeTokens = {
  descriptionColor: '#9ca3af',
  columnBg: '#2a2a2a',
  columnBorder: '#404040',
  columnHeaderColor: '#9ca3af',
  columnHeaderBorder: '#404040',
  columnActiveBorder: '#6366f1',
  columnActiveBg: '#1e1b4b',
  itemBg: '#333',
  itemBorder: '#4a4a4a',
  itemColor: '#e5e7eb',
  dragHandleColor: '#6b7280',
  btnBg: '#3a3a3a',
  btnBorder: '#4a4a4a',
  btnColor: '#9ca3af',
  removeBtnColor: '#f87171',
  removeBtnBorder: '#7f1d1d',
  removeBtnBg: '#451a1a',
  dropIndicatorColor: '#818cf8',
  emptyColor: '#6b7280',
  emptyActiveColor: '#818cf8',
  poolBg: '#2a2a2a',
  poolBorder: '#404040',
  poolItemBg: '#333',
  poolItemBorder: '#404040',
  poolItemColor: '#e5e7eb',
  addBtnColor: '#818cf8',
  addBtnBorder: '#312e81',
  addBtnBg: '#1e1b4b',
}

// ── Style builders ───────────────────────────────────────────────────────────

function buildStyles(t: ThemeTokens) {
  const columnsContainer: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  }

  const column: CSSProperties = {
    border: `1px solid ${t.columnBorder}`,
    borderRadius: '8px',
    backgroundColor: t.columnBg,
    minHeight: '80px',
    transition: 'border-color 0.15s, background-color 0.15s',
  }

  const columnActive: CSSProperties = {
    borderColor: t.columnActiveBorder,
    backgroundColor: t.columnActiveBg,
  }

  const columnHeader: CSSProperties = {
    padding: '8px 10px 6px',
    fontSize: '11px',
    fontWeight: 700,
    color: t.columnHeaderColor,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${t.columnHeaderBorder}`,
  }

  const columnContent: CSSProperties = {
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
    minHeight: '40px',
  }

  const item: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: t.itemBg,
    border: `1px solid ${t.itemBorder}`,
    borderRadius: '6px',
    color: t.itemColor,
    cursor: 'grab',
    fontSize: '13px',
    userSelect: 'none',
    transition: 'box-shadow 0.15s, opacity 0.15s',
  }

  const dragHandle: CSSProperties = {
    color: t.dragHandleColor,
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
  }

  const btn: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: 0,
    border: `1px solid ${t.btnBorder}`,
    borderRadius: '4px',
    backgroundColor: t.btnBg,
    color: t.btnColor,
    fontSize: '13px',
    lineHeight: 1,
    cursor: 'pointer',
  }

  const removeBtn: CSSProperties = {
    ...btn,
    color: t.removeBtnColor,
    borderColor: t.removeBtnBorder,
    backgroundColor: t.removeBtnBg,
  }

  const pool: CSSProperties = {
    marginTop: '12px',
    border: `1px dashed ${t.poolBorder}`,
    borderRadius: '8px',
    backgroundColor: t.poolBg,
  }

  const poolItem: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: t.poolItemBg,
    border: `1px dashed ${t.poolItemBorder}`,
    borderRadius: '6px',
    color: t.poolItemColor,
    cursor: 'grab',
    fontSize: '13px',
    userSelect: 'none',
  }

  const addBtn: CSSProperties = {
    ...btn,
    fontSize: '10px',
    fontWeight: 700,
    width: '20px',
    height: '20px',
    color: t.addBtnColor,
    borderColor: t.addBtnBorder,
    backgroundColor: t.addBtnBg,
  }

  return {
    description: { margin: '0 0 12px', fontSize: '13px', color: t.descriptionColor, lineHeight: '1.4' } as CSSProperties,
    columnsContainer,
    column,
    columnActive,
    columnHeader,
    columnContent,
    item,
    itemDragging: { opacity: 0.4 } as CSSProperties,
    itemLabel: { flex: 1, fontWeight: 500 } as CSSProperties,
    itemActions: { display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 } as CSSProperties,
    dragHandle,
    btn,
    removeBtn,
    dropIndicator: { height: '2px', backgroundColor: t.dropIndicatorColor, borderRadius: '1px', margin: '2px 0' } as CSSProperties,
    empty: { padding: '12px', textAlign: 'center', fontSize: '12px', color: t.emptyColor, fontStyle: 'italic' } as CSSProperties,
    emptyActive: { padding: '12px', textAlign: 'center', fontSize: '12px', color: t.emptyActiveColor, fontStyle: 'italic' } as CSSProperties,
    pool,
    poolHeader: { padding: '8px 10px 6px', fontSize: '11px', fontWeight: 700, color: t.columnHeaderColor, textTransform: 'uppercase', letterSpacing: '0.05em' } as CSSProperties,
    poolContent: { padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' } as CSSProperties,
    poolItem,
    addBtnGroup: { display: 'flex', gap: '2px', marginLeft: 'auto', flexShrink: 0 } as CSSProperties,
    addBtn,
  }
}

// ── Input component ──────────────────────────────────────────────────────────

function HeaderSlotsInput({
  value,
  onChange,
  elements,
  description,
}: FormFieldInputProps<SlotsValue> & { elements: readonly ElementDef[]; description?: string }) {
  const isDark = useDarkMode()
  const s = useMemo(() => buildStyles(isDark ? darkTokens : lightTokens), [isDark])

  const [dragSource, setDragSource] = useState<DragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<{ slot: SlotKey; index: number } | null>(null)

  const getLabel = useCallback(
    (val: string) => elements.find((e) => e.value === val)?.label ?? val,
    [elements],
  )

  const usedElements = new Set([...value.left, ...value.center, ...value.right])
  const availableElements = elements.filter((e) => !usedElements.has(e.value))

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, slot: SlotKey | 'pool', index: number, element: string) => {
      setDragSource({ slot, index, element })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', element)
    },
    [],
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, targetSlot: SlotKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const container = e.currentTarget as HTMLElement
    const items = container.querySelectorAll('[data-drag-item]')
    let insertIndex = 0

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      if (e.clientY > midY) insertIndex = i + 1
    }

    setDropTarget({ slot: targetSlot, index: insertIndex })
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetSlot: SlotKey) => {
      e.preventDefault()
      if (!dragSource) return

      const newValue: SlotsValue = {
        left: [...value.left],
        center: [...value.center],
        right: [...value.right],
      }

      // Remove from source
      if (dragSource.slot !== 'pool') {
        newValue[dragSource.slot].splice(dragSource.index, 1)
      }

      // Calculate insert index
      let insertIndex = dropTarget?.slot === targetSlot ? dropTarget.index : newValue[targetSlot].length
      if (dragSource.slot === targetSlot && dragSource.index < insertIndex) {
        insertIndex--
      }

      newValue[targetSlot].splice(insertIndex, 0, dragSource.element)
      onChange(newValue)
      setDragSource(null)
      setDropTarget(null)
    },
    [dragSource, dropTarget, value, onChange],
  )

  const handleDragEnd = useCallback(() => {
    setDragSource(null)
    setDropTarget(null)
  }, [])

  // ── Button handlers (keyboard-accessible alternatives to drag) ─────────────

  const handleRemove = useCallback(
    (slot: SlotKey, index: number) => {
      const newSlot = [...value[slot]]
      newSlot.splice(index, 1)
      onChange({ ...value, [slot]: newSlot })
    },
    [value, onChange],
  )

  const handleReorder = useCallback(
    (slot: SlotKey, fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= value[slot].length) return
      const newSlot = [...value[slot]]
      const [item] = newSlot.splice(fromIndex, 1)
      newSlot.splice(toIndex, 0, item)
      onChange({ ...value, [slot]: newSlot })
    },
    [value, onChange],
  )

  const handleMoveToSlot = useCallback(
    (fromSlot: SlotKey, index: number, toSlot: SlotKey) => {
      const element = value[fromSlot][index]
      if (!element) return
      const newValue: SlotsValue = { left: [...value.left], center: [...value.center], right: [...value.right] }
      newValue[fromSlot].splice(index, 1)
      newValue[toSlot].push(element)
      onChange(newValue)
    },
    [value, onChange],
  )

  const handleAddToSlot = useCallback(
    (element: string, slot: SlotKey) => {
      onChange({ ...value, [slot]: [...value[slot], element] })
    },
    [value, onChange],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {description && <p style={s.description}>{description}</p>}

      <div style={s.columnsContainer}>
        {SLOT_KEYS.map((slot) => {
          const isActiveTarget = dropTarget?.slot === slot && dragSource !== null
          return (
            <div key={slot} style={{ ...s.column, ...(isActiveTarget ? s.columnActive : {}) }}>
              <div style={s.columnHeader}>{SLOT_LABELS[slot]}</div>
              <div
                role="listbox"
                tabIndex={0}
                aria-label={`${SLOT_LABELS[slot]} slot elements`}
                style={s.columnContent}
                onDragOver={(e) => handleDragOver(e, slot)}
                onDragLeave={() => setDropTarget((prev) => (prev?.slot === slot ? null : prev))}
                onDrop={(e) => handleDrop(e, slot)}
              >
                {value[slot].map((element, index) => {
                  const isDragging = dragSource?.slot === slot && dragSource.index === index
                  const slotIdx = SLOT_KEYS.indexOf(slot)
                  return (
                    <div key={`${element}-${index}`}>
                      {dropTarget?.slot === slot && dropTarget.index === index && dragSource && (
                        <div style={s.dropIndicator} />
                      )}
                      <div
                        role="option"
                        tabIndex={-1}
                        aria-selected={isDragging}
                        data-drag-item
                        draggable
                        onDragStart={(e) => handleDragStart(e, slot, index, element)}
                        onDragEnd={handleDragEnd}
                        style={{ ...s.item, ...(isDragging ? s.itemDragging : {}) }}
                      >
                        <span style={s.dragHandle} aria-hidden="true">
                          ⠿
                        </span>
                        <span style={s.itemLabel}>{getLabel(element)}</span>
                        <div style={s.itemActions}>
                          {slotIdx > 0 && (
                            <button
                              type="button"
                              style={s.btn}
                              onClick={() => handleMoveToSlot(slot, index, SLOT_KEYS[slotIdx - 1])}
                              title={`Move to ${SLOT_LABELS[SLOT_KEYS[slotIdx - 1]]}`}
                              aria-label={`Move ${getLabel(element)} to ${SLOT_LABELS[SLOT_KEYS[slotIdx - 1]]} slot`}
                            >
                              ←
                            </button>
                          )}
                          {index > 0 && (
                            <button
                              type="button"
                              style={s.btn}
                              onClick={() => handleReorder(slot, index, index - 1)}
                              title="Move up"
                              aria-label={`Move ${getLabel(element)} up`}
                            >
                              ↑
                            </button>
                          )}
                          {index < value[slot].length - 1 && (
                            <button
                              type="button"
                              style={s.btn}
                              onClick={() => handleReorder(slot, index, index + 1)}
                              title="Move down"
                              aria-label={`Move ${getLabel(element)} down`}
                            >
                              ↓
                            </button>
                          )}
                          {slotIdx < SLOT_KEYS.length - 1 && (
                            <button
                              type="button"
                              style={s.btn}
                              onClick={() => handleMoveToSlot(slot, index, SLOT_KEYS[slotIdx + 1])}
                              title={`Move to ${SLOT_LABELS[SLOT_KEYS[slotIdx + 1]]}`}
                              aria-label={`Move ${getLabel(element)} to ${SLOT_LABELS[SLOT_KEYS[slotIdx + 1]]} slot`}
                            >
                              →
                            </button>
                          )}
                          <button
                            type="button"
                            style={s.removeBtn}
                            onClick={() => handleRemove(slot, index)}
                            title="Remove from slot"
                            aria-label={`Remove ${getLabel(element)} from ${SLOT_LABELS[slot]} slot`}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Final drop indicator */}
                {dropTarget?.slot === slot && dropTarget.index === value[slot].length && dragSource && (
                  <div style={s.dropIndicator} />
                )}
                {value[slot].length === 0 && !dragSource && <div style={s.empty}>Empty</div>}
                {value[slot].length === 0 && dragSource && <div style={s.emptyActive}>Drop here</div>}
              </div>
            </div>
          )
        })}
      </div>

      {availableElements.length > 0 && (
        <div style={s.pool}>
          <div style={s.poolHeader}>Available</div>
          <div role="listbox" tabIndex={0} aria-label="Available elements" style={s.poolContent}>
            {availableElements.map((element) => (
              <div
                role="option"
                tabIndex={-1}
                aria-selected={false}
                key={element.value}
                draggable
                onDragStart={(e) => handleDragStart(e, 'pool', -1, element.value)}
                onDragEnd={handleDragEnd}
                style={s.poolItem}
              >
                <span style={s.dragHandle} aria-hidden="true">
                  ⠿
                </span>
                <span style={{ flex: 1 }}>{element.label}</span>
                <div style={s.addBtnGroup}>
                  {SLOT_KEYS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      style={s.addBtn}
                      onClick={() => handleAddToSlot(element.value, slot)}
                      title={`Add to ${SLOT_LABELS[slot]} slot`}
                      aria-label={`Add ${element.label} to ${SLOT_LABELS[slot]} slot`}
                    >
                      {SLOT_LABELS[slot][0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSlotArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string')
  return []
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Custom Keystatic form field that renders a three-column drag-and-drop UI
 * for assigning header elements to left/center/right slots.
 *
 * Supports:
 * - Drag and drop between slots and from the available pool
 * - Reordering within a slot (drag or arrow buttons)
 * - Moving between slots via arrow buttons (keyboard accessible)
 * - Uniqueness: each element can only appear in one slot at a time
 * - Light and dark mode (follows OS preference via prefers-color-scheme)
 *
 * Serializes to YAML as:
 * ```yaml
 * slots:
 *   left: [brand-logo]
 *   center: []
 *   right: [main-menu, site-search]
 * ```
 */
export function headerSlotsField(
  cfg: HeaderSlotsFieldConfig,
): BasicFormField<SlotsValue, SlotsValue, FormFieldStoredValue> {
  const defaultVal = cfg.defaultValue ?? EMPTY_SLOTS

  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(props: FormFieldInputProps<SlotsValue>) {
      return <HeaderSlotsInput {...props} elements={cfg.elements} description={cfg.description} />
    },

    defaultValue: () => ({ ...defaultVal }),

    parse(value: FormFieldStoredValue): SlotsValue {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>
        return {
          left: parseSlotArray(obj.left),
          center: parseSlotArray(obj.center),
          right: parseSlotArray(obj.right),
        }
      }
      return { ...defaultVal }
    },

    serialize(value: SlotsValue) {
      return {
        value: {
          left: value.left,
          center: value.center,
          right: value.right,
        },
      }
    },

    validate(value: SlotsValue): SlotsValue {
      return value
    },

    reader: {
      parse(value: FormFieldStoredValue): SlotsValue {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>
          return {
            left: parseSlotArray(obj.left),
            center: parseSlotArray(obj.center),
            right: parseSlotArray(obj.right),
          }
        }
        return { ...defaultVal }
      },
    },
  }
}
