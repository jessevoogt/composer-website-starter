#!/usr/bin/env node
// Standalone Keystatic dev server — runs independently of the Astro dev server.
// Avoids the trailingSlash:'always' conflict when Keystatic is embedded in Astro.
//
// Usage:  npm run keystatic
// Opens:  http://localhost:4322/keystatic/

import { createServer } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import { spawn, execSync } from 'child_process'
import react from '@vitejs/plugin-react'
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const PORT = Number(process.env.KEYSTATIC_PORT || 4322)
const ASTRO_DEV_URL = `http://localhost:${process.env.ASTRO_PORT || 4321}/`
const ASTRO_PORT = Number(process.env.ASTRO_PORT || 4321)
const SOURCE_DIR = path.join(root, 'source')
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
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const LIVE_URL = pkg.homepage || ''
const DEPLOY_SCRIPT = path.join(root, 'scripts', 'deploy.mjs')
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4323)
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`
const DEPLOY_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'deploy.yaml')
const DEPLOY_SINGLETON_PATH = '/keystatic/singleton/deploy'

let buildRunning = false
let publishRunning = false
let previewProcess = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getListeningPids(port) {
  const normalizedPort = Number(port)
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) return []

  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${normalizedPort} | findstr LISTENING`, { encoding: 'utf8' }).trim()
      if (!output) return []

      const pids = new Set()
      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts[parts.length - 1])
        if (Number.isInteger(pid)) pids.add(pid)
      }
      return [...pids]
    }

    const output = execSync(`lsof -n -iTCP:${normalizedPort} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim()
    if (!output) return []
    return [
      ...new Set(
        output
          .split('\n')
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid)),
      ),
    ]
  } catch {
    return []
  }
}

function terminatePid(pid) {
  if (!Number.isInteger(pid)) return
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' })
    return
  }
  process.kill(pid, 'SIGKILL')
}

async function forceFreePort(port, label) {
  const pids = getListeningPids(port).filter((pid) => pid !== process.pid)
  if (pids.length === 0) return

  const target = label ? `${label} port` : 'port'
  console.warn(`[startup] ${target} ${port} is in use. Terminating existing process(es): ${pids.join(', ')}`)

  for (const pid of pids) {
    try {
      terminatePid(pid)
    } catch {
      // Process may have already exited.
    }
  }

  await sleep(400)

  const remainingPids = getListeningPids(port).filter((pid) => pid !== process.pid)
  if (remainingPids.length > 0) {
    throw new Error(`Port ${port} is still in use after termination attempt: ${remainingPids.join(', ')}`)
  }
}

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

function loadDeployConfigRecord() {
  if (!fs.existsSync(DEPLOY_CONFIG_PATH)) return {}

  try {
    const parsed = yaml.load(fs.readFileSync(DEPLOY_CONFIG_PATH, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readPublishConfigStatus() {
  const deployConfig = loadDeployConfigRecord()

  // Keystatic publish preflight intentionally validates only the Keystatic-managed
  // deploy singleton so users are routed to the in-app Deployment form when incomplete.
  const sftpHost = String(deployConfig.sftpHost || '').trim()
  const sftpUser = String(deployConfig.sftpUser || '').trim()
  const sftpRemotePath = String(deployConfig.sftpRemotePath || '')
    .trim()
    .replace(/\/$/, '')

  const missing = []
  if (!sftpHost) missing.push('SFTP_HOST')
  if (!sftpUser) missing.push('SFTP_USER')
  if (!sftpRemotePath) missing.push('SFTP_REMOTE_PATH')

  return {
    complete: missing.length === 0,
    missing,
    configurePath: DEPLOY_SINGLETON_PATH,
  }
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

// Load keystatic config via Vite's module runner (handles TypeScript)
// We start Vite first, then import the config through it.

const apiPlugin = {
  name: 'keystatic-api',
  async configureServer(server) {
    let apiHandler = null

    // Lazily initialise handler once Vite has transpiled the config
    async function getHandler() {
      if (apiHandler) return apiHandler
      const mod = await server.ssrLoadModule(path.join(root, 'keystatic.config.ts'))
      const config = mod.default || mod
      apiHandler = makeGenericAPIRouteHandler({ config }, {})
      return apiHandler
    }

    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/keystatic')) return next()

      try {
        const handler = await getHandler()
        const body = await new Promise((resolve) => {
          const chunks = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => resolve(Buffer.concat(chunks)))
        })
        const headers = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v
        }
        const request = new Request(`http://localhost:${PORT}${req.url}`, {
          method: req.method,
          headers,
          body: body.length > 0 ? body : undefined,
        })
        const response = await handler(request)
        // makeGenericAPIRouteHandler returns { status, body, headers? }
        // body is a string; headers may be a Headers instance, array of pairs, or plain object
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
        res.writeHead(response.status, headersObj)
        res.end(response.body ?? '')
      } catch (e) {
        console.error('[keystatic-api]', e)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  },
}

