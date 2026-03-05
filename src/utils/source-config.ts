/**
 * Source Config Reader
 *
 * Reads YAML configuration files from the `source/` directory at build time.
 * Each reader parses YAML with Zod validation for type safety.
 * Results are memoized per build to avoid redundant file reads.
 *
 * This module is the single source of truth for all site-wide configuration.
 * Components import these helpers instead of hardcoded data files.
 */

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { z } from 'astro/zod'

// ─── Paths ──────────────────────────────────────────────────────────────────

const SOURCE_ROOT = path.resolve(process.cwd(), 'source')
const SITE_DIR = path.join(SOURCE_ROOT, 'site')
const PAGES_DIR = path.join(SOURCE_ROOT, 'pages')

// ─── Shared Zod helpers ──────────────────────────────────────────────────────

/** Coerce null (from Keystatic relationship fields) to empty string. */
const nullableString = z
  .string()
  .nullable()
  .default(null)
  .transform((v) => v ?? '')

// ─── Generic YAML reader with memoization ───────────────────────────────────

const cache = new Map<string, unknown>()

/**
 * In dev mode, skip caching so that Keystatic edits to YAML files are
 * reflected immediately on the next page request. During production
 * builds, caching is safe because the build is a single pass.
 */
const isDev = import.meta.env.DEV

/**
 * Reads a YAML file, parses it with a Zod schema, and memoizes the result.
 * If the file doesn't exist, returns the fallback value.
 *
 * Caching is disabled in dev mode so that Keystatic GUI edits to YAML
 * files are picked up by the Astro dev server without a restart.
 *
 * We use `z.ZodSchema` and cast the return because Zod's input/output type
 * distinction (from `.default()`) prevents clean generic inference with `z.ZodType<T>`.
 */
function readYaml<T>(filePath: string, schema: z.ZodSchema, fallback: T): T {
  if (!isDev) {
    const cached = cache.get(filePath)
    if (cached !== undefined) return cached as T
  }

  if (!fs.existsSync(filePath)) {
    if (!isDev) cache.set(filePath, fallback)
    return fallback
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = yaml.load(raw)
  const result = schema.parse(parsed) as T
  if (!isDev) cache.set(filePath, result)
  return result
}

/** Clear the memoization cache (useful for tests or watch mode). */
export function clearConfigCache(): void {
  cache.clear()
}

// ─── Site Config ────────────────────────────────────────────────────────────

const siteConfigSchema = z.object({
  composerName: z.string().default('Composer Name'),
  siteTitle: z.string().default('Composer Portfolio'),
  siteDescription: z.string().default('A portfolio of original compositions.'),
  siteUrl: z.string().default(''),
  email: z.string().default(''),
  googleAnalyticsId: z.string().default(''),
  apiEndpoint: z.string().default(''),
  perusalScoreOnlyMode: z.boolean().default(false),
})

export type SiteConfig = z.infer<typeof siteConfigSchema>

export function getSiteConfig(): SiteConfig {
  return readYaml(path.join(SITE_DIR, 'site.yaml'), siteConfigSchema, siteConfigSchema.parse({}))
}

/** Returns true if the site still has the default starter-kit placeholder name. */
export function isPlaceholderConfig(): boolean {
  const site = getSiteConfig()
  return site.composerName === 'FirstName LastName'
}

// ─── Navigation ─────────────────────────────────────────────────────────────

const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  enabled: z.boolean().default(true),
  order: z.number().default(0),
  /** For anchor links that target homepage sections. Inner pages use this instead of href. */
  anchorTarget: z.string().optional(),
})

export type NavItem = z.infer<typeof navItemSchema>

const navigationSchema = z.object({
  menuItems: z.array(navItemSchema).default([
    { label: 'Music', href: '/music/', enabled: true, order: 0 },
    { label: 'About', href: '/about/', enabled: true, order: 1 },
    { label: 'Contact', href: '/contact/', enabled: true, order: 2 },
  ]),
})

export type NavigationConfig = z.infer<typeof navigationSchema>

export function getNavigation(): NavigationConfig {
  return readYaml(path.join(SITE_DIR, 'navigation.yaml'), navigationSchema, navigationSchema.parse({}))
}

/** Returns only enabled menu items, sorted by order. */
export function getPrimaryNavLinks(): NavItem[] {
  const nav = getNavigation()
  return nav.menuItems.filter((item) => item.enabled).sort((a, b) => a.order - b.order)
}

// ─── Header ─────────────────────────────────────────────────────────────────

const headerElementValues = ['brand-logo', 'main-menu', 'site-search', 'mobile-menu'] as const
export type HeaderElement = (typeof headerElementValues)[number]

const headerBreakpoints = ['desktop', 'tablet', 'mobile'] as const
export type HeaderBreakpoint = (typeof headerBreakpoints)[number]

