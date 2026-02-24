import { defineToolbarApp } from 'astro/toolbar'
import { focusElement } from '../scripts/focus-policy'

const HERO_VARIANT_EVENT_NAME = 'jv:immersive:hero-variant:set'
const HERO_PREFERRED_API_PATH = '/api/dev/homepage/preferred-hero'
const KEYSTATIC_PORT = '4322'
const FALLBACK_VARIANT_ID = 'hall'
const FALLBACK_PAGE_KEY = 'preview'
const HERO_PAGE_DATA_SCRIPT_IDS = ['immersive-page-data', 'hero-switcher-page-data', 'site-hero-switcher-page-data']
const NONE_VARIANT_ID = '__none__'
const NONE_VARIANT_LABEL = 'No background'

type HeroPreferencePageKey = 'home' | 'contact' | 'works' | 'about' | 'preview'

interface HeroVariantOption {
  id: string
  label: string
  src: string
  position: string
  filter: string
}

function humanizeHeroId(heroId: string): string {
  const words = heroId
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
  return words.join(' ') || FALLBACK_VARIANT_ID
}

function normalizePageKey(value: unknown): HeroPreferencePageKey {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (
    normalized === 'contact' ||
    normalized === 'works' ||
    normalized === 'about' ||
    normalized === 'home' ||
    normalized === 'preview'
  ) {
    return normalized
  }
  return FALLBACK_PAGE_KEY
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
      typeof record.label === 'string' && record.label.trim().length > 0
        ? record.label.trim()
        : humanizeHeroId(id)
    const src = typeof record.src === 'string' ? record.src.trim() : ''
    const position = typeof record.position === 'string' && record.position.trim().length > 0
      ? record.position.trim()
      : '50% 50%'
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
  const htmlPage = document.documentElement?.dataset?.page
  if (htmlPage === 'home') return 'home'

  return null
}

function readHeroHostElement(pageKey: HeroPreferencePageKey): HTMLElement | null {
  if (pageKey === 'home') {
    const immersiveRoot = document.querySelector<HTMLElement>('[data-immersive-root][data-page-hero-page="home"]')
    if (immersiveRoot) return immersiveRoot
  } else {
    const mainContent = document.querySelector<HTMLElement>(`main[data-page-hero-page="${pageKey}"]`)
    if (mainContent) return mainContent
  }

  const anyMainContent = document.querySelector<HTMLElement>('main[data-page-hero-page]')
  if (anyMainContent) return anyMainContent

  const anyImmersiveRoot = document.querySelector<HTMLElement>('[data-immersive-root][data-page-hero-page]')
  return anyImmersiveRoot
}

