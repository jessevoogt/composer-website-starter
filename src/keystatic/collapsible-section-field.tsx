import { useState, useRef, useLayoutEffect, useEffect, useCallback, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldStoredValue } from '@keystatic/core'
import { readCollapseState, persistCollapseState } from './collapse-storage'

// ── Styles (KUI typography + color variables for light/dark compat) ──────────

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
  fontFamily: KUI_FONT,
}

const activeBadgeStyle: CSSProperties = {
  ...badgeStyle,
  color: 'var(--kui-color-scale-amber11)',
  backgroundColor: 'var(--kui-color-scale-amber4)',
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

/**
 * Walk up from `el` to find the form container: a parent whose direct
 * children represent all the schema fields.  We identify it by looking for
 * a parent with many (>= 6) direct children — every Keystatic collection
 * form has at least that many fields.
 *
 * Returns `[formContainer, fieldWrapper]` where `fieldWrapper` is our
 * component's immediate child within `formContainer`.
 */
function findFormContainer(el: HTMLElement): [HTMLElement, HTMLElement] | null {
  let current: HTMLElement | null = el
  for (let depth = 0; depth < 20 && current; depth++) {
    const parent: HTMLElement | null = current.parentElement
    if (!parent) break
    if (parent.children.length >= 6) {
      return [parent, current]
    }
    current = parent
  }
  return null
}

/**
 * Count list-items rendered by Keystatic array fields inside the given
 * elements.  Keystatic's ListView renders array items as `<div role="row">`
 * (drag-and-drop insertion indicators also use role="row" but are marked
 * aria-hidden, so we exclude those).  Empty arrays render a placeholder row
 * with `data-has-items="false"` which we also exclude.
 */
function countListItems(targets: HTMLElement[]): number {
  let count = 0
  for (const el of targets) {
    // Keystatic ≥ 0.5: ListView renders items as role="row" inside a grid
    const rows = el.querySelectorAll(
      '[role="row"]:not([aria-hidden]):not([data-has-items="false"])',
    )
    if (rows.length > 0) {
      count += rows.length
    } else {
      // Legacy fallback: earlier versions used ol > li
      count += el.querySelectorAll('ol > li').length
    }
  }
  return count
}

// ── Component ───────────────────────────────────────────────────────────────

function CollapsibleSectionPanel({
  id,
  label,
  itemLabel,
  badgeFn,
  fieldCount,
  defaultOpen,
}: {
  id: string
  label: string
  itemLabel: string | undefined
  badgeFn: ((siblings: HTMLElement[]) => string) | undefined
  fieldCount: number
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(() => readCollapseState(id, defaultOpen))
  const [badgeText, setBadgeText] = useState('')
  const [badgeActive, setBadgeActive] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const siblingsRef = useRef<HTMLElement[]>([])
  const bodyWrapperRef = useRef<HTMLDivElement | null>(null)

  // ── Badge computation ──────────────────────────────────────────────
  const computeBadge = useCallback(
    (siblings: HTMLElement[]) => {
      if (badgeFn) {
        const text = badgeFn(siblings)
        setBadgeText(text)
        setBadgeActive(text !== '' && text !== 'none' && text !== 'empty')
      } else if (itemLabel) {
        const count = countListItems(siblings)
        const text =
          count > 0 ? `${count} ${itemLabel}${count !== 1 ? 's' : ''}` : 'none'
        setBadgeText(text)
        setBadgeActive(count > 0)
      }
    },
    [badgeFn, itemLabel],
  )

  // ── Reparent sibling fields into a body wrapper on mount ────────────
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const result = findFormContainer(el)
    if (!result) return

    const [formContainer, fieldWrapper] = result
    const children = Array.from(formContainer.children) as HTMLElement[]
    const ourIndex = children.indexOf(fieldWrapper)
    if (ourIndex === -1) return

    const siblings = children.slice(ourIndex + 1, ourIndex + 1 + fieldCount)
    siblingsRef.current = siblings

    // Create body wrapper with animation styles
    const bodyWrapper = document.createElement('div')
    bodyWrapper.style.borderTop = '1px solid var(--kui-color-scale-slate5)'
    bodyWrapper.style.overflow = 'hidden'
    bodyWrapper.style.maxHeight = readCollapseState(id, defaultOpen) ? '4000px' : '0px'
    bodyWrapper.style.transition = 'max-height 0.25s ease-in-out'

    // Inner padding container
    const bodyInner = document.createElement('div')
    bodyInner.style.padding = '14px'
    bodyInner.style.display = 'flex'
    bodyInner.style.flexDirection = 'column'
    bodyInner.style.gap = '16px'

    // Reparent siblings into the inner container
    for (const sib of siblings) {
      bodyInner.appendChild(sib)
    }

    bodyWrapper.appendChild(bodyInner)
    el.appendChild(bodyWrapper)
    bodyWrapperRef.current = bodyWrapper

    // Initial badge
    computeBadge(siblings)

    // Watch for DOM mutations (items added / removed / values changed)
    const mo = new MutationObserver(() => {
      computeBadge(siblings)
    })
    for (const sib of siblings) {
      mo.observe(sib, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      mo.disconnect()
      // Move siblings back to their original position in the form container
      const insertRef = fieldWrapper.nextSibling
      for (const sib of siblings) {
        formContainer.insertBefore(sib, insertRef)
      }
      bodyWrapper.remove()
      bodyWrapperRef.current = null
    }
  }, [fieldCount, defaultOpen, id, computeBadge])

  // ── Toggle body wrapper max-height when open/closed changes ─────────
  useEffect(() => {
    const bodyWrapper = bodyWrapperRef.current
    if (!bodyWrapper) return
    bodyWrapper.style.maxHeight = open ? '4000px' : '0px'
  }, [open])

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      persistCollapseState(id, next)
      return next
    })
  }, [id])

  const showBadge = badgeText !== ''

  return (
    <div ref={ref} style={panelStyle}>
      <button type="button" style={headerStyle} onClick={handleToggle} aria-expanded={open}>
        <span style={headerLeftStyle}>
          <span style={chevronStyle(open)} aria-hidden="true">
            &#9654;
          </span>
          {label}
        </span>
        {showBadge && (
          <span style={badgeActive ? activeBadgeStyle : badgeStyle}>{badgeText}</span>
        )}
      </button>
    </div>
  )
}

