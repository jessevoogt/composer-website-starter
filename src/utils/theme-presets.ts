import type { ThemeFontValue } from './theme-fonts'

export const THEME_COLOR_KEYS = [
  'colorBackground',
  'colorBackgroundSoft',
  'colorText',
  'colorTextMuted',
  'colorAccent',
  'colorAccentStrong',
  'colorButton',
  'colorButtonText',
] as const

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type ThemeColorMap = Record<ThemeColorKey, string>

export const BORDER_RADIUS_VALUES = ['none', 'subtle', 'soft', 'rounded', 'round', 'pill'] as const
export type BorderRadiusValue = (typeof BORDER_RADIUS_VALUES)[number]

export interface BorderRadiusTokens {
  sm: string
  md: string
  lg: string
  xl: string
}

const BORDER_RADIUS_SCALE: Record<BorderRadiusValue, BorderRadiusTokens> = {
  none: { sm: '0', md: '0', lg: '0', xl: '0' },
  subtle: { sm: '0.15rem', md: '0.3rem', lg: '0.5rem', xl: '0.8rem' },
  soft: { sm: '0.25rem', md: '0.45rem', lg: '0.7rem', xl: '1rem' },
  rounded: { sm: '0.4rem', md: '0.65rem', lg: '0.95rem', xl: '1.4rem' },
  round: { sm: '0.55rem', md: '0.85rem', lg: '1.25rem', xl: '1.9rem' },
  pill: { sm: '0.75rem', md: '1.15rem', lg: '1.7rem', xl: '999px' },
}

export const BORDER_RADIUS_OPTIONS = [
  { value: 'none' as const, label: 'None (sharp corners)' },
  { value: 'subtle' as const, label: 'Subtle' },
  { value: 'soft' as const, label: 'Soft' },
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'round' as const, label: 'Rounder' },
  { value: 'pill' as const, label: 'Pill' },
]

export const RADIUS_OVERRIDE_OPTIONS = [
  { value: '', label: 'Match theme default' },
  ...BORDER_RADIUS_OPTIONS,
]

export const SOCIAL_ICON_RADIUS_OPTIONS = [
  { value: '', label: 'Match theme default' },
  { value: 'circle', label: 'Circle' },
  ...BORDER_RADIUS_OPTIONS,
]

export const TAG_BADGE_RADIUS_OPTIONS = [
  { value: '', label: 'Match theme default' },
  { value: 'circle', label: 'Pill (fully rounded)' },
  ...BORDER_RADIUS_OPTIONS,
]

export function isBorderRadiusValue(value: string): value is BorderRadiusValue {
  return (BORDER_RADIUS_VALUES as readonly string[]).includes(value)
}

export function resolveRadiusTokens(value: string | undefined): BorderRadiusTokens {
  const normalized = typeof value === 'string' ? value.trim() : 'none'
  if (isBorderRadiusValue(normalized)) return BORDER_RADIUS_SCALE[normalized]
  return BORDER_RADIUS_SCALE.none
}

export function resolveRadiusOverride(
  value: string | undefined,
  fallback: string,
  size: keyof BorderRadiusTokens = 'lg',
): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return fallback
  if (normalized === 'circle') return '999px'
  if (isBorderRadiusValue(normalized)) return BORDER_RADIUS_SCALE[normalized][size]
  return normalized
}

export const DEFAULT_THEME_COLORS: ThemeColorMap = {
  colorBackground: '#10161d',
  colorBackgroundSoft: '#141b23',
  colorText: '#ecf2f7',
  colorTextMuted: '#aab8c4',
  colorAccent: '#97c6de',
  colorAccentStrong: '#d5edf9',
  colorButton: '#89b9d3',
  colorButtonText: '#08131d',
}

export interface BrandingDefaults {
  /** Hex background color for the auto-generated favicon. */
  faviconBackground: string
  /** Hex text color for the initials on the auto-generated favicon. */
  faviconText: string
  /** SVG corner radius (0–48 on a 96×96 viewBox). 0 = square, 48 = circle. */
  faviconRadius: number
  /** Dark end of the gradient for the auto-generated social preview. */
  socialGradientStart: string
  /** Lighter end of the gradient for the auto-generated social preview. */
  socialGradientEnd: string
  /** Primary text color for the auto-generated social preview. */
  socialText: string
  /** Secondary/muted text color for the auto-generated social preview. */
  socialMuted: string
}

