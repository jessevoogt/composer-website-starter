// Astro integration: embeds Keystatic CMS and dev tools into Astro's Vite server.
// Replaces the former standalone Keystatic server (scripts/keystatic-server.mjs)
// by registering all functionality as Vite plugins that run on the same port as Astro.
//
// The critical trick: Astro's trailingSlash:'always' middleware uses stack.unshift()
// to insert itself at the front of the Vite middleware stack. We also use unshift()
// in the configureServer return callback — because integration plugins resolve after
// Astro's internal plugins, our unshift goes to the very front, running BEFORE the
// trailing slash middleware. This avoids the original conflict that forced Keystatic
// onto a separate port.

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import crypto from 'node:crypto'
import { spawn, execSync } from 'child_process'
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic'
import { getAllowedDirectories } from '@keystatic/core/api/utils'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const KEYSTATIC_CACHE_NAMESPACE_STORAGE_KEY = 'jv-keystatic-project-namespace'
const KEYSTATIC_CACHE_NAMESPACE = crypto.createHash('sha1').update(ROOT).digest('hex')
const KEYSTATIC_POST_SETUP_RESET_MARKER_PATH = path.join(ROOT, '.keystatic-post-setup-reset')
const SOURCE_DIR = path.join(ROOT, 'source')
const HEROES_DIR = path.join(SOURCE_DIR, 'heroes')
const HERO_PREFERRED_API_PATH = '/api/dev/hero-preference'
const THEME_PRESET_API_PATH = '/api/dev/theme/preset'
const THEME_LIBRARY_API_PATH = '/api/dev/theme/library'
const THEME_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'theme.yaml')
const THEME_SELECTION_PATH = path.join(SOURCE_DIR, 'site', 'theme-selection.yaml')
const THEME_LIBRARY_PATH = path.join(SOURCE_DIR, 'site', 'theme-library.yaml')
const THEME_COLOR_KEYS = [
  'colorBackground',
  'colorBackgroundSoft',
  'colorText',
  'colorTextMuted',
  'colorAccent',
  'colorAccentStrong',
  'colorButton',
  'colorButtonText',
]
const VALID_BORDER_RADIUS = new Set(['none', 'subtle', 'soft', 'rounded', 'round', 'pill'])
const HERO_PREFERENCE_PAGE_KEYS = new Set([
  'home',
  'contact',
  'about',
  'music',
  'music-browse',
  'music-browse-tag',
  'work-detail',
  'not-found',
  'accessibility-statement',
  'sitemap',
  'perusal-access-granted',
  'perusal-thank-you',
  'contact-thank-you',
])
const WORK_DETAIL_PREFERENCE_SCOPES = new Set(['this-work', 'all-work-pages'])
const SETUP_IDENTITY_API_PATH = '/api/dev/setup/identity'
const SETUP_SOCIAL_API_PATH = '/api/dev/setup/social'
const SETUP_HOMEPAGE_API_PATH = '/api/dev/setup/homepage'
const SETUP_FORMS_API_PATH = '/api/dev/setup/forms'
const SETUP_ABOUT_API_PATH = '/api/dev/setup/about'
const SETUP_WORK_API_PATH = '/api/dev/setup/work'
const SETUP_UPLOAD_API_PATH = '/api/dev/setup/upload'
const SETUP_DEPLOY_API_PATH = '/api/dev/setup/deploy'
const SETUP_STATUS_API_PATH = '/api/dev/setup/status'
const SETUP_FINALIZE_API_PATH = '/api/dev/setup/finalize'
const SITE_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'site.yaml')
const BRAND_LOGO_CONFIG_PATH = path.join(SOURCE_DIR, 'branding', 'brand-logo.yaml')
const SOCIAL_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'social.yaml')
const COPYRIGHT_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'copyright.yaml')
const HOME_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'home.yaml')
const CONTACT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'contact.yaml')
const PERUSAL_ACCESS_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'perusal-access.yaml')
const ABOUT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml')
const DEPLOY_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'deploy.yaml')
const VALID_SOCIAL_PLATFORMS = new Set([
  'instagram',
  'youtube',
  'facebook',
  'soundcloud',
  'twitter',
  'linkedin',
  'tiktok',
  'bandcamp',
])
const WORKS_SEARCH_HTML_PATH = path.join(ROOT, 'scripts', 'works-search.html')
const IMAGE_EXTS_SEARCH = ['.webp', '.jpg', '.jpeg', '.png', '.tiff']
const DEPLOY_SCRIPT = path.join(ROOT, 'scripts', 'deploy.mjs')
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4323)
const LOCAL_DEV_HOST = process.env.ASTRO_HOST || '127.0.0.1'
const PREVIEW_URL = `http://${LOCAL_DEV_HOST}:${PREVIEW_PORT}/`
const ASTRO_PORT = Number(process.env.ASTRO_PORT || 4321)
const TREE_SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.astro', 'dist', '.starter-kit'])

// Read homepage URL from package.json for the "Live" toolbar button
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const LIVE_URL = pkg.homepage || ''

// ─── Shared state ────────────────────────────────────────────────────────────

let buildRunning = false
let publishRunning = false
let previewProcess = null

// ─── Helper: spawn a Node script ─────────────────────────────────────────────

function spawnScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], { stdio: 'inherit', cwd: ROOT })
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
}

// ─── Helper: read JSON body from a Connect request ───────────────────────────

function readJsonRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

// ─── Helper: read raw body as Buffer ─────────────────────────────────────────

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function markKeystaticPostSetupReset() {
  try {
    fs.writeFileSync(KEYSTATIC_POST_SETUP_RESET_MARKER_PATH, String(Date.now()), 'utf8')
  } catch (err) {
    console.warn('[setup] Failed to mark Keystatic reset:', err.message)
  }
}

function consumeKeystaticPostSetupResetMarker() {
  try {
    fs.unlinkSync(KEYSTATIC_POST_SETUP_RESET_MARKER_PATH)
    return true
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('[keystatic] Failed to consume setup reset marker:', err.message)
    }
    return false
  }
}

function toGitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8')
  return crypto
    .createHash('sha1')
    .update(header)
    .update(buffer)
    .digest('hex')
}