// ── Field factory ───────────────────────────────────────────────────────────

export interface CollapsibleSectionConfig {
  /** Unique identifier for sessionStorage persistence. */
  id: string
  label: string
  /** Singular noun for item count badge (e.g. "recording" → "3 recordings"). */
  itemLabel?: string
  /** Custom function that inspects sibling DOM and returns badge text. Takes priority over `itemLabel`. */
  badgeFn?: (siblings: HTMLElement[]) => string
  /** How many subsequent schema fields this header collapses. @default 1 */
  fieldCount?: number
  /** Whether the section starts expanded (before sessionStorage override). @default false */
  defaultOpen?: boolean
}

/**
 * Display-only Keystatic field that renders a collapsible section header.
 *
 * On mount it finds the next `fieldCount` sibling form fields in the DOM
 * and reparents them into a bordered, animated body wrapper.  Clicking the
 * header toggles the body open/closed with a smooth max-height transition.
 *
 * Collapse state is persisted in `sessionStorage` keyed by pathname + `id`.
 *
 * When `itemLabel` is provided, a badge shows the count of list items
 * inside the collapsed siblings.  When `badgeFn` is provided instead, its
 * return value is used as the badge text.
 *
 * Never writes to YAML — `serialize` always returns `{ value: undefined }`.
 */
export function collapsibleSectionField(
  cfg: CollapsibleSectionConfig,
): BasicFormField<string, string, string> {
  const { id, label, itemLabel, badgeFn, fieldCount = 1, defaultOpen = false } = cfg

  return {
    kind: 'form',
    formKind: undefined,
    label,

    Input() {
      return (
        <CollapsibleSectionPanel
          id={id}
          label={label}
          itemLabel={itemLabel}
          badgeFn={badgeFn}
          fieldCount={fieldCount}
          defaultOpen={defaultOpen}
        />
      )
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