/** Accepts a single string (legacy) or an array of element names. */
function coerceSlotToArray(val: unknown): unknown {
  if (typeof val === 'string') return val === 'none' ? [] : [val]
  return val
}

const headerSlotSchema = z.preprocess(coerceSlotToArray, z.array(z.enum(headerElementValues)).default([]))

function makeHeaderSchema(defaults: { left: HeaderElement[]; center: HeaderElement[]; right: HeaderElement[] }) {
  return z.object({
    slots: z
      .object({
        left: headerSlotSchema.default(defaults.left),
        center: headerSlotSchema.default(defaults.center),
        right: headerSlotSchema.default(defaults.right),
      })
      .default(defaults),
  })
}

const headerBreakpointDefaults: Record<
  HeaderBreakpoint,
  { left: HeaderElement[]; center: HeaderElement[]; right: HeaderElement[] }
> = {
  desktop: { left: ['brand-logo'], center: [], right: ['main-menu', 'site-search'] },
  tablet: { left: ['brand-logo'], center: [], right: ['mobile-menu', 'site-search'] },
  mobile: { left: ['brand-logo'], center: [], right: ['mobile-menu'] },
}

export interface HeaderConfig {
  left: HeaderElement[]
  center: HeaderElement[]
  right: HeaderElement[]
}
export type ResponsiveHeaderConfigs = Record<HeaderBreakpoint, HeaderConfig>

export function getHeaderConfigForBreakpoint(bp: HeaderBreakpoint): HeaderConfig {
  const schema = makeHeaderSchema(headerBreakpointDefaults[bp])
  const raw = readYaml(path.join(SITE_DIR, `header-${bp}.yaml`), schema, schema.parse({}))
  return { left: raw.slots.left, center: raw.slots.center, right: raw.slots.right }
}

export function getResponsiveHeaderConfigs(): ResponsiveHeaderConfigs {
  return {
    desktop: getHeaderConfigForBreakpoint('desktop'),
    tablet: getHeaderConfigForBreakpoint('tablet'),
    mobile: getHeaderConfigForBreakpoint('mobile'),
  }
}

/** Returns which slot contains the given element, or null if not placed. */
export function findHeaderSlot(config: HeaderConfig, element: HeaderElement): 'left' | 'center' | 'right' | null {
  if (config.left.includes(element)) return 'left'
  if (config.center.includes(element)) return 'center'
  if (config.right.includes(element)) return 'right'
  return null
}

/** Returns true if the given element appears in any header slot. */
export function headerHasElement(config: HeaderConfig, element: HeaderElement): boolean {
  return findHeaderSlot(config, element) !== null
}

/** Returns true if the given element appears in any breakpoint's config. */
export function anyHeaderHasElement(configs: ResponsiveHeaderConfigs, element: HeaderElement): boolean {
  return headerBreakpoints.some((bp) => headerHasElement(configs[bp], element))
}

// ─── Copyright ──────────────────────────────────────────────────────────────

const copyrightConfigSchema = z.object({
  copyrightHolder: z.string().default(''),
})

export type CopyrightConfig = z.infer<typeof copyrightConfigSchema>

export function getCopyrightConfig(): CopyrightConfig {
  return readYaml(path.join(SITE_DIR, 'copyright.yaml'), copyrightConfigSchema, copyrightConfigSchema.parse({}))
}

// ─── Footer Block ───────────────────────────────────────────────────────────

const footerSlotValues = ['copyright', 'footer-menu', 'none'] as const

const footerBlockConfigSchema = z.object({
  leftSlot: z.enum(footerSlotValues).default('copyright'),
  centerSlot: z.enum(footerSlotValues).default('none'),
  rightSlot: z.enum(footerSlotValues).default('footer-menu'),
})

export type FooterBlockConfig = z.infer<typeof footerBlockConfigSchema>

export function getFooterBlockConfig(): FooterBlockConfig {
  return readYaml(path.join(SITE_DIR, 'footer.yaml'), footerBlockConfigSchema, footerBlockConfigSchema.parse({}))
}

// ─── Footer Menu ────────────────────────────────────────────────────────────

const footerMenuConfigSchema = z.object({
  links: z.array(z.object({ label: z.string(), href: z.string() })).default([
    { label: 'Accessibility', href: '/accessibility-statement/' },
    { label: 'Sitemap', href: '/sitemap/' },
  ]),
})

export type FooterMenuConfig = z.infer<typeof footerMenuConfigSchema>

export function getFooterMenuConfig(): FooterMenuConfig {
  return readYaml(path.join(SITE_DIR, 'footer-menu.yaml'), footerMenuConfigSchema, footerMenuConfigSchema.parse({}))
}

