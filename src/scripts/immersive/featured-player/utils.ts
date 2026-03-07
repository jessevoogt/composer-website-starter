import { prefersReducedMotion as prefersReducedMotionCheck } from '../../a11y-utils'
import { normalizeMediaSrc } from '@/utils/immersive-helpers'
import type { FeaturedRecording, TrackCycleDirection } from './types'

export function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function asMetaText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function asDataText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function toComparableMediaSrc(value: string | null | undefined): string {
  if (!value) return ''
  try {
    const parsed = new URL(value, window.location.href)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return normalizeMediaSrc(value)
  }
}

export function parseFeaturedRecordings(): FeaturedRecording[] {
  const dataScript = document.querySelector<HTMLScriptElement>('[data-featured-recordings-data]')
  if (!dataScript?.textContent) return []

  try {
    const parsed = JSON.parse(dataScript.textContent)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry): FeaturedRecording | null => {
        if (!entry || typeof entry !== 'object') return null
        const row = entry as Record<string, unknown>
        const key = asDataText(row.key)
        const mp3 = asDataText(row.mp3)
        if (!key || !mp3) return null
        const perusalScoreHref = asDataText(row.perusalScoreHref)
        return {
          key,
          workId: asDataText(row.workId),
          workHref: asDataText(row.workHref),
          ...(perusalScoreHref ? { perusalScoreHref } : {}),
          title: asDataText(row.title),
          performer: asDataText(row.performer),
          instrumentation: asDataText(row.instrumentation),
          date: asDataText(row.date),
          imageSrc: asDataText(row.imageSrc),
          imageAlt: asDataText(row.imageAlt),
          imagePosition: asDataText(row.imagePosition),
          mp3,
        }
      })
      .filter((entry): entry is FeaturedRecording => entry !== null)
  } catch {
    return []
  }
}

export interface FeaturedPlayerClientConfig {
  position: 'top' | 'bottom' | 'header-center'
  trackInfoScrollingText: boolean
}

export function parseFeaturedPlayerConfig(): FeaturedPlayerClientConfig {
  const el = document.querySelector<HTMLScriptElement>('[data-featured-player-config]')
  if (!el?.textContent) return { position: 'bottom', trackInfoScrollingText: true }
  try {
    const parsed = JSON.parse(el.textContent)
    const position: FeaturedPlayerClientConfig['position'] =
      parsed.position === 'top' ? 'top' : parsed.position === 'header-center' ? 'header-center' : 'bottom'
    return {
      position,
      trackInfoScrollingText: parsed.trackInfoScrollingText !== false,
    }
  } catch {
    return { position: 'bottom', trackInfoScrollingText: true }
  }
}

export function getScrollPaddingTop(): number {
  const scrollPaddingTop = window.getComputedStyle(document.documentElement).scrollPaddingTop
  const parsed = Number.parseFloat(scrollPaddingTop)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isSectionAligned(section: HTMLElement): boolean {
  return Math.abs(section.getBoundingClientRect().top - getScrollPaddingTop()) <= 4
}

export function waitForScrollSettle(section: HTMLElement): Promise<boolean> {
  const timeoutMs = prefersReducedMotionCheck() ? 350 : 2600
  const settledFramesNeeded = 4

  return new Promise((resolve) => {
    const startedAt = performance.now()
    let previousScrollY = window.scrollY
    let settledFrames = 0

    const tick = (): void => {
      const moved = Math.abs(window.scrollY - previousScrollY) > 0.5
      const aligned = isSectionAligned(section)
      previousScrollY = window.scrollY

      if (aligned && !moved) {
        settledFrames += 1
      } else {
        settledFrames = 0
      }

      if (settledFrames >= settledFramesNeeded) {
        resolve(true)
        return
      }

      if (performance.now() - startedAt >= timeoutMs) {
        resolve(aligned)
        return
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })
}

export function getFeaturedImageTransitionTransform(direction: TrackCycleDirection, progress: number): string {
  const distance = Math.max(0, Math.min(progress, 1)) * 100
  const signedDistance = direction === 'next' ? -distance : distance
  return `translate3d(${signedDistance}%, 0, 0)`
}

export function getFeaturedImageTransitionOpacity(progress: number): number {
  return Math.max(0, Math.min(1, 1 - Math.max(0, Math.min(progress, 1))))
}

export function findTouchByIdentifier(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index)
    if (touch?.identifier === identifier) {
      return touch
    }
  }
  return null
}
