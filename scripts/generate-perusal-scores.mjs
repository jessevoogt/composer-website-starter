#!/usr/bin/env node
// Script: generate-perusal-scores.mjs
// Reads source/works folders, auto-detects score.pdf in each work folder,
// converts each page to a watermarked WebP image, and writes a manifest TS file.
// Also generates watermarked and/or original PDF files for download.
// WebP images go to public/scores/ (web-accessible).
// PDF files go to private/scores/ (deployed to private_html, not web-accessible).
// The original PDFs are NEVER copied to public/ or dist/.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import yaml from 'js-yaml'

// ─── Constants ───────────────────────────────────────────────────────────────

const workspaceRoot = process.cwd()
const SCORES_OUTPUT_DIR = path.join(workspaceRoot, 'public', 'scores')
const PRIVATE_SCORES_DIR = path.join(workspaceRoot, 'private', 'scores')
const PDF_MANIFEST_FILE = path.join(workspaceRoot, 'api', 'pdf-scores.json')
const MANIFEST_FILE = path.join(workspaceRoot, 'src', 'utils', 'perusal-scores.ts')
const MANIFEST_JSON = path.join(workspaceRoot, 'public', 'scores', '.scores-manifest.json')
const PDF_MANIFEST_JSON = path.join(PRIVATE_SCORES_DIR, '.pdf-manifest.json')
const FORCE = process.argv.includes('--force')

// Image settings
const TARGET_WIDTH = 1200 // Screen resolution — readable but not print-quality
const WEBP_QUALITY = 80
const PAGE_HASH_LENGTH = 16

// Watermark layout constants (not user-configurable — these control the tiling algorithm)
const WATERMARK_MIN_FONT_SIZE = 56
const WATERMARK_MAX_FONT_SIZE = 96
const WATERMARK_CHAR_WIDTH_FACTOR = 0.64
const WATERMARK_X_GAP_FACTOR = 1.8
const WATERMARK_Y_GAP_FACTOR = 3

// PDF watermark layout constants
const PDF_WM_BASE_FONT_DIVISOR = 14
const PDF_WM_MIN_FONT_SIZE = 32
const PDF_WM_MAX_FONT_SIZE = 72