// ─── Global Layout ──────────────────────────────────────────────────────────

const globalLayoutSchema = z.object({
  sections: z
    .array(z.object({ key: z.string() }))
    .default([{ key: 'header' }, { key: 'breadcrumbs' }, { key: 'footer' }, { key: 'social-media' }]),
})

export type GlobalLayoutConfig = z.infer<typeof globalLayoutSchema>

export function getGlobalLayout(): GlobalLayoutConfig {
  return readYaml(path.join(SITE_DIR, 'global-layout.yaml'), globalLayoutSchema, globalLayoutSchema.parse({}))
}

// ─── Social Links ───────────────────────────────────────────────────────────

const socialPlatforms = [
  'instagram',
  'youtube',
  'facebook',
  'soundcloud',
  'twitter',
  'linkedin',
  'tiktok',
  'bandcamp',
] as const

export type SocialPlatform = (typeof socialPlatforms)[number]

const socialLinkSchema = z.object({
  platform: z.enum(socialPlatforms),
  url: z.string(),
  enabled: z.boolean().default(true),
})

export type SocialLink = z.infer<typeof socialLinkSchema>

const socialSchema = z.object({
  links: z.array(socialLinkSchema).default([]),
})

export function getSocialLinks(): SocialLink[] {
  const config = readYaml(path.join(SITE_DIR, 'social.yaml'), socialSchema, socialSchema.parse({}))
  return config.links.filter((link) => link.enabled)
}

// ─── Sharing Config (Page: Work Detail: Share Links) ────────────────────────

const shareOptions = ['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link', 'linkedin'] as const

export type ShareOption = (typeof shareOptions)[number]

const sharingSchema = z.object({
  enabledShares: z
    .array(z.enum(shareOptions))
    .default(['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link']),
  facebookAppId: z.string().default(''),
  hidden: z.boolean().default(false),
  sectionTitle: z.string().default('Share this work'),
  sectionDescription: z.string().default('Like this work? Share it with your network!'),
})

export type SharingConfig = z.infer<typeof sharingSchema>

export function getSharingConfig(): SharingConfig {
  return readYaml(path.join(SITE_DIR, 'sharing.yaml'), sharingSchema, sharingSchema.parse({}))
}

// ─── Contact Page Content ───────────────────────────────────────────────────

const contactPageSchema = z.object({
  title: z.string().default('Contact'),
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  introText: z
    .string()
    .default(
      'Whether you are interested in a score, a performance, or something else, I would be glad to hear from you.',
    ),
  contactFormEnabled: z.boolean().default(false),
  contactWebhookUrl: z.string().default(''),
  autoReplySubject: z.string().default('Thank you for your message — {{composerName}}'),
  autoReplyMessage: z.string().default(''),
  preferredHeroId: nullableString,
  nameMaxLength: z.number().int().min(1).default(120),
  messageMaxLength: z.number().int().min(1).default(4000),
  showCharacterCount: z.boolean().default(true),
  characterCountThreshold: z.number().int().min(1).default(50),
})

export type ContactPageConfig = z.infer<typeof contactPageSchema>

export function getContactPage(): ContactPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'contact.yaml'), contactPageSchema, contactPageSchema.parse({}))
  // Derive metaTitle from composerName if not set
  if (!config.metaTitle) {
    const site = getSiteConfig()
    return { ...config, metaTitle: `Contact ${site.composerName}` }
  }
  return config
}

// ─── About Page Content ─────────────────────────────────────────────────────

const aboutPageSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  profileImageAlt: z.string().default(''),
  body: z.string().default(''),
  preferredHeroId: nullableString,
})

export type AboutPageConfig = z.infer<typeof aboutPageSchema>

export function getAboutPage(): AboutPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'about', 'about.yaml'), aboutPageSchema, aboutPageSchema.parse({}))
  if (!config.metaTitle) {
    const site = getSiteConfig()
    return { ...config, metaTitle: `About ${site.composerName}` }
  }
  return config
}

// ─── Brand Logo Config ──────────────────────────────────────────────────────

const brandModes = ['text', 'plugin', 'custom'] as const
export type BrandMode = (typeof brandModes)[number]
const brandPluginIds = ['custom-animation'] as const
export type BrandPluginId = (typeof brandPluginIds)[number]

const brandConfigSchema = z.object({
  mode: z.enum(brandModes).default('text'),
  pluginId: z.enum(brandPluginIds).default('custom-animation'),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
})

export type BrandConfig = z.infer<typeof brandConfigSchema>

export function getBrandConfig(): BrandConfig {
  const config = readYaml(
    path.join(SOURCE_ROOT, 'branding', 'brand-logo.yaml'),
    brandConfigSchema,
    brandConfigSchema.parse({}),
  )
  // Derive first/last name from composerName if not set
  if (!config.firstName && !config.lastName) {
    const site = getSiteConfig()
    const parts = site.composerName.split(' ')
    return {
      ...config,
      firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
      lastName: parts.length > 1 ? parts[parts.length - 1] || '' : '',
    }
  }
  return config
}

