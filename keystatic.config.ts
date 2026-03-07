import yaml from 'js-yaml'
import { config } from '@keystatic/core'
import pdfScoresManifest from './api/pdf-scores.json'
import themeLibrarySource from './source/site/theme-library.yaml?raw'
import themeSelectionSource from './source/site/theme-selection.yaml?raw'
import { THEME_PRESETS } from './src/utils/theme-presets'

import { getGlobalSingletons } from './src/keystatic/singletons/global'
import { getLayoutSingletons } from './src/keystatic/singletons/layout'
import { getPageSingletons } from './src/keystatic/singletons/pages'
import { getBlockSingletons } from './src/keystatic/singletons/blocks'
import { getWorksCollection } from './src/keystatic/collections/works'
import { getHeroesCollection } from './src/keystatic/collections/heroes'

// Keystatic manages:
// - Work definitions in source/works/
// - Singletons organized by prefix (ordered for sidebar display):
//     Global:  Site-wide settings (identity, theme, deployment, score access/PDF)
//     Layout:  Page/site composition (which blocks appear and in what order)
//     Page:    Page-specific content and settings (sub-singletons like "Page: Home: Hero")
//     Block:   Reusable content blocks (header, footer, nav, social, etc.)
//
// Run: npm run dev  →  open http://localhost:4321/keystatic

// ── Hero options for accordion sections field ────────────────────────────────
// Read available hero slugs at config time via Vite glob so the custom
// accordion field can show a dropdown instead of a raw text input.

const heroYamlModules = import.meta.glob('./source/heroes/*/hero.yaml')
const heroSelectOptions = Object.keys(heroYamlModules)
  .map((p) => p.match(/\/heroes\/([^/]+)\//)?.[1])
  .filter((s): s is string => s != null)
  .sort()
  .map((slug) => ({ label: slug, value: slug }))

const headerElementOptions = [
  { label: 'Brand / Logo', value: 'brand-logo' },
  { label: 'Main Menu (inline nav links)', value: 'main-menu' },
  { label: 'Site Search', value: 'site-search' },
  { label: 'Mobile Menu (hamburger)', value: 'mobile-menu' },
] as const

function readCurrentThemeSelectionId(): string {
  try {
    const parsed = yaml.load(themeSelectionSource)
    if (!parsed || typeof parsed !== 'object') return ''
    const currentThemeId = (parsed as { currentThemeId?: unknown }).currentThemeId
    return typeof currentThemeId === 'string' ? currentThemeId.trim() : ''
  } catch {
    return ''
  }
}

function getThemeSelectionOptions(currentThemeId: string): Array<{ label: string; value: string }> {
  const fallbackThemes = THEME_PRESETS.map((theme) => ({
    label: theme.label,
    value: theme.id,
  }))

  const libraryThemes = (() => {
    try {
      const parsed = yaml.load(themeLibrarySource)
      if (!parsed || typeof parsed !== 'object') return fallbackThemes
      const rawThemes = Array.isArray((parsed as { themes?: unknown }).themes)
        ? (parsed as { themes: unknown[] }).themes
        : []
      const options = rawThemes
        .map((theme) => {
          const record = theme && typeof theme === 'object' ? (theme as { id?: unknown; label?: unknown }) : {}
          const value = typeof record.id === 'string' ? record.id.trim() : ''
          const label = typeof record.label === 'string' ? record.label.trim() : ''
          return value && label ? { label, value } : null
        })
        .filter((option): option is { label: string; value: string } => option !== null)

      return options.length > 0 ? options : fallbackThemes
    } catch {
      return fallbackThemes
    }
  })()

  const options = [...libraryThemes]
  if (currentThemeId && !options.some((option) => option.value === currentThemeId)) {
    options.unshift({
      label: `Current theme (${currentThemeId})`,
      value: currentThemeId,
    })
  }

  options.push({
    label: 'Custom applied theme',
    value: '',
  })

  return options
}

const currentThemeSelectionId = readCurrentThemeSelectionId()
const themeSelectionOptions = getThemeSelectionOptions(currentThemeSelectionId)
const defaultThemeSelectionValue =
  currentThemeSelectionId || themeSelectionOptions.find((option) => option.value)?.value || ''

export default config({
  storage: {
    kind: 'local',
  },

  singletons: {
    ...getGlobalSingletons({ themeSelectionOptions, defaultThemeSelectionValue, pdfScoresManifest }),
    ...getLayoutSingletons({ headerElementOptions }),
    ...getPageSingletons({ heroSelectOptions }),
    ...getBlockSingletons(),
  },

  collections: {
    ...getWorksCollection(),
    ...getHeroesCollection(),
  },
})