// Paths to embedded TTF fonts for PDF watermarking
const FONT_PATHS = {
  heading: path.join(workspaceRoot, 'src', 'assets', 'fonts', 'GothicA1-Bold.ttf'),
  body: path.join(workspaceRoot, 'src', 'assets', 'fonts', 'AtkinsonHyperlegible-Bold.ttf'),
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// ─── Configuration Loading ───────────────────────────────────────────────────

async function loadConfig() {
  const configPath = path.join(workspaceRoot, 'source.config.mjs')
  let config = {}
  if (fs.existsSync(configPath)) {
    const mod = await import(`file://${configPath}`)
    config = mod.default || {}
  }

  const rawSourceDir = (config.sourceDir || '').replace(/^~/, process.env.HOME)
  const sourceDir = path.isAbsolute(rawSourceDir) ? rawSourceDir : path.resolve(workspaceRoot, rawSourceDir)

  if (!sourceDir) {
    console.error('Error: No source directory configured.')
    console.error('Set sourceDir in source.config.mjs')
    process.exit(1)
  }

  return { sourceDir }
}

// ─── Watermark Config ───────────────────────────────────────────────────────

const WATERMARK_DEFAULTS = {
  watermarkEnabled: true,
  watermarkText: 'PERUSAL COPY',
  watermarkColor: '#B40000',
  watermarkOpacity: 12,
  watermarkAngle: -35,
  watermarkFont: 'sans-serif',
  watermarkFontScale: 100,
  watermarkSpacing: 100,
}

function loadWatermarkConfig() {
  // Base config from Score Viewer
  const viewerPath = path.join(workspaceRoot, 'source', 'site', 'score-viewer.yaml')
  let raw = {}
  if (fs.existsSync(viewerPath)) {
    try {
      raw = yaml.load(fs.readFileSync(viewerPath, 'utf8')) || {}
    } catch {
      console.warn('Warning: Could not parse score-viewer.yaml, using defaults')
    }
  }

  const wm = { ...WATERMARK_DEFAULTS }
  if (typeof raw.watermarkEnabled === 'boolean') wm.watermarkEnabled = raw.watermarkEnabled
  if (typeof raw.watermarkText === 'string' && raw.watermarkText.trim()) wm.watermarkText = raw.watermarkText.trim()
  if (typeof raw.watermarkColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.watermarkColor)) wm.watermarkColor = raw.watermarkColor
  if (typeof raw.watermarkOpacity === 'number') wm.watermarkOpacity = clamp(raw.watermarkOpacity, 1, 100)
  if (typeof raw.watermarkAngle === 'number') wm.watermarkAngle = clamp(raw.watermarkAngle, -90, 90)
  if (['sans-serif', 'serif', 'heading', 'body'].includes(raw.watermarkFont)) wm.watermarkFont = raw.watermarkFont
  if (typeof raw.watermarkFontScale === 'number') wm.watermarkFontScale = clamp(raw.watermarkFontScale, 50, 200)
  if (typeof raw.watermarkSpacing === 'number') wm.watermarkSpacing = clamp(raw.watermarkSpacing, 50, 300)

  // Layer PDF-specific overrides from Score: PDF config (when enabled)
  const pdfPath = path.join(workspaceRoot, 'source', 'site', 'score-pdf.yaml')
  if (fs.existsSync(pdfPath)) {
    try {
      const pdfRaw = yaml.load(fs.readFileSync(pdfPath, 'utf8')) || {}
      const overrides = pdfRaw.watermarkOverrides
      if (overrides && overrides.discriminant === true && overrides.value) {
        const ov = overrides.value
        if (typeof ov.watermarkText === 'string' && ov.watermarkText.trim()) wm.watermarkText = ov.watermarkText.trim()
        if (typeof ov.watermarkColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(ov.watermarkColor)) wm.watermarkColor = ov.watermarkColor
        if (typeof ov.watermarkOpacity === 'number') wm.watermarkOpacity = clamp(ov.watermarkOpacity, 1, 100)
        if (typeof ov.watermarkAngle === 'number') wm.watermarkAngle = clamp(ov.watermarkAngle, -90, 90)
        if (['sans-serif', 'serif', 'heading', 'body'].includes(ov.watermarkFont)) wm.watermarkFont = ov.watermarkFont
        if (typeof ov.watermarkFontScale === 'number') wm.watermarkFontScale = clamp(ov.watermarkFontScale, 50, 200)
        if (typeof ov.watermarkSpacing === 'number') wm.watermarkSpacing = clamp(ov.watermarkSpacing, 50, 300)
        console.log('[perusal-scores] Using PDF watermark overrides from score-pdf.yaml')
      }
    } catch {
      console.warn('Warning: Could not parse score-pdf.yaml, ignoring overrides')
    }
  }

  return wm
}

function resolveWatermarkFontFamily(fontKey) {
  if (fontKey === 'sans-serif' || fontKey === 'serif') return fontKey

  // Read theme.yaml for heading/body font names
  const themePath = path.join(workspaceRoot, 'source', 'site', 'theme.yaml')
  let theme = {}
  if (fs.existsSync(themePath)) {
    try {
      theme = yaml.load(fs.readFileSync(themePath, 'utf8')) || {}
    } catch {
      // fall through to defaults
    }
  }

  if (fontKey === 'heading') {
    return `'${theme.fontHeading || 'Gothic A1'}', sans-serif`
  }
  if (fontKey === 'body') {
    return `'${theme.fontBody || 'Atkinson Hyperlegible'}', sans-serif`
  }

  return 'sans-serif'
}

function hashWatermarkConfig(wm) {
  return crypto.createHash('sha256').update(JSON.stringify(wm)).digest('hex').slice(0, 16)
}

// ─── PDF Access Config ──────────────────────────────────────────────────────

const PDF_ACCESS_DEFAULTS = {
  pdfWatermarkedEnabled: true,
  pdfOriginalEnabled: false,
  pdfWatermarkedGated: true,
  pdfOriginalGated: true,
}

function loadPdfAccessConfig() {
  const accessPath = path.join(workspaceRoot, 'source', 'site', 'perusal-access.yaml')
  let raw = {}
  if (fs.existsSync(accessPath)) {
    try {
      raw = yaml.load(fs.readFileSync(accessPath, 'utf8')) || {}
    } catch {
      console.warn('Warning: Could not parse perusal-access.yaml, using PDF defaults')
    }
  }

  const cfg = { ...PDF_ACCESS_DEFAULTS }
  if (typeof raw.pdfWatermarkedEnabled === 'boolean') cfg.pdfWatermarkedEnabled = raw.pdfWatermarkedEnabled
  if (typeof raw.pdfOriginalEnabled === 'boolean') cfg.pdfOriginalEnabled = raw.pdfOriginalEnabled
  if (typeof raw.pdfWatermarkedGated === 'boolean') cfg.pdfWatermarkedGated = raw.pdfWatermarkedGated
  if (typeof raw.pdfOriginalGated === 'boolean') cfg.pdfOriginalGated = raw.pdfOriginalGated

  return cfg
}