// ─── Deploy Config ──────────────────────────────────────────────────────────

const deployConfigSchema = z.object({
  sftpHost: z.string().default(''),
  sftpUser: z.string().default(''),
  sftpRemotePath: z.string().default(''),
  sftpPrivateRemotePath: z.string().default(''),
  sftpPort: z.number().default(22),
})

export type DeployConfig = z.infer<typeof deployConfigSchema>

export function getDeployConfig(): DeployConfig {
  return readYaml(path.join(SITE_DIR, 'deploy.yaml'), deployConfigSchema, deployConfigSchema.parse({}))
}

/** Returns true if SFTP deployment is configured. */
export function isDeployConfigured(): boolean {
  const config = getDeployConfig()
  return Boolean(config.sftpHost && config.sftpUser)
}

// ─── Redirects ──────────────────────────────────────────────────────────────

const redirectRuleSchema = z.object({
  from: z.string(),
  to: z.string().default(''),
  type: z.enum(['301', '302', '410']).default('301'),
  matchType: z.enum(['exact', 'prefix']).default('exact'),
  enabled: z.boolean().default(true),
  note: z.string().default(''),
})

const redirectsSchema = z.object({
  rules: z.array(redirectRuleSchema).default([]),
})

export type RedirectRule = z.infer<typeof redirectRuleSchema>
export type RedirectsConfig = z.infer<typeof redirectsSchema>

export function getRedirects(): RedirectsConfig {
  return readYaml(path.join(SITE_DIR, 'redirects.yaml'), redirectsSchema, redirectsSchema.parse({}))
}

// ─── Hero Variants ──────────────────────────────────────────────────────────

const heroVariantSchema = z.object({
  label: z.string().default(''),
  alt: z.string().default(''),
  credit: z.string().default(''),
  position: z.string().default('50% 50%'),
  filter: z.string().default(''),
  sortOrder: z.number().default(0),
})

export interface HeroVariant {
  id: string
  label: string
  src: string
  alt: string
  credit: string
  position: string
  filter: string
}

export interface HeroConfig {
  preferredHeroId: string
  fallbackHeroId: string
  defaultFilter: string
}

export function getHeroConfig(): HeroConfig {
  const { preferredHeroId, fallbackHeroId, defaultFilter } = getHomeHero()
  return { preferredHeroId, fallbackHeroId, defaultFilter }
}

export function getHeroVariants(): HeroVariant[] {
  const heroesDir = path.join(SOURCE_ROOT, 'heroes')
  if (!fs.existsSync(heroesDir)) return []

  const heroConfig = getHeroConfig()
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp'])

  const entries = fs.readdirSync(heroesDir, { withFileTypes: true }).filter((d) => d.isDirectory())

  const sortable: { variant: HeroVariant; sortOrder: number }[] = []

  for (const entry of entries) {
    const slug = entry.name
    const heroYamlPath = path.join(heroesDir, slug, 'hero.yaml')

    // Read the hero YAML (required for collection entries)
    if (!fs.existsSync(heroYamlPath)) continue
    const raw = yaml.load(fs.readFileSync(heroYamlPath, 'utf-8'))
    const meta = heroVariantSchema.parse(raw)

    // Auto-detect image file by convention: image.{jpg,jpeg,webp,png} in the hero directory
    const heroDir = path.join(heroesDir, slug)
    const files = fs.readdirSync(heroDir)
    const imageFile =
      files.find((f) => {
        const base = path.basename(f, path.extname(f)).toLowerCase()
        return base === 'image' && imageExts.has(path.extname(f).toLowerCase())
      }) ?? ''

    if (!imageFile) continue

    sortable.push({
      variant: {
        id: slug,
        label: meta.label || slug,
        src: `/hero/${slug}/${imageFile}`,
        alt: meta.alt,
        credit: meta.credit,
        position: meta.position,
        filter: meta.filter || heroConfig.defaultFilter,
      },
      sortOrder: meta.sortOrder,
    })
  }

  return sortable
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.variant.label.localeCompare(b.variant.label)
    })
    .map((entry) => entry.variant)
}

// ─── Theme Config ───────────────────────────────────────────────────────────

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

// ─── Email Layout Config ────────────────────────────────────────────────────

const emailLayoutConfigSchema = z.object({
  showHeaderFavicon: z.boolean().default(true),
  showSignatureLogo: z.boolean().default(true),
  signatureLogoWidth: z.number().int().min(60).max(400).default(160),
})

