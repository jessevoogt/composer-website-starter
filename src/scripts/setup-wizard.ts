/**
 * Setup Wizard — client-side step navigation, validation, and API calls.
 *
 * Each step's "Next" button validates → calls API → advances on success.
 * Uses the existing dev server API endpoints for theme and hero,
 * plus endpoints for identity, social, homepage, about, work, forms, and deploy.
 *
 * Steps (0-indexed):
 *  0 = Identity, 1 = Theme, 2 = Branding, 3 = Homepage, 4 = About,
 *  5 = Work, 6 = Social, 7 = Forms, 8 = Deploy, 9 = Done
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThemePreset {
  id: string
  label: string
  description: string
  colors: Record<string, string>
  fontBody: string
  fontHeading: string
  borderRadius: string
  focusRingColor: string
  ctaBackground: string
  ctaText: string
  navActiveUnderline: string
  navActiveText: string
  navHoverUnderline: string
  navHoverText: string
  scrimColor: string
  disableImageOverlays: boolean
  playerBorderRadius: string
  socialIconBorderRadius: string
  profileImageBorderRadius: string
  tagBadgeBorderRadius: string
}

// ─── Tagline pool ────────────────────────────────────────────────────────────
// Randomized composer taglines for the Homepage step. Users can cycle through
// them with a "regenerate" button or type their own.
const TAGLINE_POOL: string[] = [
  'Music for curious ears.',
  'New music for adventurous performers.',
  'Contemporary compositions for the concert stage.',
  'Exploring timbral landscapes through new music.',
  'Where structure meets expression.',
  'Fresh perspectives in contemporary concert music.',
  'Compositions for chamber, orchestral, and solo settings.',
  'New works for today\u2019s performers.',
  'Concert music for the 21st century.',
  'Exploring the boundaries of acoustic music.',
  'Compositions shaped by craft and curiosity.',
  'Writing for instruments that breathe.',
  'Sound woven into story.',
  'Music at the crossroads of tradition and experiment.',
  'Crafting sound for the concert hall and beyond.',
  'Connecting performers and audiences through new music.',
  'Sonic explorations for acoustic instruments.',
  'Bringing new voices to the concert stage.',
  'Music drawn from gesture, texture, and space.',
  'Composing with intention, performing with passion.',
]

// ─── State ───────────────────────────────────────────────────────────────────

const STEP_STORAGE_KEY = 'setup-wizard-step'
const TOTAL_STEPS = 10

/** Per-step footer button configuration. */
interface StepFooterConfig {
  back: boolean
  next: string | null // null hides the footer entirely (e.g. Done step)
}

const STEP_FOOTER_CONFIG: StepFooterConfig[] = [
  { back: false, next: 'Next: Choose a theme' }, // 0: Identity
  { back: true, next: 'Next: Branding' }, // 1: Theme
  { back: true, next: 'Next: Homepage' }, // 2: Branding
  { back: true, next: 'Next: About page' }, // 3: Homepage
  { back: true, next: 'Next: Add a work' }, // 4: About
  { back: true, next: 'Next: Social links' }, // 5: Work
  { back: true, next: 'Next: Forms & gating' }, // 6: Social
  { back: true, next: 'Next: Deployment' }, // 7: Forms
  { back: true, next: 'Save & finish' }, // 8: Deploy
  { back: false, next: null }, // 9: Done
]

/** Restore the last-visited step from sessionStorage (survives HMR reloads). */
function getRestoredStep(): number {
  try {
    const stored = sessionStorage.getItem(STEP_STORAGE_KEY)
    if (stored !== null) {
      const parsed = Number(stored)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < TOTAL_STEPS) return parsed
    }
  } catch {
    // sessionStorage unavailable
  }
  return 0
}

function persistStep(index: number): void {
  try {
    sessionStorage.setItem(STEP_STORAGE_KEY, String(index))
  } catch {
    // sessionStorage unavailable
  }
}

let currentStep = getRestoredStep()
let isSaving = false
let selectedPresetId = ''
let selectedHeroId = ''

// File references for upload steps
let profileImageFile: File | null = null
let workThumbnailFile: File | null = null
let workAudioFile: File | null = null
let logoFile: File | null = null
let faviconFile: File | null = null
let socialPreviewFile: File | null = null
let workScoreFile: File | null = null

