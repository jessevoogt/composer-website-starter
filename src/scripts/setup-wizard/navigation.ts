/**
 * Setup Wizard — step navigation, progress indicator, and footer sync.
 */

import { TOTAL_STEPS, STEP_FOOTER_CONFIG } from './types'
import { state, persistStep } from './state'
import { wizard, tabs, panels } from './dom'
import { clearError, prefillTaglineIfEmpty, prefillTokenSecretIfEmpty } from './helpers'

// ─── Step-specific initializers ──────────────────────────────────────────────

function loadBrandingPreviews(): void {
  const firstName = wizard.querySelector<HTMLInputElement>('#setup-first-name')?.value.trim() ?? ''
  const lastName = wizard.querySelector<HTMLInputElement>('#setup-last-name')?.value.trim() ?? ''
  const siteUrl = wizard.querySelector<HTMLInputElement>('#setup-site-url')?.value.trim() ?? ''
  const composerName = [firstName, lastName].filter(Boolean).join(' ') || 'Composer'

  // Load favicon preview
  const faviconPreview = wizard.querySelector<HTMLElement>('[data-favicon-preview]')
  const faviconImg = faviconPreview?.querySelector<HTMLImageElement>('img')
  if (faviconImg) {
    const params = new URLSearchParams({ firstName, lastName })
    faviconImg.src = `/api/dev/setup/favicon-preview?${params.toString()}`
  }

  // Load social preview
  const socialPreview = wizard.querySelector<HTMLElement>('[data-social-preview]')
  const socialImg = socialPreview?.querySelector<HTMLImageElement>('img')
  if (socialImg) {
    const params = new URLSearchParams({ name: composerName, url: siteUrl })
    socialImg.src = `/api/dev/setup/social-preview?${params.toString()}`
  }
}

// ─── Step navigation ─────────────────────────────────────────────────────────

export function goToStep(index: number): void {
  if (index < 0 || index >= TOTAL_STEPS) return

  // Update tabs
  tabs.forEach((tab, i) => {
    const isActive = i === index
    tab.setAttribute('aria-selected', String(isActive))
    tab.classList.toggle('setup-wizard__tab--active', isActive)
    tab.tabIndex = isActive ? 0 : -1
    // Enable tabs for visited steps
    if (i <= index) {
      tab.disabled = false
      tab.classList.add('setup-wizard__tab--visited')
    }
  })

  // Update panels
  panels.forEach((panel, i) => {
    const isActive = i === index
    panel.hidden = !isActive
  })

  state.currentStep = index
  persistStep(index)
  clearError()

  // Update mobile/tablet progress indicator
  const progressEl = wizard.querySelector<HTMLElement>('[data-step-progress]')
  if (progressEl) {
    progressEl.textContent = `Step ${index + 1} of ${TOTAL_STEPS}`
  }

  // Scroll the active tab into view on desktop (where all tabs are visible)
  const activeTab = tabs[index]
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }

  // Focus management -- focus heading or first interactive element
  const activePanel = panels[index]
  if (!activePanel) return

  // Use requestAnimationFrame to ensure the panel is visible before focusing
  requestAnimationFrame(() => {
    const heading = activePanel.querySelector<HTMLElement>('h1')
    if (heading) {
      heading.tabIndex = -1
      try {
        heading.focus({ preventScroll: true })
      } catch {
        heading.focus()
      }
    }
  })

  // Scroll content area to top
  const content = wizard.querySelector<HTMLElement>('.setup-wizard__content')
  if (content) content.scrollTop = 0

  // Update footer buttons
  const footer = wizard.querySelector<HTMLElement>('[data-wizard-footer]')
  if (footer) {
    const config = STEP_FOOTER_CONFIG[index]
    if (!config || config.next === null) {
      footer.hidden = true
    } else {
      footer.hidden = false
      const backBtn = footer.querySelector<HTMLButtonElement>('[data-footer-back]')
      const nextBtn = footer.querySelector<HTMLButtonElement>('[data-footer-next]')
      if (backBtn) backBtn.hidden = !config.back
      if (nextBtn) nextBtn.textContent = config.next
    }
  }

  // Step-specific initializations
  if (index === 2) loadBrandingPreviews() // Branding step
  if (index === 3) prefillTaglineIfEmpty() // Homepage step
  if (index === 7) prefillTokenSecretIfEmpty() // Forms step
}
