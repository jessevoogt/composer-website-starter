#!/usr/bin/env node

/**
 * Standalone setup wizard server.
 *
 * Runs independently of Astro — no Vite, no HMR, no content collection conflicts.
 * Compiles SCSS and TS on startup, serves the wizard template, handles all setup
 * API endpoints, then auto-exits after finalize so `npm run dev` can continue.
 *
 * API handlers duplicate the logic from src/integrations/keystatic-dev-server.mjs
 * (lines 2110–2786). Same YAML read/write patterns, same validation, same js-yaml
 * dump options. Cross-reference that file if changing handler logic.
 *
 * Usage:
 *   node scripts/setup-server.mjs          # standalone
 *   Called by scripts/maybe-setup.mjs       # as part of npm run dev first-run
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(ROOT, 'source')
const HEROES_DIR = path.join(SOURCE_DIR, 'heroes')
const PORT = Number(process.env.SETUP_PORT || 3456)
const SETUP_AUTO_OPEN = process.env.SETUP_AUTO_OPEN !== '0'

// ─── Config paths (mirrors keystatic-dev-server.mjs) ─────────────────────────

const SITE_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'site.yaml')
const BRAND_LOGO_CONFIG_PATH = path.join(SOURCE_DIR, 'branding', 'brand-logo.yaml')
const SOCIAL_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'social.yaml')
const COPYRIGHT_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'copyright.yaml')
const HOME_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'home.yaml')
const CONTACT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'contact.yaml')
const PERUSAL_ACCESS_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'perusal-access.yaml')
const ABOUT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml')
const DEPLOY_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'deploy.yaml')
const THEME_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'theme.yaml')
const THEME_SELECTION_PATH = path.join(SOURCE_DIR, 'site', 'theme-selection.yaml')
const THEME_LIBRARY_PATH = path.join(SOURCE_DIR, 'site', 'theme-library.yaml')

const VALID_SOCIAL_PLATFORMS = new Set([
  'instagram', 'youtube', 'facebook', 'soundcloud',
  'twitter', 'linkedin', 'tiktok', 'bandcamp',
])

const THEME_COLOR_KEYS = [
  'colorBackground', 'colorBackgroundSoft', 'colorText', 'colorTextMuted',
  'colorAccent', 'colorAccentStrong', 'colorButton', 'colorButtonText',
]

const VALID_BORDER_RADIUS = new Set(['none', 'subtle', 'soft', 'rounded', 'round', 'pill'])

/** Branding defaults per theme preset (mirrors src/utils/theme-presets.ts). */
const THEME_BRANDING_DEFAULTS = {
  'dark-blue': { faviconBackground: '#10161d', faviconText: '#ecf2f7', faviconRadius: 0, socialGradientStart: '#040812', socialGradientEnd: '#111e32', socialText: '#dce6f6', socialMuted: '#aebbd4' },
  'concert-hall':   { faviconBackground: '#6e0f1a', faviconText: '#f6f1e8', faviconRadius: 4, socialGradientStart: '#1a0a0d', socialGradientEnd: '#3a1520', socialText: '#f6f1e8', socialMuted: '#c9b89e' },
  'midnight-stage': { faviconBackground: '#0f1722', faviconText: '#f4e8c1', faviconRadius: 8, socialGradientStart: '#060d16', socialGradientEnd: '#162030', socialText: '#ede7de', socialMuted: '#a7a19a' },
  'sheet-music-minimal': { faviconBackground: '#1e3a5f', faviconText: '#ffffff', faviconRadius: 4, socialGradientStart: '#0f1d30', socialGradientEnd: '#1e3a5f', socialText: '#ffffff', socialMuted: '#b0c4de' },
  'velvet-curtain': { faviconBackground: '#1a0a1e', faviconText: '#f0e6f4', faviconRadius: 8, socialGradientStart: '#0d0510', socialGradientEnd: '#241228', socialText: '#f2e9f3', socialMuted: '#b9aebb' },
  'sea-glass-modern': { faviconBackground: '#1a6b6a', faviconText: '#f5f7f6', faviconRadius: 12, socialGradientStart: '#0d3534', socialGradientEnd: '#1a6b6a', socialText: '#f3f7f7', socialMuted: '#a0c4c3' },
  'neon-ink':       { faviconBackground: '#0a0a0a', faviconText: '#00e5ff', faviconRadius: 0, socialGradientStart: '#050505', socialGradientEnd: '#0e1424', socialText: '#eaf0ff', socialMuted: '#a3aec7' },
}

/**
 * Look up branding defaults for the active theme.
 * Falls back to {} if the preset ID is unknown.
 */
function getThemeBrandingDefaults() {
  const themeData = readYamlSafe(THEME_CONFIG_PATH)
  const presetId = themeData.currentThemeId || ''
  return THEME_BRANDING_DEFAULTS[presetId] || {}
}

const socialPlatforms = ['instagram', 'youtube', 'facebook', 'soundcloud', 'twitter', 'linkedin', 'tiktok', 'bandcamp']

// ─── YAML helpers ─────────────────────────────────────────────────────────────

const YAML_DUMP_OPTIONS = { lineWidth: 120, noRefs: true, sortKeys: false }

function readYamlSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = yaml.load(fs.readFileSync(filePath, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, yaml.dump(data, YAML_DUMP_OPTIONS), 'utf8')
}

// ─── Request helpers ──────────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(body)
      } catch (err) {
        reject(new Error('Invalid JSON body: ' + err.message))
      }
    })
    req.on('error', reject)
  })
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function methodNotAllowed(res, allowed) {
  res.statusCode = 405
  res.setHeader('Allow', allowed)
  sendJson(res, 405, { ok: false, error: 'Method not allowed.' })
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Script runner ────────────────────────────────────────────────────────────

function spawnScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: ROOT,
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Script ${path.basename(scriptPath)} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

// ─── Compile assets on startup ─────────────────────────────────────────────────

async function compileWizardCss() {
  // Use the sass JS API (available as a devDependency)
  const sass = await import('sass')
  const scssPath = path.join(ROOT, 'src', 'styles', 'setup-wizard.scss')
  const result = sass.compile(scssPath, { style: 'compressed' })
  return result.css
}

async function compileWizardJs() {
  // Use esbuild JS API (available via Vite/Astro dependency chain)
  const esbuild = await import('esbuild')
  const tsPath = path.join(ROOT, 'src', 'scripts', 'setup-wizard.ts')
  const result = await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    minify: true,
  })
  return result.outputFiles[0].text
}

// ─── Read config data for template rendering ────────────────────────────────

function readAllConfigData() {
  const siteData = readYamlSafe(SITE_CONFIG_PATH)
  const brandData = readYamlSafe(BRAND_LOGO_CONFIG_PATH)
  const themeData = readYamlSafe(THEME_CONFIG_PATH)
  const socialData = readYamlSafe(SOCIAL_CONFIG_PATH)
  const homeData = readYamlSafe(HOME_CONFIG_PATH)
  const contactData = readYamlSafe(CONTACT_CONFIG_PATH)
  const perusalData = readYamlSafe(PERUSAL_ACCESS_CONFIG_PATH)
  const aboutData = readYamlSafe(ABOUT_CONFIG_PATH)
  const deployData = readYamlSafe(DEPLOY_CONFIG_PATH)

  // Extract hero tagline from home sections array
  const heroSection = Array.isArray(homeData.sections)
    ? homeData.sections.find((s) => s?.block?.discriminant === 'hero')
    : null
  const heroValue = heroSection?.block?.value || {}

  return {
    site: siteData,
    brand: brandData,
    theme: themeData,
    social: socialData,
    home: homeData,
    hero: heroValue,
    contact: contactData,
    perusal: perusalData,
    about: aboutData,
    deploy: deployData,
  }
}

