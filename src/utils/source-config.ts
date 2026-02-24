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
  copyrightHolder: z.string().default(''),
  googleAnalyticsId: z.string().default(''),
  perusalScoreOnlyMode: z.boolean().default(false),
})

export type SiteConfig = z.infer<typeof siteConfigSchema>

export function getSiteConfig(): SiteConfig {
  const config = readYaml(path.join(SITE_DIR, 'site.yaml'), siteConfigSchema, siteConfigSchema.parse({}))
  // Derive copyrightHolder from composerName if not explicitly set
  if (!config.copyrightHolder) {
    return { ...config, copyrightHolder: config.composerName }
  }
  return config
}

// ─── Audio Player Controls ──────────────────────────────────────────────────

const audioPlayerHideControlOverrideSchema = z.enum(['inherit', 'hide', 'show']).default('inherit')

const audioPlayerForceHideControlsSchema = z.object({
  previousTrack: z.boolean().default(false),
  playPause: z.boolean().default(false),
  nextTrack: z.boolean().default(false),
  seek: z.boolean().default(false),
  mute: z.boolean().default(false),
  volume: z.boolean().default(false),
  currentTime: z.boolean().default(false),
  duration: z.boolean().default(false),
  trackDetails: z.boolean().default(false),
  trackText: z.boolean().default(false),
})

const audioPlayerControlsSchema = z.object({
  hideFeaturedPlayerControls: z.boolean().default(false),
  enableTrackTextScroll: z.boolean().default(true),
  forceHideControls: audioPlayerForceHideControlsSchema.default({}),
})

const perusalScoreAudioPlayerControlsOverrideSchema = z.object({
  hideFeaturedPlayerControls: audioPlayerHideControlOverrideSchema.default('inherit'),
  hideFullscreenControl: z.boolean().default(false),
  forceHideControls: z
    .object({
      previousTrack: audioPlayerHideControlOverrideSchema.default('inherit'),
      playPause: audioPlayerHideControlOverrideSchema.default('inherit'),
      nextTrack: audioPlayerHideControlOverrideSchema.default('inherit'),
      seek: audioPlayerHideControlOverrideSchema.default('inherit'),
      mute: audioPlayerHideControlOverrideSchema.default('inherit'),
      volume: audioPlayerHideControlOverrideSchema.default('inherit'),
      trackDetails: audioPlayerHideControlOverrideSchema.default('inherit'),
    })
    .default({}),
})

export type AudioPlayerHideControlOverride = z.infer<typeof audioPlayerHideControlOverrideSchema>
export type AudioPlayerForceHideControls = z.infer<typeof audioPlayerForceHideControlsSchema>
export type AudioPlayerControlsConfig = z.infer<typeof audioPlayerControlsSchema>
export type PerusalScoreAudioPlayerControlsOverride = z.infer<typeof perusalScoreAudioPlayerControlsOverrideSchema>
export type PerusalScoreAudioPlayerForceHideControls = Pick<
  AudioPlayerForceHideControls,
  'previousTrack' | 'playPause' | 'nextTrack' | 'seek' | 'mute' | 'volume' | 'trackDetails'
>

export type PerusalScoreAudioPlayerControlsConfig = {
  hideFeaturedPlayerControls: boolean
  hideFullscreenControl: boolean
  forceHideControls: PerusalScoreAudioPlayerForceHideControls
}

function resolveHideControlOverride(override: AudioPlayerHideControlOverride, inherited: boolean): boolean {
  if (override === 'hide') return true
  if (override === 'show') return false
  return inherited
}

export function getAudioPlayerControls(): AudioPlayerControlsConfig {
  return readYaml(path.join(SITE_DIR, 'audio-player.yaml'), audioPlayerControlsSchema, audioPlayerControlsSchema.parse({}))
}