function normalizeDirectoryPath(dirPath) {
  return String(dirPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

function makeTreeNode(name, relPath) {
  return { type: 'tree', name, relPath, children: new Map(), sha: '' }
}

async function buildKeystaticTreeEntries(baseDir, allowedDirectories) {
  const roots = [...new Set((allowedDirectories || []).map(normalizeDirectoryPath).filter(Boolean))].sort(
    (a, b) => a.length - b.length,
  )
  const scanRoots = []
  for (const dirPath of roots) {
    if (!scanRoots.some((rootPath) => dirPath === rootPath || dirPath.startsWith(`${rootPath}/`))) {
      scanRoots.push(dirPath)
    }
  }

  const rootNode = makeTreeNode('', '')

  function ensureTreePath(parts) {
    let node = rootNode
    let relPath = ''
    for (const part of parts) {
      relPath = relPath ? `${relPath}/${part}` : part
      const existing = node.children.get(part)
      if (existing && existing.type === 'tree') {
        node = existing
        continue
      }
      const created = makeTreeNode(part, relPath)
      node.children.set(part, created)
      node = created
    }
    return node
  }

  function addBlobEntry(relPath, sha) {
    const normalized = normalizeDirectoryPath(relPath)
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length === 0) return
    const name = parts[parts.length - 1]
    const parent = ensureTreePath(parts.slice(0, -1))
    parent.children.set(name, { type: 'blob', name, relPath: normalized, sha })
  }

  async function scanDirectory(relDir) {
    const absDir = path.join(baseDir, relDir)
    let dirEntries = []
    try {
      dirEntries = await fs.promises.readdir(absDir, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    dirEntries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of dirEntries) {
      if (!entry.isDirectory() && !entry.isFile()) continue
      if (entry.isDirectory() && TREE_SCAN_SKIP_DIRS.has(entry.name)) continue

      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        ensureTreePath(normalizeDirectoryPath(relPath).split('/').filter(Boolean))
        await scanDirectory(relPath)
        continue
      }

      const content = await fs.promises.readFile(path.join(baseDir, relPath))
      addBlobEntry(relPath, toGitBlobSha(content))
    }
  }

  async function scanRootPath(relPath) {
    const absPath = path.join(baseDir, relPath)
    let stats = null
    try {
      stats = await fs.promises.stat(absPath)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (stats.isDirectory()) {
      ensureTreePath(normalizeDirectoryPath(relPath).split('/').filter(Boolean))
      await scanDirectory(relPath)
      return
    }
    if (stats.isFile()) {
      const content = await fs.promises.readFile(absPath)
      addBlobEntry(relPath, toGitBlobSha(content))
    }
  }

  for (const rootPath of scanRoots) {
    await scanRootPath(rootPath)
  }

  function finalizeTreeSha(node) {
    const childNodes = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
    const hash = crypto.createHash('sha1')
    for (const child of childNodes) {
      const childSha = child.type === 'tree' ? finalizeTreeSha(child) : child.sha
      const mode = child.type === 'tree' ? '040000' : '100644'
      hash.update(`${mode} ${child.name}\0${childSha}\n`, 'utf8')
    }
    node.sha = hash.digest('hex')
    return node.sha
  }

  finalizeTreeSha(rootNode)

  const flatEntries = []
  function flatten(node) {
    const childNodes = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
    for (const child of childNodes) {
      flatEntries.push({
        path: child.relPath,
        mode: child.type === 'tree' ? '040000' : '100644',
        type: child.type === 'tree' ? 'tree' : 'blob',
        sha: child.sha,
      })
      if (child.type === 'tree') flatten(child)
    }
  }
  flatten(rootNode)

  return flatEntries
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

// ─── Hero Preference helpers ─────────────────────────────────────────────────

function resolvePreferredHeroConfigPath(pageKey) {
  switch (pageKey) {
    case 'contact':
      return path.join(SOURCE_DIR, 'pages', 'contact.yaml')
    case 'about':
      return path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml')
    case 'music':
      return path.join(SOURCE_DIR, 'pages', 'music.yaml')
    case 'music-browse':
      return path.join(SOURCE_DIR, 'pages', 'music-browse.yaml')
    case 'music-browse-tag':
      return path.join(SOURCE_DIR, 'pages', 'music-browse-tag.yaml')
    case 'work-detail':
      return path.join(SOURCE_DIR, 'pages', 'work-detail.yaml')
    case 'not-found':
      return path.join(SOURCE_DIR, 'pages', 'not-found.yaml')
    case 'accessibility-statement':
      return path.join(SOURCE_DIR, 'pages', 'accessibility-statement.yaml')
    case 'sitemap':
      return path.join(SOURCE_DIR, 'pages', 'sitemap.yaml')
    case 'perusal-access-granted':
      return path.join(SOURCE_DIR, 'pages', 'perusal-access-granted.yaml')
    case 'perusal-thank-you':
      return path.join(SOURCE_DIR, 'pages', 'perusal-thank-you.yaml')
    case 'contact-thank-you':
      return path.join(SOURCE_DIR, 'pages', 'contact-thank-you.yaml')
    case 'home':
    default:
      return path.join(SOURCE_DIR, 'pages', 'home.yaml')
  }
}

function listHeroIds() {
  if (!fs.existsSync(HEROES_DIR)) return []
  return fs
    .readdirSync(HEROES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

function upsertPreferredHeroInYaml(content, preferredHeroId) {
  const lines = content.length > 0 ? content.replace(/\r\n/g, '\n').split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  // Match preferredHeroId at any indentation level so this works for both
  // top-level files (e.g. contact.yaml) and consolidated files (home.yaml)
  // where the field is nested under sections[].block.value.
  const existingLineIndex = lines.findIndex((entry) => /^\s*preferredHeroId:\s*/.test(entry))

  if (existingLineIndex >= 0) {
    const match = lines[existingLineIndex].match(/^(\s*)preferredHeroId:/)
    const indent = match ? match[1] : ''
    lines[existingLineIndex] = preferredHeroId
      ? `${indent}preferredHeroId: ${preferredHeroId}`
      : `${indent}preferredHeroId: null`
  } else {
    lines.push(preferredHeroId ? `preferredHeroId: ${preferredHeroId}` : 'preferredHeroId: null')
  }

  const normalized = lines.join('\n')
  return normalized.length > 0 ? `${normalized}\n` : ''
}

function normalizeThemeScalar(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeThemeCustomCss(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').trim()
}

function createDefaultThemeHomeHero(themeId = '') {
  const base = {
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

function createDefaultThemeAboutPage() {
  return {
    position: 'center',
    maxWidth: 'full',
    profileImagePosition: 'center',
  }
}

function normalizeThemeAboutPage(input) {
  const defaults = createDefaultThemeAboutPage()
  const record = input && typeof input === 'object' ? input : {}
  const gridPosition = normalizeThemeScalar(record.position) || defaults.position
  const gridMaxWidth = normalizeThemeScalar(record.maxWidth) || defaults.maxWidth
  const position = normalizeThemeScalar(record.profileImagePosition) || defaults.profileImagePosition

  return {
    position: ['left', 'center', 'right'].includes(gridPosition) ? gridPosition : defaults.position,
    maxWidth: ['compact', 'standard', 'full'].includes(gridMaxWidth) ? gridMaxWidth : defaults.maxWidth,
    profileImagePosition: [
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ].includes(position)
      ? position
      : defaults.profileImagePosition,
  }
}

function createDefaultThemeContactPage() {
  return {
    position: 'center',
    maxWidth: 'default',
  }
}

function normalizeThemeContactPage(input) {
  const defaults = createDefaultThemeContactPage()
  const record = input && typeof input === 'object' ? input : {}
  const position = normalizeThemeScalar(record.position) || defaults.position
  const maxWidth = normalizeThemeScalar(record.maxWidth) || defaults.maxWidth

  return {
    position: ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right'].includes(position)
      ? position
      : defaults.position,
    maxWidth: ['compact', 'default', 'wide'].includes(maxWidth) ? maxWidth : defaults.maxWidth,
  }
}

function normalizeThemeHomeHero(input, themeId = '') {
  const defaults = createDefaultThemeHomeHero(themeId)
  const record = input && typeof input === 'object' ? input : {}
  const layout = record.layout && typeof record.layout === 'object' ? record.layout : {}
  const legacyLayoutValue = layout.value && typeof layout.value === 'object' ? layout.value : {}
  const typography = record.typography && typeof record.typography === 'object' ? record.typography : {}
  const divider = record.divider && typeof record.divider === 'object' ? record.divider : {}
  const actions = record.actions && typeof record.actions === 'object' ? record.actions : {}

  const normalizeLayoutMode = (value, fallback = 'columns') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return ['columns', 'stacked', 'text-only', 'image-only', 'centered-image'].includes(normalized)
      ? normalized
      : 'columns'
  }

  const normalizeImagePosition = (value, fallback = 'left') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return normalized === 'right' ? 'right' : 'left'
  }

  const normalizeColumnSplit = (value, fallback = 'text-wide') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return ['text-wide', 'balanced', 'image-wide'].includes(normalized) ? normalized : 'text-wide'
  }

  const normalizeStackedImageOrder = (value, fallback = 'first') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return normalized === 'second' ? 'second' : 'first'
  }

  const normalizeScale = (value, fallback = 'default') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return ['small', 'default', 'large', 'dramatic'].includes(normalized) ? normalized : 'default'
  }

  const normalizeActionStyle = (value, fallback = 'theme-default') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return ['theme-default', 'outline', 'solid', 'inline'].includes(normalized) ? normalized : 'theme-default'
  }

  const normalizeGlow = (value, fallback = 'none') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return ['none', 'subtle', 'medium', 'strong'].includes(normalized) ? normalized : 'none'
  }

  const normalizeGlowSide = (value, fallback = 'balanced') => {
    const normalized = normalizeThemeScalar(value) || fallback
    return normalized === 'content' || normalized === 'image' ? normalized : 'balanced'
  }

  const parsedWidth = Number.parseInt(normalizeThemeScalar(divider.widthPx), 10)
  const widthPx =
    typeof divider.widthPx === 'number' && Number.isFinite(divider.widthPx)
      ? divider.widthPx
      : Number.isFinite(parsedWidth)
        ? parsedWidth
        : defaults.divider.widthPx

  return {
    mirrorImage:
      typeof record.mirrorImage === 'boolean'
        ? record.mirrorImage
        : Object.prototype.hasOwnProperty.call(record, 'mirrorImage')
          ? normalizeThemeBoolean(record.mirrorImage)
          : defaults.mirrorImage,
    layout: {
      mode: normalizeLayoutMode(layout.mode || layout.discriminant, defaults.layout.mode),
      columnsImagePosition: normalizeImagePosition(
        layout.columnsImagePosition || layout.imagePosition || legacyLayoutValue.imagePosition,
        defaults.layout.columnsImagePosition,
      ),
      columnSplit: normalizeColumnSplit(
        layout.columnSplit || layout.split || legacyLayoutValue.split,
        defaults.layout.columnSplit,
      ),
      stackedImageOrder: normalizeStackedImageOrder(
        layout.stackedImageOrder || layout.imageOrder || legacyLayoutValue.imageOrder,
        defaults.layout.stackedImageOrder,
      ),
    },
    typography: {
      titleScale: normalizeScale(typography.titleScale, defaults.typography.titleScale),
      taglineScale: normalizeScale(typography.taglineScale, defaults.typography.taglineScale),
      citationScale: normalizeScale(typography.citationScale, defaults.typography.citationScale),
    },
    divider: {
      visible:
        typeof divider.visible === 'boolean'
          ? divider.visible
          : Object.prototype.hasOwnProperty.call(divider, 'visible')
            ? normalizeThemeBoolean(divider.visible)
            : defaults.divider.visible,
      widthPx: Math.min(6, Math.max(1, Math.round(widthPx))),
      color: normalizeThemeScalar(divider.color) || defaults.divider.color,
      glow: normalizeGlow(divider.glow, defaults.divider.glow),
      glowSide: normalizeGlowSide(divider.glowSide, defaults.divider.glowSide),
    },
    actions: {
      listenNow: normalizeActionStyle(actions.listenNow, defaults.actions.listenNow),
      searchMusic: normalizeActionStyle(actions.searchMusic, defaults.actions.searchMusic),
    },
  }
}

function normalizeThemeBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function normalizeThemeHex(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) return ''
  const hex = match[1]
  if (hex.length === 3)
    return (
      '#' +
      hex
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    )
  return '#' + hex.toLowerCase()
}

function normalizeThemeRecord(input, fallbackId = 'theme') {
  const record = input && typeof input === 'object' ? input : {}
  const colors = record.colors && typeof record.colors === 'object' ? record.colors : {}
  const normalizedColors = {}
  for (const key of THEME_COLOR_KEYS) {
    normalizedColors[key] = normalizeThemeHex(colors[key])
  }

  const borderRadius =
    typeof record.borderRadius === 'string' && VALID_BORDER_RADIUS.has(record.borderRadius.trim())
      ? record.borderRadius.trim()
      : 'none'

  return {
    id: normalizeThemeScalar(record.id) || fallbackId,
    label: normalizeThemeScalar(record.label) || 'Untitled Theme',
    description: normalizeThemeScalar(record.description),
    colors: normalizedColors,
    fontBody: normalizeThemeScalar(record.fontBody) || 'Atkinson Hyperlegible',
    fontHeading: normalizeThemeScalar(record.fontHeading) || 'Gothic A1',
    borderRadius,
    focusRingColor: normalizeThemeHex(record.focusRingColor),
    ctaBackground: normalizeThemeHex(record.ctaBackground),
    ctaText: normalizeThemeHex(record.ctaText),
    navActiveUnderline: normalizeThemeHex(record.navActiveUnderline),
    navActiveText: normalizeThemeHex(record.navActiveText),
    navHoverUnderline: normalizeThemeHex(record.navHoverUnderline),
    navHoverText: normalizeThemeHex(record.navHoverText),
    scrimColor: normalizeThemeHex(record.scrimColor),
    disableImageOverlays: normalizeThemeBoolean(record.disableImageOverlays),
    playerBorderRadius: normalizeThemeScalar(record.playerBorderRadius),
    socialIconBorderRadius: normalizeThemeScalar(record.socialIconBorderRadius),
    profileImageBorderRadius: normalizeThemeScalar(record.profileImageBorderRadius),
    tagBadgeBorderRadius: normalizeThemeScalar(record.tagBadgeBorderRadius),
    customCss: normalizeThemeCustomCss(record.customCss),
    aboutPage: normalizeThemeAboutPage(record.aboutPage),
    contactPage: normalizeThemeContactPage(record.contactPage),
    homeHero: normalizeThemeHomeHero(record.homeHero, normalizeThemeScalar(record.id) || fallbackId),
  }
}

function readThemeLibrary() {
  if (!fs.existsSync(THEME_LIBRARY_PATH)) return []

  try {
    const parsed = yaml.load(fs.readFileSync(THEME_LIBRARY_PATH, 'utf8'))
    const rawThemes = parsed && typeof parsed === 'object' && Array.isArray(parsed.themes) ? parsed.themes : []
    return rawThemes.map((theme, index) => normalizeThemeRecord(theme, `theme-${index + 1}`))
  } catch {
    return []
  }
}

function writeThemeLibrary(themes) {
  const payload = {
    themes: themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      description: theme.description,
      colors: { ...theme.colors },
      fontBody: theme.fontBody,
      fontHeading: theme.fontHeading,
      borderRadius: theme.borderRadius,
      focusRingColor: theme.focusRingColor,
      ctaBackground: theme.ctaBackground,
      ctaText: theme.ctaText,
      navActiveUnderline: theme.navActiveUnderline,
      navActiveText: theme.navActiveText,
      navHoverUnderline: theme.navHoverUnderline,
      navHoverText: theme.navHoverText,
      scrimColor: theme.scrimColor,
      disableImageOverlays: theme.disableImageOverlays === true,
      playerBorderRadius: theme.playerBorderRadius,
      socialIconBorderRadius: theme.socialIconBorderRadius,
      profileImageBorderRadius: theme.profileImageBorderRadius,
      tagBadgeBorderRadius: theme.tagBadgeBorderRadius,
      aboutPage: theme.aboutPage,
      contactPage: theme.contactPage,
      ...(theme.customCss ? { customCss: theme.customCss } : {}),
      homeHero: theme.homeHero,
    })),
  }

  const nextYaml = yaml.dump(payload, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  })
  fs.writeFileSync(THEME_LIBRARY_PATH, nextYaml, 'utf8')
}