function readActivePageVariant(pageKey: HeroPreferencePageKey): string | null {
  const heroHost = readHeroHostElement(pageKey)
  if (!heroHost) return null

  const candidates = [heroHost.getAttribute('data-active-hero'), heroHost.getAttribute('data-page-hero-id')]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

function readHeroPreferencePageKey(): HeroPreferencePageKey {
  const pageKeyFromDom = readPageKeyFromDom()
  if (pageKeyFromDom) {
    return pageKeyFromDom
  }

  const pageData = readHeroPageDataRecord()
  return normalizePageKey(pageData?.pageKey)
}

function canDisableHero(pageKey: HeroPreferencePageKey): boolean {
  return pageKey !== 'home'
}

function canPersistHeroPreference(pageKey: HeroPreferencePageKey): boolean {
  return pageKey === 'home' || pageKey === 'contact' || pageKey === 'works' || pageKey === 'about'
}

function getPreferredHeroApiUrls(): string[] {
  const urls: string[] = []
  const currentOriginUrl = new URL(HERO_PREFERRED_API_PATH, window.location.origin).toString()
  urls.push(currentOriginUrl)

  const host = window.location.hostname || 'localhost'
  const keystaticUrl = `${window.location.protocol}//${host}:${KEYSTATIC_PORT}${HERO_PREFERRED_API_PATH}`
  if (!urls.includes(keystaticUrl)) {
    urls.push(keystaticUrl)
  }

  return urls
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
      </style>
      <h1>Hero Switcher</h1>
      <p>Select the hero image for this page.</p>
      <label data-select-row>
        <span>Active hero</span>
      </label>
      <p class="helper">Click outside this panel to close it.</p>
    `

    const row = windowElement.querySelector('[data-select-row]')
    const select = document.createElement('astro-dev-toolbar-select') as HTMLElement & { element: HTMLSelectElement }
    let currentVariants: HeroVariantOption[] = []
    let defaultVariantId = FALLBACK_VARIANT_ID
    let currentPageKey: HeroPreferencePageKey = FALLBACK_PAGE_KEY

    const isKnownVariantId = (value: string): boolean =>
      currentVariants.some((variant) => variant.id === value)
    const findVariantById = (value: string): HeroVariantOption | null =>
      currentVariants.find((variant) => variant.id === value) ?? null
    const withNoBackgroundOption = (variants: HeroVariantOption[], pageKey: HeroPreferencePageKey): HeroVariantOption[] => {
      if (!canDisableHero(pageKey)) return variants
      const withoutNone = variants.filter((variant) => variant.id !== NONE_VARIANT_ID)
      return [
        { id: NONE_VARIANT_ID, label: NONE_VARIANT_LABEL, src: '', position: '50% 50%', filter: '' },
        ...withoutNone,
      ]
    }

    const clearLocalHero = (): void => {
      const heroHost = readHeroHostElement(currentPageKey)
      if (heroHost) {
        heroHost.removeAttribute('data-active-hero')
        if (heroHost.hasAttribute('data-page-hero-id')) {
          heroHost.removeAttribute('data-page-hero-id')
        }
      }

      const pageMain = document.querySelector<HTMLElement>(`main[data-page-hero-page="${currentPageKey}"]`)
      if (!pageMain) return

      pageMain.classList.remove('page-content-with-hero')
      pageMain.style.removeProperty('--page-hero-image')
      pageMain.style.removeProperty('--page-hero-position')
      pageMain.style.removeProperty('--page-hero-filter')
      pageMain.removeAttribute('data-page-hero-id')
      pageMain.removeAttribute('data-active-hero')
    }

    const applyVariantLocally = (variant: HeroVariantOption): void => {
      const heroHost = readHeroHostElement(currentPageKey)
      if (heroHost) {
        heroHost.setAttribute('data-active-hero', variant.id)
        if (heroHost.hasAttribute('data-page-hero-id')) {
          heroHost.setAttribute('data-page-hero-id', variant.id)
        }
      }

      const pageMain = document.querySelector<HTMLElement>(`main[data-page-hero-page="${currentPageKey}"]`)
      if (!pageMain || !variant.src) return

      pageMain.classList.add('page-content-with-hero')
      pageMain.style.setProperty('--page-hero-image', `url("${variant.src}")`)
      pageMain.style.setProperty('--page-hero-position', variant.position || '50% 50%')
      pageMain.style.setProperty('--page-hero-filter', variant.filter || 'none')
      pageMain.setAttribute('data-page-hero-id', variant.id)
      pageMain.setAttribute('data-active-hero', variant.id)
    }

    const dispatchVariant = (heroId: string) => {
      if (!isKnownVariantId(heroId)) return
      window.dispatchEvent(
        new CustomEvent(HERO_VARIANT_EVENT_NAME, {
          detail: { heroId },
        }),
      )
    }

    const writeVariant = (heroId: string) => {
      if (heroId === NONE_VARIANT_ID && canDisableHero(currentPageKey)) {
        clearLocalHero()
        if (canPersistHeroPreference(currentPageKey)) {
          void persistPreferredHero('', currentPageKey)
        }
        return
      }

      const variant = findVariantById(heroId)
      if (!variant) return
      dispatchVariant(heroId)
      applyVariantLocally(variant)
      if (canPersistHeroPreference(currentPageKey)) {
        void persistPreferredHero(heroId, currentPageKey)
      }
    }

    const persistPreferredHero = async (heroId: string, pageKey: HeroPreferencePageKey) => {
      const apiUrls = getPreferredHeroApiUrls()
      let lastError: unknown = null

      for (const apiUrl of apiUrls) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ preferredHeroId: heroId, pageKey }),
          })

          if (!response.ok) {
            lastError = new Error(`HTTP ${response.status} from ${apiUrl}`)
            continue
          }

          return
        } catch (error) {
          lastError = error
        }
      }

      console.warn(`Failed to persist preferred hero in ${pageKey} config.`, lastError)
    }

    const populateSelectOptions = () => {
      // astro-dev-toolbar-select wraps a native <select>; clear that directly
      // to avoid duplicate options across repeated refreshes.
      select.element.options.length = 0
      currentVariants.forEach((variant) => {
        const option = document.createElement('option')
        option.value = variant.id
        option.textContent = variant.label
        select.element.add(option)
      })
    }

    const syncSelectValue = (requestedId?: string | null) => {
      const fromPage = readActivePageVariant(currentPageKey)
      const fromRequested = requestedId && isKnownVariantId(requestedId) ? requestedId : null
      const resolvedId =
        fromRequested ??
        fromPage ??
        (canDisableHero(currentPageKey) && isKnownVariantId(NONE_VARIANT_ID) ? NONE_VARIANT_ID : defaultVariantId)
      select.element.value = isKnownVariantId(resolvedId) ? resolvedId : defaultVariantId
    }

    const refreshVariants = (requestedId?: string | null) => {
      currentPageKey = readHeroPreferencePageKey()
      const parsedVariants = readHeroVariantsFromPage()
      const activePageVariant = readActivePageVariant(currentPageKey)
      const previousVariants = currentVariants.filter((variant) => variant.id !== NONE_VARIANT_ID)
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

      currentVariants = withNoBackgroundOption(nextVariants, currentPageKey)
      defaultVariantId = currentVariants[0]?.id ?? FALLBACK_VARIANT_ID
      populateSelectOptions()
      syncSelectValue(requestedId)
    }

    const onSelectChange = () => {
      const selectedId = select.element.value
      if (!isKnownVariantId(selectedId)) return
      writeVariant(selectedId)
    }

    select.element.addEventListener('change', onSelectChange)
    refreshVariants()

    const onAppToggled = ({ state }: { state: boolean }) => {
      if (state) {
        refreshVariants()
        window.requestAnimationFrame(() => {
          focusElement(select.element)
        })
      }
    }

    const onAfterSwap = () => {
      refreshVariants()
    }
    const onPageLoad = () => {
      refreshVariants()
    }

    app.onToggled(onAppToggled)
    document.addEventListener('astro:after-swap', onAfterSwap)
    document.addEventListener('astro:page-load', onPageLoad)

    row?.append(select)
    canvas.append(windowElement)
  },
})
