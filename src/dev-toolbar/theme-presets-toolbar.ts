import { defineToolbarApp } from 'astro/toolbar'
import { focusElement } from '../scripts/focus-policy'
import {
  DEFAULT_THEME_FONT_BODY,
  DEFAULT_THEME_FONT_HEADING,
  THEME_FONT_SELECT_OPTIONS,
  getThemeGoogleFontsStylesheetHref,
  resolveImmersiveButtonLabelShifts,
  resolveThemeFontFamily,
} from '../utils/theme-fonts'
import {
  BORDER_RADIUS_OPTIONS,
  DEFAULT_THEME_COLORS,
  RADIUS_OVERRIDE_OPTIONS,
  SOCIAL_ICON_RADIUS_OPTIONS,
  TAG_BADGE_RADIUS_OPTIONS,
  THEME_PRESETS,
  resolveRadiusOverride,
  resolveRadiusTokens,
} from '../utils/theme-presets'
import type { ThemeColorKey, ThemeColorMap } from '../utils/theme-presets'

const THEME_PRESET_API_PATH = '/api/dev/theme/preset'
const THEME_LIBRARY_API_PATH = '/api/dev/theme/library'
const THEME_DATA_SCRIPT_ID = 'site-theme-config-data'
const CUSTOM_THEME_ID = '__custom__'
const THEME_STUDIO_PREVIEW_PARAM = 'themeStudioPreview'
const THEME_STUDIO_PREVIEW_FRAME_NAME = '__theme-studio-preview__'
const THEME_STUDIO_PREVIEW_FONT_LINK_ID = 'theme-studio-preview-fonts'
const THEME_STUDIO_PREVIEW_STYLE_ID = 'theme-studio-preview-style'
const THEME_CUSTOM_STYLE_ID = 'site-theme-custom-css'
const THEME_STUDIO_SECTION_STATE_STORAGE_KEY = 'theme-studio-section-state-v1'
const THEME_STUDIO_WORKSPACE_STATE_STORAGE_KEY = 'theme-studio-workspace-state-v1'
const THEME_STUDIO_PANEL_WIDTH_STORAGE_KEY = 'theme-studio-panel-width-v1'
const THEME_STUDIO_WORKSPACE_ROOT_ATTR = 'data-theme-studio-workspace-root'

type ThemeRawColorMap = Record<ThemeColorKey, string>
type ThemeHomeHeroTypographyScale = 'small' | 'default' | 'large' | 'dramatic'
type ThemeHomeHeroActionStyle = 'theme-default' | 'outline' | 'solid' | 'inline'
type ThemeHomeHeroDividerGlow = 'none' | 'subtle' | 'medium' | 'strong'
type ThemeHomeHeroDividerGlowSide = 'balanced' | 'content' | 'image'
type ThemeHomeHeroLayoutMode = 'columns' | 'stacked' | 'text-only' | 'image-only' | 'centered-image'
type ThemeHomeHeroImagePosition = 'left' | 'right'
type ThemeHomeHeroColumnSplit = 'text-wide' | 'balanced' | 'image-wide'
type ThemeHomeHeroStackedImageOrder = 'first' | 'second'
type ThemeAboutPosition = 'left' | 'center' | 'right'
type ThemeAboutMaxWidth = 'compact' | 'standard' | 'full'
type ThemeAboutProfileImagePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
type ThemeContactPosition = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right'
type ThemeContactMaxWidth = 'compact' | 'default' | 'wide'

interface ThemeAboutPageState {
  position: ThemeAboutPosition
  maxWidth: ThemeAboutMaxWidth
  profileImagePosition: ThemeAboutProfileImagePosition
}

interface ThemeContactPageState {
  position: ThemeContactPosition
  maxWidth: ThemeContactMaxWidth
}

interface ThemeHomeHeroState {
  mirrorImage: boolean
  layout: {
    mode: ThemeHomeHeroLayoutMode
    columnsImagePosition: ThemeHomeHeroImagePosition
    columnSplit: ThemeHomeHeroColumnSplit
    stackedImageOrder: ThemeHomeHeroStackedImageOrder
  }
  typography: {
    titleScale: ThemeHomeHeroTypographyScale
    taglineScale: ThemeHomeHeroTypographyScale
    citationScale: ThemeHomeHeroTypographyScale
  }
  divider: {
    visible: boolean
    widthPx: number
    color: string
    glow: ThemeHomeHeroDividerGlow
    glowSide: ThemeHomeHeroDividerGlowSide
  }
  actions: {
    listenNow: ThemeHomeHeroActionStyle
    searchMusic: ThemeHomeHeroActionStyle
  }
}

interface ThemePageState {
  colors: ThemeColorMap
  rawColors: ThemeRawColorMap
  fontBody: string
  fontHeading: string
  borderRadius: string
  focusRingColor?: string
  ctaBackground?: string
  ctaText?: string
  navActiveUnderline?: string
  navActiveText?: string
  navHoverUnderline?: string
  navHoverText?: string
  scrimColor?: string
  disableImageOverlays: boolean
  playerBorderRadius?: string
  socialIconBorderRadius?: string
  profileImageBorderRadius?: string
  tagBadgeBorderRadius?: string
  customCss: string
  aboutPage: ThemeAboutPageState
  contactPage: ThemeContactPageState
  homeHero: ThemeHomeHeroState
}

interface ThemeLibraryTheme extends ThemePageState {
  id: string
  label: string
  description: string
}

interface ThemeStudioPreviewBridge {
  applyTheme: (themeState: ThemePageState, themeId?: string) => void
}

interface ThemeStudioWorkspaceState {
  isOpen: boolean
  preserveDraft: boolean
  selectedThemeId: string
  draftTheme: ThemeLibraryTheme
}

interface ThemePageData {
  themeState: ThemePageState
  currentThemeId?: string
}

const CORE_COLOR_FIELDS: ReadonlyArray<{ key: ThemeColorKey; label: string }> = [
  { key: 'colorBackground', label: 'Background' },
  { key: 'colorBackgroundSoft', label: 'Soft Background' },
  { key: 'colorText', label: 'Text' },
  { key: 'colorTextMuted', label: 'Muted Text' },
  { key: 'colorAccent', label: 'Accent' },
  { key: 'colorAccentStrong', label: 'Accent Strong' },
  { key: 'colorButton', label: 'Button' },
  { key: 'colorButtonText', label: 'Button Text' },
]

const OPTIONAL_COLOR_FIELDS: ReadonlyArray<{
  key:
    | 'focusRingColor'
    | 'ctaBackground'
    | 'ctaText'
    | 'navActiveUnderline'
    | 'navActiveText'
    | 'navHoverUnderline'
    | 'navHoverText'
    | 'scrimColor'
  label: string
  cssVar: string
  isRgbTuple?: boolean
}> = [
  { key: 'focusRingColor', label: 'Focus Ring', cssVar: '--focus-ring-color' },
  { key: 'ctaBackground', label: 'CTA Background', cssVar: '--cta-bg' },
  { key: 'ctaText', label: 'CTA Text', cssVar: '--cta-ink' },
  { key: 'navActiveUnderline', label: 'Nav Active Underline', cssVar: '--nav-active-underline' },
  { key: 'navActiveText', label: 'Nav Active Text', cssVar: '--nav-active-text' },
  { key: 'navHoverUnderline', label: 'Nav Hover Underline', cssVar: '--nav-hover-underline' },
  { key: 'navHoverText', label: 'Nav Hover Text', cssVar: '--nav-hover-text' },
  { key: 'scrimColor', label: 'Scrim', cssVar: '--scrim-rgb', isRgbTuple: true },
] as const

const HOME_HERO_TYPOGRAPHY_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroTypographyScale; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'dramatic', label: 'Dramatic' },
]

const HOME_HERO_ACTION_STYLE_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroActionStyle; label: string }> = [
  { value: 'theme-default', label: 'Default' },
  { value: 'outline', label: 'Outline' },
  { value: 'solid', label: 'Solid' },
  { value: 'inline', label: 'Inline text' },
]

const HOME_HERO_LAYOUT_MODE_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroLayoutMode; label: string }> = [
  { value: 'columns', label: 'Columns' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'text-only', label: 'Text only' },
  { value: 'image-only', label: 'Image only' },
  { value: 'centered-image', label: 'Text centered in image' },
]

const HOME_HERO_IMAGE_POSITION_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroImagePosition; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

const HOME_HERO_COLUMN_SPLIT_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroColumnSplit; label: string }> = [
  { value: 'text-wide', label: 'Image 40% / Text 60%' },
  { value: 'balanced', label: 'Image 50% / Text 50%' },
  { value: 'image-wide', label: 'Image 60% / Text 40%' },
]

const HOME_HERO_STACKED_IMAGE_ORDER_OPTIONS: ReadonlyArray<{
  value: ThemeHomeHeroStackedImageOrder
  label: string
}> = [
  { value: 'first', label: 'Image first' },
  { value: 'second', label: 'Image second' },
]

const HOME_HERO_DIVIDER_GLOW_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroDividerGlow; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

const HOME_HERO_DIVIDER_GLOW_SIDE_OPTIONS: ReadonlyArray<{ value: ThemeHomeHeroDividerGlowSide; label: string }> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'content', label: 'Content side' },
  { value: 'image', label: 'Image side' },
]

const ABOUT_PAGE_POSITION_OPTIONS: ReadonlyArray<{ value: ThemeAboutPosition; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const ABOUT_PAGE_MAX_WIDTH_OPTIONS: ReadonlyArray<{ value: ThemeAboutMaxWidth; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'full', label: 'Full width' },
]

const CONTACT_PAGE_POSITION_OPTIONS: ReadonlyArray<{ value: ThemeContactPosition; label: string }> = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'center-left', label: 'Center left' },
  { value: 'center', label: 'Center' },
  { value: 'center-right', label: 'Center right' },
]

const CONTACT_PAGE_MAX_WIDTH_OPTIONS: ReadonlyArray<{ value: ThemeContactMaxWidth; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'wide', label: 'Wide' },
]

const HERO_TITLE_SIZE_BY_SCALE: Record<ThemeHomeHeroTypographyScale, string> = {
  small: 'clamp(0.74rem, 0.74rem + 0.14vw, 0.86rem)',
  default: 'clamp(0.82rem, 0.82rem + 0.18vw, 0.95rem)',
  large: 'clamp(0.9rem, 0.86rem + 0.28vw, 1.08rem)',
  dramatic: 'clamp(1rem, 0.94rem + 0.38vw, 1.22rem)',
}

const HERO_TAGLINE_SIZE_BY_SCALE: Record<ThemeHomeHeroTypographyScale, string> = {
  small: 'clamp(1.36rem, 2.7vw, 3rem)',
  default: 'clamp(1.62rem, 3.2vw, 3.72rem)',
  large: 'clamp(1.9rem, 3.9vw, 4.4rem)',
  dramatic: 'clamp(2.15rem, 4.6vw, 5rem)',
}

const HERO_CITATION_SIZE_BY_SCALE: Record<ThemeHomeHeroTypographyScale, string> = {
  small: 'clamp(0.76rem, 0.76rem + 0.12vw, 0.88rem)',
  default: 'clamp(0.82rem, 0.82rem + 0.18vw, 0.98rem)',
  large: 'clamp(0.9rem, 0.88rem + 0.22vw, 1.08rem)',
  dramatic: 'clamp(1rem, 0.96rem + 0.3vw, 1.18rem)',
}

const HERO_STAGE_WIDTH_BY_SPLIT: Record<ThemeHomeHeroColumnSplit, string> = {
  'text-wide': 'min(40vw, 44rem)',
  balanced: 'min(50vw, 52rem)',
  'image-wide': 'min(60vw, 60rem)',
}

const HERO_CONTENT_GLOW_WIDTH_BY_INTENSITY: Record<ThemeHomeHeroDividerGlow, string> = {
  none: '0px',
  subtle: 'clamp(1.5rem, 3vw, 2.4rem)',
  medium: 'clamp(2.2rem, 4.6vw, 3.6rem)',
  strong: 'clamp(3rem, 6vw, 4.8rem)',
}

const HERO_CONTENT_GLOW_STOPS_BY_INTENSITY: Record<
  Exclude<ThemeHomeHeroDividerGlow, 'none'>,
  [string, string, string]
> = {
  subtle: ['32%', '14%', '4%'],
  medium: ['42%', '18%', '6%'],
  strong: ['54%', '24%', '8%'],
}

type OptionalColorFieldKey = (typeof OPTIONAL_COLOR_FIELDS)[number]['key']

const FOCUS_RING_DARK = '#ff9f3f'
const FOCUS_RING_LIGHT = '#2563eb'
const GHOST_BTN_MIN_CONTRAST = 4.5

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

function normalizeThemeCustomCss(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').trim()
}

function normalizeThemeHomeHeroTypographyScale(value: unknown): ThemeHomeHeroTypographyScale {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'small' || normalized === 'default' || normalized === 'large' || normalized === 'dramatic'
    ? normalized
    : 'default'
}

function normalizeThemeHomeHeroActionStyle(value: unknown): ThemeHomeHeroActionStyle {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'theme-default' || normalized === 'outline' || normalized === 'solid' || normalized === 'inline'
    ? normalized
    : 'theme-default'
}

function normalizeThemeHomeHeroDividerGlow(value: unknown): ThemeHomeHeroDividerGlow {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'none' || normalized === 'subtle' || normalized === 'medium' || normalized === 'strong'
    ? normalized
    : 'none'
}

function normalizeThemeHomeHeroDividerGlowSide(value: unknown): ThemeHomeHeroDividerGlowSide {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'balanced' || normalized === 'content' || normalized === 'image' ? normalized : 'balanced'
}

function normalizeThemeHomeHeroLayoutMode(value: unknown): ThemeHomeHeroLayoutMode {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'columns' ||
    normalized === 'stacked' ||
    normalized === 'text-only' ||
    normalized === 'image-only' ||
    normalized === 'centered-image'
    ? normalized
    : 'columns'
}

function normalizeThemeHomeHeroImagePosition(value: unknown): ThemeHomeHeroImagePosition {
  return normalizeThemeScalar(value) === 'right' ? 'right' : 'left'
}

function normalizeThemeHomeHeroColumnSplit(value: unknown): ThemeHomeHeroColumnSplit {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'balanced' || normalized === 'image-wide' ? normalized : 'text-wide'
}

function normalizeThemeHomeHeroStackedImageOrder(value: unknown): ThemeHomeHeroStackedImageOrder {
  return normalizeThemeScalar(value) === 'second' ? 'second' : 'first'
}

function normalizeThemeAboutProfileImagePosition(value: unknown): ThemeAboutProfileImagePosition {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'top-left' ||
    normalized === 'top-center' ||
    normalized === 'top-right' ||
    normalized === 'center-left' ||
    normalized === 'center' ||
    normalized === 'center-right' ||
    normalized === 'bottom-left' ||
    normalized === 'bottom-center' ||
    normalized === 'bottom-right'
    ? normalized
    : 'center'
}

function normalizeThemeAboutPosition(value: unknown): ThemeAboutPosition {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'left' || normalized === 'right' ? normalized : 'center'
}

function normalizeThemeAboutMaxWidth(value: unknown): ThemeAboutMaxWidth {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'compact' || normalized === 'standard' ? normalized : 'full'
}

function normalizeThemeContactPosition(value: unknown): ThemeContactPosition {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'top-left' ||
    normalized === 'top-center' ||
    normalized === 'top-right' ||
    normalized === 'center-left' ||
    normalized === 'center' ||
    normalized === 'center-right'
    ? normalized
    : 'center'
}

function normalizeThemeContactMaxWidth(value: unknown): ThemeContactMaxWidth {
  const normalized = normalizeThemeScalar(value)
  return normalized === 'compact' || normalized === 'wide' ? normalized : 'default'
}

function createDefaultThemeAboutPageState(): ThemeAboutPageState {
  return {
    position: 'center',
    maxWidth: 'full',
    profileImagePosition: 'center',
  }
}

function cloneThemeAboutPageState(aboutPage: ThemeAboutPageState): ThemeAboutPageState {
  return { ...aboutPage }
}

function normalizeThemeAboutPageState(input: unknown): ThemeAboutPageState {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    position: normalizeThemeAboutPosition(record.position),
    maxWidth: normalizeThemeAboutMaxWidth(record.maxWidth),
    profileImagePosition: normalizeThemeAboutProfileImagePosition(record.profileImagePosition),
  }
}

function createDefaultThemeContactPageState(): ThemeContactPageState {
  return {
    position: 'center',
    maxWidth: 'default',
  }
}

function cloneThemeContactPageState(contactPage: ThemeContactPageState): ThemeContactPageState {
  return { ...contactPage }
}

function normalizeThemeContactPageState(input: unknown): ThemeContactPageState {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    position: normalizeThemeContactPosition(record.position),
    maxWidth: normalizeThemeContactMaxWidth(record.maxWidth),
  }
}

function createDefaultThemeHomeHeroState(themeId = ''): ThemeHomeHeroState {
  const base: ThemeHomeHeroState = {
    mirrorImage: false,
    layout: {
      mode: 'columns',
      columnsImagePosition: 'left',
      columnSplit: 'text-wide',
      stackedImageOrder: 'first',
    },
    typography: {
      titleScale: 'default',
      taglineScale: 'default',
      citationScale: 'default',
    },
    divider: {
      visible: true,
      widthPx: 1,
      color: '',
      glow: 'none',
      glowSide: 'balanced',
    },
    actions: {
      listenNow: 'theme-default',
      searchMusic: 'theme-default',
    },
  }

  switch (normalizeThemeScalar(themeId)) {
    case 'concert-hall':
      return {
        ...base,
        divider: {
          ...base.divider,
          visible: false,
        },
      }
    case 'neon-ink':
      return {
        ...base,
        divider: {
          ...base.divider,
          glow: 'medium',
          glowSide: 'image',
        },
      }
    default:
      return base
  }
}

function cloneThemeHomeHeroState(homeHero: ThemeHomeHeroState): ThemeHomeHeroState {
  return {
    mirrorImage: homeHero.mirrorImage,
    layout: { ...homeHero.layout },
    typography: { ...homeHero.typography },
    divider: { ...homeHero.divider },
    actions: { ...homeHero.actions },
  }
}

function normalizeThemeHomeHeroState(input: unknown, themeId = ''): ThemeHomeHeroState {
  const defaults = createDefaultThemeHomeHeroState(themeId)
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const layout = record.layout && typeof record.layout === 'object' ? (record.layout as Record<string, unknown>) : {}
  const legacyLayoutValue =
    layout.value && typeof layout.value === 'object' ? (layout.value as Record<string, unknown>) : {}
  const typography =
    record.typography && typeof record.typography === 'object' ? (record.typography as Record<string, unknown>) : {}
  const divider =
    record.divider && typeof record.divider === 'object' ? (record.divider as Record<string, unknown>) : {}
  const actions =
    record.actions && typeof record.actions === 'object' ? (record.actions as Record<string, unknown>) : {}

  return {
    mirrorImage:
      typeof record.mirrorImage === 'boolean'
        ? record.mirrorImage
        : Object.prototype.hasOwnProperty.call(record, 'mirrorImage')
          ? normalizeThemeBoolean(record.mirrorImage)
          : defaults.mirrorImage,
    layout: {
      mode: normalizeThemeHomeHeroLayoutMode(layout.mode ?? layout.discriminant ?? defaults.layout.mode),
      columnsImagePosition: normalizeThemeHomeHeroImagePosition(
        layout.columnsImagePosition ??
          layout.imagePosition ??
          legacyLayoutValue.imagePosition ??
          defaults.layout.columnsImagePosition,
      ),
      columnSplit: normalizeThemeHomeHeroColumnSplit(
        layout.columnSplit ?? layout.split ?? legacyLayoutValue.split ?? defaults.layout.columnSplit,
      ),
      stackedImageOrder: normalizeThemeHomeHeroStackedImageOrder(
        layout.stackedImageOrder ??
          layout.imageOrder ??
          legacyLayoutValue.imageOrder ??
          defaults.layout.stackedImageOrder,
      ),
    },
    typography: {
      titleScale: normalizeThemeHomeHeroTypographyScale(typography.titleScale ?? defaults.typography.titleScale),
      taglineScale: normalizeThemeHomeHeroTypographyScale(typography.taglineScale ?? defaults.typography.taglineScale),
      citationScale: normalizeThemeHomeHeroTypographyScale(
        typography.citationScale ?? defaults.typography.citationScale,
      ),
    },
    divider: {
      visible:
        typeof divider.visible === 'boolean'
          ? divider.visible
          : Object.prototype.hasOwnProperty.call(divider, 'visible')
            ? normalizeThemeBoolean(divider.visible)
            : defaults.divider.visible,
      widthPx: (() => {
        const parsed =
          typeof divider.widthPx === 'number'
            ? divider.widthPx
            : Number.parseInt(normalizeThemeScalar(divider.widthPx), 10)
        if (!Number.isFinite(parsed)) return defaults.divider.widthPx
        return Math.min(6, Math.max(1, Math.round(parsed)))
      })(),
      color: normalizeThemeScalar(divider.color ?? defaults.divider.color),
      glow: normalizeThemeHomeHeroDividerGlow(divider.glow ?? defaults.divider.glow),
      glowSide: normalizeThemeHomeHeroDividerGlowSide(divider.glowSide ?? defaults.divider.glowSide),
    },
    actions: {
      listenNow: normalizeThemeHomeHeroActionStyle(actions.listenNow ?? defaults.actions.listenNow),
      searchMusic: normalizeThemeHomeHeroActionStyle(actions.searchMusic ?? defaults.actions.searchMusic),
    },
  }
}

