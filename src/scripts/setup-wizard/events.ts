/**
 * Setup Wizard — event listener registrations.
 *
 * All DOM event bindings are centralized here. Each section maps to a
 * wizard step or cross-cutting interaction pattern.
 */

import { STEP_STORAGE_KEY, TOTAL_STEPS } from './types'
import { state, persistStep } from './state'
import { wizard, tabs, presets } from './dom'
import { applyFontPreview } from './font-preview'
import {
  clearError,
  formatFileSize,
  nextTagline,
  generateTokenSecret,
} from './helpers'
import { goToStep } from './navigation'
import {
  handleIdentityNext,
  handleThemeNext,
  handleBrandingNext,
  handleHeroNext,
  handleAboutNext,
  handleWorkNext,
  handleSocialNext,
  handleFormsNext,
  handleDeployNext,
  runFinalizeAndShowDone,
} from './step-handlers'

// ─── Next / Back buttons ─────────────────────────────────────────────────────

wizard.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement
  const btn = target.closest<HTMLButtonElement>('[data-action]')
  if (!btn || state.isSaving) return

  const action = btn.dataset.action

  if (action === 'back') {
    goToStep(state.currentStep - 1)
    return
  }

  if (action === 'next') {
    state.isSaving = true
    clearError()

    // Optimistically persist the *next* step before the API call.
    // Writing YAML triggers Vite HMR which reloads the page -- if the
    // reload wins the race against goToStep(), sessionStorage would
    // still point to the old step. Persisting early fixes that.
    const nextStep = state.currentStep + 1
    persistStep(nextStep)

    let success = false
    switch (state.currentStep) {
      case 0:
        success = await handleIdentityNext(btn)
        break
      case 1:
        success = await handleThemeNext(btn)
        break
      case 2:
        success = await handleBrandingNext(btn)
        break
      case 3:
        success = await handleHeroNext(btn)
        break
      case 4:
        success = await handleAboutNext(btn)
        break
      case 5:
        success = await handleWorkNext(btn)
        break
      case 6:
        success = await handleSocialNext(btn)
        break
      case 7:
        success = await handleFormsNext(btn)
        break
      case 8:
        success = await handleDeployNext(btn)
        break
      default:
        success = true
    }

    state.isSaving = false

    if (success) {
      // When entering the Done step, run the works ingest pipeline
      if (nextStep === TOTAL_STEPS - 1) {
        await runFinalizeAndShowDone()
        return
      }
      goToStep(nextStep)
    } else {
      // Revert the optimistic persist on failure
      persistStep(state.currentStep)
    }
  }
})

// ─── Tab clicks ──────────────────────────────────────────────────────────────

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const index = Number(tab.dataset.stepIndex)
    if (!Number.isNaN(index) && index <= state.currentStep) {
      goToStep(index)
    }
  })
})

// ─── Tab keyboard navigation (arrow keys) ────────────────────────────────────

wizard.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
  const e = event as KeyboardEvent
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const direction = e.key === 'ArrowRight' ? 1 : -1
    const nextIndex = Math.max(0, Math.min(state.currentStep, state.currentStep + direction))
    if (nextIndex !== state.currentStep && tabs[nextIndex] && !tabs[nextIndex].disabled) {
      goToStep(nextIndex)
      tabs[nextIndex].focus()
    }
  }
})

// ─── Theme preset selection ──────────────────────────────────────────────────

wizard.querySelector('.setup-wizard__preset-grid')?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const card = target.closest<HTMLButtonElement>('.setup-wizard__preset-card')
  if (!card) return

  const presetId = card.dataset.presetId ?? ''
  const preset = presets.find((p) => p.id === presetId)
  if (!preset) return

  state.selectedPresetId = presetId

  // Update selected state
  wizard.querySelectorAll('.setup-wizard__preset-card').forEach((c) => {
    c.classList.remove('setup-wizard__preset-card--selected')
    c.setAttribute('aria-checked', 'false')
  })
  card.classList.add('setup-wizard__preset-card--selected')
  card.setAttribute('aria-checked', 'true')

  // Live preview -- inject CSS custom properties
  const root = document.documentElement
  Object.entries(preset.colors).forEach(([key, value]) => {
    // Convert camelCase to CSS var names: colorBackground -> --bg
    const cssVarMap: Record<string, string> = {
      colorBackground: '--bg',
      colorBackgroundSoft: '--bg-soft',
      colorText: '--ink',
      colorTextMuted: '--ink-soft',
      colorAccent: '--accent',
      colorAccentStrong: '--accent-strong',
      colorButton: '--button-bg',
      colorButtonText: '--button-ink',
    }
    const varName = cssVarMap[key]
    if (varName && value) {
      root.style.setProperty(varName, value)
    }
  })

  // Live preview -- fonts
  applyFontPreview(preset.fontHeading, '--font-heading')
  applyFontPreview(preset.fontBody, '--font-body')

  // Sync font selects to the preset's defaults
  const headingSelect = wizard.querySelector<HTMLSelectElement>('#setup-font-heading')
  const bodySelect = wizard.querySelector<HTMLSelectElement>('#setup-font-body')
  if (headingSelect) headingSelect.value = preset.fontHeading
  if (bodySelect) bodySelect.value = preset.fontBody
})