const htmlPlugin = {
  name: 'keystatic-html',
  configureServer(server) {
    // Rewrite all /keystatic/* routes to /keystatic.html so Vite's own
    // HTML pipeline handles it (injects React HMR preamble etc.)
    server.middlewares.use((req, res, next) => {
      if (req.url === '/') {
        res.writeHead(302, { Location: '/keystatic/' })
        res.end()
        return
      }
      if (req.url?.startsWith('/keystatic/') || req.url === '/keystatic') {
        req.url = '/keystatic.html'
      }
      next()
    })
  },
}

const preferredHeroApiPlugin = {
  name: 'keystatic-preferred-hero-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : ''
      if (pathname !== HERO_PREFERRED_API_PATH) return next()

      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
      const localhostAstroOrigin = `http://localhost:${ASTRO_PORT}`
      const allowOrigin = origin === localhostAstroOrigin || origin === `http://127.0.0.1:${ASTRO_PORT}` ? origin : '*'

      res.setHeader('Access-Control-Allow-Origin', allowOrigin)
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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

const themePresetApiPlugin = {
  name: 'keystatic-theme-preset-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : ''
      if (pathname !== THEME_PRESET_API_PATH) return next()

      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
      const localhostAstroOrigin = `http://localhost:${ASTRO_PORT}`
      const allowOrigin = origin === localhostAstroOrigin || origin === `http://127.0.0.1:${ASTRO_PORT}` ? origin : '*'

      res.setHeader('Access-Control-Allow-Origin', allowOrigin)
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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

const buildPlugin = {
  name: 'keystatic-build',

  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/api/publish/config-status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(readPublishConfigStatus()))
        return
      }

      if (req.url === '/api/build' && req.method === 'POST') {
        if (buildRunning || publishRunning) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'busy', error: 'A build or publish is already in progress' }))
          return
        }

        buildRunning = true
        console.log('\n[build] Starting build:content...')
        try {
          await new Promise((resolve, reject) => {
            const proc = spawn('npm', ['run', 'build:content'], { stdio: 'inherit', cwd: root, shell: false })
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

      if (req.url === '/api/publish' && req.method === 'POST') {
        const publishConfigStatus = readPublishConfigStatus()
        if (!publishConfigStatus.complete) {
          res.writeHead(412, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'config_incomplete', ...publishConfigStatus }))
          return
        }

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

      if (req.url === '/api/preview' && req.method === 'POST') {
        // If already running, just return the URL — client will open it
        if (previewProcess) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'running', url: PREVIEW_URL }))
          return
        }

        const distDir = path.join(root, 'dist')
        if (!fs.existsSync(distDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'error', error: 'No dist/ found — run Build first.' }))
          return
        }

        console.log(`\n[preview] Starting astro preview on port ${PREVIEW_PORT}...`)

        await forceFreePort(PREVIEW_PORT, 'Preview')

        previewProcess = spawn(
          'node',
          ['node_modules/.bin/astro', 'preview', '--port', String(PREVIEW_PORT), '--host', '127.0.0.1'],
          { stdio: 'inherit', cwd: root }
        )
        previewProcess.on('exit', () => {
          console.log('[preview] Preview server stopped.')
          previewProcess = null
        })
        previewProcess.on('error', (err) => {
          console.error(`[preview] Error — ${err.message}`)
          previewProcess = null
        })

        // Give astro preview a moment to bind the port before returning
        await new Promise((resolve) => setTimeout(resolve, 1200))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'started', url: PREVIEW_URL }))
        return
      }

      next()
    })
  },

  transformIndexHtml(html, ctx) {
    // Only inject into the Keystatic HTML shell
    if (!ctx.path?.startsWith('/keystatic')) return html
    return [
      {
        tag: 'style',
        injectTo: 'head',
        children: `
          #jv-toolbar {
            position: fixed; bottom: 24px; right: 24px; z-index: 99999;
            display: flex; gap: 8px; align-items: center;
            font-family: system-ui, -apple-system, sans-serif;
          }
          .jv-btn {
            display: inline-flex; align-items: center;
            padding: 9px 18px; background: #18181b; color: #fafafa;
            border: 1px solid #3f3f46; border-radius: 8px;
            font-size: 13px; font-weight: 500; cursor: pointer; letter-spacing: 0.01em;
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            transition: background 0.15s, border-color 0.15s, opacity 0.15s;
            text-decoration: none;
          }
          .jv-btn:hover:not([disabled]) { background: #27272a; border-color: #52525b; }
          .jv-btn[disabled] { opacity: 0.65; cursor: default; }
          #jv-build-btn.jv-success      { background: #14532d; border-color: #16a34a; }
          #jv-build-btn.jv-error        { background: #450a0a; border-color: #dc2626; }
          #jv-preview-btn.jv-error      { background: #450a0a; border-color: #dc2626; }
          #jv-publish-btn.jv-success    { background: #14532d; border-color: #16a34a; }
          #jv-publish-btn.jv-error      { background: #450a0a; border-color: #dc2626; }
        `,
      },
      {
        tag: 'script',
        injectTo: 'body',
        children: `
          (function () {
            var toolbar = document.createElement('div')
            toolbar.id = 'jv-toolbar'

            var devBtn = document.createElement('a')
            devBtn.id = 'jv-dev-btn'
            devBtn.className = 'jv-btn'
            devBtn.href = ${JSON.stringify(ASTRO_DEV_URL)}
            devBtn.target = '_blank'
            devBtn.rel = 'noopener noreferrer'
            devBtn.textContent = 'Dev'
            toolbar.appendChild(devBtn)

            ${LIVE_URL ? `
            var liveBtn = document.createElement('a')
            liveBtn.id = 'jv-live-btn'
            liveBtn.className = 'jv-btn'
            liveBtn.href = ${JSON.stringify(LIVE_URL)}
            liveBtn.target = '_blank'
            liveBtn.rel = 'noopener noreferrer'
            liveBtn.textContent = '↗ Live'
            toolbar.appendChild(liveBtn)
            ` : ''}

            var btn = document.createElement('button')
            btn.id = 'jv-build-btn'
            btn.className = 'jv-btn'
            btn.textContent = '⚙ Build'
            toolbar.appendChild(btn)

            var previewBtn = document.createElement('button')
            previewBtn.id = 'jv-preview-btn'
            previewBtn.className = 'jv-btn'
            previewBtn.textContent = '▶ Preview'
            toolbar.appendChild(previewBtn)

            var pubBtn = document.createElement('button')
            pubBtn.id = 'jv-publish-btn'
            pubBtn.className = 'jv-btn'
            pubBtn.textContent = '⬆ Publish'
            toolbar.appendChild(pubBtn)

            document.body.appendChild(toolbar)

            // Keystatic already handles mod+s for collection item forms, but not
            // singleton forms. Submit singleton-form on mod+s.
            document.addEventListener('keydown', function (event) {
              var isSaveHotkey = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's'
              if (!isSaveHotkey) return

              var singletonForm = document.getElementById('singleton-form')
              if (!(singletonForm instanceof HTMLFormElement)) return

              event.preventDefault()
              if (typeof singletonForm.requestSubmit === 'function') {
                singletonForm.requestSubmit()
              } else {
                singletonForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
              }
            })

            var buildBusy = false
            var publishBusy = false

            function resetBtn(b, label) {
              b.className = 'jv-btn'
              b.textContent = label
              b.disabled = false
            }

            // ── Build ──────────────────────────────────────────────────────────

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

            // ── Preview ────────────────────────────────────────────────────────

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

            // ── Publish ────────────────────────────────────────────────────────

            pubBtn.addEventListener('click', async () => {
              try {
                const statusRes = await fetch('/api/publish/config-status')
                if (statusRes.ok) {
                  const statusData = await statusRes.json()
                  if (statusData && statusData.complete === false) {
                    var configurePath = typeof statusData.configurePath === 'string' && statusData.configurePath
                      ? statusData.configurePath
                      : '/keystatic/singleton/deploy'
                    window.location.assign(configurePath)
                    return
                  }
                }
              } catch (e) {
                console.error('[publish-config]', e)
              }

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
                } else if (res.status === 412 && data && data.configurePath) {
                  resetBtn(pubBtn, '⬆ Publish')
                  publishBusy = false
                  window.location.assign(data.configurePath)
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
          })()
        `,
      },
    ]
  },
}