export function getPerusalScoreAudioPlayerControls(): PerusalScoreAudioPlayerControlsConfig {
  const inherited = getAudioPlayerControls()
  const overrides = readYaml(
    path.join(PAGES_DIR, 'perusal-scores', 'audio-player.yaml'),
    perusalScoreAudioPlayerControlsOverrideSchema,
    perusalScoreAudioPlayerControlsOverrideSchema.parse({}),
  )

  return {
    hideFeaturedPlayerControls: resolveHideControlOverride(
      overrides.hideFeaturedPlayerControls,
      inherited.hideFeaturedPlayerControls,
    ),
    hideFullscreenControl: overrides.hideFullscreenControl,
    forceHideControls: {
      previousTrack: resolveHideControlOverride(
        overrides.forceHideControls.previousTrack,
        inherited.forceHideControls.previousTrack,
      ),
      playPause: resolveHideControlOverride(overrides.forceHideControls.playPause, inherited.forceHideControls.playPause),
      nextTrack: resolveHideControlOverride(overrides.forceHideControls.nextTrack, inherited.forceHideControls.nextTrack),
      seek: resolveHideControlOverride(overrides.forceHideControls.seek, inherited.forceHideControls.seek),
      mute: resolveHideControlOverride(overrides.forceHideControls.mute, inherited.forceHideControls.mute),
      volume: resolveHideControlOverride(overrides.forceHideControls.volume, inherited.forceHideControls.volume),
      trackDetails: resolveHideControlOverride(
        overrides.forceHideControls.trackDetails,
        inherited.forceHideControls.trackDetails,
      ),
    },
  }
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
  mainNavFontSizePx: z.number().int().default(15),
  menuItems: z.array(navItemSchema).default([
    { label: 'Works', href: '/works/', enabled: true, order: 0 },
    { label: 'About', href: '/about/', enabled: true, order: 1 },
    { label: 'Contact', href: '/contact/', enabled: true, order: 2 },
  ]),
  footerLinks: z.array(z.object({ label: z.string(), href: z.string() })).default([
    { label: 'Accessibility', href: '/accessibility-statement/' },
    { label: 'Sitemap', href: '/sitemap/' },
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

// ─── Sharing Config ─────────────────────────────────────────────────────────

const shareOptions = ['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link', 'linkedin'] as const

export type ShareOption = (typeof shareOptions)[number]

const sharingSchema = z.object({
  enabledShares: z
    .array(z.enum(shareOptions))
    .default(['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link']),
})

export type SharingConfig = z.infer<typeof sharingSchema>

export function getSharingConfig(): SharingConfig {
  return readYaml(path.join(SITE_DIR, 'sharing.yaml'), sharingSchema, sharingSchema.parse({}))
}

// ─── Homepage Content ───────────────────────────────────────────────────────

function clampHomeColumnPercent(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

const homeHeroSectionSchema = z.object({
  hideHeroSection: z.boolean().default(false),
  hideHeroTitle: z.boolean().default(false),
  hideHeroSubtitle: z.boolean().default(false),
  heroTitle: z.string().default(''),
  heroSubtitle: z.string().default('Composer'),
  heroTagline: z.string().default('“A strikingly original voice — lyrical, atmospheric, and quietly unforgettable.”'),
  listenNowText: z.string().default('Listen Now'),
  hideSearchMusicButton: z.boolean().default(false),
  searchMusicText: z.string().default('Search Music'),
  heroImageColumnSide: z.enum(['left', 'right']).default('left'),
  heroImageColumnWidthPercent: z.number().int().default(41),
  preferredHeroId: z.string().default(''),
})

const homeFeaturedRecordingSectionSchema = z.object({
  hideFeaturedRecordingSection: z.boolean().default(false),
  featuredSectionTitle: z.string().default('Featured Recording'),
  featuredMoreDetailsText: z.string().default('More Details'),
  featuredPlayerImageColumnSide: z.enum(['left', 'right']).default('right'),
  featuredPlayerImageColumnWidthPercent: z.number().int().default(58),
})

const homeSelectWorksSectionSchema = z.object({
  hideSelectWorksSection: z.boolean().default(false),
  selectWorksLabel: z.string().default('Select Works'),
  selectWorksRandomize: z.boolean().default(true),
  selectWorksShowAll: z.boolean().default(false),
  selectWorksMaxItems: z.number().int().optional().nullable().default(16),
  selectWorksExcludeFeaturedWork: z.boolean().default(true),
})

const homeSeoSectionSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
})

const homeContactSectionSchema = z.object({
  hideContactSection: z.boolean().default(false),
  contactIntro: z.string().default(''),
  contactEmailLeadText: z.string().default(''),
})

type HomePageFlatConfig = z.infer<typeof homeHeroSectionSchema> &
  z.infer<typeof homeFeaturedRecordingSectionSchema> &
  z.infer<typeof homeSelectWorksSectionSchema> &
  z.infer<typeof homeSeoSectionSchema> &
  z.infer<typeof homeContactSectionSchema>

export type HomePageConfig = HomePageFlatConfig

export function getHomePage(): HomePageConfig {
  const homeHero = readYaml(path.join(PAGES_DIR, 'home', 'hero.yaml'), homeHeroSectionSchema, homeHeroSectionSchema.parse({}))
  const homeFeaturedRecording = readYaml(
    path.join(PAGES_DIR, 'home', 'featured-recording.yaml'),
    homeFeaturedRecordingSectionSchema,
    homeFeaturedRecordingSectionSchema.parse({}),
  )
  const homeSelectWorks = readYaml(
    path.join(PAGES_DIR, 'home', 'select-works.yaml'),
    homeSelectWorksSectionSchema,
    homeSelectWorksSectionSchema.parse({}),
  )
  const homeSeo = readYaml(path.join(PAGES_DIR, 'home', 'seo.yaml'), homeSeoSectionSchema, homeSeoSectionSchema.parse({}))
  const homeContact = readYaml(
    path.join(PAGES_DIR, 'home', 'contact.yaml'),
    homeContactSectionSchema,
    homeContactSectionSchema.parse({}),
  )

  const normalized = {
    ...homeHero,
    ...homeFeaturedRecording,
    ...homeSelectWorks,
    ...homeSeo,
    ...homeContact,
  }
  const selectWorksMaxItems =
    typeof normalized.selectWorksMaxItems === 'number' &&
    Number.isFinite(normalized.selectWorksMaxItems) &&
    normalized.selectWorksMaxItems > 0
      ? Math.trunc(normalized.selectWorksMaxItems)
      : null
  const config: HomePageConfig = {
    ...normalized,
    selectWorksLabel: normalized.selectWorksLabel.trim(),
    featuredSectionTitle: normalized.featuredSectionTitle.trim() || 'Featured Recording',
    featuredMoreDetailsText: normalized.featuredMoreDetailsText.trim() || 'More Details',
    contactIntro: normalized.contactIntro.trim(),
    contactEmailLeadText: normalized.contactEmailLeadText.trim(),
    selectWorksMaxItems,
    heroImageColumnWidthPercent: clampHomeColumnPercent(normalized.heroImageColumnWidthPercent, 25, 75, 41),
    featuredPlayerImageColumnWidthPercent: clampHomeColumnPercent(
      normalized.featuredPlayerImageColumnWidthPercent,
      30,
      75,
      58,
    ),
  }
  // Derive heroTitle from composerName if not set
  if (!config.heroTitle) {
    const site = getSiteConfig()
    return { ...config, heroTitle: site.composerName }
  }
  return config
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
      'For score inquiries, performance opportunities, and collaborations, please feel free to get in touch.',
    ),
  contactEmailLeadText: z.string().default(''),
  contactEmailLinkText: z.string().default(''),
  contactFormNameLabel: z.string().default('Name'),
  contactFormNamePlaceholder: z.string().default('What should I call you?'),
  contactFormEmailLabel: z.string().default('Email'),
  contactFormEmailPlaceholder: z.string().default('you@domain.com'),
  contactFormMessageLabel: z.string().default('Message'),
  contactFormMessagePlaceholder: z.string().default('Enter your message here...'),
  contactFormSubmitText: z.string().default('Send'),
  contactFormEnabled: z.boolean().default(false),
  preferredHeroId: z.string().default(''),
})

