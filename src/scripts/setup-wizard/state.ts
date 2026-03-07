/**
 * Setup Wizard — mutable state and session persistence.
 *
 * All mutable state is on the `state` object so modules that import it
 * share the same live values (ESM live bindings don't work for
 * reassigned primitives, but object property mutations propagate fine).
 */

import { STEP_STORAGE_KEY, TOTAL_STEPS } from './types'

// ─── Session persistence ─────────────────────────────────────────────────────

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

export function persistStep(index: number): void {
  try {
    sessionStorage.setItem(STEP_STORAGE_KEY, String(index))
  } catch {
    // sessionStorage unavailable
  }
}

// ─── JSON data helper ────────────────────────────────────────────────────────

export function parseJsonScript<T>(id: string): T {
  const el = document.getElementById(id)
  if (!el?.textContent) return [] as unknown as T
  return JSON.parse(el.textContent) as T
}

// ─── Shared mutable state ────────────────────────────────────────────────────

export const state = {
  currentStep: getRestoredStep(),
  isSaving: false,
  selectedPresetId: '',
  selectedHeroId: '',

  // File references for upload steps
  profileImageFile: null as File | null,
  workThumbnailFile: null as File | null,
  workAudioFile: null as File | null,
  logoFile: null as File | null,
  faviconFile: null as File | null,
  socialPreviewFile: null as File | null,
  workScoreFile: null as File | null,

  // Tagline cycling
  taglineIndex: -1,
}
