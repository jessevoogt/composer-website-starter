/**
 * Client-side submission metadata.
 *
 * Collected at form submission time and sent alongside form data
 * so the backend can merge it with server-side metadata (IP, UA, geolocation).
 */

import { prefersReducedMotion } from '../scripts/a11y-utils'

export interface ClientMeta {
  pageUrl: string
  language: string
  prefersReducedMotion: boolean
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  referrer: string
  journey?: unknown
}

/** Read the session journey data from sessionStorage (if present). */
function getJourney(): unknown | null {
  try {
    const raw = sessionStorage.getItem('_journey')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Collect client-side metadata at the moment of form submission. */
export function collectClientMeta(): ClientMeta {
  const meta: ClientMeta = {
    pageUrl: window.location.pathname + window.location.search,
    language: navigator.language ?? '',
    prefersReducedMotion: prefersReducedMotion(),
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    viewportWidth: window.innerWidth ?? 0,
    viewportHeight: window.innerHeight ?? 0,
    referrer: document.referrer ?? '',
  }

  const journey = getJourney()
  if (journey) meta.journey = journey

  return meta
}