export type EmailLayoutConfig = z.infer<typeof emailLayoutConfigSchema>

export function getEmailLayoutConfig(): EmailLayoutConfig {
  return readYaml(path.join(SITE_DIR, 'email-layout.yaml'), emailLayoutConfigSchema, emailLayoutConfigSchema.parse({}))
}

// ─── Perusal Access Config ──────────────────────────────────────────────────

const perusalAccessGatingModes = ['magic-link', 'none'] as const
export type PerusalAccessGatingMode = (typeof perusalAccessGatingModes)[number]

const perusalAccessConfigSchema = z.object({
  gatingEnabled: z.boolean().default(false),
  gatingMode: z.enum(perusalAccessGatingModes).default('magic-link'),
  tokenExpirationDays: z.number().int().min(1).default(90),
  webhookUrl: z.string().default(''),
  tokenSecret: z.string().default(''),
  emailSubject: z.string().default('Your perusal score, {{firstName}} — {{workTitle}}'),
  emailMessage: z.string().default(''),
  pdfWatermarkedEnabled: z.boolean().default(true),
  pdfOriginalEnabled: z.boolean().default(false),
  pdfWatermarkedGated: z.boolean().default(true),
  pdfOriginalGated: z.boolean().default(true),
  nameMaxLength: z.number().int().min(1).default(120),
})

export type PerusalAccessConfig = z.infer<typeof perusalAccessConfigSchema>

export function getPerusalAccessConfig(): PerusalAccessConfig {
  return readYaml(
    path.join(SITE_DIR, 'perusal-access.yaml'),
    perusalAccessConfigSchema,
    perusalAccessConfigSchema.parse({}),
  )
}

/** Returns true when gating is enabled and the mode is 'magic-link'. */
export function isPerusalGatingActive(): boolean {
  const config = getPerusalAccessConfig()
  return config.gatingEnabled && config.gatingMode === 'magic-link'
}

// ─── Perusal Viewer Config ──────────────────────────────────────────

const perusalViewerModes = ['spreads', 'single'] as const
export type PerusalViewerMode = (typeof perusalViewerModes)[number]

const watermarkFonts = ['sans-serif', 'serif', 'heading', 'body'] as const
export type WatermarkFont = (typeof watermarkFonts)[number]

const perusalViewerConfigSchema = z.object({
  flipAnimationEnabled: z.boolean().default(true),
  defaultViewMode: z.enum(perusalViewerModes).default('spreads'),
  watermarkEnabled: z.boolean().default(true),
  watermarkText: z.string().default('PERUSAL COPY'),
  watermarkColor: z.string().default('#B40000'),
  watermarkOpacity: z.number().int().min(1).max(100).default(12),
  watermarkAngle: z.number().int().min(-90).max(90).default(-35),
  watermarkFont: z.enum(watermarkFonts).default('sans-serif'),
  watermarkFontScale: z.number().int().min(50).max(200).default(100),
  watermarkSpacing: z.number().int().min(50).max(300).default(100),
})

export type PerusalViewerConfig = z.infer<typeof perusalViewerConfigSchema>

export function getPerusalViewerConfig(): PerusalViewerConfig {
  return readYaml(
    path.join(SITE_DIR, 'score-viewer.yaml'),
    perusalViewerConfigSchema,
    perusalViewerConfigSchema.parse({}),
  )
}

// ─── Breadcrumbs Config ─────────────────────────────────────────────────────

const breadcrumbsConfigSchema = z.object({
  homeCrumbLabel: z.string().default('Home'),
})

export type BreadcrumbsConfig = z.infer<typeof breadcrumbsConfigSchema>

export function getBreadcrumbsConfig(): BreadcrumbsConfig {
  return readYaml(path.join(SITE_DIR, 'breadcrumbs.yaml'), breadcrumbsConfigSchema, breadcrumbsConfigSchema.parse({}))
}

// ─── Music Page Config ─────────────────────────────────────────────────────

const sortOptionValues = ['title', 'newest', 'oldest'] as const
const defaultSortWithFilterValues = ['relevance', 'newest', 'oldest', 'title'] as const

const musicPageSchema = z.object({
  title: z.string().default('Music'),
  subtitle: z.string().default('A showcase of compositions by {composerName}'),
  filterNote: z.string().default(''),
  searchPlaceholder: z.string().default('Filter works...'),
  sortEnabled: z.boolean().default(true),
  sortOptions: z.array(z.enum(sortOptionValues)).default(['title', 'newest', 'oldest']),
  defaultSortNoFilter: z.enum(['newest', 'oldest', 'title']).default('newest'),
  defaultSortWithFilter: z.enum(defaultSortWithFilterValues).default('relevance'),
  scoreCheckboxEnabled: z.boolean().default(true),
  scoreCheckboxLabel: z.string().default(''),
  recordingCheckboxEnabled: z.boolean().default(true),
  recordingCheckboxLabel: z.string().default(''),
  preferredHeroId: nullableString,
})

