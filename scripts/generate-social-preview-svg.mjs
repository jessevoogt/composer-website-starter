#!/usr/bin/env node
/**
 * Generate a generic text-based social preview SVG.
 *
 * Exports `buildGenericSocialPreviewSvg()` for use by the setup wizard
 * and generate-social-preview-image.mjs pipeline. Can also be run standalone:
 *
 *   node scripts/generate-social-preview-svg.mjs
 *
 * When run standalone, reads config from YAML and writes to
 * `public/social-preview-image.svg`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

/**
 * Generate a social preview SVG (1200×630) with the composer's name.
 *
 * Creates a dark gradient background with subtle decorative elements,
 * the composer name displayed large and centered, and the site URL below.
 *
 * @param {string} composerName - Full name (e.g. "Kermit TheFrog")
 * @param {object} [options]
 * @param {string} [options.siteUrl] - Site URL to show below name (e.g. "kermitthefrog.com")
 * @param {string} [options.gradientStart='#040812'] - Dark gradient end
 * @param {string} [options.gradientEnd='#111E32'] - Lighter gradient end
 * @param {string} [options.textColor='#DCE6F6'] - Primary text color
 * @param {string} [options.mutedColor='#AEBBD4'] - Secondary text color
 * @param {string} [options.fontFamily='system-ui, -apple-system, sans-serif'] - Font stack
 * @returns {string} SVG markup (1200×630)
 */
export function buildGenericSocialPreviewSvg(composerName, options = {}) {
  const {
    siteUrl = '',
    gradientStart = '#040812',
    gradientEnd = '#111E32',
    textColor = '#DCE6F6',
    mutedColor = '#AEBBD4',
    fontFamily = 'system-ui, -apple-system, sans-serif',
  } = options

  const safeName = String(composerName || 'Composer').trim()
  const displayName = safeName.toUpperCase()
  const displayUrl = siteUrl ? siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''

  // Escape XML entities
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // Auto-size the name: shorter names get bigger text
  const nameLength = displayName.length
  let nameFontSize = 72
  if (nameLength > 20) nameFontSize = 56
  else if (nameLength > 14) nameFontSize = 64

  // Subtle decorative circles (positioned to not interfere with text)
  const circles = [
    { cx: 120, cy: 520, r: 180, opacity: 0.03 },
    { cx: 1080, cy: 110, r: 140, opacity: 0.04 },
    { cx: 950, cy: 480, r: 100, opacity: 0.025 },
  ]

  const circlesSvg = circles
    .map((c) => `  <circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${textColor}" opacity="${c.opacity}"/>`)
    .join('\n')

  // URL section (only if provided)
  const urlSvg = displayUrl
    ? `  <text x="600" y="375" text-anchor="middle" font-family="${esc(fontFamily)}"
    font-size="22" letter-spacing="0.12em" fill="${mutedColor}">${esc(displayUrl.toUpperCase())}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradientStart}"/>
      <stop offset="100%" stop-color="${gradientEnd}"/>
    </linearGradient>
  </defs>

  <!-- Background gradient -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative circles -->
${circlesSvg}

  <!-- Inner border -->
  <rect x="32" y="32" width="1136" height="566" rx="2" fill="none"
    stroke="${textColor}" stroke-opacity="0.06" stroke-width="1"/>

  <!-- Composer name -->
  <text x="600" y="305" text-anchor="middle" dominant-baseline="central"
    font-family="${esc(fontFamily)}" font-size="${nameFontSize}" font-weight="700"
    letter-spacing="0.16em" fill="${textColor}">${esc(displayName)}</text>

  <!-- Site URL -->
${urlSvg}
</svg>
`
}

// ─── Standalone execution ────────────────────────────────────────────────────

async function main() {
  const yaml = await import('js-yaml')

  const sitePath = path.join(ROOT, 'source/site/site.yaml')
  const themePath = path.join(ROOT, 'source/site/theme.yaml')
  const outputPath = path.join(ROOT, 'public/social-preview-image.svg')

  // Read site config
  let composerName = 'Composer'
  let siteUrl = ''
  if (fs.existsSync(sitePath)) {
    const siteConfig = yaml.load(fs.readFileSync(sitePath, 'utf8')) || {}
    composerName = siteConfig.composerName || 'Composer'
    siteUrl = siteConfig.siteUrl || ''
  }

  // Read theme config for branding colors
  const svgOptions = { siteUrl }
  if (fs.existsSync(themePath)) {
    const themeConfig = yaml.load(fs.readFileSync(themePath, 'utf8')) || {}
    if (themeConfig.branding) {
      svgOptions.gradientStart = themeConfig.branding.socialGradientStart
      svgOptions.gradientEnd = themeConfig.branding.socialGradientEnd
      svgOptions.textColor = themeConfig.branding.socialText
      svgOptions.mutedColor = themeConfig.branding.socialMuted
    }
  }

  const svg = buildGenericSocialPreviewSvg(composerName, svgOptions)
  fs.writeFileSync(outputPath, svg, 'utf8')
  console.log(`[generate-social-preview] Wrote ${outputPath}`)
}

// Run standalone when executed directly
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMainModule) {
  main().catch((err) => {
    console.error('[generate-social-preview] Error:', err.message)
    process.exit(1)
  })
}