// ─── Server-render dynamic HTML sections ────────────────────────────────────

function renderPresetCards(presetsData, currentThemeId) {
  return presetsData.map((preset) => {
    const isSelected = preset.id === (currentThemeId || '').trim()
    const selectedClass = isSelected ? ' setup-wizard__preset-card--selected' : ''
    const ariaChecked = isSelected ? 'true' : 'false'
    return `<button type="button" class="setup-wizard__preset-card${selectedClass}" data-preset-id="${escapeAttr(preset.id)}" role="radio" aria-checked="${ariaChecked}" aria-label="${escapeAttr(preset.label)}">
  <div class="setup-wizard__preset-swatches">
    <span class="setup-wizard__swatch" style="background: ${escapeAttr(preset.colors.colorBackground)}"></span>
    <span class="setup-wizard__swatch" style="background: ${escapeAttr(preset.colors.colorText)}"></span>
    <span class="setup-wizard__swatch" style="background: ${escapeAttr(preset.colors.colorAccent)}"></span>
    <span class="setup-wizard__swatch" style="background: ${escapeAttr(preset.colors.colorButton)}"></span>
  </div>
  <span class="setup-wizard__preset-name">${escapeHtml(preset.label)}</span>
  <span class="setup-wizard__preset-desc">${escapeHtml(preset.description)}</span>
</button>`
  }).join('\n')
}

function renderHeroSection(heroData) {
  if (heroData.length === 0) {
    return '<p class="setup-wizard__empty">No hero images found. You can add them later in Keystatic under the "Heroes" collection.</p>'
  }
  const cards = heroData.map((hero) => {
    return `<button type="button" class="setup-wizard__hero-card" data-hero-id="${escapeAttr(hero.id)}" role="radio" aria-checked="false" aria-label="${escapeAttr(hero.label)}">
  <img src="${escapeAttr(hero.src)}" alt="${escapeAttr(hero.alt || hero.label)}" class="setup-wizard__hero-img" loading="lazy" />
  <span class="setup-wizard__hero-label">${escapeHtml(hero.label)}</span>
</button>`
  }).join('\n')
  return `<div class="setup-wizard__hero-grid" role="radiogroup" aria-label="Hero images">\n${cards}\n</div>`
}

function renderSocialRows(existingSocialLinks) {
  return existingSocialLinks.map((link) => {
    const checked = link.enabled ? ' checked' : ''
    const displayName = link.platform.charAt(0).toUpperCase() + link.platform.slice(1)
    return `<div class="setup-wizard__social-row" data-platform="${escapeAttr(link.platform)}">
  <label class="setup-wizard__social-toggle">
    <input type="checkbox" class="setup-wizard__social-checkbox" data-social-enabled="${escapeAttr(link.platform)}"${checked} />
    <span class="setup-wizard__social-toggle-track">
      <span class="setup-wizard__social-toggle-thumb"></span>
    </span>
  </label>
  <span class="setup-wizard__social-platform">${escapeHtml(displayName)}</span>
  <input type="url" class="setup-wizard__social-url" data-social-url="${escapeAttr(link.platform)}" value="${escapeAttr(link.url)}" placeholder="https://${link.platform}.com/yourprofile" aria-label="${escapeAttr(link.platform)} URL" />
</div>`
  }).join('\n')
}

function renderFontOptions(fontOptions, selectedValue) {
  return fontOptions.map((font) => {
    const selected = font.value === (selectedValue || '').trim() ? ' selected' : ''
    return `<option value="${escapeAttr(font.value)}"${selected}>${escapeHtml(font.label)}</option>`
  }).join('\n')
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Load theme presets + font catalog ──────────────────────────────────────

async function loadPresets() {
  // Dynamic import the TS files via esbuild
  const esbuild = await import('esbuild')

  const presetsPath = path.join(ROOT, 'src', 'utils', 'theme-presets.ts')
  const presetsResult = await esbuild.build({
    entryPoints: [presetsPath],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    platform: 'node',
  })
  // Write to a temp file and import it
  const tmpPresetsPath = path.join(ROOT, '.cache', '_setup-presets.mjs')
  fs.mkdirSync(path.dirname(tmpPresetsPath), { recursive: true })
  fs.writeFileSync(tmpPresetsPath, presetsResult.outputFiles[0].text)
  const presetsModule = await import(tmpPresetsPath)

  const fontsPath = path.join(ROOT, 'src', 'utils', 'theme-fonts.ts')
  const fontsResult = await esbuild.build({
    entryPoints: [fontsPath],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    platform: 'node',
  })
  const tmpFontsPath = path.join(ROOT, '.cache', '_setup-fonts.mjs')
  fs.writeFileSync(tmpFontsPath, fontsResult.outputFiles[0].text)
  const fontsModule = await import(tmpFontsPath)

  // Clean up temp files
  try { fs.unlinkSync(tmpPresetsPath) } catch { /* ignore */ }
  try { fs.unlinkSync(tmpFontsPath) } catch { /* ignore */ }

  return {
    THEME_PRESETS: presetsModule.THEME_PRESETS,
    BORDER_RADIUS_OPTIONS: presetsModule.BORDER_RADIUS_OPTIONS,
    THEME_FONT_CATALOG: fontsModule.THEME_FONT_CATALOG,
  }
}

// ─── Read hero variants from source/heroes/ ─────────────────────────────────

function getHeroVariants() {
  if (!fs.existsSync(HEROES_DIR)) return []
  const entries = fs.readdirSync(HEROES_DIR, { withFileTypes: true })
  const heroes = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const heroDir = path.join(HEROES_DIR, entry.name)
    const yamlPath = path.join(heroDir, 'hero.yaml')
    if (!fs.existsSync(yamlPath)) continue

    const heroData = readYamlSafe(yamlPath)
    // Find the image file
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp']
    let imageName = ''
    for (const ext of imageExts) {
      if (fs.existsSync(path.join(heroDir, `image${ext}`))) {
        imageName = `image${ext}`
        break
      }
    }

    heroes.push({
      id: entry.name,
      label: heroData.label || entry.name,
      // Serve via our own /heroes/ route
      src: `/heroes/${entry.name}/${imageName}`,
      alt: heroData.alt || heroData.label || entry.name,
      position: heroData.position || 'center center',
    })
  }
  return heroes.sort((a, b) => (a.label || '').localeCompare(b.label || ''))
}

// ─── Build the complete HTML page ───────────────────────────────────────────