function slugifyThemeId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createUniqueThemeId(label, existingThemes) {
  const base = slugifyThemeId(label) || 'theme'
  const existingIds = new Set(existingThemes.map((theme) => theme.id))
  if (!existingIds.has(base)) return base

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

// ─── Slug rename reference updater ───────────────────────────────────────────
// When a Keystatic collection item is renamed (slug change), the CMS renames
// the item's directory but does NOT update relationship fields in other YAML
// files. This module detects slug renames from the /api/keystatic/update
// payload and propagates the change to all referencing YAML files.

const COLLECTION_REFS = {
  'source/heroes/': {
    publicDir: 'public/hero',
    refs: [
      { yamlPath: 'source/pages/home.yaml', fields: ['preferredHeroId', 'fallbackHeroId'] },
      { yamlPath: 'source/pages/contact.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/about/about.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/work-detail.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music-browse.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music-browse-tag.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/not-found.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/accessibility-statement.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/sitemap.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/perusal-access-granted.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/perusal-thank-you.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/contact-thank-you.yaml', fields: ['preferredHeroId'] },
    ],
  },
  'source/works/': {
    publicDir: null,
    refs: [],
  },
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectSlugRename(payload, collectionPrefix) {
  const { additions = [], deletions = [] } = payload

  const addedSlugs = new Set()
  const deletedSlugs = new Set()

  for (const { path: p } of additions) {
    if (p.startsWith(collectionPrefix)) {
      const slug = p.slice(collectionPrefix.length).split('/')[0]
      if (slug) addedSlugs.add(slug)
    }
  }

  for (const { path: p } of deletions) {
    if (p.startsWith(collectionPrefix)) {
      const slug = p.slice(collectionPrefix.length).split('/')[0]
      if (slug) deletedSlugs.add(slug)
    }
  }

  // A rename = exactly one purely-deleted slug + exactly one purely-added slug
  const purelyDeleted = [...deletedSlugs].filter((s) => !addedSlugs.has(s))
  const purelyAdded = [...addedSlugs].filter((s) => !deletedSlugs.has(s))

  if (purelyDeleted.length === 1 && purelyAdded.length === 1) {
    return { oldSlug: purelyDeleted[0], newSlug: purelyAdded[0] }
  }
  return null
}

function updateSlugReferences(oldSlug, newSlug, references) {
  let count = 0
  for (const { yamlPath, fields } of references) {
    const fullPath = path.join(ROOT, yamlPath)
    if (!fs.existsSync(fullPath)) continue

    let content = fs.readFileSync(fullPath, 'utf-8')
    let changed = false

    for (const field of fields) {
      const pattern = new RegExp(`^(\\s*${escapeRegex(field)}:\\s*)${escapeRegex(oldSlug)}\\s*$`, 'gm')
      const replaced = content.replace(pattern, `$1${newSlug}`)
      if (replaced !== content) {
        content = replaced
        changed = true
        count++
        console.log(`[slug-ref]   ${yamlPath}: ${field}: "${oldSlug}" → "${newSlug}"`)
      }
    }

    if (changed) {
      fs.writeFileSync(fullPath, content, 'utf-8')
    }
  }
  return count
}

function migrateRemainingFiles(collectionPrefix, oldSlug, newSlug) {
  const oldDir = path.join(ROOT, collectionPrefix, oldSlug)
  const newDir = path.join(ROOT, collectionPrefix, newSlug)

  if (!fs.existsSync(oldDir)) return 0
  if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })

  const files = fs.readdirSync(oldDir)
  let moved = 0
  for (const file of files) {
    const oldPath = path.join(oldDir, file)
    const newPath = path.join(newDir, file)
    // Only move files Keystatic didn't already place in the new directory
    if (!fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath)
      moved++
      console.log(`[slug-ref]   moved ${collectionPrefix}${oldSlug}/${file} → ${collectionPrefix}${newSlug}/${file}`)
    }
  }

  // Remove old directory if now empty
  try {
    const remaining = fs.readdirSync(oldDir)
    if (remaining.length === 0) {
      fs.rmdirSync(oldDir)
      console.log(`[slug-ref]   removed empty directory ${collectionPrefix}${oldSlug}/`)
    }
  } catch {
    // Directory may already be gone
  }

  return moved
}

function renamePublicDir(publicDir, oldSlug, newSlug) {
  if (!publicDir) return
  const oldDir = path.join(ROOT, publicDir, oldSlug)
  const newDir = path.join(ROOT, publicDir, newSlug)
  if (!fs.existsSync(oldDir)) return
  if (fs.existsSync(newDir)) {
    // Merge: move files from old into new, then remove old
    for (const file of fs.readdirSync(oldDir)) {
      const dest = path.join(newDir, file)
      if (!fs.existsSync(dest)) {
        fs.renameSync(path.join(oldDir, file), dest)
      }
    }
    try {
      fs.rmdirSync(oldDir)
    } catch {
      /* not empty */
    }
  } else {
    fs.renameSync(oldDir, newDir)
  }
  console.log(`[slug-ref]   renamed ${publicDir}/${oldSlug}/ → ${publicDir}/${newSlug}/`)
}

// ─── Works Search helpers ────────────────────────────────────────────────────

function safeJsonRead(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function safeYamlRead(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf-8')) || {}
  } catch {
    return {}
  }
}

function gatherWorksData() {
  const worksDir = path.join(SOURCE_DIR, 'works')
  if (!fs.existsSync(worksDir))
    return {
      works: [],
      globalConfig: {},
      allTags: [],
      allInstruments: [],
      allDifficulties: [],
      allPerformers: [],
      allEnsembles: [],
    }

  const slugs = fs
    .readdirSync(worksDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()

  const pdfManifest = safeJsonRead(path.join(ROOT, 'api', 'pdf-scores.json'))
  const scoresManifest = safeJsonRead(path.join(ROOT, 'public', 'scores', '.scores-manifest.json'))
  const perusalConfig = safeYamlRead(path.join(SOURCE_DIR, 'site', 'perusal-access.yaml'))

  const tagsSet = new Set()
  const instrumentsSet = new Set()
  const difficultiesSet = new Set()
  const performersSet = new Set()
  const ensemblesSet = new Set()
  const works = []

  for (const slug of slugs) {
    const workDir = path.join(worksDir, slug)
    const yamlPath = path.join(workDir, 'work.yaml')
    if (!fs.existsSync(yamlPath)) continue

    const data = safeYamlRead(yamlPath)
    if (!data.title) continue

    const tags = Array.isArray(data.tags) ? data.tags : []
    const instrumentation = Array.isArray(data.instrumentation) ? data.instrumentation : []
    tags.forEach((t) => tagsSet.add(t))
    instrumentation.forEach((i) => instrumentsSet.add(i))
    if (data.difficulty) difficultiesSet.add(data.difficulty)

    const hasScorePdf = fs.existsSync(path.join(workDir, 'score.pdf'))
    const pdfInfo = pdfManifest[slug] || {}
    const scoreInfo = scoresManifest[slug] || {}

    const hasPerusalScore = hasScorePdf || data.hasPerusalScore === true
    const hasWatermarkedPdf = pdfInfo.hasWatermarkedPdf === true
    const hasOriginalPdf = pdfInfo.hasOriginalPdf === true

    const hasThumbnail = IMAGE_EXTS_SEARCH.some((ext) => fs.existsSync(path.join(workDir, `thumbnail${ext}`)))

    const recordings = Array.isArray(data.recordings) ? data.recordings : []
    const recordingsCount = recordings.length

    for (const rec of recordings) {
      if (Array.isArray(rec.performers))
        rec.performers.forEach((p) => {
          if (p) performersSet.add(p)
        })
      if (rec.ensemble) ensemblesSet.add(rec.ensemble)
    }

    const explicitMovements = Array.isArray(data.movements) ? data.movements : []
    const autoMovementsCount = recordings.reduce(
      (sum, rec) => sum + (Array.isArray(rec.movements) ? rec.movements.length : 0),
      0,
    )
    const movementsCount = explicitMovements.length > 0 ? explicitMovements.length : autoMovementsCount

    const hasYoutubeVideo = recordings.some(
      (rec) => rec.youtubeUrl || (Array.isArray(rec.movements) && rec.movements.some((m) => m.youtubeUrl)),
    )

    const completionYear = data.completionDate ? parseInt(data.completionDate.slice(0, 4), 10) : null

    const performances = Array.isArray(data.performances) ? data.performances : []
    const sheetMusic = Array.isArray(data.sheetMusic) ? data.sheetMusic : []

    works.push({
      slug,
      title: data.title,
      subtitle: data.subtitle || null,
      description: data.description || '',
      completionDate: data.completionDate || null,
      completionYear: isNaN(completionYear) ? null : completionYear,
      duration: data.duration || null,
      difficulty: data.difficulty || null,
      selected: data.selected === true,
      tags,
      instrumentation,
      searchKeywords: Array.isArray(data.searchKeywords) ? data.searchKeywords : [],
      programNote: data.programNote || null,

      scores: {
        hasPerusalScore,
        perusalScoreGated: data.perusalScoreGated || '',
        perusalScorePageCount: scoreInfo.pageCount || null,
        hasWatermarkedPdf,
        hasOriginalPdf,
        watermarkedGated: pdfInfo.watermarkedGated ?? perusalConfig.pdfWatermarkedGated ?? true,
        originalGated: pdfInfo.originalGated ?? perusalConfig.pdfOriginalGated ?? true,
        hasAnyScore: hasPerusalScore || hasWatermarkedPdf || hasOriginalPdf,
        pdfWatermarkedOverride: data.pdfWatermarkedOverride || '',
        pdfOriginalOverride: data.pdfOriginalOverride || '',
        pdfWatermarkedGatedOverride: data.pdfWatermarkedGatedOverride || '',
        pdfOriginalGatedOverride: data.pdfOriginalGatedOverride || '',
      },

      hasThumbnail,
      hasPerformances: performances.length > 0,
      hasSheetMusic: sheetMusic.length > 0,
      hasYoutubeVideo,

      recordingsCount,
      movementsCount,
      movementNames: explicitMovements.map((m) => m.name || ''),
      performancesCount: performances.length,
      sheetMusicCount: sheetMusic.length,

      recordings: recordings.map((rec) => ({
        performers: Array.isArray(rec.performers) ? rec.performers : [],
        ensemble: rec.ensemble || null,
        date: rec.date || null,
        featuredRecording: rec.featuredRecording === true,
        hasYoutubeUrl: !!rec.youtubeUrl,
        movementCount: Array.isArray(rec.movements) ? rec.movements.length : 0,
      })),

      keystatic_url: `/keystatic/collection/works/item/${slug}`,
      dev_url: `http://${LOCAL_DEV_HOST}:${ASTRO_PORT}/music/${slug}/`,
    })
  }

  return {
    works,
    globalConfig: {
      gatingEnabled: perusalConfig.gatingEnabled === true,
      pdfWatermarkedEnabled: perusalConfig.pdfWatermarkedEnabled !== false,
      pdfOriginalEnabled: perusalConfig.pdfOriginalEnabled === true,
      pdfWatermarkedGated: perusalConfig.pdfWatermarkedGated !== false,
      pdfOriginalGated: perusalConfig.pdfOriginalGated !== false,
    },
    allTags: [...tagsSet].sort(),
    allInstruments: [...instrumentsSet].sort(),
    allDifficulties: [...difficultiesSet].sort(),
    allPerformers: [...performersSet].sort(),
    allEnsembles: [...ensemblesSet].sort(),
  }
}

// ─── Works pipeline file watcher ─────────────────────────────────────────────

const WORKS_SOURCE_DIR = path.join(ROOT, 'source', 'works')
const INGEST_SCRIPT = path.join(ROOT, 'scripts', 'ingest-works.mjs')
const CLEANUP_SCRIPT = path.join(ROOT, 'scripts', 'cleanup-generated-files.mjs')
const GENERATE_IMAGES_SCRIPT = path.join(ROOT, 'scripts', 'generate-works-images.mjs')
const GENERATE_SCORES_SCRIPT = path.join(ROOT, 'scripts', 'generate-perusal-scores.mjs')
const GENERATE_SEARCH_SCRIPT = path.join(ROOT, 'scripts', 'generate-page-search-index.mjs')

const WATCHED_EXTENSIONS = new Set([
  '.yaml',
  '.md',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.mp3',
  '.wav',
  '.aiff',
  '.flac',
  '.pdf',
])

let pipelineTimer = null
let pipelineRunning = false

async function runPipeline() {
  if (pipelineRunning) return
  pipelineRunning = true
  console.log('\n[watch] source/works changed — running pipeline...')
  try {
    await spawnScript(INGEST_SCRIPT)
    console.log('[watch] ingest complete')
    await spawnScript(CLEANUP_SCRIPT, ['--apply'])
    console.log('[watch] cleanup complete')
    await spawnScript(GENERATE_IMAGES_SCRIPT)
    console.log('[watch] image generation complete')
    await spawnScript(GENERATE_SCORES_SCRIPT)
    console.log('[watch] perusal scores complete')
    await spawnScript(GENERATE_SEARCH_SCRIPT)
    console.log('[watch] search index complete\n')
  } catch (err) {
    console.error(`[watch] pipeline failed — ${err.message}\n`)
  } finally {
    pipelineRunning = false
  }
}

function startWorksWatcher() {
  if (!fs.existsSync(WORKS_SOURCE_DIR)) {
    console.warn('[watch] source/works/ not found — file watching disabled')
    return
  }

  fs.watch(WORKS_SOURCE_DIR, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const ext = path.extname(filename).toLowerCase()
    if (!WATCHED_EXTENSIONS.has(ext)) return
    clearTimeout(pipelineTimer)
    pipelineTimer = setTimeout(runPipeline, 300)
  })
  console.log('[watch] watching source/works/ for changes (YAML, prose, images, audio, PDFs)...')
}