await forceFreePort(PORT, 'Keystatic')

const server = await createServer({
  root,
  // Use a dedicated cache dir so Keystatic's dep optimisation (react, react-dom,
  // @keystatic/core) is never cleared by Astro's own Vite instance, which also
  // writes to node_modules/.vite/ and would otherwise trigger a re-bundle on
  // every cold start — causing the UI to fail while optimisation is in progress.
  cacheDir: path.join(root, 'node_modules', '.vite-keystatic'),
  server: { port: PORT, host: '127.0.0.1' },
  plugins: [react(), apiPlugin, preferredHeroApiPlugin, themePresetApiPlugin, htmlPlugin, buildPlugin],
  optimizeDeps: {
    include: ['react', 'react-dom', '@keystatic/core'],
  },
})

await server.listen()
server.printUrls()

// ─── Graceful shutdown — release port 4322 cleanly on Ctrl+C / SIGTERM ───────

const shutdown = () => {
  previewProcess?.kill()
  server.close().finally(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ─── Watch source/works/ and re-run the full pipeline on changes ─────────────

const WORKS_SOURCE_DIR = path.join(root, 'source', 'works')
const INGEST_SCRIPT = path.join(root, 'scripts', 'ingest-works.mjs')
const CLEANUP_SCRIPT = path.join(root, 'scripts', 'cleanup-generated-files.mjs')
const GENERATE_IMAGES_SCRIPT = path.join(root, 'scripts', 'generate-works-images.mjs')
const GENERATE_SCORES_SCRIPT = path.join(root, 'scripts', 'generate-perusal-scores.mjs')
const GENERATE_SEARCH_SCRIPT = path.join(root, 'scripts', 'generate-page-search-index.mjs')

// File types that should trigger the pipeline
const WATCHED_EXTENSIONS = new Set([
  '.yaml',                          // Keystatic edits
  '.md',                            // prose.md body content
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', // thumbnail / recording photos
  '.mp3', '.wav', '.aiff', '.flac', // audio recordings
  '.pdf',                           // perusal scores
])

function spawnScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], { stdio: 'inherit', cwd: root })
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
}

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

if (fs.existsSync(WORKS_SOURCE_DIR)) {
  fs.watch(WORKS_SOURCE_DIR, { recursive: true }, (event, filename) => {
    if (!filename) return
    const ext = path.extname(filename).toLowerCase()
    if (!WATCHED_EXTENSIONS.has(ext)) return
    clearTimeout(pipelineTimer)
    pipelineTimer = setTimeout(runPipeline, 300)
  })
  console.log('[watch] watching source/works/ for changes (YAML, prose, images, audio, PDFs)...')
} else {
  console.warn('[watch] source/works/ not found — file watching disabled')
}
