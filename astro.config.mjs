import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'url'
import path from 'node:path'
import fs from 'node:fs'
import yaml from 'js-yaml'
import compress from 'astro-compress'
import icon from 'astro-icon'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import mailObfuscation from 'astro-mail-obfuscation'
import heroSwitcherDevToolbar from './src/integrations/hero-switcher-dev-toolbar.mjs'
import keystaticlinkDevToolbar from './src/integrations/keystatic-link-dev-toolbar.mjs'
import themePresetsDevToolbar from './src/integrations/theme-presets-dev-toolbar.mjs'

const SOURCE_DIR = fileURLToPath(new URL('./source', import.meta.url))
const HOME_PAGE_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'home', 'hero.yaml')
const CONTACT_PAGE_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'contact.yaml')
const WORKS_PAGE_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'works.yaml')
const ABOUT_PAGE_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml')
const HERO_SOURCE_DIR = path.join(SOURCE_DIR, 'home', 'hero')
const HERO_PREFERRED_API_PATH = '/api/dev/homepage/preferred-hero'
const THEME_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'theme.yaml')
const THEME_PRESET_API_PATH = '/api/dev/theme/preset'
const HERO_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const HERO_PREFERENCE_PAGE_KEYS = new Set(['home', 'contact', 'works', 'about'])
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
const THEME_HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const DEFAULT_THEME_FONT_BODY = 'Atkinson Hyperlegible'
const DEFAULT_THEME_FONT_HEADING = 'Gothic A1'

function resolvePreferredHeroConfigPath(pageKey) {
  switch (pageKey) {
    case 'contact':
      return CONTACT_PAGE_CONFIG_PATH
    case 'works':
      return WORKS_PAGE_CONFIG_PATH
    case 'about':
      return ABOUT_PAGE_CONFIG_PATH
    case 'home':
    default:
      return HOME_PAGE_CONFIG_PATH
  }
}

function listHeroIds() {
  if (!fs.existsSync(HERO_SOURCE_DIR)) return []
  return fs
    .readdirSync(HERO_SOURCE_DIR)
    .filter((file) => HERO_IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort()
    .map((file) => path.basename(file, path.extname(file)).replace(/^\d+-/, ''))
}

function formatPreferredHeroLine(preferredHeroId) {
  return preferredHeroId ? `preferredHeroId: ${preferredHeroId}` : "preferredHeroId: ''"
}

function upsertPreferredHeroInYaml(content, preferredHeroId) {
  const line = formatPreferredHeroLine(preferredHeroId)
  const lines = content.length > 0 ? content.replace(/\r\n/g, '\n').split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  const existingLineIndex = lines.findIndex((entry) => /^preferredHeroId:\s*/.test(entry))

  if (existingLineIndex >= 0) {
    lines[existingLineIndex] = line
  } else {
    lines.push(line)
  }

  const normalized = lines.join('\n')
  return normalized.length > 0 ? `${normalized}\n` : ''
}

function readJsonRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8').trim()
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })

    req.on('error', reject)
  })
}

function normalizeThemeColorValue(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length === 0) return ''

  const match = normalized.match(THEME_HEX_COLOR_PATTERN)
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

function sanitizeThemeFontValue(value, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.length > 0 ? normalized : fallback
}

function sanitizeThemeOverlayOpacityValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = Math.min(1, Math.max(0, value))
    return String(Math.round(clamped * 1000) / 1000)
  }

  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return ''

  const clamped = Math.min(1, Math.max(0, parsed))
  return String(Math.round(clamped * 1000) / 1000)
}

function escapeYamlSingleQuotedString(value) {
  return value.replace(/'/g, "''")
}

function formatYamlSingleQuoted(value) {
  return `'${escapeYamlSingleQuotedString(value)}'`
}

function readThemeConfigRecord() {
  if (!fs.existsSync(THEME_CONFIG_PATH)) return {}

  try {
    const parsed = yaml.load(fs.readFileSync(THEME_CONFIG_PATH, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function serializeThemeConfigYaml(themeRecord) {
  const lines = [
    '# Theme configuration',
    '# Leave values empty to use the defaults from the design system.',
    '# Colors should be specified as hex values (e.g. #1a1a2e).',
    '',
  ]

  for (const key of THEME_COLOR_KEYS) {
    const normalizedValue = normalizeThemeColorValue(themeRecord[key]) ?? ''
    lines.push(`${key}: ${formatYamlSingleQuoted(normalizedValue)}`)
  }

  const interiorHeroOverlayOpacity = sanitizeThemeOverlayOpacityValue(themeRecord.interiorHeroOverlayOpacity)
  lines.push(`interiorHeroOverlayOpacity: ${formatYamlSingleQuoted(interiorHeroOverlayOpacity)}`)
  const fontBody = sanitizeThemeFontValue(themeRecord.fontBody, DEFAULT_THEME_FONT_BODY)
  const fontHeading = sanitizeThemeFontValue(themeRecord.fontHeading, DEFAULT_THEME_FONT_HEADING)
  lines.push(`fontBody: ${formatYamlSingleQuoted(fontBody)}`)
  lines.push(`fontHeading: ${formatYamlSingleQuoted(fontHeading)}`)

  return `${lines.join('\n')}\n`
}

function devThemePresetApi() {
  return {
    name: 'dev-theme-preset-api',
    configureServer(/** @type {import('vite').ViteDevServer} */ server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : ''
        if (pathname !== THEME_PRESET_API_PATH) return next()

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
          return
        }

        try {
          const body = await readJsonRequestBody(req)
          const colorsPayload = body && typeof body.colors === 'object' ? body.colors : null
          if (!colorsPayload) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Request body must include a colors object.' }))
            return
          }

          const normalizedColors = {}
          for (const key of THEME_COLOR_KEYS) {
            if (!(key in colorsPayload)) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: `Missing color key: ${key}.` }))
              return
            }

            const normalizedColor = normalizeThemeColorValue(colorsPayload[key])
            if (normalizedColor === null) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: `Invalid hex color for ${key}.` }))
              return
            }

            normalizedColors[key] = normalizedColor
          }

          const hasOverlayOverride = Object.prototype.hasOwnProperty.call(body, 'interiorHeroOverlayOpacity')
          const hasFontBodyOverride = Object.prototype.hasOwnProperty.call(body, 'fontBody')
          const hasFontHeadingOverride = Object.prototype.hasOwnProperty.call(body, 'fontHeading')

          const currentThemeRecord = readThemeConfigRecord()
          const nextThemeRecord = {
            ...currentThemeRecord,
            ...normalizedColors,
            interiorHeroOverlayOpacity: sanitizeThemeOverlayOpacityValue(
              hasOverlayOverride ? body.interiorHeroOverlayOpacity : currentThemeRecord.interiorHeroOverlayOpacity,
            ),
            fontBody: sanitizeThemeFontValue(
              hasFontBodyOverride ? body.fontBody : currentThemeRecord.fontBody,
              DEFAULT_THEME_FONT_BODY,
            ),
            fontHeading: sanitizeThemeFontValue(
              hasFontHeadingOverride ? body.fontHeading : currentThemeRecord.fontHeading,
              DEFAULT_THEME_FONT_HEADING,
            ),
          }

          const nextContent = serializeThemeConfigYaml(nextThemeRecord)
          fs.mkdirSync(path.dirname(THEME_CONFIG_PATH), { recursive: true })
          fs.writeFileSync(THEME_CONFIG_PATH, nextContent, 'utf-8')

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, colors: normalizedColors }))
        } catch {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Failed to persist theme preset.' }))
        }
      })
    },
  }
}