function hashPdfConfig(pdfConfig, wmConfig) {
  const combined = JSON.stringify({ pdf: pdfConfig, wm: wmConfig })
  return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16)
}

// ─── Per-Work Overrides ─────────────────────────────────────────────────────

function loadWorkOverrides(workYamlPath) {
  const defaults = {
    pdfWatermarkedOverride: '',
    pdfOriginalOverride: '',
    pdfWatermarkedGatedOverride: '',
    pdfOriginalGatedOverride: '',
  }

  if (!isFile(workYamlPath)) return defaults

  try {
    const raw = yaml.load(fs.readFileSync(workYamlPath, 'utf8')) || {}
    return {
      pdfWatermarkedOverride: raw.pdfWatermarkedOverride || '',
      pdfOriginalOverride: raw.pdfOriginalOverride || '',
      pdfWatermarkedGatedOverride: raw.pdfWatermarkedGatedOverride || '',
      pdfOriginalGatedOverride: raw.pdfOriginalGatedOverride || '',
    }
  } catch {
    return defaults
  }
}

/**
 * Load work metadata needed for download filename resolution.
 */
function loadWorkMetadata(workYamlPath) {
  if (!isFile(workYamlPath)) return { title: '', subtitle: '', instrumentation: [] }
  try {
    const raw = yaml.load(fs.readFileSync(workYamlPath, 'utf8')) || {}
    return {
      title: typeof raw.title === 'string' ? raw.title : '',
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
      instrumentation: Array.isArray(raw.instrumentation)
        ? raw.instrumentation.filter((i) => typeof i === 'string')
        : [],
    }
  } catch {
    return { title: '', subtitle: '', instrumentation: [] }
  }
}

/**
 * Load composer name from site config.
 */
function loadComposerName() {
  const sitePath = path.join(workspaceRoot, 'source', 'site', 'site.yaml')
  if (!isFile(sitePath)) return ''
  try {
    const raw = yaml.load(fs.readFileSync(sitePath, 'utf8')) || {}
    return typeof raw.composerName === 'string' ? raw.composerName : ''
  } catch {
    return ''
  }
}

/**
 * Resolve per-work PDF settings by applying overrides on top of global defaults.
 *
 * @param {object} globalConfig - Global PDF access config
 * @param {object} overrides - Per-work overrides from work.yaml
 * @returns {{ watermarkedEnabled: boolean, originalEnabled: boolean, watermarkedGated: boolean, originalGated: boolean }}
 */
