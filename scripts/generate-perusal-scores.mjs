#!/usr/bin/env node
// Script: generate-perusal-scores.mjs
// Reads source/works folders, auto-detects score.pdf in each work folder,
// converts each page to a watermarked WebP image, and writes a manifest TS file.
// The original PDFs are NEVER copied to public/ or dist/.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'

// ─── Constants ───────────────────────────────────────────────────────────────

const workspaceRoot = process.cwd()
const SCORES_OUTPUT_DIR = path.join(workspaceRoot, 'public', 'scores')
const MANIFEST_FILE = path.join(workspaceRoot, 'src', 'utils', 'perusal-scores.ts')
const MANIFEST_JSON = path.join(workspaceRoot, 'public', 'scores', '.scores-manifest.json')
const FORCE = process.argv.includes('--force')

// Image settings
const TARGET_WIDTH = 1200 // Screen resolution — readable but not print-quality
const WEBP_QUALITY = 80
const WATERMARK_TEXT = 'PERUSAL COPY'
const WATERMARK_OPACITY = 0.12
const PAGE_HASH_LENGTH = 16
const WATERMARK_ANGLE_DEG = -35
const WATERMARK_MIN_FONT_SIZE = 56
const WATERMARK_MAX_FONT_SIZE = 96
const WATERMARK_CHAR_WIDTH_FACTOR = 0.64
const WATERMARK_X_GAP_FACTOR = 1.8
const WATERMARK_Y_GAP_FACTOR = 3

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

  // Load .env.local overrides
  const envPath = path.join(workspaceRoot, '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w]+)\s*=\s*(.*)$/)
      if (match) {
        const [, key, rawValue] = match
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
      }
    }
  }

  const rawSourceDir = (process.env.WORKS_SOURCE_DIR || config.sourceDir || '').replace(/^~/, os.homedir())
  const sourceDir = path.isAbsolute(rawSourceDir) ? rawSourceDir : path.resolve(workspaceRoot, rawSourceDir)

  if (!sourceDir) {
    console.error('Error: No source directory configured.')
    console.error('Set sourceDir in source.config.mjs or WORKS_SOURCE_DIR in .env.local')
    process.exit(1)
  }

  return { sourceDir }
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

function loadManifest() {
  if (isFile(MANIFEST_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf8'))
    } catch {
      return {}
    }
  }
  return {}
}

function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_JSON), { recursive: true })
  fs.writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

// ─── Watermark SVG ──────────────────────────────────────────────────────────

function buildWatermarkSvg(width, height) {
  // Tiled repeating diagonal watermark that covers the entire page.
  // Spacing is based on text width to avoid overlaps and keep "PERUSAL COPY" legible.
  const fontSize = clamp(Math.floor(width / 14), WATERMARK_MIN_FONT_SIZE, WATERMARK_MAX_FONT_SIZE)
  const approxTextWidth = Math.ceil(WATERMARK_TEXT.length * fontSize * WATERMARK_CHAR_WIDTH_FACTOR)
  const tileWidth = approxTextWidth + Math.ceil(fontSize * WATERMARK_X_GAP_FACTOR)
  const tileHeight = Math.ceil(fontSize * WATERMARK_Y_GAP_FACTOR)
  const rowOffset = Math.floor(tileWidth / 2)
  const bleed = Math.ceil(Math.max(width, height) * 0.4)
  const minX = -bleed
  const maxX = width + bleed
  const minY = -bleed
  const maxY = height + bleed

  let textElements = ''
  let rowIndex = 0
  for (let y = minY; y <= maxY; y += tileHeight) {
    const xOffset = rowIndex % 2 === 0 ? 0 : rowOffset
    for (let x = minX; x <= maxX + rowOffset; x += tileWidth) {
      textElements += `<text x="${x + xOffset}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="wm">${WATERMARK_TEXT}</text>\n`
    }
    rowIndex++
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style>
      .wm {
        font-family: sans-serif;
        font-size: ${fontSize}px;
        fill: rgba(180, 0, 0, ${WATERMARK_OPACITY});
        font-weight: bold;
        letter-spacing: 0.05em;
      }
    </style>
  </defs>
  <g transform="rotate(${WATERMARK_ANGLE_DEG}, ${width / 2}, ${height / 2})">
    ${textElements}
  </g>
</svg>`)
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

    scores.push({
      slug: entry.name,
      pdfPath,
    })
  }

  return scores.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ─── PDF Processing ─────────────────────────────────────────────────────────

async function processScore(slug, pdfPath) {
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

    // Build watermark overlay
    const watermarkSvg = buildWatermarkSvg(width, height)

    // Composite watermark and convert to WebP
    const webpBuffer = await sharp(metadata.data)
      .composite([{ input: watermarkSvg, blend: 'over' }])
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
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

  if (FORCE) console.log('Mode: --force (reprocessing all scores)\n')

  const scores = discoverScores(config.sourceDir)
  if (scores.length === 0) {
    console.log('No perusal scores found.\n')
    // Write empty manifest so TS imports don't break
    writeManifestTs([])
    cleanUpStaleScores([])
    return
  }

  console.log(`Found ${scores.length} score(s)\n`)

  const manifest = loadManifest()
  const scoreData = []
  const stats = { generated: 0, skipped: 0 }

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

    if (!FORCE && currentHash === previousHash && hasCompleteCachedHashes) {
      // PDF unchanged — use cached page count
      const previousTimestamp = typeof previousEntry.timestamp === 'string' ? previousEntry.timestamp : undefined
      manifest[score.slug] = {
        hash: currentHash,
        pageCount: cachedPageCount,
        ...(previousTimestamp ? { timestamp: previousTimestamp } : {}),
        pageHashes: cachedPageHashes,
      }
      console.log(`Skipping: ${score.slug}`)
      console.log(`  Cache keys unchanged for ${cachedPageCount} page(s)`)
      scoreData.push({ slug: score.slug, pageCount: cachedPageCount, pageHashes: cachedPageHashes })
      stats.skipped++
      continue
    }

    console.log(`Processing: ${score.slug}`)
    const { pageCount, pageHashes } = await processScore(score.slug, score.pdfPath)
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

  // Clean up scores for works that no longer have a score.pdf
  const currentSlugs = scores.map((s) => s.slug)
  cleanUpStaleScores(currentSlugs)

  // Remove stale manifest entries
  for (const key of Object.keys(manifest)) {
    if (!currentSlugs.includes(key)) {
      delete manifest[key]
    }
  }

  saveManifest(manifest)
  writeManifestTs(scoreData)

  console.log('\n─── Summary ────────────────────────────')
  console.log(`  Generated: ${stats.generated}`)
  console.log(`  Skipped:   ${stats.skipped} (unchanged)`)
  console.log(`  Total:     ${scores.length}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
