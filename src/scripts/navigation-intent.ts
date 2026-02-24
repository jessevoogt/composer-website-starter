/**
 * Shared coordination module for navigation triggered from within dialogs.
 * Tracks whether a navigation is pending so dialogs can stay visually open
 * until Astro's View Transition swap replaces the page.
 *
 * Dispatches custom events for UI coordination:
 *   - `navigation-loading-show`: fired after 300ms if navigation is still pending
 *   - `navigation-loading-hide`: fired when navigation settles (success or failure)
 *
 * Injects a temporary `<style>` to suppress the view transition fade animation
 * when navigating from a dialog, so the new page appears instantly.
 */

export type NavigationSource = 'mobile-menu' | 'search-modal' | 'mobile-search'

interface NavigationIntent {
  source: NavigationSource
  href: string
  timestamp: number
}

const LOADING_DELAY_MS = 300
const SAFETY_TIMEOUT_MS = 8_000

/**
 * Injected into both old and new documents to suppress the crossfade.
 * The `::view-transition` pseudo-elements live in a separate layer but
 * are styled by the document's stylesheets, so a `<style>` in `<head>`
 * reaches them.
 */
const SUPPRESS_STYLE_ID = 'nav-from-dialog-suppress-fade'
const SUPPRESS_CSS = `::view-transition-old(*),::view-transition-new(*){animation-duration:0s!important}`
const VISUAL_CLONE_ID = 'nav-from-dialog-visual-clone'
const VISUAL_CLONE_CLASS = 'navigation-dialog-clone'

let currentIntent: NavigationIntent | null = null
let loadingTimer = 0
let safetyTimer = 0
let failureCallbacks: Array<() => void> = []
let settleListener: (() => void) | null = null

function getDialogSelectorForSource(source: NavigationSource): string {
  return source === 'search-modal' ? '#works-search-modal' : '#mobile-menu-modal'
}

function removeVisualClone(): void {
  document.getElementById(VISUAL_CLONE_ID)?.remove()
}

function createVisualClone(source: NavigationSource): void {
  removeVisualClone()

  const selector = getDialogSelectorForSource(source)
  const dialog = document.querySelector<HTMLDialogElement>(selector)
  if (!dialog || !dialog.open) return

  const clone = dialog.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return

  clone.id = VISUAL_CLONE_ID
  clone.classList.add(VISUAL_CLONE_CLASS, 'is-visible', 'is-navigating')
  clone.setAttribute('open', '')
  clone.setAttribute('aria-hidden', 'true')
  clone.querySelectorAll<HTMLElement>('button, input, select, textarea, a, [tabindex]').forEach((node) => {
    node.setAttribute('tabindex', '-1')
    node.setAttribute('aria-hidden', 'true')
  })
  clone.querySelectorAll<HTMLElement>('[id]').forEach((node) => {
    node.removeAttribute('id')
  })

  // Keep the clone outside <body> so Astro's body swap cannot remove it mid-transition.
  document.documentElement.appendChild(clone)
}

function clearTimers(): void {
  if (loadingTimer) {
    window.clearTimeout(loadingTimer)
    loadingTimer = 0
  }
  if (safetyTimer) {
    window.clearTimeout(safetyTimer)
    safetyTimer = 0
  }
}

function injectSuppressStyle(): void {
  if (document.getElementById(SUPPRESS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SUPPRESS_STYLE_ID
  style.textContent = SUPPRESS_CSS
  document.head.appendChild(style)
}

function removeSuppressStyle(): void {
  document.getElementById(SUPPRESS_STYLE_ID)?.remove()
}

function reset(reason: 'swap' | 'cancel' | 'timeout'): void {
  if (!currentIntent) return

  clearTimers()
  currentIntent = null

  window.dispatchEvent(new CustomEvent('navigation-loading-hide'))

  if (settleListener) {
    document.removeEventListener('astro:after-swap', settleListener)
    settleListener = null
  }

  // Cleanup stale callbacks from prior page instances on every settle path.
  if (reason === 'swap') {
    failureCallbacks = []
  }

  // On cancel/timeout, remove the suppress style immediately
  if (reason !== 'swap') {
    removeVisualClone()
    removeSuppressStyle()
    const callbacks = failureCallbacks
    failureCallbacks = []
    callbacks.forEach((cb) => cb())
  }
  // On swap: the suppress style in the new document is cleaned up
  // by the astro:page-load listener below.
}

/**
 * Clear intent state. Use when cancelling a pending navigation (e.g. user presses Escape).
 */
export function clearNavigationIntent(): void {
  reset('cancel')
}

export function isNavigationPending(): boolean {
  return currentIntent !== null
}

/**
 * Register a callback for when navigation fails (timeout or cancellation).
 * NOT called on successful swap — the teardown handles that.
 */
export function onNavigationFailed(callback: () => void): () => void {
  failureCallbacks.push(callback)
  return () => {
    const callbackIndex = failureCallbacks.indexOf(callback)
    if (callbackIndex === -1) return
    failureCallbacks.splice(callbackIndex, 1)
  }
}

export function signalNavigationPending(source: NavigationSource, href: string): void {
  // If already pending, clear previous and start fresh
  if (currentIntent) {
    clearTimers()
    if (settleListener) {
      document.removeEventListener('astro:after-swap', settleListener)
      settleListener = null
    }
  }

  currentIntent = { source, href, timestamp: Date.now() }
  createVisualClone(source)

  // Inject a style that suppresses the view transition fade animation.
  injectSuppressStyle()

  // Show loading indicator after delay
  loadingTimer = window.setTimeout(() => {
    loadingTimer = 0
    if (currentIntent) {
      window.dispatchEvent(new CustomEvent('navigation-loading-show'))
    }
  }, LOADING_DELAY_MS)

  // Safety net: if navigation never settles, clear after timeout
  safetyTimer = window.setTimeout(() => {
    safetyTimer = 0
    reset('timeout')
  }, SAFETY_TIMEOUT_MS)

  // Clear on successful navigation after the swap has completed.
  // This ensures teardown handlers that run on astro:before-swap still
  // see navigation as pending and avoid closing dialogs too early.
  settleListener = () => {
    settleListener = null
    reset('swap')
  }
  document.addEventListener('astro:after-swap', settleListener, { once: true })
}

// Inject the suppress style into the incoming document during swap so
// the view transition pseudo-elements on the NEW document side also
// have their animations suppressed (prevents the fade-in half).
document.addEventListener('astro:before-swap', (event) => {
  if (!document.getElementById(SUPPRESS_STYLE_ID)) return
  const swapEvent = event as Event & { newDocument: Document }
  const style = swapEvent.newDocument.createElement('style')
  style.id = SUPPRESS_STYLE_ID
  style.textContent = SUPPRESS_CSS
  swapEvent.newDocument.head.appendChild(style)
})

// Clean up the suppress style after the page finishes loading.
document.addEventListener('astro:page-load', () => {
  removeVisualClone()
  removeSuppressStyle()
})