function buildHeroDirectionalGlow(
  intensity: Exclude<ThemeHomeHeroDividerGlow, 'none'>,
  imagePosition: 'left' | 'right',
  glowSide: Exclude<ThemeHomeHeroDividerGlowSide, 'balanced'>,
): string {
  const direction =
    glowSide === 'content'
      ? imagePosition === 'right'
        ? '270deg'
        : '90deg'
      : imagePosition === 'right'
        ? '90deg'
        : '270deg'
  const [start, mid, fade] = HERO_CONTENT_GLOW_STOPS_BY_INTENSITY[intensity]

  return `linear-gradient(
    ${direction},
    color-mix(in srgb, var(--split-line-base) ${start}, transparent) 0%,
    color-mix(in srgb, var(--split-line-base) ${mid}, transparent) 24%,
    color-mix(in srgb, var(--split-line-base) ${fade}, transparent) 58%,
    transparent 100%
  )`
}

function normalizeThemeBoolean(value: unknown): boolean {
  if (value === true) return true
  if (value === false) return false
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function normalizeThemeColors(input: Partial<Record<ThemeColorKey, unknown>>): ThemeColorMap {
  const colors = input && typeof input === 'object' ? input : {}

  return {
    colorBackground: normalizeHexColor(
      colors.colorBackground as string | undefined,
      DEFAULT_THEME_COLORS.colorBackground,
    ),
    colorBackgroundSoft: normalizeHexColor(
      colors.colorBackgroundSoft as string | undefined,
      DEFAULT_THEME_COLORS.colorBackgroundSoft,
    ),
    colorText: normalizeHexColor(colors.colorText as string | undefined, DEFAULT_THEME_COLORS.colorText),
    colorTextMuted: normalizeHexColor(colors.colorTextMuted as string | undefined, DEFAULT_THEME_COLORS.colorTextMuted),
    colorAccent: normalizeHexColor(colors.colorAccent as string | undefined, DEFAULT_THEME_COLORS.colorAccent),
    colorAccentStrong: normalizeHexColor(
      colors.colorAccentStrong as string | undefined,
      DEFAULT_THEME_COLORS.colorAccentStrong,
    ),
    colorButton: normalizeHexColor(colors.colorButton as string | undefined, DEFAULT_THEME_COLORS.colorButton),
    colorButtonText: normalizeHexColor(
      colors.colorButtonText as string | undefined,
      DEFAULT_THEME_COLORS.colorButtonText,
    ),
  }
}

function normalizeThemeRawColors(input: Partial<Record<ThemeColorKey, unknown>>): ThemeRawColorMap {
  const colors = input && typeof input === 'object' ? input : {}

  const normalizeRawValue = (value: unknown): string => {
    const trimmed = normalizeThemeScalar(value)
    if (!trimmed) return ''
    return normalizeHexColorExact(trimmed) ?? trimmed
  }

  return {
    colorBackground: normalizeRawValue(colors.colorBackground),
    colorBackgroundSoft: normalizeRawValue(colors.colorBackgroundSoft),
    colorText: normalizeRawValue(colors.colorText),
    colorTextMuted: normalizeRawValue(colors.colorTextMuted),
    colorAccent: normalizeRawValue(colors.colorAccent),
    colorAccentStrong: normalizeRawValue(colors.colorAccentStrong),
    colorButton: normalizeRawValue(colors.colorButton),
    colorButtonText: normalizeRawValue(colors.colorButtonText),
  }
}

function toRawThemeColors(colors: ThemeColorMap): ThemeRawColorMap {
  return { ...colors }
}

function cloneThemeState(themeState: ThemePageState): ThemePageState {
  return {
    ...themeState,
    colors: normalizeThemeColors(themeState.colors),
    rawColors: normalizeThemeRawColors(themeState.rawColors),
    customCss: normalizeThemeCustomCss(themeState.customCss),
    aboutPage: cloneThemeAboutPageState(themeState.aboutPage),
    contactPage: cloneThemeContactPageState(themeState.contactPage),
    homeHero: cloneThemeHomeHeroState(themeState.homeHero),
  }
}

function cloneThemeLibraryTheme(theme: ThemeLibraryTheme): ThemeLibraryTheme {
  return {
    ...cloneThemeState(theme),
    id: theme.id,
    label: theme.label,
    description: theme.description,
  }
}

function readOptionalColorValue(themeState: ThemePageState, key: OptionalColorFieldKey): string {
  switch (key) {
    case 'focusRingColor':
      return normalizeThemeScalar(themeState.focusRingColor)
    case 'ctaBackground':
      return normalizeThemeScalar(themeState.ctaBackground)
    case 'ctaText':
      return normalizeThemeScalar(themeState.ctaText)
    case 'navActiveUnderline':
      return normalizeThemeScalar(themeState.navActiveUnderline)
    case 'navActiveText':
      return normalizeThemeScalar(themeState.navActiveText)
    case 'navHoverUnderline':
      return normalizeThemeScalar(themeState.navHoverUnderline)
    case 'navHoverText':
      return normalizeThemeScalar(themeState.navHoverText)
    case 'scrimColor':
      return normalizeThemeScalar(themeState.scrimColor)
  }
}

function writeOptionalColorValue(themeState: ThemePageState, key: OptionalColorFieldKey, value: string): void {
  switch (key) {
    case 'focusRingColor':
      themeState.focusRingColor = value
      return
    case 'ctaBackground':
      themeState.ctaBackground = value
      return
    case 'ctaText':
      themeState.ctaText = value
      return
    case 'navActiveUnderline':
      themeState.navActiveUnderline = value
      return
    case 'navActiveText':
      themeState.navActiveText = value
      return
    case 'navHoverUnderline':
      themeState.navHoverUnderline = value
      return
    case 'navHoverText':
      themeState.navHoverText = value
      return
    case 'scrimColor':
      themeState.scrimColor = value
  }
}

function hexToRgbTuple(value: string): [number, number, number] {
  const normalized = normalizeHexColor(value, '#000000').slice(1)
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return [red, green, blue]
}

function rgbTupleToHex(value: string | undefined): string {
  const parts = typeof value === 'string' ? value.trim().split(/\s+/) : []
  if (parts.length !== 3) return '#000000'

  const channels = parts.map((part) => Number.parseInt(part, 10))
  if (channels.some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)) {
    return '#000000'
  }

  const toHex = (channel: number): string => channel.toString(16).padStart(2, '0')
  return `#${toHex(channels[0])}${toHex(channels[1])}${toHex(channels[2])}`
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

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * srgbChannelToLinear(red) + 0.7152 * srgbChannelToLinear(green) + 0.0722 * srgbChannelToLinear(blue)
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

function resolveAboutProfileImagePosition(position: ThemeAboutProfileImagePosition): string {
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

function resolveAboutGridInlineMargin(position: ThemeAboutPosition): string {
  if (position === 'left') return '0 auto'
  if (position === 'right') return 'auto 0'
  return 'auto'
}

function resolveAboutGridMaxWidth(maxWidth: ThemeAboutMaxWidth): string {
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

function resolveContactPageJustify(position: ThemeContactPosition): string {
  return position.startsWith('top-') ? 'flex-start' : 'center'
}

function resolveContactStageInlineMargin(position: ThemeContactPosition): string {
  if (position.endsWith('-left')) return '0 auto'
  if (position.endsWith('-right')) return 'auto 0'
  return 'auto'
}

function resolveContactWidthVars(maxWidth: ThemeContactMaxWidth): { stage: string; email: string } {
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

function toThemeCssVars(
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
  aboutProfileImagePosition: ThemeAboutProfileImagePosition = 'center',
  aboutPagePosition: ThemeAboutPosition = 'center',
  aboutPageMaxWidth: ThemeAboutMaxWidth = 'full',
  contactPagePosition: ThemeContactPosition = 'center',
  contactPageMaxWidth: ThemeContactMaxWidth = 'default',
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

  const bgLuminance = relativeLuminance(backgroundRed, backgroundGreen, backgroundBlue)
  const accentStrongLuminance = relativeLuminance(accentStrongRed, accentStrongGreen, accentStrongBlue)
  const ghostBtnColor =
    contrastRatio(bgLuminance, accentStrongLuminance) >= GHOST_BTN_MIN_CONTRAST
      ? colors.colorAccentStrong
      : colors.colorAccent
  const [ghostRed, ghostGreen, ghostBlue] = hexToRgbTuple(ghostBtnColor)

  const ctaBg = (ctaBackgroundOverride ? normalizeHexColorExact(ctaBackgroundOverride) : null) ?? colors.colorButton
  const ctaInk = (ctaTextOverride ? normalizeHexColorExact(ctaTextOverride) : null) ?? colors.colorButtonText

  const navActiveUnderline =
    (navActiveUnderlineOverride ? normalizeHexColorExact(navActiveUnderlineOverride) : null) ?? colors.colorAccent
  const navActiveText = (navActiveTextOverride ? normalizeHexColorExact(navActiveTextOverride) : null) ?? ghostBtnColor

  const navHoverUnderline =
    (navHoverUnderlineOverride ? normalizeHexColorExact(navHoverUnderlineOverride) : null) ?? colors.colorAccent
  const navHoverText = (navHoverTextOverride ? normalizeHexColorExact(navHoverTextOverride) : null) ?? ghostBtnColor

  const scrimHex = (scrimColorOverride ? normalizeHexColorExact(scrimColorOverride) : null) ?? colors.colorBackground
  const [scrimRed, scrimGreen, scrimBlue] = hexToRgbTuple(scrimHex)

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

function createDefaultThemeState(): ThemePageState {
  const colors = normalizeThemeColors(DEFAULT_THEME_COLORS)
  return {
    colors,
    rawColors: toRawThemeColors(colors),
    fontBody: DEFAULT_THEME_FONT_BODY,
    fontHeading: DEFAULT_THEME_FONT_HEADING,
    borderRadius: 'none',
    focusRingColor: '',
    ctaBackground: '',
    ctaText: '',
    navActiveUnderline: '',
    navActiveText: '',
    navHoverUnderline: '',
    navHoverText: '',
    scrimColor: '',
    disableImageOverlays: false,
    playerBorderRadius: '',
    socialIconBorderRadius: '',
    profileImageBorderRadius: '',
    tagBadgeBorderRadius: '',
    customCss: '',
    aboutPage: createDefaultThemeAboutPageState(),
    contactPage: createDefaultThemeContactPageState(),
    homeHero: createDefaultThemeHomeHeroState(),
  }
}

function createThemeLibraryThemeFromPreset(preset: (typeof THEME_PRESETS)[number]): ThemeLibraryTheme {
  const colors = normalizeThemeColors(preset.colors)
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    colors,
    rawColors: toRawThemeColors(colors),
    fontBody: normalizeThemeScalar(preset.fontBody) || DEFAULT_THEME_FONT_BODY,
    fontHeading: normalizeThemeScalar(preset.fontHeading) || DEFAULT_THEME_FONT_HEADING,
    borderRadius: normalizeThemeScalar(preset.borderRadius) || 'none',
    focusRingColor: normalizeThemeScalar(preset.focusRingColor),
    ctaBackground: normalizeThemeScalar(preset.ctaBackground),
    ctaText: normalizeThemeScalar(preset.ctaText),
    navActiveUnderline: normalizeThemeScalar(preset.navActiveUnderline),
    navActiveText: normalizeThemeScalar(preset.navActiveText),
    navHoverUnderline: normalizeThemeScalar(preset.navHoverUnderline),
    navHoverText: normalizeThemeScalar(preset.navHoverText),
    scrimColor: normalizeThemeScalar(preset.scrimColor),
    disableImageOverlays: normalizeThemeBoolean(preset.disableImageOverlays),
    playerBorderRadius: normalizeThemeScalar(preset.playerBorderRadius),
    socialIconBorderRadius: normalizeThemeScalar(preset.socialIconBorderRadius),
    profileImageBorderRadius: normalizeThemeScalar(preset.profileImageBorderRadius),
    tagBadgeBorderRadius: normalizeThemeScalar(preset.tagBadgeBorderRadius),
    customCss: '',
    aboutPage: createDefaultThemeAboutPageState(),
    contactPage: createDefaultThemeContactPageState(),
    homeHero: createDefaultThemeHomeHeroState(preset.id),
  }
}

function createFallbackThemeLibrary(): ThemeLibraryTheme[] {
  return THEME_PRESETS.map((preset) => createThemeLibraryThemeFromPreset(preset))
}

function createCustomThemeFromState(
  themeState: ThemePageState,
  label = 'Custom Theme',
  description = '',
): ThemeLibraryTheme {
  return {
    id: CUSTOM_THEME_ID,
    label,
    description,
    ...cloneThemeState(themeState),
  }
}

function createInitialDraftFromAppliedState(themeState: ThemePageState, appliedThemeId = ''): ThemeLibraryTheme {
  const normalizedThemeId = normalizeThemeScalar(appliedThemeId)
  if (!normalizedThemeId) {
    return createCustomThemeFromState(themeState)
  }

  const matchedPreset = THEME_PRESETS.find((preset) => preset.id === normalizedThemeId)
  const draft = createCustomThemeFromState(
    themeState,
    matchedPreset?.label || normalizedThemeId,
    matchedPreset?.description || '',
  )

  return {
    ...draft,
    id: normalizedThemeId,
  }
}

function normalizeThemeLibraryTheme(input: unknown, fallbackId = 'theme'): ThemeLibraryTheme {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const colors = normalizeThemeColors(record.colors as Partial<Record<ThemeColorKey, unknown>>)

  return {
    id: normalizeThemeScalar(record.id) || fallbackId,
    label: normalizeThemeScalar(record.label) || 'Untitled Theme',
    description: normalizeThemeScalar(record.description),
    colors,
    rawColors:
      record.rawColors && typeof record.rawColors === 'object'
        ? normalizeThemeRawColors(record.rawColors as Partial<Record<ThemeColorKey, unknown>>)
        : toRawThemeColors(colors),
    fontBody: normalizeThemeScalar(record.fontBody) || DEFAULT_THEME_FONT_BODY,
    fontHeading: normalizeThemeScalar(record.fontHeading) || DEFAULT_THEME_FONT_HEADING,
    borderRadius: normalizeThemeScalar(record.borderRadius) || 'none',
    focusRingColor: normalizeThemeScalar(record.focusRingColor),
    ctaBackground: normalizeThemeScalar(record.ctaBackground),
    ctaText: normalizeThemeScalar(record.ctaText),
    navActiveUnderline: normalizeThemeScalar(record.navActiveUnderline),
    navActiveText: normalizeThemeScalar(record.navActiveText),
    navHoverUnderline: normalizeThemeScalar(record.navHoverUnderline),
    navHoverText: normalizeThemeScalar(record.navHoverText),
    scrimColor: normalizeThemeScalar(record.scrimColor),
    disableImageOverlays: normalizeThemeBoolean(record.disableImageOverlays),
    playerBorderRadius: normalizeThemeScalar(record.playerBorderRadius),
    socialIconBorderRadius: normalizeThemeScalar(record.socialIconBorderRadius),
    profileImageBorderRadius: normalizeThemeScalar(record.profileImageBorderRadius),
    tagBadgeBorderRadius: normalizeThemeScalar(record.tagBadgeBorderRadius),
    customCss: normalizeThemeCustomCss(record.customCss),
    aboutPage: normalizeThemeAboutPageState(record.aboutPage),
    contactPage: normalizeThemeContactPageState(record.contactPage),
    homeHero: normalizeThemeHomeHeroState(record.homeHero, normalizeThemeScalar(record.id) || fallbackId),
  }
}

function normalizeThemeLibraryList(input: unknown): ThemeLibraryTheme[] {
  if (!Array.isArray(input)) return []
  return input.map((theme, index) => normalizeThemeLibraryTheme(theme, `theme-${index + 1}`))
}

function getEffectiveThemeVars(themeState: ThemePageState): Record<string, string> {
  return toThemeCssVars(
    normalizeThemeColors(themeState.colors),
    themeState.borderRadius,
    themeState.focusRingColor,
    themeState.ctaBackground,
    themeState.ctaText,
    themeState.navActiveUnderline,
    themeState.navActiveText,
    themeState.navHoverUnderline,
    themeState.navHoverText,
    themeState.scrimColor,
    themeState.disableImageOverlays,
    themeState.playerBorderRadius,
    themeState.socialIconBorderRadius,
    themeState.profileImageBorderRadius,
    themeState.tagBadgeBorderRadius,
    themeState.aboutPage.profileImagePosition,
    themeState.aboutPage.position,
    themeState.aboutPage.maxWidth,
    themeState.contactPage.position,
    themeState.contactPage.maxWidth,
  )
}

function getEffectiveOptionalColor(themeState: ThemePageState, key: OptionalColorFieldKey): string {
  const vars = getEffectiveThemeVars(themeState)
  const field = OPTIONAL_COLOR_FIELDS.find((entry) => entry.key === key)
  if (!field) return '#000000'

  if (field.isRgbTuple) {
    return rgbTupleToHex(vars[field.cssVar])
  }

  return normalizeHexColor(vars[field.cssVar], '#000000')
}

function getEffectiveHomeHeroDividerColor(themeState: ThemePageState): string {
  const explicitColor = normalizeHexColorExact(themeState.homeHero.divider.color)
  if (explicitColor) return explicitColor

  const colors = normalizeThemeColors(themeState.colors)
  const lineColor = mixHex(colors.colorBackgroundSoft, colors.colorAccent, 0.2)
  return mixHex(lineColor, colors.colorAccent, 0.38)
}

function getThemeComparisonSignature(themeState: ThemePageState): string {
  const vars = getEffectiveThemeVars(themeState)

  return JSON.stringify({
    colors: normalizeThemeColors(themeState.colors),
    fontBody: normalizeThemeScalar(themeState.fontBody) || DEFAULT_THEME_FONT_BODY,
    fontHeading: normalizeThemeScalar(themeState.fontHeading) || DEFAULT_THEME_FONT_HEADING,
    borderRadius: normalizeThemeScalar(themeState.borderRadius) || 'none',
    focusRingColor: vars['--focus-ring-color'],
    ctaBackground: vars['--cta-bg'],
    ctaText: vars['--cta-ink'],
    navActiveUnderline: vars['--nav-active-underline'],
    navActiveText: vars['--nav-active-text'],
    navHoverUnderline: vars['--nav-hover-underline'],
    navHoverText: vars['--nav-hover-text'],
    scrimColor: rgbTupleToHex(vars['--scrim-rgb']),
    disableImageOverlays: themeState.disableImageOverlays === true,
    playerBorderRadius: vars['--player-radius'],
    socialIconBorderRadius: vars['--social-icon-radius'],
    profileImageBorderRadius: vars['--about-profile-radius'],
    tagBadgeBorderRadius: vars['--tag-badge-radius'],
    customCss: normalizeThemeCustomCss(themeState.customCss),
    aboutPage: normalizeThemeAboutPageState(themeState.aboutPage),
    contactPage: normalizeThemeContactPageState(themeState.contactPage),
    homeHero: normalizeThemeHomeHeroState(themeState.homeHero),
  })
}

function areThemeStatesEquivalent(left: ThemePageState, right: ThemePageState): boolean {
  return getThemeComparisonSignature(left) === getThemeComparisonSignature(right)
}

function areThemeLibraryThemesEqual(left: ThemeLibraryTheme, right: ThemeLibraryTheme): boolean {
  if (normalizeThemeScalar(left.label) !== normalizeThemeScalar(right.label)) return false
  if (normalizeThemeScalar(left.description) !== normalizeThemeScalar(right.description)) return false
  return areThemeStatesEquivalent(left, right)
}

function findMatchingTheme(
  themeState: ThemePageState,
  themes: readonly ThemeLibraryTheme[],
): ThemeLibraryTheme | undefined {
  return themes.find((theme) => areThemeStatesEquivalent(themeState, theme))
}

function resolveAppliedSavedThemeId(themeState: ThemePageState, selectedTheme: ThemeLibraryTheme | undefined): string {
  if (!selectedTheme) return ''
  return areThemeStatesEquivalent(themeState, selectedTheme) ? selectedTheme.id : ''
}

function createThemeLibraryPayload(theme: ThemeLibraryTheme): Record<string, unknown> {
  return {
    label: normalizeThemeScalar(theme.label) || 'Untitled Theme',
    description: normalizeThemeScalar(theme.description),
    colors: normalizeThemeColors(theme.colors),
    fontBody: normalizeThemeScalar(theme.fontBody) || DEFAULT_THEME_FONT_BODY,
    fontHeading: normalizeThemeScalar(theme.fontHeading) || DEFAULT_THEME_FONT_HEADING,
    borderRadius: normalizeThemeScalar(theme.borderRadius) || 'none',
    focusRingColor: normalizeHexColorExact(theme.focusRingColor) ?? '',
    ctaBackground: normalizeHexColorExact(theme.ctaBackground) ?? '',
    ctaText: normalizeHexColorExact(theme.ctaText) ?? '',
    navActiveUnderline: normalizeHexColorExact(theme.navActiveUnderline) ?? '',
    navActiveText: normalizeHexColorExact(theme.navActiveText) ?? '',
    navHoverUnderline: normalizeHexColorExact(theme.navHoverUnderline) ?? '',
    navHoverText: normalizeHexColorExact(theme.navHoverText) ?? '',
    scrimColor: normalizeHexColorExact(theme.scrimColor) ?? '',
    disableImageOverlays: theme.disableImageOverlays === true,
    playerBorderRadius: normalizeThemeScalar(theme.playerBorderRadius),
    socialIconBorderRadius: normalizeThemeScalar(theme.socialIconBorderRadius),
    profileImageBorderRadius: normalizeThemeScalar(theme.profileImageBorderRadius),
    tagBadgeBorderRadius: normalizeThemeScalar(theme.tagBadgeBorderRadius),
    customCss: normalizeThemeCustomCss(theme.customCss),
    aboutPage: normalizeThemeAboutPageState(theme.aboutPage),
    contactPage: normalizeThemeContactPageState(theme.contactPage),
    homeHero: normalizeThemeHomeHeroState(theme.homeHero),
  }
}

function readThemePageDataFromPage(): ThemePageData | null {
  const script = document.getElementById(THEME_DATA_SCRIPT_ID)
  if (!script?.textContent) return null

  try {
    const parsed = JSON.parse(script.textContent)
    if (!parsed || typeof parsed !== 'object') return null

    const record = parsed as {
      currentThemeId?: unknown
      colors?: Partial<Record<ThemeColorKey, unknown>>
      rawColors?: Partial<Record<ThemeColorKey, unknown>>
      fontBody?: unknown
      fontHeading?: unknown
      borderRadius?: unknown
      focusRingColor?: unknown
      navActiveUnderline?: unknown
      navActiveText?: unknown
      navHoverUnderline?: unknown
      navHoverText?: unknown
      scrimColor?: unknown
      disableImageOverlays?: unknown
      ctaBackground?: unknown
      ctaText?: unknown
      playerBorderRadius?: unknown
      socialIconBorderRadius?: unknown
      profileImageBorderRadius?: unknown
      tagBadgeBorderRadius?: unknown
      customCss?: unknown
      aboutPage?: unknown
      contactPage?: unknown
      homeHero?: unknown
    }
    if (!record.colors || typeof record.colors !== 'object') return null

    const resolvedColors = normalizeThemeColors(record.colors)
    const rawColors =
      record.rawColors && typeof record.rawColors === 'object'
        ? normalizeThemeRawColors(record.rawColors)
        : toRawThemeColors(resolvedColors)

    return {
      currentThemeId: Object.prototype.hasOwnProperty.call(record, 'currentThemeId')
        ? normalizeThemeScalar(record.currentThemeId)
        : undefined,
      themeState: {
        colors: resolvedColors,
        rawColors,
        fontBody: normalizeThemeScalar(record.fontBody) || DEFAULT_THEME_FONT_BODY,
        fontHeading: normalizeThemeScalar(record.fontHeading) || DEFAULT_THEME_FONT_HEADING,
        borderRadius: normalizeThemeScalar(record.borderRadius) || 'none',
        focusRingColor: normalizeThemeScalar(record.focusRingColor),
        navActiveUnderline: normalizeThemeScalar(record.navActiveUnderline),
        navActiveText: normalizeThemeScalar(record.navActiveText),
        navHoverUnderline: normalizeThemeScalar(record.navHoverUnderline),
        navHoverText: normalizeThemeScalar(record.navHoverText),
        scrimColor: normalizeThemeScalar(record.scrimColor),
        disableImageOverlays: normalizeThemeBoolean(record.disableImageOverlays),
        ctaBackground: normalizeThemeScalar(record.ctaBackground),
        ctaText: normalizeThemeScalar(record.ctaText),
        playerBorderRadius: normalizeThemeScalar(record.playerBorderRadius),
        socialIconBorderRadius: normalizeThemeScalar(record.socialIconBorderRadius),
        profileImageBorderRadius: normalizeThemeScalar(record.profileImageBorderRadius),
        tagBadgeBorderRadius: normalizeThemeScalar(record.tagBadgeBorderRadius),
        customCss: normalizeThemeCustomCss(record.customCss),
        aboutPage: normalizeThemeAboutPageState(record.aboutPage),
        contactPage: normalizeThemeContactPageState(record.contactPage),
        homeHero: normalizeThemeHomeHeroState(record.homeHero, normalizeThemeScalar(record.currentThemeId)),
      },
    }
  } catch {
    return null
  }
}

function syncThemePreviewFonts(targetDocument: Document, themeState: ThemePageState): void {
  const nextHref = getThemeGoogleFontsStylesheetHref([
    {
      value: normalizeThemeScalar(themeState.fontBody) || DEFAULT_THEME_FONT_BODY,
      fallback: DEFAULT_THEME_FONT_BODY,
    },
    {
      value: normalizeThemeScalar(themeState.fontHeading) || DEFAULT_THEME_FONT_HEADING,
      fallback: DEFAULT_THEME_FONT_HEADING,
    },
  ])

  const existingLink = targetDocument.getElementById(THEME_STUDIO_PREVIEW_FONT_LINK_ID) as HTMLLinkElement | null
  if (!nextHref) {
    existingLink?.remove()
    return
  }

  if (existingLink) {
    existingLink.href = nextHref
    return
  }

  const nextLink = targetDocument.createElement('link')
  nextLink.id = THEME_STUDIO_PREVIEW_FONT_LINK_ID
  nextLink.rel = 'stylesheet'
  nextLink.href = nextHref
  const targetHead = targetDocument.head ?? targetDocument.querySelector('head')
  if (!targetHead) return
  targetHead.append(nextLink)
}

function ensureThemeStudioPreviewStyles(targetDocument: Document): void {
  if (targetDocument.getElementById(THEME_STUDIO_PREVIEW_STYLE_ID)) return

  const style = targetDocument.createElement('style')
  style.id = THEME_STUDIO_PREVIEW_STYLE_ID
  style.textContent = `
    astro-dev-toolbar {
      display: none !important;
    }
  `
  const targetHead = targetDocument.head ?? targetDocument.querySelector('head')
  if (!targetHead) return
  targetHead.append(style)
}

function syncThemePreviewCustomCss(targetDocument: Document, themeState: ThemePageState): void {
  const nextCss = normalizeThemeCustomCss(themeState.customCss)
  const existingStyle = targetDocument.getElementById(THEME_CUSTOM_STYLE_ID) as HTMLStyleElement | null

  if (!nextCss) {
    existingStyle?.remove()
    return
  }

  if (existingStyle) {
    existingStyle.textContent = nextCss
    return
  }

  const style = targetDocument.createElement('style')
  style.id = THEME_CUSTOM_STYLE_ID
  style.textContent = nextCss
  const targetHead = targetDocument.head ?? targetDocument.querySelector('head')
  if (!targetHead) return
  targetHead.append(style)
}

function setInlineStyleProperty(style: CSSStyleDeclaration, name: string, value: string | null): void {
  if (!value) {
    style.removeProperty(name)
    return
  }

  style.setProperty(name, value)
}

function syncHeroActionButtonPreview(
  button: Element | null,
  styleValue: ThemeHomeHeroActionStyle,
  role: 'listen' | 'search',
): void {
  if (!(button instanceof HTMLElement)) return

  const usesPrimary = role === 'listen' ? styleValue !== 'inline' : styleValue === 'outline' || styleValue === 'solid'

  button.dataset.heroActionStyle = styleValue
  button.classList.toggle('immersive-btn-primary', usesPrimary)
  button.classList.toggle('immersive-btn-inline', !usesPrimary)
}

function syncThemePreviewHomeHero(targetDocument: Document, themeState: ThemePageState): void {
  const heroRoot = targetDocument.querySelector('.immersive-home')
  if (!(heroRoot instanceof HTMLElement)) return

  const heroStyle = heroRoot.style
  const heroLayout = themeState.homeHero.layout.mode
  const heroImagePosition = themeState.homeHero.layout.columnsImagePosition
  const heroColumnSplit = themeState.homeHero.layout.columnSplit
  const heroStackedOrder = themeState.homeHero.layout.stackedImageOrder
  const heroStageWidth = HERO_STAGE_WIDTH_BY_SPLIT[heroColumnSplit]
  const showsBackdrop = heroLayout !== 'text-only'
  const usesImageColumn = heroLayout === 'columns' || heroLayout === 'stacked' || heroLayout === 'image-only'
  const showsCopy = heroLayout !== 'image-only'
  const dividerVisible = themeState.homeHero.divider.visible
  const dividerGlow = dividerVisible ? themeState.homeHero.divider.glow : 'none'
  const balancedGlowMode =
    heroLayout === 'columns' &&
    dividerVisible &&
    dividerGlow !== 'none' &&
    themeState.homeHero.divider.glowSide === 'balanced'
      ? dividerGlow
      : null
  const directionalGlowSide =
    heroLayout === 'columns' &&
    dividerVisible &&
    dividerGlow !== 'none' &&
    themeState.homeHero.divider.glowSide !== 'balanced'
      ? themeState.homeHero.divider.glowSide
      : null
  const directionalGlowMode = directionalGlowSide && dividerGlow !== 'none' ? dividerGlow : null

  setInlineStyleProperty(
    heroStyle,
    '--hero-title-size',
    HERO_TITLE_SIZE_BY_SCALE[themeState.homeHero.typography.titleScale],
  )
  setInlineStyleProperty(
    heroStyle,
    '--hero-tagline-size',
    HERO_TAGLINE_SIZE_BY_SCALE[themeState.homeHero.typography.taglineScale],
  )
  setInlineStyleProperty(
    heroStyle,
    '--hero-citation-size',
    HERO_CITATION_SIZE_BY_SCALE[themeState.homeHero.typography.citationScale],
  )
  setInlineStyleProperty(heroStyle, '--stage-width', heroStageWidth)
  setInlineStyleProperty(heroStyle, '--listen-left', heroStageWidth)
  setInlineStyleProperty(heroStyle, '--hero-image-scale-x', themeState.homeHero.mirrorImage ? '-1' : '1')
  setInlineStyleProperty(
    heroStyle,
    '--split-line-thickness',
    dividerVisible ? `${themeState.homeHero.divider.widthPx}px` : '0px',
  )
  setInlineStyleProperty(heroStyle, '--split-line-opacity', dividerVisible ? '0.3' : '0')
  setInlineStyleProperty(
    heroStyle,
    '--split-line-base',
    normalizeThemeScalar(themeState.homeHero.divider.color) || null,
  )

  if (balancedGlowMode) {
    setInlineStyleProperty(heroStyle, '--split-line-glow-shadow', 'none')
    setInlineStyleProperty(
      heroStyle,
      '--hero-split-line-image-glow-width',
      HERO_CONTENT_GLOW_WIDTH_BY_INTENSITY[balancedGlowMode],
    )
    setInlineStyleProperty(
      heroStyle,
      '--hero-split-line-image-glow',
      buildHeroDirectionalGlow(balancedGlowMode, heroImagePosition, 'image'),
    )
    setInlineStyleProperty(
      heroStyle,
      '--hero-split-line-content-glow-width',
      HERO_CONTENT_GLOW_WIDTH_BY_INTENSITY[balancedGlowMode],
    )
    setInlineStyleProperty(
      heroStyle,
      '--hero-split-line-content-glow',
      buildHeroDirectionalGlow(balancedGlowMode, heroImagePosition, 'content'),
    )
  } else if (directionalGlowSide && directionalGlowMode) {
    setInlineStyleProperty(heroStyle, '--split-line-glow-shadow', 'none')
    if (directionalGlowSide === 'image') {
      setInlineStyleProperty(
        heroStyle,
        '--hero-split-line-image-glow-width',
        HERO_CONTENT_GLOW_WIDTH_BY_INTENSITY[directionalGlowMode],
      )
      setInlineStyleProperty(
        heroStyle,
        '--hero-split-line-image-glow',
        buildHeroDirectionalGlow(directionalGlowMode, heroImagePosition, 'image'),
      )
      setInlineStyleProperty(heroStyle, '--hero-split-line-content-glow-width', '0px')
      setInlineStyleProperty(heroStyle, '--hero-split-line-content-glow', 'none')
    } else {
      setInlineStyleProperty(heroStyle, '--hero-split-line-image-glow-width', '0px')
      setInlineStyleProperty(heroStyle, '--hero-split-line-image-glow', 'none')
      setInlineStyleProperty(
        heroStyle,
        '--hero-split-line-content-glow-width',
        HERO_CONTENT_GLOW_WIDTH_BY_INTENSITY[directionalGlowMode],
      )
      setInlineStyleProperty(
        heroStyle,
        '--hero-split-line-content-glow',
        buildHeroDirectionalGlow(directionalGlowMode, heroImagePosition, 'content'),
      )
    }
  } else {
    setInlineStyleProperty(heroStyle, '--split-line-glow-shadow', null)
    setInlineStyleProperty(heroStyle, '--hero-split-line-image-glow-width', null)
    setInlineStyleProperty(heroStyle, '--hero-split-line-image-glow', null)
    setInlineStyleProperty(heroStyle, '--hero-split-line-content-glow-width', null)
    setInlineStyleProperty(heroStyle, '--hero-split-line-content-glow', null)
  }

  heroRoot.dataset.heroLayout = heroLayout
  heroRoot.dataset.heroImagePosition = heroImagePosition
  heroRoot.dataset.heroStackedOrder = heroStackedOrder
  heroRoot.dataset.heroDividerGlow = dividerGlow
  heroRoot.dataset.heroDividerGlowSide = themeState.homeHero.divider.glowSide

  const masthead = targetDocument.querySelector('.masthead')
  if (masthead instanceof HTMLElement) {
    masthead.dataset.heroLayout = heroLayout
    masthead.dataset.heroImagePosition = heroImagePosition
    masthead.dataset.heroStackedOrder = heroStackedOrder
  }

  const stageBackdrop = targetDocument.querySelector('.stage-backdrop')
  if (stageBackdrop instanceof HTMLElement) {
    stageBackdrop.hidden = !showsBackdrop
  }

  const imageColumn = targetDocument.querySelector('.image-column')
  if (imageColumn instanceof HTMLElement) {
    imageColumn.hidden = !usesImageColumn
  }

  const contentColumn = targetDocument.querySelector('.content-column')
  if (contentColumn instanceof HTMLElement) {
    contentColumn.hidden = !showsCopy
  }

  syncHeroActionButtonPreview(
    targetDocument.querySelector('.hero-action-listen-btn'),
    themeState.homeHero.actions.listenNow,
    'listen',
  )
  syncHeroActionButtonPreview(
    targetDocument.querySelector('.hero-action-search-btn'),
    themeState.homeHero.actions.searchMusic,
    'search',
  )
}

function isThemeStudioPreviewPage(): boolean {
  const hasPreviewParam = new URL(window.location.href).searchParams.get(THEME_STUDIO_PREVIEW_PARAM) === '1'
  if (hasPreviewParam && window.name !== THEME_STUDIO_PREVIEW_FRAME_NAME) {
    window.name = THEME_STUDIO_PREVIEW_FRAME_NAME
  }
  return hasPreviewParam || window.name === THEME_STUDIO_PREVIEW_FRAME_NAME
}

function resolveThemePreviewId(themeState: ThemePageState, explicitThemeId = ''): string {
  const normalizedThemeId = normalizeThemeScalar(explicitThemeId)
  if (normalizedThemeId) return normalizedThemeId

  const borderRadius = normalizeThemeScalar(themeState.borderRadius) || 'none'
  const matchedPreset = THEME_PRESETS.find(
    (preset) =>
      Object.entries(themeState.colors).every(([key, value]) => {
        const presetValue = preset.colors[key as ThemeColorKey]
        return normalizeHexColorExact(value) === normalizeHexColorExact(presetValue)
      }) && (preset.borderRadius || 'none') === borderRadius,
  )

  return matchedPreset?.id ?? ''
}

function applyThemeState(themeState: ThemePageState, targetDocument: Document = document, themeId = ''): void {
  const nextVars = getEffectiveThemeVars(themeState)
  const rootStyle = targetDocument.documentElement.style
  Object.entries(nextVars).forEach(([name, value]) => {
    rootStyle.setProperty(name, value)
  })

  const fontBody = normalizeThemeScalar(themeState.fontBody) || DEFAULT_THEME_FONT_BODY
  const fontHeading = normalizeThemeScalar(themeState.fontHeading) || DEFAULT_THEME_FONT_HEADING
  rootStyle.setProperty('--font-body', resolveThemeFontFamily(fontBody, DEFAULT_THEME_FONT_BODY))
  rootStyle.setProperty('--font-heading', resolveThemeFontFamily(fontHeading, DEFAULT_THEME_FONT_HEADING))
  const immersiveButtonLabelShifts = resolveImmersiveButtonLabelShifts(fontHeading, DEFAULT_THEME_FONT_HEADING)
  rootStyle.setProperty('--immersive-btn-label-shift-standard', immersiveButtonLabelShifts.standard)
  rootStyle.setProperty('--immersive-btn-label-shift-control', immersiveButtonLabelShifts.control)
  const resolvedThemeId = resolveThemePreviewId(themeState, themeId)
  if (resolvedThemeId) {
    targetDocument.documentElement.setAttribute('data-theme-id', resolvedThemeId)
  } else {
    targetDocument.documentElement.removeAttribute('data-theme-id')
  }
  syncThemePreviewFonts(targetDocument, themeState)
  syncThemePreviewCustomCss(targetDocument, themeState)
  syncThemePreviewHomeHero(targetDocument, themeState)
}

async function persistThemePreset(themeState: ThemePageState, currentThemeId = ''): Promise<void> {
  const apiUrl = new URL(THEME_PRESET_API_PATH, window.location.origin).toString()

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentThemeId: normalizeThemeScalar(currentThemeId),
      colors: normalizeThemeColors(themeState.colors),
      fontBody: normalizeThemeScalar(themeState.fontBody) || DEFAULT_THEME_FONT_BODY,
      fontHeading: normalizeThemeScalar(themeState.fontHeading) || DEFAULT_THEME_FONT_HEADING,
      borderRadius: normalizeThemeScalar(themeState.borderRadius) || 'none',
      focusRingColor: normalizeHexColorExact(themeState.focusRingColor) ?? '',
      navActiveUnderline: normalizeHexColorExact(themeState.navActiveUnderline) ?? '',
      navActiveText: normalizeHexColorExact(themeState.navActiveText) ?? '',
      navHoverUnderline: normalizeHexColorExact(themeState.navHoverUnderline) ?? '',
      navHoverText: normalizeHexColorExact(themeState.navHoverText) ?? '',
      scrimColor: normalizeHexColorExact(themeState.scrimColor) ?? '',
      disableImageOverlays: themeState.disableImageOverlays === true,
      ctaBackground: normalizeHexColorExact(themeState.ctaBackground) ?? '',
      ctaText: normalizeHexColorExact(themeState.ctaText) ?? '',
      playerBorderRadius: normalizeThemeScalar(themeState.playerBorderRadius),
      socialIconBorderRadius: normalizeThemeScalar(themeState.socialIconBorderRadius),
      profileImageBorderRadius: normalizeThemeScalar(themeState.profileImageBorderRadius),
      tagBadgeBorderRadius: normalizeThemeScalar(themeState.tagBadgeBorderRadius),
      customCss: normalizeThemeCustomCss(themeState.customCss),
      aboutPage: normalizeThemeAboutPageState(themeState.aboutPage),
      contactPage: normalizeThemeContactPageState(themeState.contactPage),
      homeHero: normalizeThemeHomeHeroState(themeState.homeHero),
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${apiUrl}`)
  }
}

async function fetchThemeLibrary(): Promise<ThemeLibraryTheme[]> {
  const apiUrl = new URL(THEME_LIBRARY_API_PATH, window.location.origin).toString()
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${apiUrl}`)
  }

  const payload = (await response.json()) as { themes?: unknown }
  return normalizeThemeLibraryList(payload.themes)
}

async function mutateThemeLibrary(
  body: Record<string, unknown>,
): Promise<{ theme?: ThemeLibraryTheme; themes: ThemeLibraryTheme[]; deletedId?: string }> {
  const apiUrl = new URL(THEME_LIBRARY_API_PATH, window.location.origin).toString()
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${apiUrl}`)
  }

  const payload = (await response.json()) as {
    theme?: unknown
    themes?: unknown
    deletedId?: unknown
  }

  return {
    theme: payload.theme ? normalizeThemeLibraryTheme(payload.theme) : undefined,
    themes: normalizeThemeLibraryList(payload.themes),
    deletedId: normalizeThemeScalar(payload.deletedId),
  }
}

function createSelectControl(): HTMLSelectElement {
  const select = document.createElement('select')
  select.className = 'control control--select'
  return select
}

function fillSelectOptions(select: HTMLSelectElement, options: ReadonlyArray<{ value: string; label: string }>): void {
  select.options.length = 0
  options.forEach((optionData) => {
    const option = document.createElement('option')
    option.value = optionData.value
    option.textContent = optionData.label
    select.add(option)
  })
}

function buildThemeStudioPreviewUrl(): string {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set(THEME_STUDIO_PREVIEW_PARAM, '1')
  return nextUrl.toString()
}

function getPreviewBridge(targetWindow: Window | null): ThemeStudioPreviewBridge | null {
  if (!targetWindow) return null

  const record = targetWindow as Window & {
    __themeStudioPreview?: ThemeStudioPreviewBridge
  }

  return record.__themeStudioPreview ?? null
}

function isThemeLibraryRouteUnavailable(error: unknown): boolean {
  return error instanceof Error && /HTTP 404\b/.test(error.message)
}

export default defineToolbarApp({
  init(canvas, app) {
    if (isThemeStudioPreviewPage()) {
      const previewWindow = window as Window & {
        __themeStudioPreview?: ThemeStudioPreviewBridge
        __themeStudioPreviewPendingTheme?: ThemePageState
        __themeStudioPreviewPendingThemeId?: string
      }

      const initialThemePageData = readThemePageDataFromPage()
      let latestThemeState = previewWindow.__themeStudioPreviewPendingTheme
        ? cloneThemeState(previewWindow.__themeStudioPreviewPendingTheme)
        : (initialThemePageData?.themeState ?? createDefaultThemeState())
      let latestThemeId =
        normalizeThemeScalar(previewWindow.__themeStudioPreviewPendingThemeId) ||
        initialThemePageData?.currentThemeId ||
        ''

      const syncPreviewDocument = (): void => {
        ensureThemeStudioPreviewStyles(document)
        applyThemeState(latestThemeState, document, latestThemeId)
      }

      previewWindow.__themeStudioPreview = {
        applyTheme(themeState: ThemePageState, themeId = '') {
          latestThemeState = cloneThemeState(themeState)
          latestThemeId = normalizeThemeScalar(themeId)
          previewWindow.__themeStudioPreviewPendingTheme = cloneThemeState(latestThemeState)
          previewWindow.__themeStudioPreviewPendingThemeId = latestThemeId
          syncPreviewDocument()
        },
      }
      previewWindow.__themeStudioPreviewPendingTheme = cloneThemeState(latestThemeState)
      previewWindow.__themeStudioPreviewPendingThemeId = latestThemeId

      document.addEventListener('astro:after-swap', syncPreviewDocument)
      document.addEventListener('astro:page-load', syncPreviewDocument)
      syncPreviewDocument()
      return
    }

    document
      .querySelectorAll<HTMLElement>(`[${THEME_STUDIO_WORKSPACE_ROOT_ATTR}]`)
      .forEach((existingWorkspace) => existingWorkspace.remove())

    const workspaceElement = document.createElement('div')
    workspaceElement.className = 'theme-studio-workspace'
    workspaceElement.setAttribute(THEME_STUDIO_WORKSPACE_ROOT_ATTR, 'true')
    workspaceElement.dataset.state = 'closed'

    const previewShell = document.createElement('div')
    previewShell.className = 'theme-studio-preview-shell'

    const previewFrame = document.createElement('iframe')
    previewFrame.className = 'theme-studio-preview-frame'
    previewFrame.title = 'Theme Studio preview'
    previewFrame.name = THEME_STUDIO_PREVIEW_FRAME_NAME
    previewFrame.loading = 'eager'
    previewFrame.referrerPolicy = 'same-origin'
    previewShell.append(previewFrame)

    const windowElement = document.createElement('div')
    windowElement.className = 'theme-studio-panel'
    // ── DOM: Resize handle between preview and settings panel ──────
    const resizeHandle = document.createElement('div')
    resizeHandle.className = 'theme-studio-resize-handle'
    resizeHandle.setAttribute('aria-hidden', 'true')

    workspaceElement.append(previewShell, resizeHandle, windowElement)

    // Workspace layout styles live in the document (all use .theme-studio-* prefixed
    // class names, so collision risk is negligible). Panel-internal styles live inside
    // the shadow DOM below, giving full isolation from the site's own stylesheet.
    // Keep a reference so ensureAttached() can re-inject the style after a soft
    // navigation (astro:after-swap replaces <head> content, removing it).
    const workspaceStyleId = 'theme-studio-workspace-styles'
    let workspaceStyleElement =
      document.getElementById(workspaceStyleId) ??
      (() => {
        const s = document.createElement('style')
        s.id = workspaceStyleId
        document.head.append(s)
        return s
      })()
    workspaceStyleElement.textContent = `
        .theme-studio-workspace {
          color-scheme: dark;
          display: none;
          position: fixed;
          z-index: 999;
          inset: 0;
          grid-template-columns: minmax(0, 1fr) 0px clamp(24rem, 32vw, 31rem);
          background: #081119;
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .theme-studio-workspace[data-state='open'] {
          display: grid;
          opacity: 1;
          pointer-events: auto;
        }
        html:has(.theme-studio-workspace[data-state='open']) {
          overflow: hidden;
        }
        .theme-studio-preview-shell {
          min-width: 0;
          min-height: 0;
          background: #09131b;
        }
        .theme-studio-preview-frame {
          display: block;
          border: 0;
          width: 100%;
          height: 100%;
          background: #10161d;
        }
        .theme-studio-resize-handle {
          width: 5px;
          margin: 0 -2px;
          cursor: col-resize;
          background: #30404d;
          position: relative;
          z-index: 2;
          transition: background 120ms ease;
        }
        .theme-studio-resize-handle:hover,
        .theme-studio-resize-handle.active {
          background: #5b9bd5;
        }
        .theme-studio-panel {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #0f161d;
          box-shadow:
            0 0 0 1px rgb(48 64 77 / 0.9),
            -20px 0 44px rgb(0 0 0 / 0.3);
        }
        @media (max-width: 77.99rem) {
          .theme-studio-workspace {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr) clamp(18rem, 46vh, 26rem);
          }
          .theme-studio-resize-handle {
            display: none;
          }
          .theme-studio-preview-shell {
            border-bottom: 1px solid #30404d;
          }
          .theme-studio-panel {
            box-shadow:
              0 0 0 1px rgb(48 64 77 / 0.9),
              0 -20px 44px rgb(0 0 0 / 0.3);
          }
        }
      `

    const canvasSentinel = document.createElement('span')
    canvasSentinel.hidden = true
    canvas.append(canvasSentinel)

    // Shadow DOM isolates all panel-internal styles (button, p, fieldset, .status,
    // .grid, .field, .control, etc.) from the site stylesheet.
    const panelRoot = windowElement.attachShadow({ mode: 'open' })
    panelRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .theme-studio-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.9rem;
          padding: 1rem;
          border-bottom: 1px solid #22313d;
          background: linear-gradient(180deg, rgb(13 20 28 / 0.98) 0%, rgb(13 20 28 / 0.94) 100%);
          flex-shrink: 0;
        }
        .theme-studio-panel-title-wrap {
          min-width: 0;
        }
        .theme-studio-panel-title {
          margin: 0;
          font-size: 1.05rem;
          color: #fff;
          font-weight: 600;
        }
        .theme-studio-meta {
          margin-top: 0.22rem;
          font-size: 0.8rem;
          color: #9eb3c2;
        }
        .theme-studio-meta--editing {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .theme-studio-meta-label {
          flex-shrink: 0;
        }
        .theme-studio-meta-marker {
          flex-shrink: 0;
          font-weight: 700;
          color: inherit;
        }
        .theme-studio-meta[data-state='mismatch'] {
          color: #ffd089;
        }
        .theme-studio-meta[data-state='dirty'] {
          color: #ffe3b0;
        }
        .theme-studio-header-select {
          width: auto;
          min-width: 10rem;
          max-width: min(100%, 15rem);
          padding: 0.28rem 1.7rem 0.28rem 0.55rem;
          font-size: 0.76rem;
          line-height: 1.2;
        }
        .theme-studio-header-apply {
          flex-shrink: 0;
          min-height: 2rem;
          padding: 0.28rem 0.62rem;
          font-size: 0.75rem;
          line-height: 1.15;
        }
        .theme-studio-header-reset {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          padding: 0;
        }
        .theme-studio-close {
          flex-shrink: 0;
          width: 2.35rem;
          height: 2.35rem;
          padding: 0;
          font-size: 1.35rem;
          line-height: 1;
        }
        .theme-studio-panel-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          padding: 1rem;
        }
        .theme-studio-panel-footer {
          flex-shrink: 0;
          padding: 0.85rem 1rem 1rem;
          border-top: 1px solid #22313d;
          background: linear-gradient(180deg, rgb(13 20 28 / 0.92) 0%, rgb(13 20 28 / 0.98) 100%);
        }
        p {
          margin: 0;
          color: #c8d4de;
          line-height: 1.4;
          font-size: 0.9rem;
        }
        fieldset {
          border: 0;
          padding: 0;
          margin: 0;
          min-inline-size: 0;
        }
        .lede {
          margin-bottom: 0.8rem;
        }
        .theme-section {
          margin: 0 0 0.85rem;
          border: 1px solid #22313d;
          border-radius: 0.75rem;
          background: #0d171f;
          transition:
            border-color 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease;
        }
        .theme-section[open] {
          border-color: #263744;
          background: #263744;
        }
        .theme-section.is-closing {
          border-color: #22313d;
          background: #0d171f;
        }
        .theme-section[open] .field__label {
          color: #eef5fa;
        }
        .theme-section[open] .field__help {
          color: #c0d0db;
        }
        .theme-section:has(> .theme-section__summary:hover) {
          border-color: #4c6070;
          box-shadow: 0 0 0 1px rgb(76 96 112 / 0.2);
        }
        .theme-section[open]:not(.is-closing):has(> .theme-section__summary:hover) {
          background: #263744;
          border-color: #304554;
          box-shadow: none;
        }
        .theme-section__summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.8rem 0.9rem;
          border-radius: calc(0.75rem - 1px);
          list-style: none;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #9eb3c2;
          user-select: none;
          -webkit-user-select: none;
          transition:
            color 180ms ease,
            background-color 180ms ease;
        }
        .theme-section__summary::-webkit-details-marker {
          display: none;
        }
        .theme-section__summary:hover {
          color: #fff;
          background: rgb(20 30 39 / 0.8);
        }
        .theme-section__summary-icon {
          width: 0.95rem;
          height: 0.95rem;
          color: #dce8ef;
          flex-shrink: 0;
          transform: rotate(0deg);
          transition:
            transform 180ms ease,
            color 180ms ease;
        }
        .theme-section[open]:not(.is-closing) .theme-section__summary-icon {
          transform: rotate(90deg);
        }
        .theme-section[open]:not(.is-closing) .theme-section__summary {
          color: #d7e3eb;
        }
        .theme-section__summary:hover .theme-section__summary-icon {
          color: #fff;
        }
        .theme-section:not([open]) > .theme-section__content {
          display: none;
        }
        .theme-section__content {
          display: grid;
          grid-template-rows: 1fr;
          padding: 0 0.9rem 0.9rem;
          opacity: 1;
          transition:
            grid-template-rows 180ms ease,
            opacity 180ms ease,
            padding-top 180ms ease,
            padding-bottom 180ms ease;
        }
        .theme-section__content.is-collapsed {
          grid-template-rows: 0fr;
          opacity: 0;
          padding-top: 0;
          padding-bottom: 0;
          pointer-events: none;
        }
        .theme-section__content-inner {
          min-height: 0;
          overflow: hidden;
          display: grid;
          gap: 0.85rem;
          padding-top: 0.1rem;
          transition: padding-top 180ms ease;
        }
        .theme-section__content.is-collapsed > .theme-section__content-inner {
          padding-top: 0;
        }
        .grid {
          display: grid;
          gap: 0.7rem;
        }
        .grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .field {
          display: grid;
          gap: 0.32rem;
        }
        .field__label {
          font-size: 0.8rem;
          color: #dce8ef;
        }
        .field__help {
          font-size: 0.72rem;
          line-height: 1.35;
          color: #93a7b5;
        }
        .control,
        textarea.control {
          width: 100%;
          box-sizing: border-box;
          appearance: none;
          border: 1px solid #4f6472;
          background-color: #16202a;
          color: #fff;
          border-radius: 0.48rem;
          padding: 0.5rem 0.65rem;
          font: inherit;
          font-size: 0.84rem;
          transition:
            border-color 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease;
        }
        .control:hover,
        textarea.control:hover {
          border-color: #6b8191;
          background-color: #1b2731;
          box-shadow: 0 0 0 1px rgb(107 129 145 / 0.14);
        }
        .control--select {
          padding-right: 2rem;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2393a7b5' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.6rem center;
          background-size: 0.9rem;
        }
        textarea.control {
          min-height: 4.4rem;
          resize: vertical;
        }
        .theme-code-input {
          min-height: 12rem;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            Liberation Mono,
            Courier New,
            monospace;
          font-size: 0.78rem;
          line-height: 1.45;
          tab-size: 2;
        }
        .color-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
        }
        .color-card {
          border: 1px solid #30404d;
          border-radius: 0.6rem;
          background: #111920;
          padding: 0.55rem 0.6rem;
          display: grid;
          gap: 0.45rem;
        }
        .color-card__top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.6rem;
        }
        .color-card__label {
          font-size: 0.78rem;
          color: #dce8ef;
          line-height: 1.2;
        }
        .color-card__value {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.72rem;
          color: #9eb3c2;
        }
        .color-card__controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
        }
        .color-card__picker {
          width: 100%;
          min-width: 0;
          height: 2rem;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          cursor: pointer;
        }
        .color-card__picker::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .color-card__picker::-webkit-color-swatch,
        .color-card__picker::-moz-color-swatch {
          border: 1px solid #4f6472;
          border-radius: 0.48rem;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease;
        }
        .color-card__picker:hover:not([disabled])::-webkit-color-swatch,
        .color-card__picker:hover:not([disabled])::-moz-color-swatch {
          border-color: #6b8191;
          box-shadow: 0 0 0 1px rgb(107 129 145 / 0.14);
        }
        .color-card__picker[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .color-card__auto {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          white-space: nowrap;
          font-size: 0.72rem;
          color: #9eb3c2;
          transition: color 180ms ease;
        }
        .color-card__auto:hover {
          color: #fff;
        }
        .toggle-card {
          display: grid;
          gap: 0.38rem;
          border: 1px solid #30404d;
          border-radius: 0.6rem;
          background: #111920;
          padding: 0.7rem 0.75rem;
        }
        .toggle-card__control {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          width: fit-content;
          color: #dce8ef;
          font-size: 0.82rem;
          cursor: pointer;
          transition: color 180ms ease;
        }
        .toggle-card__control:hover {
          color: #fff;
        }
        .toggle-card__control input {
          width: 1rem;
          height: 1rem;
          margin: 0;
          accent-color: #c2410c;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }
        button {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          border: 1px solid #4f6472;
          background: #16202a;
          color: #fff;
          border-radius: 0.48rem;
          padding: 0.45rem 0.72rem;
          font-size: 0.82rem;
          cursor: pointer;
          transition:
            border-color 180ms ease,
            background-color 180ms ease,
            color 180ms ease,
            box-shadow 180ms ease;
        }
        button:hover:not([disabled]) {
          border-color: #6b8191;
          background: #1d2a34;
          color: #fff;
          box-shadow: 0 0 0 1px rgb(107 129 145 / 0.14);
        }
        button[data-variant='primary'] {
          background: #213546;
        }
        button[data-variant='primary']:hover:not([disabled]) {
          border-color: #6f8ba1;
          background: #2a4458;
          box-shadow: 0 0 0 1px rgb(111 139 161 / 0.16);
        }
        button[data-variant='accent']:not([disabled]) {
          border-color: #f97316;
          background: #c2410c;
          color: #fff;
        }
        button[data-variant='accent']:hover:not([disabled]) {
          border-color: #fb923c;
          background: #ea580c;
          box-shadow: 0 0 0 1px rgb(251 146 60 / 0.18);
        }
        button[data-variant='danger'] {
          border-color: #83515c;
          color: #ffd6dc;
        }
        button[data-variant='danger']:hover:not([disabled]) {
          border-color: #b06b7c;
          background: #2a1b22;
          color: #fff1f4;
          box-shadow: 0 0 0 1px rgb(176 107 124 / 0.16);
        }
        button[data-icon-only='true'] {
          width: 2.4rem;
          height: 2.4rem;
          padding: 0;
        }
        .theme-studio-button-icon {
          width: 1.15rem;
          height: 1.15rem;
          display: block;
          flex-shrink: 0;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        button[disabled] {
          opacity: 0.4;
          cursor: not-allowed;
          border-color: #3f4a54;
          background: #27313a;
          color: #7b8792;
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
        @media (max-width: 720px) {
          .grid.two,
          .color-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      </style>
      <div class="theme-studio-panel-header">
        <div class="theme-studio-panel-title-wrap">
          <h1 class="theme-studio-panel-title">Theme Studio</h1>
          <div class="theme-studio-meta theme-studio-meta--editing" data-editing-theme>
            <span class="theme-studio-meta-label">Editing:</span>
            <span data-theme-select-slot></span>
            <button type="button" class="theme-studio-header-apply" data-apply-button data-variant="accent" disabled></button>
            <button
              type="button"
              class="theme-studio-header-reset"
              data-reset-to-current-button
              data-icon-only="true"
              disabled
            >
              <svg class="theme-studio-button-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 14 4 9l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M4 9h11a4 4 0 1 1 0 8h-1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="sr-only">Reset editing to the current site theme</span>
            </button>
            <span class="theme-studio-meta-marker" data-editing-theme-marker hidden aria-hidden="true">*</span>
          </div>
          <p class="theme-studio-meta" data-current-theme aria-live="polite"></p>
        </div>
        <button type="button" class="theme-studio-close" data-close-button aria-label="Close Theme Studio">&times;</button>
      </div>
      <div class="theme-studio-panel-body">
        <p class="lede">Edit themes live, save reusable versions, and use Apply only when you want to commit the current draft.</p>
        <fieldset data-editor-shell>
          <details class="theme-section" data-section-id="info" open>
            <summary class="theme-section__summary">
              <span>Theme</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <label class="field">
                  <span class="field__label">Name</span>
                  <input class="control" type="text" data-theme-name maxlength="80" placeholder="Theme Name" />
                  <span class="field__help">This is the visible theme name. Use the header selector to switch the draft theme. The internal id is auto-generated on first save and stays hidden.</span>
                </label>
                <label class="field">
                  <span class="field__label">Description</span>
                  <textarea class="control" data-theme-description rows="2" placeholder="Optional note about this theme."></textarea>
                </label>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="palette">
            <summary class="theme-section__summary">
              <span>Palette</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <div class="color-grid" data-core-colors></div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="overrides">
            <summary class="theme-section__summary">
              <span>Overrides</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <div class="color-grid" data-optional-colors></div>
                <div class="toggle-card">
                  <span class="field__label">Background Image Overlays</span>
                  <span class="field__help">Turn off the gradient scrims layered over homepage and page-hero background images.</span>
                  <label class="toggle-card__control">
                    <input type="checkbox" data-disable-image-overlays />
                    <span>Disable overlays</span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="typography">
            <summary class="theme-section__summary">
              <span>Typography</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <div class="grid two">
                  <label class="field">
                    <span class="field__label">Body Font</span>
                    <span data-font-body-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Heading Font</span>
                    <span data-font-heading-slot></span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="corners">
            <summary class="theme-section__summary">
              <span>Corners</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <div class="grid two">
                  <label class="field">
                    <span class="field__label">Theme Corners</span>
                    <span data-border-radius-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Featured Player</span>
                    <span data-player-radius-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Social Buttons</span>
                    <span data-social-radius-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Tag Badges</span>
                    <span data-tag-badge-radius-slot></span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="home-hero">
            <summary class="theme-section__summary">
              <span>Home Hero</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <p class="field__help">Theme-owned defaults for the homepage hero.</p>
                <div class="grid two">
                  <div class="toggle-card">
                    <span class="field__label">Hero Image</span>
                    <span class="field__help">Flip the hero image when you want the subject facing the opposite direction.</span>
                    <label class="toggle-card__control">
                      <input type="checkbox" data-home-hero-mirror-image />
                      <span>Mirror image</span>
                    </label>
                  </div>
                  <label class="field">
                    <span class="field__label">Hero Layout</span>
                    <span data-home-hero-layout-mode-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Image Position</span>
                    <span data-home-hero-image-position-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Column Split</span>
                    <span data-home-hero-column-split-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Stacked Image Order</span>
                    <span data-home-hero-stacked-image-order-slot></span>
                  </label>
                </div>
                <div class="grid two">
                  <label class="field">
                    <span class="field__label">Title Line</span>
                    <span data-home-hero-title-scale-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Tagline</span>
                    <span data-home-hero-tagline-scale-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Citation</span>
                    <span data-home-hero-citation-scale-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Divider Glow</span>
                    <span data-home-hero-divider-glow-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Glow Placement</span>
                    <span data-home-hero-divider-glow-side-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Listen Button Style</span>
                    <span data-home-hero-listen-style-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Search Button Style</span>
                    <span data-home-hero-search-style-slot></span>
                  </label>
                </div>
                <div class="grid two">
                  <div class="toggle-card">
                    <span class="field__label">Hero Divider</span>
                    <span class="field__help">Controls the split line in the hero and the matching line at the top of the listen section.</span>
                    <label class="toggle-card__control">
                      <input type="checkbox" data-home-hero-divider-visible />
                      <span>Show divider</span>
                    </label>
                  </div>
                  <label class="field">
                    <span class="field__label">Divider Width (px)</span>
                    <input class="control" type="number" min="1" max="6" step="1" data-home-hero-divider-width />
                  </label>
                  <label class="field">
                    <span class="field__label">Divider Color</span>
                    <div class="color-card__controls">
                      <input class="color-card__picker" type="color" data-home-hero-divider-color />
                      <label class="color-card__auto">
                        <input type="checkbox" data-home-hero-divider-color-auto />
                        Auto
                      </label>
                    </div>
                    <span class="field__help">Auto derives the divider color from the theme palette. Turn it off to set a fixed color.</span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="about-page">
            <summary class="theme-section__summary">
              <span>About</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <p class="field__help">Theme-owned framing and layout defaults for the About page profile image and content grid.</p>
                <div class="grid two">
                  <label class="field">
                    <span class="field__label">Profile Image Corners</span>
                    <span data-profile-radius-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Grid Position</span>
                    <span data-about-page-position-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Grid Max Width</span>
                    <span data-about-page-max-width-slot></span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="contact-page">
            <summary class="theme-section__summary">
              <span>Contact</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <p class="field__help">Theme-owned layout defaults for the Contact page panel.</p>
                <div class="grid two">
                  <label class="field">
                    <span class="field__label">Panel Position</span>
                    <span data-contact-page-position-slot></span>
                  </label>
                  <label class="field">
                    <span class="field__label">Panel Width</span>
                    <span data-contact-page-max-width-slot></span>
                  </label>
                </div>
              </div>
            </div>
          </details>
          <details class="theme-section" data-section-id="custom-css">
            <summary class="theme-section__summary">
              <span>Theme CSS</span>
              <svg class="theme-section__summary-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="theme-section__content">
              <div class="theme-section__content-inner">
                <label class="field">
                  <span class="field__label">Theme-scoped CSS</span>
                  <span class="field__help">This CSS is injected only while this theme is active. Keep selectors narrow, start from the component you are tuning (for example <code>.immersive-home</code>), and prefer setting custom properties over broad element overrides.</span>
                  <textarea class="control theme-code-input" data-theme-custom-css rows="10" spellcheck="false" placeholder=".immersive-home {\n  --hero-media-height: 32rem;\n}"></textarea>
                </label>
              </div>
            </div>
          </details>
        </fieldset>
      </div>
      <div class="theme-studio-panel-footer">
        <div class="actions">
          <button type="button" data-revert-button data-icon-only="true">
            <svg class="theme-studio-button-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 14 4 9l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M4 9h11a4 4 0 1 1 0 8h-1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="sr-only">Revert</span>
          </button>
          <button type="button" data-save-new-button>Save New</button>
          <button type="button" data-save-button data-variant="accent">Save Changes</button>
          <button type="button" data-delete-button data-variant="danger" data-icon-only="true">
            <svg class="theme-studio-button-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M10 10v6M14 10v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="sr-only">Delete</span>
          </button>
        </div>
        <p class="status" data-status aria-live="polite"></p>
      </div>
    `

    const editingThemeElement = panelRoot.querySelector('[data-editing-theme]') as HTMLDivElement | null
    const editingThemeMarkerElement = panelRoot.querySelector('[data-editing-theme-marker]') as HTMLSpanElement | null
    const currentThemeElement = panelRoot.querySelector('[data-current-theme]') as HTMLParagraphElement | null
    const statusElement = panelRoot.querySelector('[data-status]') as HTMLParagraphElement | null
    const themeNameInput = panelRoot.querySelector('[data-theme-name]') as HTMLInputElement | null
    const themeDescriptionInput = panelRoot.querySelector('[data-theme-description]') as HTMLTextAreaElement | null
    const themeCustomCssInput = panelRoot.querySelector('[data-theme-custom-css]') as HTMLTextAreaElement | null
    const homeHeroMirrorImageInput = panelRoot.querySelector('[data-home-hero-mirror-image]') as HTMLInputElement | null
    const homeHeroDividerVisibleInput = panelRoot.querySelector(
      '[data-home-hero-divider-visible]',
    ) as HTMLInputElement | null
    const homeHeroDividerWidthInput = panelRoot.querySelector(
      '[data-home-hero-divider-width]',
    ) as HTMLInputElement | null
    const homeHeroDividerColorInput = panelRoot.querySelector(
      '[data-home-hero-divider-color]',
    ) as HTMLInputElement | null
    const homeHeroDividerColorAutoInput = panelRoot.querySelector(
      '[data-home-hero-divider-color-auto]',
    ) as HTMLInputElement | null
    const coreColorsContainer = panelRoot.querySelector('[data-core-colors]') as HTMLDivElement | null
    const optionalColorsContainer = panelRoot.querySelector('[data-optional-colors]') as HTMLDivElement | null
    const overlayToggleInput = panelRoot.querySelector('[data-disable-image-overlays]') as HTMLInputElement | null
    const closeButton = panelRoot.querySelector('[data-close-button]') as HTMLButtonElement | null
    const revertButton = panelRoot.querySelector('[data-revert-button]') as HTMLButtonElement | null
    const applyButton = panelRoot.querySelector('[data-apply-button]') as HTMLButtonElement | null
    const resetToCurrentButton = panelRoot.querySelector('[data-reset-to-current-button]') as HTMLButtonElement | null
    const saveNewButton = panelRoot.querySelector('[data-save-new-button]') as HTMLButtonElement | null
    const saveButton = panelRoot.querySelector('[data-save-button]') as HTMLButtonElement | null
    const deleteButton = panelRoot.querySelector('[data-delete-button]') as HTMLButtonElement | null
    const sectionElements = Array.from(panelRoot.querySelectorAll<HTMLDetailsElement>('[data-section-id]'))

    const themeSelect = createSelectControl()
    themeSelect.classList.add('theme-studio-header-select')
    const fontBodySelect = createSelectControl()
    const fontHeadingSelect = createSelectControl()
    const borderRadiusSelect = createSelectControl()
    const playerRadiusSelect = createSelectControl()
    const socialRadiusSelect = createSelectControl()
    const profileRadiusSelect = createSelectControl()
    const tagBadgeRadiusSelect = createSelectControl()
    const aboutPagePositionSelect = createSelectControl()
    const aboutPageMaxWidthSelect = createSelectControl()
    const contactPagePositionSelect = createSelectControl()
    const contactPageMaxWidthSelect = createSelectControl()
    const homeHeroLayoutModeSelect = createSelectControl()
    const homeHeroImagePositionSelect = createSelectControl()
    const homeHeroColumnSplitSelect = createSelectControl()
    const homeHeroStackedImageOrderSelect = createSelectControl()
    const homeHeroTitleScaleSelect = createSelectControl()
    const homeHeroTaglineScaleSelect = createSelectControl()
    const homeHeroCitationScaleSelect = createSelectControl()
    const homeHeroDividerGlowSelect = createSelectControl()
    const homeHeroDividerGlowSideSelect = createSelectControl()
    const homeHeroListenStyleSelect = createSelectControl()
    const homeHeroSearchStyleSelect = createSelectControl()

    fillSelectOptions(fontBodySelect, THEME_FONT_SELECT_OPTIONS)
    fillSelectOptions(fontHeadingSelect, THEME_FONT_SELECT_OPTIONS)
    fillSelectOptions(borderRadiusSelect, BORDER_RADIUS_OPTIONS)
    fillSelectOptions(playerRadiusSelect, RADIUS_OVERRIDE_OPTIONS)
    fillSelectOptions(socialRadiusSelect, SOCIAL_ICON_RADIUS_OPTIONS)
    fillSelectOptions(profileRadiusSelect, SOCIAL_ICON_RADIUS_OPTIONS)
    fillSelectOptions(tagBadgeRadiusSelect, TAG_BADGE_RADIUS_OPTIONS)
    fillSelectOptions(aboutPagePositionSelect, ABOUT_PAGE_POSITION_OPTIONS)
    fillSelectOptions(aboutPageMaxWidthSelect, ABOUT_PAGE_MAX_WIDTH_OPTIONS)
    fillSelectOptions(contactPagePositionSelect, CONTACT_PAGE_POSITION_OPTIONS)
    fillSelectOptions(contactPageMaxWidthSelect, CONTACT_PAGE_MAX_WIDTH_OPTIONS)
    fillSelectOptions(homeHeroLayoutModeSelect, HOME_HERO_LAYOUT_MODE_OPTIONS)
    fillSelectOptions(homeHeroImagePositionSelect, HOME_HERO_IMAGE_POSITION_OPTIONS)
    fillSelectOptions(homeHeroColumnSplitSelect, HOME_HERO_COLUMN_SPLIT_OPTIONS)
    fillSelectOptions(homeHeroStackedImageOrderSelect, HOME_HERO_STACKED_IMAGE_ORDER_OPTIONS)
    fillSelectOptions(homeHeroTitleScaleSelect, HOME_HERO_TYPOGRAPHY_OPTIONS)
    fillSelectOptions(homeHeroTaglineScaleSelect, HOME_HERO_TYPOGRAPHY_OPTIONS)
    fillSelectOptions(homeHeroCitationScaleSelect, HOME_HERO_TYPOGRAPHY_OPTIONS)
    fillSelectOptions(homeHeroDividerGlowSelect, HOME_HERO_DIVIDER_GLOW_OPTIONS)
    fillSelectOptions(homeHeroDividerGlowSideSelect, HOME_HERO_DIVIDER_GLOW_SIDE_OPTIONS)
    fillSelectOptions(homeHeroListenStyleSelect, HOME_HERO_ACTION_STYLE_OPTIONS)
    fillSelectOptions(homeHeroSearchStyleSelect, HOME_HERO_ACTION_STYLE_OPTIONS)

    panelRoot.querySelector('[data-theme-select-slot]')?.append(themeSelect)
    panelRoot.querySelector('[data-font-body-slot]')?.append(fontBodySelect)
    panelRoot.querySelector('[data-font-heading-slot]')?.append(fontHeadingSelect)
    panelRoot.querySelector('[data-border-radius-slot]')?.append(borderRadiusSelect)
    panelRoot.querySelector('[data-player-radius-slot]')?.append(playerRadiusSelect)
    panelRoot.querySelector('[data-social-radius-slot]')?.append(socialRadiusSelect)
    panelRoot.querySelector('[data-profile-radius-slot]')?.append(profileRadiusSelect)
    panelRoot.querySelector('[data-tag-badge-radius-slot]')?.append(tagBadgeRadiusSelect)
    panelRoot.querySelector('[data-about-page-position-slot]')?.append(aboutPagePositionSelect)
    panelRoot.querySelector('[data-about-page-max-width-slot]')?.append(aboutPageMaxWidthSelect)
    panelRoot.querySelector('[data-contact-page-position-slot]')?.append(contactPagePositionSelect)
    panelRoot.querySelector('[data-contact-page-max-width-slot]')?.append(contactPageMaxWidthSelect)
    panelRoot.querySelector('[data-home-hero-layout-mode-slot]')?.append(homeHeroLayoutModeSelect)
    panelRoot.querySelector('[data-home-hero-image-position-slot]')?.append(homeHeroImagePositionSelect)
    panelRoot.querySelector('[data-home-hero-column-split-slot]')?.append(homeHeroColumnSplitSelect)
    panelRoot.querySelector('[data-home-hero-stacked-image-order-slot]')?.append(homeHeroStackedImageOrderSelect)
    panelRoot.querySelector('[data-home-hero-title-scale-slot]')?.append(homeHeroTitleScaleSelect)
    panelRoot.querySelector('[data-home-hero-tagline-scale-slot]')?.append(homeHeroTaglineScaleSelect)
    panelRoot.querySelector('[data-home-hero-citation-scale-slot]')?.append(homeHeroCitationScaleSelect)
    panelRoot.querySelector('[data-home-hero-divider-glow-slot]')?.append(homeHeroDividerGlowSelect)
    panelRoot.querySelector('[data-home-hero-divider-glow-side-slot]')?.append(homeHeroDividerGlowSideSelect)
    panelRoot.querySelector('[data-home-hero-listen-style-slot]')?.append(homeHeroListenStyleSelect)
    panelRoot.querySelector('[data-home-hero-search-style-slot]')?.append(homeHeroSearchStyleSelect)

    const coreColorInputs = new Map<ThemeColorKey, HTMLInputElement>()
    const coreColorValues = new Map<ThemeColorKey, HTMLElement>()
    const optionalColorInputs = new Map<OptionalColorFieldKey, HTMLInputElement>()
    const optionalColorValues = new Map<OptionalColorFieldKey, HTMLElement>()
    const optionalColorAutoInputs = new Map<OptionalColorFieldKey, HTMLInputElement>()
    const optionalColorManualValues = new Map<OptionalColorFieldKey, string>()

    CORE_COLOR_FIELDS.forEach((field) => {
      if (!coreColorsContainer) return
      const card = document.createElement('div')
      card.className = 'color-card'

      const top = document.createElement('div')
      top.className = 'color-card__top'

      const label = document.createElement('span')
      label.className = 'color-card__label'
      label.textContent = field.label

      const value = document.createElement('span')
      value.className = 'color-card__value'

      top.append(label, value)

      const controls = document.createElement('div')
      controls.className = 'color-card__controls'

      const input = document.createElement('input')
      input.type = 'color'
      input.className = 'color-card__picker'

      controls.append(input)
      card.append(top, controls)
      coreColorsContainer.append(card)

      coreColorInputs.set(field.key, input)
      coreColorValues.set(field.key, value)
    })

    OPTIONAL_COLOR_FIELDS.forEach((field) => {
      if (!optionalColorsContainer) return
      const card = document.createElement('div')
      card.className = 'color-card'

      const top = document.createElement('div')
      top.className = 'color-card__top'

      const label = document.createElement('span')
      label.className = 'color-card__label'
      label.textContent = field.label

      const value = document.createElement('span')
      value.className = 'color-card__value'

      top.append(label, value)

      const controls = document.createElement('div')
      controls.className = 'color-card__controls'

      const input = document.createElement('input')
      input.type = 'color'
      input.className = 'color-card__picker'

      const autoLabel = document.createElement('label')
      autoLabel.className = 'color-card__auto'
      const autoInput = document.createElement('input')
      autoInput.type = 'checkbox'
      autoLabel.append(autoInput, document.createTextNode('Auto'))

      controls.append(input, autoLabel)
      card.append(top, controls)
      optionalColorsContainer.append(card)

      optionalColorInputs.set(field.key, input)
      optionalColorValues.set(field.key, value)
      optionalColorAutoInputs.set(field.key, autoInput)
    })

    const initialThemePageData = readThemePageDataFromPage()
    let themeLibrary = createFallbackThemeLibrary()
    let persistedThemeState = initialThemePageData?.themeState ?? createDefaultThemeState()
    let persistedAppliedThemeId = initialThemePageData?.currentThemeId
    let selectedThemeId = normalizeThemeScalar(persistedAppliedThemeId) || CUSTOM_THEME_ID
    let draftTheme = createInitialDraftFromAppliedState(persistedThemeState, selectedThemeId)
    let selectedThemeBaseline: ThemeLibraryTheme | null = cloneThemeLibraryTheme(draftTheme)
    let pendingApply = false
    let pendingLibraryMutation = false
    let loadingThemeLibrary = false
    let isAppOpen = false
    let lastSeededPreviewUrl = ''
    const restoredWorkspaceState = (() => {
      try {
        const rawValue = window.sessionStorage.getItem(THEME_STUDIO_WORKSPACE_STATE_STORAGE_KEY)
        if (!rawValue) return null

        const parsed = JSON.parse(rawValue) as Partial<ThemeStudioWorkspaceState>
        if (!parsed || typeof parsed !== 'object') return null
        if (parsed.isOpen !== true) return null

        return {
          isOpen: true,
          preserveDraft: parsed.preserveDraft === true,
          selectedThemeId: normalizeThemeScalar(parsed.selectedThemeId) || CUSTOM_THEME_ID,
          draftTheme: normalizeThemeLibraryTheme(parsed.draftTheme, CUSTOM_THEME_ID),
        } satisfies ThemeStudioWorkspaceState
      } catch {
        return null
      }
    })()

    if (restoredWorkspaceState?.preserveDraft) {
      selectedThemeId = restoredWorkspaceState.selectedThemeId
      draftTheme = cloneThemeLibraryTheme(restoredWorkspaceState.draftTheme)
      const restoredMatchesAppliedTheme =
        selectedThemeId !== CUSTOM_THEME_ID && selectedThemeId === normalizeThemeScalar(persistedAppliedThemeId)
      if (restoredMatchesAppliedTheme) {
        selectedThemeBaseline = createInitialDraftFromAppliedState(persistedThemeState, selectedThemeId)
      } else {
        selectedThemeBaseline =
          selectedThemeId === CUSTOM_THEME_ID
            ? cloneThemeLibraryTheme(restoredWorkspaceState.draftTheme)
            : (themeLibrary.find((theme) => theme.id === selectedThemeId) ?? null)
        if (selectedThemeBaseline) {
          selectedThemeBaseline = cloneThemeLibraryTheme(selectedThemeBaseline)
        }
      }
    }

    const seedOptionalColorManualValues = (): void => {
      OPTIONAL_COLOR_FIELDS.forEach((field) => {
        const currentValue = readOptionalColorValue(draftTheme, field.key)
        const seededValue =
          currentValue.length > 0
            ? normalizeHexColor(currentValue, getEffectiveOptionalColor(draftTheme, field.key))
            : getEffectiveOptionalColor(draftTheme, field.key)
        optionalColorManualValues.set(field.key, seededValue)
      })
    }

    let homeHeroDividerColorManualValue = '#000000'

    const seedHomeHeroDividerColorManualValue = (): void => {
      const currentValue = normalizeThemeScalar(draftTheme.homeHero.divider.color)
      homeHeroDividerColorManualValue =
        currentValue.length > 0
          ? normalizeHexColor(currentValue, getEffectiveHomeHeroDividerColor(draftTheme))
          : getEffectiveHomeHeroDividerColor(draftTheme)
    }

    const seedDerivedManualValues = (): void => {
      seedOptionalColorManualValues()
      seedHomeHeroDividerColorManualValue()
    }

    seedDerivedManualValues()

    const setStatus = (message: string, tone: 'info' | 'success' | 'error' = 'info'): void => {
      if (!statusElement) return
      statusElement.textContent = message
      statusElement.dataset.tone = tone
    }

    const persistWorkspaceState = (): void => {
      if (!isAppOpen) return

      try {
        const payload: ThemeStudioWorkspaceState = {
          isOpen: true,
          preserveDraft: hasDraftChangesFromAppliedReference(),
          selectedThemeId,
          draftTheme: cloneThemeLibraryTheme(draftTheme),
        }
        window.sessionStorage.setItem(THEME_STUDIO_WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // Ignore storage failures.
      }
    }

    const clearWorkspaceState = (): void => {
      try {
        window.sessionStorage.removeItem(THEME_STUDIO_WORKSPACE_STATE_STORAGE_KEY)
      } catch {
        // Ignore storage failures.
      }
    }

    const ACCORDION_TRANSITION_MS = 180
    const prefersReducedMotion = (): boolean =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const getContentElement = (section: HTMLDetailsElement): HTMLDivElement | null =>
      section.querySelector<HTMLDivElement>('.theme-section__content')

    const collapseInstant = (section: HTMLDetailsElement): void => {
      const inner = section.querySelector<HTMLDivElement>('.theme-section__content-inner')
      if (inner) {
        inner.style.maxHeight = ''
        inner.style.overflowY = ''
      }
      const content = getContentElement(section)
      if (content) content.classList.add('is-collapsed')
      section.classList.remove('is-closing')
      section.open = false
    }

    const expandInstant = (section: HTMLDetailsElement): void => {
      section.open = true
      section.classList.remove('is-closing')
      const content = getContentElement(section)
      if (content) content.classList.remove('is-collapsed')
    }

    const animateClose = (section: HTMLDetailsElement, onDone?: () => void): void => {
      if (!section.open) {
        onDone?.()
        return
      }

      if (prefersReducedMotion()) {
        collapseInstant(section)
        onDone?.()
        return
      }

      const content = getContentElement(section)
      if (!content) {
        collapseInstant(section)
        onDone?.()
        return
      }

      // Clear height constraint before animating closed.
      const inner = section.querySelector<HTMLDivElement>('.theme-section__content-inner')
      if (inner) {
        inner.style.maxHeight = ''
        inner.style.overflowY = ''
      }

      section.classList.add('is-closing')
      content.classList.add('is-collapsed')

      const cleanup = (): void => {
        clearTimeout(fallback)
        content.removeEventListener('transitionend', onEnd)
        section.open = false
        section.classList.remove('is-closing')
        onDone?.()
      }

      const onEnd = (e: TransitionEvent): void => {
        if (e.target === content && e.propertyName === 'grid-template-rows') {
          cleanup()
        }
      }

      content.addEventListener('transitionend', onEnd)
      const fallback = window.setTimeout(cleanup, ACCORDION_TRANSITION_MS + 50)
    }

    const clearSectionHeightConstraint = (): void => {
      sectionElements.forEach((s) => {
        const inner = s.querySelector<HTMLDivElement>('.theme-section__content-inner')
        if (!inner) return
        inner.style.maxHeight = ''
        inner.style.overflowY = ''
      })
    }

    const constrainOpenSectionHeight = (section: HTMLDetailsElement): void => {
      const panelBody = panelRoot.querySelector<HTMLDivElement>('.theme-studio-panel-body')
      if (!panelBody) return

      const inner = section.querySelector<HTMLDivElement>('.theme-section__content-inner')
      if (!inner) return

      // Clear any previous constraint so we measure the natural height.
      inner.style.maxHeight = ''
      inner.style.overflowY = ''

      const panelBodyRect = panelBody.getBoundingClientRect()
      const sectionRect = section.getBoundingClientRect()

      // If the section already fits entirely within view, do nothing.
      if (sectionRect.top >= panelBodyRect.top && sectionRect.bottom <= panelBodyRect.bottom) return

      const summary = section.querySelector<HTMLElement>('summary')
      if (!summary) return

      const contentEl = getContentElement(section)
      const contentStyle = contentEl ? getComputedStyle(contentEl) : null
      const contentPadding = contentStyle
        ? parseFloat(contentStyle.paddingTop) + parseFloat(contentStyle.paddingBottom)
        : 0

      const pad = 8
      const availableHeight = panelBody.clientHeight - summary.offsetHeight - contentPadding - pad * 2

      if (availableHeight > 0 && inner.scrollHeight > availableHeight) {
        inner.style.maxHeight = `${availableHeight}px`
        inner.style.overflowY = 'auto'
      }

      section.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    const animateOpen = (section: HTMLDetailsElement): void => {
      if (section.open && !section.classList.contains('is-closing')) return

      clearSectionHeightConstraint()
      const content = getContentElement(section)

      if (prefersReducedMotion()) {
        expandInstant(section)
        constrainOpenSectionHeight(section)
        return
      }

      // Ensure content starts collapsed so the transition plays.
      if (content) content.classList.add('is-collapsed')
      section.classList.remove('is-closing')
      section.open = true

      // Force a layout read, then remove collapsed to trigger transition.
      if (content) {
        void content.offsetHeight
        content.classList.remove('is-collapsed')

        const onEnd = (e: TransitionEvent): void => {
          if (e.target === content && e.propertyName === 'grid-template-rows') {
            clearTimeout(fallback)
            content.removeEventListener('transitionend', onEnd)
            constrainOpenSectionHeight(section)
          }
        }
        content.addEventListener('transitionend', onEnd)
        const fallback = window.setTimeout(() => {
          content.removeEventListener('transitionend', onEnd)
          constrainOpenSectionHeight(section)
        }, ACCORDION_TRANSITION_MS + 50)
      }
    }

    const initSectionVisualState = (): void => {
      sectionElements.forEach((section) => {
        const content = getContentElement(section)
        if (!content) return
        if (section.open) {
          content.classList.remove('is-collapsed')
        } else {
          content.classList.add('is-collapsed')
        }
      })
    }

    const handleAccordionClick = (event: MouseEvent): void => {
      const summary = (event.target as HTMLElement).closest('summary')
      if (!summary) return

      const section = summary.parentElement as HTMLDetailsElement | null
      if (!section || !sectionElements.includes(section)) return

      event.preventDefault()

      if (section.open && !section.classList.contains('is-closing')) {
        // Close the currently open section.
        animateClose(section, saveSectionState)
      } else {
        // Close any other open section, then open the clicked one.
        const currentlyOpen = sectionElements.find(
          (s) => s !== section && s.open,
        )
        if (currentlyOpen) {
          animateClose(currentlyOpen)
        }
        animateOpen(section)
        saveSectionState()
      }
    }

    const saveSectionState = (): void => {
      try {
        const openSectionId = sectionElements.find((s) => s.open && !s.classList.contains('is-closing'))?.dataset.sectionId || null
        window.localStorage.setItem(THEME_STUDIO_SECTION_STATE_STORAGE_KEY, JSON.stringify(openSectionId))
      } catch {
        // Ignore storage failures.
      }
    }

    const restoreSectionState = (): void => {
      try {
        const rawValue = window.localStorage.getItem(THEME_STUDIO_SECTION_STATE_STORAGE_KEY)
        if (!rawValue) {
          initSectionVisualState()
          return
        }

        const parsed = JSON.parse(rawValue) as unknown

        // Migrate from old format (Record<string, boolean>) to new format (string | null).
        let openId: string | null = null
        if (typeof parsed === 'string') {
          openId = parsed
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const entries = Object.entries(parsed as Record<string, unknown>)
          const firstOpen = entries.find(([, value]) => value === true)
          openId = firstOpen?.[0] ?? null
        }

        // Enforce accordion invariant: only one section open.
        sectionElements.forEach((section) => {
          section.open = section.dataset.sectionId === openId
        })

        initSectionVisualState()
      } catch {
        initSectionVisualState()
      }
    }

    const isMutating = (): boolean => pendingApply || pendingLibraryMutation
    const isBusy = (): boolean => pendingApply || pendingLibraryMutation || loadingThemeLibrary

    const getSelectedSavedTheme = (): ThemeLibraryTheme | undefined =>
      selectedThemeId === CUSTOM_THEME_ID ? undefined : themeLibrary.find((theme) => theme.id === selectedThemeId)

    const getSelectedReferenceTheme = (): ThemeLibraryTheme | null => {
      if (selectedThemeBaseline && selectedThemeBaseline.id === selectedThemeId) {
        return selectedThemeBaseline
      }
      if (selectedThemeId === CUSTOM_THEME_ID) return null

      const selectedTheme = getSelectedSavedTheme()
      return selectedTheme ? cloneThemeLibraryTheme(selectedTheme) : null
    }

    const findAppliedSavedTheme = (): ThemeLibraryTheme | undefined => {
      if (persistedAppliedThemeId !== undefined) {
        if (!persistedAppliedThemeId) return undefined
        return themeLibrary.find((theme) => theme.id === persistedAppliedThemeId)
      }

      return findMatchingTheme(persistedThemeState, themeLibrary)
    }

    const buildAppliedReferenceTheme = (): ThemeLibraryTheme => {
      const matched = findAppliedSavedTheme()
      if (matched) return cloneThemeLibraryTheme(matched)
      return createCustomThemeFromState(persistedThemeState)
    }

    const normalizeThemeNameKey = (value: string): string =>
      normalizeThemeScalar(value).replace(/\s+/g, ' ').toLowerCase()

    const findDuplicateThemeName = (excludedThemeIds: readonly string[] = []): ThemeLibraryTheme | undefined => {
      const draftNameKey = normalizeThemeNameKey(draftTheme.label)
      if (!draftNameKey) return undefined

      return themeLibrary.find((theme) => {
        if (excludedThemeIds.includes(theme.id)) return false
        return normalizeThemeNameKey(theme.label) === draftNameKey
      })
    }

    const hasDraftPreview = (): boolean => !areThemeStatesEquivalent(draftTheme, persistedThemeState)

    const hasApplyableChange = (): boolean => {
      if (hasDraftPreview()) return true

      const appliedSavedThemeId = persistedAppliedThemeId ?? ''
      const selectedSavedTheme = getSelectedSavedTheme()
      if (!selectedSavedTheme) return false

      return selectedSavedTheme.id !== appliedSavedThemeId
    }

    const hasDraftChangesFromAppliedReference = (): boolean => {
      const referenceTheme = buildAppliedReferenceTheme()
      if (selectedThemeId !== referenceTheme.id) return true
      return !areThemeLibraryThemesEqual(draftTheme, referenceTheme)
    }

    const hasDraftChangesFromSelectedReference = (): boolean => {
      const referenceTheme = getSelectedReferenceTheme()
      if (!referenceTheme) return false
      return !areThemeLibraryThemesEqual(draftTheme, referenceTheme)
    }

    const hasSelectedThemeChanges = (): boolean => {
      const selectedTheme = getSelectedReferenceTheme()
      if (!selectedTheme) return false
      return !areThemeLibraryThemesEqual(draftTheme, selectedTheme)
    }

    const canSaveNewTheme = (): boolean => {
      if (normalizeThemeScalar(draftTheme.label).length === 0) return false
      return !findDuplicateThemeName()
    }

    const canSaveSelectedTheme = (): boolean => {
      const selectedTheme = getSelectedSavedTheme()
      if (!selectedTheme) return false
      if (!hasSelectedThemeChanges()) return false
      return !findDuplicateThemeName([selectedTheme.id])
    }

    const canDeleteSelectedTheme = (): boolean => {
      const selectedTheme = getSelectedSavedTheme()
      if (!selectedTheme) return false

      const appliedSavedTheme = findAppliedSavedTheme()
      if (appliedSavedTheme && selectedTheme.id === appliedSavedTheme.id) {
        return false
      }

      return true
    }

    const isEditingCurrentSavedTheme = (): boolean => {
      if (selectedThemeId === CUSTOM_THEME_ID) return false

      const appliedSavedThemeId = normalizeThemeScalar(persistedAppliedThemeId)
      if (appliedSavedThemeId) {
        return selectedThemeId === appliedSavedThemeId
      }

      const appliedReferenceTheme = buildAppliedReferenceTheme()
      if (appliedReferenceTheme.id === CUSTOM_THEME_ID) return false

      return selectedThemeId === appliedReferenceTheme.id
    }

    const isSelectedThemeCurrentSiteTheme = (): boolean => isEditingCurrentSavedTheme()

    const shouldSaveAndApply = (): boolean => {
      const selectedTheme = getSelectedSavedTheme()
      if (!selectedTheme) return false
      if (isSelectedThemeCurrentSiteTheme()) return false
      return hasSelectedThemeChanges()
    }

    const syncHeaderThemeSummary = (): void => {
      const currentTheme = buildAppliedReferenceTheme()
      const editingThemeName = normalizeThemeScalar(draftTheme.label) || 'Custom Draft'
      const currentThemeName = normalizeThemeScalar(currentTheme.label) || 'Custom Theme'
      const isEditingCurrentTheme = selectedThemeId === currentTheme.id
      const hasUnsavedCurrentThemeChanges = isEditingCurrentTheme && hasDraftChangesFromAppliedReference()
      const headerState = isEditingCurrentTheme ? (hasUnsavedCurrentThemeChanges ? 'dirty' : 'default') : 'mismatch'

      if (editingThemeElement) {
        editingThemeElement.dataset.state = headerState
      }
      themeSelect.title = `Editing: ${editingThemeName}${hasUnsavedCurrentThemeChanges ? '*' : ''}`
      if (editingThemeMarkerElement) {
        editingThemeMarkerElement.hidden = !hasUnsavedCurrentThemeChanges
      }

      if (currentThemeElement) {
        currentThemeElement.textContent = `Site Theme: ${currentThemeName}${hasUnsavedCurrentThemeChanges ? '*' : ''}`
        currentThemeElement.dataset.state = headerState
      }
    }

    const syncActionTooltips = (): void => {
      const currentTheme = buildAppliedReferenceTheme()
      const currentThemeName = normalizeThemeScalar(currentTheme.label) || 'Custom Theme'
      const selectedReferenceTheme = getSelectedReferenceTheme()
      const selectedReferenceThemeName =
        normalizeThemeScalar(selectedReferenceTheme?.label) ||
        (selectedThemeId === CUSTOM_THEME_ID ? 'this custom draft' : 'the selected theme')
      const selectedTheme = getSelectedSavedTheme()
      const selectedThemeName = normalizeThemeScalar(selectedTheme?.label) || 'selected theme'
      const selectedThemeIsCurrentSiteTheme = isSelectedThemeCurrentSiteTheme()
      const duplicateNameForNew = findDuplicateThemeName()
      const duplicateNameForSelected = selectedTheme ? findDuplicateThemeName([selectedTheme.id]) : undefined
      const saveAndApplyBlocked = shouldSaveAndApply() && !canSaveSelectedTheme()
      const isEditingCurrentTheme = selectedThemeId === currentTheme.id
      const hasDraftChanges = hasDraftChangesFromAppliedReference()
      const resetToCurrentTitle = !hasDraftChanges
        ? `Already editing the current site theme.`
        : isEditingCurrentTheme
          ? `Discard unsaved changes and restore "${currentThemeName}" as the editing theme.`
          : `Switch the editor back to "${currentThemeName}".`

      const revertTitle = `Discard unsaved changes and restore ${selectedReferenceThemeName}.`
      let applyTitle = 'Apply this draft to the live site.'
      if (!hasApplyableChange()) {
        applyTitle = 'There is nothing new to apply right now.'
      } else if (saveAndApplyBlocked) {
        applyTitle = `Choose a unique name before you can save and apply. "${duplicateNameForSelected?.label || 'Another theme'}" already exists.`
      } else if (shouldSaveAndApply()) {
        applyTitle = `Save changes to "${selectedThemeName}" and make it the site theme.`
      } else if (selectedTheme && !selectedThemeIsCurrentSiteTheme) {
        applyTitle = `Make "${selectedThemeName}" the site theme.`
      }
      const saveNewTitle =
        normalizeThemeScalar(draftTheme.label).length === 0
          ? 'Enter a name before saving a new theme.'
          : duplicateNameForNew
            ? `Choose a unique name before saving. "${duplicateNameForNew.label}" already exists.`
            : 'Save this draft as a new reusable theme in the theme library. Its internal id is generated automatically.'
      const saveTitle = !selectedTheme
        ? 'Select a saved theme to overwrite it with this draft.'
        : duplicateNameForSelected
          ? `Choose a unique name before saving. "${duplicateNameForSelected.label}" already exists.`
          : selectedThemeIsCurrentSiteTheme
            ? `Overwrite "${selectedThemeName}" in the theme library and update the live site because it is the current theme.`
            : `Overwrite "${selectedThemeName}" in the theme library with this draft. Its internal id stays the same.`
      const appliedSavedTheme = findAppliedSavedTheme()
      const deleteTitle = !selectedTheme
        ? 'Select a saved theme to delete it from the theme library.'
        : appliedSavedTheme && selectedTheme.id === appliedSavedTheme.id
          ? `Cannot delete "${selectedThemeName}" because it is the current theme for the site.`
          : `Delete "${selectedThemeName}" from the theme library. The current draft will stay loaded.`

      if (revertButton) {
        revertButton.title = revertTitle
        revertButton.setAttribute('aria-label', revertTitle)
      }
      if (applyButton) {
        applyButton.textContent = shouldSaveAndApply() ? 'Save & Apply' : 'Apply'
        applyButton.title = applyTitle
      }
      if (resetToCurrentButton) {
        resetToCurrentButton.title = resetToCurrentTitle
        resetToCurrentButton.setAttribute('aria-label', resetToCurrentTitle)
      }
      if (saveNewButton) {
        saveNewButton.title = saveNewTitle
      }
      if (saveButton) {
        saveButton.title = saveTitle
      }
      if (deleteButton) {
        deleteButton.title = deleteTitle
        deleteButton.setAttribute('aria-label', deleteTitle)
      }
    }

    const syncThemeSelectOptions = (): void => {
      themeSelect.options.length = 0

      const customOption = document.createElement('option')
      customOption.value = CUSTOM_THEME_ID
      customOption.textContent = 'Unsaved Draft'
      themeSelect.add(customOption)

      themeLibrary.forEach((theme) => {
        const option = document.createElement('option')
        option.value = theme.id
        option.textContent = theme.label
        themeSelect.add(option)
      })

      if (selectedThemeId !== CUSTOM_THEME_ID && !themeLibrary.some((theme) => theme.id === selectedThemeId)) {
        const restoredOption = document.createElement('option')
        restoredOption.value = selectedThemeId
        restoredOption.textContent = normalizeThemeScalar(draftTheme.label) || 'Saved Theme'
        themeSelect.add(restoredOption)
      }
      themeSelect.value = selectedThemeId
    }

    const syncColorControls = (): void => {
      CORE_COLOR_FIELDS.forEach((field) => {
        const nextValue = normalizeHexColor(draftTheme.colors[field.key], DEFAULT_THEME_COLORS[field.key])
        const input = coreColorInputs.get(field.key)
        const value = coreColorValues.get(field.key)
        if (input) input.value = nextValue
        if (value) value.textContent = nextValue
      })

      OPTIONAL_COLOR_FIELDS.forEach((field) => {
        const currentValue = readOptionalColorValue(draftTheme, field.key)
        const isAuto = currentValue.length === 0
        const visibleValue = isAuto
          ? getEffectiveOptionalColor(draftTheme, field.key)
          : normalizeHexColor(currentValue, '#000000')

        const input = optionalColorInputs.get(field.key)
        const value = optionalColorValues.get(field.key)
        const autoInput = optionalColorAutoInputs.get(field.key)

        if (input) {
          input.value = visibleValue
          input.disabled = isAuto || isMutating()
        }
        if (value) {
          value.textContent = isAuto ? `${visibleValue} (auto)` : visibleValue
        }
        if (autoInput) {
          autoInput.checked = isAuto
          autoInput.disabled = isMutating()
        }
      })
    }

    const syncHomeHeroDividerColorControl = (): void => {
      const currentValue = normalizeThemeScalar(draftTheme.homeHero.divider.color)
      const isAuto = currentValue.length === 0
      const effectiveValue = getEffectiveHomeHeroDividerColor(draftTheme)

      if (homeHeroDividerColorInput) {
        homeHeroDividerColorInput.value = isAuto
          ? effectiveValue
          : normalizeHexColor(currentValue, homeHeroDividerColorManualValue || effectiveValue)
        homeHeroDividerColorInput.disabled = isMutating() || isAuto
      }

      if (homeHeroDividerColorAutoInput) {
        homeHeroDividerColorAutoInput.checked = isAuto
        homeHeroDividerColorAutoInput.disabled = isMutating()
      }
    }

    const syncControlValues = (): void => {
      syncThemeSelectOptions()

      if (themeNameInput) themeNameInput.value = draftTheme.label
      if (themeDescriptionInput) themeDescriptionInput.value = draftTheme.description
      if (themeCustomCssInput) {
        themeCustomCssInput.value = draftTheme.customCss
        themeCustomCssInput.disabled = isMutating()
      }
      if (homeHeroMirrorImageInput) {
        homeHeroMirrorImageInput.checked = draftTheme.homeHero.mirrorImage
        homeHeroMirrorImageInput.disabled = isMutating()
      }
      if (homeHeroDividerVisibleInput) {
        homeHeroDividerVisibleInput.checked = draftTheme.homeHero.divider.visible
        homeHeroDividerVisibleInput.disabled = isMutating()
      }
      if (homeHeroDividerWidthInput) {
        homeHeroDividerWidthInput.value = String(draftTheme.homeHero.divider.widthPx)
        homeHeroDividerWidthInput.disabled = isMutating() || !draftTheme.homeHero.divider.visible
      }
      syncHomeHeroDividerColorControl()

      fontBodySelect.value = normalizeThemeScalar(draftTheme.fontBody) || DEFAULT_THEME_FONT_BODY
      fontHeadingSelect.value = normalizeThemeScalar(draftTheme.fontHeading) || DEFAULT_THEME_FONT_HEADING
      borderRadiusSelect.value = normalizeThemeScalar(draftTheme.borderRadius) || 'none'
      playerRadiusSelect.value = normalizeThemeScalar(draftTheme.playerBorderRadius)
      socialRadiusSelect.value = normalizeThemeScalar(draftTheme.socialIconBorderRadius)
      profileRadiusSelect.value = normalizeThemeScalar(draftTheme.profileImageBorderRadius)
      tagBadgeRadiusSelect.value = normalizeThemeScalar(draftTheme.tagBadgeBorderRadius)
      aboutPagePositionSelect.value = draftTheme.aboutPage.position
      aboutPageMaxWidthSelect.value = draftTheme.aboutPage.maxWidth
      contactPagePositionSelect.value = draftTheme.contactPage.position
      contactPageMaxWidthSelect.value = draftTheme.contactPage.maxWidth
      homeHeroLayoutModeSelect.value = draftTheme.homeHero.layout.mode
      homeHeroImagePositionSelect.value = draftTheme.homeHero.layout.columnsImagePosition
      homeHeroColumnSplitSelect.value = draftTheme.homeHero.layout.columnSplit
      homeHeroStackedImageOrderSelect.value = draftTheme.homeHero.layout.stackedImageOrder
      homeHeroTitleScaleSelect.value = draftTheme.homeHero.typography.titleScale
      homeHeroTaglineScaleSelect.value = draftTheme.homeHero.typography.taglineScale
      homeHeroCitationScaleSelect.value = draftTheme.homeHero.typography.citationScale
      homeHeroDividerGlowSelect.value = draftTheme.homeHero.divider.glow
      homeHeroDividerGlowSideSelect.value = draftTheme.homeHero.divider.glowSide
      homeHeroListenStyleSelect.value = draftTheme.homeHero.actions.listenNow
      homeHeroSearchStyleSelect.value = draftTheme.homeHero.actions.searchMusic
      const usesColumnsLayout = draftTheme.homeHero.layout.mode === 'columns'
      const usesStackedLayout = draftTheme.homeHero.layout.mode === 'stacked'
      homeHeroLayoutModeSelect.disabled = isMutating()
      homeHeroImagePositionSelect.disabled = isMutating() || !usesColumnsLayout
      homeHeroColumnSplitSelect.disabled = isMutating() || !usesColumnsLayout
      homeHeroStackedImageOrderSelect.disabled = isMutating() || !usesStackedLayout
      const imagePositionField = homeHeroImagePositionSelect.closest('.field')
      if (imagePositionField instanceof HTMLElement) {
        imagePositionField.hidden = !usesColumnsLayout
      }
      const columnSplitField = homeHeroColumnSplitSelect.closest('.field')
      if (columnSplitField instanceof HTMLElement) {
        columnSplitField.hidden = !usesColumnsLayout
      }
      const stackedImageOrderField = homeHeroStackedImageOrderSelect.closest('.field')
      if (stackedImageOrderField instanceof HTMLElement) {
        stackedImageOrderField.hidden = !usesStackedLayout
      }
      homeHeroTitleScaleSelect.disabled = isMutating()
      homeHeroTaglineScaleSelect.disabled = isMutating()
      homeHeroCitationScaleSelect.disabled = isMutating()
      homeHeroDividerGlowSelect.disabled = isMutating() || !draftTheme.homeHero.divider.visible
      homeHeroDividerGlowSideSelect.disabled =
        isMutating() || !draftTheme.homeHero.divider.visible || draftTheme.homeHero.divider.glow === 'none'
      aboutPagePositionSelect.disabled = isMutating()
      aboutPageMaxWidthSelect.disabled = isMutating()
      contactPagePositionSelect.disabled = isMutating()
      contactPageMaxWidthSelect.disabled = isMutating()
      homeHeroListenStyleSelect.disabled = isMutating()
      homeHeroSearchStyleSelect.disabled = isMutating()
      if (overlayToggleInput) {
        overlayToggleInput.checked = draftTheme.disableImageOverlays === true
        overlayToggleInput.disabled = isMutating()
      }

      syncColorControls()
      syncHeaderThemeSummary()
    }

    const updateActionState = (): void => {
      const busy = isBusy()
      const applyBlockedBySaveRules = shouldSaveAndApply() && !canSaveSelectedTheme()

      if (applyButton) {
        applyButton.disabled = busy || !hasApplyableChange() || isEditingCurrentSavedTheme() || applyBlockedBySaveRules
      }
      if (resetToCurrentButton) {
        resetToCurrentButton.disabled = busy || !hasDraftChangesFromAppliedReference()
      }
      if (revertButton) revertButton.disabled = busy || !hasDraftChangesFromSelectedReference()
      if (saveNewButton) saveNewButton.disabled = busy || !canSaveNewTheme()
      if (saveButton) saveButton.disabled = busy || !canSaveSelectedTheme()
      if (deleteButton) deleteButton.disabled = busy || !canDeleteSelectedTheme()
      syncActionTooltips()
    }

    const syncUi = (): void => {
      syncControlValues()
      updateActionState()
      persistWorkspaceState()
    }

    const ensureAttached = (): void => {
      if (!workspaceStyleElement.isConnected) {
        document.head.append(workspaceStyleElement)
      }
      if (!workspaceElement.isConnected) {
        document.body.append(workspaceElement)
      }
    }

    // ── Resize handle drag ──────────────────────────────────────────────

    const MIN_PANEL_WIDTH = 320
    const MAX_PANEL_RATIO = 0.65

    let isResizing = false
    let resizeStartX = 0
    let resizeStartWidth = 0

    const readPersistedPanelWidth = (): number | null => {
      try {
        const raw = window.localStorage.getItem(THEME_STUDIO_PANEL_WIDTH_STORAGE_KEY)
        if (!raw) return null
        const value = Number(raw)
        return Number.isFinite(value) && value >= MIN_PANEL_WIDTH ? value : null
      } catch {
        return null
      }
    }

    const persistPanelWidth = (width: number): void => {
      try {
        window.localStorage.setItem(THEME_STUDIO_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)))
      } catch {
        // Ignore storage failures.
      }
    }

    const applyPanelWidth = (width: number): void => {
      workspaceElement.style.gridTemplateColumns = `minmax(0, 1fr) 0px ${width}px`
    }

    const restorePersistedPanelWidth = (): void => {
      const saved = readPersistedPanelWidth()
      if (saved) {
        const maxWidth = window.innerWidth * MAX_PANEL_RATIO
        applyPanelWidth(Math.min(saved, maxWidth))
      }
    }

    resizeHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      // Only resize on desktop layout (handle is display:none on mobile)
      if (resizeHandle.offsetParent === null) return

      e.preventDefault()
      isResizing = true
      resizeStartX = e.clientX
      resizeStartWidth = windowElement.getBoundingClientRect().width
      resizeHandle.classList.add('active')
      resizeHandle.setPointerCapture(e.pointerId)

      // Prevent iframe from eating pointer events during drag
      previewFrame.style.pointerEvents = 'none'
    })

    resizeHandle.addEventListener('pointermove', (e: PointerEvent) => {
      if (!isResizing) return
      const delta = resizeStartX - e.clientX // dragging left = wider panel
      const viewportWidth = window.innerWidth
      const maxWidth = viewportWidth * MAX_PANEL_RATIO
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, resizeStartWidth + delta))
      applyPanelWidth(newWidth)
    })

    const stopResize = (): void => {
      if (!isResizing) return
      isResizing = false
      resizeHandle.classList.remove('active')
      previewFrame.style.pointerEvents = ''

      // Persist the final width
      const finalWidth = windowElement.getBoundingClientRect().width
      if (finalWidth >= MIN_PANEL_WIDTH) {
        persistPanelWidth(finalWidth)
      }
    }

    resizeHandle.addEventListener('pointerup', stopResize)
    resizeHandle.addEventListener('pointercancel', stopResize)
    resizeHandle.addEventListener('lostpointercapture', stopResize)

    const syncPreviewFrameFromDraft = (): void => {
      const previewWindow = previewFrame.contentWindow as
        | (Window & { __themeStudioPreviewPendingTheme?: ThemePageState; __themeStudioPreviewPendingThemeId?: string })
        | null
      const nextDraft = cloneThemeState(draftTheme)
      const nextDraftThemeId = draftTheme.id

      if (previewWindow) {
        previewWindow.__themeStudioPreviewPendingTheme = cloneThemeState(nextDraft)
        previewWindow.__themeStudioPreviewPendingThemeId = nextDraftThemeId
      }

      const bridge = getPreviewBridge(previewWindow)
      if (bridge) {
        bridge.applyTheme(nextDraft, nextDraftThemeId)
        return
      }

      const previewDocument = previewFrame.contentDocument
      if (!previewDocument) return

      ensureThemeStudioPreviewStyles(previewDocument)
      applyThemeState(nextDraft, previewDocument, nextDraftThemeId)
    }

    const syncPreviewFrameSource = (forceReload = false): void => {
      const nextUrl = buildThemeStudioPreviewUrl()
      if (!forceReload && lastSeededPreviewUrl === nextUrl && previewFrame.src) return
      lastSeededPreviewUrl = nextUrl
      previewFrame.src = nextUrl
    }

    const applyDraftPreview = (): void => {
      syncPreviewFrameFromDraft()
      syncColorControls()
      syncHomeHeroDividerColorControl()
      syncHeaderThemeSummary()
      updateActionState()
      persistWorkspaceState()
    }

    const resetDraftToSelectedTheme = (message?: string, tone: 'info' | 'success' | 'error' = 'info'): void => {
      const referenceTheme = getSelectedReferenceTheme()
      if (!referenceTheme) return

      draftTheme = cloneThemeLibraryTheme(referenceTheme)
      seedDerivedManualValues()
      applyDraftPreview()
      syncUi()
      if (message) {
        setStatus(message, tone)
      }
    }

    const resetDraftToAppliedTheme = (message?: string, tone: 'info' | 'success' | 'error' = 'info'): void => {
      const referenceTheme = buildAppliedReferenceTheme()
      selectedThemeId = referenceTheme.id
      selectedThemeBaseline = cloneThemeLibraryTheme(referenceTheme)
      draftTheme = cloneThemeLibraryTheme(referenceTheme)
      seedDerivedManualValues()
      applyDraftPreview()
      syncUi()
      if (message) {
        setStatus(message, tone)
      }
    }

    const setDraftPreviewStatus = (): void => {
      if (hasDraftPreview()) {
        if (isSelectedThemeCurrentSiteTheme()) {
          setStatus('Preview active. Save Changes will update the current site theme.')
        } else if (shouldSaveAndApply()) {
          setStatus(
            canSaveSelectedTheme()
              ? 'Preview active. Save & Apply will save this theme and make it the site theme.'
              : 'Preview active. Rename this theme to a unique name before you can Save & Apply.',
          )
        } else {
          setStatus('Preview active. Apply commits the current draft.')
        }
      } else if (hasApplyableChange()) {
        setStatus('Apply will switch the site to this saved theme.')
      } else {
        setStatus('Draft matches the current applied theme.')
      }
    }

    const refreshFromPageData = (): void => {
      const nextThemeData = readThemePageDataFromPage()
      if (!nextThemeData) return

      const hadDraftChanges = hasDraftChangesFromAppliedReference()
      persistedThemeState = nextThemeData.themeState
      persistedAppliedThemeId = nextThemeData.currentThemeId

      if (!hadDraftChanges) {
        resetDraftToAppliedTheme()
        setDraftPreviewStatus()
        return
      }

      syncHeaderThemeSummary()
      updateActionState()
    }

    const loadThemeLibrary = async (): Promise<void> => {
      if (loadingThemeLibrary) return

      const hadDraftChanges = hasDraftChangesFromAppliedReference()
      loadingThemeLibrary = true
      updateActionState()
      setStatus('Loading saved themes...')

      try {
        const fetchedThemes = await fetchThemeLibrary()
        themeLibrary = fetchedThemes.length > 0 ? fetchedThemes : createFallbackThemeLibrary()
        if (!selectedThemeBaseline && selectedThemeId !== CUSTOM_THEME_ID) {
          const selectedTheme = themeLibrary.find((theme) => theme.id === selectedThemeId)
          if (selectedTheme) {
            selectedThemeBaseline = cloneThemeLibraryTheme(selectedTheme)
          }
        }
        const loadMessage =
          fetchedThemes.length > 0 ? 'Theme library loaded.' : 'No saved custom themes yet. Showing built-in themes.'
        if (!hadDraftChanges) {
          resetDraftToAppliedTheme(loadMessage)
        } else {
          if (selectedThemeId !== CUSTOM_THEME_ID && !themeLibrary.some((theme) => theme.id === selectedThemeId)) {
            draftTheme = {
              ...cloneThemeLibraryTheme(draftTheme),
              id: CUSTOM_THEME_ID,
              label: normalizeThemeScalar(draftTheme.label) || 'Custom Theme',
            }
            selectedThemeId = CUSTOM_THEME_ID
            selectedThemeBaseline = cloneThemeLibraryTheme(draftTheme)
          }
          syncUi()
          setStatus(loadMessage)
        }
      } catch (error) {
        console.warn('Failed to load theme library.', error)
        themeLibrary = createFallbackThemeLibrary()
        if (!hadDraftChanges) {
          resetDraftToAppliedTheme(
            isThemeLibraryRouteUnavailable(error)
              ? 'Theme library API is unavailable. Restart Astro dev server once to enable saved themes.'
              : 'Showing built-in themes only.',
            'info',
          )
        } else {
          syncUi()
          setStatus(
            isThemeLibraryRouteUnavailable(error)
              ? 'Theme library API is unavailable. Restart Astro dev server once to enable saved themes.'
              : 'Showing built-in themes only.',
            'info',
          )
        }
      } finally {
        loadingThemeLibrary = false
        updateActionState()
      }
    }

    const handleSavedThemeSelection = (): void => {
      const nextId = themeSelect.value

      if (nextId === CUSTOM_THEME_ID) {
        selectedThemeId = CUSTOM_THEME_ID
        draftTheme = {
          ...cloneThemeLibraryTheme(draftTheme),
          id: CUSTOM_THEME_ID,
          label: normalizeThemeScalar(draftTheme.label) || 'Custom Theme',
        }
        selectedThemeBaseline = cloneThemeLibraryTheme(draftTheme)
        syncUi()
        setStatus('Editing an unsaved custom draft.')
        return
      }

      const selectedTheme = themeLibrary.find((theme) => theme.id === nextId)
      if (!selectedTheme) {
        setStatus('Unknown saved theme.', 'error')
        syncUi()
        return
      }

      selectedThemeId = selectedTheme.id
      selectedThemeBaseline = cloneThemeLibraryTheme(selectedTheme)
      draftTheme = cloneThemeLibraryTheme(selectedTheme)
      seedDerivedManualValues()
      applyDraftPreview()
      syncUi()
      setDraftPreviewStatus()
    }

    const applyCurrentDraft = async (): Promise<void> => {
      if (!hasApplyableChange()) return
      if (shouldSaveAndApply() && !canSaveSelectedTheme()) {
        const selectedTheme = getSelectedSavedTheme()
        const duplicateTheme = selectedTheme ? findDuplicateThemeName([selectedTheme.id]) : undefined
        setStatus(
          duplicateTheme
            ? `Choose a unique theme name. "${duplicateTheme.label}" already exists.`
            : 'Save & Apply is unavailable until the selected theme can be saved.',
          'error',
        )
        return
      }

      pendingApply = true
      updateActionState()
      setStatus(shouldSaveAndApply() ? 'Saving and applying selected theme...' : 'Applying current draft...')

      try {
        const selectedTheme = getSelectedSavedTheme()
        const shouldSaveSelectedThemeFirst = shouldSaveAndApply() && selectedTheme
        let nextThemeToApply = cloneThemeLibraryTheme(draftTheme)
        let appliedSavedThemeId = ''

        if (shouldSaveSelectedThemeFirst && selectedTheme) {
          const result = await mutateThemeLibrary({
            action: 'update',
            id: selectedTheme.id,
            theme: createThemeLibraryPayload(draftTheme),
          })
          themeLibrary = result.themes
          const updatedTheme = result.theme ?? themeLibrary.find((theme) => theme.id === selectedTheme.id)
          if (updatedTheme) {
            draftTheme = cloneThemeLibraryTheme(updatedTheme)
            selectedThemeId = updatedTheme.id
            selectedThemeBaseline = cloneThemeLibraryTheme(updatedTheme)
            nextThemeToApply = cloneThemeLibraryTheme(updatedTheme)
            seedDerivedManualValues()
          }
          appliedSavedThemeId = selectedTheme.id
        } else {
          appliedSavedThemeId = resolveAppliedSavedThemeId(draftTheme, selectedTheme)
        }

        await persistThemePreset(nextThemeToApply, appliedSavedThemeId)
        persistedThemeState = cloneThemeState(nextThemeToApply)
        persistedAppliedThemeId = appliedSavedThemeId
        if (appliedSavedThemeId) {
          selectedThemeId = appliedSavedThemeId
          if (!selectedThemeBaseline || selectedThemeBaseline.id !== appliedSavedThemeId) {
            const appliedTheme = themeLibrary.find((theme) => theme.id === appliedSavedThemeId)
            if (appliedTheme) {
              selectedThemeBaseline = cloneThemeLibraryTheme(appliedTheme)
            }
          }
        } else {
          selectedThemeId = CUSTOM_THEME_ID
          draftTheme = createCustomThemeFromState(
            nextThemeToApply,
            normalizeThemeScalar(nextThemeToApply.label) || 'Custom Theme',
            normalizeThemeScalar(nextThemeToApply.description),
          )
          selectedThemeBaseline = cloneThemeLibraryTheme(draftTheme)
          seedDerivedManualValues()
        }
        applyThemeState(persistedThemeState, document, persistedAppliedThemeId)
        syncUi()
        setStatus(
          shouldSaveSelectedThemeFirst
            ? 'Saved changes and applied the selected theme.'
            : appliedSavedThemeId
              ? 'Current draft applied and synced as the active saved theme.'
              : 'Current draft applied as a custom theme.',
          'success',
        )
      } catch (error) {
        console.warn('Failed to persist theme draft.', error)
        setStatus('Could not apply the current draft. Please try again.', 'error')
      } finally {
        pendingApply = false
        updateActionState()
      }
    }

    const saveNewTheme = async (): Promise<void> => {
      const nextLabel = normalizeThemeScalar(draftTheme.label)
      if (!nextLabel) {
        setStatus('Add a theme name before saving a new theme.', 'error')
        return
      }

      const duplicateTheme = findDuplicateThemeName()
      if (duplicateTheme) {
        setStatus(`Choose a unique theme name. "${duplicateTheme.label}" already exists.`, 'error')
        return
      }

      pendingLibraryMutation = true
      updateActionState()
      setStatus('Saving new theme...')

      try {
        const result = await mutateThemeLibrary({
          action: 'create',
          theme: createThemeLibraryPayload(draftTheme),
        })
        themeLibrary = result.themes
        const createdTheme =
          result.theme ??
          themeLibrary.find((theme) => normalizeThemeScalar(theme.label) === nextLabel) ??
          createCustomThemeFromState(draftTheme, nextLabel, draftTheme.description)
        draftTheme = cloneThemeLibraryTheme(createdTheme)
        selectedThemeId = draftTheme.id
        selectedThemeBaseline = cloneThemeLibraryTheme(createdTheme)
        seedDerivedManualValues()
        syncUi()
        setStatus(`Saved "${draftTheme.label}" to the theme library.`, 'success')
      } catch (error) {
        console.warn('Failed to save new theme.', error)
        setStatus(
          isThemeLibraryRouteUnavailable(error)
            ? 'Theme library API is unavailable. Restart Astro dev server once, then try Save New again.'
            : 'Could not save the new theme. Please try again.',
          'error',
        )
      } finally {
        pendingLibraryMutation = false
        updateActionState()
      }
    }

    const saveSelectedTheme = async (): Promise<void> => {
      const selectedTheme = getSelectedSavedTheme()
      if (!selectedTheme) {
        setStatus('Choose a saved theme before saving changes.', 'error')
        return
      }

      const duplicateTheme = findDuplicateThemeName([selectedTheme.id])
      if (duplicateTheme) {
        setStatus(`Choose a unique theme name. "${duplicateTheme.label}" already exists.`, 'error')
        return
      }

      pendingLibraryMutation = true
      updateActionState()
      setStatus(`Updating "${selectedTheme.label}"...`)

      try {
        const result = await mutateThemeLibrary({
          action: 'update',
          id: selectedTheme.id,
          theme: createThemeLibraryPayload(draftTheme),
        })
        themeLibrary = result.themes
        const updatedTheme = result.theme ?? themeLibrary.find((theme) => theme.id === selectedTheme.id)
        const shouldUpdateLiveSite = isSelectedThemeCurrentSiteTheme()
        if (updatedTheme) {
          draftTheme = cloneThemeLibraryTheme(updatedTheme)
          selectedThemeId = updatedTheme.id
          selectedThemeBaseline = cloneThemeLibraryTheme(updatedTheme)
          seedDerivedManualValues()
          if (shouldUpdateLiveSite) {
            await persistThemePreset(updatedTheme, updatedTheme.id)
            persistedThemeState = cloneThemeState(updatedTheme)
            persistedAppliedThemeId = updatedTheme.id
            applyThemeState(persistedThemeState, document, persistedAppliedThemeId)
          }
        }
        syncUi()
        setStatus(
          shouldUpdateLiveSite
            ? 'Saved changes and updated the current site theme.'
            : 'Saved changes to the selected theme.',
          'success',
        )
      } catch (error) {
        console.warn('Failed to update theme.', error)
        setStatus(
          isThemeLibraryRouteUnavailable(error)
            ? 'Theme library API is unavailable. Restart Astro dev server once, then try Save Changes again.'
            : 'Could not save theme changes. Please try again.',
          'error',
        )
      } finally {
        pendingLibraryMutation = false
        updateActionState()
      }
    }

    const deleteSelectedTheme = async (): Promise<void> => {
      const selectedTheme = getSelectedSavedTheme()
      if (!selectedTheme) {
        setStatus('Choose a saved theme before deleting.', 'error')
        return
      }

      const appliedSavedTheme = findAppliedSavedTheme()
      if (appliedSavedTheme && selectedTheme.id === appliedSavedTheme.id) {
        setStatus('Switch the site to a different current theme before deleting this one.', 'error')
        return
      }

      const confirmed = window.confirm(`Delete "${selectedTheme.label}" from the theme library?`)
      if (!confirmed) return

      pendingLibraryMutation = true
      updateActionState()
      setStatus(`Deleting "${selectedTheme.label}"...`)

      try {
        const result = await mutateThemeLibrary({
          action: 'delete',
          id: selectedTheme.id,
        })
        themeLibrary = result.themes
        selectedThemeId = CUSTOM_THEME_ID
        draftTheme = {
          ...cloneThemeLibraryTheme(draftTheme),
          id: CUSTOM_THEME_ID,
          label: normalizeThemeScalar(draftTheme.label) || 'Custom Theme',
        }
        selectedThemeBaseline = cloneThemeLibraryTheme(draftTheme)
        syncUi()
        setStatus('Theme deleted. The current draft stays loaded.', 'success')
      } catch (error) {
        console.warn('Failed to delete theme.', error)
        setStatus(
          isThemeLibraryRouteUnavailable(error)
            ? 'Theme library API is unavailable. Restart Astro dev server once, then try Delete again.'
            : 'Could not delete the selected theme. Please try again.',
          'error',
        )
      } finally {
        pendingLibraryMutation = false
        updateActionState()
      }
    }

    previewFrame.addEventListener('load', () => {
      syncPreviewFrameFromDraft()
    })

    restoreSectionState()
    sectionElements.forEach((section) => {
      const summary = section.querySelector('summary')
      if (summary) summary.addEventListener('click', handleAccordionClick)
    })

    themeSelect.addEventListener('change', handleSavedThemeSelection)

    themeNameInput?.addEventListener('input', () => {
      draftTheme.label = themeNameInput.value
      syncHeaderThemeSummary()
      updateActionState()
      persistWorkspaceState()
    })

    themeDescriptionInput?.addEventListener('input', () => {
      draftTheme.description = themeDescriptionInput.value
      syncHeaderThemeSummary()
      updateActionState()
      persistWorkspaceState()
    })

    themeCustomCssInput?.addEventListener('input', () => {
      draftTheme.customCss = normalizeThemeCustomCss(themeCustomCssInput.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    CORE_COLOR_FIELDS.forEach((field) => {
      const input = coreColorInputs.get(field.key)
      input?.addEventListener('input', () => {
        const nextValue = normalizeHexColor(input.value, draftTheme.colors[field.key])
        draftTheme.colors[field.key] = nextValue
        draftTheme.rawColors[field.key] = nextValue
        applyDraftPreview()
        setDraftPreviewStatus()
      })
    })

    OPTIONAL_COLOR_FIELDS.forEach((field) => {
      const input = optionalColorInputs.get(field.key)
      const autoInput = optionalColorAutoInputs.get(field.key)

      autoInput?.addEventListener('change', () => {
        const currentValue = readOptionalColorValue(draftTheme, field.key)
        if (autoInput.checked) {
          if (currentValue.length > 0) {
            optionalColorManualValues.set(
              field.key,
              normalizeHexColor(currentValue, getEffectiveOptionalColor(draftTheme, field.key)),
            )
          }
          writeOptionalColorValue(draftTheme, field.key, '')
        } else {
          const restoredValue =
            optionalColorManualValues.get(field.key) ?? getEffectiveOptionalColor(draftTheme, field.key)
          const normalizedRestoredValue = normalizeHexColor(
            restoredValue,
            getEffectiveOptionalColor(draftTheme, field.key),
          )
          optionalColorManualValues.set(field.key, normalizedRestoredValue)
          writeOptionalColorValue(draftTheme, field.key, normalizedRestoredValue)
        }
        applyDraftPreview()
        setDraftPreviewStatus()
      })

      input?.addEventListener('input', () => {
        const nextValue = normalizeHexColor(input.value, getEffectiveOptionalColor(draftTheme, field.key))
        optionalColorManualValues.set(field.key, nextValue)
        writeOptionalColorValue(draftTheme, field.key, nextValue)
        applyDraftPreview()
        setDraftPreviewStatus()
      })
    })

    overlayToggleInput?.addEventListener('change', () => {
      draftTheme.disableImageOverlays = overlayToggleInput.checked
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    fontBodySelect.addEventListener('change', () => {
      draftTheme.fontBody = fontBodySelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    fontHeadingSelect.addEventListener('change', () => {
      draftTheme.fontHeading = fontHeadingSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    borderRadiusSelect.addEventListener('change', () => {
      draftTheme.borderRadius = borderRadiusSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    playerRadiusSelect.addEventListener('change', () => {
      draftTheme.playerBorderRadius = playerRadiusSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    socialRadiusSelect.addEventListener('change', () => {
      draftTheme.socialIconBorderRadius = socialRadiusSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    profileRadiusSelect.addEventListener('change', () => {
      draftTheme.profileImageBorderRadius = profileRadiusSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    tagBadgeRadiusSelect.addEventListener('change', () => {
      draftTheme.tagBadgeBorderRadius = tagBadgeRadiusSelect.value
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    aboutPagePositionSelect.addEventListener('change', () => {
      draftTheme.aboutPage.position = normalizeThemeAboutPosition(aboutPagePositionSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    aboutPageMaxWidthSelect.addEventListener('change', () => {
      draftTheme.aboutPage.maxWidth = normalizeThemeAboutMaxWidth(aboutPageMaxWidthSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    contactPagePositionSelect.addEventListener('change', () => {
      draftTheme.contactPage.position = normalizeThemeContactPosition(contactPagePositionSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    contactPageMaxWidthSelect.addEventListener('change', () => {
      draftTheme.contactPage.maxWidth = normalizeThemeContactMaxWidth(contactPageMaxWidthSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroMirrorImageInput?.addEventListener('change', () => {
      draftTheme.homeHero.mirrorImage = homeHeroMirrorImageInput.checked
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroLayoutModeSelect.addEventListener('change', () => {
      draftTheme.homeHero.layout.mode = normalizeThemeHomeHeroLayoutMode(homeHeroLayoutModeSelect.value)
      applyDraftPreview()
      syncControlValues()
      setDraftPreviewStatus()
    })

    homeHeroImagePositionSelect.addEventListener('change', () => {
      draftTheme.homeHero.layout.columnsImagePosition = normalizeThemeHomeHeroImagePosition(
        homeHeroImagePositionSelect.value,
      )
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroColumnSplitSelect.addEventListener('change', () => {
      draftTheme.homeHero.layout.columnSplit = normalizeThemeHomeHeroColumnSplit(homeHeroColumnSplitSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroStackedImageOrderSelect.addEventListener('change', () => {
      draftTheme.homeHero.layout.stackedImageOrder = normalizeThemeHomeHeroStackedImageOrder(
        homeHeroStackedImageOrderSelect.value,
      )
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroTitleScaleSelect.addEventListener('change', () => {
      draftTheme.homeHero.typography.titleScale = normalizeThemeHomeHeroTypographyScale(homeHeroTitleScaleSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroTaglineScaleSelect.addEventListener('change', () => {
      draftTheme.homeHero.typography.taglineScale = normalizeThemeHomeHeroTypographyScale(
        homeHeroTaglineScaleSelect.value,
      )
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroCitationScaleSelect.addEventListener('change', () => {
      draftTheme.homeHero.typography.citationScale = normalizeThemeHomeHeroTypographyScale(
        homeHeroCitationScaleSelect.value,
      )
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroDividerVisibleInput?.addEventListener('change', () => {
      draftTheme.homeHero.divider.visible = homeHeroDividerVisibleInput.checked
      applyDraftPreview()
      syncControlValues()
      setDraftPreviewStatus()
    })

    homeHeroDividerWidthInput?.addEventListener('input', () => {
      const parsed = Number.parseInt(homeHeroDividerWidthInput.value, 10)
      if (Number.isFinite(parsed)) {
        draftTheme.homeHero.divider.widthPx = Math.min(6, Math.max(1, parsed))
      }
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroDividerColorInput?.addEventListener('input', () => {
      const nextValue = normalizeHexColor(homeHeroDividerColorInput.value, getEffectiveHomeHeroDividerColor(draftTheme))
      homeHeroDividerColorManualValue = nextValue
      draftTheme.homeHero.divider.color = nextValue
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroDividerColorAutoInput?.addEventListener('change', () => {
      const currentValue = normalizeHexColorExact(draftTheme.homeHero.divider.color)
      if (homeHeroDividerColorAutoInput.checked) {
        if (currentValue) {
          homeHeroDividerColorManualValue = currentValue
        }
        draftTheme.homeHero.divider.color = ''
      } else {
        const restoredValue = normalizeHexColor(
          homeHeroDividerColorManualValue,
          getEffectiveHomeHeroDividerColor(draftTheme),
        )
        homeHeroDividerColorManualValue = restoredValue
        draftTheme.homeHero.divider.color = restoredValue
      }
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroDividerGlowSelect.addEventListener('change', () => {
      draftTheme.homeHero.divider.glow = normalizeThemeHomeHeroDividerGlow(homeHeroDividerGlowSelect.value)
      applyDraftPreview()
      syncControlValues()
      setDraftPreviewStatus()
    })

    homeHeroDividerGlowSideSelect.addEventListener('change', () => {
      draftTheme.homeHero.divider.glowSide = normalizeThemeHomeHeroDividerGlowSide(homeHeroDividerGlowSideSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroListenStyleSelect.addEventListener('change', () => {
      draftTheme.homeHero.actions.listenNow = normalizeThemeHomeHeroActionStyle(homeHeroListenStyleSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    homeHeroSearchStyleSelect.addEventListener('change', () => {
      draftTheme.homeHero.actions.searchMusic = normalizeThemeHomeHeroActionStyle(homeHeroSearchStyleSelect.value)
      applyDraftPreview()
      setDraftPreviewStatus()
    })

    revertButton?.addEventListener('click', () => {
      resetDraftToSelectedTheme('Draft reverted to the selected editing theme.')
    })

    applyButton?.addEventListener('click', () => {
      void applyCurrentDraft()
    })

    resetToCurrentButton?.addEventListener('click', () => {
      if (hasSelectedThemeChanges()) {
        const confirmed = window.confirm('You have unsaved changes. Discard them and switch back to the current site theme?')
        if (!confirmed) return
      }
      resetDraftToAppliedTheme('Editing theme reset to the current site theme.')
    })

    saveNewButton?.addEventListener('click', () => {
      void saveNewTheme()
    })

    saveButton?.addEventListener('click', () => {
      void saveSelectedTheme()
    })

    deleteButton?.addEventListener('click', () => {
      void deleteSelectedTheme()
    })

    closeButton?.addEventListener('click', () => {
      if (hasSelectedThemeChanges()) {
        const confirmed = window.confirm('You have unsaved changes. Close the Theme Studio and discard them?')
        if (!confirmed) return
      }
      app.toggleState({ state: false })
    })

    app.onToggled(({ state }: { state: boolean }) => {
      isAppOpen = state
      if (state) {
        ensureAttached()
        restorePersistedPanelWidth()
        workspaceElement.dataset.state = 'open'
        persistWorkspaceState()
        syncPreviewFrameSource()
        refreshFromPageData()
        syncUi()
        if (!hasDraftChangesFromAppliedReference()) {
          setDraftPreviewStatus()
        }
        void loadThemeLibrary()
        window.requestAnimationFrame(() => {
          if (themeSelect) focusElement(themeSelect)
        })
        return
      }

      workspaceElement.dataset.state = 'closed'
      clearWorkspaceState()
      if (hasDraftChangesFromAppliedReference()) {
        resetDraftToAppliedTheme()
      }
    })

    const onAfterSwap = (): void => {
      ensureAttached()
      refreshFromPageData()
      if (!isAppOpen) {
        lastSeededPreviewUrl = ''
        return
      }
      syncPreviewFrameSource(true)
    }

    const onPageLoad = (): void => {
      ensureAttached()
      refreshFromPageData()
      if (!isAppOpen) {
        lastSeededPreviewUrl = ''
        return
      }
      syncPreviewFrameSource(true)
    }

    document.addEventListener('astro:after-swap', onAfterSwap)
    document.addEventListener('astro:page-load', onPageLoad)

    ensureAttached()
    if (restoredWorkspaceState) {
      if (restoredWorkspaceState.preserveDraft) {
        syncUi()
        applyDraftPreview()
      } else {
        resetDraftToAppliedTheme()
        setDraftPreviewStatus()
      }
      window.requestAnimationFrame(() => {
        app.toggleState({ state: true })
      })
      return
    }

    resetDraftToAppliedTheme()
    setDraftPreviewStatus()
  },
})