export interface ThemePreset {
  id: string
  label: string
  description: string
  colors: ThemeColorMap
  fontBody: ThemeFontValue
  fontHeading: ThemeFontValue
  borderRadius: BorderRadiusValue
  /** Defaults for auto-generated branding assets (favicon, social preview). */
  branding: BrandingDefaults
  /** Override the computed focus-ring color (default: orange for dark, blue for light). */
  focusRingColor?: string
  /** Override the CTA button background (defaults to colorButton). */
  ctaBackground?: string
  /** Override the CTA button text color (defaults to colorButtonText). */
  ctaText?: string
  /** Override the active nav-link underline color (defaults to --accent). */
  navActiveUnderline?: string
  /** Override the active nav-link text color (defaults to --btn-ghost). */
  navActiveText?: string
  /** Override the nav-link hover underline color (defaults to --accent). */
  navHoverUnderline?: string
  /** Override the nav-link hover text color (defaults to --btn-ghost). */
  navHoverText?: string
  /** Override the scrim/overlay RGB triplet used for hero and image gradients (defaults to --bg-rgb). */
  scrimColor?: string
  /** Disable the background-image overlay scrims entirely. */
  disableImageOverlays?: boolean
  /** Override the featured player bar border-radius (defaults to --radius-lg). */
  playerBorderRadius?: string
  /** Override the social icon border-radius (defaults to --radius-lg). */
  socialIconBorderRadius?: string
  /** Override the About page profile image border-radius (defaults to a circle). */
  profileImageBorderRadius?: string
  /** Override the tag badge border-radius (defaults to fully rounded). */
  tagBadgeBorderRadius?: string
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark-blue',
    label: 'Dark Blue',
    description: 'The default dark palette with soft blue accents. Sharp corners.',
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
    fontBody: 'Atkinson Hyperlegible',
    fontHeading: 'Gothic A1',
    borderRadius: 'none',
    branding: {
      faviconBackground: '#10161d',
      faviconText: '#ecf2f7',
      faviconRadius: 0,
      socialGradientStart: '#040812',
      socialGradientEnd: '#111e32',
      socialText: '#dce6f6',
      socialMuted: '#aebbd4',
    },
    ctaBackground: '#b45309',
    ctaText: '#ffffff',
    navActiveUnderline: '#d97706',
    navActiveText: '#d97706',
    navHoverUnderline: '#d97706',
    scrimColor: '#080e15',
    playerBorderRadius: 'rounded',
    socialIconBorderRadius: 'circle',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
  {
    id: 'concert-hall',
    label: 'Concert Hall',
    description: 'Classic warm ivory with burgundy and brass. Program-booklet energy.',
    colors: {
      colorBackground: '#f6f1e8',
      colorBackgroundSoft: '#ffffff',
      colorText: '#1a1a1a',
      colorTextMuted: '#5d5a55',
      colorAccent: '#6e0f1a',
      colorAccentStrong: '#b08d57',
      colorButton: '#6e0f1a',
      colorButtonText: '#ffffff',
    },
    fontBody: 'IBM Plex Sans',
    fontHeading: 'Cormorant Garamond',
    borderRadius: 'subtle',
    branding: {
      faviconBackground: '#6e0f1a',
      faviconText: '#f6f1e8',
      faviconRadius: 4,
      socialGradientStart: '#1a0a0d',
      socialGradientEnd: '#3a1520',
      socialText: '#f6f1e8',
      socialMuted: '#c9b89e',
    },
    focusRingColor: '#000000',
    playerBorderRadius: 'rounded',
    socialIconBorderRadius: 'circle',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
  {
    id: 'midnight-stage',
    label: 'Midnight Stage',
    description: 'Dark venue atmosphere with warm gold and cool teal. Elegant and focused.',
    colors: {
      colorBackground: '#0b0f14',
      colorBackgroundSoft: '#121926',
      colorText: '#ede7de',
      colorTextMuted: '#a7a19a',
      colorAccent: '#d2b48c',
      colorAccentStrong: '#5bd6c8',
      colorButton: '#d2b48c',
      colorButtonText: '#0b0f14',
    },
    fontBody: 'Source Sans 3',
    fontHeading: 'Playfair Display',
    borderRadius: 'none',
    branding: {
      faviconBackground: '#0f1722',
      faviconText: '#f4e8c1',
      faviconRadius: 8,
      socialGradientStart: '#060d16',
      socialGradientEnd: '#162030',
      socialText: '#ede7de',
      socialMuted: '#a7a19a',
    },
    focusRingColor: '#ffffff',
    playerBorderRadius: 'rounded',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
  {
    id: 'sheet-music-minimal',
    label: 'Sheet Music Minimal',
    description: 'Bright high-contrast white with cobalt ink. Clean and text-forward.',
    colors: {
      colorBackground: '#ffffff',
      colorBackgroundSoft: '#f6f7f9',
      colorText: '#0e0e10',
      colorTextMuted: '#4e5561',
      colorAccent: '#2d5bff',
      colorAccentStrong: '#111827',
      colorButton: '#2d5bff',
      colorButtonText: '#ffffff',
    },
    fontBody: 'IBM Plex Sans',
    fontHeading: 'IBM Plex Serif',
    borderRadius: 'none',
    branding: {
      faviconBackground: '#1e3a5f',
      faviconText: '#ffffff',
      faviconRadius: 4,
      socialGradientStart: '#0f1d30',
      socialGradientEnd: '#1e3a5f',
      socialText: '#ffffff',
      socialMuted: '#b0c4de',
    },
    playerBorderRadius: 'none',
    socialIconBorderRadius: 'none',
    profileImageBorderRadius: 'none',
    tagBadgeBorderRadius: 'none',
    navActiveUnderline: '#000000',
    navActiveText: '#000000',
    navHoverUnderline: '#0e0e10',
    navHoverText: '#0e0e10',
  },
  {
    id: 'velvet-curtain',
    label: 'Velvet Curtain',
    description: 'Deep plum-black with rose wine and lilac electric. Expressive and artsy.',
    colors: {
      colorBackground: '#141016',
      colorBackgroundSoft: '#1e1621',
      colorText: '#f2e9f3',
      colorTextMuted: '#b9aebb',
      colorAccent: '#b34a6b',
      colorAccentStrong: '#8a7cff',
      colorButton: '#b34a6b',
      colorButtonText: '#f2e9f3',
    },
    fontBody: 'DM Sans',
    fontHeading: 'Fraunces',
    borderRadius: 'subtle',
    branding: {
      faviconBackground: '#1a0a1e',
      faviconText: '#f0e6f4',
      faviconRadius: 8,
      socialGradientStart: '#0d0510',
      socialGradientEnd: '#241228',
      socialText: '#f2e9f3',
      socialMuted: '#b9aebb',
    },
    focusRingColor: '#ffffff',
    playerBorderRadius: 'rounded',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
  {
    id: 'sea-glass-modern',
    label: 'Sea Glass Modern',
    description: 'Calm teal and blue on light grey. Approachable and contemporary.',
    colors: {
      colorBackground: '#f3f7f7',
      colorBackgroundSoft: '#ffffff',
      colorText: '#102a2e',
      colorTextMuted: '#4c666b',
      colorAccent: '#0f766e',
      colorAccentStrong: '#2563eb',
      colorButton: '#0f766e',
      colorButtonText: '#ffffff',
    },
    fontBody: 'Manrope',
    fontHeading: 'Space Grotesk',
    borderRadius: 'rounded',
    branding: {
      faviconBackground: '#1a6b6a',
      faviconText: '#f5f7f6',
      faviconRadius: 12,
      socialGradientStart: '#0d3534',
      socialGradientEnd: '#1a6b6a',
      socialText: '#f3f7f7',
      socialMuted: '#a0c4c3',
    },
    playerBorderRadius: 'round',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
  {
    id: 'neon-ink',
    label: 'New Music / Neon Ink',
    description: 'Ink-black with electric cyan and magenta. Festival-poster edge.',
    colors: {
      colorBackground: '#070a12',
      colorBackgroundSoft: '#0e1424',
      colorText: '#eaf0ff',
      colorTextMuted: '#a3aec7',
      colorAccent: '#00e5ff',
      colorAccentStrong: '#ff3dcc',
      colorButton: '#00e5ff',
      colorButtonText: '#070a12',
    },
    fontBody: 'Space Grotesk',
    fontHeading: 'Bebas Neue',
    borderRadius: 'none',
    branding: {
      faviconBackground: '#0a0a0a',
      faviconText: '#00e5ff',
      faviconRadius: 0,
      socialGradientStart: '#050505',
      socialGradientEnd: '#0e1424',
      socialText: '#eaf0ff',
      socialMuted: '#a3aec7',
    },
    focusRingColor: '#ffffff',
    playerBorderRadius: 'rounded',
    profileImageBorderRadius: 'circle',
    tagBadgeBorderRadius: 'circle',
  },
]

export function findPresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}