// ─── Font select change -> live preview ──────────────────────────────────────

wizard.querySelector<HTMLSelectElement>('#setup-font-heading')?.addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement
  applyFontPreview(select.value, '--font-heading')
})

wizard.querySelector<HTMLSelectElement>('#setup-font-body')?.addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement
  applyFontPreview(select.value, '--font-body')
})

// ─── Hero image selection ────────────────────────────────────────────────────

wizard.querySelector('.setup-wizard__hero-grid')?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const card = target.closest<HTMLButtonElement>('.setup-wizard__hero-card')
  if (!card) return

  state.selectedHeroId = card.dataset.heroId ?? ''

  // Update selected state
  wizard.querySelectorAll('.setup-wizard__hero-card').forEach((c) => {
    c.classList.remove('setup-wizard__hero-card--selected')
    c.setAttribute('aria-checked', 'false')
  })
  card.classList.add('setup-wizard__hero-card--selected')
  card.setAttribute('aria-checked', 'true')
})

// ─── File upload: shared processing + drag-and-drop ──────────────────────────

/** Check if a file matches an input's accept attribute. */
function matchesAccept(file: File, accept: string): boolean {
  if (!accept) return true
  const types = accept.split(',').map((t) => t.trim().toLowerCase())
  const fileMime = file.type.toLowerCase()
  const fileExt = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  return types.some((t) => {
    if (t.startsWith('.')) return fileExt === t
    if (t.endsWith('/*')) return fileMime.startsWith(t.slice(0, -1))
    return fileMime === t
  })
}

/** Process a file: update preview, filename, and call store callback. */
function processFile(
  file: File,
  container: HTMLElement,
  storeCallback: (file: File | null) => void,
): void {
  storeCallback(file)

  const previewContainer = container.querySelector<HTMLElement>('[data-file-preview]')
  const previewImg = previewContainer?.querySelector<HTMLImageElement>('img')
  const fileNameEl = container.querySelector<HTMLElement>('[data-file-name]')
  const dropzonePlaceholder = container.querySelector<HTMLElement>('[data-dropzone-placeholder]')

  if (fileNameEl) fileNameEl.textContent = `${file.name} (${formatFileSize(file.size)})`
  if (dropzonePlaceholder) dropzonePlaceholder.hidden = true

  if (previewContainer && previewImg && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        previewImg.src = e.target.result
        previewContainer.hidden = false
      }
    }
    reader.readAsDataURL(file)
  }
}

/** Wire up a file input (click-to-choose) + drag-and-drop for a container. */
function setupFileInput(inputId: string, storeCallback: (file: File | null) => void): void {
  const input = wizard.querySelector<HTMLInputElement>(`#${inputId}`)
  if (!input) return

  const uploadContainer = input.closest<HTMLElement>('[data-file-upload]')
  if (!uploadContainer) return
  const acceptAttr = input.getAttribute('accept') ?? ''

  // Traditional file picker
  input.addEventListener('change', () => {
    const file = input.files?.[0] ?? null
    if (file) {
      processFile(file, uploadContainer, storeCallback)
    } else {
      storeCallback(null)
      const fileNameEl = uploadContainer.querySelector<HTMLElement>('[data-file-name]')
      const previewContainer = uploadContainer.querySelector<HTMLElement>('[data-file-preview]')
      const dropzonePlaceholder = uploadContainer.querySelector<HTMLElement>('[data-dropzone-placeholder]')
      if (fileNameEl) fileNameEl.textContent = 'No file selected'
      if (previewContainer) previewContainer.hidden = true
      if (dropzonePlaceholder) dropzonePlaceholder.hidden = false
    }
  })

  // Drag-and-drop on the upload container
  let dragCounter = 0

  uploadContainer.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dragCounter++
    uploadContainer.classList.add('setup-wizard__file-upload--dragover')
  })

  uploadContainer.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  })

  uploadContainer.addEventListener('dragleave', () => {
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      uploadContainer.classList.remove('setup-wizard__file-upload--dragover')
    }
  })

  uploadContainer.addEventListener('drop', (e) => {
    e.preventDefault()
    dragCounter = 0
    uploadContainer.classList.remove('setup-wizard__file-upload--dragover')

    const file = e.dataTransfer?.files[0]
    if (!file) return
    if (!matchesAccept(file, acceptAttr)) return // Silently reject wrong types

    processFile(file, uploadContainer, storeCallback)
  })
}