function devPreferredHeroApi() {
  return {
    name: 'dev-preferred-hero-api',
    configureServer(/** @type {import('vite').ViteDevServer} */ server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : ''
        if (pathname !== HERO_PREFERRED_API_PATH) return next()

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
          return
        }

        try {
          const body = await readJsonRequestBody(req)
          const requestedId = typeof body.preferredHeroId === 'string' ? body.preferredHeroId.trim() : null
          const pageKeyRaw = typeof body.pageKey === 'string' ? body.pageKey.trim().toLowerCase() : 'home'

          if (requestedId === null) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'preferredHeroId must be a string.' }))
            return
          }

          if (!HERO_PREFERENCE_PAGE_KEYS.has(pageKeyRaw)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'pageKey must be one of home, contact, works, about.' }))
            return
          }

          const heroIds = listHeroIds()
          if (requestedId !== '' && !heroIds.includes(requestedId)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Unknown hero id.', heroIds }))
            return
          }

          const configPath = resolvePreferredHeroConfigPath(pageKeyRaw)
          const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
          const nextContent = upsertPreferredHeroInYaml(current, requestedId)

          if (nextContent !== current) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true })
            fs.writeFileSync(configPath, nextContent, 'utf-8')
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, preferredHeroId: requestedId, pageKey: pageKeyRaw }))
        } catch {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Failed to persist preferred hero id.' }))
        }
      })
    },
  }
}

/**
 * Vite plugin: watch `source/` YAML files for changes and trigger a full page
 * reload so that Keystatic CMS edits are reflected immediately in the dev
 * server without a manual browser refresh.
 */
function sourceYamlHmr() {
  return {
    name: 'source-yaml-hmr',
    configureServer(/** @type {import('vite').ViteDevServer} */ server) {
      server.watcher.add(path.join(SOURCE_DIR, '**/*.yaml'))
      server.watcher.on('change', (/** @type {string} */ file) => {
        if (file.startsWith(SOURCE_DIR) && file.endsWith('.yaml')) {
          server.ws.send({ type: 'full-reload', path: '*' })
        }
      })
    },
  }
}

/** Rehype plugin: add target="_blank" and rel attributes to external links in MDX body content. */
function rehypeExternalLinks() {
  return function (/** @type {{ children?: unknown[] }} */ tree) {
    function walk(
      /** @type {{ type?: string; tagName?: string; properties?: Record<string, unknown>; children?: unknown[] }} */ node,
    ) {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href
        if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
          node.properties.target = '_blank'
          node.properties.rel = ['nofollow', 'noopener', 'noreferrer']
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

// https://astro.build/config
export default defineConfig({
  compressHTML: true,
  trailingSlash: 'always',
  output: 'static',
  prefetch: {
    prefetchAll: true,
  },
  site: 'https://example.com',
  integrations: [
    compress(),
    icon(),
    mdx({ rehypePlugins: [rehypeExternalLinks] }),
    sitemap(),
    mailObfuscation(),
    heroSwitcherDevToolbar(),
    themePresetsDevToolbar(),
    keystaticlinkDevToolbar(),
  ],
  vite: {
    plugins: [sourceYamlHmr(), devPreferredHeroApi(), devThemePresetApi()],
    resolve: {
      alias: {
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
        '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
        '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
        '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
        '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
        '@public': fileURLToPath(new URL('./public', import.meta.url)),
        '@post-images': fileURLToPath(new URL('./public/posts', import.meta.url)),
        '@works-images': fileURLToPath(new URL('./public/works', import.meta.url)),
      },
    },
  },
})
