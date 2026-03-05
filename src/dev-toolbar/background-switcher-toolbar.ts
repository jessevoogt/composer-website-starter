import { defineToolbarApp } from 'astro/toolbar'
import { focusElement } from '../scripts/focus-policy'

const HERO_VARIANT_EVENT_NAME = 'jv:immersive:hero-variant:set'
const HERO_PREFERRED_API_PATH = '/api/dev/hero-preference'
const FALLBACK_VARIANT_ID = 'hall'
const HERO_PAGE_DATA_SCRIPT_IDS = ['site-hero-switcher-page-data', 'immersive-page-data']
const NONE_VARIANT_ID = '__none__'
const NONE_VARIANT_LABEL = 'No background'
const USE_DEFAULT_VARIANT_ID = '__use-default__'

type HeroPreferencePageKey =
  | 'home'
  | 'contact'
  | 'about'
  | 'music'
  | 'music-browse'
  | 'music-browse-tag'
  | 'work-detail'
  | 'not-found'
  | 'accessibility-statement'
  | 'sitemap'
  | 'perusal-access-granted'
  | 'perusal-thank-you'
  | 'contact-thank-you'

type WorkDetailScope = 'this-work' | 'all-work-pages'

const VALID_PAGE_KEYS: ReadonlySet<string> = new Set<HeroPreferencePageKey>([
  'home',
  'contact',
  'about',
  'music',
  'music-browse',
  'music-browse-tag',
  'work-detail',
  'not-found',
  'accessibility-statement',
  'sitemap',
  'perusal-access-granted',
  'perusal-thank-you',
  'contact-thank-you',
])

interface HeroVariantOption {
  id: string
  label: string
  src: string
  position: string
  filter: string
}

interface PersistPreferredHeroOptions {
  scope?: WorkDetailScope
  workSlug?: string
}

function humanizeHeroId(heroId: string): string {
  const words = heroId
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
  return words.join(' ') || FALLBACK_VARIANT_ID
}

function normalizePageKey(value: unknown): HeroPreferencePageKey | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (VALID_PAGE_KEYS.has(normalized)) {
    return normalized as HeroPreferencePageKey
  }
  return null
}

function readHeroPageDataRecord(): Record<string, unknown> | null {
  for (const scriptId of HERO_PAGE_DATA_SCRIPT_IDS) {
    const script = document.getElementById(scriptId)
    if (!script?.textContent) continue

    try {
      const parsed = JSON.parse(script.textContent)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      continue
    }
  }

  return null
}

function readHeroVariantsFromPage(): HeroVariantOption[] {
  const pageData = readHeroPageDataRecord()
  if (!pageData || !Array.isArray(pageData.heroVariants)) return []

  const variants: HeroVariantOption[] = []
  for (const item of pageData.heroVariants) {
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || variants.some((variant) => variant.id === id)) continue

    const label =
      typeof record.label === 'string' && record.label.trim().length > 0 ? record.label.trim() : humanizeHeroId(id)
    const src = typeof record.src === 'string' ? record.src.trim() : ''
    const position =
      typeof record.position === 'string' && record.position.trim().length > 0 ? record.position.trim() : '50% 50%'
    const filter = typeof record.filter === 'string' ? record.filter.trim() : ''

    variants.push({ id, label, src, position, filter })
  }

  return variants
}

function readPageKeyFromDom(): HeroPreferencePageKey | null {
  const mainContent = document.querySelector<HTMLElement>('main[data-page-hero-page]')
  if (mainContent) {
    return normalizePageKey(mainContent.getAttribute('data-page-hero-page'))
  }

  const immersiveRoot = document.querySelector<HTMLElement>('[data-immersive-root][data-page-hero-page]')
  if (immersiveRoot) {
    return normalizePageKey(immersiveRoot.getAttribute('data-page-hero-page'))
  }

  const bodyPage = document.body?.dataset?.page
  if (bodyPage === 'home') return 'home'

  return null
}

