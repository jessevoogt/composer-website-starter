/**
 * Music page: inline filter with FLIP animation + scroll-reveal + sort.
 *
 * - Debounced text input (250ms) scores each work via the existing
 *   search-scoring engine, reorders cards by relevance with a FLIP
 *   animation, and hides zero-score cards.
 * - Sort control: "Default" (newest / relevance), Title, Newest, Oldest.
 * - IntersectionObserver reveals below-fold cards on scroll.
 * - All animations are skipped when prefers-reduced-motion is active.
 */

import { prefersReducedMotion } from './a11y-utils'
import { scoreItem } from './search-scoring'
import type { SearchableWorkItem } from './search-types'

interface WorkMeta {
  hasScore: boolean
  hasRecording: boolean
}

type SortMode = 'default' | 'newest' | 'oldest' | 'title'
type ResolvedSort = 'relevance' | 'newest' | 'oldest' | 'title'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// ---------------------------------------------------------------------------
// Scroll-reveal
// ---------------------------------------------------------------------------

function setupScrollReveal(cards: HTMLElement[]): IntersectionObserver {
  const reduced = prefersReducedMotion()

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          ;(entry.target as HTMLElement).classList.add('music-card-revealed')
          observer.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
  )

  for (const card of cards) {
    const rect = card.getBoundingClientRect()
    const belowFold = rect.top >= window.innerHeight

    if (belowFold && !reduced) {
      card.classList.add('music-card-reveal')
      observer.observe(card)
    } else {
      // Ensure above-fold cards (and all cards when reduced-motion) are visible
      card.classList.remove('music-card-reveal')
      card.classList.add('music-card-revealed')
    }
  }

  return observer
}

function clearScrollReveal(cards: HTMLElement[], observer: IntersectionObserver | null): void {
  observer?.disconnect()
  for (const card of cards) {
    card.classList.remove('music-card-reveal', 'music-card-revealed')
  }
}

// ---------------------------------------------------------------------------
// FLIP reorder
// ---------------------------------------------------------------------------

interface FlipState {
  rect: DOMRect
  wasHidden: boolean
}

function flipReorder(
  grid: HTMLElement,
  newOrder: HTMLElement[],
  hiddenSet: Set<HTMLElement>,
): void {
  const reduced = prefersReducedMotion()

  // FIRST — record current positions and visibility
  const firstMap = new Map<HTMLElement, FlipState>()
  for (const card of newOrder) {
    firstMap.set(card, {
      rect: card.getBoundingClientRect(),
      wasHidden: card.style.display === 'none',
    })
  }

  // Reorder DOM
  for (const card of newOrder) {
    grid.appendChild(card)
  }

  // Apply hidden / visible states
  for (const card of newOrder) {
    const link = card.querySelector<HTMLElement>('a')
    if (hiddenSet.has(card)) {
      card.setAttribute('aria-hidden', 'true')
      card.style.display = 'none'
      if (link) link.setAttribute('tabindex', '-1')
    } else {
      card.removeAttribute('aria-hidden')
      card.style.display = ''
      if (link) link.removeAttribute('tabindex')
    }
  }

  if (reduced) return

  // LAST + INVERT + PLAY
  for (const card of newOrder) {
    if (hiddenSet.has(card)) continue

    const first = firstMap.get(card)
    if (!first) continue

    const lastRect = card.getBoundingClientRect()

    // Fade in cards that were previously hidden
    if (first.wasHidden) {
      card.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: 'ease-out',
      })
      continue
    }

    const deltaX = first.rect.left - lastRect.left
    const deltaY = first.rect.top - lastRect.top

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue

    card.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: 300,
        easing: 'ease-out',
      },
    )
  }
}

// ---------------------------------------------------------------------------
// Main init
// ---------------------------------------------------------------------------