function buildWizardHtml(template, css, js, presetsModule, config) {
  const { THEME_PRESETS, BORDER_RADIUS_OPTIONS, THEME_FONT_CATALOG } = presetsModule

  // Build serializable data (same as setup.astro)
  const fontOptions = Object.entries(THEME_FONT_CATALOG).map(([key, meta]) => ({
    value: key,
    label: meta.label,
  }))

  // Font catalog for client-side live preview (name → {cssFamily, googleCss2Family})
  const fontData = Object.fromEntries(
    Object.entries(THEME_FONT_CATALOG).map(([key, meta]) => [
      key,
      { cssFamily: meta.cssFamily, googleCss2Family: meta.googleCss2Family || null },
    ]),
  )

  const presetsData = THEME_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    colors: preset.colors,
    fontBody: preset.fontBody,
    fontHeading: preset.fontHeading,
    borderRadius: preset.borderRadius,
    focusRingColor: preset.focusRingColor ?? '',
    ctaBackground: preset.ctaBackground ?? '',
    ctaText: preset.ctaText ?? '',
    navActiveUnderline: preset.navActiveUnderline ?? '',
    navActiveText: preset.navActiveText ?? '',
    navHoverUnderline: preset.navHoverUnderline ?? '',
    navHoverText: preset.navHoverText ?? '',
    scrimColor: preset.scrimColor ?? '',
    disableImageOverlays: preset.disableImageOverlays ?? false,
    playerBorderRadius: preset.playerBorderRadius ?? '',
    socialIconBorderRadius: preset.socialIconBorderRadius ?? '',
    profileImageBorderRadius: preset.profileImageBorderRadius ?? '',
    tagBadgeBorderRadius: preset.tagBadgeBorderRadius ?? '',
  }))

  const heroData = getHeroVariants()

  const socialLinks = Array.isArray(config.social?.links) ? config.social.links : []
  const existingSocialLinks = socialPlatforms.map((platform) => {
    const existing = socialLinks.find((link) => link.platform === platform)
    return {
      platform,
      url: existing?.url ?? '',
      enabled: existing?.enabled ?? false,
    }
  })

  const homepageData = {
    heroTagline: config.hero.heroTagline || '',
    heroTaglineAsBlockquote: config.hero.heroTaglineAsBlockquote === true,
    heroTaglineCitation: config.hero.heroTaglineCitation || '',
  }

  const formsData = {
    contactFormEnabled: config.contact.contactFormEnabled === true,
    contactWebhookUrl: config.contact.contactWebhookUrl || '',
    perusalGatingEnabled: config.perusal.gatingEnabled !== false,
    perusalWebhookUrl: config.perusal.webhookUrl || '',
    perusalTokenSecret: config.perusal.tokenSecret || '',
    perusalTokenExpirationDays: config.perusal.tokenExpirationDays || 90,
  }

  const aboutData = {
    profileImageAlt: config.about.profileImageAlt || '',
    body: config.about.body || '',
    metaDescription: config.about.metaDescription || '',
  }

  const deployData = {
    sftpHost: config.deploy.sftpHost || '',
    sftpUser: config.deploy.sftpUser || '',
    sftpRemotePath: config.deploy.sftpRemotePath || '',
    sftpPort: config.deploy.sftpPort || 22,
  }

  // Determine pre-filled form values
  const firstName = config.brand.firstName === 'First' ? '' : (config.brand.firstName || '')
  const lastName = config.brand.lastName === 'Last' ? '' : (config.brand.lastName || '')
  const email = config.site.email === 'composer@example.com' ? '' : (config.site.email || '')
  const siteUrl = config.site.siteUrl === 'https://example.com' || !config.site.siteUrl ? '' : config.site.siteUrl
  const siteTitle = config.site.siteTitle === 'FirstName LastName — Composer' ? '' : (config.site.siteTitle || '')
  const siteDescription = config.site.siteDescription === 'A composer portfolio website built with Astro.' ? '' : (config.site.siteDescription || '')

  const taglineBqChecked = homepageData.heroTaglineAsBlockquote ? 'checked' : ''
  const citationHidden = homepageData.heroTaglineAsBlockquote ? '' : 'hidden'

  const contactFormChecked = formsData.contactFormEnabled ? 'checked' : ''
  const contactDetailsHidden = formsData.contactFormEnabled ? '' : 'hidden'
  const contactDisabledNoteHidden = formsData.contactFormEnabled ? 'hidden' : ''

  const perusalGatingChecked = formsData.perusalGatingEnabled ? 'checked' : ''
  const perusalDetailsHidden = formsData.perusalGatingEnabled ? '' : 'hidden'
  const perusalDisabledNoteHidden = formsData.perusalGatingEnabled ? 'hidden' : ''

  // Replace all template tokens.
  // IMPORTANT: Use split/join instead of String.replace() because replace()
  // interprets $& $' $` $1 etc. in the replacement string. The compiled JS
  // is full of $ characters which get mangled by replace().
  const tokens = {
    // Compiled assets
    '{{WIZARD_CSS}}': css,
    '{{WIZARD_JS}}': js,
    // Server-rendered sections
    '{{PRESET_CARDS}}': renderPresetCards(presetsData, config.theme.currentThemeId),
    '{{HERO_SECTION}}': renderHeroSection(heroData),
    '{{SOCIAL_ROWS}}': renderSocialRows(existingSocialLinks),
    '{{FONT_HEADING_OPTIONS}}': renderFontOptions(fontOptions, config.theme.fontHeading),
    '{{FONT_BODY_OPTIONS}}': renderFontOptions(fontOptions, config.theme.fontBody),
    // Pre-filled form values
    '{{FIRST_NAME}}': escapeAttr(firstName),
    '{{LAST_NAME}}': escapeAttr(lastName),
    '{{EMAIL}}': escapeAttr(email),
    '{{SITE_URL}}': escapeAttr(siteUrl),
    '{{SITE_TITLE}}': escapeAttr(siteTitle),
    '{{SITE_DESCRIPTION}}': escapeHtml(siteDescription),
    '{{HERO_TAGLINE}}': escapeHtml(homepageData.heroTagline),
    '{{TAGLINE_BQ_CHECKED}}': taglineBqChecked,
    '{{CITATION_FIELD_HIDDEN}}': citationHidden,
    '{{TAGLINE_CITATION}}': escapeAttr(homepageData.heroTaglineCitation),
    '{{PROFILE_ALT}}': escapeAttr(aboutData.profileImageAlt),
    '{{ABOUT_BODY}}': escapeHtml(aboutData.body),
    // Forms step
    '{{CONTACT_FORM_CHECKED}}': contactFormChecked,
    '{{CONTACT_DETAILS_HIDDEN}}': contactDetailsHidden,
    '{{CONTACT_DISABLED_NOTE_HIDDEN}}': contactDisabledNoteHidden,
    '{{CONTACT_WEBHOOK_URL}}': escapeAttr(formsData.contactWebhookUrl),
    '{{PERUSAL_GATING_CHECKED}}': perusalGatingChecked,
    '{{PERUSAL_DETAILS_HIDDEN}}': perusalDetailsHidden,
    '{{PERUSAL_DISABLED_NOTE_HIDDEN}}': perusalDisabledNoteHidden,
    '{{PERUSAL_WEBHOOK_URL}}': escapeAttr(formsData.perusalWebhookUrl),
    '{{PERUSAL_TOKEN_SECRET}}': escapeAttr(formsData.perusalTokenSecret),
    '{{PERUSAL_EXPIRATION_DAYS}}': String(formsData.perusalTokenExpirationDays),
    // Deploy step
    '{{SFTP_HOST}}': escapeAttr(deployData.sftpHost),
    '{{SFTP_USER}}': escapeAttr(deployData.sftpUser),
    '{{SFTP_PATH}}': escapeAttr(deployData.sftpRemotePath || '/public_html'),
    '{{SFTP_PORT}}': String(deployData.sftpPort || 22),
    // JSON data blocks
    '{{FONT_DATA}}': JSON.stringify(fontData),
    '{{PRESETS_DATA}}': JSON.stringify(presetsData),
    '{{HERO_DATA}}': JSON.stringify(heroData),
    '{{BORDER_RADIUS_DATA}}': JSON.stringify(BORDER_RADIUS_OPTIONS),
    '{{HOMEPAGE_DATA}}': JSON.stringify(homepageData),
    '{{FORMS_DATA}}': JSON.stringify(formsData),
    '{{ABOUT_DATA}}': JSON.stringify(aboutData),
    '{{DEPLOY_DATA}}': JSON.stringify(deployData),
  }

  let html = template
  for (const [token, value] of Object.entries(tokens)) {
    html = html.split(token).join(value)
  }

  return html
}

// ─── Theme preset normalization helpers (from keystatic-dev-server.mjs) ─────

function normalizeThemeBoolean(value) {
  return value === true || value === 'true'
}

function normalizeThemeScalar(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '')
}