function readHeroPreferencePageKey(): HeroPreferencePageKey | null {
  const pageKeyFromDom = readPageKeyFromDom()
  if (pageKeyFromDom) return pageKeyFromDom

  const pageData = readHeroPageDataRecord()
  return normalizePageKey(pageData?.pageKey)
}

function readCurrentWorkDetailSlugFromPath(): string {
  const segments = window.location.pathname.split('/').filter(Boolean)
  if (segments.length !== 2 || segments[0] !== 'music') return ''
  return decodeURIComponent(segments[1]).trim()
}

function readPageDefaultHeroId(): string {
  const pageData = readHeroPageDataRecord()
  return typeof pageData?.pageDefaultHeroId === 'string' ? pageData.pageDefaultHeroId.trim() : ''
}

function readActivePageVariant(pageKey: HeroPreferencePageKey | null): string | null {
  if (pageKey === 'home') {
    const immersiveRoot = document.querySelector<HTMLElement>('[data-immersive-root]')
    if (immersiveRoot) {
      const active = immersiveRoot.getAttribute('data-active-hero')
      if (active && active.trim().length > 0) return active.trim()
    }
  }

  const mainContent = document.querySelector<HTMLElement>('main[data-page-hero-id]')
  if (mainContent) {
    const heroId = mainContent.getAttribute('data-page-hero-id')
    if (heroId && heroId.trim().length > 0) return heroId.trim()
  }

  return null
}

function canDisableHero(pageKey: HeroPreferencePageKey | null): boolean {
  return pageKey !== 'home'
}