export type ContactPageConfig = z.infer<typeof contactPageSchema>

export function getContactPage(): ContactPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'contact.yaml'), contactPageSchema, contactPageSchema.parse({}))
  const normalized: ContactPageConfig = {
    ...config,
    title: config.title.trim() || 'Contact',
    metaTitle: config.metaTitle.trim(),
    metaDescription: config.metaDescription.trim(),
    searchResultText: config.searchResultText.trim(),
    introText:
      config.introText.trim() ||
      'For score inquiries, performance opportunities, and collaborations, please feel free to get in touch.',
    contactEmailLeadText: config.contactEmailLeadText.trim(),
    contactEmailLinkText: config.contactEmailLinkText.trim(),
    contactFormNameLabel: config.contactFormNameLabel.trim() || 'Name',
    contactFormNamePlaceholder: config.contactFormNamePlaceholder.trim() || 'What should I call you?',
    contactFormEmailLabel: config.contactFormEmailLabel.trim() || 'Email',
    contactFormEmailPlaceholder: config.contactFormEmailPlaceholder.trim() || 'you@domain.com',
    contactFormMessageLabel: config.contactFormMessageLabel.trim() || 'Message',
    contactFormMessagePlaceholder: config.contactFormMessagePlaceholder.trim() || 'Enter your message here...',
    contactFormSubmitText: config.contactFormSubmitText.trim() || 'Send',
  }
  // Derive metaTitle from composerName if not set
  if (!normalized.metaTitle) {
    const site = getSiteConfig()
    return { ...normalized, metaTitle: `Contact ${site.composerName}` }
  }
  return normalized
}

