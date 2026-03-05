#!/usr/bin/env node
/**
 * Generate Email Brand Logo — produces a static PNG of the brand mark for email
 * signatures (CID inline attachment).
 *
 * Logo source priority:
 *   1. Custom logo file: source/branding/logo.* (svg, png, webp, jpg — by convention)
 *   2. Custom animation plugin: static render of initials + decorative tails
 *   3. Text fallback: composer name rendered as styled uppercase text
 *
 * Output: api/email-brand-logo.png (400px wide for 2× retina at default 160px display)
 *
 * Skips generation if the output already exists. Use --force to regenerate.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { load } from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const brandingDir = path.join(root, 'source', 'branding')
const outputPath = path.join(root, 'api', 'email-brand-logo.png')
const forceRegenerate = process.argv.includes('--force')

const TARGET_WIDTH = 400

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadYaml(relPath) {
  const fullPath = path.join(root, relPath)
  try {
    return load(readFileSync(fullPath, 'utf8')) ?? {}
  } catch {
    return {}
  }
}

/** Scan source/branding/ for a file named logo.* with a supported extension. */
function findCustomLogo() {
  const exts = ['.svg', '.png', '.webp', '.avif', '.jpg', '.jpeg', '.gif']
  if (!existsSync(brandingDir)) return null

  for (const ext of exts) {
    const candidate = path.join(brandingDir, `logo${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Extract the fill color from the first <path> in favicon.svg. */
function extractFaviconFillColor() {
  const svgPath = path.join(brandingDir, 'favicon.svg')
  if (!existsSync(svgPath)) return '#18212b'

  const svg = readFileSync(svgPath, 'utf8')
  const match = svg.match(/fill="(#[0-9a-fA-F]{3,8})"/)
  return match ? match[1] : '#18212b'
}

/** Extract J and V initial path data from favicon.svg. */
function extractInitialPaths() {
  const svgPath = path.join(brandingDir, 'favicon.svg')
  if (!existsSync(svgPath)) return null

  const svg = readFileSync(svgPath, 'utf8')
  const pathMatches = [...svg.matchAll(/<path\s+d="([^"]+)"/g)]
  if (pathMatches.length < 2) return null

  return { jPath: pathMatches[0][1], vPath: pathMatches[1][1] }
}

// ── Priority 1: Custom logo file ────────────────────────────────────────────

async function generateFromCustomLogo(logoPath) {
  const buffer = readFileSync(logoPath)
  await sharp(buffer)
    .resize(TARGET_WIDTH, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath)
  console.log(`[email-brand-logo] Generated from custom logo: ${path.basename(logoPath)}`)
}

// ── Priority 2: Custom animation (initials + tails) ─────────────────────────

async function generateFromCustomAnimation() {
  const tailPathsFile = path.join(root, 'src', 'personal', 'data', 'brand-tail-paths.json')
  if (!existsSync(tailPathsFile)) return false

  const initials = extractInitialPaths()
  if (!initials) return false

  const tailPaths = JSON.parse(readFileSync(tailPathsFile, 'utf8'))
  const fillColor = extractFaviconFillColor()

  // Geometry — mirrors scripts/generate-social-preview-image.mjs (lines 18-39).
  const logoInitialHeight = 216
  const logoInitialScale = logoInitialHeight / 14
  const logoInitialWidth = 9 * logoInitialScale
  const tailFirstPathMinX = Number(tailPaths.esse.x ?? 0)
  const tailLastPathMinX = Number(tailPaths.oogt.x ?? 0)
  const tailFirstPathWidth = Number(tailPaths.esse.width)
  const tailLastPathWidth = Number(tailPaths.oogt.width)
  const tailFirstPathData = String(tailPaths.esse.path)
  const tailLastPathData = String(tailPaths.oogt.path)
  const line2OffsetX = 71
  const line2OffsetY = -121
  const initialJMarginRight = -19
  const initialVMarginRight = -5
  const tailFirstX = logoInitialWidth + initialJMarginRight - tailFirstPathMinX
  const tailLastX = logoInitialWidth + initialVMarginRight - tailLastPathMinX
  const line2Y = logoInitialHeight + line2OffsetY
  const logoWidth = Math.max(
    tailFirstX + tailFirstPathMinX + tailFirstPathWidth,
    line2OffsetX + tailLastX + tailLastPathMinX + tailLastPathWidth,
  )
  const logoHeight = line2Y + logoInitialHeight

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoWidth} ${logoHeight}" width="${TARGET_WIDTH}">
  <g>
    <g transform="scale(${logoInitialScale})">
      <path d="${initials.jPath}" fill="${fillColor}" />
    </g>
    <path transform="translate(${tailFirstX} 0)" d="${tailFirstPathData}" fill="${fillColor}" />
  </g>
  <g transform="translate(${line2OffsetX} ${line2Y})">
    <g transform="scale(${logoInitialScale})">
      <path d="${initials.vPath}" fill="${fillColor}" />
    </g>
    <path transform="translate(${tailLastX} 0)" d="${tailLastPathData}" fill="${fillColor}" />
  </g>
</svg>`

  await sharp(Buffer.from(svg))
    .resize(TARGET_WIDTH, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim()
    .png()
    .toFile(outputPath)

  console.log('[email-brand-logo] Generated from custom animation (initials + tails)')
  return true
}

// ── Priority 3: Text fallback ───────────────────────────────────────────────

async function generateFromText(firstName, lastName) {
  const first = firstName.toUpperCase()
  const last = lastName.toUpperCase()

  // Simple two-line text logo matching BrandText.astro proportions.
  const fontSize = 48
  const lineHeight = fontSize * 1.15
  const letterSpacing = fontSize * 0.19
  const svgHeight = Math.ceil(lineHeight * 2 + 20)
  // Estimate width from character count + letter spacing.
  const maxChars = Math.max(first.length, last.length)
  const svgWidth = Math.ceil(maxChars * (fontSize * 0.65 + letterSpacing) + 40)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <text
    x="10" y="${fontSize}"
    font-family="'Gothic A1','Helvetica Neue',Arial,sans-serif"
    font-weight="700" font-size="${fontSize}" letter-spacing="${letterSpacing}"
    fill="#18212b"
  >${escapeXml(first)}</text>
  <text
    x="10" y="${fontSize + lineHeight}"
    font-family="'Gothic A1','Helvetica Neue',Arial,sans-serif"
    font-weight="700" font-size="${fontSize}" letter-spacing="${letterSpacing}"
    fill="#18212b"
  >${escapeXml(last)}</text>
</svg>`

  await sharp(Buffer.from(svg))
    .trim()
    .resize(TARGET_WIDTH, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath)

  console.log(`[email-brand-logo] Generated text logo for "${firstName} ${lastName}"`)
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!forceRegenerate && existsSync(outputPath)) {
  console.log('[email-brand-logo] api/email-brand-logo.png already exists (use --force to regenerate)')
  process.exit(0)
}

const brandConfig = loadYaml('source/branding/brand-logo.yaml')
const siteConfig = loadYaml('source/site/site.yaml')

// Derive firstName/lastName (same logic as source-config.ts getBrandConfig).
const composerName = typeof siteConfig.composerName === 'string' ? siteConfig.composerName : 'Composer Name'
const parts = composerName.split(/\s+/)
const firstName = typeof brandConfig.firstName === 'string' && brandConfig.firstName
  ? brandConfig.firstName
  : parts.slice(0, -1).join(' ') || parts[0] || ''
const lastName = typeof brandConfig.lastName === 'string' && brandConfig.lastName
  ? brandConfig.lastName
  : parts.length > 1 ? parts[parts.length - 1] || '' : ''

// Priority 1: Custom logo file.
const customLogo = findCustomLogo()
if (customLogo) {
  await generateFromCustomLogo(customLogo)
  process.exit(0)
}

// Priority 2: Custom animation plugin.
const mode = brandConfig.mode || 'text'
const pluginId = brandConfig.pluginId || ''
if (mode === 'plugin' && pluginId === 'custom-animation') {
  const generated = await generateFromCustomAnimation()
  if (generated) process.exit(0)
}

// Priority 3: Text fallback.
await generateFromText(firstName, lastName)
