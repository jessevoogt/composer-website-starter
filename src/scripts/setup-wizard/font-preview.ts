/**
 * Setup Wizard — Google Font live preview.
 */

import { FONT_CATALOG } from './dom'

// ─── Font live preview ───────────────────────────────────────────────────────

/** Google Font family params already loaded as <link> elements. */
const loadedGoogleFonts = new Set<string>()

export function loadGoogleFont(fontName: string): void {
  const meta = FONT_CATALOG[fontName]
  if (!meta?.googleCss2Family) return
  if (loadedGoogleFonts.has(meta.googleCss2Family)) return

  loadedGoogleFonts.add(meta.googleCss2Family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${meta.googleCss2Family}&display=swap`
  document.head.appendChild(link)
}

export function applyFontPreview(fontName: string, cssVar: string): void {
  const meta = FONT_CATALOG[fontName]
  if (!meta) return

  loadGoogleFont(fontName)
  document.documentElement.style.setProperty(cssVar, meta.cssFamily)
}