function normalizeThemeCustomCss(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeThemeAboutPage(value) {
  if (!value || typeof value !== 'object') return undefined
  const result = {}
  if (typeof value.profileCornerStyle === 'string') result.profileCornerStyle = value.profileCornerStyle.trim()
  return Object.keys(result).length ? result : undefined
}

function normalizeThemeContactPage(value) {
  if (!value || typeof value !== 'object') return undefined
  return undefined // no fields currently
}

function normalizeThemeHomeHero(value) {
  if (!value || typeof value !== 'object') return undefined
  const result = {}
  if (typeof value.overlayOpacity === 'number') result.overlayOpacity = Math.max(0, Math.min(1, value.overlayOpacity))
  if (typeof value.overlayColor === 'string' && value.overlayColor.trim()) result.overlayColor = value.overlayColor.trim()
  return Object.keys(result).length ? result : undefined
}

// ─── API handler: Theme Preset ──────────────────────────────────────────────

async function handleThemePreset(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)

    const normalizeHex = (value) => {
      if (typeof value !== 'string') return ''
      const trimmed = value.trim()
      if (!trimmed) return ''
      const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      if (!match) return ''
      const hex = match[1]
      if (hex.length === 3) return '#' + hex.split('').map((c) => c + c).join('').toLowerCase()
      return '#' + hex.toLowerCase()
    }

    const colors = body.colors && typeof body.colors === 'object' ? body.colors : {}
    const normalizedColors = {}
    for (const key of THEME_COLOR_KEYS) {
      normalizedColors[key] = normalizeHex(colors[key])
    }
    const focusRingColor = normalizeHex(body.focusRingColor)
    const navActiveUnderline = normalizeHex(body.navActiveUnderline)
    const navActiveText = normalizeHex(body.navActiveText)
    const navHoverUnderline = normalizeHex(body.navHoverUnderline)
    const navHoverText = normalizeHex(body.navHoverText)
    const scrimColor = normalizeHex(body.scrimColor)
    const disableImageOverlays = normalizeThemeBoolean(body.disableImageOverlays)
    const ctaBackground = normalizeHex(body.ctaBackground)
    const ctaText = normalizeHex(body.ctaText)
    const currentThemeId = normalizeThemeScalar(body.currentThemeId)
    const customCss = normalizeThemeCustomCss(body.customCss)
    const aboutPage = normalizeThemeAboutPage(body.aboutPage)
    const contactPage = normalizeThemeContactPage(body.contactPage)
    const homeHero = normalizeThemeHomeHero(body.homeHero)

    const fontBody = typeof body.fontBody === 'string' ? body.fontBody.trim() : ''
    const fontHeading = typeof body.fontHeading === 'string' ? body.fontHeading.trim() : ''
    const borderRadius = typeof body.borderRadius === 'string' && VALID_BORDER_RADIUS.has(body.borderRadius.trim())
      ? body.borderRadius.trim()
      : 'none'
    const playerBorderRadius = typeof body.playerBorderRadius === 'string' ? body.playerBorderRadius.trim() : ''
    const socialIconBorderRadius = typeof body.socialIconBorderRadius === 'string' ? body.socialIconBorderRadius.trim() : ''
    const profileImageBorderRadius = typeof body.profileImageBorderRadius === 'string' ? body.profileImageBorderRadius.trim() : ''
    const tagBadgeBorderRadius = typeof body.tagBadgeBorderRadius === 'string' ? body.tagBadgeBorderRadius.trim() : ''

    // Custom theme detection: when fonts differ from preset defaults
    const isCustom = body.isCustom === true
    const composerLabel = typeof body.composerLabel === 'string' ? body.composerLabel.trim() : ''
    const basePresetId = typeof body.basePresetId === 'string' ? body.basePresetId.trim() : ''

    // Determine the effective theme ID — custom themes get a composer-derived ID
    let effectiveThemeId = currentThemeId
    if (isCustom && composerLabel) {
      effectiveThemeId = composerLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (!effectiveThemeId) effectiveThemeId = currentThemeId
    }

    // Build YAML content (matches keystatic-dev-server.mjs format exactly)
    const lines = [
      '# Theme configuration',
      '# This is the applied snapshot used by the live site.',
      '# Theme Studio writes this file when you click Apply.',
      '# Colors should be specified as hex values (e.g. #1a1a2e).',
      '',
    ]
    lines.push(effectiveThemeId ? `currentThemeId: '${effectiveThemeId}'` : `currentThemeId: ''`)
    for (const key of THEME_COLOR_KEYS) {
      const value = normalizedColors[key]
      lines.push(value ? `${key}: '${value}'` : `${key}: ''`)
    }
    lines.push(focusRingColor ? `focusRingColor: '${focusRingColor}'` : `focusRingColor: ''`)
    lines.push(navActiveUnderline ? `navActiveUnderline: '${navActiveUnderline}'` : `navActiveUnderline: ''`)
    lines.push(navActiveText ? `navActiveText: '${navActiveText}'` : `navActiveText: ''`)
    lines.push(navHoverUnderline ? `navHoverUnderline: '${navHoverUnderline}'` : `navHoverUnderline: ''`)
    lines.push(navHoverText ? `navHoverText: '${navHoverText}'` : `navHoverText: ''`)
    lines.push(scrimColor ? `scrimColor: '${scrimColor}'` : `scrimColor: ''`)
    lines.push(`disableImageOverlays: ${disableImageOverlays ? 'true' : 'false'}`)
    lines.push(ctaBackground ? `ctaBackground: '${ctaBackground}'` : `ctaBackground: ''`)
    lines.push(ctaText ? `ctaText: '${ctaText}'` : `ctaText: ''`)
    lines.push(fontBody ? `fontBody: ${fontBody}` : `fontBody: Atkinson Hyperlegible`)
    lines.push(fontHeading ? `fontHeading: ${fontHeading}` : `fontHeading: Gothic A1`)
    lines.push(`borderRadius: ${borderRadius}`)
    lines.push(playerBorderRadius ? `playerBorderRadius: ${playerBorderRadius}` : `playerBorderRadius: ''`)
    lines.push(socialIconBorderRadius ? `socialIconBorderRadius: ${socialIconBorderRadius}` : `socialIconBorderRadius: ''`)
    lines.push(profileImageBorderRadius ? `profileImageBorderRadius: ${profileImageBorderRadius}` : `profileImageBorderRadius: ''`)
    lines.push(tagBadgeBorderRadius ? `tagBadgeBorderRadius: ${tagBadgeBorderRadius}` : `tagBadgeBorderRadius: ''`)
    if (customCss) {
      const customCssYaml = yaml.dump({ customCss }, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd().split('\n')
      lines.push(...customCssYaml)
    }
    if (aboutPage) {
      const aboutPageYaml = yaml.dump({ aboutPage }, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd().split('\n')
      lines.push(...aboutPageYaml)
    }
    if (contactPage) {
      const contactPageYaml = yaml.dump({ contactPage }, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd().split('\n')
      lines.push(...contactPageYaml)
    }
    if (homeHero) {
      const homeHeroYaml = yaml.dump({ homeHero }, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd().split('\n')
      lines.push(...homeHeroYaml)
    }
    lines.push('')

    fs.writeFileSync(THEME_CONFIG_PATH, lines.join('\n'), 'utf-8')
    fs.writeFileSync(
      THEME_SELECTION_PATH,
      [
        '# Active theme selection',
        '# Leave blank to keep using the applied custom snapshot from theme.yaml.',
        effectiveThemeId ? `currentThemeId: '${effectiveThemeId}'` : `currentThemeId: ''`,
        '',
      ].join('\n'),
      'utf-8',
    )

    // Custom theme: add a new entry to theme-library.yaml based on the preset
    if (isCustom && effectiveThemeId && effectiveThemeId !== currentThemeId) {
      try {
        const libraryRaw = fs.readFileSync(THEME_LIBRARY_PATH, 'utf-8')
        const library = yaml.load(libraryRaw) || { themes: [] }
        if (!Array.isArray(library.themes)) library.themes = []

        // Find the base preset in the library to clone its full structure
        const baseTheme = library.themes.find((t) => t.id === basePresetId)

        // Remove any previous custom theme with the same ID
        library.themes = library.themes.filter((t) => t.id !== effectiveThemeId)

        // Build the new custom theme entry
        const customTheme = baseTheme
          ? { ...JSON.parse(JSON.stringify(baseTheme)) }
          : { colors: normalizedColors }
        customTheme.id = effectiveThemeId
        customTheme.label = composerLabel || effectiveThemeId
        customTheme.description = baseTheme
          ? `Custom theme based on ${baseTheme.label}. Fonts customized.`
          : 'Custom theme with personalized fonts.'
        customTheme.fontBody = fontBody || 'Atkinson Hyperlegible'
        customTheme.fontHeading = fontHeading || 'Gothic A1'

        // Append to the end of the themes array
        library.themes.push(customTheme)

        fs.writeFileSync(
          THEME_LIBRARY_PATH,
          yaml.dump(library, {
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
            quotingType: "'",
            forceQuotes: false,
          }),
          'utf-8',
        )
      } catch (libErr) {
        // Non-fatal: theme.yaml and theme-selection.yaml were already written
        console.error('[setup] Failed to update theme-library.yaml:', libErr.message)
      }
    }

    sendJson(res, 200, { ok: true })
  } catch {
    sendJson(res, 500, { ok: false, error: 'Failed to persist theme preset.' })
  }
}

// ─── API handler: Hero Preference ───────────────────────────────────────────

async function handleHeroPreference(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const preferredHeroId = typeof body.preferredHeroId === 'string' ? body.preferredHeroId.trim() : ''
    const pageKey = typeof body.pageKey === 'string' ? body.pageKey.trim() : ''

    if (!pageKey || pageKey !== 'home') {
      sendJson(res, 400, { ok: false, error: 'pageKey must be "home".' })
      return
    }

    // Write preferredHeroId into home.yaml
    const homeData = readYamlSafe(HOME_CONFIG_PATH)
    if (Array.isArray(homeData.sections)) {
      const heroSection = homeData.sections.find((s) => s?.block?.discriminant === 'hero')
      if (heroSection?.block?.value) {
        heroSection.block.value.preferredHeroId = preferredHeroId
      }
    }
    writeYaml(HOME_CONFIG_PATH, homeData)

    sendJson(res, 200, { ok: true, preferredHeroId, pageKey })
  } catch {
    sendJson(res, 500, { ok: false, error: 'Failed to persist preferred hero id.' })
  }
}

// ─── API handler: Identity ──────────────────────────────────────────────────

async function handleIdentity(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
    const siteTitle = typeof body.siteTitle === 'string' ? body.siteTitle.trim() : ''
    const siteDescription = typeof body.siteDescription === 'string' ? body.siteDescription.trim() : ''

    if (!firstName || !lastName) {
      sendJson(res, 400, { ok: false, error: 'firstName and lastName are required.' })
      return
    }
    if (!email) {
      sendJson(res, 400, { ok: false, error: 'email is required.' })
      return
    }
    if (!isValidEmail(email)) {
      sendJson(res, 400, { ok: false, error: 'email must be a valid email address.' })
      return
    }
    if (!siteUrl) {
      sendJson(res, 400, { ok: false, error: 'siteUrl is required.' })
      return
    }
    if (!isValidHttpUrl(siteUrl)) {
      sendJson(res, 400, { ok: false, error: 'siteUrl must be a valid URL (http/https).' })
      return
    }

    const composerName = `${firstName} ${lastName}`
    const resolvedTitle = siteTitle || `${composerName} — Composer`

    // Update site.yaml
    const siteData = readYamlSafe(SITE_CONFIG_PATH)
    siteData.composerName = composerName
    siteData.siteTitle = resolvedTitle
    if (siteDescription) siteData.siteDescription = siteDescription
    siteData.email = email
    siteData.siteUrl = siteUrl
    writeYaml(SITE_CONFIG_PATH, siteData)

    // Update brand-logo.yaml
    const brandData = readYamlSafe(BRAND_LOGO_CONFIG_PATH)
    brandData.firstName = firstName
    brandData.lastName = lastName
    writeYaml(BRAND_LOGO_CONFIG_PATH, brandData)

    // Update copyright.yaml
    const copyrightData = readYamlSafe(COPYRIGHT_CONFIG_PATH)
    copyrightData.copyrightHolder = composerName
    writeYaml(COPYRIGHT_CONFIG_PATH, copyrightData)

    // Replace placeholder name in page content files
    const PLACEHOLDER_NAME = 'FirstName LastName'
    const pageFilesToUpdate = [
      path.join(SOURCE_DIR, 'pages', 'home.yaml'),
      path.join(SOURCE_DIR, 'pages', 'contact.yaml'),
      path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml'),
    ]
    for (const filePath of pageFilesToUpdate) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8')
        if (content.includes(PLACEHOLDER_NAME)) {
          fs.writeFileSync(filePath, content.replaceAll(PLACEHOLDER_NAME, composerName), 'utf8')
        }
      }
    }

    // Update source.config.mjs — defaultComposer used by ingest-works.mjs
    const sourceConfigPath = path.join(ROOT, 'source.config.mjs')
    if (fs.existsSync(sourceConfigPath)) {
      const configContent = fs.readFileSync(sourceConfigPath, 'utf8')
      const updated = configContent.replace(
        /defaultComposer:\s*'[^']*'/,
        `defaultComposer: '${composerName.replace(/'/g, "\\'")}'`,
      )
      if (updated !== configContent) {
        fs.writeFileSync(sourceConfigPath, updated, 'utf8')
      }
    }

    console.log(`[setup] Identity saved: ${composerName}`)
    sendJson(res, 200, { ok: true, composerName, siteTitle: resolvedTitle })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save identity: ' + err.message })
  }
}

