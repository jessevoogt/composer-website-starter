// Shared helper functions for the Keystatic dev server integration.

import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { spawn } from 'child_process'
import yaml from 'js-yaml'

import {
  ROOT,
  SOURCE_DIR,
  HEROES_DIR,
  KEYSTATIC_POST_SETUP_RESET_MARKER_PATH,
  TREE_SCAN_SKIP_DIRS,
  THEME_COLOR_KEYS,
  THEME_LIBRARY_PATH,
  VALID_BORDER_RADIUS,
  IMAGE_EXTS_SEARCH,
  LOCAL_DEV_HOST,
  ASTRO_PORT,
  LIVE_URL,
} from './constants.mjs'

// ─── Helper: spawn a Node script ─────────────────────────────────────────────

export function spawnScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], { stdio: 'inherit', cwd: ROOT })
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
}

// ─── Helper: read JSON body from a Connect request ───────────────────────────

export function readJsonRequestBody(req) {
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

export function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

export function markKeystaticPostSetupReset() {
  try {
    fs.writeFileSync(KEYSTATIC_POST_SETUP_RESET_MARKER_PATH, String(Date.now()), 'utf8')
  } catch (err) {
    console.warn('[setup] Failed to mark Keystatic reset:', err.message)
  }
}

export function consumeKeystaticPostSetupResetMarker() {
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

export function toGitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8')
  return crypto
    .createHash('sha1')
    .update(header)
    .update(buffer)
    .digest('hex')
}

export function normalizeDirectoryPath(dirPath) {
  return String(dirPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

function makeTreeNode(name, relPath) {
  return { type: 'tree', name, relPath, children: new Map(), sha: '' }
}

export async function buildKeystaticTreeEntries(baseDir, allowedDirectories) {
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

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Hero Preference helpers ─────────────────────────────────────────────────

export function resolvePreferredHeroConfigPath(pageKey) {
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

export function listHeroIds() {
  if (!fs.existsSync(HEROES_DIR)) return []
  return fs
    .readdirSync(HEROES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

export function upsertPreferredHeroInYaml(content, preferredHeroId) {
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

// ─── Theme normalization helpers ─────────────────────────────────────────────

export function normalizeThemeScalar(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeThemeCustomCss(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').trim()
}

export function normalizeThemeBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

export function normalizeThemeHex(value) {
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

export function createDefaultThemeHomeHero(themeId = '') {
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

export function createDefaultThemeAboutPage() {
  return {
    position: 'center',
    maxWidth: 'full',
    profileImagePosition: 'center',
  }
}

export function normalizeThemeAboutPage(input) {
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

export function createDefaultThemeContactPage() {
  return {
    position: 'center',
    maxWidth: 'default',
  }
}

export function normalizeThemeContactPage(input) {
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

export function normalizeThemeHomeHero(input, themeId = '') {
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

export function normalizeThemeRecord(input, fallbackId = 'theme') {
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

export function readThemeLibrary() {
  if (!fs.existsSync(THEME_LIBRARY_PATH)) return []

  try {
    const parsed = yaml.load(fs.readFileSync(THEME_LIBRARY_PATH, 'utf8'))
    const rawThemes = parsed && typeof parsed === 'object' && Array.isArray(parsed.themes) ? parsed.themes : []
    return rawThemes.map((theme, index) => normalizeThemeRecord(theme, `theme-${index + 1}`))
  } catch {
    return []
  }
}

export function writeThemeLibrary(themes) {
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

export function slugifyThemeId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createUniqueThemeId(label, existingThemes) {
  const base = slugifyThemeId(label) || 'theme'
  const existingIds = new Set(existingThemes.map((theme) => theme.id))
  if (!existingIds.has(base)) return base

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

// ─── Slug rename reference updater ───────────────────────────────────────────

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function detectSlugRename(payload, collectionPrefix) {
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

export function updateSlugReferences(oldSlug, newSlug, references) {
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

export function migrateRemainingFiles(collectionPrefix, oldSlug, newSlug) {
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

export function renamePublicDir(publicDir, oldSlug, newSlug) {
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

export function safeYamlRead(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf-8')) || {}
  } catch {
    return {}
  }
}

export function gatherWorksData() {
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

import {
  WORKS_SOURCE_DIR,
  INGEST_SCRIPT,
  CLEANUP_SCRIPT,
  GENERATE_IMAGES_SCRIPT,
  GENERATE_SCORES_SCRIPT,
  GENERATE_SEARCH_SCRIPT,
  WATCHED_EXTENSIONS,
} from './constants.mjs'

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

export function startWorksWatcher() {
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

export function getToolbarHtml() {
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

export function injectToolbarIntoHtml(html) {
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