// ─── Toolbar HTML injection ─────────────────────────────────────────────────

function getToolbarHtml() {
  const ASTRO_DEV_URL = `http://${LOCAL_DEV_HOST}:${ASTRO_PORT}/`

  const css = `
    /* ── Theme tokens (dark default) ─────────────────────────────── */
    #jv-toolbar {
      --jv-bg: #18181b;
      --jv-border: #3f3f46;
      --jv-text: #fafafa;
      --jv-hover-bg: #27272a;
      --jv-hover-border: #52525b;
      --jv-shadow: rgba(0,0,0,0.4);
      --jv-success-bg: #14532d;
      --jv-success-text: #fafafa;
      --jv-error-bg: #450a0a;
      --jv-error-text: #fafafa;
    }
    #jv-toolbar[data-theme="light"] {
      --jv-bg: #ffffff;
      --jv-border: #d4d4d8;
      --jv-text: #18181b;
      --jv-hover-bg: #f4f4f5;
      --jv-hover-border: #a1a1aa;
      --jv-shadow: rgba(0,0,0,0.12);
      --jv-success-bg: #dcfce7;
      --jv-success-text: #166534;
      --jv-error-bg: #fee2e2;
      --jv-error-text: #991b1b;
    }

    #jv-toolbar {
      position: fixed; top: 0; z-index: 10000;
      display: flex; align-items: center;
      padding: 0 8px;
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: auto;
      /* Hidden until positioned by JS */
      visibility: hidden;
    }
    #jv-toolbar[inert] { visibility: hidden !important; }

    /* ── Toggle button ────────────────────────────────────────────── */
    #jv-toolbar-toggle {
      display: inline-flex;
      align-items: center; justify-content: center;
      width: 36px; height: 36px;
      background: var(--jv-bg); color: var(--jv-text);
      border: 1px solid var(--jv-border); border-radius: 8px;
      font-size: 18px; line-height: 1; cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    #jv-toolbar-toggle:hover { background: var(--jv-hover-bg); border-color: var(--jv-hover-border); }
    #jv-toolbar-toggle[aria-expanded="true"] { background: var(--jv-hover-bg); border-color: var(--jv-hover-border); }

    /* ── Dropdown menu ────────────────────────────────────────────── */
    #jv-toolbar-menu {
      display: none; /* managed by JS */
      position: absolute; top: 48px; right: 0;
      flex-direction: column; gap: 4px;
      padding: 6px;
      background: var(--jv-bg); border: 1px solid var(--jv-border); border-radius: 8px;
      box-shadow: 0 8px 24px var(--jv-shadow);
      min-width: 160px;
    }
    #jv-toolbar-menu .jv-btn {
      display: flex; width: 100%; box-sizing: border-box;
      padding: 6px 14px; background: var(--jv-bg); color: var(--jv-text);
      border: none; border-radius: 6px;
      font-size: 12px; font-weight: 500; cursor: pointer; letter-spacing: 0.01em;
      transition: background 0.15s, opacity 0.15s;
      text-decoration: none; white-space: nowrap;
      justify-content: flex-start;
    }
    #jv-toolbar-menu .jv-btn:hover:not([disabled]) { background: var(--jv-hover-bg); }
    #jv-toolbar-menu .jv-btn[disabled] { opacity: 0.65; cursor: default; }
    #jv-toolbar-menu .jv-btn.jv-success { background: var(--jv-success-bg); color: var(--jv-success-text); }
    #jv-toolbar-menu .jv-btn.jv-error   { background: var(--jv-error-bg); color: var(--jv-error-text); }
  `

  const js = `
    (function () {
      if(window.parent!==window)return;
      var toolbar = document.createElement('div')
      toolbar.id = 'jv-toolbar'

      // ── Toggle button ─────────────────────────────────────────────
      var toggleBtn = document.createElement('button')
      toggleBtn.id = 'jv-toolbar-toggle'
      toggleBtn.type = 'button'
      toggleBtn.setAttribute('aria-label', 'Dev tools')
      toggleBtn.setAttribute('aria-expanded', 'false')
      toggleBtn.innerHTML = '<img src="/favicon.svg" alt="" style="display:block;height:20px;width:auto">'
      toolbar.appendChild(toggleBtn)

      // ── Dropdown menu (all buttons live here) ───────────────────
      var menu = document.createElement('div')
      menu.id = 'jv-toolbar-menu'
      menu.setAttribute('role', 'menu')
      toolbar.appendChild(menu)

      function addLink(id, href, text) {
        var a = document.createElement('a')
        a.id = id; a.className = 'jv-btn'
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'
        a.textContent = text
        menu.appendChild(a)
        return a
      }

      var devBtn = addLink('jv-dev-btn', ${JSON.stringify(ASTRO_DEV_URL)}, 'Dev')
      ${LIVE_URL ? `var liveBtn = addLink('jv-live-btn', ${JSON.stringify(LIVE_URL)}, '↗ Live')` : ''}

      function addAction(id, text) {
        var b = document.createElement('button')
        b.id = id; b.className = 'jv-btn'; b.textContent = text
        menu.appendChild(b)
        return b
      }

      var searchBtn = addAction('jv-search-btn', 'Search')
      var btn = addAction('jv-build-btn', '⚙ Build')
      var previewBtn = addAction('jv-preview-btn', '▶ Preview')
      var pubBtn = addAction('jv-publish-btn', '⬆ Publish')
      var starterBtn = addAction('jv-starter-btn', '📦 Export Starter')

      function closeMenu() {
        toggleBtn.setAttribute('aria-expanded', 'false')
        menu.style.display = 'none'
      }

      toggleBtn.addEventListener('click', function () {
        var open = toggleBtn.getAttribute('aria-expanded') === 'true'
        toggleBtn.setAttribute('aria-expanded', open ? 'false' : 'true')
        menu.style.display = open ? 'none' : 'flex'
      })

      // Close dropdown when clicking outside
      document.addEventListener('click', function (e) {
        if (!toolbar.contains(e.target)) closeMenu()
      })

      // Close dropdown after action button clicks
      ;[searchBtn, btn, previewBtn, pubBtn, starterBtn].forEach(function (b) {
        b.addEventListener('click', closeMenu)
      })

      // ── Works Search modal ──────────────────────────────────────────
      var searchModalOverlay = null

      function openSearchModal() {
        if (searchModalOverlay) return

        var overlay = document.createElement('div')
        overlay.id = 'jv-search-modal'
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.7);display:flex;padding:1rem;'

        var closeBtn = document.createElement('button')
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', 'Close search')
        closeBtn.style.cssText = 'position:absolute;top:0.25rem;right:0.25rem;z-index:1;background:rgba(24,24,27,0.9);color:#e4e4e7;border:1px solid #3f3f46;border-radius:6px;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s;line-height:1;'
        closeBtn.textContent = '\\u00d7'
        closeBtn.addEventListener('mouseenter', function () { closeBtn.style.background = '#27272a' })
        closeBtn.addEventListener('mouseleave', function () { closeBtn.style.background = 'rgba(24,24,27,0.9)' })
        closeBtn.addEventListener('click', closeSearchModal)
        overlay.appendChild(closeBtn)

        var frame = document.createElement('iframe')
        frame.src = '/works-search/?modal=1'
        frame.title = 'Works Search'
        frame.style.cssText = 'flex:1;border:none;border-radius:6px;background:#0e0e10;'
        overlay.appendChild(frame)

        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) closeSearchModal()
        })

        document.body.appendChild(overlay)
        searchModalOverlay = overlay
        closeBtn.focus()
      }

      function closeSearchModal() {
        if (!searchModalOverlay) return
        searchModalOverlay.remove()
        searchModalOverlay = null
      }

      window.addEventListener('message', function (e) {
        if (!searchModalOverlay) return
        if (e.origin !== window.location.origin) return
        if (!e.data || typeof e.data !== 'object') return

        if (e.data.type === 'works-search-close') {
          closeSearchModal()
        }
        if (e.data.type === 'works-search-edit') {
          closeSearchModal()
          window.location.href = e.data.keystaticUrl
        }
        if (e.data.type === 'works-search-view') {
          closeSearchModal()
          window.location.href = e.data.devUrl
        }
      })

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && searchModalOverlay) {
          e.preventDefault()
          e.stopPropagation()
          closeSearchModal()
        }
      })

      searchBtn.addEventListener('click', openSearchModal)

      // Toolbar lives OUTSIDE #root so React can never remove it.
      document.body.appendChild(toolbar)

      // ── Theme detection ──────────────────────────────────────────
      // Follows the same strategy as src/keystatic/text-field-with-placeholder.tsx
      function detectDark() {
        var cs = getComputedStyle(document.documentElement).colorScheme
        if (cs === 'dark') return true
        if (cs === 'light') return false
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      }

      function applyTheme() {
        toolbar.setAttribute('data-theme', detectDark() ? 'dark' : 'light')
      }

      applyTheme()

      // Re-check when Keystatic toggles its theme (changes class/style on <html>)
      new MutationObserver(applyTheme)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

      // Also listen for OS-level scheme changes
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', applyTheme)

      // ── Positioning ──────────────────────────────────────────────
      // Sit just below #keystatic-main-panel > header, right-aligned.
      function positionToolbar() {
        var header = document.querySelector('#keystatic-main-panel > header')
        if (!header || !header.getBoundingClientRect().width) {
          toolbar.style.visibility = 'hidden'
          return
        }
        var rect = header.getBoundingClientRect()
        var gap = 8 // match the horizontal padding so offset is uniform
        toolbar.style.top = Math.round(rect.bottom + gap) + 'px'
        toolbar.style.right = Math.round(window.innerWidth - rect.right) + 'px'
        toolbar.style.visibility = 'visible'
      }

      // Position on load, on resize, and whenever React re-renders
      var _jvPosTimer = null
      var _jvObserver = new MutationObserver(function () {
        clearTimeout(_jvPosTimer)
        _jvPosTimer = setTimeout(positionToolbar, 30)
      })
      _jvObserver.observe(document.getElementById('root'), { childList: true, subtree: true })
      window.addEventListener('resize', positionToolbar)
      setTimeout(positionToolbar, 200)

      // Keystatic has built-in mod+s for collections but not singletons.
      // Handle singleton save by clicking the external save button directly.
      window.addEventListener('keydown', function (event) {
        var isSaveHotkey = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's'
        if (!isSaveHotkey) return
        var saveBtn = document.querySelector('button[form="singleton-form"][type="submit"]:not([disabled])')
        if (!saveBtn) return
        event.preventDefault()
        event.stopPropagation()
        saveBtn.click()
      }, true)

      var buildBusy = false
      var publishBusy = false

      function resetBtn(b, label) {
        b.className = 'jv-btn'
        b.textContent = label
        b.disabled = false
      }

      btn.addEventListener('click', async () => {
        if (buildBusy || publishBusy) return
        buildBusy = true
        btn.disabled = true
        btn.className = 'jv-btn'
        btn.textContent = '⏳ Building…'
        try {
          const res = await fetch('/api/build', { method: 'POST' })
          const data = await res.json()
          if (res.ok) {
            btn.className = 'jv-btn jv-success'
            btn.textContent = '✓ Build complete'
            setTimeout(() => { resetBtn(btn, '⚙ Build'); buildBusy = false }, 3000)
          } else if (res.status === 409) {
            resetBtn(btn, '⚙ Build')
            buildBusy = false
          } else {
            btn.className = 'jv-btn jv-error'
            btn.textContent = '✗ Build failed'
            console.error('[build]', data.error)
            setTimeout(() => { resetBtn(btn, '⚙ Build'); buildBusy = false }, 5000)
          }
        } catch (e) {
          btn.className = 'jv-btn jv-error'
          btn.textContent = '✗ Network error'
          console.error('[build]', e)
          setTimeout(() => { resetBtn(btn, '⚙ Build'); buildBusy = false }, 5000)
        }
      })

      previewBtn.addEventListener('click', async () => {
        if (buildBusy) return
        previewBtn.disabled = true
        previewBtn.textContent = '⏳ Starting…'
        try {
          const res = await fetch('/api/preview', { method: 'POST' })
          const data = await res.json()
          if (res.ok) {
            window.open(data.url, '_blank', 'noopener,noreferrer')
            resetBtn(previewBtn, '▶ Preview')
          } else {
            previewBtn.className = 'jv-btn jv-error'
            previewBtn.textContent = '✗ ' + (data.error || 'Preview failed')
            console.error('[preview]', data.error)
            setTimeout(() => resetBtn(previewBtn, '▶ Preview'), 5000)
          }
        } catch (e) {
          previewBtn.className = 'jv-btn jv-error'
          previewBtn.textContent = '✗ Network error'
          console.error('[preview]', e)
          setTimeout(() => resetBtn(previewBtn, '▶ Preview'), 5000)
        }
        previewBtn.disabled = false
      })

      pubBtn.addEventListener('click', async () => {
        if (buildBusy || publishBusy) return
        var ok = window.confirm(
          'Deploy to live?\\n\\n' +
          'This uploads the current dist/ build to the server as-is.\\n\\n' +
          'Make sure you have:\\n' +
          '  1. Clicked Build after your last changes\\n' +
          '  2. Clicked Preview to verify everything looks good\\n\\n' +
          'Continue?'
        )
        if (!ok) return
        publishBusy = true
        pubBtn.disabled = true
        pubBtn.className = 'jv-btn'
        pubBtn.textContent = '⬆ Publishing…'
        try {
          const res = await fetch('/api/publish', { method: 'POST' })
          const data = await res.json()
          if (res.ok) {
            pubBtn.className = 'jv-btn jv-success'
            pubBtn.textContent = '✓ Published'
            setTimeout(() => { resetBtn(pubBtn, '⬆ Publish'); publishBusy = false }, 5000)
          } else if (res.status === 409) {
            resetBtn(pubBtn, '⬆ Publish')
            publishBusy = false
          } else {
            pubBtn.className = 'jv-btn jv-error'
            pubBtn.textContent = '✗ Publish failed'
            console.error('[publish]', data.error)
            setTimeout(() => { resetBtn(pubBtn, '⬆ Publish'); publishBusy = false }, 7000)
          }
        } catch (e) {
          pubBtn.className = 'jv-btn jv-error'
          pubBtn.textContent = '✗ Network error'
          console.error('[publish]', e)
          setTimeout(() => { resetBtn(pubBtn, '⬆ Publish'); publishBusy = false }, 7000)
        }
      })

      var starterBusy = false
      starterBtn.addEventListener('click', async () => {
        if (starterBusy) return
        var ok = window.confirm(
          'Generate starter kit?\\n\\n' +
          'This creates a clean, distributable project in .starter-kit/\\n' +
          'with all personal data, credentials, and purchased assets stripped.\\n\\n' +
          'Continue?'
        )
        if (!ok) return
        starterBusy = true
        starterBtn.disabled = true
        starterBtn.className = 'jv-btn'
        starterBtn.textContent = '📦 Generating…'
        try {
          const res = await fetch('/api/generate-starter-kit', { method: 'POST' })
          const data = await res.json()
          if (res.ok) {
            starterBtn.className = 'jv-btn jv-success'
            starterBtn.textContent = '✓ ' + data.fileCount + ' files, ' + data.totalSize
            setTimeout(() => { resetBtn(starterBtn, '📦 Export Starter'); starterBusy = false }, 7000)
          } else {
            starterBtn.className = 'jv-btn jv-error'
            starterBtn.textContent = '✗ ' + (data.error || 'Generation failed')
            console.error('[starter-kit]', data.error)
            setTimeout(() => { resetBtn(starterBtn, '📦 Export Starter'); starterBusy = false }, 7000)
          }
        } catch (e) {
          starterBtn.className = 'jv-btn jv-error'
          starterBtn.textContent = '✗ Network error'
          console.error('[starter-kit]', e)
          setTimeout(() => { resetBtn(starterBtn, '📦 Export Starter'); starterBusy = false }, 7000)
        }
      })
    })()
  `

  return { css, js }
}