// ─── API handler: Social ────────────────────────────────────────────────────

async function handleSocial(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const links = Array.isArray(body.links) ? body.links : []

    const normalizedLinks = links
      .filter((link) => link && typeof link === 'object' && VALID_SOCIAL_PLATFORMS.has(link.platform))
      .map((link) => ({
        platform: link.platform,
        url: typeof link.url === 'string' ? link.url.trim() : '',
        enabled: link.enabled === true,
      }))

    const socialYaml = yaml.dump({ links: normalizedLinks }, YAML_DUMP_OPTIONS)
    fs.writeFileSync(SOCIAL_CONFIG_PATH, socialYaml, 'utf8')

    console.log(`[setup] Social links saved: ${normalizedLinks.filter((l) => l.enabled).length} enabled`)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save social links: ' + err.message })
  }
}

// ─── API handler: Homepage ──────────────────────────────────────────────────

async function handleHomepage(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const heroTagline = typeof body.heroTagline === 'string' ? body.heroTagline.trim() : ''
    const heroTaglineAsBlockquote = body.heroTaglineAsBlockquote === true
    const heroTaglineCitation = typeof body.heroTaglineCitation === 'string' ? body.heroTaglineCitation.trim() : ''

    // Hero layout
    const heroLayout = typeof body.heroLayout === 'string' ? body.heroLayout.trim() : 'columns'
    const heroImagePosition = typeof body.heroImagePosition === 'string' ? body.heroImagePosition.trim() : 'left'

    // CTA buttons
    const ctaListenVisible = body.ctaListenVisible !== false
    const ctaListenLabel = typeof body.ctaListenLabel === 'string' ? body.ctaListenLabel.trim() : 'Listen Now'
    const ctaSearchVisible = body.ctaSearchVisible !== false
    const ctaSearchLabel = typeof body.ctaSearchLabel === 'string' ? body.ctaSearchLabel.trim() : 'Search Music'

    // SEO metadata
    const metaTitle = typeof body.metaTitle === 'string' ? body.metaTitle.trim() : ''
    const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim() : ''

    // Update home.yaml: hero section + root-level SEO
    const homeData = readYamlSafe(HOME_CONFIG_PATH)
    if (Array.isArray(homeData.sections)) {
      const heroSection = homeData.sections.find((s) => s?.block?.discriminant === 'hero')
      if (heroSection?.block?.value) {
        if (heroTagline) heroSection.block.value.heroTagline = heroTagline
        heroSection.block.value.heroTaglineAsBlockquote = heroTaglineAsBlockquote
        heroSection.block.value.heroTaglineCitation = heroTaglineCitation || ''

        // CTA actions
        if (!heroSection.block.value.actions) heroSection.block.value.actions = {}
        heroSection.block.value.actions.listenNow = {
          visible: ctaListenVisible,
          label: ctaListenLabel,
        }
        heroSection.block.value.actions.searchMusic = {
          visible: ctaSearchVisible,
          label: ctaSearchLabel,
        }
      }
    }

    // SEO metadata at root level
    if (metaTitle) homeData.metaTitle = metaTitle
    if (metaDescription) homeData.metaDescription = metaDescription

    writeYaml(HOME_CONFIG_PATH, homeData)

    // Update theme-library.yaml: hero layout mode
    const validModes = new Set(['columns', 'stacked', 'text-only', 'image-only', 'centered-image'])
    const validPositions = new Set(['left', 'right'])
    if (validModes.has(heroLayout)) {
      try {
        const themeData = readYamlSafe(THEME_CONFIG_PATH)
        if (!themeData.homeHero) themeData.homeHero = {}
        if (!themeData.homeHero.layout) themeData.homeHero.layout = {}
        themeData.homeHero.layout.mode = heroLayout
        if (validPositions.has(heroImagePosition)) {
          themeData.homeHero.layout.columnsImagePosition = heroImagePosition
        }
        writeYaml(THEME_CONFIG_PATH, themeData)
      } catch (layoutErr) {
        console.error('[setup] Failed to update theme.yaml hero layout:', layoutErr.message)
      }
    }

    console.log(`[setup] Homepage saved (layout: ${heroLayout}, CTA: listen=${ctaListenVisible}, search=${ctaSearchVisible})`)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save homepage config: ' + err.message })
  }
}