setupFileInput('setup-profile-image', (file) => {
  state.profileImageFile = file
})
setupFileInput('setup-work-thumbnail', (file) => {
  state.workThumbnailFile = file
})
setupFileInput('setup-work-audio', (file) => {
  state.workAudioFile = file
})
setupFileInput('setup-work-score', (file) => {
  state.workScoreFile = file
})
setupFileInput('setup-logo-file', (file) => {
  state.logoFile = file
})
setupFileInput('setup-favicon-file', (file) => {
  state.faviconFile = file
})
setupFileInput('setup-social-file', (file) => {
  state.socialPreviewFile = file
})

// ─── Branding radio toggles ─────────────────────────────────────────────────

// Logo mode: show/hide custom upload + text logo preview
wizard.querySelectorAll<HTMLInputElement>('input[name="setup-logo-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const isCustom = radio.value === 'custom' && radio.checked
    const customSection = wizard.querySelector<HTMLElement>('[data-logo-custom-section]')
    const textLogoPreview = wizard.querySelector<HTMLElement>('[data-text-logo-preview]')
    if (customSection) customSection.hidden = !isCustom
    if (textLogoPreview) textLogoPreview.hidden = isCustom
  })
})

// Favicon mode: show/hide custom upload + hide auto-generated preview
wizard.querySelectorAll<HTMLInputElement>('input[name="setup-favicon-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const isCustom = radio.value === 'custom' && radio.checked
    const customSection = wizard.querySelector<HTMLElement>('[data-favicon-custom-section]')
    const generatedPreview = wizard.querySelector<HTMLElement>('[data-favicon-preview]')
    if (customSection) customSection.hidden = !isCustom
    if (generatedPreview) generatedPreview.hidden = isCustom
  })
})

// Social preview mode: show/hide custom upload + hide auto-generated preview
wizard.querySelectorAll<HTMLInputElement>('input[name="setup-social-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const isCustom = radio.value === 'custom' && radio.checked
    const customSection = wizard.querySelector<HTMLElement>('[data-social-custom-section]')
    const generatedPreview = wizard.querySelector<HTMLElement>('[data-social-preview]')
    if (customSection) customSection.hidden = !isCustom
    if (generatedPreview) generatedPreview.hidden = isCustom
  })
})

// ─── Identity auto-suggest title ─────────────────────────────────────────────

const firstNameInput = wizard.querySelector<HTMLInputElement>('#setup-first-name')
const lastNameInput = wizard.querySelector<HTMLInputElement>('#setup-last-name')
const siteTitleInput = wizard.querySelector<HTMLInputElement>('#setup-site-title')

function updateTitleSuggestion(): void {
  if (!firstNameInput || !lastNameInput || !siteTitleInput) return
  // Only auto-suggest if the user hasn't manually typed a title
  if (siteTitleInput.dataset.userEdited === 'true') return

  const first = firstNameInput.value.trim()
  const last = lastNameInput.value.trim()
  if (first && last) {
    siteTitleInput.placeholder = `${first} ${last} \u2014 Composer`
  } else {
    siteTitleInput.placeholder = 'Auto-generated from your name'
  }
}

// ─── Text logo preview (Branding step) ───────────────────────────────────────

function updateTextLogoPreview(): void {
  const firstEl = wizard.querySelector<HTMLElement>('[data-text-logo-first]')
  const lastEl = wizard.querySelector<HTMLElement>('[data-text-logo-last]')
  if (!firstEl || !lastEl) return

  const first = firstNameInput?.value.trim() ?? ''
  const last = lastNameInput?.value.trim() ?? ''
  firstEl.textContent = first
  lastEl.textContent = last
}