function injectToolbarIntoHtml(html) {
  const { css, js } = getToolbarHtml()
  const styleTag = `<style>${css}</style>`
  const scriptTag = `<script>${js}</script>`

  // Inject a small script that monitors Keystatic's "Unsaved" badge and
  // posts dirty-state changes to the parent window via postMessage. This
  // avoids cross-origin contentDocument access issues when the outer page
  // is on a different loopback address (localhost vs 127.0.0.1).
  const dirtyMonitorScript = `<script>(function(){
    if(window.parent===window)return;
    var dirty=false;
    var lastPath=location.pathname;

    /* ── Dirty-state detection via MutationObserver ───────────────── */
    function checkUnsaved(){
      var found=false;
      var spans=document.querySelectorAll('span');
      for(var i=0;i<spans.length;i++){
        if(spans[i].textContent.trim()==='Unsaved'&&spans[i].className.indexOf('kui:')!==-1){
          found=true;break;
        }
      }
      if(found!==dirty){
        dirty=found;
        window.parent.postMessage({type:'keystatic-dirty-state',isDirty:dirty},'*');
      }
    }
    new MutationObserver(checkUnsaved).observe(document.body,{childList:true,subtree:true,characterData:true});

    /* ── Navigation detection via pushState/replaceState/popstate ── */
    function onNav(){
      if(location.pathname===lastPath)return;
      lastPath=location.pathname;
      window.parent.postMessage({type:'cms-navigate',pathname:lastPath},'*');
    }
    var origPush=history.pushState;
    history.pushState=function(){origPush.apply(this,arguments);onNav();};
    var origReplace=history.replaceState;
    history.replaceState=function(){origReplace.apply(this,arguments);onNav();};
    window.addEventListener('popstate',onNav);

    /* ── Capture-phase click guard on internal links ──────────────── */
    /* When dirty, block the click before React Router sees it and ask */
    /* the parent (studio shell) whether to discard or cancel.         */
    document.addEventListener('click',function(e){
      if(!dirty)return;
      var a=e.target.closest('a[href]');
      if(!a)return;
      if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey)return;
      if(a.target==='_blank'||a.hasAttribute('download'))return;
      var h=a.getAttribute('href');
      if(!h||h.charAt(0)==='#')return;
      try{var u=new URL(h,location.href);if(u.origin!==location.origin)return;}catch(x){return;}
      e.preventDefault();
      e.stopImmediatePropagation();
      window.parent.postMessage({type:'cms-request-navigate',pathname:u.pathname},'*');
    },true);

    /* ── Message handler ──────────────────────────────────────────── */
    window.addEventListener('message',function(e){
      if(!e.data)return;
      if(e.data.type==='cms-do-navigate'){
        var p=e.data.pathname;
        if(p){
          var a=document.querySelector('a[href="'+p+'"]')||document.querySelector('a[href="'+p.replace(/\\/$/,'')+'"]');
          if(a){dirty=false;a.click();}
          else{location.href=p;}
        }
        return;
      }
      if(e.data.type!=='cms-delete-draft')return;
      var key=e.data.key;
      if(!key)return;
      try{
        var req=indexedDB.open('keystatic');
        req.onsuccess=function(){
          var db=req.result;
          if(!db.objectStoreNames.contains('items')){db.close();return;}
          var tx=db.transaction('items','readwrite');
          tx.objectStore('items').delete(key);
          tx.oncomplete=function(){db.close();};
          tx.onerror=function(){db.close();};
        };
      }catch(x){}
    });

    /* ── Cmd+S / Ctrl+S save for singletons ──────────────────────── */
    /* Keystatic has built-in mod+s for collections but not singletons. */
    window.addEventListener('keydown',function(e){
      var isSave=(e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='s';
      if(!isSave)return;
      var btn=document.querySelector('button[form="singleton-form"][type="submit"]:not([disabled])');
      if(!btn)return;
      e.preventDefault();
      e.stopPropagation();
      btn.click();
    },true);
  })();</script>`

  // Inject style before </head> and script before </body>
  html = html.replace('</head>', `${styleTag}\n</head>`)
  html = html.replace('</body>', `${dirtyMonitorScript}\n${scriptTag}\n</body>`)
  return html
}

// ─── Vite plugin: combined Keystatic middleware + toolbar ─────────────────────

