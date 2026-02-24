/**
 * Accessible search combobox with autocomplete.
 * Supports two modes:
 *   - 'works' (default): simple substring filtering on works data
 *   - 'site': ranked search across works + tag pages + static pages
 * Follows the WAI-ARIA Combobox pattern with Listbox popup.
 * Lifecycle: init on astro:page-load, teardown on astro:before-swap.
 */

import type { SearchableWork } from './works-search-types'
import type { SearchableItem } from './search-types'
import { rankResults } from './search-scoring'
import { focusTextInput } from './focus-policy'
import { resolveSearchSurface, trackAnalyticsEvent } from './analytics-events'
import { navigate } from 'astro:transitions/client'
import type { NavigationSource } from './navigation-intent'
import { signalNavigationPending } from './navigation-intent'

interface WorksSearchWindow extends Window {
  __worksSearchBound?: boolean
}

type SearchMode = 'works' | 'site'

/** A unified result wrapper used by both modes. */
interface DisplayResult {
  href: string
  title: string
  subtitle: string
  category: 'work' | 'page' | 'tag'
  tags: string[]
  instrumentation: string[]
  performers: string[]
  description: string
}

let searchInstanceCounter = 0

const sharedSearchScriptCache = new WeakMap<HTMLScriptElement, unknown[]>()

