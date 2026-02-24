#!/usr/bin/env node
/**
 * Ingest Assets — copies source files to the locations Astro expects.
 *
 * Runs before dev / build. Handles three categories:
 *
 * 1. Hero images:    source/home/hero/*.{jpg,png,webp} → public/hero/
 * 2. Branding:       source/branding/*.{svg,ico,png,jpg,jpeg,webp,avif,gif} → public/
 * 3. Profile image:  source/pages/about/profile.{jpg,png,webp} → src/assets/img/
 *
 * Only copies when the source is newer or the target is missing.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SOURCE_ROOT = path.join(root, 'source')
const PUBLIC_DIR = path.join(root, 'public')
const ASSETS_IMG_DIR = path.join(root, 'src', 'assets', 'img')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const BRANDING_EXTS = new Set(['.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

let copied = 0
let skipped = 0
let removed = 0

// ─── Helpers ──────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function needsCopy(src, dest) {
  if (!fs.existsSync(dest)) return true
  const srcStat = fs.statSync(src)
  const destStat = fs.statSync(dest)
  // Copy if source is newer or size differs
  return srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size
}

function copyFile(src, dest, label) {
  if (needsCopy(src, dest)) {
    fs.copyFileSync(src, dest)
    console.log(`  → ${label}`)
    copied++
  } else {
    skipped++
  }
}

function ensureSocialPreviewAssets() {
  const brandingDir = path.join(SOURCE_ROOT, 'branding')
  const socialSvgPath = path.join(brandingDir, 'social-preview-image.svg')
  const socialPngPath = path.join(brandingDir, 'social-preview-image.png')
  const hasSvg = fs.existsSync(socialSvgPath)
  const hasPng = fs.existsSync(socialPngPath)

  if (hasSvg && hasPng) return

  const scriptPath = path.join(root, 'scripts', 'generate-social-preview-image.mjs')
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('[ingest-assets] Failed to auto-generate social preview image assets.')
  }
}

// ─── 1. Hero images ──────────────────────────────────────────────────────

function ingestHeroImages() {
  const heroSourceDir = path.join(SOURCE_ROOT, 'home', 'hero')
  const heroTargetDir = path.join(PUBLIC_DIR, 'hero')

  if (!fs.existsSync(heroSourceDir)) {
    console.log('[ingest-assets] No hero source directory found, skipping.')
    return
  }

  ensureDir(heroTargetDir)

  const files = fs.readdirSync(heroSourceDir)
  const imageFiles = files.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
  const sourceImageSet = new Set(imageFiles)

  for (const file of imageFiles) {
    const src = path.join(heroSourceDir, file)
    const dest = path.join(heroTargetDir, file)
    copyFile(src, dest, `hero/${file}`)
  }

  // Keep public/hero in sync with source/home/hero by pruning stale images.
  const targetFiles = fs.readdirSync(heroTargetDir)
  const staleFiles = targetFiles.filter(
    (f) =>
      IMAGE_EXTS.has(path.extname(f).toLowerCase()) &&
      fs.statSync(path.join(heroTargetDir, f)).isFile() &&
      !sourceImageSet.has(f),
  )

  for (const file of staleFiles) {
    fs.rmSync(path.join(heroTargetDir, file))
    console.log(`  × removed hero/${file}`)
    removed++
  }
}

// ─── 2. Branding assets ─────────────────────────────────────────────────

function ingestBrandingAssets() {
  const brandingDir = path.join(SOURCE_ROOT, 'branding')

  if (!fs.existsSync(brandingDir)) {
    console.log('[ingest-assets] No branding directory found, skipping.')
    return
  }

  const files = fs.readdirSync(brandingDir)
  const assetFiles = files.filter(
    (f) => BRANDING_EXTS.has(path.extname(f).toLowerCase()) && fs.statSync(path.join(brandingDir, f)).isFile(),
  )

  for (const file of assetFiles) {
    const src = path.join(brandingDir, file)
    const dest = path.join(PUBLIC_DIR, file)
    copyFile(src, dest, file)
  }
}

// ─── 3. Profile image ───────────────────────────────────────────────────

function ingestProfileImage() {
  const aboutDir = path.join(SOURCE_ROOT, 'pages', 'about')

  if (!fs.existsSync(aboutDir)) return

  const files = fs.readdirSync(aboutDir)
  const profileFile = files.find((f) => {
    const name = path.basename(f, path.extname(f)).toLowerCase()
    const ext = path.extname(f).toLowerCase()
    return name === 'profile' && IMAGE_EXTS.has(ext)
  })

  if (!profileFile) return

  ensureDir(ASSETS_IMG_DIR)
  const src = path.join(aboutDir, profileFile)
  const dest = path.join(ASSETS_IMG_DIR, profileFile)
  copyFile(src, dest, `src/assets/img/${profileFile}`)
}

// ─── Run ─────────────────────────────────────────────────────────────────

console.log('[ingest-assets] Copying source assets…')

ensureSocialPreviewAssets()
ingestHeroImages()
ingestBrandingAssets()
ingestProfileImage()

console.log(`[ingest-assets] Done. Copied: ${copied}  Up to date: ${skipped}  Removed: ${removed}`)