function resolveWorkPdfSettings(globalConfig, overrides) {
  return {
    watermarkedEnabled:
      overrides.pdfWatermarkedOverride === 'enabled' ? true
        : overrides.pdfWatermarkedOverride === 'disabled' ? false
          : globalConfig.pdfWatermarkedEnabled,
    originalEnabled:
      overrides.pdfOriginalOverride === 'enabled' ? true
        : overrides.pdfOriginalOverride === 'disabled' ? false
          : globalConfig.pdfOriginalEnabled,
    watermarkedGated:
      overrides.pdfWatermarkedGatedOverride === 'gated' ? true
        : overrides.pdfWatermarkedGatedOverride === 'ungated' ? false
          : globalConfig.pdfWatermarkedGated,
    originalGated:
      overrides.pdfOriginalGatedOverride === 'gated' ? true
        : overrides.pdfOriginalGatedOverride === 'ungated' ? false
          : globalConfig.pdfOriginalGated,
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function shortHash(fullHash) {
  return fullHash.slice(0, PAGE_HASH_LENGTH)
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function normalizePageHashes(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

// ─── Manifest (change detection) ────────────────────────────────────────────

function loadManifestFrom(filePath) {
  if (isFile(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return {}
    }
  }
  return {}
}

function loadManifest() {
  return loadManifestFrom(MANIFEST_JSON)
}

function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_JSON), { recursive: true })
  fs.writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function loadPdfManifest() {
  return loadManifestFrom(PDF_MANIFEST_JSON)
}

function savePdfManifest(manifest) {
  fs.mkdirSync(path.dirname(PDF_MANIFEST_JSON), { recursive: true })
  fs.writeFileSync(PDF_MANIFEST_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

// ─── Watermark SVG ──────────────────────────────────────────────────────────

function buildWatermarkSvg(width, height, wm) {
  // Tiled repeating diagonal watermark that covers the entire page.
  // Spacing is based on text width to avoid overlaps and keep text legible.
  const fontFamily = resolveWatermarkFontFamily(wm.watermarkFont)
  const scaleFactor = wm.watermarkFontScale / 100
  const spacingFactor = wm.watermarkSpacing / 100
  const opacity = wm.watermarkOpacity / 100

  const baseFontSize = clamp(Math.floor(width / 14), WATERMARK_MIN_FONT_SIZE, WATERMARK_MAX_FONT_SIZE)
  const fontSize = Math.round(baseFontSize * scaleFactor)
  const approxTextWidth = Math.ceil(wm.watermarkText.length * fontSize * WATERMARK_CHAR_WIDTH_FACTOR)
  const tileWidth = Math.ceil((approxTextWidth + Math.ceil(fontSize * WATERMARK_X_GAP_FACTOR)) * spacingFactor)
  const tileHeight = Math.ceil(fontSize * WATERMARK_Y_GAP_FACTOR * spacingFactor)
  const rowOffset = Math.floor(tileWidth / 2)
  const bleed = Math.ceil(Math.max(width, height) * 0.4)
  const minX = -bleed
  const maxX = width + bleed
  const minY = -bleed
  const maxY = height + bleed

  // Escape text for safe SVG embedding
  const escapedText = wm.watermarkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let textElements = ''
  let rowIndex = 0
  for (let y = minY; y <= maxY; y += tileHeight) {
    const xOffset = rowIndex % 2 === 0 ? 0 : rowOffset
    for (let x = minX; x <= maxX + rowOffset; x += tileWidth) {
      textElements += `<text x="${x + xOffset}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="wm">${escapedText}</text>\n`
    }
    rowIndex++
  }

  // Convert hex color to RGB for rgba() fill
  const hex = wm.watermarkColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) || 0
  const g = parseInt(hex.slice(2, 4), 16) || 0
  const b = parseInt(hex.slice(4, 6), 16) || 0

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style>
      .wm {
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        fill: rgba(${r}, ${g}, ${b}, ${opacity});
        font-weight: bold;
        letter-spacing: 0.05em;
      }
    </style>
  </defs>
  <g transform="rotate(${wm.watermarkAngle}, ${width / 2}, ${height / 2})">
    ${textElements}
  </g>
</svg>`)
}

// ─── PDF Watermarking (pdf-lib) ─────────────────────────────────────────────

/**
 * Generate a watermarked PDF using pdf-lib.
 * Draws tiled watermark text on each page, reusing the same tiling algorithm
 * as the SVG watermark but adapted for PDF coordinate system (bottom-left origin).
 *
 * @param {string} inputPdfPath - Path to the original PDF
 * @param {string} outputPdfPath - Path to write the watermarked PDF
 * @param {object} wmConfig - Watermark configuration object
 */
async function generateWatermarkedPdf(inputPdfPath, outputPdfPath, wmConfig) {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib')
  const fontkit = (await import('@pdf-lib/fontkit')).default

  const pdfBytes = fs.readFileSync(inputPdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  pdfDoc.registerFontkit(fontkit)

  // Resolve font for PDF
  let font
  const fontKey = wmConfig.watermarkFont
  if (fontKey === 'heading' && isFile(FONT_PATHS.heading)) {
    const fontBytes = fs.readFileSync(FONT_PATHS.heading)
    font = await pdfDoc.embedFont(fontBytes)
  } else if (fontKey === 'body' && isFile(FONT_PATHS.body)) {
    const fontBytes = fs.readFileSync(FONT_PATHS.body)
    font = await pdfDoc.embedFont(fontBytes)
  } else if (fontKey === 'serif') {
    font = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  } else {
    // sans-serif or fallback
    font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  }

  // Parse watermark color
  const hex = wmConfig.watermarkColor.replace('#', '')
  const rr = (parseInt(hex.slice(0, 2), 16) || 0) / 255
  const gg = (parseInt(hex.slice(2, 4), 16) || 0) / 255
  const bb = (parseInt(hex.slice(4, 6), 16) || 0) / 255
  const opacity = wmConfig.watermarkOpacity / 100
  const color = rgb(rr, gg, bb)

  const scaleFactor = wmConfig.watermarkFontScale / 100
  const spacingFactor = wmConfig.watermarkSpacing / 100
  const angleRad = (wmConfig.watermarkAngle * Math.PI) / 180

  const pages = pdfDoc.getPages()

  for (const page of pages) {
    const { width, height } = page.getSize()

    // Calculate font size relative to page width (same approach as SVG)
    const baseFontSize = clamp(
      Math.floor(width / PDF_WM_BASE_FONT_DIVISOR),
      PDF_WM_MIN_FONT_SIZE,
      PDF_WM_MAX_FONT_SIZE,
    )
    const fontSize = Math.round(baseFontSize * scaleFactor)

    // Measure text width using the embedded font
    const textWidth = font.widthOfTextAtSize(wmConfig.watermarkText, fontSize)
    const tileWidth = Math.ceil((textWidth + fontSize * WATERMARK_X_GAP_FACTOR) * spacingFactor)
    const tileHeight = Math.ceil(fontSize * WATERMARK_Y_GAP_FACTOR * spacingFactor)
    const rowOffset = Math.floor(tileWidth / 2)

    // Bleed area to ensure rotation doesn't leave gaps
    const bleed = Math.ceil(Math.max(width, height) * 0.5)
    const minX = -bleed
    const maxX = width + bleed
    const minY = -bleed
    const maxY = height + bleed

    // Center of rotation (page center)
    const cx = width / 2
    const cy = height / 2

    let rowIndex = 0
    for (let y = minY; y <= maxY; y += tileHeight) {
      const xOff = rowIndex % 2 === 0 ? 0 : rowOffset
      for (let x = minX; x <= maxX + rowOffset; x += tileWidth) {
        const px = x + xOff
        const py = y

        // Rotate point around page center
        const dx = px - cx
        const dy = py - cy
        const rx = cx + dx * Math.cos(angleRad) - dy * Math.sin(angleRad)
        const ry = cy + dx * Math.sin(angleRad) + dy * Math.cos(angleRad)

        page.drawText(wmConfig.watermarkText, {
          x: rx - textWidth / 2,
          y: ry - fontSize / 2,
          size: fontSize,
          font,
          color,
          opacity,
          rotate: degrees(wmConfig.watermarkAngle),
        })
      }
      rowIndex++
    }
  }

  const watermarkedBytes = await pdfDoc.save()
  fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true })
  fs.writeFileSync(outputPdfPath, watermarkedBytes)
}

// ─── Discovery ──────────────────────────────────────────────────────────────

function discoverScores(sourceDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  const scores = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const workDir = path.join(sourceDir, entry.name)
    const metaPath = path.join(workDir, 'work.yaml')
    if (!isFile(metaPath)) continue

    // Auto-detect score.pdf in the work folder (convention-based)
    const pdfPath = path.join(workDir, 'score.pdf')
    if (!isFile(pdfPath)) continue

    // Load per-work overrides and metadata
    const overrides = loadWorkOverrides(metaPath)
    const meta = loadWorkMetadata(metaPath)

    scores.push({
      slug: entry.name,
      pdfPath,
      workYamlPath: metaPath,
      overrides,
      meta,
    })
  }

  return scores.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ─── WebP Processing ────────────────────────────────────────────────────────

async function processScore(slug, pdfPath, wmConfig) {
  const { pdfToPng } = await import('pdf-to-png-converter')
  const sharp = (await import('sharp')).default

  const outputDir = path.join(SCORES_OUTPUT_DIR, slug)
  fs.mkdirSync(outputDir, { recursive: true })

  // Convert all PDF pages to PNG buffers
  console.log(`  Converting PDF pages...`)
  const pages = await pdfToPng(pdfPath, {
    viewportScale: 2.0, // 2x for crisp rendering before downscale
  })

  console.log(`  ${pages.length} page(s) found`)
  const pageHashes = []

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const pageNum = i + 1
    const outputPath = path.join(outputDir, `page-${pageNum}.webp`)

    // Resize to target width
    const resized = sharp(page.content).resize({ width: TARGET_WIDTH })
    const metadata = await resized.toBuffer({ resolveWithObject: true })
    const { width, height } = metadata.info

    let pipeline = sharp(metadata.data)

    // Apply watermark overlay if enabled
    if (wmConfig.watermarkEnabled) {
      const watermarkSvg = buildWatermarkSvg(width, height, wmConfig)
      pipeline = pipeline.composite([{ input: watermarkSvg, blend: 'over' }])
    }

    const webpBuffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
    fs.writeFileSync(outputPath, webpBuffer)
    pageHashes.push(shortHash(sha256Buffer(webpBuffer)))

    console.log(`  Page ${pageNum}/${pages.length}: ${path.basename(outputPath)} (${width}×${height})`)
  }

  // Clean up any extra pages from a previous run with more pages
  let cleanupIndex = pages.length + 1
  while (isFile(path.join(outputDir, `page-${cleanupIndex}.webp`))) {
    fs.unlinkSync(path.join(outputDir, `page-${cleanupIndex}.webp`))
    console.log(`  Cleaned up stale page-${cleanupIndex}.webp`)
    cleanupIndex++
  }

  return { pageCount: pages.length, pageHashes }
}

// ─── PDF Score Generation ───────────────────────────────────────────────────

/**
 * Process PDF downloads for a single work.
 *
 * @param {object} score - Score entry from discoverScores
 * @param {object} pdfSettings - Resolved per-work PDF settings
 * @param {object} wmConfig - Watermark configuration
 * @param {object} pdfManifest - PDF manifest for change detection
 * @param {boolean} forcePdf - Force regeneration
 * @returns {{ watermarkedGenerated: boolean, originalGenerated: boolean }}
 */
/** @returns {Promise<{ watermarkedGenerated: boolean, originalGenerated: boolean }>} */
async function processPdfScore(score, pdfSettings, wmConfig, pdfManifest, forcePdf) {
  const { slug, pdfPath } = score
  const outputDir = path.join(PRIVATE_SCORES_DIR, slug)
  const wmOutputPath = path.join(outputDir, 'score-watermarked.pdf')
  const origOutputPath = path.join(outputDir, 'score-original.pdf')

  const currentHash = sha256File(pdfPath)
  const prev = pdfManifest[slug] || {}
  const result = { watermarkedGenerated: false, originalGenerated: false }

  // Generate watermarked PDF
  if (pdfSettings.watermarkedEnabled) {
    const needsRegen = forcePdf || prev.hash !== currentHash || !isFile(wmOutputPath)
    if (needsRegen) {
      console.log(`  Generating watermarked PDF...`)
      await generateWatermarkedPdf(pdfPath, wmOutputPath, wmConfig)
      result.watermarkedGenerated = true
      console.log(`  → ${path.relative(workspaceRoot, wmOutputPath)}`)
    }
  } else {
    // Remove watermarked PDF if it was previously generated but is now disabled
    if (isFile(wmOutputPath)) {
      fs.unlinkSync(wmOutputPath)
      console.log(`  Removed disabled watermarked PDF`)
    }
  }

  // Copy original PDF
  if (pdfSettings.originalEnabled) {
    const needsRegen = forcePdf || prev.hash !== currentHash || !isFile(origOutputPath)
    if (needsRegen) {
      console.log(`  Copying original PDF...`)
      fs.mkdirSync(outputDir, { recursive: true })
      fs.copyFileSync(pdfPath, origOutputPath)
      result.originalGenerated = true
      console.log(`  → ${path.relative(workspaceRoot, origOutputPath)}`)
    }
  } else {
    // Remove original PDF if it was previously generated but is now disabled
    if (isFile(origOutputPath)) {
      fs.unlinkSync(origOutputPath)
      console.log(`  Removed disabled original PDF`)
    }
  }

  // Update PDF manifest entry
  pdfManifest[slug] = {
    hash: currentHash,
    watermarked: pdfSettings.watermarkedEnabled,
    original: pdfSettings.originalEnabled,
    timestamp: new Date().toISOString(),
  }

  return result
}

// ─── Clean Up Stale Scores ──────────────────────────────────────────────────

function cleanUpStaleScores(currentSlugs) {
  if (!isDir(SCORES_OUTPUT_DIR)) return

  const currentSet = new Set(currentSlugs)
  const entries = fs.readdirSync(SCORES_OUTPUT_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!currentSet.has(entry.name)) {
      const staleDir = path.join(SCORES_OUTPUT_DIR, entry.name)
      fs.rmSync(staleDir, { recursive: true, force: true })
      console.log(`  Cleaned up stale score directory: ${entry.name}/`)
    }
  }
}

function cleanUpStalePdfScores(currentSlugs) {
  if (!isDir(PRIVATE_SCORES_DIR)) return

  const currentSet = new Set(currentSlugs)
  const entries = fs.readdirSync(PRIVATE_SCORES_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!currentSet.has(entry.name)) {
      const staleDir = path.join(PRIVATE_SCORES_DIR, entry.name)
      fs.rmSync(staleDir, { recursive: true, force: true })
      console.log(`  Cleaned up stale private PDF directory: ${entry.name}/`)
    }
  }
}

// ─── PDF Scores Manifest (api/pdf-scores.json) ─────────────────────────────

function writePdfScoresManifest(scores, pdfConfig, composerName) {
  const manifest = {}

  for (const score of scores) {
    const settings = resolveWorkPdfSettings(pdfConfig, score.overrides)
    const meta = score.meta || {}
    manifest[score.slug] = {
      hasWatermarkedPdf: settings.watermarkedEnabled,
      hasOriginalPdf: settings.originalEnabled,
      watermarkedGated: settings.watermarkedGated,
      originalGated: settings.originalGated,
      title: meta.title || '',
      subtitle: meta.subtitle || '',
      instrumentation: meta.instrumentation || [],
      composerName,
    }
  }

  fs.mkdirSync(path.dirname(PDF_MANIFEST_FILE), { recursive: true })
  fs.writeFileSync(PDF_MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`\nWrote ${path.relative(workspaceRoot, PDF_MANIFEST_FILE)} with ${scores.length} work(s)`)
}

// ─── Manifest TS Generation ─────────────────────────────────────────────────

function writeManifestTs(scoreData) {
  // scoreData: Array<{ slug: string, pageCount: number, pageHashes: string[] }>
  const pageCountEntries = scoreData.map(({ slug, pageCount }) => `  '${slug}': ${pageCount}`).join(',\n')
  const pageHashEntries = scoreData.map(({ slug, pageHashes }) => `  '${slug}': ${JSON.stringify(pageHashes)}`).join(',\n')

  const content = `// THIS FILE IS AUTO-GENERATED BY scripts/generate-perusal-scores.mjs
// Run: node ./scripts/generate-perusal-scores.mjs

/** Map of work slug → number of perusal score pages */
const perusalScores: Record<string, number> = {
${pageCountEntries}
}

/** Map of work slug → per-page cache-busting hashes for perusal score images */
const perusalScorePageHashes: Record<string, string[]> = {
${pageHashEntries}
}

export default perusalScores
export { perusalScorePageHashes }
`

  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true })
  fs.writeFileSync(MANIFEST_FILE, content, 'utf8')
  console.log(`\nWrote ${MANIFEST_FILE} with ${scoreData.length} score(s)`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Perusal Score Generation')
  console.log('========================')

  const config = await loadConfig()
  console.log(`Source: ${config.sourceDir}`)

  if (!isDir(config.sourceDir)) {
    console.error(`Error: Source directory not found: ${config.sourceDir}`)
    process.exit(1)
  }

  // Load watermark configuration from score-viewer.yaml
  const wmConfig = loadWatermarkConfig()
  const wmConfigHash = hashWatermarkConfig(wmConfig)
  if (wmConfig.watermarkEnabled) {
    console.log(`Watermark: "${wmConfig.watermarkText}" (${wmConfig.watermarkColor} @ ${wmConfig.watermarkOpacity}%, ${wmConfig.watermarkAngle}°)`)
  } else {
    console.log('Watermark: disabled')
  }

  // Load composer name for download filename resolution
  const composerName = loadComposerName()

  // Load PDF access configuration
  const pdfConfig = loadPdfAccessConfig()
  const pdfConfigHash = hashPdfConfig(pdfConfig, wmConfig)
  console.log(`PDF downloads: watermarked=${pdfConfig.pdfWatermarkedEnabled ? 'on' : 'off'}, original=${pdfConfig.pdfOriginalEnabled ? 'on' : 'off'}`)

  let forceAll = FORCE
  let forcePdf = FORCE
  if (FORCE) console.log('Mode: --force (reprocessing all scores)\n')

  const scores = discoverScores(config.sourceDir)
  if (scores.length === 0) {
    console.log('No perusal scores found.\n')
    // Write empty manifests so imports don't break
    writeManifestTs([])
    writePdfScoresManifest([], pdfConfig, composerName)
    cleanUpStaleScores([])
    cleanUpStalePdfScores([])
    return
  }

  console.log(`Found ${scores.length} score(s)\n`)

  const manifest = loadManifest()
  const pdfManifest = loadPdfManifest()

  // If watermark settings changed, force regeneration of all WebP images
  if (manifest._wmConfigHash && manifest._wmConfigHash !== wmConfigHash) {
    console.log('Watermark settings changed — regenerating all WebP images\n')
    forceAll = true
  }
  manifest._wmConfigHash = wmConfigHash

  // If PDF config or watermark changed, force regeneration of all PDFs
  if (pdfManifest._pdfConfigHash && pdfManifest._pdfConfigHash !== pdfConfigHash) {
    console.log('PDF settings changed — regenerating all PDF files\n')
    forcePdf = true
  }
  pdfManifest._pdfConfigHash = pdfConfigHash

  const scoreData = []
  const stats = { generated: 0, skipped: 0, pdfWatermarked: 0, pdfOriginal: 0 }

  for (const score of scores) {
    const previousEntry = manifest[score.slug] || {}
    const currentHash = sha256File(score.pdfPath)
    const previousHash = previousEntry.hash
    const cachedPageCount = Number(previousEntry.pageCount)
    const cachedPageHashes = normalizePageHashes(previousEntry.pageHashes)
    const hasCompleteCachedHashes =
      Number.isFinite(cachedPageCount) &&
      cachedPageCount > 0 &&
      cachedPageHashes.length === cachedPageCount

    // ── WebP generation ──
    if (!forceAll && currentHash === previousHash && hasCompleteCachedHashes) {
      // PDF unchanged — use cached page count
      const previousTimestamp = typeof previousEntry.timestamp === 'string' ? previousEntry.timestamp : undefined
      manifest[score.slug] = {
        hash: currentHash,
        pageCount: cachedPageCount,
        ...(previousTimestamp ? { timestamp: previousTimestamp } : {}),
        pageHashes: cachedPageHashes,
      }
      console.log(`Skipping WebP: ${score.slug}`)
      console.log(`  Cache keys unchanged for ${cachedPageCount} page(s)`)
      scoreData.push({ slug: score.slug, pageCount: cachedPageCount, pageHashes: cachedPageHashes })
      stats.skipped++
    } else {
      console.log(`Processing WebP: ${score.slug}`)
      const { pageCount, pageHashes } = await processScore(score.slug, score.pdfPath, wmConfig)
      const previousPageHashes = normalizePageHashes(previousEntry.pageHashes)
      let changedPages = 0
      for (let i = 0; i < pageHashes.length; i++) {
        if (pageHashes[i] !== previousPageHashes[i]) changedPages++
      }
      changedPages += Math.max(0, previousPageHashes.length - pageHashes.length)

      // Update manifest
      manifest[score.slug] = {
        hash: currentHash,
        pageCount,
        timestamp: new Date().toISOString(),
        pageHashes,
      }
      console.log(`  Cache keys changed: ${changedPages}/${pageCount} page(s)`)
      scoreData.push({ slug: score.slug, pageCount, pageHashes })
      stats.generated++
    }

    // ── PDF generation ──
    const pdfSettings = resolveWorkPdfSettings(pdfConfig, score.overrides)
    if (pdfSettings.watermarkedEnabled || pdfSettings.originalEnabled) {
      console.log(`Processing PDF: ${score.slug}`)
      const pdfResult = await processPdfScore(score, pdfSettings, wmConfig, pdfManifest, forcePdf)
      if (pdfResult.watermarkedGenerated) stats.pdfWatermarked++
      if (pdfResult.originalGenerated) stats.pdfOriginal++
    }
  }

  // Clean up scores for works that no longer have a score.pdf
  const currentSlugs = scores.map((s) => s.slug)
  cleanUpStaleScores(currentSlugs)
  cleanUpStalePdfScores(currentSlugs)

  // Remove stale manifest entries (preserve internal keys prefixed with _)
  for (const key of Object.keys(manifest)) {
    if (!key.startsWith('_') && !currentSlugs.includes(key)) {
      delete manifest[key]
    }
  }
  for (const key of Object.keys(pdfManifest)) {
    if (!key.startsWith('_') && !currentSlugs.includes(key)) {
      delete pdfManifest[key]
    }
  }

  saveManifest(manifest)
  savePdfManifest(pdfManifest)
  writeManifestTs(scoreData)
  writePdfScoresManifest(scores, pdfConfig, composerName)

  console.log('\n─── Summary ────────────────────────────')
  console.log(`  WebP generated: ${stats.generated}`)
  console.log(`  WebP skipped:   ${stats.skipped} (unchanged)`)
  console.log(`  PDF watermarked: ${stats.pdfWatermarked}`)
  console.log(`  PDF original:    ${stats.pdfOriginal}`)
  console.log(`  Total works:     ${scores.length}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