// ─── Works Page Content ─────────────────────────────────────────────────────

const worksPageSchema = z.object({
  title: z.string().default('Works'),
  introText: z.string().default(''),
  hideIntroText: z.boolean().default(false),
  workLabelSingular: z.string().default('work'),
  workLabelPlural: z.string().default('works'),
  searchLabel: z.string().default('Search works'),
  searchPlaceholder: z.string().default('Enter keywords...'),
  preferredHeroId: z.string().default(''),
})

export type WorksPageConfig = z.infer<typeof worksPageSchema>

export function getWorksPage(): WorksPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'works.yaml'), worksPageSchema, worksPageSchema.parse({}))
  const site = getSiteConfig()
  return {
    ...config,
    title: config.title.trim() || 'Works',
    introText: config.introText.trim() || `A showcase of compositions by ${site.composerName}.`,
    hideIntroText: config.hideIntroText,
    workLabelSingular: config.workLabelSingular.trim() || 'work',
    workLabelPlural: config.workLabelPlural.trim() || 'works',
    searchLabel: config.searchLabel.trim() || 'Search works',
    searchPlaceholder: config.searchPlaceholder.trim() || 'Enter keywords...',
  }
}

// ─── About Page Content ─────────────────────────────────────────────────────

const aboutPageSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  profileImageAlt: z.string().default(''),
  body: z.string().default(''),
  preferredHeroId: z.string().default(''),
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