function keystatic_DevPlugin() {
  let apiHandler = null
  let keystaticConfig = null
  let allowedDirectories = null
  let viteServer = null

  async function getKeystaticConfig() {
    if (keystaticConfig) return keystaticConfig
    const mod = await viteServer.ssrLoadModule(path.join(ROOT, 'keystatic.config.ts'))
    keystaticConfig = mod.default || mod
    return keystaticConfig
  }

  async function getAllowedDirectoriesCached() {
    if (allowedDirectories) return allowedDirectories
    const config = await getKeystaticConfig()
    allowedDirectories = getAllowedDirectories(config)
    return allowedDirectories
  }

  async function getApiHandler() {
    if (apiHandler) return apiHandler
    const config = await getKeystaticConfig()
    apiHandler = makeGenericAPIRouteHandler({ config }, {})
    return apiHandler
  }

  // Combined middleware that handles all Keystatic-related routes.
  // This is unshifted to the front of the middleware stack so it runs
  // before Astro's trailing slash middleware.
  async function combinedMiddleware(req, res, next) {
    const rawUrl = req.url || ''
    const pathname = rawUrl.split('?')[0]

    // ── Keystatic API ──────────────────────────────────────────────────────
    if (rawUrl.startsWith('/api/keystatic')) {
      try {
        // Local-mode tree scan that ignores .gitignore and only includes
        // directories Keystatic can actually read/write from the schema.
        if (pathname === '/api/keystatic/tree' && req.method === 'GET') {
          if (req.headers['no-cors'] !== '1') {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Bad Request')
            return
          }
          const dirs = await getAllowedDirectoriesCached()
          const entries = await buildKeystaticTreeEntries(ROOT, dirs)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(entries))
          return
        }

        const handler = await getApiHandler()
        const body = await readRawBody(req)

        // Detect slug renames from the update payload before forwarding
        let slugRenames = []
        if (pathname === '/api/keystatic/update' && req.method === 'POST' && body.length > 0) {
          try {
            const payload = JSON.parse(body.toString('utf-8'))
            for (const [prefix, config] of Object.entries(COLLECTION_REFS)) {
              if (config.refs.length === 0) continue
              const rename = detectSlugRename(payload, prefix)
              if (rename) {
                slugRenames.push({ ...rename, prefix, ...config })
              }
            }
          } catch {
            // JSON parse failure — proceed without rename detection
          }
        }

        const headers = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v
        }
        const request = new Request(`http://${LOCAL_DEV_HOST}:${ASTRO_PORT}${rawUrl}`, {
          method: req.method,
          headers,
          body: body.length > 0 ? body : undefined,
        })
        const response = await handler(request)

        // The handler returns a standard Response object. Extract headers.
        const hdrs = response.headers
        let headersObj = { 'Content-Type': 'application/json' }
        if (hdrs) {
          if (typeof hdrs.entries === 'function') {
            headersObj = Object.fromEntries(hdrs.entries())
          } else if (Array.isArray(hdrs)) {
            for (const [k, v] of hdrs) headersObj[k] = v
          } else if (typeof hdrs === 'object') {
            headersObj = hdrs
          }
        }

        // Handle both string body (legacy) and ReadableStream body (standard Response)
        let responseBody
        if (typeof response.body === 'string') {
          responseBody = response.body
        } else if (response.body && typeof response.arrayBuffer === 'function') {
          // Standard Response object — read the body
          responseBody = Buffer.from(await response.arrayBuffer())
        } else {
          responseBody = response.body ?? ''
        }

        // After successful update, migrate remaining files and propagate slug renames
        if (response.status === 200 && slugRenames.length > 0) {
          for (const { oldSlug, newSlug, prefix, publicDir, refs } of slugRenames) {
            const collection = prefix.replace(/^source\//, '').replace(/\/$/, '')
            console.log(`[slug-ref] ${collection} slug renamed: "${oldSlug}" → "${newSlug}"`)
            migrateRemainingFiles(prefix, oldSlug, newSlug)
            renamePublicDir(publicDir, oldSlug, newSlug)
            const count = updateSlugReferences(oldSlug, newSlug, refs)
            if (count > 0) {
              console.log(`[slug-ref] Updated ${count} reference(s)`)
            } else {
              console.log(`[slug-ref] No references found to update`)
            }
          }
        }

        // Keep update responses aligned with the same tree source used above,
        // so local edits never depend on .gitignore visibility rules.
        if (pathname === '/api/keystatic/update' && req.method === 'POST' && response.status === 200) {
          const dirs = await getAllowedDirectoriesCached()
          const entries = await buildKeystaticTreeEntries(ROOT, dirs)
          responseBody = Buffer.from(JSON.stringify(entries), 'utf8')
          headersObj['content-type'] = 'application/json'
          delete headersObj['Content-Length']
          delete headersObj['content-length']
        }

        res.writeHead(response.status, headersObj)
        res.end(responseBody)
      } catch (e) {
        console.error('[keystatic-api]', e)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return
    }

    // ── Toolbar config API (consumed by CMS Live Editor header menu) ────
    if (rawUrl === '/api/toolbar-config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ liveUrl: LIVE_URL || null }))
      return
    }

    // ── Build API ──────────────────────────────────────────────────────────
    if (rawUrl === '/api/build' && req.method === 'POST') {
      if (buildRunning || publishRunning) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'busy', error: 'A build or publish is already in progress' }))
        return
      }

      buildRunning = true
      console.log('\n[build] Starting build:content...')
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn('npm', ['run', 'build:content'], { stdio: 'inherit', cwd: ROOT, shell: false })
          proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
        })
        console.log('[build] Build complete\n')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'success' }))
      } catch (err) {
        console.error(`[build] Build failed — ${err.message}\n`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', error: err.message }))
      } finally {
        buildRunning = false
      }
      return
    }

    // ── Publish API ────────────────────────────────────────────────────────
    if (rawUrl === '/api/publish' && req.method === 'POST') {
      if (buildRunning || publishRunning) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'busy', error: 'A build or publish is already in progress' }))
        return
      }

      publishRunning = true
      console.log('\n[publish] Starting SFTP deploy...')
      try {
        await spawnScript(DEPLOY_SCRIPT)
        console.log('[publish] Deploy complete\n')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'success' }))
      } catch (err) {
        console.error(`[publish] Failed — ${err.message}\n`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', error: err.message }))
      } finally {
        publishRunning = false
      }
      return
    }

    // ── Preview API ────────────────────────────────────────────────────────
    if (rawUrl === '/api/preview' && req.method === 'POST') {
      if (previewProcess) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'running', url: PREVIEW_URL }))
        return
      }

      const distDir = path.join(ROOT, 'dist')
      if (!fs.existsSync(distDir)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', error: 'No dist/ found — run Build first.' }))
        return
      }

      console.log(`\n[preview] Starting astro preview on port ${PREVIEW_PORT}...`)

      try {
        const pids = execSync(`lsof -ti :${PREVIEW_PORT}`, { encoding: 'utf8' }).trim()
        if (pids) {
          for (const pid of pids.split('\n')) {
            try {
              process.kill(Number(pid), 'SIGKILL')
            } catch {
              /* may have exited */
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      } catch {
        // lsof exits non-zero when no process is found
      }

      previewProcess = spawn(
        'node',
        ['node_modules/.bin/astro', 'preview', '--port', String(PREVIEW_PORT), '--host', '127.0.0.1'],
        { stdio: 'inherit', cwd: ROOT },
      )
      previewProcess.on('exit', () => {
        console.log('[preview] Preview server stopped.')
        previewProcess = null
      })
      previewProcess.on('error', (err) => {
        console.error(`[preview] Error — ${err.message}`)
        previewProcess = null
      })

      await new Promise((resolve) => setTimeout(resolve, 1200))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'started', url: PREVIEW_URL }))
      return
    }

    // ── Generate Starter Kit API ────────────────────────────────────────────
    if (rawUrl === '/api/generate-starter-kit' && req.method === 'POST') {
      console.log('\n[starter-kit] Generating starter kit...')
      try {
        await spawnScript(path.join(ROOT, 'scripts', 'generate-starter-kit.mjs'))

        // Read the output stats
        const outputDir = path.join(ROOT, '.starter-kit')
        function countFilesRecursive(dir) {
          let count = 0
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) count += countFilesRecursive(full)
            else count++
          }
          return count
        }
        function dirSizeRecursive(dir) {
          let size = 0
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) size += dirSizeRecursive(full)
            else size += fs.statSync(full).size
          }
          return size
        }
        function formatBytes(bytes) {
          if (bytes < 1024) return `${bytes} B`
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        }

        const fileCount = countFilesRecursive(outputDir)
        const totalSize = formatBytes(dirSizeRecursive(outputDir))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, fileCount, totalSize, path: '.starter-kit/' }))
      } catch (err) {
        console.error('[starter-kit] Generation failed:', err.message)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      }
      return
    }

    // ── Hero Preference API (same-origin, no CORS needed) ──────────────────
    if (pathname === HERO_PREFERRED_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const requestedId = typeof body.preferredHeroId === 'string' ? body.preferredHeroId.trim() : null
        const pageKeyRaw = typeof body.pageKey === 'string' ? body.pageKey.trim().toLowerCase() : 'home'
        const scopeRaw = typeof body.scope === 'string' ? body.scope.trim() : ''
        const workSlug = typeof body.workSlug === 'string' ? body.workSlug.trim() : ''

        if (requestedId === null) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'preferredHeroId must be a string.' }))
          return
        }

        if (!HERO_PREFERENCE_PAGE_KEYS.has(pageKeyRaw)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Unknown pageKey.' }))
          return
        }

        if (pageKeyRaw === 'work-detail' && scopeRaw && !WORK_DETAIL_PREFERENCE_SCOPES.has(scopeRaw)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Unknown work-detail scope.' }))
          return
        }

        const heroIds = listHeroIds()
        if (requestedId !== '' && !heroIds.includes(requestedId)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Unknown hero id.', heroIds }))
          return
        }

        // Per-work override: write to source/works/{slug}/work.yaml
        let configPath
        if (pageKeyRaw === 'work-detail') {
          const resolvedScope = scopeRaw || (workSlug ? 'this-work' : 'all-work-pages')
          if (resolvedScope === 'this-work') {
            if (!workSlug) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'workSlug is required for this-work scope.' }))
              return
            }

            const workDir = path.join(SOURCE_DIR, 'works', workSlug)
            if (!fs.existsSync(workDir)) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'Unknown work slug.' }))
              return
            }

            configPath = path.join(workDir, 'work.yaml')
          } else {
            configPath = resolvePreferredHeroConfigPath(pageKeyRaw)
          }
        } else {
          configPath = resolvePreferredHeroConfigPath(pageKeyRaw)
        }

        const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
        const nextContent = upsertPreferredHeroInYaml(current, requestedId)

        if (nextContent !== current) {
          fs.mkdirSync(path.dirname(configPath), { recursive: true })
          fs.writeFileSync(configPath, nextContent, 'utf-8')
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: true,
            preferredHeroId: requestedId,
            pageKey: pageKeyRaw,
            scope: scopeRaw || undefined,
            workSlug: workSlug || undefined,
          }),
        )
      } catch {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to persist preferred hero id.' }))
      }
      return
    }

    // ── Theme Preset API (same-origin, no CORS needed) ────────────────────
    if (pathname === THEME_PRESET_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)

        // Validate and normalize hex colors
        const normalizeHex = (value) => {
          if (typeof value !== 'string') return ''
          const trimmed = value.trim()
          if (!trimmed) return ''
          const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
          if (!match) return ''
          const hex = match[1]
          if (hex.length === 3)
            return (
              '#' +
              hex
                .split('')
                .map((c) => c + c)
                .join('')
                .toLowerCase()
            )
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
        const homeHero = normalizeThemeHomeHero(body.homeHero, currentThemeId)

        const fontBody = typeof body.fontBody === 'string' ? body.fontBody.trim() : ''
        const fontHeading = typeof body.fontHeading === 'string' ? body.fontHeading.trim() : ''
        const borderRadius =
          typeof body.borderRadius === 'string' && VALID_BORDER_RADIUS.has(body.borderRadius.trim())
            ? body.borderRadius.trim()
            : 'none'
        const playerBorderRadius = typeof body.playerBorderRadius === 'string' ? body.playerBorderRadius.trim() : ''
        const socialIconBorderRadius =
          typeof body.socialIconBorderRadius === 'string' ? body.socialIconBorderRadius.trim() : ''
        const profileImageBorderRadius =
          typeof body.profileImageBorderRadius === 'string' ? body.profileImageBorderRadius.trim() : ''
        const tagBadgeBorderRadius =
          typeof body.tagBadgeBorderRadius === 'string' ? body.tagBadgeBorderRadius.trim() : ''

        // Build YAML content
        const lines = [
          '# Theme configuration',
          '# This is the applied snapshot used by the live site.',
          '# Theme Studio writes this file when you click Apply.',
          '# Colors should be specified as hex values (e.g. #1a1a2e).',
          '',
        ]
        lines.push(currentThemeId ? `currentThemeId: '${currentThemeId}'` : `currentThemeId: ''`)
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
        lines.push(
          socialIconBorderRadius ? `socialIconBorderRadius: ${socialIconBorderRadius}` : `socialIconBorderRadius: ''`,
        )
        lines.push(
          profileImageBorderRadius
            ? `profileImageBorderRadius: ${profileImageBorderRadius}`
            : `profileImageBorderRadius: ''`,
        )
        lines.push(tagBadgeBorderRadius ? `tagBadgeBorderRadius: ${tagBadgeBorderRadius}` : `tagBadgeBorderRadius: ''`)
        if (customCss) {
          const customCssYaml = yaml
            .dump({ customCss }, { lineWidth: -1, noRefs: true, sortKeys: false })
            .trimEnd()
            .split('\n')
          lines.push(...customCssYaml)
        }
        const aboutPageYaml = yaml
          .dump({ aboutPage }, { lineWidth: -1, noRefs: true, sortKeys: false })
          .trimEnd()
          .split('\n')
        lines.push(...aboutPageYaml)
        const contactPageYaml = yaml
          .dump({ contactPage }, { lineWidth: -1, noRefs: true, sortKeys: false })
          .trimEnd()
          .split('\n')
        lines.push(...contactPageYaml)
        const homeHeroYaml = yaml
          .dump({ homeHero }, { lineWidth: -1, noRefs: true, sortKeys: false })
          .trimEnd()
          .split('\n')
        lines.push(...homeHeroYaml)
        lines.push('')

        fs.writeFileSync(THEME_CONFIG_PATH, lines.join('\n'), 'utf-8')
        fs.writeFileSync(
          THEME_SELECTION_PATH,
          [
            '# Active theme selection',
            '# Leave blank to keep using the applied custom snapshot from theme.yaml.',
            currentThemeId ? `currentThemeId: '${currentThemeId}'` : `currentThemeId: ''`,
            '',
          ].join('\n'),
          'utf-8',
        )

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to persist theme preset.' }))
      }
      return
    }

    // ── Theme Library API (same-origin, no CORS needed) ───────────────────
    if (pathname === THEME_LIBRARY_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method === 'GET') {
        try {
          const themes = readThemeLibrary()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, themes }))
        } catch {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Failed to read theme library.' }))
        }
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'GET, POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const action = normalizeThemeScalar(body?.action)
        const existingThemes = readThemeLibrary()

        if (action === 'create') {
          const draftTheme = normalizeThemeRecord(body?.theme)
          const createdTheme = {
            ...draftTheme,
            id: createUniqueThemeId(draftTheme.label, existingThemes),
          }
          const nextThemes = [...existingThemes, createdTheme]
          writeThemeLibrary(nextThemes)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, theme: createdTheme, themes: nextThemes }))
          return
        }

        if (action === 'update') {
          const themeId = normalizeThemeScalar(body?.id)
          const themeIndex = existingThemes.findIndex((theme) => theme.id === themeId)
          if (themeIndex < 0) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Unknown theme id.' }))
            return
          }

          const updatedTheme = {
            ...normalizeThemeRecord(body?.theme, themeId),
            id: existingThemes[themeIndex].id,
          }
          const nextThemes = [...existingThemes]
          nextThemes[themeIndex] = updatedTheme
          writeThemeLibrary(nextThemes)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, theme: updatedTheme, themes: nextThemes }))
          return
        }

        if (action === 'delete') {
          const themeId = normalizeThemeScalar(body?.id)
          const nextThemes = existingThemes.filter((theme) => theme.id !== themeId)
          if (nextThemes.length === existingThemes.length) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Unknown theme id.' }))
            return
          }

          writeThemeLibrary(nextThemes)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, deletedId: themeId, themes: nextThemes }))
          return
        }

        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Unknown theme library action.' }))
      } catch {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to persist theme library.' }))
      }
      return
    }

    // ── Setup Wizard: Identity API ─────────────────────────────────────────
    if (pathname === SETUP_IDENTITY_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
        const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
        const email = typeof body.email === 'string' ? body.email.trim() : ''
        const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
        const siteTitle = typeof body.siteTitle === 'string' ? body.siteTitle.trim() : ''
        const siteDescription = typeof body.siteDescription === 'string' ? body.siteDescription.trim() : ''

        if (!firstName || !lastName) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'firstName and lastName are required.' }))
          return
        }
        if (!email) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'email is required.' }))
          return
        }
        if (!isValidEmail(email)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'email must be a valid email address.' }))
          return
        }
        if (!siteUrl) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'siteUrl is required.' }))
          return
        }
        if (!isValidHttpUrl(siteUrl)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'siteUrl must be a valid URL (http/https).' }))
          return
        }

        const composerName = `${firstName} ${lastName}`
        const resolvedTitle = siteTitle || `${composerName} — Composer`

        // Update site.yaml
        const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
        const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}
        siteData.composerName = composerName
        siteData.siteTitle = resolvedTitle
        if (siteDescription) siteData.siteDescription = siteDescription
        siteData.email = email
        siteData.siteUrl = siteUrl
        fs.writeFileSync(
          SITE_CONFIG_PATH,
          yaml.dump(siteData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        // Update brand-logo.yaml
        const brandRaw = fs.existsSync(BRAND_LOGO_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(BRAND_LOGO_CONFIG_PATH, 'utf8'))
          : {}
        const brandData = brandRaw && typeof brandRaw === 'object' ? brandRaw : {}
        brandData.firstName = firstName
        brandData.lastName = lastName
        fs.writeFileSync(
          BRAND_LOGO_CONFIG_PATH,
          yaml.dump(brandData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        // Update copyright.yaml
        const copyrightRaw = fs.existsSync(COPYRIGHT_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(COPYRIGHT_CONFIG_PATH, 'utf8'))
          : {}
        const copyrightData = copyrightRaw && typeof copyrightRaw === 'object' ? copyrightRaw : {}
        copyrightData.copyrightHolder = composerName
        fs.writeFileSync(
          COPYRIGHT_CONFIG_PATH,
          yaml.dump(copyrightData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

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
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, composerName, siteTitle: resolvedTitle }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save identity: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Social API ──────────────────────────────────────────
    if (pathname === SETUP_SOCIAL_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const links = Array.isArray(body.links) ? body.links : []

        const normalizedLinks = links
          .filter((link) => link && typeof link === 'object' && VALID_SOCIAL_PLATFORMS.has(link.platform))
          .map((link) => ({
            platform: link.platform,
            url: typeof link.url === 'string' ? link.url.trim() : '',
            enabled: link.enabled === true,
          }))

        const socialYaml = yaml.dump({ links: normalizedLinks }, { lineWidth: 120, noRefs: true, sortKeys: false })
        fs.writeFileSync(SOCIAL_CONFIG_PATH, socialYaml, 'utf8')

        console.log(`[setup] Social links saved: ${normalizedLinks.filter((l) => l.enabled).length} enabled`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save social links: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Homepage API ──────────────────────────────────────────
    if (pathname === SETUP_HOMEPAGE_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const heroTagline = typeof body.heroTagline === 'string' ? body.heroTagline.trim() : ''
        const heroTaglineAsBlockquote = body.heroTaglineAsBlockquote === true
        const heroTaglineCitation = typeof body.heroTaglineCitation === 'string' ? body.heroTaglineCitation.trim() : ''

        // Read existing home.yaml and update tagline fields inside the hero section
        const homeRaw = fs.existsSync(HOME_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(HOME_CONFIG_PATH, 'utf8'))
          : {}
        const homeData = homeRaw && typeof homeRaw === 'object' ? homeRaw : {}

        // Find the hero section in the sections array
        if (Array.isArray(homeData.sections)) {
          const heroSection = homeData.sections.find(
            (s) => s?.block?.discriminant === 'hero',
          )
          if (heroSection?.block?.value) {
            if (heroTagline) heroSection.block.value.heroTagline = heroTagline
            heroSection.block.value.heroTaglineAsBlockquote = heroTaglineAsBlockquote
            heroSection.block.value.heroTaglineCitation = heroTaglineCitation || ''
          }
        }

        fs.writeFileSync(
          HOME_CONFIG_PATH,
          yaml.dump(homeData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        console.log(`[setup] Homepage tagline saved (blockquote: ${heroTaglineAsBlockquote})`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save homepage config: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Forms API ──────────────────────────────────────────
    if (pathname === SETUP_FORMS_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)

        // Contact form config → contact.yaml
        const contactFormEnabled = body.contactFormEnabled === true
        const contactWebhookUrl = typeof body.contactWebhookUrl === 'string' ? body.contactWebhookUrl.trim() : ''

        const contactRaw = fs.existsSync(CONTACT_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(CONTACT_CONFIG_PATH, 'utf8'))
          : {}
        const contactData = contactRaw && typeof contactRaw === 'object' ? contactRaw : {}
        contactData.contactFormEnabled = contactFormEnabled
        contactData.contactWebhookUrl = contactWebhookUrl
        fs.writeFileSync(
          CONTACT_CONFIG_PATH,
          yaml.dump(contactData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        // Perusal access config → perusal-access.yaml
        const perusalGatingEnabled = body.perusalGatingEnabled === true
        const perusalWebhookUrl = typeof body.perusalWebhookUrl === 'string' ? body.perusalWebhookUrl.trim() : ''
        const perusalTokenSecret = typeof body.perusalTokenSecret === 'string' ? body.perusalTokenSecret.trim() : ''
        const perusalTokenExpirationDays =
          typeof body.perusalTokenExpirationDays === 'number' && body.perusalTokenExpirationDays >= 1
            ? Math.round(body.perusalTokenExpirationDays)
            : 90

        const perusalRaw = fs.existsSync(PERUSAL_ACCESS_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(PERUSAL_ACCESS_CONFIG_PATH, 'utf8'))
          : {}
        const perusalData = perusalRaw && typeof perusalRaw === 'object' ? perusalRaw : {}
        perusalData.gatingEnabled = perusalGatingEnabled
        perusalData.webhookUrl = perusalWebhookUrl
        if (perusalTokenSecret) perusalData.tokenSecret = perusalTokenSecret
        perusalData.tokenExpirationDays = perusalTokenExpirationDays
        fs.writeFileSync(
          PERUSAL_ACCESS_CONFIG_PATH,
          yaml.dump(perusalData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        console.log(`[setup] Forms saved: contact=${contactFormEnabled}, perusal-gating=${perusalGatingEnabled}`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save forms config: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: File Upload API ──────────────────────────────────────
    if (pathname === SETUP_UPLOAD_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'PUT') {
        res.statusCode = 405
        res.setHeader('Allow', 'PUT, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
        const dest = url.searchParams.get('dest') || ''

        // Validate destination path — must start with an allowed prefix
        const ALLOWED_PREFIXES = ['pages/about/', 'works/']
        const isAllowed = ALLOWED_PREFIXES.some((prefix) => dest.startsWith(prefix))
        if (!dest || !isAllowed) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Invalid upload destination.' }))
          return
        }

        // Prevent path traversal
        const resolved = path.resolve(SOURCE_DIR, dest)
        if (!resolved.startsWith(SOURCE_DIR)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Invalid path.' }))
          return
        }

        // Stream request body to file
        const destDir = path.dirname(resolved)
        fs.mkdirSync(destDir, { recursive: true })

        const chunks = []
        for await (const chunk of req) {
          chunks.push(chunk)
        }
        const fileBuffer = Buffer.concat(chunks)
        fs.writeFileSync(resolved, fileBuffer)

        console.log(`[setup] File uploaded: ${dest} (${fileBuffer.length} bytes)`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, path: dest, size: fileBuffer.length }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to upload file: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: About Page API ──────────────────────────────────────
    if (pathname === SETUP_ABOUT_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
        const profileImageAlt = typeof body.profileImageAlt === 'string' ? body.profileImageAlt.trim() : ''
        const aboutBody = typeof body.body === 'string' ? body.body.trim() : ''
        const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim() : ''

        // Read composer name for auto-generating meta title
        const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
        const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}
        const composerName = siteData.composerName || 'FirstName LastName'

        // Read existing about.yaml and merge
        const aboutDir = path.dirname(ABOUT_CONFIG_PATH)
        fs.mkdirSync(aboutDir, { recursive: true })
        const aboutRaw = fs.existsSync(ABOUT_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(ABOUT_CONFIG_PATH, 'utf8'))
          : {}
        const aboutData = aboutRaw && typeof aboutRaw === 'object' ? aboutRaw : {}

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

        fs.writeFileSync(
          ABOUT_CONFIG_PATH,
          yaml.dump(aboutData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        console.log(`[setup] About page saved`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save about page: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Work API ──────────────────────────────────────────
    if (pathname === SETUP_WORK_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
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
        const instrumentation = Array.isArray(body.instrumentation)
          ? body.instrumentation.filter((s) => typeof s === 'string' && s.trim())
          : []
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
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, skipped: true }))
          return
        }

        if (!title || !slug) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'title and slug are required when adding a work.' }))
          return
        }
        if (!description) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'description is required when adding a work.' }))
          return
        }
        if (!thumbnailUploaded) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'thumbnail image is required when adding a work.' }))
          return
        }
        if (youtubeUrl && !isValidHttpUrl(youtubeUrl)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'youtubeUrl must be a valid URL (http/https).' }))
          return
        }
        if (sheetMusicUrl && !isValidHttpUrl(sheetMusicUrl)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'sheetMusicUrl must be a valid URL (http/https).' }))
          return
        }

        // Build work.yaml data
        const today = new Date().toISOString().split('T')[0]
        const workData = {
          title,
          subtitle: subtitle || '',
          description,
          thumbnail: {
            alt: thumbnailAlt || title,
            crop: '',
          },
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

        // If audio was uploaded, add a recording entry
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
        fs.writeFileSync(
          path.join(workDir, 'work.yaml'),
          yaml.dump(workData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        removeStarterWorksIfNeeded()

        console.log(`[setup] Work created: ${slug}`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, slug }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to create work: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Deploy API ──────────────────────────────────────────
    if (pathname === SETUP_DEPLOY_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      try {
        const body = await readJsonRequestBody(req)
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

        fs.writeFileSync(
          DEPLOY_CONFIG_PATH,
          yaml.dump(deployData, { lineWidth: 120, noRefs: true, sortKeys: false }),
          'utf8',
        )

        console.log(`[setup] Deploy config saved: ${sftpHost}`)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to save deploy config: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Status API ──────────────────────────────────────────
    if (pathname === SETUP_STATUS_API_PATH && req.method === 'GET') {
      try {
        const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
        const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}

        const brandRaw = fs.existsSync(BRAND_LOGO_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(BRAND_LOGO_CONFIG_PATH, 'utf8'))
          : {}
        const brandData = brandRaw && typeof brandRaw === 'object' ? brandRaw : {}

        const themeRaw = fs.existsSync(THEME_CONFIG_PATH) ? yaml.load(fs.readFileSync(THEME_CONFIG_PATH, 'utf8')) : {}
        const themeData = themeRaw && typeof themeRaw === 'object' ? themeRaw : {}

        const socialRaw = fs.existsSync(SOCIAL_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(SOCIAL_CONFIG_PATH, 'utf8'))
          : {}
        const socialData = socialRaw && typeof socialRaw === 'object' ? socialRaw : {}

        const homeRaw = fs.existsSync(HOME_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(HOME_CONFIG_PATH, 'utf8'))
          : {}
        const homeFileData = homeRaw && typeof homeRaw === 'object' ? homeRaw : {}
        // Extract hero section tagline data from nested sections array
        const heroSection = Array.isArray(homeFileData.sections)
          ? homeFileData.sections.find((s) => s?.block?.discriminant === 'hero')
          : null
        const heroFileData = heroSection?.block?.value || {}

        const contactRaw = fs.existsSync(CONTACT_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(CONTACT_CONFIG_PATH, 'utf8'))
          : {}
        const contactData = contactRaw && typeof contactRaw === 'object' ? contactRaw : {}

        const perusalRaw = fs.existsSync(PERUSAL_ACCESS_CONFIG_PATH)
          ? yaml.load(fs.readFileSync(PERUSAL_ACCESS_CONFIG_PATH, 'utf8'))
          : {}
        const perusalData = perusalRaw && typeof perusalRaw === 'object' ? perusalRaw : {}

        const composerName = siteData.composerName || 'FirstName LastName'

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: true,
            site: {
              composerName,
              email: siteData.email || '',
              siteTitle: siteData.siteTitle || '',
              siteDescription: siteData.siteDescription || '',
            },
            brand: {
              firstName: brandData.firstName || '',
              lastName: brandData.lastName || '',
            },
            theme: {
              currentThemeId: themeData.currentThemeId || '',
            },
            social: {
              links: Array.isArray(socialData.links) ? socialData.links : [],
            },
            homepage: {
              heroTagline: heroFileData.heroTagline || '',
              heroTaglineAsBlockquote: heroFileData.heroTaglineAsBlockquote === true,
              heroTaglineCitation: heroFileData.heroTaglineCitation || '',
            },
            forms: {
              contactFormEnabled: contactData.contactFormEnabled === true,
              contactWebhookUrl: contactData.contactWebhookUrl || '',
              perusalGatingEnabled: perusalData.gatingEnabled !== false,
              perusalWebhookUrl: perusalData.webhookUrl || '',
              perusalTokenSecret: perusalData.tokenSecret || '',
              perusalTokenExpirationDays: perusalData.tokenExpirationDays || 90,
            },
            isPlaceholder: composerName === 'FirstName LastName',
          }),
        )
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Failed to read setup status: ' + err.message }))
      }
      return
    }

    // ── Setup Wizard: Finalize (runs ingest pipeline) ─────────────────────
    if (pathname === SETUP_FINALIZE_API_PATH) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'POST, OPTIONS')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      // Force a one-time Keystatic cache reset on next /keystatic load.
      // This runs before the editor mounts, avoiding manual in-session DB
      // clears that can leave singletons stuck in a loading state.
      markKeystaticPostSetupReset()

      // Respond immediately so the wizard doesn't wait — run the pipeline async.
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))

      // Run the full works pipeline in the background:
      // 1. ingest-works — converts source/works/ YAML → src/content/works/ MDX
      // 2. generate-works-images — creates webp thumbnails from ingested images
      // 3. generate-page-search-index — rebuilds the search index with new works
      ;(async () => {
        try {
          console.log('[setup] Running works ingest pipeline…')
          await spawnScript(path.join(ROOT, 'scripts', 'ingest-works.mjs'))
          console.log('[setup] Works ingest complete. Running data generation…')
          await spawnScript(path.join(ROOT, 'scripts', 'generate-works-images.mjs'))
          console.log('[setup] Works images generated.')
          await spawnScript(path.join(ROOT, 'scripts', 'generate-page-search-index.mjs'))
          console.log('[setup] Search index rebuilt. Works pipeline done.')
        } catch (err) {
          console.error('[setup] Works pipeline error:', err.message)
        }
      })()
      return
    }

    // ── Works Data API ─────────────────────────────────────────────────────
    if (pathname === '/api/works-data' && req.method === 'GET') {
      try {
        const data = gatherWorksData()
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(data))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
      return
    }

    // ── Works Search HTML page ─────────────────────────────────────────────
    if (pathname === '/works-search' || pathname === '/works-search/') {
      try {
        const html = fs.readFileSync(WORKS_SEARCH_HTML_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Works search page not found: ' + err.message)
      }
      return
    }

    // ── Keystatic Admin HTML ───────────────────────────────────────────────
    // Serve keystatic.html directly and run it through Vite's HTML transform
    // pipeline (injects React HMR preamble, processes script modules, etc.)
    // We serve it directly rather than rewriting + next() because Astro's
    // intermediate middleware layers would intercept the rewritten request.
    if (pathname === '/keystatic' || pathname.startsWith('/keystatic/')) {
      try {
        const requestHost = req.headers.host ?? ''
        const canonicalHost = requestHost.replace(/^localhost(?=[:]|$)/, '127.0.0.1')
        if (canonicalHost && canonicalHost !== requestHost) {
          res.writeHead(307, { Location: `http://${canonicalHost}${rawUrl}` })
          res.end()
          return
        }

        const htmlPath = path.join(ROOT, 'keystatic.html')
        let html = fs.readFileSync(htmlPath, 'utf-8')
        // Inject toolbar (Build/Preview/Publish buttons, Mod+S, etc.)
        html = injectToolbarIntoHtml(html)
        // Run through Vite's HTML transform pipeline (HMR preamble, module scripts, etc.)
        html = await viteServer.transformIndexHtml('/keystatic.html', html)

        // Isolate browser caches per project root. Without this, running a
        // second starter project on the same origin can restore stale Keystatic
        // drafts/tree caches from another repo, showing blank fields and
        // persistent "Unsaved" state.
        const forcePostSetupReset = consumeKeystaticPostSetupResetMarker()
        const cacheIsolationScript = [
          '<script>',
          '(function(){',
          `  var KEY=${JSON.stringify(KEYSTATIC_CACHE_NAMESPACE_STORAGE_KEY)};`,
          `  var ID=${JSON.stringify(KEYSTATIC_CACHE_NAMESPACE)};`,
          `  var FORCE_POST_SETUP_RESET=${forcePostSetupReset ? 'true' : 'false'};`,
          '  try{',
          '    var prev=window.localStorage.getItem(KEY);',
          '    if(prev!==ID||FORCE_POST_SETUP_RESET){',
          '      window.localStorage.setItem(KEY,ID);',
          '      try{window.indexedDB.deleteDatabase("keystatic")}catch(_e){}',
          '      try{window.indexedDB.deleteDatabase("keystatic-trees")}catch(_e){}',
          '      try{window.indexedDB.deleteDatabase("keystatic-blobs")}catch(_e){}',
          '    }',
          // Guard against stale multiplayer toggle keys in local mode.
          // Any truthy ks-multiplayer key can make Keystatic wait on Yjs sync.
          '    try{',
          '      for(var i=window.localStorage.length-1;i>=0;i--){',
          '        var key=window.localStorage.key(i);',
          '        if(key && (key==="ks-multiplayer" || key.indexOf("ks-multiplayer-")===0)){',
          '          window.localStorage.removeItem(key);',
          '        }',
          '      }',
          '    }catch(_e){}',
          '  }catch(_e){}',
          '})();',
          '</script>',
        ].join('')

        // Astro pages handle the converted jv:vite-full-reload event via
        // sourceYamlReloadBridge. Keystatic is a standalone HTML entry, so it
        // needs its own listener or it can remain in a mixed module state until
        // a manual hard refresh.
        const keystaticReloadBridgeScript = [
          '<script type="module">',
          'if(import.meta.hot){',
          '  import.meta.hot.on("jv:vite-full-reload",function(){',
          '    window.location.reload()',
          '  })',
          '}',
          '</script>',
        ].join('')

        html = html.replace('<head>', '<head>' + cacheIsolationScript + keystaticReloadBridgeScript)

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch (err) {
        console.error('[keystatic-html]', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Failed to serve Keystatic admin: ' + err.message)
      }
      return
    }

    // Not a Keystatic route — pass through to Astro's handlers
    next()
  }

  return {
    name: 'keystatic-dev',

    configureServer(server) {
      viteServer = server

      // Start the source/works/ file watcher
      startWorksWatcher()

      // Kill preview process on server close
      server.httpServer?.on('close', () => {
        previewProcess?.kill()
      })

      // Return callback: runs AFTER Vite's internal middleware is set up.
      // Using unshift ensures our middleware runs before Astro's trailing
      // slash middleware (which also uses unshift but is registered earlier).
      return () => {
        server.middlewares.stack.unshift({
          route: '',
          handle: combinedMiddleware,
        })
      }
    },
  }
}

// ─── Astro Integration ───────────────────────────────────────────────────────

export default function keystatic_DevServerIntegration() {
  return {
    name: 'keystatic-dev-server',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        // Only register Keystatic plugins in dev mode
        if (command !== 'dev') return

        updateConfig({
          vite: {
            plugins: [keystatic_DevPlugin()],
            optimizeDeps: {
              include: ['react', 'react-dom', '@keystatic/core'],
              // Keep optimized dependency URLs project-specific even when
              // multiple starter projects run on the same origin/port.
              // This reduces cross-project browser cache collisions that can
              // surface as duplicate React/Yjs runtime state on first load.
              esbuildOptions: {
                banner: {
                  js: `/* project:${KEYSTATIC_CACHE_NAMESPACE} */`,
                },
              },
            },
          },
        })
      },
    },
  }
}
