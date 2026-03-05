#!/usr/bin/env node
// Build-time check: scan all HTML files in dist/ for internal links that are
// missing a trailing slash. Links without trailing slashes can cause URL
// mismatches between dev and production (Cloudways forces trailing slashes).
//
// Exits with code 1 if violations are found, code 0 if clean.

import fs from 'fs'
import path from 'path'

const DIST_DIR = path.resolve('dist')

// File extensions that are NOT page routes (assets, feeds, etc.)
const ASSET_EXTENSIONS = new Set([
  '.css', '.js', '.mjs', '.cjs', '.ts',
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.tiff',
  '.pdf', '.mp3', '.wav', '.aiff', '.flac', '.ogg',
  '.xml', '.json', '.yaml', '.yml',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.gz', '.br',
  '.map', '.txt', '.webmanifest',
])

// Prefixes/schemes to skip entirely
const SKIP_PREFIXES = ['http://', 'https://', '#', 'mailto:', 'tel:', 'javascript:', 'data:', '{']

function hasAssetExtension(href) {
  const extMatch = href.match(/\.([a-z0-9]+)(?:\?|$)/i)
  if (!extMatch) return false
  return ASSET_EXTENSIONS.has(`.${extMatch[1].toLowerCase()}`)
}

function shouldCheck(href) {
  if (!href || href === '/') return false
  for (const prefix of SKIP_PREFIXES) {
    if (href.startsWith(prefix)) return false
  }
  // Skip /api/ paths (backend endpoints, not pages)
  if (href.startsWith('/api/')) return false
  // Skip asset files
  if (hasAssetExtension(href)) return false
  return true
}

function collectHtmlFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectHtmlFiles(fullPath))
    } else if (entry.name.endsWith('.html')) {
      results.push(fullPath)
    }
  }
  return results
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const violations = []

  // Match href="..." (double quotes, single quotes, or unquoted)
  const hrefRegex = /href=["']([^"']+)["']/g
  let match
  while ((match = hrefRegex.exec(content)) !== null) {
    const href = match[1].trim()
    // Strip query string and fragment for the trailing slash check
    const pathOnly = href.split(/[?#]/)[0]

    if (shouldCheck(pathOnly) && !pathOnly.endsWith('/')) {
      violations.push(href)
    }
  }

  return violations
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DIST_DIR)) {
  console.error('[trailing-slash] No dist/ directory found. Run astro build first.')
  process.exit(1)
}

const htmlFiles = collectHtmlFiles(DIST_DIR)
let totalViolations = 0

for (const filePath of htmlFiles) {
  const violations = checkFile(filePath)
  if (violations.length > 0) {
    const relative = path.relative(DIST_DIR, filePath)
    for (const href of violations) {
      console.error(`  ${relative}: href="${href}" is missing a trailing slash`)
    }
    totalViolations += violations.length
  }
}

if (totalViolations > 0) {
  console.error(`\n[trailing-slash] Found ${totalViolations} internal link(s) without trailing slashes.`)
  console.error('[trailing-slash] All internal page links must end with / to match production URLs.')
  process.exit(1)
} else {
  console.log('[trailing-slash] All internal links have trailing slashes. ✓')
}
