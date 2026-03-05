import type { ThemeColorMap } from './theme-presets'
import { DEFAULT_THEME_COLORS, resolveRadiusOverride, resolveRadiusTokens } from './theme-presets'

export function normalizeHexColorExact(value: string | undefined): string | null {
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

export function normalizeHexColor(value: string | undefined, fallback: string): string {
  return normalizeHexColorExact(value) ?? fallback
}

export function hexToRgbTuple(value: string): [number, number, number] {
  const normalized = normalizeHexColor(value, '#000000').slice(1)
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return [red, green, blue]
}

/**
 * WCAG relative luminance from sRGB.
 * Used to determine whether a background is "light" or "dark" for
 * the CSS `color-scheme` property and browser-native UI rendering.
 */
function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * srgbChannelToLinear(red) + 0.7152 * srgbChannelToLinear(green) + 0.0722 * srgbChannelToLinear(blue)
}

function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function mixHex(baseHex: string, targetHex: string, amount: number): string {
  const [baseRed, baseGreen, baseBlue] = hexToRgbTuple(baseHex)
  const [targetRed, targetGreen, targetBlue] = hexToRgbTuple(targetHex)
  const alpha = clampUnit(amount)

  const red = Math.round(baseRed + (targetRed - baseRed) * alpha)
  const green = Math.round(baseGreen + (targetGreen - baseGreen) * alpha)
  const blue = Math.round(baseBlue + (targetBlue - baseBlue) * alpha)

  const toHex = (channel: number): string => channel.toString(16).padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

export function normalizeThemeColors(input: Partial<Record<string, unknown>>): ThemeColorMap {
  return {
    colorBackground: normalizeHexColor(
      input.colorBackground as string | undefined,
      DEFAULT_THEME_COLORS.colorBackground,
    ),
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

/** WCAG contrast ratio between two relative luminance values. */
function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Default focus-ring colors: orange for dark themes, blue for light themes. */
const FOCUS_RING_DARK = '#ff9f3f'
const FOCUS_RING_LIGHT = '#2563eb'

/** Minimum contrast ratio for ghost button text (WCAG AA normal text). */
const GHOST_BTN_MIN_CONTRAST = 4.5

function resolveAboutProfileImagePosition(position: string | undefined): string {
  switch (position) {
    case 'top-left':
      return '18% 12%'
    case 'top-center':
      return '50% 12%'
    case 'top-right':
      return '82% 12%'
    case 'center-left':
      return '18% 22%'
    case 'center-right':
      return '82% 22%'
    case 'bottom-left':
      return '18% 38%'
    case 'bottom-center':
      return '50% 38%'
    case 'bottom-right':
      return '82% 38%'
    case 'center':
    default:
      return '50% 22%'
  }
}

function resolveAboutGridInlineMargin(position: string | undefined): string {
  if (position === 'left') return '0 auto'
  if (position === 'right') return 'auto 0'
  return 'auto'
}

function resolveAboutGridMaxWidth(maxWidth: string | undefined): string {
  switch (maxWidth) {
    case 'compact':
      return '56rem'
    case 'standard':
      return '72rem'
    case 'full':
    default:
      return '100%'
  }
}

function resolveContactPageJustify(position: string | undefined): string {
  return position?.startsWith('top-') ? 'flex-start' : 'center'
}

function resolveContactStageInlineMargin(position: string | undefined): string {
  if (position?.endsWith('-left')) return '0 auto'
  if (position?.endsWith('-right')) return 'auto 0'
  return 'auto'
}

function resolveContactWidthVars(maxWidth: string | undefined): { stage: string; email: string } {
  switch (maxWidth) {
    case 'compact':
      return { stage: '44rem', email: '28rem' }
    case 'wide':
      return { stage: '68rem', email: '40rem' }
    case 'default':
    default:
      return { stage: '56rem', email: '33rem' }
  }
}

export function toThemeCssVars(
  colors: ThemeColorMap,
  borderRadius: string,
  focusRingOverride?: string,
  ctaBackgroundOverride?: string,
  ctaTextOverride?: string,
  navActiveUnderlineOverride?: string,
  navActiveTextOverride?: string,
  navHoverUnderlineOverride?: string,
  navHoverTextOverride?: string,
  scrimColorOverride?: string,
  disableImageOverlays = false,
  playerBorderRadiusOverride?: string,
  socialIconBorderRadiusOverride?: string,
  profileImageBorderRadiusOverride?: string,
  tagBadgeBorderRadiusOverride?: string,
  aboutProfileImagePosition?: string,
  aboutPagePosition?: string,
  aboutPageMaxWidth?: string,
  contactPagePosition?: string,
  contactPageMaxWidth?: string,
): Record<string, string> {
  const [backgroundRed, backgroundGreen, backgroundBlue] = hexToRgbTuple(colors.colorBackground)
  const [backgroundSoftRed, backgroundSoftGreen, backgroundSoftBlue] = hexToRgbTuple(colors.colorBackgroundSoft)
  const [accentRed, accentGreen, accentBlue] = hexToRgbTuple(colors.colorAccent)
  const [accentStrongRed, accentStrongGreen, accentStrongBlue] = hexToRgbTuple(colors.colorAccentStrong)
  const [buttonRed, buttonGreen, buttonBlue] = hexToRgbTuple(colors.colorButton)
  const [inkRed, inkGreen, inkBlue] = hexToRgbTuple(colors.colorText)
  const surfaceColor = mixHex(colors.colorBackgroundSoft, colors.colorText, 0.03)
  const surfaceSoftColor = mixHex(colors.colorBackgroundSoft, colors.colorText, 0.08)
  const lineColor = mixHex(colors.colorBackgroundSoft, colors.colorAccent, 0.2)
  const radius = resolveRadiusTokens(borderRadius)
  const isDark = relativeLuminance(backgroundRed, backgroundGreen, backgroundBlue) <= 0.18
  const colorScheme = isDark ? 'dark' : 'light'
  const focusRingColor =
    (focusRingOverride ? normalizeHexColorExact(focusRingOverride) : null) ??
    (isDark ? FOCUS_RING_DARK : FOCUS_RING_LIGHT)

  // Ghost button text: prefer accent-strong (bolder on dark themes) but fall
  // back to accent when accent-strong lacks contrast against the background
  // (e.g. Concert Hall's brass on cream).
  const bgLuminance = relativeLuminance(backgroundRed, backgroundGreen, backgroundBlue)
  const accentStrongLuminance = relativeLuminance(accentStrongRed, accentStrongGreen, accentStrongBlue)
  const accentStrongContrast = contrastRatio(bgLuminance, accentStrongLuminance)
  const ghostBtnColor = accentStrongContrast >= GHOST_BTN_MIN_CONTRAST ? colors.colorAccentStrong : colors.colorAccent
  const [ghostRed, ghostGreen, ghostBlue] = hexToRgbTuple(ghostBtnColor)

  // CTA button: use explicit override when provided (e.g. an explicit orange CTA),
  // otherwise fall back to the theme's primary button color.
  const ctaBg = (ctaBackgroundOverride ? normalizeHexColorExact(ctaBackgroundOverride) : null) ?? colors.colorButton
  const ctaInk = (ctaTextOverride ? normalizeHexColorExact(ctaTextOverride) : null) ?? colors.colorButtonText

  // Active nav-link overrides: allow presets to tint the underline and text of the
  // current-page nav item independently. Defaults mirror the existing CSS values.
  const navActiveUnderline =
    (navActiveUnderlineOverride ? normalizeHexColorExact(navActiveUnderlineOverride) : null) ?? colors.colorAccent
  const navActiveText = (navActiveTextOverride ? normalizeHexColorExact(navActiveTextOverride) : null) ?? ghostBtnColor

  // Hover nav-link overrides: allow presets to tint the underline and text of
  // hovered nav items independently. Defaults mirror the existing CSS values.
  const navHoverUnderline =
    (navHoverUnderlineOverride ? normalizeHexColorExact(navHoverUnderlineOverride) : null) ?? colors.colorAccent
  const navHoverText = (navHoverTextOverride ? normalizeHexColorExact(navHoverTextOverride) : null) ?? ghostBtnColor

  // Scrim/overlay color: used for hero and image gradient overlays.
  // Defaults to background color; presets can darken for heavier scrims.
  const scrimHex = (scrimColorOverride ? normalizeHexColorExact(scrimColorOverride) : null) ?? colors.colorBackground
  const [scrimRed, scrimGreen, scrimBlue] = hexToRgbTuple(scrimHex)

  // Player and social icons can opt into their own radius tokens.
  const playerRadius = resolveRadiusOverride(playerBorderRadiusOverride, radius.lg)
  const socialIconRadius = resolveRadiusOverride(socialIconBorderRadiusOverride, radius.lg)
  const profileImageRadius = resolveRadiusOverride(profileImageBorderRadiusOverride, '999px', 'xl')
  const tagBadgeRadius = resolveRadiusOverride(tagBadgeBorderRadiusOverride, '999px', 'md')
  const contactWidths = resolveContactWidthVars(contactPageMaxWidth)

  return {
    '--color-scheme': colorScheme,
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
    '--ink-rgb': `${inkRed} ${inkGreen} ${inkBlue}`,
    '--accent': colors.colorAccent,
    '--accent-strong': colors.colorAccentStrong,
    '--btn-ghost': ghostBtnColor,
    '--btn-ghost-rgb': `${ghostRed} ${ghostGreen} ${ghostBlue}`,
    '--button-bg': colors.colorButton,
    '--button-ink': colors.colorButtonText,
    '--cta-bg': ctaBg,
    '--cta-ink': ctaInk,
    '--nav-active-underline': navActiveUnderline,
    '--nav-active-text': navActiveText,
    '--nav-hover-underline': navHoverUnderline,
    '--nav-hover-text': navHoverText,
    '--scrim-rgb': `${scrimRed} ${scrimGreen} ${scrimBlue}`,
    '--image-overlay-opacity': disableImageOverlays ? '0' : '1',
    '--accent-rgb': `${accentRed} ${accentGreen} ${accentBlue}`,
    '--accent-strong-rgb': `${accentStrongRed} ${accentStrongGreen} ${accentStrongBlue}`,
    '--button-rgb': `${buttonRed} ${buttonGreen} ${buttonBlue}`,
    '--glow-on': isDark ? '1' : '0',
    '--focus-ring-color': focusRingColor,
    '--radius-sm': radius.sm,
    '--radius-md': radius.md,
    '--radius-lg': radius.lg,
    '--radius-xl': radius.xl,
    '--player-radius': playerRadius,
    '--social-icon-radius': socialIconRadius,
    '--about-profile-radius': profileImageRadius,
    '--about-grid-max-width': resolveAboutGridMaxWidth(aboutPageMaxWidth),
    '--about-grid-inline-margin': resolveAboutGridInlineMargin(aboutPagePosition),
    '--about-profile-position': resolveAboutProfileImagePosition(aboutProfileImagePosition),
    '--tag-badge-radius': tagBadgeRadius,
    '--contact-stage-max-width': contactWidths.stage,
    '--contact-email-max-width': contactWidths.email,
    '--contact-stage-inline-margin': resolveContactStageInlineMargin(contactPagePosition),
    '--contact-page-justify': resolveContactPageJustify(contactPagePosition),
  }
}

export function toThemeStyleString(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
}
