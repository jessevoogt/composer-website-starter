/**
 * Character remaining counter for textarea fields.
 *
 * Shows a subtle "{N} remaining" add-on strip below the textarea that
 * fades in when the user is within `threshold` characters of the maxlength
 * limit, and shifts to an urgent color in the final 10 characters.
 *
 * Accessibility follows the GOV.UK / USWDS three-element pattern:
 * 1. Static description linked via aria-describedby (announced on focus).
 * 2. Visual counter (aria-hidden) — updated every keystroke for sighted users.
 * 3. Screen-reader-only live region — debounced (1 s) to avoid interrupting typing.
 *
 * Counter elements are created dynamically — no server-rendered markup needed.
 * Styles are injected once into the document head.
 */

const COUNTER_CLASS = 'field-char-counter'
const SR_ONLY_CLASS = 'field-char-sr'
const STYLE_ID = 'field-char-counter-styles'
const URGENT_THRESHOLD = 10
const SR_DEBOUNCE_MS = 1000

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${COUNTER_CLASS} {
      position: absolute;
      right: 0;
      z-index: 1;
      box-sizing: border-box;
      width: auto;
      padding: 0.25rem 0.6rem;
      margin: 0;
      background: var(--surface-soft, #212b36);
      border: 1px solid #3b4d5f;
      border-top: none;
      border-radius: 0 0 var(--radius-sm) var(--radius-sm);
      font-size: 0.8125rem;
      line-height: 1.4;
      color: var(--ink-soft, #aab8c4);
      user-select: none;
      pointer-events: none;
      opacity: 0;
      transition: opacity 250ms ease, color 200ms ease;
    }
    .${COUNTER_CLASS}[data-visible='true'] {
      opacity: 1;
    }
    .${COUNTER_CLASS}[data-urgent='true'] {
      color: var(--focus-ring-color, #ff9f3f);
    }
    .${SR_ONLY_CLASS} {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `
  document.head.appendChild(style)
}

let nextId = 0

/**
 * Attach a character counter to every `<textarea maxlength>` inside `container`.
 *
 * @param container  Parent element to search within.
 * @param threshold  Number of remaining characters at which the counter becomes visible.
 * @returns Cleanup function that removes listeners and injected elements.
 */
export function initTextareaCounter(container: HTMLElement, threshold: number): () => void {
  injectStyles()

  const textareas = container.querySelectorAll<HTMLTextAreaElement>('textarea[maxlength]')
  const cleanups: (() => void)[] = []

  for (const textarea of textareas) {
    const max = textarea.maxLength
    if (max <= 0) continue

    const uid = nextId++

    // 1. Static description — announced once on focus via aria-describedby.
    const descId = `char-counter-desc-${uid}`
    const desc = document.createElement('span')
    desc.id = descId
    desc.className = SR_ONLY_CLASS
    desc.textContent = `You can enter up to ${max} characters`
    textarea.parentElement?.appendChild(desc)

    const prevDescBy = textarea.getAttribute('aria-describedby')
    textarea.setAttribute('aria-describedby', prevDescBy ? `${prevDescBy} ${descId}` : descId)

    // 2. Visual counter — sighted users only, updated every keystroke.
    const counter = document.createElement('div')
    counter.className = COUNTER_CLASS
    counter.setAttribute('aria-hidden', 'true')
    textarea.parentElement?.appendChild(counter)

    // 3. Screen-reader live region — debounced to avoid interrupting typing.
    const srStatus = document.createElement('span')
    srStatus.className = SR_ONLY_CLASS
    srStatus.setAttribute('aria-live', 'polite')
    textarea.parentElement?.appendChild(srStatus)

    let srTimer: ReturnType<typeof setTimeout> | undefined
    let trimmed = false
    let lastLength = textarea.value.length

    // Keep counter flush below the textarea (handles resize + initial gap).
    function positionCounter(): void {
      counter.style.top = `${textarea.offsetTop + textarea.offsetHeight}px`
    }
    const resizeObserver = new ResizeObserver(positionCounter)
    resizeObserver.observe(textarea)
    positionCounter()

    function update(): void {
      const remaining = max - textarea.value.length
      const visible = remaining <= threshold

      // Clear trim notice once the value length changes.
      if (trimmed && textarea.value.length !== lastLength) {
        trimmed = false
      }
      lastLength = textarea.value.length

      if (trimmed) return // Keep showing the trim notice.

      // Visual counter (immediate).
      counter.dataset.visible = String(visible)
      counter.dataset.urgent = String(remaining <= URGENT_THRESHOLD)
      counter.textContent = visible ? `${remaining} remaining` : ''

      // SR live region (debounced 1 s after last keystroke).
      clearTimeout(srTimer)
      if (visible) {
        srTimer = setTimeout(() => {
          srStatus.textContent = `${max - textarea.value.length} characters remaining`
        }, SR_DEBOUNCE_MS)
      } else {
        srStatus.textContent = ''
      }
    }

    function onPaste(event: ClipboardEvent): void {
      const pasted = event.clipboardData?.getData('text/plain') ?? ''
      if (!pasted) return

      const selected = textarea.selectionEnd - textarea.selectionStart
      const wouldBeLength = textarea.value.length - selected + pasted.length
      if (wouldBeLength <= max) return

      // The browser will truncate — show a notice after it applies the paste.
      setTimeout(() => {
        const lost = wouldBeLength - max
        trimmed = true
        lastLength = textarea.value.length

        counter.dataset.visible = 'true'
        counter.dataset.urgent = 'true'
        counter.textContent = `Pasted text trimmed (${lost} over limit)`

        // Announce immediately to screen readers (not debounced).
        clearTimeout(srTimer)
        srStatus.textContent = `Pasted text was trimmed. ${lost} characters exceeded the ${max} character limit.`
      }, 0)
    }

    const pasteHandler = (e: Event) => onPaste(e as ClipboardEvent)

    textarea.addEventListener('input', update)
    textarea.addEventListener('paste', pasteHandler)
    update()

    cleanups.push(() => {
      clearTimeout(srTimer)
      resizeObserver.disconnect()
      textarea.removeEventListener('input', update)
      textarea.removeEventListener('paste', pasteHandler)
      // Restore original aria-describedby.
      const current = textarea.getAttribute('aria-describedby') ?? ''
      const restored = current
        .split(/\s+/)
        .filter((tok) => tok !== descId)
        .join(' ')
      if (restored) {
        textarea.setAttribute('aria-describedby', restored)
      } else {
        textarea.removeAttribute('aria-describedby')
      }
      desc.remove()
      counter.remove()
      srStatus.remove()
    })
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
