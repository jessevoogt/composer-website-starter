import { defineToolbarApp } from 'astro/toolbar'
import { focusElement } from '../scripts/focus-policy'
import {
  DEFAULT_THEME_FONT_BODY,
  DEFAULT_THEME_FONT_HEADING,
  resolveImmersiveButtonLabelShifts,
  resolveThemeFontFamily,
} from '../utils/theme-fonts'

const THEME_PRESET_API_PATH = '/api/dev/theme/preset'
const THEME_DATA_SCRIPT_ID = 'site-theme-config-data'
const KEYSTATIC_PORT = '4322'
const CUSTOM_PRESET_ID = '__current__'

const THEME_COLOR_KEYS = [
  'colorBackground',
  'colorBackgroundSoft',
  'colorText',
  'colorTextMuted',
  'colorAccent',
  'colorAccentStrong',
  'colorButton',
  'colorButtonText',
] as const

type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
type ThemeColorMap = Record<ThemeColorKey, string>
type ThemeRawColorMap = Record<ThemeColorKey, string>

interface ThemePreset {
  id: string
  label: string
  description: string
  colors: ThemeColorMap
}

interface ThemePageState {
  colors: ThemeColorMap
  rawColors: ThemeRawColorMap
  interiorHeroOverlayOpacity: string
  fontBody: string
  fontHeading: string
}

const DEFAULT_THEME_COLORS: ThemeColorMap = {
  colorBackground: '#10161d',
  colorBackgroundSoft: '#141b23',
  colorText: '#ecf2f7',
  colorTextMuted: '#aab8c4',
  colorAccent: '#97c6de',
  colorAccentStrong: '#d5edf9',
  colorButton: '#89b9d3',
  colorButtonText: '#08131d',
}
const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'studio-night',
    label: 'Studio Night',
    description: 'Balanced dark palette with soft blue accents.',
    colors: {
      colorBackground: '#10161d',
      colorBackgroundSoft: '#141b23',
      colorText: '#ecf2f7',
      colorTextMuted: '#aab8c4',
      colorAccent: '#97c6de',
      colorAccentStrong: '#d5edf9',
      colorButton: '#89b9d3',
      colorButtonText: '#08131d',
    },
  },
  {
    id: 'ocean-slate',
    label: 'Ocean Slate',
    description: 'Cool slate tones with brighter blue call-to-action accents.',
    colors: {
      colorBackground: '#0f1720',
      colorBackgroundSoft: '#18222d',
      colorText: '#eef4fa',
      colorTextMuted: '#b3c1cf',
      colorAccent: '#8ec5ff',
      colorAccentStrong: '#d8ebff',
      colorButton: '#8ec5ff',
      colorButtonText: '#07131f',
    },
  },
  {
    id: 'evergreen-dusk',
    label: 'Evergreen Dusk',
    description: 'Dark green palette with high-legibility text and controls.',
    colors: {
      colorBackground: '#111a17',
      colorBackgroundSoft: '#1a2622',
      colorText: '#edf5f1',
      colorTextMuted: '#b2c4bc',
      colorAccent: '#8bcfb8',
      colorAccentStrong: '#d7f3e7',
      colorButton: '#8bcfb8',
      colorButtonText: '#0a1713',
    },
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    description: 'Maximum contrast palette for the strongest visual separation.',
    colors: {
      colorBackground: '#05070a',
      colorBackgroundSoft: '#0b1016',
      colorText: '#f9fcff',
      colorTextMuted: '#d7e4f1',
      colorAccent: '#7dd3ff',
      colorAccentStrong: '#e6f6ff',
      colorButton: '#9be0ff',
      colorButtonText: '#031019',
    },
  },
]

function normalizeHexColorExact(value: string | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null

  const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) return null

  const hex = match[1]
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toLowerCase()}`
  }

  return `#${hex.toLowerCase()}`
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  return normalizeHexColorExact(value) ?? fallback
}

