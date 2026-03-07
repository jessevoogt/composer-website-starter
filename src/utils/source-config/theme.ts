/**
 * Source Config — Theme
 *
 * Theme configuration, library, selection, and resolution logic.
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Theme Sub-Schemas ──────────────────────────────────────────────────────

const themeHomeHeroTypographyScaleSchema = z.enum(['small', 'default', 'large', 'dramatic'])
const themeHomeHeroActionStyleSchema = z.enum(['theme-default', 'outline', 'solid', 'inline'])
const themeHomeHeroDividerGlowSchema = z.enum(['none', 'subtle', 'medium', 'strong'])
const themeHomeHeroDividerGlowSideSchema = z.enum(['balanced', 'content', 'image'])
const themeHomeHeroLayoutModeSchema = z.enum(['columns', 'stacked', 'text-only', 'image-only', 'centered-image'])
const themeHomeHeroImagePositionSchema = z.enum(['left', 'right'])
const themeHomeHeroColumnSplitSchema = z.enum(['text-wide', 'balanced', 'image-wide'])
const themeHomeHeroStackedImageOrderSchema = z.enum(['first', 'second'])
const themeAboutPageProfileImagePositionSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])
const themeAboutPagePositionSchema = z.enum(['left', 'center', 'right'])
const themeAboutPageMaxWidthSchema = z.enum(['compact', 'standard', 'full'])
const themeContactPagePositionSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
])
const themeContactPageMaxWidthSchema = z.enum(['compact', 'default', 'wide'])

const themeHomeHeroTypographySchema = z
  .object({
    titleScale: themeHomeHeroTypographyScaleSchema.default('default'),
    taglineScale: themeHomeHeroTypographyScaleSchema.default('default'),
    citationScale: themeHomeHeroTypographyScaleSchema.default('default'),
  })
  .default({
    titleScale: 'default',
    taglineScale: 'default',
    citationScale: 'default',
  })

const themeHomeHeroDividerSchema = z
  .object({
    visible: z.boolean().default(true),
    widthPx: z.number().int().min(1).max(6).default(1),
    color: z.string().default(''),
    glow: themeHomeHeroDividerGlowSchema.default('none'),
    glowSide: themeHomeHeroDividerGlowSideSchema.default('balanced'),
  })
  .default({
    visible: true,
    widthPx: 1,
    color: '',
    glow: 'none',
    glowSide: 'balanced',
  })

const themeHomeHeroActionsSchema = z
  .object({
    listenNow: themeHomeHeroActionStyleSchema.default('theme-default'),
    searchMusic: themeHomeHeroActionStyleSchema.default('theme-default'),
  })
  .default({
    listenNow: 'theme-default',
    searchMusic: 'theme-default',
  })

const themeHomeHeroLayoutSchema = z
  .object({
    mode: themeHomeHeroLayoutModeSchema.default('columns'),
    columnsImagePosition: themeHomeHeroImagePositionSchema.default('left'),
    columnSplit: themeHomeHeroColumnSplitSchema.default('text-wide'),
    stackedImageOrder: themeHomeHeroStackedImageOrderSchema.default('first'),
  })
  .default({
    mode: 'columns',
    columnsImagePosition: 'left',
    columnSplit: 'text-wide',
    stackedImageOrder: 'first',
  })

const themeHomeHeroStyleSchema = z
  .object({
    mirrorImage: z.boolean().default(false),
    layout: themeHomeHeroLayoutSchema.default(themeHomeHeroLayoutSchema.parse({})),
    typography: themeHomeHeroTypographySchema.default(themeHomeHeroTypographySchema.parse({})),
    divider: themeHomeHeroDividerSchema.default(themeHomeHeroDividerSchema.parse({})),
    actions: themeHomeHeroActionsSchema.default(themeHomeHeroActionsSchema.parse({})),
  })
  .default({
    mirrorImage: false,
    layout: themeHomeHeroLayoutSchema.parse({}),
    typography: themeHomeHeroTypographySchema.parse({}),
    divider: themeHomeHeroDividerSchema.parse({}),
    actions: themeHomeHeroActionsSchema.parse({}),
  })

const themeAboutPageStyleSchema = z
  .object({
    position: themeAboutPagePositionSchema.default('center'),
    maxWidth: themeAboutPageMaxWidthSchema.default('full'),
    profileImagePosition: themeAboutPageProfileImagePositionSchema.default('center'),
  })
  .default({
    position: 'center',
    maxWidth: 'full',
    profileImagePosition: 'center',
  })

const themeContactPageStyleSchema = z
  .object({
    position: themeContactPagePositionSchema.default('center'),
    maxWidth: themeContactPageMaxWidthSchema.default('default'),
  })
  .default({
    position: 'center',
    maxWidth: 'default',
  })

// ─── Main Theme Config Schema ───────────────────────────────────────────────

const themeConfigSchema = z.object({
  currentThemeId: z.string().default(''),
  colorBackground: z.string().default(''),
  colorBackgroundSoft: z.string().default(''),
  colorText: z.string().default(''),
  colorTextMuted: z.string().default(''),
  colorAccent: z.string().default(''),
  colorAccentStrong: z.string().default(''),
  colorButton: z.string().default(''),
  colorButtonText: z.string().default(''),
  ctaBackground: z.string().default(''),
  ctaText: z.string().default(''),
  focusRingColor: z.string().default(''),
  navActiveUnderline: z.string().default(''),
  navActiveText: z.string().default(''),
  navHoverUnderline: z.string().default(''),
  navHoverText: z.string().default(''),
  scrimColor: z.string().default(''),
  disableImageOverlays: z.boolean().default(false),
  fontBody: z.string().default('Atkinson Hyperlegible'),
  fontHeading: z.string().default('Gothic A1'),
  borderRadius: z.string().default('none'),
  playerBorderRadius: z.string().default(''),
  socialIconBorderRadius: z.string().default(''),
  profileImageBorderRadius: z.string().default(''),
  tagBadgeBorderRadius: z.string().default(''),
  customCss: z.string().default(''),
  aboutPage: themeAboutPageStyleSchema.default(themeAboutPageStyleSchema.parse({})),
  contactPage: themeContactPageStyleSchema.default(themeContactPageStyleSchema.parse({})),
  homeHero: themeHomeHeroStyleSchema.default(themeHomeHeroStyleSchema.parse({})),
})

export type ThemeConfig = z.infer<typeof themeConfigSchema>

// ─── Theme Library ──────────────────────────────────────────────────────────

const themeColorGroupSchema = z.object({
  colorBackground: z.string().default(''),
  colorBackgroundSoft: z.string().default(''),
  colorText: z.string().default(''),
  colorTextMuted: z.string().default(''),
  colorAccent: z.string().default(''),
  colorAccentStrong: z.string().default(''),
  colorButton: z.string().default(''),
  colorButtonText: z.string().default(''),
})

const themeLibraryThemeSchema = z.object({
  id: z.string().default(''),
  label: z.string().default(''),
  description: z.string().default(''),
  colors: themeColorGroupSchema.default(themeColorGroupSchema.parse({})),
  fontBody: z.string().default('Atkinson Hyperlegible'),
  fontHeading: z.string().default('Gothic A1'),
  borderRadius: z.string().default('none'),
  focusRingColor: z.string().default(''),
  navActiveUnderline: z.string().default(''),
  navActiveText: z.string().default(''),
  navHoverUnderline: z.string().default(''),
  navHoverText: z.string().default(''),
  scrimColor: z.string().default(''),
  disableImageOverlays: z.boolean().default(false),
  ctaBackground: z.string().default(''),
  ctaText: z.string().default(''),
  playerBorderRadius: z.string().default(''),
  socialIconBorderRadius: z.string().default(''),
  profileImageBorderRadius: z.string().default(''),
  tagBadgeBorderRadius: z.string().default(''),
  customCss: z.string().default(''),
  aboutPage: themeAboutPageStyleSchema.default(themeAboutPageStyleSchema.parse({})),
  contactPage: themeContactPageStyleSchema.default(themeContactPageStyleSchema.parse({})),
  homeHero: themeHomeHeroStyleSchema.default(themeHomeHeroStyleSchema.parse({})),
})

const themeLibrarySchema = z.object({
  themes: z.array(themeLibraryThemeSchema).default([]),
})

const themeSelectionSchema = z.object({
  currentThemeId: z.string().default(''),
})

type ThemeLibraryTheme = z.infer<typeof themeLibraryThemeSchema>

// ─── Theme Resolution ───────────────────────────────────────────────────────

function applyThemeSelectionToSnapshot(snapshot: ThemeConfig, currentThemeId: string): ThemeConfig {
  return {
    ...snapshot,
    currentThemeId,
  }
}

function resolveThemeConfigFromLibraryTheme(theme: ThemeLibraryTheme, currentThemeId: string): ThemeConfig {
  return {
    currentThemeId,
    colorBackground: theme.colors.colorBackground,
    colorBackgroundSoft: theme.colors.colorBackgroundSoft,
    colorText: theme.colors.colorText,
    colorTextMuted: theme.colors.colorTextMuted,
    colorAccent: theme.colors.colorAccent,
    colorAccentStrong: theme.colors.colorAccentStrong,
    colorButton: theme.colors.colorButton,
    colorButtonText: theme.colors.colorButtonText,
    ctaBackground: theme.ctaBackground,
    ctaText: theme.ctaText,
    focusRingColor: theme.focusRingColor,
    navActiveUnderline: theme.navActiveUnderline,
    navActiveText: theme.navActiveText,
    navHoverUnderline: theme.navHoverUnderline,
    navHoverText: theme.navHoverText,
    scrimColor: theme.scrimColor,
    disableImageOverlays: theme.disableImageOverlays,
    fontBody: theme.fontBody,
    fontHeading: theme.fontHeading,
    borderRadius: theme.borderRadius,
    playerBorderRadius: theme.playerBorderRadius,
    socialIconBorderRadius: theme.socialIconBorderRadius,
    profileImageBorderRadius: theme.profileImageBorderRadius,
    tagBadgeBorderRadius: theme.tagBadgeBorderRadius,
    customCss: theme.customCss,
    aboutPage: theme.aboutPage,
    contactPage: theme.contactPage,
    homeHero: theme.homeHero,
  }
}

export function getThemeConfig(): ThemeConfig {
  const appliedTheme = readYaml(path.join(SITE_DIR, 'theme.yaml'), themeConfigSchema, themeConfigSchema.parse({}))
  const themeSelection = readYaml(
    path.join(SITE_DIR, 'theme-selection.yaml'),
    themeSelectionSchema,
    themeSelectionSchema.parse({}),
  )
  const selectedThemeId = themeSelection.currentThemeId.trim()
  const appliedThemeId = appliedTheme.currentThemeId.trim()

  if (!selectedThemeId) {
    return applyThemeSelectionToSnapshot(appliedTheme, '')
  }

  if (selectedThemeId === appliedThemeId) {
    return applyThemeSelectionToSnapshot(appliedTheme, selectedThemeId)
  }

  const themeLibrary = readYaml(
    path.join(SITE_DIR, 'theme-library.yaml'),
    themeLibrarySchema,
    themeLibrarySchema.parse({}),
  )
  const matchedTheme = themeLibrary.themes.find((theme) => theme.id.trim() === selectedThemeId)

  if (!matchedTheme) {
    return appliedTheme
  }

  return resolveThemeConfigFromLibraryTheme(matchedTheme, selectedThemeId)
}