export type MusicPageConfig = z.infer<typeof musicPageSchema>

export function getMusicPage(): MusicPageConfig {
  return readYaml(path.join(PAGES_DIR, 'music.yaml'), musicPageSchema, musicPageSchema.parse({}))
}

// ─── Music Browse Page Config ───────────────────────────────────────────────

const musicBrowsePageSchema = z.object({
  preferredHeroId: nullableString,
})

export type MusicBrowsePageConfig = z.infer<typeof musicBrowsePageSchema>

export function getMusicBrowsePage(): MusicBrowsePageConfig {
  return readYaml(path.join(PAGES_DIR, 'music-browse.yaml'), musicBrowsePageSchema, musicBrowsePageSchema.parse({}))
}

// ─── Music Browse Tag Page Config ───────────────────────────────────────────

const musicBrowseTagPageSchema = z.object({
  preferredHeroId: nullableString,
})

export type MusicBrowseTagPageConfig = z.infer<typeof musicBrowseTagPageSchema>

export function getMusicBrowseTagPage(): MusicBrowseTagPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'music-browse-tag.yaml'),
    musicBrowseTagPageSchema,
    musicBrowseTagPageSchema.parse({}),
  )
}

// ─── Work Detail Page Config ────────────────────────────────────────────────

const workDetailPageSchema = z.object({
  preferredHeroId: nullableString,
})

export type WorkDetailPageConfig = z.infer<typeof workDetailPageSchema>

export function getWorkDetailPage(): WorkDetailPageConfig {
  return readYaml(path.join(PAGES_DIR, 'work-detail.yaml'), workDetailPageSchema, workDetailPageSchema.parse({}))
}

// ─── Not Found Page Config ──────────────────────────────────────────────────

const notFoundPageSchema = z.object({
  title: z.string().default('404'),
  message: z.string().default("The page you requested isn't in the score."),
  submessage: z.string().default("Don't worry, the music doesn't have to end."),
  buttonLabel: z.string().default('Da capo'),
  preferredHeroId: nullableString,
})

export type NotFoundPageConfig = z.infer<typeof notFoundPageSchema>

export function getNotFoundPage(): NotFoundPageConfig {
  return readYaml(path.join(PAGES_DIR, 'not-found.yaml'), notFoundPageSchema, notFoundPageSchema.parse({}))
}

// ─── Accessibility Statement Page Config ────────────────────────────────────

const accessibilityPageSchema = z.object({
  title: z.string().default('Accessibility statement'),
  subtitle: z
    .string()
    .default('This document outlines the accessibility features and support provided by our website.'),
  preferredHeroId: nullableString,
})

export type AccessibilityPageConfig = z.infer<typeof accessibilityPageSchema>

export function getAccessibilityPage(): AccessibilityPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'accessibility-statement.yaml'),
    accessibilityPageSchema,
    accessibilityPageSchema.parse({}),
  )
}

// ─── Sitemap Page Config ────────────────────────────────────────────────────

const sitemapPageSchema = z.object({
  title: z.string().default('Sitemap'),
  subtitle: z
    .string()
    .default(
      'A comprehensive overview of all pages and content available on this website, organized for easy navigation.',
    ),
  preferredHeroId: nullableString,
})

export type SitemapPageConfig = z.infer<typeof sitemapPageSchema>

export function getSitemapPage(): SitemapPageConfig {
  return readYaml(path.join(PAGES_DIR, 'sitemap.yaml'), sitemapPageSchema, sitemapPageSchema.parse({}))
}

// ─── Page: Perusal Access Granted ───────────────────────────────────────────

const perusalAccessGrantedPageSchema = z.object({
  heading: z.string().default('Access Granted!'),
  message: z.string().default('You can now view the perusal score for {{workTitle}}.'),
  buttonLabel: z.string().default('View Perusal Score'),
  preferredHeroId: nullableString,
})

export type PerusalAccessGrantedPageConfig = z.infer<typeof perusalAccessGrantedPageSchema>

export function getPerusalAccessGrantedPage(): PerusalAccessGrantedPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'perusal-access-granted.yaml'),
    perusalAccessGrantedPageSchema,
    perusalAccessGrantedPageSchema.parse({}),
  )
}

// ─── Page: Perusal Thank You ────────────────────────────────────────────────

const perusalThankYouPageSchema = z.object({
  heading: z.string().default('Thank You!'),
  message: z
    .string()
    .default('Check your inbox! A link to view the perusal score for {{workTitle}} has been sent to your email.'),
  buttonLabel: z.string().default('Back to {{workTitle}}'),
  preferredHeroId: nullableString,
})