// ─── API handler: Forms ─────────────────────────────────────────────────────

async function handleForms(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)

    // Contact form config
    const contactFormEnabled = body.contactFormEnabled === true
    const contactWebhookUrl = typeof body.contactWebhookUrl === 'string' ? body.contactWebhookUrl.trim() : ''

    const contactData = readYamlSafe(CONTACT_CONFIG_PATH)
    contactData.contactFormEnabled = contactFormEnabled
    contactData.contactWebhookUrl = contactWebhookUrl
    writeYaml(CONTACT_CONFIG_PATH, contactData)

    // Perusal access config
    const perusalGatingEnabled = body.perusalGatingEnabled === true
    const perusalWebhookUrl = typeof body.perusalWebhookUrl === 'string' ? body.perusalWebhookUrl.trim() : ''
    const perusalTokenSecret = typeof body.perusalTokenSecret === 'string' ? body.perusalTokenSecret.trim() : ''
    const perusalTokenExpirationDays =
      typeof body.perusalTokenExpirationDays === 'number' && body.perusalTokenExpirationDays >= 1
        ? Math.round(body.perusalTokenExpirationDays)
        : 90

    const perusalData = readYamlSafe(PERUSAL_ACCESS_CONFIG_PATH)
    perusalData.gatingEnabled = perusalGatingEnabled
    perusalData.webhookUrl = perusalWebhookUrl
    if (perusalTokenSecret) perusalData.tokenSecret = perusalTokenSecret
    perusalData.tokenExpirationDays = perusalTokenExpirationDays
    writeYaml(PERUSAL_ACCESS_CONFIG_PATH, perusalData)

    console.log(`[setup] Forms saved: contact=${contactFormEnabled}, perusal-gating=${perusalGatingEnabled}`)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save forms config: ' + err.message })
  }
}

// ─── API handler: File Upload ───────────────────────────────────────────────

async function handleUpload(req, res, rawUrl) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'PUT') { methodNotAllowed(res, 'PUT, OPTIONS'); return }

  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const dest = url.searchParams.get('dest') || ''

    // Validate destination path
    const ALLOWED_PREFIXES = ['pages/about/', 'works/', 'branding/']
    const isAllowed = ALLOWED_PREFIXES.some((prefix) => dest.startsWith(prefix))
    if (!dest || !isAllowed) {
      sendJson(res, 400, { ok: false, error: 'Invalid upload destination.' })
      return
    }

    // Prevent path traversal
    const resolved = path.resolve(SOURCE_DIR, dest)
    if (!resolved.startsWith(SOURCE_DIR)) {
      sendJson(res, 400, { ok: false, error: 'Invalid path.' })
      return
    }

    const destDir = path.dirname(resolved)
    fs.mkdirSync(destDir, { recursive: true })

    const fileBuffer = await readRawBody(req)
    fs.writeFileSync(resolved, fileBuffer)

    console.log(`[setup] File uploaded: ${dest} (${fileBuffer.length} bytes)`)
    sendJson(res, 200, { ok: true, path: dest, size: fileBuffer.length })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to upload file: ' + err.message })
  }
}

// ─── API handler: Branding ──────────────────────────────────────────────────