function normalizeThemeScalar(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

function normalizeThemeColors(input: Partial<Record<ThemeColorKey, unknown>>): ThemeColorMap {
  return {
    colorBackground: normalizeHexColor(input.colorBackground as string | undefined, DEFAULT_THEME_COLORS.colorBackground),
    colorBackgroundSoft: normalizeHexColor(
      input.colorBackgroundSoft as string | undefined,
      DEFAULT_THEME_COLORS.colorBackgroundSoft,
    ),
    colorText: normalizeHexColor(input.colorText as string | undefined, DEFAULT_THEME_COLORS.colorText),
    colorTextMuted: normalizeHexColor(input.colorTextMuted as string | undefined, DEFAULT_THEME_COLORS.colorTextMuted),
    colorAccent: normalizeHexColor(input.colorAccent as string | undefined, DEFAULT_THEME_COLORS.colorAccent),
    colorAccentStrong: normalizeHexColor(
      input.colorAccentStrong as string | undefined,
      DEFAULT_THEME_COLORS.colorAccentStrong,
    ),
    colorButton: normalizeHexColor(input.colorButton as string | undefined, DEFAULT_THEME_COLORS.colorButton),
    colorButtonText: normalizeHexColor(
      input.colorButtonText as string | undefined,
      DEFAULT_THEME_COLORS.colorButtonText,
    ),
  }
}

function normalizeThemeRawColors(input: Partial<Record<ThemeColorKey, unknown>>): ThemeRawColorMap {
  const normalizeRawValue = (value: unknown): string => {
    const trimmed = normalizeThemeScalar(value)
    if (!trimmed) return ''
    return normalizeHexColorExact(trimmed) ?? trimmed
  }

  return {
    colorBackground: normalizeRawValue(input.colorBackground),
    colorBackgroundSoft: normalizeRawValue(input.colorBackgroundSoft),
    colorText: normalizeRawValue(input.colorText),
    colorTextMuted: normalizeRawValue(input.colorTextMuted),
    colorAccent: normalizeRawValue(input.colorAccent),
    colorAccentStrong: normalizeRawValue(input.colorAccentStrong),
    colorButton: normalizeRawValue(input.colorButton),
    colorButtonText: normalizeRawValue(input.colorButtonText),
  }
}

function toRawThemeColors(colors: ThemeColorMap): ThemeRawColorMap {
  return {
    colorBackground: colors.colorBackground,
    colorBackgroundSoft: colors.colorBackgroundSoft,
    colorText: colors.colorText,
    colorTextMuted: colors.colorTextMuted,
    colorAccent: colors.colorAccent,
    colorAccentStrong: colors.colorAccentStrong,
    colorButton: colors.colorButton,
    colorButtonText: colors.colorButtonText,
  }
}

function hexToRgbTuple(value: string): [number, number, number] {
  const normalized = normalizeHexColor(value, '#000000').slice(1)
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return [red, green, blue]
}

function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function mixHex(baseHex: string, targetHex: string, amount: number): string {
  const [baseRed, baseGreen, baseBlue] = hexToRgbTuple(baseHex)
  const [targetRed, targetGreen, targetBlue] = hexToRgbTuple(targetHex)
  const alpha = clampUnit(amount)

  const red = Math.round(baseRed + (targetRed - baseRed) * alpha)
  const green = Math.round(baseGreen + (targetGreen - baseGreen) * alpha)
  const blue = Math.round(baseBlue + (targetBlue - baseBlue) * alpha)

  const toHex = (channel: number): string => channel.toString(16).padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function findPresetById(presetId: string): ThemePreset | null {
  return THEME_PRESETS.find((preset) => preset.id === presetId) ?? null
}

function createDefaultThemeState(): ThemePageState {
  const colors = normalizeThemeColors(DEFAULT_THEME_COLORS)
  return {
    colors,
    rawColors: toRawThemeColors(colors),
    interiorHeroOverlayOpacity: '',
    fontBody: DEFAULT_THEME_FONT_BODY,
    fontHeading: DEFAULT_THEME_FONT_HEADING,
  }
}

function createThemeStateForPreset(preset: ThemePreset, currentThemeState: ThemePageState): ThemePageState {
  const colors = normalizeThemeColors(preset.colors)
  return {
    colors,
    rawColors: toRawThemeColors(colors),
    interiorHeroOverlayOpacity: '',
    fontBody: normalizeThemeScalar(currentThemeState.fontBody) || DEFAULT_THEME_FONT_BODY,
    fontHeading: normalizeThemeScalar(currentThemeState.fontHeading) || DEFAULT_THEME_FONT_HEADING,
  }
}

function hasNonPresetOverrides(themeState: ThemePageState): boolean {
  if (themeState.interiorHeroOverlayOpacity.length > 0) return true
  return false
}

function rawColorsMatchPreset(rawColors: ThemeRawColorMap, presetColors: ThemeColorMap): boolean {
  return THEME_COLOR_KEYS.every((key) => {
    const rawNormalized = normalizeHexColorExact(rawColors[key])
    const presetNormalized = normalizeHexColorExact(presetColors[key])
    return Boolean(rawNormalized && presetNormalized && rawNormalized === presetNormalized)
  })
}

function findMatchingPresetId(themeState: ThemePageState): string | null {
  if (hasNonPresetOverrides(themeState)) return null
  const matched = THEME_PRESETS.find((preset) => rawColorsMatchPreset(themeState.rawColors, preset.colors))
  return matched?.id ?? null
}

function readThemeStateFromPage(): ThemePageState | null {
  const script = document.getElementById(THEME_DATA_SCRIPT_ID)
  if (!script?.textContent) return null

  try {
    const parsed = JSON.parse(script.textContent)
    if (!parsed || typeof parsed !== 'object') return null

    const record = parsed as {
      colors?: Partial<Record<ThemeColorKey, unknown>>
      rawColors?: Partial<Record<ThemeColorKey, unknown>>
      interiorHeroOverlayOpacity?: unknown
      fontBody?: unknown
      fontHeading?: unknown
    }
    if (!record.colors || typeof record.colors !== 'object') return null

    const resolvedColors = normalizeThemeColors(record.colors)
    const rawColors =
      record.rawColors && typeof record.rawColors === 'object'
        ? normalizeThemeRawColors(record.rawColors)
        : toRawThemeColors(resolvedColors)

    return {
      colors: resolvedColors,
      rawColors,
      interiorHeroOverlayOpacity: normalizeThemeScalar(record.interiorHeroOverlayOpacity),
      fontBody: normalizeThemeScalar(record.fontBody) || DEFAULT_THEME_FONT_BODY,
      fontHeading: normalizeThemeScalar(record.fontHeading) || DEFAULT_THEME_FONT_HEADING,
    }
  } catch {
    return null
  }
}

function toThemeCssVars(colors: ThemeColorMap): Record<string, string> {
  const [backgroundRed, backgroundGreen, backgroundBlue] = hexToRgbTuple(colors.colorBackground)
  const [backgroundSoftRed, backgroundSoftGreen, backgroundSoftBlue] = hexToRgbTuple(colors.colorBackgroundSoft)
  const [accentRed, accentGreen, accentBlue] = hexToRgbTuple(colors.colorAccent)
  const [accentStrongRed, accentStrongGreen, accentStrongBlue] = hexToRgbTuple(colors.colorAccentStrong)
  const [buttonRed, buttonGreen, buttonBlue] = hexToRgbTuple(colors.colorButton)
  const surfaceColor = mixHex(colors.colorBackgroundSoft, colors.colorText, 0.03)
  const surfaceSoftColor = mixHex(colors.colorBackgroundSoft, colors.colorText, 0.08)
  const lineColor = mixHex(colors.colorBackgroundSoft, colors.colorAccent, 0.2)

  return {
    '--bg-r': String(backgroundRed),
    '--bg-g': String(backgroundGreen),
    '--bg-b': String(backgroundBlue),
    '--bg-soft-r': String(backgroundSoftRed),
    '--bg-soft-g': String(backgroundSoftGreen),
    '--bg-soft-b': String(backgroundSoftBlue),
    '--bg': colors.colorBackground,
    '--bg-soft': colors.colorBackgroundSoft,
    '--surface': surfaceColor,
    '--surface-soft': surfaceSoftColor,
    '--line': lineColor,
    '--ink': colors.colorText,
    '--ink-soft': colors.colorTextMuted,
    '--accent': colors.colorAccent,
    '--accent-strong': colors.colorAccentStrong,
    '--button-bg': colors.colorButton,
    '--button-ink': colors.colorButtonText,
    '--accent-rgb': `${accentRed} ${accentGreen} ${accentBlue}`,
    '--accent-strong-rgb': `${accentStrongRed} ${accentStrongGreen} ${accentStrongBlue}`,
    '--button-rgb': `${buttonRed} ${buttonGreen} ${buttonBlue}`,
  }
}

function normalizeOverlayCssValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return ''
  const clamped = Math.min(1, Math.max(0, parsed))
  return String(Math.round(clamped * 1000) / 1000)
}

function applyThemeState(themeState: ThemePageState): void {
  const nextVars = toThemeCssVars(normalizeThemeColors(themeState.colors))
  const rootStyle = document.documentElement.style
  Object.entries(nextVars).forEach(([name, value]) => {
    rootStyle.setProperty(name, value)
  })

  const overlayValue = normalizeOverlayCssValue(themeState.interiorHeroOverlayOpacity)
  if (overlayValue.length > 0) {
    rootStyle.setProperty('--interior-hero-overlay-opacity', overlayValue)
  } else {
    rootStyle.removeProperty('--interior-hero-overlay-opacity')
  }

  const fontBody = normalizeThemeScalar(themeState.fontBody) || DEFAULT_THEME_FONT_BODY
  const fontHeading = normalizeThemeScalar(themeState.fontHeading) || DEFAULT_THEME_FONT_HEADING
  rootStyle.setProperty('--font-body', resolveThemeFontFamily(fontBody, DEFAULT_THEME_FONT_BODY))
  rootStyle.setProperty('--font-heading', resolveThemeFontFamily(fontHeading, DEFAULT_THEME_FONT_HEADING))
  const immersiveButtonLabelShifts = resolveImmersiveButtonLabelShifts(fontHeading, DEFAULT_THEME_FONT_HEADING)
  rootStyle.setProperty('--immersive-btn-label-shift-standard', immersiveButtonLabelShifts.standard)
  rootStyle.setProperty('--immersive-btn-label-shift-control', immersiveButtonLabelShifts.control)
}

function getThemePresetApiUrls(): string[] {
  const urls: string[] = []
  const host = window.location.hostname || 'localhost'
  const keystaticUrl = `${window.location.protocol}//${host}:${KEYSTATIC_PORT}${THEME_PRESET_API_PATH}`
  urls.push(keystaticUrl)

  const currentOriginUrl = new URL(THEME_PRESET_API_PATH, window.location.origin).toString()
  if (!urls.includes(currentOriginUrl)) urls.push(currentOriginUrl)

  return urls
}

async function persistThemePreset(themeState: ThemePageState): Promise<void> {
  const apiUrls = getThemePresetApiUrls()
  let lastError: unknown = null

  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          colors: themeState.colors,
          interiorHeroOverlayOpacity: themeState.interiorHeroOverlayOpacity,
          fontBody: themeState.fontBody,
          fontHeading: themeState.fontHeading,
        }),
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

  throw lastError instanceof Error ? lastError : new Error('Failed to persist theme colors.')
}