function parseSearchData(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resolveDataScript(container: HTMLElement): HTMLScriptElement | null {
  const inlineScript = container.querySelector<HTMLScriptElement>('[data-works-search-data]')
  if (inlineScript) return inlineScript

  const refId = container.dataset.worksSearchDataRef?.trim()
  if (!refId) return null

  const referencedScript = document.getElementById(refId)
  return referencedScript instanceof HTMLScriptElement ? referencedScript : null
}

function readData(container: HTMLElement): unknown[] {
  const script = resolveDataScript(container)
  if (!script?.textContent) return []

  const cached = sharedSearchScriptCache.get(script)
  if (cached) return cached

  const parsed = parseSearchData(script.textContent)
  sharedSearchScriptCache.set(script, parsed)
  return parsed
}

function readWorksData(container: HTMLElement): SearchableWork[] {
  return readData(container) as SearchableWork[]
}

function readSiteData(container: HTMLElement): SearchableItem[] {
  return readData(container) as SearchableItem[]
}

function filterWorks(query: string, works: SearchableWork[]): DisplayResult[] {
  const normalized = query.toLowerCase().trim()
  if (!normalized) return []
  return works
    .filter((work) => {
      const haystack = [
        work.title,
        work.subtitle,
        work.description,
        work.composer,
        work.duration,
        work.difficulty,
        work.completionDate,
        work.programNote,
        ...work.keywords,
        ...work.tags,
        ...work.instrumentation,
        ...work.performers,
        ...work.venues,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
    .map(workToDisplayResult)
}

function workToDisplayResult(work: SearchableWork): DisplayResult {
  return {
    href: work.href,
    title: work.title,
    subtitle: work.subtitle,
    category: 'work',
    tags: work.tags,
    instrumentation: work.instrumentation,
    performers: work.performers,
    description: work.description,
  }
}

function siteItemToDisplayResult(item: SearchableItem): DisplayResult {
  return {
    href: item.href,
    title: item.title,
    subtitle: item.category === 'work' ? item.subtitle : '',
    category: item.category,
    tags: item.category === 'work' ? item.tags : [],
    instrumentation: item.category === 'work' ? item.instrumentation : [],
    performers: item.category === 'work' ? item.performers : [],
    description: item.description,
  }
}

function filterSiteItems(query: string, items: SearchableItem[]): DisplayResult[] {
  const normalized = query.toLowerCase().trim()
  if (!normalized) return []
  return rankResults(items, query)
    .map((scored) => siteItemToDisplayResult(scored.item))
}

function shuffleInPlace<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const next = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = next
  }
}

function navigateToHref(href: string, source: NavigationSource | null = null): void {
  const nextHref = href.trim()
  if (!nextHref) return
  if (source) {
    signalNavigationPending(source, nextHref)
  }
  void navigate(nextHref).catch(() => {
    window.location.href = nextHref
  })
}

function normalizeSearchQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function initWorksSearch(container: HTMLElement): () => void {
  const input = container.querySelector<HTMLInputElement>('[data-works-search-input]')
  const listbox = container.querySelector<HTMLUListElement>('[role="listbox"]')
  const clearBtn = container.querySelector<HTMLButtonElement>('[data-works-search-clear]')
  const statusRegion = container.querySelector<HTMLElement>('[data-works-search-status]')

  if (!input || !listbox || !clearBtn || !statusRegion) return () => {}

  // Narrow to non-null locals so TypeScript knows these exist for rest of scope
  const inputEl = input as HTMLInputElement
  const listboxEl = listbox as HTMLUListElement
  const clearBtnEl = clearBtn as HTMLButtonElement
  const statusRegionEl = statusRegion as HTMLElement

  const mode: SearchMode = container.dataset.worksSearchMode === 'site' ? 'site' : 'works'
  const showInitialResults = container.dataset.worksSearchShowInitialResults === 'true'
  const initialLimitRaw = Number.parseInt(container.dataset.worksSearchInitialLimit || '', 10)
  const initialResultsLimit = Number.isFinite(initialLimitRaw) && initialLimitRaw > 0 ? initialLimitRaw : 10
  const searchInstanceId = `works-search-${++searchInstanceCounter}`
  const searchSurface = resolveSearchSurface(container, mode)

  // Determine if this search is inside a dialog that should stay open during navigation
  const navigationSource: NavigationSource | null = container.closest('#mobile-menu-modal')
    ? 'mobile-search'
    : container.closest('#works-search-modal')
      ? 'search-modal'
      : null

  // Read data based on mode
  const worksData = mode === 'works' ? readWorksData(container) : []
  const siteData = mode === 'site' ? readSiteData(container) : []

  let activeIndex = -1
  let displayResults: DisplayResult[] = []
  let isOpen = false
  let initialDisplayResults: DisplayResult[] = []
  let searchTrackTimer = 0
  let lastTrackedQuery = ''

  function buildInitialDisplayResults(): DisplayResult[] {
    if (!showInitialResults) return []
    const pool = (mode === 'site' ? siteData.map(siteItemToDisplayResult) : worksData.map(workToDisplayResult)).slice()
    shuffleInPlace(pool)
    return pool.slice(0, initialResultsLimit)
  }

  function refreshInitialDisplayResults(): void {
    initialDisplayResults = buildInitialDisplayResults()
  }

  function isSearchToggleClickTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('[data-works-search-modal-toggle], [data-mobile-header-search-toggle]'))
  }

  function buildOptionId(index: number): string {
    return `${searchInstanceId}-option-${index}`
  }

  function clearSearchTrackTimer(): void {
    if (!searchTrackTimer) return
    window.clearTimeout(searchTrackTimer)
    searchTrackTimer = 0
  }

  function trackQueryIfNeeded(query: string, resultCount: number): void {
    const normalizedQuery = normalizeSearchQuery(query)
    const queryKey = normalizedQuery.toLowerCase()
    if (normalizedQuery.length < 2) return
    if (!queryKey || queryKey === lastTrackedQuery) return

    lastTrackedQuery = queryKey
    trackAnalyticsEvent('search_query', {
      search_mode: mode,
      search_surface: searchSurface,
      query: normalizedQuery,
      query_length: normalizedQuery.length,
      result_count: resultCount,
    })
  }

  function scheduleQueryTracking(query: string): void {
    clearSearchTrackTimer()
    const normalizedQuery = normalizeSearchQuery(query)
    if (normalizedQuery.length < 2) return
    const resultCount = displayResults.length

    searchTrackTimer = window.setTimeout(() => {
      searchTrackTimer = 0
      trackQueryIfNeeded(normalizedQuery, resultCount)
    }, 450)
  }

  function trackSearchSelection(result: DisplayResult, trigger: 'keyboard' | 'click' | 'single_result' | 'first_result'): void {
    const normalizedQuery = normalizeSearchQuery(inputEl.value)
    const resultRank = displayResults.findIndex(
      (item) => item.href === result.href && item.title === result.title && item.category === result.category,
    )

    trackAnalyticsEvent('search_result_select', {
      search_mode: mode,
      search_surface: searchSurface,
      query: normalizedQuery,
      query_length: normalizedQuery.length,
      result_count: displayResults.length,
      result_rank: resultRank >= 0 ? resultRank + 1 : undefined,
      result_title: result.title,
      result_category: result.category,
      result_href: result.href,
      trigger,
    })
  }

  function openListbox(): void {
    if (displayResults.length === 0) return
    isOpen = true
    listboxEl.hidden = false
    inputEl.setAttribute('aria-expanded', 'true')
  }

  function closeListbox(): void {
    isOpen = false
    listboxEl.hidden = true
    inputEl.setAttribute('aria-expanded', 'false')
    inputEl.setAttribute('aria-activedescendant', '')
    activeIndex = -1
    listboxEl.querySelectorAll<HTMLElement>('[role="option"]').forEach((opt) => {
      opt.setAttribute('aria-selected', 'false')
      opt.classList.remove('is-active')
    })
  }

  function setActiveIndex(index: number): void {
    // Clear previous
    if (activeIndex >= 0 && activeIndex < displayResults.length) {
      const prevId = buildOptionId(activeIndex)
      const prev = listboxEl.querySelector<HTMLElement>(`#${CSS.escape(prevId)}`)
      if (prev) {
        prev.setAttribute('aria-selected', 'false')
        prev.classList.remove('is-active')
      }
    }

    activeIndex = index

    if (index >= 0 && index < displayResults.length) {
      const optionId = buildOptionId(index)
      const option = listboxEl.querySelector<HTMLElement>(`#${CSS.escape(optionId)}`)
      if (option) {
        option.setAttribute('aria-selected', 'true')
        option.classList.add('is-active')
        inputEl.setAttribute('aria-activedescendant', optionId)
        option.scrollIntoView({ block: 'nearest' })
      }
    } else {
      inputEl.setAttribute('aria-activedescendant', '')
    }
  }

  function announceStatus(message: string): void {
    statusRegionEl.textContent = message
  }

  function updateClearButton(): void {
    clearBtnEl.hidden = !inputEl.value
  }

  function renderOptions(results: DisplayResult[]): void {
    listboxEl.innerHTML = ''
    results.forEach((result, index) => {
      const li = document.createElement('li')
      li.id = buildOptionId(index)
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', 'false')
      li.dataset.workHref = result.href
      li.dataset.resultIndex = String(index)
      li.className = 'works-search-option'

      const titleSpan = document.createElement('span')
      titleSpan.className = 'works-search-option-title'
      titleSpan.textContent = result.title

      li.appendChild(titleSpan)

      if (result.category === 'work') {
        const subtitle = result.subtitle.trim()
        if (subtitle) {
          const subtitleSpan = document.createElement('span')
          subtitleSpan.className = 'works-search-option-subtitle'
          subtitleSpan.textContent = subtitle
          li.appendChild(subtitleSpan)
        }

        // Works: show tags, instrumentation, and performers
        const meta: string[] = []
        if (result.tags.length > 0) meta.push(result.tags.join(', '))
        if (result.instrumentation.length > 0) meta.push(result.instrumentation.join(', '))
        if (result.performers.length > 0) meta.push(result.performers.join(', '))

        if (meta.length > 0) {
          const metaSpan = document.createElement('span')
          metaSpan.className = 'works-search-option-meta'
          metaSpan.setAttribute('aria-hidden', 'true')
          metaSpan.textContent = meta.join(' \u2014 ')
          li.appendChild(metaSpan)
        }
      } else {
        // Tag and page entries: show description
        if (result.description) {
          const metaSpan = document.createElement('span')
          metaSpan.className = 'works-search-option-meta'
          metaSpan.setAttribute('aria-hidden', 'true')
          metaSpan.textContent = result.description
          li.appendChild(metaSpan)
        }
      }

      // Screen-reader category context (only in site mode)
      if (mode === 'site') {
        const categorySpan = document.createElement('span')
        categorySpan.className = 'sr-only'
        categorySpan.textContent = result.category === 'work' ? 'Music' : result.category === 'tag' ? 'Tag' : 'Page'
        li.appendChild(categorySpan)
      }

      listboxEl.appendChild(li)
    })
  }

  function updateResults(query: string): void {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      if (showInitialResults && initialDisplayResults.length === 0) {
        refreshInitialDisplayResults()
      }
      displayResults = showInitialResults ? initialDisplayResults : []
    } else {
      displayResults = mode === 'site' ? filterSiteItems(query, siteData) : filterWorks(query, worksData)
    }
    updateClearButton()

    if (displayResults.length > 0) {
      renderOptions(displayResults)
      openListbox()
      activeIndex = -1
      inputEl.setAttribute('aria-activedescendant', '')
      if (normalizedQuery) {
        announceStatus(`${displayResults.length} result${displayResults.length !== 1 ? 's' : ''} found`)
      } else if (showInitialResults) {
        announceStatus(`Showing ${displayResults.length} result${displayResults.length !== 1 ? 's' : ''}`)
      } else {
        announceStatus('')
      }
      return
    }

    renderOptions([])
    closeListbox()
    announceStatus(query.trim() ? 'No results found' : '')
  }

  function onInput(): void {
    updateResults(inputEl.value)
    scheduleQueryTracking(inputEl.value)
  }

  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen && displayResults.length > 0) {
          openListbox()
          setActiveIndex(0)
        } else if (isOpen) {
          setActiveIndex(activeIndex < displayResults.length - 1 ? activeIndex + 1 : 0)
        }
        break

      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen && displayResults.length > 0) {
          openListbox()
          setActiveIndex(displayResults.length - 1)
        } else if (isOpen) {
          setActiveIndex(activeIndex > 0 ? activeIndex - 1 : displayResults.length - 1)
        }
        break

      case 'Enter':
        if (isOpen && activeIndex >= 0 && activeIndex < displayResults.length) {
          event.preventDefault()
          const selected = displayResults[activeIndex]
          if (selected) {
            trackSearchSelection(selected, 'keyboard')
            navigateToHref(selected.href, navigationSource)
          }
        } else if (displayResults.length === 1) {
          event.preventDefault()
          const selected = displayResults[0]
          if (selected) {
            trackSearchSelection(selected, 'single_result')
            navigateToHref(selected.href, navigationSource)
          }
        } else if (displayResults.length > 1) {
          event.preventDefault()
          const selected = displayResults[0]
          if (selected) {
            trackSearchSelection(selected, 'first_result')
            navigateToHref(selected.href, navigationSource)
          }
        }
        break

      case 'Escape':
        if (isOpen) {
          closeListbox()
          event.stopPropagation()
        } else if (inputEl.value) {
          inputEl.value = ''
          updateResults('')
        }
        break

      case 'Home':
        if (isOpen && displayResults.length > 0) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break

      case 'End':
        if (isOpen && displayResults.length > 0) {
          event.preventDefault()
          setActiveIndex(displayResults.length - 1)
        }
        break
    }
  }

  function onInputFocus(): void {
    if (!inputEl.value.trim() && showInitialResults) {
      refreshInitialDisplayResults()
      updateResults('')
      return
    }
    if (displayResults.length > 0 && inputEl.value.trim()) openListbox()
  }

  function onListboxMouseDown(event: MouseEvent): void {
    // Prevent input blur so click on option can register
    event.preventDefault()
  }

  function onOptionClick(event: MouseEvent): void {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')
    if (!option) return
    const resultIndex = Number.parseInt(option.dataset.resultIndex ?? '', 10)
    const selected =
      Number.isFinite(resultIndex) && resultIndex >= 0 && resultIndex < displayResults.length
        ? displayResults[resultIndex]
        : null

    if (selected) {
      trackSearchSelection(selected, 'click')
      navigateToHref(selected.href, navigationSource)
      return
    }

    const href = option.dataset.workHref
    if (href) {
      navigateToHref(href, navigationSource)
    }
  }

  function onClearClick(): void {
    const previousQuery = normalizeSearchQuery(inputEl.value)
    if (previousQuery) {
      trackAnalyticsEvent('search_clear', {
        search_mode: mode,
        search_surface: searchSurface,
        previous_query_length: previousQuery.length,
      })
    }
    clearSearchTrackTimer()
    inputEl.value = ''
    lastTrackedQuery = ''
    updateResults('')
    focusTextInput(inputEl)
  }

  function onDocumentClick(event: MouseEvent): void {
    if (mode === 'site' && isSearchToggleClickTarget(event.target)) return
    if (!container.contains(event.target as Node)) {
      closeListbox()
    }
  }

  // Attach listeners
  inputEl.addEventListener('input', onInput)
  inputEl.addEventListener('keydown', onKeyDown)
  inputEl.addEventListener('focus', onInputFocus)
  listboxEl.addEventListener('mousedown', onListboxMouseDown)
  listboxEl.addEventListener('click', onOptionClick)
  clearBtnEl.addEventListener('click', onClearClick)
  document.addEventListener('click', onDocumentClick)

  updateResults(inputEl.value)

  // Handle autofocus on SPA navigation for pointer-precise devices only.
  if (inputEl.hasAttribute('autofocus')) {
    focusTextInput(inputEl, { requireReliableAutofocus: true })
  }

  return () => {
    clearSearchTrackTimer()
    inputEl.removeEventListener('input', onInput)
    inputEl.removeEventListener('keydown', onKeyDown)
    inputEl.removeEventListener('focus', onInputFocus)
    listboxEl.removeEventListener('mousedown', onListboxMouseDown)
    listboxEl.removeEventListener('click', onOptionClick)
    clearBtnEl.removeEventListener('click', onClearClick)
    document.removeEventListener('click', onDocumentClick)
  }
}

const worksSearchWindow = window as WorksSearchWindow
if (!worksSearchWindow.__worksSearchBound) {
  worksSearchWindow.__worksSearchBound = true

  document.addEventListener('astro:page-load', () => {
    const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-works-search]'))
    if (containers.length === 0) return

    const teardowns = containers.map((container) => initWorksSearch(container))
    document.addEventListener(
      'astro:before-swap',
      () => {
        teardowns.forEach((teardown) => teardown())
      },
      { once: true },
    )
  })
}
