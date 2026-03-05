#!/usr/bin/env node
// Inject Apache redirect rules into dist/.htaccess from Keystatic YAML.
//
// Reads:  source/site/redirects.yaml
// Writes: dist/.htaccess (prepends redirect block)
//
// Runs as a post-build step — after `astro build` copies public/.htaccess to dist/.
// If no enabled rules exist, the script exits silently.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { load } from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ── Load redirects YAML ─────────────────────────────────────────────────────

const yamlPath = path.join(root, 'source', 'site', 'redirects.yaml')

if (!existsSync(yamlPath)) {
  console.log('[generate-redirects] No redirects.yaml found — skipping.')
  process.exit(0)
}

const data = load(readFileSync(yamlPath, 'utf8')) ?? {}
const rules = Array.isArray(data.rules) ? data.rules : []
const enabledRules = rules.filter((r) => r.enabled !== false)

if (enabledRules.length === 0) {
  console.log('[generate-redirects] No enabled redirect rules — skipping.')
  process.exit(0)
}

// ── Generate RewriteRules ───────────────────────────────────────────────────

/**
 * Escape special regex characters in a path segment, except the leading ^ and
 * the trailing capture group which we add ourselves.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Strip leading slash from a path for use in RewriteRule patterns,
 * since RewriteRule matches against the path without the leading /.
 */
function stripLeadingSlash(p) {
  return p.replace(/^\//, '')
}

const rewriteLines = []

for (const rule of enabledRules) {
  const from = (rule.from ?? '').trim()
  const to = (rule.to ?? '').trim()
  const type = rule.type ?? '301'
  const matchType = rule.matchType ?? 'exact'

  if (!from) continue

  const note = rule.note ? `  # ${rule.note}` : ''
  const fromBare = stripLeadingSlash(from)
  const fromEscaped = escapeRegex(fromBare)

  if (type === '410') {
    // 410 Gone — no destination needed
    if (matchType === 'prefix') {
      rewriteLines.push(`RewriteRule ^${fromEscaped}(.*)$ - [R=410,L]${note}`)
    } else {
      rewriteLines.push(`RewriteRule ^${fromEscaped}$ - [R=410,L]${note}`)
    }
  } else {
    // 301 or 302 — redirect to destination
    if (!to) continue // skip if no destination for non-410

    if (matchType === 'prefix') {
      rewriteLines.push(`RewriteRule ^${fromEscaped}(.*)$ ${to}$1 [R=${type},L]${note}`)
    } else {
      rewriteLines.push(`RewriteRule ^${fromEscaped}$ ${to} [R=${type},L]${note}`)
    }
  }
}

if (rewriteLines.length === 0) {
  console.log('[generate-redirects] No valid rules generated — skipping.')
  process.exit(0)
}

// ── Inject into dist/.htaccess ──────────────────────────────────────────────

const htaccessPath = path.join(root, 'dist', '.htaccess')

if (!existsSync(htaccessPath)) {
  console.error('[generate-redirects] dist/.htaccess not found — run astro build first.')
  process.exit(1)
}

const existing = readFileSync(htaccessPath, 'utf8')

const block = [
  '## BEGIN REDIRECTS (auto-generated from source/site/redirects.yaml — do not edit) ##',
  '<IfModule mod_rewrite.c>',
  '  RewriteEngine On',
  ...rewriteLines.map((line) => `  ${line}`),
  '</IfModule>',
  '## END REDIRECTS ##',
  '',
].join('\n')

// Prepend redirects before existing rules (redirects should be evaluated first)
writeFileSync(htaccessPath, block + '\n' + existing, 'utf8')

console.log(`[generate-redirects] Injected ${rewriteLines.length} redirect rule(s) into dist/.htaccess`)
