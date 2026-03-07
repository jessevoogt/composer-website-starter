/**
 * Setup Wizard — step handler functions.
 *
 * Each handleStep*Next() validates the current step's inputs, calls the
 * API, and returns true on success (allowing navigation to the next step).
 */

import { TOTAL_STEPS, STEP_STORAGE_KEY } from './types'
import { state } from './state'
import { wizard, presets } from './dom'
import {
  showError,
  setButtonLoading,
  apiPost,
  uploadFile,
  slugify,
  getFileExtension,
  isValidEmail,
  isValidHttpUrl,
} from './helpers'
import { goToStep } from './navigation'

// ─── Prefill helpers ─────────────────────────────────────────────────────────

/** Prefill the about step's alt text and bio with the actual composer name. */
function prefillAboutStep(firstName: string, lastName: string): void {
  const fullName = `${firstName} ${lastName}`

  // Prefill alt text if it still has placeholder value
  const altInput = wizard.querySelector<HTMLInputElement>('#setup-profile-alt')
  if (altInput) {
    const current = altInput.value.trim()
    if (!current || current === 'Portrait of composer FirstName LastName.' || current.includes('FirstName')) {
      altInput.value = `Portrait of composer ${fullName}.`
    }
  }

  // Replace [Your Name] and FirstName LastName tokens in bio
  const bioTextarea = wizard.querySelector<HTMLTextAreaElement>('#setup-about-body')
  if (bioTextarea) {
    let bio = bioTextarea.value
    if (bio.includes('[Your Name]') || bio.includes('FirstName LastName')) {
      bio = bio.replace(/\[Your Name\]/g, fullName)
      bio = bio.replace(/FirstName LastName/g, fullName)
      bioTextarea.value = bio
    }
  }
}

// ─── Step 0: Identity ────────────────────────────────────────────────────────