export default defineToolbarApp({
  init(canvas, app) {
    const windowElement = document.createElement('astro-dev-toolbar-window')
    windowElement.innerHTML = `
      <style>
        :host astro-dev-toolbar-window {
          color-scheme: dark;
          min-height: 248px;
        }
        h1 {
          margin: 0 0 0.4rem;
          font-size: 1.05rem;
          color: #fff;
          font-weight: 600;
        }
        p {
          margin: 0 0 0.8rem;
          color: #c8d4de;
          line-height: 1.4;
          font-size: 0.9rem;
        }
        label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          color: #fff;
          font-size: 0.92rem;
        }
        .preset-description {
          margin: 0.75rem 0 0.9rem;
          color: #9eb3c2;
          font-size: 0.8rem;
          line-height: 1.35;
          min-height: 2.2em;
        }
        .actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.2rem;
        }
        button {
          appearance: none;
          border: 1px solid #4f6472;
          background: #16202a;
          color: #fff;
          border-radius: 0.48rem;
          padding: 0.45rem 0.72rem;
          font-size: 0.82rem;
          cursor: pointer;
        }
        button[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .status {
          margin-top: 0.7rem;
          margin-bottom: 0;
          min-height: 1.2em;
          font-size: 0.78rem;
          color: #9eb3c2;
        }
        .status[data-tone='success'] {
          color: #a5d6b6;
        }
        .status[data-tone='error'] {
          color: #ffc3be;
        }
      </style>
      <h1>Theme Presets</h1>
      <p>Preview accessible palettes instantly. Use Apply to save changes.</p>
      <label data-select-row>
        <span>Preset</span>
      </label>
      <p class="preset-description" data-preset-description></p>
      <div class="actions">
        <button type="button" data-revert-button>Revert</button>
        <button type="button" data-apply-button>Apply</button>
      </div>
      <p class="status" data-status aria-live="polite"></p>
    `

    const selectRow = windowElement.querySelector('[data-select-row]')
    const presetDescription = windowElement.querySelector('[data-preset-description]') as HTMLParagraphElement | null
    const statusElement = windowElement.querySelector('[data-status]') as HTMLParagraphElement | null
    const revertButton = windowElement.querySelector('[data-revert-button]') as HTMLButtonElement | null
    const applyButton = windowElement.querySelector('[data-apply-button]') as HTMLButtonElement | null
    const select = document.createElement('astro-dev-toolbar-select') as HTMLElement & { element: HTMLSelectElement }

    let persistedThemeState = readThemeStateFromPage() ?? createDefaultThemeState()
    let hasUnsavedPreview = false
    let pendingApply = false

    const setStatus = (message: string, tone: 'info' | 'success' | 'error' = 'info'): void => {
      if (!statusElement) return
      statusElement.textContent = message
      statusElement.dataset.tone = tone
    }

    const setPresetDescription = (presetId: string): void => {
      if (!presetDescription) return
      if (presetId === CUSTOM_PRESET_ID) {
        presetDescription.textContent = 'Custom theme values from source/site/theme.yaml.'
        return
      }
      const preset = findPresetById(presetId)
      presetDescription.textContent = preset?.description ?? ''
    }

    const shouldIncludeCurrentThemeOption = (): boolean => findMatchingPresetId(persistedThemeState) === null

    const populatePresetOptions = (): void => {
      select.element.options.length = 0

      if (shouldIncludeCurrentThemeOption()) {
        const currentOption = document.createElement('option')
        currentOption.value = CUSTOM_PRESET_ID
        currentOption.textContent = 'Custom'
        select.element.add(currentOption)
      }

      THEME_PRESETS.forEach((preset) => {
        const option = document.createElement('option')
        option.value = preset.id
        option.textContent = preset.label
        select.element.add(option)
      })
    }

    const syncSelectToPersistedTheme = (): void => {
      const matchingPresetId = findMatchingPresetId(persistedThemeState)
      const nextValue = matchingPresetId ?? (shouldIncludeCurrentThemeOption() ? CUSTOM_PRESET_ID : THEME_PRESETS[0]?.id)
      if (typeof nextValue === 'string' && nextValue.length > 0) {
        select.element.value = nextValue
      }
      setPresetDescription(select.element.value)
    }

    const updateActionState = (): void => {
      if (applyButton) {
        const selectedPreset = findPresetById(select.element.value)
        const selectedMatchesPersisted = selectedPreset ? findMatchingPresetId(persistedThemeState) === selectedPreset.id : true
        applyButton.disabled = pendingApply || !hasUnsavedPreview || !selectedPreset || selectedMatchesPersisted
      }
      if (revertButton) {
        revertButton.disabled = pendingApply || !hasUnsavedPreview
      }
    }

    const applySelectedPreview = (): void => {
      const selectedValue = select.element.value
      setPresetDescription(selectedValue)

      if (selectedValue === CUSTOM_PRESET_ID) {
        applyThemeState(persistedThemeState)
        hasUnsavedPreview = false
        setStatus('Showing current saved theme.')
        updateActionState()
        return
      }

      const preset = findPresetById(selectedValue)
      if (!preset) {
        setStatus('Unknown preset.', 'error')
        return
      }

      const presetThemeState = createThemeStateForPreset(preset, persistedThemeState)
      applyThemeState(presetThemeState)
      hasUnsavedPreview = findMatchingPresetId(persistedThemeState) !== preset.id
      setStatus(hasUnsavedPreview ? 'Preview active. Click Apply to save.' : 'This preset is already saved.')
      updateActionState()
    }

    const revertPreview = (): void => {
      applyThemeState(persistedThemeState)
      hasUnsavedPreview = false
      populatePresetOptions()
      syncSelectToPersistedTheme()
      setStatus('Preview reverted. No file changes were made.')
      updateActionState()
    }

    const applyPreset = async (): Promise<void> => {
      const preset = findPresetById(select.element.value)
      if (!preset || !hasUnsavedPreview) return

      pendingApply = true
      updateActionState()
      setStatus('Applying preset...')

      try {
        const nextPresetState = createThemeStateForPreset(preset, persistedThemeState)
        await persistThemePreset(nextPresetState)
        persistedThemeState = nextPresetState
        hasUnsavedPreview = false
        populatePresetOptions()
        const matchingPresetId = findMatchingPresetId(persistedThemeState)
        const nextValue = matchingPresetId ?? (shouldIncludeCurrentThemeOption() ? CUSTOM_PRESET_ID : preset.id)
        select.element.value = nextValue
        setPresetDescription(nextValue)
        applyThemeState(persistedThemeState)
        setStatus('Preset applied to source/site/theme.yaml.', 'success')
      } catch (error) {
        console.warn('Failed to persist theme preset.', error)
        setStatus('Could not save preset. Please try again.', 'error')
      } finally {
        pendingApply = false
        updateActionState()
      }
    }

    const refreshFromPageData = (): void => {
      const nextTheme = readThemeStateFromPage()
      if (!nextTheme) return
      persistedThemeState = nextTheme
      if (!hasUnsavedPreview) {
        applyThemeState(persistedThemeState)
        populatePresetOptions()
        syncSelectToPersistedTheme()
        updateActionState()
      }
    }

    select.element.addEventListener('change', applySelectedPreview)
    revertButton?.addEventListener('click', revertPreview)
    applyButton?.addEventListener('click', () => {
      void applyPreset()
    })

    app.onToggled(({ state }: { state: boolean }) => {
      if (state) {
        refreshFromPageData()
        if (!hasUnsavedPreview) {
          populatePresetOptions()
          syncSelectToPersistedTheme()
          setStatus('Select a preset to preview. Apply saves the change.')
          updateActionState()
        }
        window.requestAnimationFrame(() => {
          focusElement(select.element)
        })
        return
      }

      if (hasUnsavedPreview) {
        revertPreview()
      }
    })

    document.addEventListener('astro:after-swap', refreshFromPageData)
    document.addEventListener('astro:page-load', refreshFromPageData)

    populatePresetOptions()
    syncSelectToPersistedTheme()
    setStatus('Select a preset to preview. Apply saves the change.')
    updateActionState()

    selectRow?.append(select)
    canvas.append(windowElement)
  },
})
