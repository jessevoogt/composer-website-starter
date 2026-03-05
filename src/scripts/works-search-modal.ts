/**
 * Works search modal controller.
 * Handles opening/closing the global search dialog and focus management.
 */

import { focusTextInput } from './focus-policy'
import { trackAnalyticsEvent } from './analytics-events'
import { isNavigationPending, onNavigationFailed } from './navigation-intent'

type SearchScope = 'site' | 'music'

interface MobileMenuSearchDetail {
  mode?: 'toggle' | 'open'
  scope?: SearchScope
}

interface WorksSearchModalWindow extends Window {
  __worksSearchModalBound?: boolean
}

function initWorksSearchModal(): () => void {
  const modal = document.querySelector<HTMLDialogElement>('#works-search-modal')
  const toggleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-works-search-modal-toggle]'))
  if (!modal || toggleButtons.length === 0) return () => {}

  // Narrow to non-null locals so TypeScript knows these exist for rest of scope
  const modalEl = modal as HTMLDialogElement

  const closeButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-works-search-modal-close]'))
  const scopePanels = Array.from(modal.querySelectorAll<HTMLElement>('[data-works-search-modal-scope]'))
  const mobileMenuDialog = document.querySelector<HTMLDialogElement>('#mobile-menu-modal')
  const mobileQuery = window.matchMedia('(max-width: 57.999rem)')
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobileMenuSearchEventName = 'mobile-menu-search-request'
  const closeAnimationMs = 180

  let closeTimer = 0
  let openFrame = 0
  let activeScope: SearchScope = 'site'

  function normalizeScope(value: string | undefined): SearchScope {
    return value === 'music' ? 'music' : 'site'
  }

  function getScopePanel(scope: SearchScope): HTMLElement | null {
    return scopePanels.find((panel) => normalizeScope(panel.dataset.worksSearchModalScope) === scope) ?? null
  }

  function getActiveInput(): HTMLInputElement | null {
    const scopedPanel = getScopePanel(activeScope)
    const scopedInput = scopedPanel?.querySelector<HTMLInputElement>('[data-works-search-input]') ?? null
    return scopedInput ?? modalEl.querySelector<HTMLInputElement>('[data-works-search-input]')
  }

  function setSearchScope(scope: SearchScope, options: { resetInput?: boolean } = {}): void {
    activeScope = scope

    if (scopePanels.length > 0) {
      scopePanels.forEach((panel) => {
        const panelScope = normalizeScope(panel.dataset.worksSearchModalScope)
        const isActive = panelScope === scope
        panel.hidden = !isActive
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true')
      })
    }

    modalEl.setAttribute('aria-label', scope === 'music' ? 'Search music' : 'Search')

    if (options.resetInput) {
      const input = getActiveInput()
      if (input) {
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  }

  function setToggleState(isExpanded: boolean): void {
    toggleButtons.forEach((button) => {
      button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false')
      button.setAttribute('aria-label', isExpanded ? 'Close search' : 'Open search')
    })
  }

  function clearCloseTimer(): void {
    if (!closeTimer) return
    window.clearTimeout(closeTimer)
    closeTimer = 0
  }

  function clearOpenFrame(): void {
    if (!openFrame) return
    window.cancelAnimationFrame(openFrame)
    openFrame = 0
  }

  function syncClosedState(): void {
    modalEl.classList.remove('is-visible', 'is-closing')
    document.body.classList.remove('works-search-modal-open')
    setToggleState(false)
  }

  function finishClose(reason = 'dismiss'): void {
    clearCloseTimer()
    clearOpenFrame()
    if (reason !== 'swap') {
      trackAnalyticsEvent('search_modal_toggle', {
        state: 'closed',
        reason,
      })
    }
    if (modalEl.open) {
      modalEl.close(reason)
      return
    }
    syncClosedState()
  }

  function closeModal(reason = 'dismiss'): void {
    clearCloseTimer()
    clearOpenFrame()

    if (!modalEl.open) {
      syncClosedState()
      return
    }

    if (prefersReducedMotion) {
      finishClose(reason)
      return
    }

    modalEl.classList.remove('is-visible')
    modalEl.classList.add('is-closing')
    closeTimer = window.setTimeout(() => {
      finishClose(reason)
    }, closeAnimationMs)
  }

  function openModal(scope: SearchScope = 'site'): void {
    clearCloseTimer()
    clearOpenFrame()
    setSearchScope(scope, { resetInput: true })

    if (mobileMenuDialog?.open) {
      mobileMenuDialog.close('dismiss')
    }

    if (!modalEl.open) {
      modalEl.showModal()
    }

    modalEl.classList.remove('is-closing')
    if (prefersReducedMotion) {
      modalEl.classList.add('is-visible')
    } else {
      openFrame = window.requestAnimationFrame(() => {
        openFrame = window.requestAnimationFrame(() => {
          openFrame = 0
          modalEl.classList.add('is-visible')
        })
      })
    }

    document.body.classList.add('works-search-modal-open')
    setToggleState(true)
    trackAnalyticsEvent('search_modal_toggle', {
      state: 'open',
      source: 'desktop_modal',
      scope,
    })

    focusTextInput(getActiveInput())
  }

  const onToggleClick = (event: MouseEvent): void => {
    const triggerButton = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null
    const scope = normalizeScope(triggerButton?.dataset.worksSearchScope)

    if (mobileQuery.matches && mobileMenuDialog) {
      event.preventDefault()
      if (modal.open) {
        modalEl.close('swap')
      }
      window.dispatchEvent(
        new CustomEvent<MobileMenuSearchDetail>(mobileMenuSearchEventName, {
          detail: { mode: 'toggle', scope },
        }),
      )
      return
    }

    if (modal.open) {
      closeModal('dismiss')
      return
    }
    openModal(scope)
  }

  const onCloseClick = (): void => closeModal('dismiss')

  const onDialogCancel = (event: Event): void => {
    event.preventDefault()
    closeModal('dismiss')
  }

  const onDialogClick = (event: MouseEvent): void => {
    if (event.target === modalEl) {
      closeModal('dismiss')
    }
  }

  const onDialogClose = (): void => {
    syncClosedState()
  }

  // --- Navigation-pending loading indicator ---

  const loadingIndicator = document.createElement('div')
  loadingIndicator.className = 'navigation-loading-indicator'
  loadingIndicator.setAttribute('role', 'status')
  loadingIndicator.setAttribute('aria-live', 'assertive')
  const loadingText = document.createElement('span')
  loadingText.className = 'sr-only'
  loadingText.textContent = 'Loading page'
  loadingIndicator.appendChild(loadingText)
  modalEl.appendChild(loadingIndicator)

  const onNavigationLoadingShow = (): void => {
    if (!isNavigationPending() || !modalEl.open) return
    modalEl.classList.add('is-navigating')
  }

  const onNavigationLoadingHide = (): void => {
    modalEl.classList.remove('is-navigating')
  }

  // If navigation fails (timeout or cancellation), close the modal normally
  const removeNavigationFailedListener = onNavigationFailed(() => {
    if (modalEl.open) {
      closeModal('dismiss')
    }
  })

  toggleButtons.forEach((button) => button.addEventListener('click', onToggleClick))
  closeButtons.forEach((button) => button.addEventListener('click', onCloseClick))
  modalEl.addEventListener('cancel', onDialogCancel)
  modalEl.addEventListener('click', onDialogClick)
  modalEl.addEventListener('close', onDialogClose)
  window.addEventListener('navigation-loading-show', onNavigationLoadingShow)
  window.addEventListener('navigation-loading-hide', onNavigationLoadingHide)

  setSearchScope('site')
  setToggleState(modalEl.open)

  return () => {
    clearCloseTimer()
    clearOpenFrame()
    toggleButtons.forEach((button) => button.removeEventListener('click', onToggleClick))
    closeButtons.forEach((button) => button.removeEventListener('click', onCloseClick))
    modalEl.removeEventListener('cancel', onDialogCancel)
    modalEl.removeEventListener('click', onDialogClick)
    modalEl.removeEventListener('close', onDialogClose)
    window.removeEventListener('navigation-loading-show', onNavigationLoadingShow)
    window.removeEventListener('navigation-loading-hide', onNavigationLoadingHide)
    removeNavigationFailedListener()
    loadingIndicator.remove()

    // When navigation is pending from this dialog, skip visual teardown.
    // The DOM swap will replace the entire document anyway, and closing
    // the dialog here would flash the old page content behind it.
    if (isNavigationPending()) return

    modalEl.classList.remove('is-visible', 'is-closing', 'is-navigating')
    document.body.classList.remove('works-search-modal-open')
    if (modalEl.open) {
      modalEl.close('swap')
    }
    setToggleState(false)
  }
}

const worksSearchModalWindow = window as WorksSearchModalWindow
if (!worksSearchModalWindow.__worksSearchModalBound) {
  worksSearchModalWindow.__worksSearchModalBound = true

  document.addEventListener('astro:page-load', () => {
    const teardown = initWorksSearchModal()
    document.addEventListener('astro:before-swap', () => teardown(), { once: true })
  })
}
