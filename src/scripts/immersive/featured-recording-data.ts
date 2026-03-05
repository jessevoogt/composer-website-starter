/**
 * Client-side featured recording selection and DOM updates.
 */

import type { ClientRecordingEntry, ClientSelectWorksSortOrder } from './types'
import { isNonEmpty, normalizeMediaSrc } from '@/utils/immersive-helpers'

interface FeaturedRecordingOptions {
  selectWorksSortOrder: ClientSelectWorksSortOrder
  featuredRecordingPool: ClientRecordingEntry[]
  fallbackFeaturedRecording: ClientRecordingEntry | null
}

export interface AppliedRecording {
  workId: string
}

export function applyFeaturedRecording(options: FeaturedRecordingOptions): AppliedRecording | null {
  const { selectWorksSortOrder, featuredRecordingPool, fallbackFeaturedRecording } = options

  const validPool = featuredRecordingPool.filter(
    (entry) => entry && typeof entry === 'object' && isNonEmpty(entry.mp3),
  )
  const fallback = fallbackFeaturedRecording
  const recordingCandidates: ClientRecordingEntry[] = fallback ? [...validPool, fallback] : [...validPool]
  const featuredSource = document.querySelector<HTMLSourceElement>('[data-featured-source]')
  const featuredPlayer = document.querySelector<HTMLAudioElement>('[data-featured-player]')

  function toComparableMediaSrc(value: string | null | undefined): string {
    if (!isNonEmpty(value)) return ''
    try {
      const parsed = new URL(value, window.location.href)
      return `${parsed.pathname}${parsed.search}`
    } catch {
      return normalizeMediaSrc(value)
    }
  }

  function findActiveRecording(): ClientRecordingEntry | null {
    if (!featuredPlayer) return null

    const key = featuredPlayer.dataset.featuredRecordingKey?.trim()
    if (isNonEmpty(key)) {
      const byKey = recordingCandidates.find((entry) => entry.key === key)
      if (byKey) return byKey
    }

    const activeSrc = toComparableMediaSrc(featuredSource?.getAttribute('src') || featuredPlayer.currentSrc)
    if (!isNonEmpty(activeSrc)) return null

    return (
      recordingCandidates.find((entry) => toComparableMediaSrc(normalizeMediaSrc(entry.mp3)) === activeSrc) ?? null
    )
  }

  function choose(): ClientRecordingEntry | null {
    if (validPool.length > 1) {
      return validPool[Math.floor(Math.random() * validPool.length)]!
    }
    if (validPool.length === 1) return validPool[0]!
    return fallback
  }

  function apply(recording: ClientRecordingEntry | null): void {
    if (!recording) return

    const featuredImage = document.querySelector<HTMLImageElement>('[data-featured-image]')
    const listenFigure = document.querySelector<HTMLElement>('[data-parallax-listen]')
    const featuredMeta = document.querySelector<HTMLElement>('[data-featured-meta]')
    const featuredMetaTitle = document.querySelector<HTMLElement>('[data-featured-meta-title]')
    const featuredMetaPerformer = document.querySelector<HTMLElement>('[data-featured-meta-performer]')
    const featuredMetaDate = document.querySelector<HTMLElement>('[data-featured-meta-date]')
    const featuredWorkLink = document.querySelector<HTMLAnchorElement>('[data-featured-work-link]')

    if (featuredImage) {
      if (isNonEmpty(recording.imageSrc)) featuredImage.src = recording.imageSrc
      featuredImage.alt = isNonEmpty(recording.imageAlt) ? recording.imageAlt : ''
    }

    if (listenFigure && isNonEmpty(recording.imagePosition)) {
      listenFigure.style.setProperty('--listen-image-position', recording.imagePosition)
    }

    if (featuredSource && featuredPlayer) {
      const nextSrc = normalizeMediaSrc(recording.mp3)
      if (isNonEmpty(nextSrc)) {
        const currentSrc = toComparableMediaSrc(featuredSource.getAttribute('src') || featuredPlayer.currentSrc)
        const nextComparableSrc = toComparableMediaSrc(nextSrc)

        if (featuredSource.getAttribute('src') !== nextSrc) {
          featuredSource.src = nextSrc
        }
        if (isNonEmpty(nextComparableSrc) && nextComparableSrc !== currentSrc) {
          featuredPlayer.load()
        }
      }
      featuredPlayer.dataset.featuredRecordingKey = recording.key
    }

    if (featuredMetaTitle) {
      featuredMetaTitle.textContent = isNonEmpty(recording.title) ? recording.title : 'Featured Recording'
    }
    if (featuredMetaPerformer) {
      featuredMetaPerformer.textContent = isNonEmpty(recording.performer)
        ? recording.performer
        : 'Performer to be announced'
    }
    if (featuredMetaDate) {
      featuredMetaDate.textContent = isNonEmpty(recording.date) ? recording.date : 'Date unavailable'
    }
    if (featuredMeta) {
      if (isNonEmpty(recording.instrumentation)) {
        featuredMeta.setAttribute('data-featured-meta-instrumentation', recording.instrumentation)
      } else {
        featuredMeta.removeAttribute('data-featured-meta-instrumentation')
      }
    }
    if (featuredWorkLink) {
      featuredWorkLink.href = isNonEmpty(recording.workHref) ? recording.workHref : '/music/'
      featuredWorkLink.setAttribute(
        'aria-label',
        `More details for ${isNonEmpty(recording.title) ? recording.title : 'featured work'}`,
      )
    }
  }

  function arrangeSelectedWorks(featuredWorkId: string | undefined): void {
    const track = document.querySelector<HTMLElement>('.work-carousel-track')
    const frame = document.querySelector<HTMLElement>('[data-carousel-frame]')
    if (!track) return

    const cards = Array.from(track.querySelectorAll<HTMLElement>('.work-card'))
    if (cards.length === 0) return

    let visibleCards = cards
    if (isNonEmpty(featuredWorkId)) {
      const filtered = cards.filter((card) => card.getAttribute('data-work-id') !== featuredWorkId)
      if (filtered.length > 0) visibleCards = filtered
    }

    if (selectWorksSortOrder === 'random') {
      // Fisher-Yates shuffle
      for (let i = visibleCards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[visibleCards[i], visibleCards[j]] = [visibleCards[j]!, visibleCards[i]!]
      }
    }

    track.replaceChildren(...visibleCards)
    if (frame) frame.scrollLeft = 0
  }

  const hasPersistedSelection = Boolean(featuredPlayer?.dataset.featuredRecordingKey?.trim())
  const shouldPreserveActiveRecording =
    hasPersistedSelection ||
    Boolean(featuredPlayer && (!featuredPlayer.paused || featuredPlayer.currentTime > 0))
  const activeRecording = shouldPreserveActiveRecording ? findActiveRecording() : null
  const recording = shouldPreserveActiveRecording ? activeRecording : choose()

  if (shouldPreserveActiveRecording && !recording) {
    arrangeSelectedWorks(undefined)
    return null
  }

  apply(recording)
  arrangeSelectedWorks(recording?.workId)

  return recording ? { workId: recording.workId } : null
}
