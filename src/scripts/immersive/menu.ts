/**
 * Mobile menu controller for the immersive layout.
 * Handles dialog open/close with CSS animation coordination.
 */

import { focusElement, focusTextInput } from '../focus-policy'
import { trackAnalyticsEvent } from '../analytics-events'
import { navigate } from 'astro:transitions/client'
import {
  signalNavigationPending,
  isNavigationPending,
  clearNavigationIntent,
  onNavigationFailed,
} from '../navigation-intent'

type MobileMenuView = 'menu' | 'search'
type SearchScope = 'site' | 'music'

interface MobileMenuSearchDetail {
  mode?: 'toggle' | 'open'
  scope?: SearchScope
}

function compactLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function initMenu(prefersReducedMotion: boolean): () => void {
  const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')
  const menuToggleSlot = document.querySelector<HTMLElement>('[data-menu-toggle-slot]')
  const headerSearchToggle = document.querySelector<HTMLButtonElement>('[data-mobile-header-search-toggle]')
  const mobileMenuDialog = document.querySelector<HTMLDialogElement>('#mobile-menu-modal')

  if (!menuToggle || !mobileMenuDialog) return () => {}

  // Re-bind after null guard so TypeScript narrows in closures
  const dialog: HTMLDialogElement = mobileMenuDialog

  const menuLinks = Array.from(dialog.querySelectorAll<HTMLAnchorElement>('a[href]'))
  const searchToggleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-works-search-modal-toggle]'))
  const mobileMenuNav = dialog.querySelector<HTMLElement>('[data-mobile-menu-nav]')
  const mobileMenuSearch = dialog.querySelector<HTMLElement>('[data-mobile-menu-search]')
  const mobileSearchScopePanels = Array.from(dialog.querySelectorAll<HTMLElement>('[data-mobile-menu-search-scope]'))
  const desktopQuery = window.matchMedia('(min-width: 58rem)')
  const menuToggleHomeParent = menuToggleSlot ?? menuToggle.parentElement
  const searchToggleHomeParent = headerSearchToggle?.parentElement ?? null
  const mobileSearchEventName = 'mobile-menu-search-request'
  const mobileSearchOpenClass = 'immersive-menu-search-open'

  let openTimer = 0
  let closeTimer = 0
  let pendingOpenView: MobileMenuView = 'menu'
  let pendingSearchScope: SearchScope = 'site'
  let currentView: MobileMenuView = 'menu'
  let currentSearchScope: SearchScope = 'site'
  let isMenuClosing = false
  let hasTrackedMenuOpen = false

  function isMobileViewport(): boolean {
    return !desktopQuery.matches
  }

  function normalizeView(view: MobileMenuView): MobileMenuView {
    if (view === 'search' && !mobileMenuSearch) return 'menu'
    return view
  }

  function normalizeSearchScope(scope: string | undefined): SearchScope {
    return scope === 'music' ? 'music' : 'site'
  }

  function getScopedSearchPanel(scope: SearchScope): HTMLElement | null {
    return (
      mobileSearchScopePanels.find((panel) => normalizeSearchScope(panel.dataset.mobileMenuSearchScope) === scope) ?? null
    )
  }

  function getActiveSearchInput(scope: SearchScope = currentSearchScope): HTMLInputElement | null {
    const scopedPanel = getScopedSearchPanel(scope)
    const scopedInput = scopedPanel?.querySelector<HTMLInputElement>('[data-works-search-input]') ?? null
    return scopedInput ?? mobileMenuSearch?.querySelector<HTMLInputElement>('[data-works-search-input]') ?? null
  }

  function setSearchScope(scope: SearchScope, options: { resetSearch?: boolean } = {}): void {
    currentSearchScope = scope

    if (mobileSearchScopePanels.length > 0) {
      mobileSearchScopePanels.forEach((panel) => {
        const panelScope = normalizeSearchScope(panel.dataset.mobileMenuSearchScope)
        const isActive = panelScope === scope
        panel.hidden = !isActive
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true')
      })
    }

    if (options.resetSearch) {
      const input = getActiveSearchInput(scope)
      if (!input) return
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function restoreMenuToggleToHeader(): void {
    if (!menuToggleHomeParent) return
    if (menuToggle!.parentElement !== menuToggleHomeParent) {
      menuToggleHomeParent.append(menuToggle!)
    }
    menuToggle!.classList.remove('is-in-mobile-menu')
  }

  function restoreSearchToggleToHeader(): void {
    if (!headerSearchToggle || !searchToggleHomeParent) return
    if (headerSearchToggle.parentElement !== searchToggleHomeParent) {
      if (menuToggleSlot && menuToggleSlot.parentElement === searchToggleHomeParent) {
        searchToggleHomeParent.insertBefore(headerSearchToggle, menuToggleSlot)
      } else {
        searchToggleHomeParent.append(headerSearchToggle)
      }
    }
    headerSearchToggle.classList.remove('is-in-mobile-menu')
  }

  function moveMenuToggleIntoDialog(): void {
    if (menuToggle!.parentElement !== dialog) {
      dialog.append(menuToggle!)
    }
    menuToggle!.classList.add('is-in-mobile-menu')
  }

  function moveSearchToggleIntoDialog(): void {
    if (!headerSearchToggle) return
    if (headerSearchToggle.parentElement !== dialog) {
      dialog.append(headerSearchToggle)
    }
    headerSearchToggle.classList.add('is-in-mobile-menu')
  }

  function setMenuToggleState(isExpanded: boolean): void {
    menuToggle!.setAttribute('aria-expanded', isExpanded ? 'true' : 'false')
    menuToggle!.setAttribute('aria-label', isExpanded ? 'Close menu' : 'Open menu')
  }

  function setSearchToggleState(isExpanded: boolean, force = false): void {
    if (!force && !isMobileViewport()) return
    searchToggleButtons.forEach((button) => {
      button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false')
      button.setAttribute('aria-label', isExpanded ? 'Close search' : 'Open search')
    })
  }

  function focusSearchInput(scope: SearchScope = currentSearchScope): void {
    const input = getActiveSearchInput(scope)
    if (!input) return
    focusTextInput(input)
  }

  function trackMenuOpen(view: MobileMenuView): void {
    if (hasTrackedMenuOpen) return
    trackAnalyticsEvent('mobile_menu_toggle', {
      state: 'open',
      view,
    })
    hasTrackedMenuOpen = true
  }

  function trackMenuClose(reason: string): void {
    if (!hasTrackedMenuOpen) return
    if (reason !== 'swap') {
      trackAnalyticsEvent('mobile_menu_toggle', {
        state: 'closed',
        reason,
        view: currentView,
      })
    }
    hasTrackedMenuOpen = false
  }

  function setMenuView(
    view: MobileMenuView,
    options: { resetSearch?: boolean; focusSearch?: boolean; searchScope?: SearchScope } = {},
  ): void {
    const previousView = currentView
    const nextView = normalizeView(view)
    const isSearchView = nextView === 'search'
    const isSearchOpen = isSearchView && dialog.open
    const nextSearchScope = normalizeSearchScope(options.searchScope)

    currentView = nextView
    dialog.dataset.mobileMenuView = nextView

    if (mobileMenuNav) {
      mobileMenuNav.hidden = nextView !== 'menu'
    }
    if (mobileMenuSearch) {
      mobileMenuSearch.hidden = !isSearchView
    }

    document.body.classList.toggle(mobileSearchOpenClass, isSearchOpen)

    if (isSearchView) {
      setSearchScope(nextSearchScope, { resetSearch: options.resetSearch })
    }

    setSearchToggleState(isSearchOpen)

    if (isSearchView && options.focusSearch && dialog.open) {
      focusSearchInput(nextSearchScope)
    }

    if (dialog.open && previousView !== nextView) {
      trackAnalyticsEvent('mobile_menu_view', {
        view: nextView,
      })
    }
  }

  function clearMenuTimers(): void {
    if (openTimer) {
      window.clearTimeout(openTimer)
      openTimer = 0
    }
    if (closeTimer) {
      window.clearTimeout(closeTimer)
      closeTimer = 0
    }
  }

  function syncMenuState(): void {
    const isOpen = dialog.open
    if (!isOpen) {
      dialog.classList.remove('is-visible', 'is-opening', 'is-closing')
      isMenuClosing = false
      restoreMenuToggleToHeader()
      restoreSearchToggleToHeader()
      setMenuView('menu')
    } else {
      moveMenuToggleIntoDialog()
      moveSearchToggleIntoDialog()
      setSearchToggleState(currentView === 'search')
    }
    setMenuToggleState(isOpen)
    document.body.classList.toggle('immersive-menu-open', isOpen)
  }

  function finishMenuClose(reason = 'dismiss'): void {
    clearMenuTimers()
    dialog.classList.remove('is-visible', 'is-opening', 'is-closing')
    isMenuClosing = false
    trackMenuClose(reason)

    if (dialog.open) {
      dialog.close(reason)
    } else {
      restoreMenuToggleToHeader()
      restoreSearchToggleToHeader()
      setMenuView('menu')
      setMenuToggleState(false)
      document.body.classList.remove('immersive-menu-open')
    }
  }

  function closeMenu(): void {
    if (openTimer) {
      window.clearTimeout(openTimer)
      openTimer = 0
    }

    if (!dialog.open) {
      setMenuView('menu')
      setMenuToggleState(false)
      document.body.classList.remove('immersive-menu-open')
      return
    }

    if (isMenuClosing) return

    if (prefersReducedMotion) {
      finishMenuClose('dismiss')
      return
    }

    isMenuClosing = true
    dialog.classList.remove('is-visible', 'is-opening')
    dialog.classList.add('is-closing')
    closeTimer = window.setTimeout(() => {
      finishMenuClose('dismiss')
    }, 220)
  }

  function openMenu(view: MobileMenuView = 'menu', searchScope: SearchScope = 'site'): void {
    const nextView = normalizeView(view)
    const nextSearchScope = normalizeSearchScope(searchScope)
    pendingOpenView = nextView
    pendingSearchScope = nextSearchScope

    if (dialog.open) {
      setMenuView(nextView, {
        resetSearch: nextView === 'search',
        focusSearch: nextView === 'search',
        searchScope: nextSearchScope,
      })
      return
    }

    if (openTimer) return

    if (closeTimer) {
      window.clearTimeout(closeTimer)
      closeTimer = 0
    }

    isMenuClosing = false
    setMenuToggleState(true)
    document.body.classList.add('immersive-menu-open')

    const showDialog = (): void => {
      openTimer = 0
      if (dialog.open) return
      const targetView = normalizeView(pendingOpenView)
      const targetSearchScope = normalizeSearchScope(pendingSearchScope)
      moveMenuToggleIntoDialog()
      moveSearchToggleIntoDialog()
      dialog.showModal()
      setMenuView(targetView, { resetSearch: targetView === 'search', searchScope: targetSearchScope })
      trackMenuOpen(targetView)
      dialog.classList.remove('is-closing')
      dialog.classList.add('is-opening')

      if (prefersReducedMotion) {
        dialog.classList.add('is-visible')
      } else {
        window.requestAnimationFrame(() => {
          dialog.classList.add('is-visible')
        })
      }

      if (targetView === 'search') {
        focusSearchInput(targetSearchScope)
      } else if (mobileMenuNav) {
        focusElement(mobileMenuNav)
      }
    }

    if (prefersReducedMotion || nextView === 'search') {
      showDialog()
      return
    }

    openTimer = window.setTimeout(showDialog, 100)
  }

  const onMenuToggleClick = (): void => {
    if (dialog.open || openTimer) {
      closeMenu()
    } else {
      openMenu('menu')
    }
  }

  const onDialogClose = (): void => syncMenuState()

  const onDialogCancel = (event: Event): void => {
    event.preventDefault()
    if (isNavigationPending()) {
      clearNavigationIntent()
    }
    closeMenu()
  }

  const onDialogClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return
    if (currentView === 'search' && event.target.closest('[data-mobile-menu-search]')) return
    if (event.target.closest('a, button')) return
    closeMenu()
  }

  function isInternalNavigationHref(href: string): boolean {
    if (!href || href.startsWith('#')) return false
    try {
      const url = new URL(href, window.location.origin)
      return url.origin === window.location.origin
    } catch {
      return false
    }
  }

  function shouldHandleClientNavigation(event: MouseEvent, link: HTMLAnchorElement): boolean {
    if (event.defaultPrevented) return false
    if (event.button !== 0) return false
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
    if (link.hasAttribute('download')) return false

    const target = (link.getAttribute('target') ?? '').toLowerCase()
    if (target && target !== '_self') return false

    return true
  }

  const onMenuLinkClick = (event: MouseEvent): void => {
    const link = event.currentTarget instanceof HTMLAnchorElement ? event.currentTarget : null
    if (!link) return

    const href = link.getAttribute('href') ?? ''
    trackAnalyticsEvent('mobile_menu_link_click', {
      href,
      label: compactLabel(link.textContent),
    })

    if (isInternalNavigationHref(href)) {
      if (!shouldHandleClientNavigation(event, link)) return

      event.preventDefault()
      signalNavigationPending('mobile-menu', href)
      void navigate(href).catch(() => {
        window.location.href = href
      })
    } else {
      closeMenu()
    }
  }

  const onSearchToggleRequest = (event: Event): void => {
    if (!isMobileViewport()) return

    const customEvent = event as CustomEvent<MobileMenuSearchDetail>
    const mode = customEvent.detail?.mode ?? 'toggle'
    const requestedScope = normalizeSearchScope(customEvent.detail?.scope)

    if (mode === 'open') {
      openMenu('search', requestedScope)
      return
    }

    const openView = dialog.open ? currentView : pendingOpenView
    const openScope = dialog.open ? currentSearchScope : pendingSearchScope
    if ((dialog.open || openTimer) && openView === 'search') {
      if (openScope === requestedScope) {
        closeMenu()
      } else {
        openMenu('search', requestedScope)
      }
      return
    }

    openMenu('search', requestedScope)
  }

  const onDesktopChange = (event: MediaQueryListEvent): void => {
    if (event.matches) {
      setSearchToggleState(false, true)
      closeMenu()
      return
    }
    setSearchToggleState(false)
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
  dialog.appendChild(loadingIndicator)

  const onNavigationLoadingShow = (): void => {
    if (!isNavigationPending() || !dialog.open) return
    dialog.classList.add('is-navigating')
  }

  const onNavigationLoadingHide = (): void => {
    dialog.classList.remove('is-navigating')
  }

  // If navigation fails (timeout or cancellation), close the menu normally
  const removeNavigationFailedListener = onNavigationFailed(() => {
    if (dialog.open && !isMenuClosing) {
      closeMenu()
    }
  })
  const onSearchToggleRequestEvent = (event: Event): void => {
    onSearchToggleRequest(event)
  }

  menuToggle.addEventListener('click', onMenuToggleClick)
  dialog.addEventListener('close', onDialogClose)
  dialog.addEventListener('cancel', onDialogCancel)
  dialog.addEventListener('click', onDialogClick)
  menuLinks.forEach((link) => link.addEventListener('click', onMenuLinkClick))
  window.addEventListener(mobileSearchEventName, onSearchToggleRequestEvent)
  window.addEventListener('navigation-loading-show', onNavigationLoadingShow)
  window.addEventListener('navigation-loading-hide', onNavigationLoadingHide)
  desktopQuery.addEventListener('change', onDesktopChange)

  syncMenuState()

  return () => {
    clearMenuTimers()
    menuToggle.removeEventListener('click', onMenuToggleClick)
    mobileMenuDialog.removeEventListener('close', onDialogClose)
    mobileMenuDialog.removeEventListener('cancel', onDialogCancel)
    mobileMenuDialog.removeEventListener('click', onDialogClick)
    menuLinks.forEach((link) => link.removeEventListener('click', onMenuLinkClick))
    window.removeEventListener(mobileSearchEventName, onSearchToggleRequestEvent)
    window.removeEventListener('navigation-loading-show', onNavigationLoadingShow)
    window.removeEventListener('navigation-loading-hide', onNavigationLoadingHide)
    desktopQuery.removeEventListener('change', onDesktopChange)
    removeNavigationFailedListener()
    loadingIndicator.remove()

    // When navigation is pending from this dialog, skip visual teardown.
    // The DOM swap will replace the entire document anyway, and closing
    // the dialog here would flash the old page content behind it.
    if (isNavigationPending()) {
      isMenuClosing = false
      hasTrackedMenuOpen = false
      return
    }

    dialog.classList.remove('is-visible', 'is-opening', 'is-closing', 'is-navigating')
    isMenuClosing = false
    hasTrackedMenuOpen = false
    if (dialog.open) {
      dialog.close('swap')
    }
    restoreMenuToggleToHeader()
    restoreSearchToggleToHeader()
    setMenuView('menu')
    delete dialog.dataset.mobileMenuView
    setSearchToggleState(false, true)
    setMenuToggleState(false)
    document.body.classList.remove(mobileSearchOpenClass)
    document.body.classList.remove('immersive-menu-open')
  }
}
