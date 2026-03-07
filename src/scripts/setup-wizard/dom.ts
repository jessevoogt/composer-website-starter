/**
 * Setup Wizard — DOM element references.
 *
 * All queries are executed once at import time. The wizard container
 * must exist in the DOM when this module loads (guaranteed because the
 * <script> tag is at the bottom of setup.astro).
 */

import type { ThemePreset, FontMeta } from './types'
import { state, parseJsonScript } from './state'

// ─── Wizard root ─────────────────────────────────────────────────────────────

function getWizardRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-wizard]')
  if (!el) throw new Error('Setup wizard container not found')
  return el
}

export const wizard = getWizardRoot()

// ─── Core structural elements ────────────────────────────────────────────────

export const tabs = Array.from(wizard.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
export const panels = Array.from(wizard.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
export const errorRegion = wizard.querySelector<HTMLElement>('[data-error-region]')

// ─── Data from server (embedded JSON scripts) ────────────────────────────────

export const presets: ThemePreset[] = parseJsonScript('setup-presets-data')

/** Font catalog for live preview: font name -> { cssFamily, googleCss2Family } */
export const FONT_CATALOG: Record<string, FontMeta> = parseJsonScript('setup-font-data')

// ─── Determine initially selected preset from the DOM ────────────────────────

const initialPresetCard = wizard.querySelector<HTMLElement>('.setup-wizard__preset-card--selected')
if (initialPresetCard) {
  state.selectedPresetId = initialPresetCard.dataset.presetId ?? ''
}