firstNameInput?.addEventListener('input', () => {
  updateTitleSuggestion()
  updateTextLogoPreview()
})
lastNameInput?.addEventListener('input', () => {
  updateTitleSuggestion()
  updateTextLogoPreview()
})
siteTitleInput?.addEventListener('input', () => {
  if (siteTitleInput) {
    siteTitleInput.dataset.userEdited = siteTitleInput.value.trim() ? 'true' : 'false'
  }
})

// Populate text logo preview on init (names may already be filled from a previous step visit)
updateTextLogoPreview()

// ─── Social toggle enables/disables URL input ────────────────────────────────

wizard.querySelectorAll<HTMLInputElement>('[data-social-enabled]').forEach((checkbox) => {
  const row = checkbox.closest<HTMLElement>('.setup-wizard__social-row')
  const urlInput = row?.querySelector<HTMLInputElement>('[data-social-url]')

  function syncDisabled(): void {
    if (urlInput) {
      urlInput.disabled = !checkbox.checked
      row?.classList.toggle('setup-wizard__social-row--disabled', !checkbox.checked)
    }
  }

  syncDisabled()
  checkbox.addEventListener('change', syncDisabled)
})

// ─── Work toggle shows/hides optional work sections ──────────────────────────

const addFirstWorkToggle = wizard.querySelector<HTMLInputElement>('#setup-add-first-work')
const workFields = Array.from(wizard.querySelectorAll<HTMLElement>('[data-work-fields]'))

function syncWorkFieldsVisibility(): void {
  if (!addFirstWorkToggle || workFields.length === 0) return
  const enabled = addFirstWorkToggle.checked
  workFields.forEach((section) => {
    section.hidden = !enabled
  })
  if (!enabled) clearError()
}

addFirstWorkToggle?.addEventListener('change', syncWorkFieldsVisibility)
syncWorkFieldsVisibility()

// ─── Tagline blockquote toggle shows/hides citation ──────────────────────────

const blockquoteToggle = wizard.querySelector<HTMLInputElement>('#setup-tagline-blockquote')
const citationField = wizard.querySelector<HTMLElement>('[data-citation-field]')

function syncCitationVisibility(): void {
  if (!citationField || !blockquoteToggle) return
  citationField.hidden = !blockquoteToggle.checked
}

blockquoteToggle?.addEventListener('change', syncCitationVisibility)

// ─── Hero layout mode -> conditional image position field ────────────────────

const heroLayoutSelect = wizard.querySelector<HTMLSelectElement>('#setup-hero-layout')
const imagePositionField = wizard.querySelector<HTMLElement>('[data-hero-image-position-field]')

function syncImagePositionVisibility(): void {
  if (!imagePositionField || !heroLayoutSelect) return
  imagePositionField.hidden = heroLayoutSelect.value !== 'columns'
}

heroLayoutSelect?.addEventListener('change', syncImagePositionVisibility)
syncImagePositionVisibility()

// ─── CTA button toggles -> conditional label inputs ──────────────────────────

function setupCtaToggle(checkboxId: string, labelAttr: string): void {
  const checkbox = wizard.querySelector<HTMLInputElement>(`#${checkboxId}`)
  const labelSection = wizard.querySelector<HTMLElement>(`[${labelAttr}]`)
  if (!checkbox || !labelSection) return

  function sync(): void {
    if (labelSection) labelSection.hidden = !checkbox!.checked
  }

  checkbox.addEventListener('change', sync)
  sync()
}

setupCtaToggle('setup-cta-listen', 'data-cta-listen-label')
setupCtaToggle('setup-cta-search', 'data-cta-search-label')

// ─── Contact form toggle shows/hides details ─────────────────────────────────

const contactFormToggle = wizard.querySelector<HTMLInputElement>('#setup-contact-form-enabled')
const contactDetails = wizard.querySelector<HTMLElement>('[data-contact-details]')
const contactDisabledNote = wizard.querySelector<HTMLElement>('[data-contact-disabled-note]')

function syncContactVisibility(): void {
  if (!contactFormToggle) return
  const enabled = contactFormToggle.checked
  if (contactDetails) contactDetails.hidden = !enabled
  if (contactDisabledNote) contactDisabledNote.hidden = enabled
}

contactFormToggle?.addEventListener('change', syncContactVisibility)