export type PerusalThankYouPageConfig = z.infer<typeof perusalThankYouPageSchema>

export function getPerusalThankYouPage(): PerusalThankYouPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'perusal-thank-you.yaml'),
    perusalThankYouPageSchema,
    perusalThankYouPageSchema.parse({}),
  )
}

// ─── Page: Request Score Access ─────────────────────────────────────────────

const requestScoreAccessPageSchema = z.object({
  gateTitle: z.string().default('Request Perusal Score Access'),
  gateMessage: z
    .string()
    .default(
      'To view this perusal score, please enter your name and email. You will receive a link to access the score.',
    ),
  successMessage: z.string().default('Check your inbox! A link to view this score has been sent to your email.'),
  hideBackground: z.boolean().default(false),
})

export type RequestScoreAccessPageConfig = z.infer<typeof requestScoreAccessPageSchema>

export function getRequestScoreAccessPage(): RequestScoreAccessPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'request-score-access.yaml'),
    requestScoreAccessPageSchema,
    requestScoreAccessPageSchema.parse({}),
  )
}

// ─── Page: Contact Thank You ────────────────────────────────────────────────

const contactThankYouPageSchema = z.object({
  heading: z.string().default('Thank You!'),
  message: z.string().default('Message sent! We will get back to you soon.'),
  buttonLabel: z.string().default('Back Home'),
  preferredHeroId: nullableString,
})

export type ContactThankYouPageConfig = z.infer<typeof contactThankYouPageSchema>

export function getContactThankYouPage(): ContactThankYouPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'contact-thank-you.yaml'),
    contactThankYouPageSchema,
    contactThankYouPageSchema.parse({}),
  )
}

// ─── Home: Consolidated YAML reader ─────────────────────────────────────────
//
// The homepage is stored as a single consolidated YAML file with a `sections`
// array using Keystatic's conditional (discriminant/value) format. Each public
// reader function below extracts its slice from the consolidated data, keeping
// the same public API and types so that index.astro / setup.astro need no changes.

const HOME_YAML_PATH = path.join(PAGES_DIR, 'home.yaml')

/** Shape of a single section entry in the consolidated home YAML. */
const homeSectionBlockSchema = z.object({
  discriminant: z.string(),
  value: z.record(z.unknown()).default({}),
})

/** Top-level shape of the consolidated home YAML. */
const consolidatedHomeSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  sections: z
    .array(
      z.object({
        block: homeSectionBlockSchema,
      }),
    )
    .default([]),
})

type ConsolidatedHome = z.infer<typeof consolidatedHomeSchema>

/** Read and parse the consolidated home YAML (memoized via readYaml). */
function getHomePageRaw(): ConsolidatedHome {
  return readYaml(HOME_YAML_PATH, consolidatedHomeSchema, consolidatedHomeSchema.parse({}))
}

/**
 * Find the first section matching `discriminant` and parse its `.value`
 * with the given Zod schema. Returns the schema's default if no match.
 */
function findHomeSection<T>(discriminant: string, schema: z.ZodSchema, fallback: T): T {
  const home = getHomePageRaw()
  const match = home.sections.find((s) => s.block.discriminant === discriminant)
  if (!match) return fallback
  return schema.parse(match.block.value) as T
}

// ─── Home: Hero Config ──────────────────────────────────────────────────────

const homeHeroActionsSchema = z
  .object({
    listenNow: z
      .object({
        visible: z.boolean().default(true),
        label: z.string().default('Listen Now'),
      })
      .default({
        visible: true,
        label: 'Listen Now',
      }),
    searchMusic: z
      .object({
        visible: z.boolean().default(true),
        label: z.string().default('Search Music'),
      })
      .default({
        visible: true,
        label: 'Search Music',
      }),
  })
  .default({
    listenNow: {
      visible: true,
      label: 'Listen Now',
    },
    searchMusic: {
      visible: true,
      label: 'Search Music',
    },
  })

const homeHeroSchema = z.object({
  heroTitle: z.string().default(''),
  heroSubtitle: z.string().default('Composer'),
  heroTagline: z.string().default('Original concert music for acoustic instruments and ensembles.'),
  heroTaglineAsBlockquote: z.boolean().default(false),
  heroTaglineCitation: z.string().default(''),
  actions: homeHeroActionsSchema,
  preferredHeroId: nullableString,
  fallbackHeroId: nullableString,
  defaultFilter: z.string().default('saturate(0.72) contrast(1.06) brightness(0.72)'),
})

export type HomeHeroConfig = z.infer<typeof homeHeroSchema>

export function getHomeHero(): HomeHeroConfig {
  const config = findHomeSection('hero', homeHeroSchema, homeHeroSchema.parse({}))
  if (!config.heroTitle) {
    const site = getSiteConfig()
    return { ...config, heroTitle: site.composerName }
  }
  return config
}

