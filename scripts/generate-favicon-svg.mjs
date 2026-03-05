#!/usr/bin/env node
/**
 * Generate a favicon SVG from composer initials.
 *
 * Exports `generateFaviconSvg()` for use by the setup wizard and
 * generate-branding-assets pipeline. Can also be run standalone:
 *
 *   node scripts/generate-favicon-svg.mjs
 *
 * When run standalone, reads `source/branding/brand-logo.yaml` for
 * initials and `source/site/theme.yaml` for colors, then writes to
 * `source/branding/favicon.svg`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

/**
 * Generate a favicon SVG from 1–2 character initials.
 *
 * @param {string} initials - 1–2 characters (e.g. "KT")
 * @param {object} [options]
 * @param {string} [options.background='#18212b'] - Hex fill color for the background
 * @param {string} [options.color='#F5F9FF'] - Hex fill color for the initials text
 * @param {number} [options.radius=16] - Corner radius 0–48 (on a 96×96 viewBox)
 * @param {string} [options.fontFamily='system-ui, -apple-system, sans-serif'] - Font stack
 * @returns {string} SVG markup
 */
export function generateFaviconSvg(initials, options = {}) {
  const {
    background = '#18212b',
    color = '#F5F9FF',
    radius = 16,
    fontFamily = 'system-ui, -apple-system, sans-serif',
  } = options

  const safeInitials = String(initials || '?').slice(0, 2).toUpperCase()
  const clampedRadius = Math.max(0, Math.min(48, radius))
  const fontSize = safeInitials.length === 1 ? 52 : 44
  const letterSpacing = safeInitials.length === 1 ? '0' : '0.04em'

  // Escape XML entities in text content
  const escapedInitials = safeInitials.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect width="96" height="96" rx="${clampedRadius}" fill="${background}"/>
  <text x="48" y="50" text-anchor="middle" dominant-baseline="central"
    font-family="${fontFamily}" font-size="${fontSize}" font-weight="600"
    letter-spacing="${letterSpacing}" fill="${color}">${escapedInitials}</text>
</svg>
`
}

// ─── Standalone execution ────────────────────────────────────────────────────

async function main() {
  const yaml = await import('js-yaml')

  const brandLogoPath = path.join(ROOT, 'source/branding/brand-logo.yaml')
  const themePath = path.join(ROOT, 'source/site/theme.yaml')
  const outputPath = path.join(ROOT, 'source/branding/favicon.svg')

  // Read brand config for initials
  let firstName = ''
  let lastName = ''
  if (fs.existsSync(brandLogoPath)) {
    const brandConfig = yaml.load(fs.readFileSync(brandLogoPath, 'utf8')) || {}
    firstName = brandConfig.firstName || ''
    lastName = brandConfig.lastName || ''
  }

  if (!firstName && !lastName) {
    // Try site config for composer name
    const sitePath = path.join(ROOT, 'source/site/site.yaml')
    if (fs.existsSync(sitePath)) {
      const siteConfig = yaml.load(fs.readFileSync(sitePath, 'utf8')) || {}
      const composerName = siteConfig.composerName || ''
      const parts = composerName.trim().split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.length > 1 ? parts[parts.length - 1] : ''
    }
  }

  const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?'

  // Read theme config for colors
  let faviconOptions = {}
  if (fs.existsSync(themePath)) {
    const themeConfig = yaml.load(fs.readFileSync(themePath, 'utf8')) || {}
    if (themeConfig.branding) {
      faviconOptions = {
        background: themeConfig.branding.faviconBackground,
        color: themeConfig.branding.faviconText,
        radius: themeConfig.branding.faviconRadius,
      }
    }
  }

  const svg = generateFaviconSvg(initials, faviconOptions)

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, svg, 'utf8')
  console.log(`[generate-favicon] Wrote ${outputPath} (initials: ${initials})`)
}

// Run standalone when executed directly
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMainModule) {
  main().catch((err) => {
    console.error('[generate-favicon] Error:', err.message)
    process.exit(1)
  })
}