// ─── DOM references ──────────────────────────────────────────────────────────

function getWizardRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-wizard]')
  if (!el) throw new Error('Setup wizard container not found')
  return el
}

const wizard = getWizardRoot()

const tabs = Array.from(wizard.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
const panels = Array.from(wizard.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
const errorRegion = wizard.querySelector<HTMLElement>('[data-error-region]')

// ─── Data from server ────────────────────────────────────────────────────────

function parseJsonScript<T>(id: string): T {
  const el = document.getElementById(id)
  if (!el?.textContent) return [] as unknown as T
  return JSON.parse(el.textContent) as T
}

const presets: ThemePreset[] = parseJsonScript('setup-presets-data')

// Font catalog for live preview: font name → { cssFamily, googleCss2Family }
interface FontMeta {
  cssFamily: string
  googleCss2Family: string | null
}
const FONT_CATALOG: Record<string, FontMeta> = parseJsonScript('setup-font-data')

// Determine initially selected preset from the DOM
const initialPresetCard = wizard.querySelector<HTMLElement>('.setup-wizard__preset-card--selected')
if (initialPresetCard) {
  selectedPresetId = initialPresetCard.dataset.presetId ?? ''
}

// ─── Font live preview ──────────────────────────────────────────────────────

/** Google Font family params already loaded as <link> elements. */
const loadedGoogleFonts = new Set<string>()

function loadGoogleFont(fontName: string): void {
  const meta = FONT_CATALOG[fontName]
  if (!meta?.googleCss2Family) return
  if (loadedGoogleFonts.has(meta.googleCss2Family)) return

  loadedGoogleFonts.add(meta.googleCss2Family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${meta.googleCss2Family}&display=swap`
  document.head.appendChild(link)
}

function applyFontPreview(fontName: string, cssVar: string): void {
  const meta = FONT_CATALOG[fontName]
  if (!meta) return

  loadGoogleFont(fontName)
  document.documentElement.style.setProperty(cssVar, meta.cssFamily)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showError(message: string): void {
  if (!errorRegion) return
  errorRegion.textContent = message
  errorRegion.hidden = false

  // Scroll content area to top so the error is visible
  const content = wizard.querySelector<HTMLElement>('.setup-wizard__content')
  if (content) content.scrollTop = 0
}

function clearError(): void {
  if (!errorRegion) return
  errorRegion.textContent = ''
  errorRegion.hidden = true
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  btn.disabled = loading
  if (loading) {
    btn.dataset.originalText = btn.textContent ?? ''
    btn.textContent = 'Saving\u2026'
  } else {
    btn.textContent = btn.dataset.originalText ?? btn.textContent
    delete btn.dataset.originalText
  }
}

async function apiPost(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

async function uploadFile(file: File, dest: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`/api/dev/setup/upload?dest=${encodeURIComponent(dest)}`, {
    method: 'PUT',
    body: file,
  })
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

function getFileExtension(file: File): string {
  const name = file.name
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Tagline cycling ─────────────────────────────────────────────────────────

let taglineIndex = -1

/** Shuffled copy of TAGLINE_POOL so repeated "regenerate" clicks don't repeat. */
const shuffledTaglines = [...TAGLINE_POOL].sort(() => Math.random() - 0.5)

function nextTagline(): string {
  taglineIndex = (taglineIndex + 1) % shuffledTaglines.length
  return shuffledTaglines[taglineIndex]
}

function prefillTaglineIfEmpty(): void {
  const taglineField = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')
  if (!taglineField) return

  const current = taglineField.value.trim()
  // Only prefill if empty or still has placeholder-like content
  if (!current) {
    taglineField.value = nextTagline()
  }
}

// ─── Token secret generator ──────────────────────────────────────────────────

function generateTokenSecret(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

function prefillTokenSecretIfEmpty(): void {
  const secretField = wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')
  if (!secretField) return

  if (!secretField.value.trim()) {
    secretField.value = generateTokenSecret()
  }
}

// ─── Step navigation ─────────────────────────────────────────────────────────

function goToStep(index: number): void {
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

  currentStep = index
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

  // Focus management — focus heading or first interactive element
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
  if (index === 2) loadBrandingPreviews()       // Branding step
  if (index === 3) prefillTaglineIfEmpty()      // Homepage step
  if (index === 7) prefillTokenSecretIfEmpty()   // Forms step
}

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

// ─── Step handlers ───────────────────────────────────────────────────────────

async function handleIdentityNext(btn: HTMLButtonElement): Promise<boolean> {
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

async function handleThemeNext(btn: HTMLButtonElement): Promise<boolean> {
  // Theme is saved on click, so we just need to validate a preset is selected
  if (!selectedPresetId) {
    showError('Please select a theme preset.')
    return false
  }

  // Resolve font selections (fall back to preset defaults if unchanged)
  const fontHeading = wizard.querySelector<HTMLSelectElement>('#setup-font-heading')?.value ?? ''
  const fontBody = wizard.querySelector<HTMLSelectElement>('#setup-font-body')?.value ?? ''

  const preset = presets.find((p) => p.id === selectedPresetId)
  if (!preset) {
    showError('Selected preset not found.')
    return false
  }

  const resolvedFontBody = fontBody || preset.fontBody
  const resolvedFontHeading = fontHeading || preset.fontHeading

  // Detect font overrides — if fonts differ from preset, create a custom theme
  const fontsCustomized =
    resolvedFontBody !== preset.fontBody || resolvedFontHeading !== preset.fontHeading

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

async function handleBrandingNext(btn: HTMLButtonElement): Promise<boolean> {
  const logoModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-logo-mode"]:checked')
  const faviconModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-favicon-mode"]:checked')
  const socialModeRadio = document.querySelector<HTMLInputElement>('input[name="setup-social-mode"]:checked')

  const logoMode = logoModeRadio?.value || 'text'
  const faviconMode = faviconModeRadio?.value || 'generated'
  const socialPreviewMode = socialModeRadio?.value || 'generated'

  // Validate: custom mode requires a file upload
  if (logoMode === 'custom' && !logoFile) {
    showError('Please upload a logo image, or switch back to "Text" mode.')
    return false
  }
  if (faviconMode === 'custom' && !faviconFile) {
    showError('Please upload a favicon, or switch back to "Auto-generate".')
    return false
  }
  if (socialPreviewMode === 'custom' && !socialPreviewFile) {
    showError('Please upload a social preview image, or switch back to "Auto-generate".')
    return false
  }

  setButtonLoading(btn, true)

  try {
    // Upload custom logo if selected
    if (logoMode === 'custom' && logoFile) {
      const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'svg'
      const uploadResult = await uploadFile(logoFile, `branding/logo.${ext}`)
      if (!uploadResult.ok) {
        showError(uploadResult.error || 'Failed to upload logo.')
        return false
      }
    }

    // Upload custom favicon — use the correct filename based on actual file type.
    // The layout references both /favicon.svg and /favicon-96x96.png, so
    // saving with the right extension ensures the correct <link> tag works.
    if (faviconMode === 'custom' && faviconFile) {
      const faviconDest =
        faviconFile.type === 'image/svg+xml' ? 'branding/favicon.svg' : 'branding/favicon-96x96.png'
      const uploadResult = await uploadFile(faviconFile, faviconDest)
      if (!uploadResult.ok) {
        showError(uploadResult.error || 'Failed to upload favicon.')
        return false
      }
    }

    // Upload custom social preview if selected
    if (socialPreviewMode === 'custom' && socialPreviewFile) {
      const ext = socialPreviewFile.name.split('.').pop()?.toLowerCase() || 'png'
      const uploadResult = await uploadFile(socialPreviewFile, `branding/social-preview-image.${ext}`)
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
        faviconMode === 'custom' && faviconFile
          ? faviconFile.type === 'image/svg+xml'
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

async function handleHeroNext(btn: HTMLButtonElement): Promise<boolean> {
  setButtonLoading(btn, true)

  try {
    // Save hero preference if one was selected
    if (selectedHeroId) {
      const heroResult = await apiPost('/api/dev/hero-preference', {
        preferredHeroId: selectedHeroId,
        pageKey: 'home',
      })
      if (!heroResult.ok) {
        showError(heroResult.error ?? 'Failed to save hero preference.')
        return false
      }
    }

    // Collect all homepage fields
    const heroTagline = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')?.value.trim() ?? ''
    const heroTaglineAsBlockquote = wizard.querySelector<HTMLInputElement>('#setup-tagline-blockquote')?.checked ?? false
    const heroTaglineCitation = wizard.querySelector<HTMLInputElement>('#setup-tagline-citation')?.value.trim() ?? ''

    // Hero layout
    const heroLayout = wizard.querySelector<HTMLSelectElement>('#setup-hero-layout')?.value ?? 'columns'
    const heroImagePosition = wizard.querySelector<HTMLSelectElement>('#setup-hero-image-position')?.value ?? 'left'

    // CTA buttons
    const ctaListenVisible = wizard.querySelector<HTMLInputElement>('#setup-cta-listen')?.checked ?? true
    const ctaListenLabel = wizard.querySelector<HTMLInputElement>('#setup-cta-listen-text')?.value.trim() || 'Listen Now'
    const ctaSearchVisible = wizard.querySelector<HTMLInputElement>('#setup-cta-search')?.checked ?? true
    const ctaSearchLabel = wizard.querySelector<HTMLInputElement>('#setup-cta-search-text')?.value.trim() || 'Search Music'

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

async function handleAboutNext(btn: HTMLButtonElement): Promise<boolean> {
  const profileImageAlt = wizard.querySelector<HTMLInputElement>('#setup-profile-alt')?.value.trim() ?? ''
  const body = wizard.querySelector<HTMLTextAreaElement>('#setup-about-body')?.value.trim() ?? ''

  setButtonLoading(btn, true)
  try {
    // Upload profile image if selected
    if (profileImageFile) {
      const ext = getFileExtension(profileImageFile) || '.jpg'
      const uploadResult = await uploadFile(profileImageFile, `pages/about/profile${ext}`)
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

async function handleWorkNext(btn: HTMLButtonElement): Promise<boolean> {
  const title = wizard.querySelector<HTMLInputElement>('#setup-work-title')?.value.trim() ?? ''
  const subtitle = wizard.querySelector<HTMLInputElement>('#setup-work-subtitle')?.value.trim() ?? ''
  const description = wizard.querySelector<HTMLTextAreaElement>('#setup-work-description')?.value.trim() ?? ''
  const instrumentationRaw =
    wizard.querySelector<HTMLInputElement>('#setup-work-instrumentation')?.value.trim() ?? ''
  const youtubeUrl = wizard.querySelector<HTMLInputElement>('#setup-work-youtube')?.value.trim() ?? ''
  const sheetMusicUrl =
    wizard.querySelector<HTMLInputElement>('#setup-work-sheetmusic-url')?.value.trim() ?? ''
  const addFirstWork =
    wizard.querySelector<HTMLInputElement>('#setup-add-first-work')?.checked ?? true
  const includeStarters =
    wizard.querySelector<HTMLInputElement>('#setup-include-starters')?.checked ?? true

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
  if (!workThumbnailFile) {
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
    if (workThumbnailFile) {
      const thumbExt = getFileExtension(workThumbnailFile) || '.jpg'
      const thumbResult = await uploadFile(workThumbnailFile, `works/${slug}/thumbnail${thumbExt}`)
      if (!thumbResult.ok) {
        showError(thumbResult.error ?? 'Failed to upload thumbnail.')
        return false
      }
    }

    // Upload audio if provided
    let hasRecording = false
    let recordingFolder = ''
    if (workAudioFile) {
      const audioExt = getFileExtension(workAudioFile) || '.wav'
      recordingFolder = `recording-${new Date().getFullYear()}`
      const audioResult = await uploadFile(
        workAudioFile,
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
    if (workScoreFile) {
      const scoreResult = await uploadFile(workScoreFile, `works/${slug}/score.pdf`)
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

async function handleSocialNext(btn: HTMLButtonElement): Promise<boolean> {
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

async function handleFormsNext(btn: HTMLButtonElement): Promise<boolean> {
  const contactFormEnabled = wizard.querySelector<HTMLInputElement>('#setup-contact-form-enabled')?.checked ?? false
  const contactWebhookUrl = wizard.querySelector<HTMLInputElement>('#setup-contact-webhook')?.value.trim() ?? ''
  const perusalGatingEnabled = wizard.querySelector<HTMLInputElement>('#setup-perusal-gating-enabled')?.checked ?? false
  const perusalWebhookUrl = wizard.querySelector<HTMLInputElement>('#setup-perusal-webhook')?.value.trim() ?? ''
  const perusalTokenSecret = wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')?.value.trim() ?? ''
  const perusalExpirationValue = wizard.querySelector<HTMLInputElement>('#setup-perusal-expiration')?.value ?? '90'
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

async function handleDeployNext(btn: HTMLButtonElement): Promise<boolean> {
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

/**
 * Run the finalize pipeline and show the Done step.
 * Called when advancing to the final step (step 8 = Done), whether via
 * the "Save & finish" button or "Skip for now".
 */
async function runFinalizeAndShowDone(): Promise<void> {
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

    try { sessionStorage.removeItem(STEP_STORAGE_KEY) } catch { /* ignore */ }

    // Try to auto-close the wizard tab once the dev server is up on port 4321.
    // Poll until the server responds, then open the site and close this tab.
    tryAutoCloseWizardTab()
  } else {
    // Astro mode: fire-and-forget — pipeline runs in background
    apiPost('/api/dev/setup/finalize', {}).catch(() => {
      // Ingest failure is non-blocking — user can always run `npm run dev:full` manually
    })
  }
}

// ─── Event: Next / Back buttons ───────────────────────────────────────────────

wizard.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement
  const btn = target.closest<HTMLButtonElement>('[data-action]')
  if (!btn || isSaving) return

  const action = btn.dataset.action

  if (action === 'back') {
    goToStep(currentStep - 1)
    return
  }

  if (action === 'next') {
    isSaving = true
    clearError()

    // Optimistically persist the *next* step before the API call.
    // Writing YAML triggers Vite HMR which reloads the page — if the
    // reload wins the race against goToStep(), sessionStorage would
    // still point to the old step. Persisting early fixes that.
    const nextStep = currentStep + 1
    persistStep(nextStep)

    let success = false
    switch (currentStep) {
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

    isSaving = false

    if (success) {
      // When entering the Done step, run the works ingest pipeline
      if (nextStep === TOTAL_STEPS - 1) {
        await runFinalizeAndShowDone()
        return
      }
      goToStep(nextStep)
    } else {
      // Revert the optimistic persist on failure
      persistStep(currentStep)
    }
  }
})

// ─── Event: Tab clicks ──────────────────────────────────────────────────────

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const index = Number(tab.dataset.stepIndex)
    if (!Number.isNaN(index) && index <= currentStep) {
      goToStep(index)
    }
  })
})

// ─── Event: Tab keyboard navigation (arrow keys) ────────────────────────────

wizard.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
  const e = event as KeyboardEvent
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const direction = e.key === 'ArrowRight' ? 1 : -1
    const nextIndex = Math.max(0, Math.min(currentStep, currentStep + direction))
    if (nextIndex !== currentStep && tabs[nextIndex] && !tabs[nextIndex].disabled) {
      goToStep(nextIndex)
      tabs[nextIndex].focus()
    }
  }
})

// ─── Event: Theme preset selection ───────────────────────────────────────────

wizard.querySelector('.setup-wizard__preset-grid')?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const card = target.closest<HTMLButtonElement>('.setup-wizard__preset-card')
  if (!card) return

  const presetId = card.dataset.presetId ?? ''
  const preset = presets.find((p) => p.id === presetId)
  if (!preset) return

  selectedPresetId = presetId

  // Update selected state
  wizard.querySelectorAll('.setup-wizard__preset-card').forEach((c) => {
    c.classList.remove('setup-wizard__preset-card--selected')
    c.setAttribute('aria-checked', 'false')
  })
  card.classList.add('setup-wizard__preset-card--selected')
  card.setAttribute('aria-checked', 'true')

  // Live preview — inject CSS custom properties
  const root = document.documentElement
  Object.entries(preset.colors).forEach(([key, value]) => {
    // Convert camelCase to CSS var names: colorBackground → --bg
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

  // Live preview — fonts
  applyFontPreview(preset.fontHeading, '--font-heading')
  applyFontPreview(preset.fontBody, '--font-body')

  // Sync font selects to the preset's defaults
  const headingSelect = wizard.querySelector<HTMLSelectElement>('#setup-font-heading')
  const bodySelect = wizard.querySelector<HTMLSelectElement>('#setup-font-body')
  if (headingSelect) headingSelect.value = preset.fontHeading
  if (bodySelect) bodySelect.value = preset.fontBody
})

// ─── Event: Font select change → live preview ──────────────────────────────

wizard.querySelector<HTMLSelectElement>('#setup-font-heading')?.addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement
  applyFontPreview(select.value, '--font-heading')
})

wizard.querySelector<HTMLSelectElement>('#setup-font-body')?.addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement
  applyFontPreview(select.value, '--font-body')
})

// ─── Event: Hero image selection ─────────────────────────────────────────────

wizard.querySelector('.setup-wizard__hero-grid')?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const card = target.closest<HTMLButtonElement>('.setup-wizard__hero-card')
  if (!card) return

  selectedHeroId = card.dataset.heroId ?? ''

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
  profileImageFile = file
})
setupFileInput('setup-work-thumbnail', (file) => {
  workThumbnailFile = file
})
setupFileInput('setup-work-audio', (file) => {
  workAudioFile = file
})
setupFileInput('setup-work-score', (file) => {
  workScoreFile = file
})
setupFileInput('setup-logo-file', (file) => {
  logoFile = file
})
setupFileInput('setup-favicon-file', (file) => {
  faviconFile = file
})
setupFileInput('setup-social-file', (file) => {
  socialPreviewFile = file
})

// ─── Event: Branding radio toggles ───────────────────────────────────────────

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

// ─── Event: Identity auto-suggest title ──────────────────────────────────────

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

// ─── Text logo preview (Branding step) ──────────────────────────────────────

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

// ─── Event: Social toggle enables/disables URL input ─────────────────────────

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

// ─── Event: Work toggle shows/hides optional work sections ────────────────────

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

// ─── Event: Tagline blockquote toggle shows/hides citation ───────────────────

const blockquoteToggle = wizard.querySelector<HTMLInputElement>('#setup-tagline-blockquote')
const citationField = wizard.querySelector<HTMLElement>('[data-citation-field]')

function syncCitationVisibility(): void {
  if (!citationField || !blockquoteToggle) return
  citationField.hidden = !blockquoteToggle.checked
}

blockquoteToggle?.addEventListener('change', syncCitationVisibility)

// ─── Event: Hero layout mode → conditional image position field ──────────────

const heroLayoutSelect = wizard.querySelector<HTMLSelectElement>('#setup-hero-layout')
const imagePositionField = wizard.querySelector<HTMLElement>('[data-hero-image-position-field]')

function syncImagePositionVisibility(): void {
  if (!imagePositionField || !heroLayoutSelect) return
  imagePositionField.hidden = heroLayoutSelect.value !== 'columns'
}

heroLayoutSelect?.addEventListener('change', syncImagePositionVisibility)
syncImagePositionVisibility()

// ─── Event: CTA button toggles → conditional label inputs ────────────────────

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

// ─── Event: Contact form toggle shows/hides details ──────────────────────────

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

// ─── Event: Perusal gating toggle shows/hides details ────────────────────────

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

// ─── Event: Markdown toolbar for bio textarea ────────────────────────────────

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
    bioTextarea.value =
      bioTextarea.value.substring(0, start) + insertion + bioTextarea.value.substring(end)
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

// ─── Event: Tagline regenerate button ─────────────────────────────────────────

wizard.querySelector<HTMLButtonElement>('[data-tagline-regenerate]')?.addEventListener('click', () => {
  const taglineField = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')
  if (taglineField) {
    taglineField.value = nextTagline()
    taglineField.focus()
  }
})

// ─── Event: Token secret regenerate button ────────────────────────────────────

wizard.querySelector<HTMLButtonElement>('[data-token-regenerate]')?.addEventListener('click', () => {
  const secretField = wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')
  if (secretField) {
    secretField.value = generateTokenSecret()
    secretField.focus()
  }
})

// ─── Auto-close wizard tab when dev server is ready ──────────────────────────

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
      // Server not up yet — keep polling
    }
  }, 1000)
}

// ─── Event: Done step links clear storage on navigation ─────────────────────

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

// ─── OS-specific deploy instructions ──────────────────────────────────────────

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

// ─── Initialize: restore saved step ──────────────────────────────────────────

goToStep(currentStep)
