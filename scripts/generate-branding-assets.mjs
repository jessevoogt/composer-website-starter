#!/usr/bin/env node
/**
 * Generate Branding Assets — produces PNG favicon variants from the SVG source.
 *
 * Checks source/branding/ for expected PNG files and generates any that are
 * missing, using source/branding/favicon.svg as the single source of truth.
 *
 * Generated files:
 *   - favicon-96x96.png        (96×96)
 *   - apple-touch-icon.png     (180×180)
 *   - web-app-manifest-192x192.png (192×192)
 *   - web-app-manifest-512x512.png (512×512)
 *
 * ICO generation is not handled here (sharp doesn't support ICO output).
 * The existing favicon.ico was created externally and can remain as-is.
 *
 * Uses sharp (already a devDependency) for SVG → PNG conversion.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const brandingDir = path.resolve(__dirname, '..', 'source', 'branding')
const svgPath = path.join(brandingDir, 'favicon.svg')

/** @type {Array<{ filename: string, size: number }>} */
const targets = [
  { filename: 'favicon-96x96.png', size: 96 },
  { filename: 'apple-touch-icon.png', size: 180 },
  { filename: 'web-app-manifest-192x192.png', size: 192 },
  { filename: 'web-app-manifest-512x512.png', size: 512 },
]

// ── Generate site.webmanifest ─────────────────────────────────────────────────
// This runs unconditionally (doesn't depend on favicon.svg) so the manifest
// is always present, even in a fresh starter kit.

const publicDir = path.resolve(__dirname, '..', 'public')
const manifestPath = path.join(publicDir, 'site.webmanifest')
const siteYamlPath = path.resolve(__dirname, '..', 'source', 'site', 'site.yaml')

let siteName = 'Composer Portfolio'
let shortName = 'CP'

if (existsSync(siteYamlPath)) {
  try {
    const siteData = yaml.load(readFileSync(siteYamlPath, 'utf8'))
    if (siteData?.composerName && typeof siteData.composerName === 'string') {
      siteName = siteData.composerName
      // Derive initials for short_name (e.g. "Jane Doe" → "JD")
      const parts = siteData.composerName.trim().split(/\s+/)
      shortName = parts.map((p) => p[0]?.toUpperCase() ?? '').join('')
    }
  } catch {
    // Fall back to defaults
  }
}

const manifest = JSON.stringify(
  {
    name: siteName,
    short_name: shortName,
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    theme_color: '#ffffff',
    background_color: '#ffffff',
    display: 'standalone',
  },
  null,
  2,
)

writeFileSync(manifestPath, manifest + '\n', 'utf8')

// ── Auto-generate favicon SVG from initials if missing ──────────────────────

if (!existsSync(svgPath)) {
  try {
    const { generateFaviconSvg } = await import('./generate-favicon-svg.mjs')

    // Read brand config for initials
    const brandLogoPath = path.join(brandingDir, 'brand-logo.yaml')
    let firstName = ''
    let lastName = ''

    if (existsSync(brandLogoPath)) {
      const brandConfig = yaml.load(readFileSync(brandLogoPath, 'utf8')) || {}
      firstName = brandConfig.firstName || ''
      lastName = brandConfig.lastName || ''
    }

    // Fall back to composer name from site config
    if (!firstName && !lastName) {
      const parts = siteName.trim().split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.length > 1 ? parts[parts.length - 1] : ''
    }

    const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?'

    // Read theme branding defaults
    const themeYamlPath = path.resolve(__dirname, '..', 'source', 'site', 'theme.yaml')
    const faviconOptions = {}

    if (existsSync(themeYamlPath)) {
      const themeConfig = yaml.load(readFileSync(themeYamlPath, 'utf8')) || {}
      if (themeConfig.branding) {
        faviconOptions.background = themeConfig.branding.faviconBackground
        faviconOptions.color = themeConfig.branding.faviconText
        faviconOptions.radius = themeConfig.branding.faviconRadius
      }
    }

    const svg = generateFaviconSvg(initials, faviconOptions)
    writeFileSync(svgPath, svg, 'utf8')
    console.log(`[generate-branding] Auto-generated favicon.svg from initials (${initials})`)
  } catch (err) {
    console.log(`[generate-branding] Could not auto-generate favicon.svg: ${err.message}`)
    console.log('[generate-branding] Done. site.webmanifest written.')
    process.exit(0)
  }
}

// ── Generate favicon PNGs from SVG ──────────────────────────────────────────

const svgBuffer = readFileSync(svgPath)
let generated = 0
let upToDate = 0

for (const { filename, size } of targets) {
  const outputPath = path.join(brandingDir, filename)

  if (existsSync(outputPath)) {
    upToDate++
    continue
  }

  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath)

  console.log(`  → Generated ${filename} (${size}×${size})`)
  generated++
}

console.log(`[generate-branding] Done. Generated: ${generated}  Up to date: ${upToDate}`)