function initMusicFilter(): (() => void) | null {
  const wrapper = document.querySelector<HTMLElement>('[data-music-filter]')
  if (!wrapper) return null

  const input = document.getElementById('music-filter-input') as HTMLInputElement | null
  const clearBtn = wrapper.querySelector<HTMLButtonElement>('.music-filter-clear')
  const grid = document.querySelector<HTMLElement>('.music-card-grid')
  const statusEl = document.querySelector<HTMLElement>('.music-filter-status')
  const statusPlaceholderHTML = statusEl?.innerHTML ?? ''
  if (!input || !grid) return null

  // Load searchable items from embedded JSON
  const dataEl = document.getElementById('music-filter-data')
  if (!dataEl?.textContent) return null

  let items: SearchableWorkItem[]
  try {
    items = JSON.parse(dataEl.textContent) as SearchableWorkItem[]
  } catch {
    return null
  }

  // Build lookup: workId -> SearchableWorkItem
  const itemMap = new Map<string, SearchableWorkItem>()
  for (const item of items) {
    itemMap.set(item.id, item)
  }

  // Load per-work metadata for checkbox filters
  const metaEl = document.getElementById('music-work-meta')
  let metaMap: Record<string, WorkMeta> = {}
  if (metaEl?.textContent) {
    try {
      metaMap = JSON.parse(metaEl.textContent) as Record<string, WorkMeta>
    } catch {
      // ignore
    }
  }

  // Checkbox elements (may not exist if all works have the attribute)
  const scoreCheckbox = document.getElementById('music-filter-has-score') as HTMLInputElement | null
  const recordingCheckbox = document.getElementById('music-filter-has-recording') as HTMLInputElement | null

  // Sort dropdown + configurable defaults from data attributes
  const sortDropdown = document.getElementById('music-sort-dropdown') as HTMLElement | null
  const defaultSortNoFilter = (wrapper.dataset.defaultSort ?? 'newest') as ResolvedSort
  const defaultSortFiltered = (wrapper.dataset.defaultSortFiltered ?? 'relevance') as ResolvedSort

  // Capture original card order (server-rendered matching defaultSortNoFilter)
  const allCards = Array.from(grid.querySelectorAll<HTMLElement>('.work-card[data-work-id]'))
  const originalOrder = [...allCards]
  const totalCount = allCards.length

  // Setup scroll reveal
  let scrollObserver: IntersectionObserver | null = setupScrollReveal([...allCards])

  // ------ Sort helpers ------

  function getCompletionDate(card: HTMLElement): string {
    return itemMap.get(card.dataset.workId ?? '')?.completionDate ?? ''
  }

  function getTitle(card: HTMLElement): string {
    return itemMap.get(card.dataset.workId ?? '')?.title ?? ''
  }

  /** Apply a resolved sort (not 'default') to a card array in-place. */
  function applyResolvedSort(
    cards: Array<{ card: HTMLElement; score: number }>,
    resolved: ResolvedSort,
  ): void {
    switch (resolved) {
      case 'relevance':
        // Score desc, ties broken by newest
        cards.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return getCompletionDate(b.card).localeCompare(getCompletionDate(a.card))
        })
        break
      case 'newest':
        cards.sort((a, b) => getCompletionDate(b.card).localeCompare(getCompletionDate(a.card)))
        break
      case 'oldest':
        cards.sort((a, b) => getCompletionDate(a.card).localeCompare(getCompletionDate(b.card)))
        break
      case 'title':
        cards.sort((a, b) => getTitle(a.card).localeCompare(getTitle(b.card)))
        break
    }
  }

  function sortVisibleCards(
    cards: Array<{ card: HTMLElement; score: number }>,
    mode: SortMode,
    hasTextQuery: boolean,
  ): void {
    if (mode === 'default') {
      const resolved = hasTextQuery ? defaultSortFiltered : defaultSortNoFilter
      applyResolvedSort(cards, resolved)
    } else {
      applyResolvedSort(cards, mode)
    }
  }

  // ------ Filter logic ------

  /** True when any filter (text or checkbox) is active. Sort is not a filter. */
  function isAnyFilterActive(): boolean {
    const hasText = input!.value.trim().length > 0
    const hasScore = scoreCheckbox?.checked ?? false
    const hasRecording = recordingCheckbox?.checked ?? false
    return hasText || hasScore || hasRecording
  }

  function restoreOriginalOrder(): void {
    // Restore all cards to visible + original (newest-first) order
    for (const card of originalOrder) {
      card.removeAttribute('aria-hidden')
      card.style.display = ''
      const link = card.querySelector<HTMLElement>('a')
      if (link) link.removeAttribute('tabindex')
      card.classList.remove('music-card-reveal', 'music-card-revealed')
      grid!.appendChild(card)
    }

    // Re-init scroll reveal
    clearScrollReveal(originalOrder, scrollObserver)
    scrollObserver = setupScrollReveal([...originalOrder])

    // Clear status (restore placeholder span to preserve height)
    if (statusEl) statusEl.innerHTML = statusPlaceholderHTML

    // Update clear button
    if (clearBtn) clearBtn.hidden = true
  }

  function applyFilter(): void {
    const trimmed = input!.value.trim()
    const requireScore = scoreCheckbox?.checked ?? false
    const requireRecording = recordingCheckbox?.checked ?? false
    const mode = (sortDropdown?.dataset.dropdownValue ?? 'default') as SortMode
    const noFilters = !trimmed && !requireScore && !requireRecording
    const isDefaultSort = mode === 'default' || mode === defaultSortNoFilter

    // Fast path: no filters + server-matching sort → original server order
    if (noFilters && isDefaultSort) {
      restoreOriginalOrder()
      return
    }

    // Clear scroll reveal classes during filter/sort
    clearScrollReveal(allCards, scrollObserver)
    scrollObserver = null

    // Score each card, applying both text + checkbox filters
    const visible: Array<{ card: HTMLElement; score: number }> = []
    const hidden: HTMLElement[] = []

    for (const card of originalOrder) {
      const workId = card.dataset.workId
      const item = workId ? itemMap.get(workId) : undefined
      const meta = workId ? metaMap[workId] : undefined

      // Checkbox filter: exclude if requirements not met
      if (requireScore && !meta?.hasScore) {
        hidden.push(card)
        continue
      }
      if (requireRecording && !meta?.hasRecording) {
        hidden.push(card)
        continue
      }

      // Text filter: score and partition
      if (trimmed && item) {
        const score = scoreItem(item, trimmed)
        if (score > 0) {
          visible.push({ card, score })
        } else {
          hidden.push(card)
        }
      } else if (trimmed && !item) {
        hidden.push(card)
      } else {
        // No text query, but passed checkbox filter
        visible.push({ card, score: 0 })
      }
    }

    // Sort visible cards by selected mode
    sortVisibleCards(visible, mode, trimmed.length > 0)

    const newOrder = [...visible.map((v) => v.card), ...hidden]
    const hiddenSet = new Set(hidden)

    flipReorder(grid!, newOrder, hiddenSet)

    // Announce results (only when filters are active, not sort-only)
    const visibleCount = visible.length
    if (statusEl) {
      if (noFilters) {
        // Sort-only change, no filtering — clear status
        statusEl.innerHTML = statusPlaceholderHTML
      } else {
        statusEl.textContent =
          visibleCount === totalCount
            ? `Showing all ${totalCount} works`
            : visibleCount === 0
              ? `No works match your filter`
              : `Showing ${visibleCount} of ${totalCount} works`
      }
    }

    // Update clear button visibility (sort-only does not show clear)
    if (clearBtn) clearBtn.hidden = !isAnyFilterActive()
  }

  const debouncedTextFilter = debounce(applyFilter, 250)

  // ------ Event handlers ------

  function onInput(): void {
    debouncedTextFilter()
  }

  function onCheckboxChange(): void {
    applyFilter()
  }

  function onSortChange(): void {
    applyFilter()
  }

  function resetSortDropdown(): void {
    if (!sortDropdown) return
    sortDropdown.dataset.dropdownValue = 'default'
    const hiddenInput = sortDropdown.querySelector<HTMLInputElement>('[data-dropdown-input]')
    if (hiddenInput) hiddenInput.value = 'default'
    // Re-init the dropdown so trigger label + aria states sync
    type DropdownWindow = Window & {
      __sharedDropdownState?: { refresh: (el: HTMLElement) => void }
    }
    const dropdownState = (window as DropdownWindow).__sharedDropdownState
    dropdownState?.refresh(sortDropdown)
  }

  function onClear(): void {
    input!.value = ''
    if (scoreCheckbox) scoreCheckbox.checked = false
    if (recordingCheckbox) recordingCheckbox.checked = false
    resetSortDropdown()
    input!.focus()
    restoreOriginalOrder()
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isAnyFilterActive()) {
      e.preventDefault()
      onClear()
    }
  }

  input.addEventListener('input', onInput)
  clearBtn?.addEventListener('click', onClear)
  input.addEventListener('keydown', onKeydown)
  scoreCheckbox?.addEventListener('change', onCheckboxChange)
  recordingCheckbox?.addEventListener('change', onCheckboxChange)
  sortDropdown?.addEventListener('shared-dropdown-change', onSortChange)

  // ------ Teardown ------

  return () => {
    input.removeEventListener('input', onInput)
    clearBtn?.removeEventListener('click', onClear)
    input.removeEventListener('keydown', onKeydown)
    scoreCheckbox?.removeEventListener('change', onCheckboxChange)
    recordingCheckbox?.removeEventListener('change', onCheckboxChange)
    sortDropdown?.removeEventListener('shared-dropdown-change', onSortChange)
    clearScrollReveal(allCards, scrollObserver)
    scrollObserver = null
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let teardown: (() => void) | null = null

document.addEventListener('astro:page-load', () => {
  teardown = initMusicFilter()
})

document.addEventListener('astro:before-swap', () => {
  teardown?.()
  teardown = null
})