const brandLogoImageExts = new Set(['.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])
const brandLogoExtensionPriority = ['.svg', '.png', '.webp', '.avif', '.jpg', '.jpeg', '.gif', '.ico'] as const

function findBrandLogoImagePath(): string {
  const brandingDir = path.join(SOURCE_ROOT, 'branding')
  if (!fs.existsSync(brandingDir)) return ''

  const files = fs.readdirSync(brandingDir).sort((a, b) => a.localeCompare(b))
  for (const ext of brandLogoExtensionPriority) {
    const match = files.find((file) => {
      const absolutePath = path.join(brandingDir, file)
      if (!fs.statSync(absolutePath).isFile()) return false
      const fileBase = path.basename(file, path.extname(file)).toLowerCase()
      const fileExt = path.extname(file).toLowerCase()
      return fileBase === 'logo' && fileExt === ext && brandLogoImageExts.has(fileExt)
    })
    if (match) return `/${match.replace(/^\/+/, '')}`
  }

  return ''
}

function normalizeOptionalPixelDimension(value: number | null | undefined, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < min || rounded > max) return null
  return rounded
}

const brandConfigSchema = z.object({
  logoImageAlt: z.string().default(''),
  logoWidth: z.number().int().positive().nullable().default(null),
  logoHeight: z.number().int().positive().nullable().default(null),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
})

type BrandConfigInput = z.infer<typeof brandConfigSchema>
export type BrandConfig = BrandConfigInput & {
  logoImage: string
}

export function getBrandConfig(): BrandConfig {
  const config = readYaml(
    path.join(SOURCE_ROOT, 'branding', 'brand-logo.yaml'),
    brandConfigSchema,
    brandConfigSchema.parse({}),
  )
  const normalizedConfig: BrandConfig = {
    ...config,
    logoImage: findBrandLogoImagePath(),
    logoImageAlt: config.logoImageAlt.trim(),
    logoWidth: normalizeOptionalPixelDimension(config.logoWidth, 1, 1200),
    logoHeight: normalizeOptionalPixelDimension(config.logoHeight, 1, 600),
  }

  // Derive first/last name from composerName if not set
  if (!normalizedConfig.firstName && !normalizedConfig.lastName) {
    const site = getSiteConfig()
    const parts = site.composerName.split(' ')
    return {
      ...normalizedConfig,
      firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
      lastName: parts.length > 1 ? parts[parts.length - 1] || '' : '',
    }
  }
  return normalizedConfig
}

// ─── Deploy Config ──────────────────────────────────────────────────────────

const deployConfigSchema = z.object({
  sftpHost: z.string().default(''),
  sftpUser: z.string().default(''),
  sftpRemotePath: z.string().default(''),
  sftpPort: z.number().default(22),
  sftpSkipAudio: z.boolean().default(false),
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

// ─── Hero Variants ──────────────────────────────────────────────────────────

const heroVariantSchema = z.object({
  label: z.string().default(''),
  alt: z.string().default(''),
  credit: z.string().default(''),
  position: z.string().default('50% 50%'),
  filter: z.string().default(''),
})

const heroConfigSchema = z.object({
  preferredHeroId: z.string().default(''),
  fallbackHeroId: z.string().default(''),
  defaultFilter: z.string().default('saturate(0.72) contrast(1.06) brightness(0.72)'),
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
  return readYaml(
    path.join(SOURCE_ROOT, 'home', 'hero', 'hero-config.yaml'),
    heroConfigSchema,
    heroConfigSchema.parse({}),
  )
}

export function getHeroVariants(): HeroVariant[] {
  const heroDir = path.join(SOURCE_ROOT, 'home', 'hero')
  if (!fs.existsSync(heroDir)) return []

  const heroConfig = getHeroConfig()
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp'])

  const files = fs.readdirSync(heroDir)
  const imageFiles = files.filter((f) => imageExts.has(path.extname(f).toLowerCase())).sort()

  const variants: HeroVariant[] = []

  for (const imageFile of imageFiles) {
    const baseName = path.basename(imageFile, path.extname(imageFile))
    const yamlFile = `${baseName}.yaml`
    const yamlPath = path.join(heroDir, yamlFile)

    // Parse the slug: strip leading "NN-" numeric prefix
    const slug = baseName.replace(/^\d+-/, '')

    // Read sidecar YAML if it exists
    let meta = heroVariantSchema.parse({})
    if (fs.existsSync(yamlPath)) {
      const raw = yaml.load(fs.readFileSync(yamlPath, 'utf-8'))
      meta = heroVariantSchema.parse(raw)
    }

    variants.push({
      id: slug,
      label: meta.label || slug,
      src: `/hero/${imageFile}`,
      alt: meta.alt,
      credit: meta.credit,
      position: meta.position,
      filter: meta.filter || heroConfig.defaultFilter,
    })
  }

  return variants
}

// ─── Theme Config ───────────────────────────────────────────────────────────

const themeConfigSchema = z.object({
  colorBackground: z.string().default(''),
  colorBackgroundSoft: z.string().default(''),
  colorText: z.string().default(''),
  colorTextMuted: z.string().default(''),
  colorAccent: z.string().default(''),
  colorAccentStrong: z.string().default(''),
  colorButton: z.string().default(''),
  colorButtonText: z.string().default(''),
  interiorHeroOverlayOpacity: z.union([z.string(), z.number()]).default(''),
  fontBody: z.string().default('Atkinson Hyperlegible'),
  fontHeading: z.string().default('Gothic A1'),
})

export type ThemeConfig = z.infer<typeof themeConfigSchema>

export function getThemeConfig(): ThemeConfig {
  return readYaml(path.join(SITE_DIR, 'theme.yaml'), themeConfigSchema, themeConfigSchema.parse({}))
}