export async function handleIdentityNext(btn: HTMLButtonElement): Promise<boolean> {
  const firstName = wizard.querySelector<HTMLInputElement>('#setup-first-name')?.value.trim() ?? ''
  const lastName = wizard.querySelector<HTMLInputElement>('#setup-last-name')?.value.trim() ?? ''
  const email = wizard.querySelector<HTMLInputElement>('#setup-email')?.value.trim() ?? ''
  const siteUrl = wizard.querySelector<HTMLInputElement>('#setup-site-url')?.value.trim() ?? ''
  const siteTitle = wizard.querySelector<HTMLInputElement>('#setup-site-title')?.value.trim() ?? ''
  const siteDescription = wizard.querySelector<HTMLTextAreaElement>('#setup-site-description')?.value.trim() ?? ''

  if (!firstName) {
    showError('Please enter your first name.')
    wizard.querySelector<HTMLInputElement>('#setup-first-name')?.focus()
    return false
  }
  if (!lastName) {
    showError('Please enter your last name.')
    wizard.querySelector<HTMLInputElement>('#setup-last-name')?.focus()
    return false
  }
  if (!email) {
    showError('Please enter your email address.')
    wizard.querySelector<HTMLInputElement>('#setup-email')?.focus()
    return false
  }
  if (!isValidEmail(email)) {
    showError('Please enter a valid email address.')
    wizard.querySelector<HTMLInputElement>('#setup-email')?.focus()
    return false
  }
  if (!siteUrl) {
    showError('Please enter your website URL.')
    wizard.querySelector<HTMLInputElement>('#setup-site-url')?.focus()
    return false
  }
  if (!isValidHttpUrl(siteUrl)) {
    showError('Please enter a valid website URL (including http:// or https://).')
    wizard.querySelector<HTMLInputElement>('#setup-site-url')?.focus()
    return false
  }

  setButtonLoading(btn, true)
  try {
    const result = await apiPost('/api/dev/setup/identity', {
      firstName,
      lastName,
      email,
      siteUrl,
      siteTitle,
      siteDescription,
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save identity.')
      return false
    }

    // Prefill about step fields with actual name
    prefillAboutStep(firstName, lastName)

    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 1: Theme ───────────────────────────────────────────────────────────

export async function handleThemeNext(btn: HTMLButtonElement): Promise<boolean> {
  // Theme is saved on click, so we just need to validate a preset is selected
  if (!state.selectedPresetId) {
    showError('Please select a theme preset.')
    return false
  }

  // Resolve font selections (fall back to preset defaults if unchanged)
  const fontHeading = wizard.querySelector<HTMLSelectElement>('#setup-font-heading')?.value ?? ''
  const fontBody = wizard.querySelector<HTMLSelectElement>('#setup-font-body')?.value ?? ''

  const preset = presets.find((p) => p.id === state.selectedPresetId)
  if (!preset) {
    showError('Selected preset not found.')
    return false
  }

  const resolvedFontBody = fontBody || preset.fontBody
  const resolvedFontHeading = fontHeading || preset.fontHeading

  // Detect font overrides -- if fonts differ from preset, create a custom theme
  const fontsCustomized = resolvedFontBody !== preset.fontBody || resolvedFontHeading !== preset.fontHeading

  // Build composer label for custom theme ID (from Identity step fields)
  let composerLabel = ''
  if (fontsCustomized) {
    const firstName = wizard.querySelector<HTMLInputElement>('#setup-first-name')?.value?.trim() ?? ''
    const lastName = wizard.querySelector<HTMLInputElement>('#setup-last-name')?.value?.trim() ?? ''
    composerLabel = [firstName, lastName].filter(Boolean).join(' ')
  }

  setButtonLoading(btn, true)
  try {
    const result = await apiPost('/api/dev/theme/preset', {
      colors: preset.colors,
      fontBody: resolvedFontBody,
      fontHeading: resolvedFontHeading,
      borderRadius: preset.borderRadius,
      currentThemeId: preset.id,
      focusRingColor: preset.focusRingColor,
      ctaBackground: preset.ctaBackground,
      ctaText: preset.ctaText,
      navActiveUnderline: preset.navActiveUnderline,
      navActiveText: preset.navActiveText,
      navHoverUnderline: preset.navHoverUnderline,
      navHoverText: preset.navHoverText,
      scrimColor: preset.scrimColor,
      disableImageOverlays: preset.disableImageOverlays,
      playerBorderRadius: preset.playerBorderRadius,
      socialIconBorderRadius: preset.socialIconBorderRadius,
      profileImageBorderRadius: preset.profileImageBorderRadius,
      tagBadgeBorderRadius: preset.tagBadgeBorderRadius,
      isCustom: fontsCustomized,
      composerLabel,
      basePresetId: preset.id,
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save theme.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 2: Branding ────────────────────────────────────────────────────────

export async function handleBrandingNext(btn: HTMLButtonElement): Promise<boolean> {
  const logoModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-logo-mode"]:checked')
  const faviconModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-favicon-mode"]:checked')
  const socialModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-social-mode"]:checked')

  const logoMode = logoModeRadio?.value || 'text'
  const faviconMode = faviconModeRadio?.value || 'generated'
  const socialPreviewMode = socialModeRadio?.value || 'generated'

  // Validate: custom mode requires a file upload
  if (logoMode === 'custom' && !state.logoFile) {
    showError('Please upload a logo image, or switch back to "Text" mode.')
    return false
  }
  if (faviconMode === 'custom' && !state.faviconFile) {
    showError('Please upload a favicon, or switch back to "Auto-generate".')
    return false
  }
  if (socialPreviewMode === 'custom' && !state.socialPreviewFile) {
    showError('Please upload a social preview image, or switch back to "Auto-generate".')
    return false
  }

  setButtonLoading(btn, true)

  try {
    // Upload custom logo if selected
    if (logoMode === 'custom' && state.logoFile) {
      const ext = state.logoFile.name.split('.').pop()?.toLowerCase() || 'svg'
      const uploadResult = await uploadFile(state.logoFile, `branding/logo.${ext}`)
      if (!uploadResult.ok) {
        showError(uploadResult.error || 'Failed to upload logo.')
        return false
      }
    }

    // Upload custom favicon -- use the correct filename based on actual file type.
    // The layout references both /favicon.svg and /favicon-96x96.png, so
    // saving with the right extension ensures the correct <link> tag works.
    if (faviconMode === 'custom' && state.faviconFile) {
      const faviconDest =
        state.faviconFile.type === 'image/svg+xml' ? 'branding/favicon.svg' : 'branding/favicon-96x96.png'
      const uploadResult = await uploadFile(state.faviconFile, faviconDest)
      if (!uploadResult.ok) {
        showError(uploadResult.error || 'Failed to upload favicon.')
        return false
      }
    }

    // Upload custom social preview if selected
    if (socialPreviewMode === 'custom' && state.socialPreviewFile) {
      const ext = state.socialPreviewFile.name.split('.').pop()?.toLowerCase() || 'png'
      const uploadResult = await uploadFile(state.socialPreviewFile, `branding/social-preview-image.${ext}`)
      if (!uploadResult.ok) {
        showError(uploadResult.error || 'Failed to upload social preview.')
        return false
      }
    }

    // Save branding config
    const result = await apiPost('/api/dev/setup/branding', {
      logoMode,
      faviconMode,
      faviconFormat:
        faviconMode === 'custom' && state.faviconFile
          ? state.faviconFile.type === 'image/svg+xml'
            ? 'svg'
            : 'png'
          : '',
      socialPreviewMode,
    })

    if (!result.ok) {
      showError(result.error || 'Failed to save branding settings.')
      return false
    }

    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 3: Homepage (hero + CTA + SEO) ─────────────────────────────────────

export async function handleHeroNext(btn: HTMLButtonElement): Promise<boolean> {
  setButtonLoading(btn, true)

  try {
    // Save hero preference if one was selected
    if (state.selectedHeroId) {
      const heroResult = await apiPost('/api/dev/hero-preference', {
        preferredHeroId: state.selectedHeroId,
        pageKey: 'home',
      })
      if (!heroResult.ok) {
        showError(heroResult.error ?? 'Failed to save hero preference.')
        return false
      }
    }

    // Collect all homepage fields
    const heroTagline = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')?.value.trim() ?? ''
    const heroTaglineAsBlockquote =
      wizard.querySelector<HTMLInputElement>('#setup-tagline-blockquote')?.checked ?? false
    const heroTaglineCitation =
      wizard.querySelector<HTMLInputElement>('#setup-tagline-citation')?.value.trim() ?? ''

    // Hero layout
    const heroLayout = wizard.querySelector<HTMLSelectElement>('#setup-hero-layout')?.value ?? 'columns'
    const heroImagePosition =
      wizard.querySelector<HTMLSelectElement>('#setup-hero-image-position')?.value ?? 'left'

    // CTA buttons
    const ctaListenVisible = wizard.querySelector<HTMLInputElement>('#setup-cta-listen')?.checked ?? true
    const ctaListenLabel =
      wizard.querySelector<HTMLInputElement>('#setup-cta-listen-text')?.value.trim() || 'Listen Now'
    const ctaSearchVisible = wizard.querySelector<HTMLInputElement>('#setup-cta-search')?.checked ?? true
    const ctaSearchLabel =
      wizard.querySelector<HTMLInputElement>('#setup-cta-search-text')?.value.trim() || 'Search Music'

    // SEO metadata
    const metaTitle = wizard.querySelector<HTMLInputElement>('#setup-meta-title')?.value.trim() ?? ''
    const metaDescription = wizard.querySelector<HTMLTextAreaElement>('#setup-meta-description')?.value.trim() ?? ''

    const homepageResult = await apiPost('/api/dev/setup/homepage', {
      heroTagline,
      heroTaglineAsBlockquote,
      heroTaglineCitation: heroTaglineAsBlockquote ? heroTaglineCitation : '',
      heroLayout,
      heroImagePosition: heroLayout === 'columns' ? heroImagePosition : 'left',
      ctaListenVisible,
      ctaListenLabel,
      ctaSearchVisible,
      ctaSearchLabel,
      metaTitle,
      metaDescription,
    })
    if (!homepageResult.ok) {
      showError(homepageResult.error ?? 'Failed to save homepage config.')
      return false
    }

    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 4: About ───────────────────────────────────────────────────────────

export async function handleAboutNext(btn: HTMLButtonElement): Promise<boolean> {
  const profileImageAlt = wizard.querySelector<HTMLInputElement>('#setup-profile-alt')?.value.trim() ?? ''
  const body = wizard.querySelector<HTMLTextAreaElement>('#setup-about-body')?.value.trim() ?? ''

  setButtonLoading(btn, true)
  try {
    // Upload profile image if selected
    if (state.profileImageFile) {
      const ext = getFileExtension(state.profileImageFile) || '.jpg'
      const uploadResult = await uploadFile(state.profileImageFile, `pages/about/profile${ext}`)
      if (!uploadResult.ok) {
        showError(uploadResult.error ?? 'Failed to upload profile image.')
        return false
      }
    }

    // Save about page metadata
    const result = await apiPost('/api/dev/setup/about', {
      profileImageAlt,
      body,
      metaDescription: '',
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save about page.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 5: Work ────────────────────────────────────────────────────────────

export async function handleWorkNext(btn: HTMLButtonElement): Promise<boolean> {
  const title = wizard.querySelector<HTMLInputElement>('#setup-work-title')?.value.trim() ?? ''
  const subtitle = wizard.querySelector<HTMLInputElement>('#setup-work-subtitle')?.value.trim() ?? ''
  const description = wizard.querySelector<HTMLTextAreaElement>('#setup-work-description')?.value.trim() ?? ''
  const instrumentationRaw =
    wizard.querySelector<HTMLInputElement>('#setup-work-instrumentation')?.value.trim() ?? ''
  const youtubeUrl = wizard.querySelector<HTMLInputElement>('#setup-work-youtube')?.value.trim() ?? ''
  const sheetMusicUrl = wizard.querySelector<HTMLInputElement>('#setup-work-sheetmusic-url')?.value.trim() ?? ''
  const addFirstWork = wizard.querySelector<HTMLInputElement>('#setup-add-first-work')?.checked ?? true
  const includeStarters = wizard.querySelector<HTMLInputElement>('#setup-include-starters')?.checked ?? true

  if (!addFirstWork) {
    setButtonLoading(btn, true)
    try {
      const result = await apiPost('/api/dev/setup/work', {
        addFirstWork: false,
        includeStarters,
      })
      if (!result.ok) {
        showError(result.error ?? 'Failed to save work-step options.')
        return false
      }
      return true
    } catch {
      showError('Network error. Is the dev server running?')
      return false
    } finally {
      setButtonLoading(btn, false)
    }
  }

  if (!title) {
    showError('Please enter a title for your work.')
    wizard.querySelector<HTMLInputElement>('#setup-work-title')?.focus()
    return false
  }
  if (!description) {
    showError('Please enter a short description for your work.')
    wizard.querySelector<HTMLTextAreaElement>('#setup-work-description')?.focus()
    return false
  }
  if (!state.workThumbnailFile) {
    showError('Please add a thumbnail image for your work.')
    wizard.querySelector<HTMLInputElement>('#setup-work-thumbnail')?.focus()
    return false
  }

  if (youtubeUrl && !isValidHttpUrl(youtubeUrl)) {
    showError('Please enter a valid YouTube URL (including http:// or https://).')
    wizard.querySelector<HTMLInputElement>('#setup-work-youtube')?.focus()
    return false
  }
  if (sheetMusicUrl && !isValidHttpUrl(sheetMusicUrl)) {
    showError('Please enter a valid sheet music URL (including http:// or https://).')
    wizard.querySelector<HTMLInputElement>('#setup-work-sheetmusic-url')?.focus()
    return false
  }

  const slug = slugify(title)
  if (!slug) {
    showError('Could not generate a URL slug from the title. Please use at least one letter or number.')
    wizard.querySelector<HTMLInputElement>('#setup-work-title')?.focus()
    return false
  }

  // Parse instrumentation into array
  const instrumentation = instrumentationRaw
    ? instrumentationRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  setButtonLoading(btn, true)
  try {
    // Upload thumbnail if provided
    if (state.workThumbnailFile) {
      const thumbExt = getFileExtension(state.workThumbnailFile) || '.jpg'
      const thumbResult = await uploadFile(state.workThumbnailFile, `works/${slug}/thumbnail${thumbExt}`)
      if (!thumbResult.ok) {
        showError(thumbResult.error ?? 'Failed to upload thumbnail.')
        return false
      }
    }

    // Upload audio if provided
    let hasRecording = false
    let recordingFolder = ''
    if (state.workAudioFile) {
      const audioExt = getFileExtension(state.workAudioFile) || '.wav'
      recordingFolder = `recording-${new Date().getFullYear()}`
      const audioResult = await uploadFile(
        state.workAudioFile,
        `works/${slug}/recordings/${recordingFolder}/recording${audioExt}`,
      )
      if (!audioResult.ok) {
        showError(audioResult.error ?? 'Failed to upload audio file.')
        return false
      }
      hasRecording = true
    }

    // Upload PDF score if provided (placed at work root by convention;
    // ingest-works.mjs auto-detects it and sets hasPerusalScore: true)
    if (state.workScoreFile) {
      const scoreResult = await uploadFile(state.workScoreFile, `works/${slug}/score.pdf`)
      if (!scoreResult.ok) {
        showError(scoreResult.error ?? 'Failed to upload PDF score.')
        return false
      }
    }

    // Save work metadata
    const result = await apiPost('/api/dev/setup/work', {
      addFirstWork: true,
      title,
      subtitle,
      description,
      slug,
      thumbnailAlt: title,
      thumbnailUploaded: true,
      instrumentation,
      hasRecording,
      recordingFolder,
      youtubeUrl,
      sheetMusicUrl,
      includeStarters,
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to create work.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 6: Social ──────────────────────────────────────────────────────────

export async function handleSocialNext(btn: HTMLButtonElement): Promise<boolean> {
  const rows = Array.from(wizard.querySelectorAll<HTMLElement>('.setup-wizard__social-row'))
  const links = rows.map((row) => {
    const platform = row.dataset.platform ?? ''
    const enabledCheckbox = row.querySelector<HTMLInputElement>('[data-social-enabled]')
    const urlInput = row.querySelector<HTMLInputElement>('[data-social-url]')
    return {
      platform,
      url: urlInput?.value.trim() ?? '',
      enabled: enabledCheckbox?.checked ?? false,
    }
  })

  setButtonLoading(btn, true)
  try {
    const result = await apiPost('/api/dev/setup/social', { links })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save social links.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 7: Forms ───────────────────────────────────────────────────────────

export async function handleFormsNext(btn: HTMLButtonElement): Promise<boolean> {
  const contactFormEnabled =
    wizard.querySelector<HTMLInputElement>('#setup-contact-form-enabled')?.checked ?? false
  const contactWebhookUrl =
    wizard.querySelector<HTMLInputElement>('#setup-contact-webhook')?.value.trim() ?? ''
  const perusalGatingEnabled =
    wizard.querySelector<HTMLInputElement>('#setup-perusal-gating-enabled')?.checked ?? false
  const perusalWebhookUrl =
    wizard.querySelector<HTMLInputElement>('#setup-perusal-webhook')?.value.trim() ?? ''
  const perusalTokenSecret =
    wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')?.value.trim() ?? ''
  const perusalExpirationValue =
    wizard.querySelector<HTMLInputElement>('#setup-perusal-expiration')?.value ?? '90'
  const perusalTokenExpirationDays = Math.max(1, Math.round(Number(perusalExpirationValue) || 90))

  setButtonLoading(btn, true)
  try {
    const result = await apiPost('/api/dev/setup/forms', {
      contactFormEnabled,
      contactWebhookUrl,
      perusalGatingEnabled,
      perusalWebhookUrl,
      perusalTokenSecret,
      perusalTokenExpirationDays,
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save form settings.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Step 8: Deploy ──────────────────────────────────────────────────────────

export async function handleDeployNext(btn: HTMLButtonElement): Promise<boolean> {
  const sftpHost = wizard.querySelector<HTMLInputElement>('#setup-sftp-host')?.value.trim() ?? ''
  const sftpUser = wizard.querySelector<HTMLInputElement>('#setup-sftp-user')?.value.trim() ?? ''
  const sftpRemotePath = wizard.querySelector<HTMLInputElement>('#setup-sftp-path')?.value.trim() ?? '/public_html'
  const sftpPortValue = wizard.querySelector<HTMLInputElement>('#setup-sftp-port')?.value ?? '22'
  const sftpPort = Math.max(1, Math.round(Number(sftpPortValue) || 22))

  // If no host is entered, continue silently.
  if (!sftpHost) {
    return true
  }

  setButtonLoading(btn, true)
  try {
    const result = await apiPost('/api/dev/setup/deploy', {
      sftpHost,
      sftpUser,
      sftpRemotePath,
      sftpPort,
    })
    if (!result.ok) {
      showError(result.error ?? 'Failed to save deploy config.')
      return false
    }
    return true
  } catch {
    showError('Network error. Is the dev server running?')
    return false
  } finally {
    setButtonLoading(btn, false)
  }
}

// ─── Finalize helper (invoked when entering the Done step) ───────────────────

/** Auto-close wizard tab when dev server is ready on port 4321. */
function tryAutoCloseWizardTab(): void {
  let attempts = 0
  const maxAttempts = 60 // poll for up to ~60 seconds

  const poll = setInterval(async () => {
    attempts++
    if (attempts > maxAttempts) {
      clearInterval(poll)
      return
    }

    try {
      const res = await fetch('http://127.0.0.1:4321/', { method: 'HEAD', mode: 'no-cors' })
      // mode: 'no-cors' means res.ok is always false, but the fetch resolving without
      // throwing means the server is up. Open the site in this tab.
      void res
      clearInterval(poll)
      window.location.href = 'http://127.0.0.1:4321/'
    } catch {
      // Server not up yet -- keep polling
    }
  }, 1000)
}

/**
 * Run the finalize pipeline and show the Done step.
 * Called when advancing to the final step (step 9 = Done), whether via
 * the "Save & finish" button or "Skip for now".
 */
export async function runFinalizeAndShowDone(): Promise<void> {
  goToStep(TOTAL_STEPS - 1)

  const isStandalone = !!document.querySelector('[data-standalone]')

  if (isStandalone) {
    // Standalone mode: run finalize synchronously and reveal the completion message.
    const indicator = document.querySelector<HTMLElement>('[data-finalize-indicator]')
    const doneContent = document.querySelector<HTMLElement>('[data-done-content]')

    try {
      const finalizeResult = await apiPost('/api/dev/setup/finalize', {})
      if (indicator) indicator.hidden = true
      if (doneContent) doneContent.hidden = false

      if (!finalizeResult.ok) {
        showError('Failed to prepare your site: ' + (finalizeResult.error || 'Unknown error'))
      }
    } catch {
      if (indicator) indicator.hidden = true
      if (doneContent) doneContent.hidden = false
      showError('Network error during finalize. You can run npm run dev:full manually.')
    }

    try {
      sessionStorage.removeItem(STEP_STORAGE_KEY)
    } catch {
      /* ignore */
    }

    // Try to auto-close the wizard tab once the dev server is up on port 4321.
    // Poll until the server responds, then open the site and close this tab.
    tryAutoCloseWizardTab()
  } else {
    // Astro mode: fire-and-forget -- pipeline runs in background
    apiPost('/api/dev/setup/finalize', {}).catch(() => {
      // Ingest failure is non-blocking -- user can always run `npm run dev:full` manually
    })
  }
}
