// Submissions admin page and proxy API endpoints.
//
// Serves the submissions admin HTML page at /keystatic/submissions/ and provides
// local proxy endpoints that inject the Bearer token (read from api/.env)
// so the browser never handles secrets directly.
//
// Routes:
//   GET  /keystatic/submissions             → admin HTML page
//   GET  /api/dev/submissions/config        → config check (has secret, endpoint)
//   GET  /api/dev/submissions/list          → proxy GET /submissions
//   GET  /api/dev/submissions/detail        → proxy GET /submissions/detail?id=xxx
//   POST /api/dev/submissions/delete        → proxy POST /submissions/delete

import fs from 'fs'
import path from 'path'
import { ROOT } from '../constants.mjs'
import { readJsonRequestBody } from '../helpers.mjs'

const SUBMISSIONS_ADMIN_HTML_PATH = path.join(ROOT, 'scripts', 'submissions-admin.html')
const API_ENV_PATH = path.join(ROOT, 'api', '.env')

// ── Read api/.env for config ─────────────────────────────────────────────

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

function getConfig() {
  const env = loadApiEnv()
  const secret = env.NEWSLETTER_SECRET || ''
  const frontendUrl = (env.FRONTEND_URL || '').replace(/\/$/, '')
  const apiEndpoint = (env.API_ENDPOINT || '').replace(/\/$/, '') || (frontendUrl ? frontendUrl + '/api' : '/api')
  return { secret, apiEndpoint }
}

// ── Serve submissions admin HTML page ────────────────────────────────────

export async function handleSubmissionsAdmin(req, res) {
  try {
    const html = fs.readFileSync(SUBMISSIONS_ADMIN_HTML_PATH, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Submissions admin page not found: ' + err.message)
  }
}

// ── Config check endpoint ────────────────────────────────────────────────

export async function handleSubmissionsConfig(req, res) {
  const { secret, apiEndpoint } = getConfig()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    hasSecret: secret !== '',
    apiEndpoint: apiEndpoint,
  }))
}

// ── Proxy: GET /submissions ──────────────────────────────────────────────

export async function handleSubmissionsListProxy(req, res) {
  const { secret, apiEndpoint } = getConfig()

  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const upstream = await fetch(apiEndpoint + '/submissions', {
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

// ── Proxy: GET /submissions/detail?id=xxx ────────────────────────────────

export async function handleSubmissionsDetailProxy(req, res) {
  const { secret, apiEndpoint } = getConfig()

  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const qs = new URL(req.url, 'http://localhost').search
    const upstream = await fetch(apiEndpoint + '/submissions/detail' + qs, {
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

// ── Proxy: POST /submissions/delete ──────────────────────────────────────

export async function handleSubmissionsDeleteProxy(req, res) {
  const { secret, apiEndpoint } = getConfig()
  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'NEWSLETTER_SECRET not set in api/.env' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)
    const upstream = await fetch(apiEndpoint + '/submissions/delete', {
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