async function handleBranding(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const logoMode = typeof body.logoMode === 'string' ? body.logoMode.trim() : 'text'
    const faviconMode = typeof body.faviconMode === 'string' ? body.faviconMode.trim() : 'generated'
    const socialPreviewMode = typeof body.socialPreviewMode === 'string' ? body.socialPreviewMode.trim() : 'generated'

    // Update brand-logo.yaml with mode
    const brandData = readYamlSafe(BRAND_LOGO_CONFIG_PATH)
    if (logoMode === 'custom') {
      brandData.mode = 'custom'
    } else {
      brandData.mode = 'text'
    }
    writeYaml(BRAND_LOGO_CONFIG_PATH, brandData)

    // Favicon: generate or clean up stale files after custom upload
    if (faviconMode === 'custom') {
      // When a custom favicon was uploaded, remove stale files of the other format
      // so the browser doesn't show the old auto-generated one alongside the new custom one.
      const faviconFormat = typeof body.faviconFormat === 'string' ? body.faviconFormat : ''
      const brandingDir = path.join(SOURCE_DIR, 'branding')
      if (faviconFormat === 'svg') {
        // User uploaded SVG — remove stale PNG
        const stalePng = path.join(brandingDir, 'favicon-96x96.png')
        if (fs.existsSync(stalePng)) fs.unlinkSync(stalePng)
      } else {
        // User uploaded PNG — remove stale SVG
        const staleSvg = path.join(brandingDir, 'favicon.svg')
        if (fs.existsSync(staleSvg)) fs.unlinkSync(staleSvg)
      }
    }
    if (faviconMode === 'generated') {
      try {
        const { generateFaviconSvg } = await import('./generate-favicon-svg.mjs')

        const firstName = brandData.firstName || ''
        const lastName = brandData.lastName || ''
        let initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase()

        // Fall back to site config if initials are empty
        if (!initials) {
          const siteData = readYamlSafe(SITE_CONFIG_PATH)
          const parts = (siteData.composerName || '').trim().split(/\s+/)
          initials = ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || '?'
        }

        // Read theme branding defaults from preset
        const brandingDefaults = getThemeBrandingDefaults()
        const faviconOptions = {}
        if (brandingDefaults.faviconBackground) {
          faviconOptions.background = brandingDefaults.faviconBackground
          faviconOptions.color = brandingDefaults.faviconText
          faviconOptions.radius = brandingDefaults.faviconRadius
        }

        const svg = generateFaviconSvg(initials, faviconOptions)
        const faviconPath = path.join(SOURCE_DIR, 'branding', 'favicon.svg')
        fs.mkdirSync(path.dirname(faviconPath), { recursive: true })
        fs.writeFileSync(faviconPath, svg, 'utf8')
        console.log(`[setup] Generated favicon.svg (initials: ${initials})`)
      } catch (err) {
        console.error('[setup] Failed to generate favicon:', err.message)
      }
    }

    // Generate social preview if using generated mode
    if (socialPreviewMode === 'generated') {
      try {
        const { buildGenericSocialPreviewSvg } = await import('./generate-social-preview-svg.mjs')

        const siteData = readYamlSafe(SITE_CONFIG_PATH)
        const composerName = siteData.composerName || 'Composer'
        const siteUrl = siteData.siteUrl || ''

        const brandingDefaults2 = getThemeBrandingDefaults()
        const svgOptions = { siteUrl }
        if (brandingDefaults2.socialGradientStart) {
          svgOptions.gradientStart = brandingDefaults2.socialGradientStart
          svgOptions.gradientEnd = brandingDefaults2.socialGradientEnd
          svgOptions.textColor = brandingDefaults2.socialText
          svgOptions.mutedColor = brandingDefaults2.socialMuted
        }

        const svg = buildGenericSocialPreviewSvg(composerName, svgOptions)
        const socialPath = path.resolve('public/social-preview-image.svg')
        fs.writeFileSync(socialPath, svg, 'utf8')
        console.log(`[setup] Generated social-preview-image.svg`)
      } catch (err) {
        console.error('[setup] Failed to generate social preview:', err.message)
      }
    }

    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message })
  }
}

// ─── API handler: Favicon Preview (GET) ─────────────────────────────────────

async function handleFaviconPreview(req, res, rawUrl) {
  if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }

  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const firstName = url.searchParams.get('firstName') || ''
    const lastName = url.searchParams.get('lastName') || ''
    const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?'

    const { generateFaviconSvg } = await import('./generate-favicon-svg.mjs')

    // Read theme branding defaults from preset
    const brandingDefaults = getThemeBrandingDefaults()
    const faviconOptions = {}
    if (brandingDefaults.faviconBackground) {
      faviconOptions.background = brandingDefaults.faviconBackground
      faviconOptions.color = brandingDefaults.faviconText
      faviconOptions.radius = brandingDefaults.faviconRadius
    }

    const svg = generateFaviconSvg(initials, faviconOptions)
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(svg)
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message })
  }
}

// ─── API handler: Social Preview (GET) ──────────────────────────────────────

async function handleSocialPreview(req, res, rawUrl) {
  if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }

  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const composerName = url.searchParams.get('name') || 'Composer'
    const siteUrl = url.searchParams.get('url') || ''

    const { buildGenericSocialPreviewSvg } = await import('./generate-social-preview-svg.mjs')

    // Read theme branding defaults from preset
    const brandingDefaults = getThemeBrandingDefaults()
    const svgOptions = { siteUrl }
    if (brandingDefaults.socialGradientStart) {
      svgOptions.gradientStart = brandingDefaults.socialGradientStart
      svgOptions.gradientEnd = brandingDefaults.socialGradientEnd
      svgOptions.textColor = brandingDefaults.socialText
      svgOptions.mutedColor = brandingDefaults.socialMuted
    }

    const svg = buildGenericSocialPreviewSvg(composerName, svgOptions)
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(svg)
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message })
  }
}

// ─── API handler: About Page ────────────────────────────────────────────────

async function handleAbout(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const profileImageAlt = typeof body.profileImageAlt === 'string' ? body.profileImageAlt.trim() : ''
    const aboutBody = typeof body.body === 'string' ? body.body.trim() : ''
    const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim() : ''

    const siteData = readYamlSafe(SITE_CONFIG_PATH)
    const composerName = siteData.composerName || 'FirstName LastName'

    fs.mkdirSync(path.dirname(ABOUT_CONFIG_PATH), { recursive: true })
    const aboutData = readYamlSafe(ABOUT_CONFIG_PATH)

    aboutData.metaTitle = `About ${composerName}`
    if (metaDescription) {
      aboutData.metaDescription = metaDescription
    } else if (!aboutData.metaDescription) {
      aboutData.metaDescription = `About composer ${composerName}: artistic background, compositional voice, and current work.`
    }
    if (!aboutData.searchResultText) {
      aboutData.searchResultText = `About ${composerName}: composer writing contemporary concert and chamber music.`
    }
    if (profileImageAlt) aboutData.profileImageAlt = profileImageAlt
    if (aboutBody) aboutData.body = aboutBody

    writeYaml(ABOUT_CONFIG_PATH, aboutData)

    console.log(`[setup] About page saved`)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save about page: ' + err.message })
  }
}

// ─── API handler: Work ──────────────────────────────────────────────────────

async function handleWork(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const addFirstWork = body.addFirstWork !== false // default true
    const includeStarters = body.includeStarters !== false // default true
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const thumbnailAlt = typeof body.thumbnailAlt === 'string' ? body.thumbnailAlt.trim() : ''
    const thumbnailUploaded = body.thumbnailUploaded === true
    const hasRecording = body.hasRecording === true
    const recordingFolder = typeof body.recordingFolder === 'string' ? body.recordingFolder.trim() : ''
    const instrumentation = Array.isArray(body.instrumentation) ? body.instrumentation.filter(s => typeof s === 'string' && s.trim()) : []
    const youtubeUrl = typeof body.youtubeUrl === 'string' ? body.youtubeUrl.trim() : ''
    const sheetMusicUrl = typeof body.sheetMusicUrl === 'string' ? body.sheetMusicUrl.trim() : ''

    const removeStarterWorksIfNeeded = () => {
      if (!includeStarters) {
        const worksDir = path.join(SOURCE_DIR, 'works')
        const exampleDirs = ['example-chamber-piece', 'example-solo-with-recording']
        for (const dir of exampleDirs) {
          const examplePath = path.join(worksDir, dir)
          if (fs.existsSync(examplePath)) {
            fs.rmSync(examplePath, { recursive: true, force: true })
            console.log(`[setup] Removed starter work: ${dir}`)
          }
        }
      }
    }

    if (!addFirstWork) {
      removeStarterWorksIfNeeded()
      sendJson(res, 200, { ok: true, skipped: true })
      return
    }

    if (!title || !slug) {
      sendJson(res, 400, { ok: false, error: 'title and slug are required when adding a work.' })
      return
    }
    if (!description) {
      sendJson(res, 400, { ok: false, error: 'description is required when adding a work.' })
      return
    }
    if (!thumbnailUploaded) {
      sendJson(res, 400, { ok: false, error: 'thumbnail image is required when adding a work.' })
      return
    }
    if (youtubeUrl && !isValidHttpUrl(youtubeUrl)) {
      sendJson(res, 400, { ok: false, error: 'youtubeUrl must be a valid URL (http/https).' })
      return
    }
    if (sheetMusicUrl && !isValidHttpUrl(sheetMusicUrl)) {
      sendJson(res, 400, { ok: false, error: 'sheetMusicUrl must be a valid URL (http/https).' })
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const workData = {
      title,
      subtitle: subtitle || '',
      description,
      thumbnail: { alt: thumbnailAlt || title, crop: '' },
      completionDate: today,
      duration: '',
      difficulty: '',
      tags: [],
      instrumentation,
      searchKeywords: [],
      selected: true,
      selectedOrder: 1,
      recordings: [],
      performances: [],
      sheetMusic: [],
    }

    if (hasRecording && recordingFolder) {
      workData.recordings.push({
        folder: recordingFolder,
        performers: [],
        date: today,
        duration: '',
        youtubeUrl: youtubeUrl || '',
        photo: { alt: '' },
        featuredRecording: true,
        movements: [],
      })
    } else if (youtubeUrl) {
      workData.recordings.push({
        folder: '',
        performers: [],
        date: today,
        duration: '',
        youtubeUrl,
        photo: { alt: '' },
        featuredRecording: true,
        movements: [],
      })
    }

    if (sheetMusicUrl) {
      workData.sheetMusic.push(sheetMusicUrl)
    }

    const workDir = path.join(SOURCE_DIR, 'works', slug)
    fs.mkdirSync(workDir, { recursive: true })
    writeYaml(path.join(workDir, 'work.yaml'), workData)

    // Handle starter templates
    removeStarterWorksIfNeeded()

    console.log(`[setup] Work created: ${slug}`)
    sendJson(res, 200, { ok: true, slug })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to create work: ' + err.message })
  }
}

