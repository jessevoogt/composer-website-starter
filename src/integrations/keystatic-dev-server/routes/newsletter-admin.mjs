// Newsletter admin page and proxy API endpoints.
//
// Serves the newsletter admin HTML page at /newsletter/ and provides
// local proxy endpoints that inject the Bearer token (read from api/.env)
// so the browser never handles secrets directly.
//
// Routes:
//   GET  /newsletter                        → admin HTML page
//   GET  /api/dev/newsletter/config          → config check (has secret, endpoint)
//   GET  /api/dev/newsletter/subscribers     → proxy GET /newsletter/subscribers
//   POST /api/dev/newsletter/send            → proxy POST /newsletter/send
//   GET  /api/dev/newsletter/templates       → list .txt files in newsletters/
//   GET  /api/dev/newsletter/templates/:name → read a template file

import fs from 'fs'
import path from 'path'
import { ROOT } from '../constants.mjs'
import { readJsonRequestBody } from '../helpers.mjs'

const NEWSLETTER_ADMIN_HTML_PATH = path.join(ROOT, 'scripts', 'newsletter-admin.html')
const NEWSLETTERS_DIR = path.join(ROOT, 'newsletters')
const API_ENV_PATH = path.join(ROOT, 'api', '.env')

// ── Read api/.env for newsletter config ──────────────────────────────────

function loadApiEnv() {
  if (!fs.existsSync(API_ENV_PATH)) return {}
  const env = {}
  for (const line of fs.readFileSync(API_ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function getNewsletterConfig() {
  const env = loadApiEnv()
  const secret = env.NEWSLETTER_SECRET || ''
  const frontendUrl = (env.FRONTEND_URL || '').replace(/\/$/, '')
  const apiEndpoint = (env.API_ENDPOINT || '').replace(/\/$/, '') || (frontendUrl ? frontendUrl + '/api' : '/api')
  const ownerEmail = env.CONTACT_RECIPIENT || env.FROM_EMAIL || ''
  return { secret, apiEndpoint, ownerEmail }
}

// ── Serve newsletter admin HTML page ─────────────────────────────────────

export async function handleNewsletterAdmin(req, res) {
  try {
    const html = fs.readFileSync(NEWSLETTER_ADMIN_HTML_PATH, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Newsletter admin page not found: ' + err.message)
  }
}

// ── Config check endpoint ────────────────────────────────────────────────

export async function handleNewsletterConfig(req, res) {
  const { secret, apiEndpoint, ownerEmail } = getNewsletterConfig()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    hasSecret: secret !== '',
    apiEndpoint: apiEndpoint,
    ownerEmail: ownerEmail || '',
  }))
}

// ── Proxy: GET /newsletter/subscribers ───────────────────────────────────

export async function handleNewsletterSubscribersProxy(req, res) {
  const { secret, apiEndpoint } = getNewsletterConfig()

  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const upstream = await fetch(apiEndpoint + '/newsletter/subscribers', {
      headers: { Authorization: 'Bearer ' + secret },
    })

    const data = await upstream.json()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Cannot reach API: ' + err.message }))
  }
}

// ── Proxy: GET /newsletter/subscribers/detail?id=xxx ────────────────────

export async function handleNewsletterSubscriberDetailProxy(req, res) {
  const { secret, apiEndpoint } = getNewsletterConfig()

  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const qs = new URL(req.url, 'http://localhost').search
    const upstream = await fetch(apiEndpoint + '/newsletter/subscribers/detail' + qs, {
      headers: { Authorization: 'Bearer ' + secret },
    })

    const data = await upstream.json()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Cannot reach API: ' + err.message }))
  }
}

// ── Proxy: POST /newsletter/subscribers/delete ──────────────────────────

export async function handleNewsletterSubscribersDeleteProxy(req, res) {
  const { secret, apiEndpoint } = getNewsletterConfig()
  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)
    const upstream = await fetch(apiEndpoint + '/newsletter/subscribers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Cannot reach API: ' + err.message }))
  }
}

// ── Proxy: POST /newsletter/subscribers/update ──────────────────────────

export async function handleNewsletterSubscribersUpdateProxy(req, res) {
  const { secret, apiEndpoint } = getNewsletterConfig()
  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)
    const upstream = await fetch(apiEndpoint + '/newsletter/subscribers/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Cannot reach API: ' + err.message }))
  }
}

// ── Proxy: POST /newsletter/send ─────────────────────────────────────────

export async function handleNewsletterSendProxy(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const { secret, apiEndpoint, ownerEmail } = getNewsletterConfig()

  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)

    const upstream = await fetch(apiEndpoint + '/newsletter/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + secret,
      },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()

    // If test send, include the owner email for the UI message
    if (body.testOnly && data.success) {
      data.recipient = ownerEmail
    }

    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Cannot reach API: ' + err.message }))
  }
}

// ── Templates: list ──────────────────────────────────────────────────────

export async function handleNewsletterTemplatesList(req, res) {
  try {
    if (!fs.existsSync(NEWSLETTERS_DIR)) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ templates: [] }))
      return
    }

    const files = fs.readdirSync(NEWSLETTERS_DIR)
      .filter(f => f.endsWith('.txt'))
      .sort()
      .map(f => ({ name: f }))

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ templates: files }))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ templates: [], error: err.message }))
  }
}

// ── Templates: read single ───────────────────────────────────────────────

export async function handleNewsletterTemplateRead(req, res, fileName) {
  // Sanitize: only allow alphanumeric, dashes, underscores, dots
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '')
  if (safe !== fileName || safe.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid template name.' }))
    return
  }

  const filePath = path.join(NEWSLETTERS_DIR, safe)
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Template not found.' }))
    return
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')

    // If the first line starts with "Subject:" extract it as the subject
    let subject = ''
    let content = raw
    const firstNewline = raw.indexOf('\n')
    if (firstNewline !== -1) {
      const firstLine = raw.slice(0, firstNewline).trim()
      if (firstLine.toLowerCase().startsWith('subject:')) {
        subject = firstLine.slice('subject:'.length).trim()
        // Strip the subject line and any leading blank lines from body
        content = raw.slice(firstNewline + 1).replace(/^\n+/, '')
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ name: safe, subject, content }))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}
