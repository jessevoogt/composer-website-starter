export const DEFAULT_THEME_FONT_BODY = 'Atkinson Hyperlegible'
export const DEFAULT_THEME_FONT_HEADING = 'Gothic A1'

const FALLBACK_STACK_SANS = '"Avenir Next", "Helvetica Neue", Arial, sans-serif'
const FALLBACK_STACK_SERIF = 'Georgia, "Times New Roman", serif'
const SYSTEM_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

type ThemeFontMetadata = {
  label: string
  cssFamily: string
  googleCss2Family?: string
  immersiveButtonLabelShift?: ThemeImmersiveButtonLabelShift
}

type ThemeImmersiveButtonLabelShift = {
  standard: string
  control: string
}

const DEFAULT_IMMERSIVE_BUTTON_LABEL_SHIFT: ThemeImmersiveButtonLabelShift = {
  standard: '0',
  control: '0',
}

export const THEME_FONT_CATALOG = {
  'Atkinson Hyperlegible': {
    label: 'Atkinson Hyperlegible',
    cssFamily: `'Atkinson Hyperlegible', ${FALLBACK_STACK_SANS}`,
  },
  'Gothic A1': {
    label: 'Gothic A1',
    cssFamily: `'Gothic A1', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Gothic+A1:wght@400;500;600;700',
    immersiveButtonLabelShift: {
      standard: '0.045em',
      control: '0.055em',
    },
  },
  Archivo: {
    label: 'Archivo',
    cssFamily: `'Archivo', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Barlow: {
    label: 'Barlow',
    cssFamily: `'Barlow', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Bitter: {
    label: 'Bitter',
    cssFamily: `'Bitter', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'Bitter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'DM Sans': {
    label: 'DM Sans',
    cssFamily: `'DM Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700',
  },
  'Fira Sans': {
    label: 'Fira Sans',
    cssFamily: `'Fira Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Fira+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'IBM Plex Sans': {
    label: 'IBM Plex Sans',
    cssFamily: `'IBM Plex Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'IBM Plex Serif': {
    label: 'IBM Plex Serif',
    cssFamily: `'IBM Plex Serif', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Inter: {
    label: 'Inter',
    cssFamily: `'Inter', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Karla: {
    label: 'Karla',
    cssFamily: `'Karla', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Karla:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Lato: {
    label: 'Lato',
    cssFamily: `'Lato', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Lato:ital,wght@0,400;0,700;1,400;1,700',
  },
  Lora: {
    label: 'Lora',
    cssFamily: `'Lora', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Manrope: {
    label: 'Manrope',
    cssFamily: `'Manrope', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Manrope:wght@400;500;600;700',
  },
  Merriweather: {
    label: 'Merriweather',
    cssFamily: `'Merriweather', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700',
  },
  Montserrat: {
    label: 'Montserrat',
    cssFamily: `'Montserrat', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Mulish: {
    label: 'Mulish',
    cssFamily: `'Mulish', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Mulish:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Nunito: {
    label: 'Nunito',
    cssFamily: `'Nunito', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Nunito:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'Noto Sans': {
    label: 'Noto Sans',
    cssFamily: `'Noto Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'Noto Serif': {
    label: 'Noto Serif',
    cssFamily: `'Noto Serif', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'Noto+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'Open Sans': {
    label: 'Open Sans',
    cssFamily: `'Open Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Oswald: {
    label: 'Oswald',
    cssFamily: `'Oswald', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Oswald:wght@400;500;600;700',
  },
  'Playfair Display': {
    label: 'Playfair Display',
    cssFamily: `'Playfair Display', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Poppins: {
    label: 'Poppins',
    cssFamily: `'Poppins', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'PT Sans': {
    label: 'PT Sans',
    cssFamily: `'PT Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'PT+Sans:ital,wght@0,400;0,700;1,400;1,700',
  },
  'PT Serif': {
    label: 'PT Serif',
    cssFamily: `'PT Serif', ${FALLBACK_STACK_SERIF}`,
    googleCss2Family: 'PT+Serif:ital,wght@0,400;0,700;1,400;1,700',
  },
  Raleway: {
    label: 'Raleway',
    cssFamily: `'Raleway', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Raleway:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  Roboto: {
    label: 'Roboto',
    cssFamily: `'Roboto', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Roboto:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700',
  },
  Rubik: {
    label: 'Rubik',
    cssFamily: `'Rubik', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Rubik:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'Source Sans 3': {
    label: 'Source Sans 3',
    cssFamily: `'Source Sans 3', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'Space Grotesk': {
    label: 'Space Grotesk',
    cssFamily: `'Space Grotesk', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Space+Grotesk:wght@400;500;600;700',
  },
  Ubuntu: {
    label: 'Ubuntu',
    cssFamily: `'Ubuntu', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Ubuntu:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700',
  },
  'Work Sans': {
    label: 'Work Sans',
    cssFamily: `'Work Sans', ${FALLBACK_STACK_SANS}`,
    googleCss2Family: 'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  'system-ui': {
    label: 'System default',
    cssFamily: SYSTEM_FONT_STACK,
  },
} as const satisfies Record<string, ThemeFontMetadata>

export type ThemeFontValue = keyof typeof THEME_FONT_CATALOG

type ThemeFontSelection = {
  value: string | undefined
  fallback: ThemeFontValue
}

function isThemeFontValue(value: string): value is ThemeFontValue {
  return value in THEME_FONT_CATALOG
}

export function normalizeThemeFontValue(value: string | undefined, fallback: ThemeFontValue): ThemeFontValue {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (isThemeFontValue(normalized)) return normalized
  return fallback
}

export function resolveThemeFontFamily(value: string | undefined, fallback: ThemeFontValue): string {
  const normalized = normalizeThemeFontValue(value, fallback)
  return THEME_FONT_CATALOG[normalized].cssFamily
}

export function resolveImmersiveButtonLabelShifts(
  value: string | undefined,
  fallback: ThemeFontValue,
): ThemeImmersiveButtonLabelShift {
  const normalized = normalizeThemeFontValue(value, fallback)
  const metadata = THEME_FONT_CATALOG[normalized]
  if ('immersiveButtonLabelShift' in metadata) {
    return metadata.immersiveButtonLabelShift ?? DEFAULT_IMMERSIVE_BUTTON_LABEL_SHIFT
  }
  return DEFAULT_IMMERSIVE_BUTTON_LABEL_SHIFT
}

export function getThemeGoogleFontsStylesheetHref(
  selections: readonly ThemeFontSelection[],
): string | undefined {
  const families = new Set<string>()

  for (const selection of selections) {
    const normalized = normalizeThemeFontValue(selection.value, selection.fallback)
    const metadata = THEME_FONT_CATALOG[normalized]
    if ('googleCss2Family' in metadata && typeof metadata.googleCss2Family === 'string') {
      families.add(metadata.googleCss2Family)
    }
  }

  if (families.size === 0) return undefined

  const query = Array.from(families)
    .map((family) => `family=${family}`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

export const THEME_FONT_SELECT_OPTIONS: ReadonlyArray<{ label: string; value: ThemeFontValue }> = Object.entries(
  THEME_FONT_CATALOG,
).map(([value, metadata]) => ({
  label: metadata.label,
  value: value as ThemeFontValue,
}))