// ─── API handler: Deploy ────────────────────────────────────────────────────

async function handleDeploy(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  try {
    const body = await readJsonBody(req)
    const sftpHost = typeof body.sftpHost === 'string' ? body.sftpHost.trim() : ''
    const sftpUser = typeof body.sftpUser === 'string' ? body.sftpUser.trim() : ''
    const sftpRemotePath = typeof body.sftpRemotePath === 'string' ? body.sftpRemotePath.trim() : '/public_html'
    const sftpPort = typeof body.sftpPort === 'number' && body.sftpPort > 0 ? body.sftpPort : 22

    const deployData = {
      sftpHost,
      sftpUser,
      sftpRemotePath,
      sftpPrivateRemotePath: '',
      sftpPort,
    }

    writeYaml(DEPLOY_CONFIG_PATH, deployData)

    console.log(`[setup] Deploy config saved: ${sftpHost}`)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Failed to save deploy config: ' + err.message })
  }
}

// ─── API handler: Finalize ──────────────────────────────────────────────────

async function handleFinalize(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { methodNotAllowed(res, 'POST, OPTIONS'); return }

  // In standalone mode, run the full pipeline SYNCHRONOUSLY and respond with result.
  // This mirrors what `npm run dev:full` would do: ingest:works → generate:data scripts.
  try {
    console.log('[setup] Running full content pipeline…')

    // 1. Ingest works (source/works/ → src/content/works/ MDX files)
    console.log('[setup]   → ingest-works.mjs')
    await spawnScript(path.join(ROOT, 'scripts', 'ingest-works.mjs'))

    // 2. Generate works images (thumbnails for work cards)
    console.log('[setup]   → generate-works-images.mjs')
    await spawnScript(path.join(ROOT, 'scripts', 'generate-works-images.mjs'))

    // 3. Generate perusal scores (perusal score manifest for SiteLayout)
    console.log('[setup]   → generate-perusal-scores.mjs')
    await spawnScript(path.join(ROOT, 'scripts', 'generate-perusal-scores.mjs'))

    // 4. Generate page search index (powers the global search)
    console.log('[setup]   → generate-page-search-index.mjs')
    await spawnScript(path.join(ROOT, 'scripts', 'generate-page-search-index.mjs'))

    console.log('[setup] Full content pipeline complete.')

    sendJson(res, 200, { ok: true })

    // Auto-exit after a short delay so the Done page renders in the browser
    console.log('\n  \u2713 Setup complete! Starting dev server\u2026\n')
    setTimeout(() => process.exit(0), 3000)
  } catch (err) {
    console.error('[setup] Pipeline error:', err.message)
    sendJson(res, 500, { ok: false, error: 'Pipeline failed: ' + err.message })
  }
}

// ─── Main server ────────────────────────────────────────────────────────────

async function main() {
  console.log('  Compiling wizard assets\u2026')

  // Compile assets and load config in parallel
  const [css, js, presetsModule] = await Promise.all([
    compileWizardCss(),
    compileWizardJs(),
    loadPresets(),
  ])

  // Read template
  const templatePath = path.join(__dirname, 'setup', 'wizard-template.html')
  const template = fs.readFileSync(templatePath, 'utf8')

  // Read all config YAML
  const config = readAllConfigData()

  // Build the complete HTML page
  const wizardHtml = buildWizardHtml(template, css, js, presetsModule, config)

  // Create server
  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/'
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    try {
      // ── Serve wizard page ──────────────────────────────────────────
      if (pathname === '/' || pathname === '/index.html') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(wizardHtml)
        return
      }

      // ── Serve hero images ──────────────────────────────────────────
      if (pathname.startsWith('/heroes/')) {
        const relativePath = pathname.slice('/heroes/'.length)
        const filePath = path.join(HEROES_DIR, relativePath)
        // Prevent path traversal
        if (!filePath.startsWith(HEROES_DIR)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase()
          const mimeTypes = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.webp': 'image/webp',
          }
          res.statusCode = 200
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-cache')
          fs.createReadStream(filePath).pipe(res)
          return
        }
        res.statusCode = 404
        res.end('Not found')
        return
      }

      // ── API routes ─────────────────────────────────────────────────
      if (pathname === '/api/dev/setup/identity') { await handleIdentity(req, res); return }
      if (pathname === '/api/dev/theme/preset') { await handleThemePreset(req, res); return }
      if (pathname === '/api/dev/setup/branding') { await handleBranding(req, res); return }
      if (pathname === '/api/dev/setup/favicon-preview') { await handleFaviconPreview(req, res, rawUrl); return }
      if (pathname === '/api/dev/setup/social-preview') { await handleSocialPreview(req, res, rawUrl); return }
      if (pathname === '/api/dev/hero-preference') { await handleHeroPreference(req, res); return }
      if (pathname === '/api/dev/setup/homepage') { await handleHomepage(req, res); return }
      if (pathname === '/api/dev/setup/about') { await handleAbout(req, res); return }
      if (pathname === '/api/dev/setup/work') { await handleWork(req, res); return }
      if (pathname === '/api/dev/setup/social') { await handleSocial(req, res); return }
      if (pathname === '/api/dev/setup/forms') { await handleForms(req, res); return }
      if (pathname === '/api/dev/setup/deploy') { await handleDeploy(req, res); return }
      if (pathname === '/api/dev/setup/upload') { await handleUpload(req, res, rawUrl); return }
      if (pathname === '/api/dev/setup/finalize') { await handleFinalize(req, res); return }

      // ── 404 ────────────────────────────────────────────────────────
      res.statusCode = 404
      res.end('Not found')
    } catch (err) {
      console.error('[setup-server] Error:', err)
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'Internal server error' })
      }
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/`
    console.log(`\n  Setup wizard running at ${url}\n`)
    console.log('  Complete all steps, then the dev server will start automatically.\n')

    if (SETUP_AUTO_OPEN) {
      // Auto-open browser (disabled in tests with SETUP_AUTO_OPEN=0)
      const openCmd = process.platform === 'darwin'
        ? ['open', url]
        : process.platform === 'win32'
          ? ['cmd', '/c', 'start', url]
          : ['xdg-open', url]
      spawn(openCmd[0], openCmd.slice(1), { stdio: 'ignore', detached: true }).unref()
    }
  })
}

main().catch((err) => {
  console.error('Failed to start setup wizard server:', err)
  process.exit(1)
})
