#!/usr/bin/env node
// Script: cleanup-generated-files.mjs
// Removes generated output files that are no longer referenced by any active work.
//
// A file is "orphaned" when its source has been removed from source/works/:
//   - the entire work folder deleted   → MDX, images, audio all orphaned
//   - a recording folder deleted       → recording images and audio orphaned
//   - a single audio/photo file removed → its generated output orphaned
//   - a performer/title change         → old audio filename orphaned (new one regenerated)
//
// Strategy: parse the YAML frontmatter of every *active* MDX file and collect all
// `/assets/images/works/` and `/audio/` paths that are currently referenced. Anything
// in the output directories that is NOT referenced is orphaned and can be deleted.
//
// Usage:
//   node scripts/cleanup-generated-files.mjs          # dry-run (shows what would be deleted)
//   node scripts/cleanup-generated-files.mjs --apply  # delete orphans

import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'

const APPLY = process.argv.includes('--apply')

const workspaceRoot = process.cwd()
const CONTENT_DIR = path.join(workspaceRoot, 'src', 'content', 'works')
const IMAGES_DIR = path.join(workspaceRoot, 'src', 'assets', 'images', 'works')
const AUDIO_DIR = path.join(workspaceRoot, 'public', 'audio')

// ─── Configuration Loading ───────────────────────────────────────────────────

async function loadConfig() {
  const configPath = path.join(workspaceRoot, 'source.config.mjs')
  let config = {}
  if (fs.existsSync(configPath)) {
    const mod = await import(`file://${configPath}`)
    config = mod.default || {}
  }

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

/**
 * Recursively walk a parsed YAML value and collect all string values that
 * look like generated asset paths. Extracts:
 *   - /assets/images/works/*.webp  → basenames into imageSet
 *   - /audio/*.mp3                  → filenames (without /audio/ prefix) into audioSet
 */
function collectAssetRefs(obj, imageSet, audioSet) {
  if (typeof obj === 'string') {
    if (obj.startsWith('/assets/images/works/')) imageSet.add(path.basename(obj))
    if (obj.startsWith('/audio/')) audioSet.add(obj.slice('/audio/'.length))
  } else if (Array.isArray(obj)) {
    for (const item of obj) collectAssetRefs(item, imageSet, audioSet)
  } else if (obj !== null && typeof obj === 'object') {
    for (const val of Object.values(obj)) collectAssetRefs(val, imageSet, audioSet)
  }
}

/** Extract the YAML frontmatter from an MDX string (content between the --- fences). */
function parseFrontmatter(mdxContent) {
  const match = mdxContent.match(/^---\r?\n([\s\S]+?)\r?\n---/)
  if (!match) return null
  try {
    return yaml.load(match[1]) || null
  } catch {
    return null
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Cleanup Generated Files')
  console.log('=======================')

  const { sourceDir } = await loadConfig()
  console.log(`Source: ${sourceDir}`)

  if (!APPLY) {
    console.log('\nMode: DRY RUN — nothing will be deleted.')
    console.log('Run with --apply to delete orphans.\n')
  } else {
    console.log('\nMode: APPLY — orphaned files will be deleted.\n')
  }

  // ── 1. Active work slugs from source/works/ ──────────────────────────────

  const activeWorkSlugs = new Set()
  if (isDir(sourceDir)) {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
      if (isFile(path.join(sourceDir, entry.name, 'work.yaml'))) {
        activeWorkSlugs.add(entry.name)
      }
    }
  }

  // ── 2. Partition MDX files into active vs orphaned ───────────────────────

  const referencedImages = new Set()
  const referencedAudio = new Set()
  const orphanedMdxFiles = []

  if (isDir(CONTENT_DIR)) {
    for (const file of fs.readdirSync(CONTENT_DIR)) {
      if (!file.endsWith('.mdx')) continue
      const slug = file.replace('.mdx', '')

      if (!activeWorkSlugs.has(slug)) {
        orphanedMdxFiles.push(file)
        continue
      }

      // Parse active MDX and collect asset refs
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')
      const fm = parseFrontmatter(content)
      if (fm) collectAssetRefs(fm, referencedImages, referencedAudio)
    }
  }

  // ── 3. Find orphaned images (*-740w.webp not referenced by any active MDX) ─

  const orphanedImages = []
  if (isDir(IMAGES_DIR)) {
    for (const file of fs.readdirSync(IMAGES_DIR)) {
      if (!file.endsWith('-740w.webp')) continue
      if (!referencedImages.has(file)) orphanedImages.push(file)
    }
  }

  // ── 4. Find orphaned audio (*.mp3 not referenced by any active MDX) ──────

  const orphanedAudio = []
  if (isDir(AUDIO_DIR)) {
    for (const file of fs.readdirSync(AUDIO_DIR)) {
      if (!file.endsWith('.mp3')) continue
      if (!referencedAudio.has(file)) orphanedAudio.push(file)
    }
  }

  // ── 5. Find stale manifest entries ───────────────────────────────────────

  const manifestPath = path.join(sourceDir, '.ingest-manifest.json')
  let manifest = {}
  let manifestDirty = false
  if (isFile(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      manifest = {}
    }
  }
  const staleManifestKeys = Object.keys(manifest).filter((k) => !activeWorkSlugs.has(k))
  if (staleManifestKeys.length > 0) manifestDirty = true

  // ── 6. Report ──────────────────────────────────────────────────────────────

  const verb = APPLY ? 'Deleted' : 'Would delete'
  let totalOrphans = 0

  if (orphanedMdxFiles.length > 0) {
    console.log(`${verb} MDX (${orphanedMdxFiles.length}):`)
    for (const f of orphanedMdxFiles.sort()) {
      console.log(`  ${f}`)
    }
  }

  if (orphanedImages.length > 0) {
    console.log(`${verb} images (${orphanedImages.length}):`)
    for (const f of orphanedImages.sort()) {
      console.log(`  ${f}`)
    }
  }

  if (orphanedAudio.length > 0) {
    console.log(`${verb} audio (${orphanedAudio.length}):`)
    for (const f of orphanedAudio.sort()) {
      console.log(`  ${f}`)
    }
  }

  if (staleManifestKeys.length > 0) {
    console.log(`${verb} manifest entries (${staleManifestKeys.length}): ${staleManifestKeys.join(', ')}`)
  }

  totalOrphans = orphanedMdxFiles.length + orphanedImages.length + orphanedAudio.length + staleManifestKeys.length

  if (totalOrphans === 0) {
    console.log('No orphaned files found.')
    return
  }

  // ── 7. Delete ──────────────────────────────────────────────────────────────

  if (!APPLY) {
    console.log(`\n${totalOrphans} orphan(s) found. Run with --apply to delete them.`)
    return
  }

  for (const f of orphanedMdxFiles) {
    fs.unlinkSync(path.join(CONTENT_DIR, f))
  }
  for (const f of orphanedImages) {
    fs.unlinkSync(path.join(IMAGES_DIR, f))
  }
  for (const f of orphanedAudio) {
    fs.unlinkSync(path.join(AUDIO_DIR, f))
  }
  if (manifestDirty) {
    for (const k of staleManifestKeys) delete manifest[k]
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  }

  console.log(`\nDeleted ${totalOrphans} orphaned file(s).`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