// ─── Home: SEO Config ───────────────────────────────────────────────────────

const homeSeoSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
})

export type HomeSeoConfig = z.infer<typeof homeSeoSchema>

export function getHomeSeo(): HomeSeoConfig {
  const home = getHomePageRaw()
  return homeSeoSchema.parse({
    metaTitle: home.metaTitle,
    metaDescription: home.metaDescription,
    searchResultText: home.searchResultText,
  })
}

// ─── Home: Contact Config ───────────────────────────────────────────────────

const homeContactSchema = z.object({
  contactIntro: z
    .string()
    .default(
      'Whether you are interested in a score, a performance, or something else, I would be glad to hear from you.',
    ),
  sectionTitle: z.string().default('Contact'),
})

export type HomeContactConfig = z.infer<typeof homeContactSchema>

export function getHomeContact(): HomeContactConfig {
  return findHomeSection('contact', homeContactSchema, homeContactSchema.parse({}))
}

// ─── Home: Featured Work Config ─────────────────────────────────────────────

const homeFeaturedWorkSchema = z.object({
  sectionTitle: z.string().default('Featured Recording'),
  activeSectionTitle: z.string().default('Currently Playing'),
  buttonText: z.string().default('More Details'),
})

export type HomeFeaturedWorkConfig = z.infer<typeof homeFeaturedWorkSchema>

export function getHomeFeaturedWork(): HomeFeaturedWorkConfig {
  return findHomeSection('featured-work', homeFeaturedWorkSchema, homeFeaturedWorkSchema.parse({}))
}

// ─── Home: Select Works Config ──────────────────────────────────────────────

const homeSelectWorksSortOrderSchema = z.enum(['selected-order', 'random', 'newest', 'oldest', 'title'])

export type HomeSelectWorksSortOrder = z.infer<typeof homeSelectWorksSortOrderSchema>

const homeSelectWorksSchema = z.object({
  sectionTitle: z.string().default('Select Works'),
  ignoreSelected: z.boolean().default(false),
  showAllIfNoSelected: z.boolean().default(true),
  sortOrder: homeSelectWorksSortOrderSchema.default('random'),
})

export type HomeSelectWorksConfig = z.infer<typeof homeSelectWorksSchema>

export function getHomeSelectWorks(): HomeSelectWorksConfig {
  return findHomeSection('select-works', homeSelectWorksSchema, homeSelectWorksSchema.parse({}))
}

// ─── Home: Layout Config ────────────────────────────────────────────────────

const homeLayoutSchema = z.object({
  sections: z
    .array(
      z.object({
        key: z.string(),
      }),
    )
    .default([{ key: 'hero' }, { key: 'featured-work' }, { key: 'select-works' }, { key: 'contact' }]),
})

export type HomeLayoutConfig = z.infer<typeof homeLayoutSchema>

export function getHomeLayout(): HomeLayoutConfig {
  const home = getHomePageRaw()
  if (home.sections.length === 0) return homeLayoutSchema.parse({})
  return {
    sections: home.sections.map((s) => ({ key: s.block.discriminant })),
  }
}

// ─── Score: PDF Config ──────────────────────────────────────────────────────

const watermarkOverridesSchema = z.object({
  watermarkText: z.string().default(''),
  watermarkColor: z.string().default(''),
  watermarkOpacity: z.number().default(12),
  watermarkAngle: z.number().default(-35),
  watermarkFont: z.string().default('sans-serif'),
  watermarkFontScale: z.number().default(100),
  watermarkSpacing: z.number().default(100),
})

const scorePdfConfigSchema = z.object({
  downloadFilenameFormat: z.string().default('{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}'),
  downloadWatermarkedSuffix: z.string().default('PERUSAL SCORE'),
  downloadOriginalSuffix: z.string().default(''),
  watermarkOverrides: z
    .object({
      discriminant: z.boolean().default(false),
      value: watermarkOverridesSchema.nullable().default(null),
    })
    .default({ discriminant: false, value: null }),
})

export type ScorePdfConfig = z.infer<typeof scorePdfConfigSchema>

export function getScorePdfConfig(): ScorePdfConfig {
  return readYaml(path.join(SITE_DIR, 'score-pdf.yaml'), scorePdfConfigSchema, scorePdfConfigSchema.parse({}))
}

// ─── Aliases (new names, old functions preserved for compatibility) ──────────

export const getScoreAccessConfig = getPerusalAccessConfig
export type ScoreAccessConfig = PerusalAccessConfig

export const getScoreViewerConfig = getPerusalViewerConfig
export type ScoreViewerConfig = PerusalViewerConfig

export const isScoreGatingActive = isPerusalGatingActive