export default defineToolbarApp({
  init(canvas, app) {
    const windowElement = document.createElement('astro-dev-toolbar-window')
    windowElement.innerHTML = `
      <style>
        :host astro-dev-toolbar-window {
          color-scheme: dark;
          min-height: 172px;
        }
        h1 {
          margin: 0 0 0.4rem;
          font-size: 1.05rem;
          color: #fff;
          font-weight: 600;
        }
        p {
          margin: 0 0 0.9rem;
          color: #c8d4de;
          line-height: 1.4;
          font-size: 0.9rem;
        }
        [hidden] {
          display: none !important;
        }
        label,
        .helper {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          color: #fff;
          font-size: 0.92rem;
        }
        .helper {
          margin-top: 0.7rem;
          color: #9eb3c2;
          font-size: 0.8rem;
          line-height: 1.3;
          justify-content: flex-start;
        }
        [data-scope-row] {
          margin-bottom: 0.65rem;
        }
      </style>
      <h1 data-title>Background Switcher</h1>
      <p data-description>Select the background image for this page.</p>
      <label data-scope-row hidden>
        <span data-scope-label>Scope</span>
      </label>
      <label data-select-row>
        <span data-select-label>Active background</span>
      </label>
      <p class="helper" data-helper></p>
    `

    const titleElement = windowElement.querySelector<HTMLElement>('[data-title]')!
    const descriptionElement = windowElement.querySelector<HTMLElement>('[data-description]')!
    const scopeLabelElement = windowElement.querySelector<HTMLElement>('[data-scope-label]')!
    const selectLabelElement = windowElement.querySelector<HTMLElement>('[data-select-label]')!
    const helperElement = windowElement.querySelector<HTMLElement>('[data-helper]')!
    const scopeRow = windowElement.querySelector<HTMLElement>('[data-scope-row]')!
    const scopeSelect = document.createElement('astro-dev-toolbar-select') as HTMLElement & { element: HTMLSelectElement }

    const row = windowElement.querySelector('[data-select-row]')
    const select = document.createElement('astro-dev-toolbar-select') as HTMLElement & { element: HTMLSelectElement }
    let currentVariants: HeroVariantOption[] = []
    let defaultVariantId = FALLBACK_VARIANT_ID
    let currentPageKey: HeroPreferencePageKey | null = null
    let currentWorkSlug = ''
    let currentPageDefaultHeroId = ''
    let currentScope: WorkDetailScope = 'this-work'
    let isAppOpen = false
    let outsideClickListenerTimer: number | null = null

    const isWorkDetailWithSlug = (): boolean => currentPageKey === 'work-detail' && currentWorkSlug.length > 0

    const isKnownVariantId = (value: string): boolean => currentVariants.some((variant) => variant.id === value)

    const findVariantById = (value: string): HeroVariantOption | null =>
      currentVariants.find((variant) => variant.id === value) ?? null

    const populateScopeOptions = (): void => {
      scopeSelect.element.options.length = 0

      const scopeOptions: Array<{ value: WorkDetailScope; label: string }> = [
        { value: 'this-work', label: 'This work' },
        { value: 'all-work-pages', label: 'All work pages' },
      ]

      scopeOptions.forEach(({ value, label }) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        scopeSelect.element.add(option)
      })
    }

    const buildSpecialOptions = (
      variants: HeroVariantOption[],
      pageKey: HeroPreferencePageKey | null,
    ): HeroVariantOption[] => {
      const result: HeroVariantOption[] = []

      // "Use page default" option — only when scope is this-work and there's a page default
      if (isWorkDetailWithSlug() && currentScope === 'this-work' && currentPageDefaultHeroId) {
        const defaultLabel = `Use page default (${humanizeHeroId(currentPageDefaultHeroId)})`
        result.push({
          id: USE_DEFAULT_VARIANT_ID,
          label: defaultLabel,
          src: '',
          position: '50% 50%',
          filter: '',
        })
      }

      // "No background" option — all non-home pages
      if (canDisableHero(pageKey)) {
        result.push({
          id: NONE_VARIANT_ID,
          label: NONE_VARIANT_LABEL,
          src: '',
          position: '50% 50%',
          filter: '',
        })
      }

      const withoutSpecial = variants.filter(
        (variant) => variant.id !== NONE_VARIANT_ID && variant.id !== USE_DEFAULT_VARIANT_ID,
      )
      return [...result, ...withoutSpecial]
    }

    const clearLocalHero = (): void => {
      const pageMain = document.querySelector<HTMLElement>('main#main-content')
      if (!pageMain) return

      pageMain.classList.remove('page-content-with-hero')
      pageMain.style.removeProperty('--page-hero-image')
      pageMain.style.removeProperty('--page-hero-position')
      pageMain.style.removeProperty('--page-hero-filter')
      pageMain.removeAttribute('data-page-hero-id')
    }

    const applyVariantLocally = (variant: HeroVariantOption): void => {
      if (currentPageKey === 'home') {
        // Dispatch custom event for homepage immersive hero system
        window.dispatchEvent(new CustomEvent(HERO_VARIANT_EVENT_NAME, { detail: { heroId: variant.id } }))
        return
      }

      const pageMain = document.querySelector<HTMLElement>('main#main-content')
      if (!pageMain || !variant.src) return

      pageMain.classList.add('page-content-with-hero')
      pageMain.style.setProperty('--page-hero-image', `url("${variant.src}")`)
      pageMain.style.setProperty('--page-hero-position', variant.position || '50% 50%')
      pageMain.style.setProperty('--page-hero-filter', variant.filter || 'none')
      pageMain.setAttribute('data-page-hero-id', variant.id)
    }

    const persistPreferredHero = async (
      heroId: string,
      pageKey: HeroPreferencePageKey,
      options: PersistPreferredHeroOptions = {},
    ): Promise<void> => {
      try {
        const payload: Record<string, string> = { preferredHeroId: heroId, pageKey }
        if (pageKey === 'work-detail' && options.scope) payload.scope = options.scope
        if (options.workSlug) payload.workSlug = options.workSlug
        const response = await fetch(HERO_PREFERRED_API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          console.warn(`Failed to persist preferred hero: HTTP ${response.status}`)
        }
      } catch (error) {
        console.warn(`Failed to persist preferred hero in ${pageKey} config.`, error)
      }
    }

    const writeVariant = (heroId: string): void => {
      // "Use page default" — clear per-work override (write empty string to work YAML)
      if (heroId === USE_DEFAULT_VARIANT_ID && isWorkDetailWithSlug()) {
        // Apply the page default locally so the user sees the change
        const defaultVariant = findVariantById(currentPageDefaultHeroId)
        if (defaultVariant) {
          applyVariantLocally(defaultVariant)
        } else if (currentPageDefaultHeroId) {
          // Variant data not in list but we know the ID — let the reload handle it
        }
        void persistPreferredHero('', 'work-detail', { scope: 'this-work', workSlug: currentWorkSlug })
        return
      }

      // "No background"
      if (heroId === NONE_VARIANT_ID && canDisableHero(currentPageKey)) {
        clearLocalHero()
        if (currentPageKey) {
          const options = isWorkDetailWithSlug() ? { scope: currentScope, workSlug: currentWorkSlug } : undefined
          void persistPreferredHero('', currentPageKey, options)
        }
        return
      }

      const variant = findVariantById(heroId)
      if (!variant) return
      applyVariantLocally(variant)
      if (currentPageKey) {
        const options = isWorkDetailWithSlug() ? { scope: currentScope, workSlug: currentWorkSlug } : undefined
        void persistPreferredHero(heroId, currentPageKey, options)
      }
    }

    const populateSelectOptions = (): void => {
      select.element.options.length = 0
      currentVariants.forEach((variant) => {
        const option = document.createElement('option')
        option.value = variant.id
        option.textContent = variant.label
        select.element.add(option)
      })
    }

    const syncSelectValue = (requestedId?: string | null): void => {
      const fromPage = readActivePageVariant(currentPageKey)
      const fromRequested = requestedId && isKnownVariantId(requestedId) ? requestedId : null

      // On work-detail "this-work" scope: if the active hero matches the page default,
      // that means there's no per-work override — show "Use page default"
      if (
        isWorkDetailWithSlug() &&
        currentScope === 'this-work' &&
        currentPageDefaultHeroId &&
        fromPage === currentPageDefaultHeroId &&
        isKnownVariantId(USE_DEFAULT_VARIANT_ID)
      ) {
        select.element.value = USE_DEFAULT_VARIANT_ID
        return
      }

      const resolvedId =
        fromRequested ??
        fromPage ??
        (canDisableHero(currentPageKey) && isKnownVariantId(NONE_VARIANT_ID) ? NONE_VARIANT_ID : defaultVariantId)
      select.element.value = isKnownVariantId(resolvedId) ? resolvedId : defaultVariantId
    }

    const updateLabels = (): void => {
      const isHome = currentPageKey === 'home'
      titleElement.textContent = isHome ? 'Hero Switcher' : 'Background Switcher'
      descriptionElement.textContent = isHome
        ? 'Select the hero image for this page.'
        : 'Select the background image for this page.'
      selectLabelElement.textContent = isHome ? 'Active hero' : 'Active background'

      // Show scope selector on work-detail pages with a work slug
      if (isWorkDetailWithSlug()) {
        scopeRow.hidden = false
        scopeSelect.element.value = currentScope
        helperElement.textContent =
          currentScope === 'this-work'
            ? 'Changes apply only to this work.'
            : 'Changes apply to all work detail pages.'
      } else {
        scopeRow.hidden = true
        if (!currentPageKey) {
          helperElement.textContent = 'Background changes on this page are preview-only.'
        } else {
          helperElement.textContent = ''
        }
      }
    }

    const refreshVariants = (requestedId?: string | null): void => {
      currentPageKey = readHeroPreferencePageKey()
      currentWorkSlug = currentPageKey === 'work-detail' ? readCurrentWorkDetailSlugFromPath() : ''
      currentPageDefaultHeroId = readPageDefaultHeroId()

      const parsedVariants = readHeroVariantsFromPage()
      const activePageVariant = readActivePageVariant(currentPageKey)
      const previousVariants = currentVariants.filter(
        (variant) => variant.id !== NONE_VARIANT_ID && variant.id !== USE_DEFAULT_VARIANT_ID,
      )
      let nextVariants = parsedVariants.length > 0 ? parsedVariants : previousVariants

      if (activePageVariant && !nextVariants.some((variant) => variant.id === activePageVariant)) {
        nextVariants.unshift({
          id: activePageVariant,
          label: humanizeHeroId(activePageVariant),
          src: '',
          position: '50% 50%',
          filter: '',
        })
      }

      if (nextVariants.length === 0) {
        nextVariants = [
          {
            id: FALLBACK_VARIANT_ID,
            label: humanizeHeroId(FALLBACK_VARIANT_ID),
            src: '',
            position: '50% 50%',
            filter: '',
          },
        ]
      }

      currentVariants = buildSpecialOptions(nextVariants, currentPageKey)
      defaultVariantId = currentVariants.find((v) => v.id !== NONE_VARIANT_ID && v.id !== USE_DEFAULT_VARIANT_ID)?.id ?? FALLBACK_VARIANT_ID
      populateSelectOptions()
      syncSelectValue(requestedId)
      updateLabels()
    }

    const onSelectChange = (): void => {
      const selectedId = select.element.value
      if (!isKnownVariantId(selectedId)) return
      writeVariant(selectedId)
    }

    const onScopeChange = (): void => {
      currentScope = scopeSelect.element.value as WorkDetailScope
      refreshVariants()
    }

    // Re-attach the window element to the canvas if the framework cleared it
    // during a View Transitions page swap (Astro clears canvas shadow roots on
    // soft navigation for some toolbar apps).
    const ensureAttached = (): void => {
      if (!windowElement.isConnected) {
        canvas.append(windowElement)
      }
    }

    const stopListeningForOutsideClicks = (): void => {
      if (outsideClickListenerTimer !== null) {
        window.clearTimeout(outsideClickListenerTimer)
        outsideClickListenerTimer = null
      }
      document.removeEventListener('click', onDocumentClick)
    }

    const onDocumentClick = (event: MouseEvent): void => {
      if (!isAppOpen) return
      if (event.composedPath().includes(windowElement)) return
      app.toggleState({ state: false })
    }

    const startListeningForOutsideClicks = (): void => {
      stopListeningForOutsideClicks()
      outsideClickListenerTimer = window.setTimeout(() => {
        outsideClickListenerTimer = null
        if (!isAppOpen) return
        document.addEventListener('click', onDocumentClick)
      }, 0)
    }

    scopeLabelElement.id = 'background-switcher-scope-label'
    selectLabelElement.id = 'background-switcher-active-background-label'
    scopeSelect.element.setAttribute('aria-labelledby', scopeLabelElement.id)
    select.element.setAttribute('aria-labelledby', selectLabelElement.id)
    populateScopeOptions()

    select.element.addEventListener('change', onSelectChange)
    scopeSelect.element.addEventListener('change', onScopeChange)
    refreshVariants()

    const onAppToggled = ({ state }: { state: boolean }): void => {
      isAppOpen = state
      if (state) {
        ensureAttached()
        refreshVariants()
        startListeningForOutsideClicks()
        window.requestAnimationFrame(() => {
          focusElement(select.element)
        })
      } else {
        stopListeningForOutsideClicks()
      }
    }

    const onAfterSwap = (): void => {
      ensureAttached()
      refreshVariants()
    }
    const onPageLoad = (): void => {
      ensureAttached()
      refreshVariants()
    }

    app.onToggled(onAppToggled)
    document.addEventListener('astro:after-swap', onAfterSwap)
    document.addEventListener('astro:page-load', onPageLoad)

    scopeRow?.append(scopeSelect)
    row?.append(select)
    canvas.append(windowElement)
  },
})