// ─── Perusal gating toggle shows/hides details ──────────────────────────────

const perusalGatingToggle = wizard.querySelector<HTMLInputElement>('#setup-perusal-gating-enabled')
const perusalDetails = wizard.querySelector<HTMLElement>('[data-perusal-details]')
const perusalDisabledNote = wizard.querySelector<HTMLElement>('[data-perusal-disabled-note]')

function syncPerusalVisibility(): void {
  if (!perusalGatingToggle) return
  const enabled = perusalGatingToggle.checked
  if (perusalDetails) perusalDetails.hidden = !enabled
  if (perusalDisabledNote) perusalDisabledNote.hidden = enabled
}

perusalGatingToggle?.addEventListener('change', syncPerusalVisibility)

// ─── Markdown toolbar for bio textarea ───────────────────────────────────────

wizard.querySelectorAll<HTMLButtonElement>('[data-md-action]').forEach((toolbarBtn) => {
  toolbarBtn.addEventListener('click', () => {
    const bioTextarea = wizard.querySelector<HTMLTextAreaElement>('#setup-about-body')
    if (!bioTextarea) return

    const action = toolbarBtn.dataset.mdAction
    const start = bioTextarea.selectionStart
    const end = bioTextarea.selectionEnd
    const selectedText = bioTextarea.value.substring(start, end)

    let before = ''
    let after = ''
    let placeholder = ''

    switch (action) {
      case 'bold':
        before = '**'
        after = '**'
        placeholder = 'bold text'
        break
      case 'italic':
        before = '*'
        after = '*'
        placeholder = 'italic text'
        break
      case 'link': {
        const linkText = selectedText || 'link text'
        const replacement = `[${linkText}](url)`
        bioTextarea.value =
          bioTextarea.value.substring(0, start) + replacement + bioTextarea.value.substring(end)
        bioTextarea.focus()
        // Select the "url" part so user can type the URL
        const urlStart = start + linkText.length + 3 // after "[text]("
        bioTextarea.setSelectionRange(urlStart, urlStart + 3)
        return
      }
      default:
        return
    }

    const insertion = selectedText ? `${before}${selectedText}${after}` : `${before}${placeholder}${after}`
    bioTextarea.value = bioTextarea.value.substring(0, start) + insertion + bioTextarea.value.substring(end)
    bioTextarea.focus()

    if (selectedText) {
      // Re-select the text (without the markdown markers)
      bioTextarea.setSelectionRange(start + before.length, start + before.length + selectedText.length)
    } else {
      // Select the placeholder text
      bioTextarea.setSelectionRange(start + before.length, start + before.length + placeholder.length)
    }
  })
})

// ─── Tagline regenerate button ───────────────────────────────────────────────

wizard.querySelector<HTMLButtonElement>('[data-tagline-regenerate]')?.addEventListener('click', () => {
  const taglineField = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')
  if (taglineField) {
    taglineField.value = nextTagline()
    taglineField.focus()
  }
})

// ─── Token secret regenerate button ──────────────────────────────────────────

wizard.querySelector<HTMLButtonElement>('[data-token-regenerate]')?.addEventListener('click', () => {
  const secretField = wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')
  if (secretField) {
    secretField.value = generateTokenSecret()
    secretField.focus()
  }
})

// ─── Done step links clear storage on navigation ─────────────────────────────

const donePanel = wizard.querySelector<HTMLElement>('#panel-done')
donePanel?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(STEP_STORAGE_KEY)
    } catch {
      // sessionStorage unavailable
    }
  })
})

// ─── OS-specific deploy instructions ─────────────────────────────────────────

const deployHint = wizard.querySelector<HTMLElement>('[data-deploy-password-hint]')
if (deployHint) {
  const ua = navigator.userAgent
  let keystoreLabel = 'your system keychain'
  if (/Mac|iPhone|iPad/.test(ua)) {
    keystoreLabel = 'the macOS Keychain'
  } else if (/Win/.test(ua)) {
    keystoreLabel = 'Windows Credential Manager'
  } else if (/Linux/.test(ua)) {
    keystoreLabel = 'your system keyring (e.g. GNOME Keyring or KWallet)'
  }
  deployHint.innerHTML =
    `Your SFTP password is stored securely in ${keystoreLabel}, never on disk. ` +
    'See <code>docs/DEPLOYMENT.md</code> in your project for the full deployment guide.'
}
