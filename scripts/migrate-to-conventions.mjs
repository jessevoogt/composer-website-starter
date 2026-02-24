#!/usr/bin/env node
// Script: migrate-to-conventions.mjs
// One-shot migration from explicit YAML filename fields to convention-based file discovery.
//
// What it does:
//   1. Multi-movement recordings: restructures flat files into movement-NN/ subdirectories
//        movement-N.mp3  → movement-0N/recording.mp3  (or .wav/.aiff/.flac as applicable)
//        photo-N.webp    → movement-0N/photo.webp     (preserving extension)
//   2. Rewrites every work.yaml to strip filename fields:
//        thumbnail.src, perusalScore, recordings[].mp3, recordings[].photo.src,
//        recordings[].movements[].mp3, recordings[].movements[].photo
//
// Usage:
//   node scripts/migrate-to-conventions.mjs          # dry-run (shows changes, writes nothing)
//   node scripts/migrate-to-conventions.mjs --apply  # apply changes

import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'

const DRY_RUN = !process.argv.includes('--apply')

// ─── Configuration Loading ───────────────────────────────────────────────────

async function loadConfig() {
  const workspaceRoot = process.cwd()
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

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Move a file, logging the action. Skips if source doesn't exist. */
function moveFile(src, dest, label) {
  if (!isFile(src)) {
    console.log(`  SKIP (not found): ${label}`)
    return false
  }
  if (isFile(dest)) {
    console.log(`  SKIP (dest exists): ${label}`)
    return false
  }
  console.log(`  Move: ${label}`)
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(src, dest)
  }
  return true
}

// ─── Per-Work Migration ──────────────────────────────────────────────────────

/**
 * Returns a summary of changes for a single work.
 * Applies them when DRY_RUN === false.
 */
function migrateWork(workDir, slug) {
  const metaPath = path.join(workDir, 'work.yaml')
  if (!isFile(metaPath)) return

  const rawYaml = fs.readFileSync(metaPath, 'utf8')
  const workMeta = yaml.load(rawYaml) || {}
  let dirty = false
  let hasChanges = false

  // ── Step 1: Restructure multi-movement recording folders ──────────────────

  for (const rec of workMeta.recordings ?? []) {
    if (!rec.folder || !Array.isArray(rec.movements) || rec.movements.length === 0) continue

    const recDir = path.join(workDir, 'recordings', rec.folder)
    if (!isDir(recDir)) continue

    const needsRestructure = rec.movements.some((m) => m.mp3 || m.photo)
    if (!needsRestructure) continue

    hasChanges = true
    console.log(`\n  [${slug}] Recording folder: ${rec.folder}`)

    for (let i = 0; i < rec.movements.length; i++) {
      const mov = rec.movements[i]
      const movDirName = `movement-${(i + 1).toString().padStart(2, '0')}`
      const movDirPath = path.join(recDir, movDirName)

      // Move audio file
      if (mov.mp3) {
        const srcAudio = path.join(recDir, mov.mp3)
        const audioExt = path.extname(mov.mp3) || '.mp3'
        const destAudio = path.join(movDirPath, `recording${audioExt}`)
        const label = `${rec.folder}/${mov.mp3}  →  ${rec.folder}/${movDirName}/recording${audioExt}`
        moveFile(srcAudio, destAudio, label)
      }

      // Move photo file
      if (mov.photo) {
        const srcPhoto = path.join(recDir, mov.photo)
        const photoExt = path.extname(mov.photo) || '.webp'
        const destPhoto = path.join(movDirPath, `photo${photoExt}`)
        const label = `${rec.folder}/${mov.photo}  →  ${rec.folder}/${movDirName}/photo${photoExt}`
        moveFile(srcPhoto, destPhoto, label)
      }
    }
  }

  // ── Step 2: Strip filename fields from work.yaml ──────────────────────────

  // thumbnail.src
  if (workMeta.thumbnail && 'src' in workMeta.thumbnail) {
    hasChanges = true
    console.log(`  [${slug}] Remove thumbnail.src`)
    delete workMeta.thumbnail.src
    dirty = true
  }

  // perusalScore
  if ('perusalScore' in workMeta) {
    hasChanges = true
    console.log(`  [${slug}] Remove perusalScore`)
    delete workMeta.perusalScore
    dirty = true
  }

  // recordings[].mp3, recordings[].photo.src, recordings[].movements[].mp3/.photo
  for (const rec of workMeta.recordings ?? []) {
    if ('mp3' in rec) {
      hasChanges = true
      console.log(`  [${slug}/${rec.folder}] Remove recordings[].mp3`)
      delete rec.mp3
      dirty = true
    }

    if (rec.photo && 'src' in rec.photo) {
      hasChanges = true
      console.log(`  [${slug}/${rec.folder}] Remove recordings[].photo.src`)
      delete rec.photo.src
      dirty = true
    }

    for (const mov of rec.movements ?? []) {
      if ('mp3' in mov) {
        hasChanges = true
        const label = mov.label ? ` (${mov.label})` : ` (index ${rec.movements.indexOf(mov)})`
        console.log(`  [${slug}/${rec.folder}] Remove movements[].mp3${label}`)
        delete mov.mp3
        dirty = true
      }

      if ('photo' in mov) {
        hasChanges = true
        const label = mov.label ? ` (${mov.label})` : ` (index ${rec.movements.indexOf(mov)})`
        console.log(`  [${slug}/${rec.folder}] Remove movements[].photo${label}`)
        delete mov.photo
        dirty = true
      }
    }
  }

  // ── Write updated YAML ────────────────────────────────────────────────────

  if (dirty) {
    const newYaml = yaml.dump(workMeta, {
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false,
      noRefs: true,
      sortKeys: false,
    })

    if (!DRY_RUN) {
      fs.writeFileSync(metaPath, newYaml, 'utf8')
    }
  }

  return hasChanges
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { sourceDir } = await loadConfig()

  console.log('Works Migration — Convention-Based File Discovery')
  console.log('==================================================')
  console.log(`Source: ${sourceDir}`)
  if (DRY_RUN) {
    console.log('\nMode: DRY RUN — no files will be changed.')
    console.log('Run with --apply to apply the changes.\n')
  } else {
    console.log('\nMode: APPLY — changes will be written to disk.\n')
  }

  if (!isDir(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`)
    process.exit(1)
  }

  const workEntries = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  let totalChanges = 0

  for (const entry of workEntries) {
    const workDir = path.join(sourceDir, entry.name)
    const had = migrateWork(workDir, entry.name)
    if (had) totalChanges++
  }

  console.log('\n──────────────────────────────────────────────────')
  if (totalChanges === 0) {
    console.log('Nothing to migrate — all works are already on the new conventions.')
  } else if (DRY_RUN) {
    console.log(`${totalChanges} work(s) would be changed.`)
    console.log('\nRun with --apply to apply the changes:')
    console.log('  node scripts/migrate-to-conventions.mjs --apply')
  } else {
    console.log(`${totalChanges} work(s) migrated.`)
    console.log('\nNext steps:')
    console.log('  node scripts/ingest-works.mjs --force')
    console.log('  node scripts/generate-works-images.mjs')
    console.log('  node scripts/generate-perusal-scores.mjs')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
