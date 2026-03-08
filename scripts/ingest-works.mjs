#!/usr/bin/env node
// Script: ingest-works.mjs
// Reads work source folders (from Google Drive / local directory),
// processes assets (images, audio), and generates MDX files for Astro content collections.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { execSync, spawnSync } from 'child_process'
import yaml from 'js-yaml'

// ─── Constants ───────────────────────────────────────────────────────────────

const workspaceRoot = process.cwd()
const IMAGES_DIR = path.join(workspaceRoot, 'src', 'assets', 'images', 'works')
const AUDIO_DIR = path.join(workspaceRoot, 'public', 'audio')
const CONTENT_DIR = path.join(workspaceRoot, 'src', 'content', 'works')
const FORCE = process.argv.includes('--force')

// Valid crop shortcodes (matching generate-works-images.mjs)
const VALID_CROPS = new Set(['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br'])

// Asset discovery: ordered by preference (lossless-first for audio, common web formats for images)
const IMAGE_EXTS = ['.webp', '.jpg', '.jpeg', '.png', '.tiff']
const AUDIO_EXTS = ['.wav', '.aiff', '.flac', '.mp3']

// ─── Configuration Loading ───────────────────────────────────────────────────

async function loadConfig() {
  const configPath = path.join(workspaceRoot, 'source.config.mjs')
  let config = {}
  if (fs.existsSync(configPath)) {
    const mod = await import(`file://${configPath}`)
    config = mod.default || {}
  }

  const rawSourceDir = (config.sourceDir || '').replace(/^~/, process.env.HOME)
  // Resolve relative paths against workspace root
  const sourceDir = path.isAbsolute(rawSourceDir) ? rawSourceDir : path.resolve(workspaceRoot, rawSourceDir)

  if (!sourceDir) {
    console.error('Error: No source directory configured.')
    console.error('Set sourceDir in source.config.mjs')
    process.exit(1)
  }

  // Read siteUrl from source/site/site.yaml for ID3 tag comments
  let siteUrl = 'https://example.com'
  const siteYamlPath = path.join(workspaceRoot, 'source', 'site', 'site.yaml')
  if (fs.existsSync(siteYamlPath)) {
    try {
      const siteData = yaml.load(fs.readFileSync(siteYamlPath, 'utf8'))
      if (siteData?.siteUrl && typeof siteData.siteUrl === 'string') {
        siteUrl = siteData.siteUrl.replace(/\/+$/, '') // strip trailing slash
      }
    } catch {
      // Fall back to default
    }
  }

  return {
    sourceDir,
    defaultComposer: config.defaultComposer || 'Composer Name',
    mp3Bitrate: config.mp3Bitrate || 320,
    siteUrl,
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath))
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

function isNewerThan(src, target) {
  if (!isFile(target)) return true
  return fs.statSync(src).mtimeMs > fs.statSync(target).mtimeMs
}

function hasFfmpeg() {
  try {
    execSync('which ffmpeg', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** Get audio duration in seconds using ffprobe */
function getAudioDuration(filePath) {
  try {
    const result = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const seconds = parseFloat(result.stdout.trim())
    if (isNaN(seconds)) return null
    return seconds
  } catch {
    return null
  }
}

/** Format seconds into a human-readable duration like "4' 15\"" */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (secs === 0) return `${mins}'`
  return `${mins}' ${secs.toString().padStart(2, '0')}"`
}

function buildCropSuffix(crop) {
  if (!crop) return ''
  const code = crop.toLowerCase().trim()
  if (VALID_CROPS.has(code)) return `-crop-${code}`
  console.warn(`  Warning: invalid crop code "${crop}", ignoring`)
  return ''
}

/**
 * Return the path of the first matching file: dir/stem+ext for each ext in extensions, or null.
 * Extensions are tried in order — put preferred formats first (e.g. lossless before lossy).
 */
function findFile(dir, stem, extensions) {
  for (const ext of extensions) {
    const p = path.join(dir, stem + ext)
    if (isFile(p)) return p
  }
  return null
}

/**
 * Return sorted list of movement subdirectories matching the movement-NN naming convention.
 * Each entry is { name: 'movement-01', dir: '/absolute/path/to/movement-01' }.
 */
function findMovementDirs(recDir) {
  if (!isDir(recDir)) return []
  return fs
    .readdirSync(recDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^movement-\d+$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, dir: path.join(recDir, e.name) }))
}

// ─── Discovery ───────────────────────────────────────────────────────────────

function discoverWorks(sourceDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  const works = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const workDir = path.join(sourceDir, entry.name)
    const metaPath = path.join(workDir, 'work.yaml')
    if (!isFile(metaPath)) {
      console.warn(`  Warning: ${entry.name}/ has no work.yaml, skipping`)
      continue
    }

    const slug = entry.name
    // Recordings are stored inline in work.yaml under a `recordings` array.
    // Each item has a `folder` field pointing to the subfolder that holds asset files.
    // Asset files (audio, photos) within each folder are auto-detected by convention.
    const recordingFolders = []
    const inlineRecordings = (yaml.load(fs.readFileSync(metaPath, 'utf8')) || {}).recordings || []
    for (const rec of inlineRecordings) {
      if (!rec.folder) continue
      const recDir = path.join(workDir, 'recordings', rec.folder)
      recordingFolders.push({
        name: rec.folder,
        dir: recDir,
        meta: rec,
      })
    }

    const proseSourcePath = path.join(workDir, 'prose.md')

    works.push({
      slug,
      sourceDir: workDir,
      metaPath,
      recordingFolders,
      proseSourcePath: isFile(proseSourcePath) ? proseSourcePath : null,
    })
  }

  return works.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ─── Change Detection ────────────────────────────────────────────────────────

function loadManifest(sourceDir) {
  const manifestPath = path.join(sourceDir, '.ingest-manifest.json')
  if (isFile(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      return {}
    }
  }
  return {}
}

function saveManifest(sourceDir, manifest) {
  const manifestPath = path.join(sourceDir, '.ingest-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function computeWorkHash(work) {
  return sha256(hashFile(work.metaPath))
}

function hasAssetChanges(work, manifest) {
  // Thumbnail — compare source against the final 740w.webp.
  // generate-works-images deletes the intermediate copy after conversion,
  // so checking against it always returns "newer" and causes a false positive.
  const thumbnailPath = findFile(work.sourceDir, 'thumbnail', IMAGE_EXTS)
  if (thumbnailPath) {
    const webpPath = path.join(IMAGES_DIR, `${work.slug}-thumbnail-740w.webp`)
    if (isNewerThan(thumbnailPath, webpPath)) return true
  }

  // Audio and photo assets — compare source mtimes against the manifest's last-processed timestamp.
  // Building the exact target audio filename requires the full config (async), so we use the
  // manifest timestamp as a reliable "last fully processed" reference instead.
  const lastProcessedMs = manifest[work.slug]?.timestamp
    ? new Date(manifest[work.slug].timestamp).getTime()
    : 0

  // Directory mtimes catch add/remove/rename events (not just file content updates).
  // This is important for cases like deleting/renaming recording audio files where the
  // generated MP3 must be removed from frontmatter on the next ingest pass.
  if (isDir(work.sourceDir) && fs.statSync(work.sourceDir).mtimeMs > lastProcessedMs) return true

  for (const rec of work.recordingFolders) {
    if (isDir(rec.dir) && fs.statSync(rec.dir).mtimeMs > lastProcessedMs) return true

    // Recording-level photo — compare against the final 740w.webp
    const recPhotoPath = findFile(rec.dir, 'photo', IMAGE_EXTS)
    if (recPhotoPath) {
      const webpPath = path.join(IMAGES_DIR, `${work.slug}-${rec.name}-photo-740w.webp`)
      if (isNewerThan(recPhotoPath, webpPath)) return true
    }

    // Recording-level audio (single-movement)
    const recAudioPath = findFile(rec.dir, 'recording', AUDIO_EXTS)
    if (recAudioPath && fs.statSync(recAudioPath).mtimeMs > lastProcessedMs) return true

    // Movement subdirs (multi-movement)
    const movDirs = findMovementDirs(rec.dir)
    for (const movDir of movDirs) {
      if (fs.statSync(movDir.dir).mtimeMs > lastProcessedMs) return true

      const movPhotoPath = findFile(movDir.dir, 'photo', IMAGE_EXTS)
      if (movPhotoPath) {
        const webpPath = path.join(IMAGES_DIR, `${work.slug}-${rec.name}-mov-${movDir.name}-740w.webp`)
        if (isNewerThan(movPhotoPath, webpPath)) return true
      }
      const movAudioPath = findFile(movDir.dir, 'recording', AUDIO_EXTS)
      if (movAudioPath && fs.statSync(movAudioPath).mtimeMs > lastProcessedMs) return true
    }
  }

  // Prose body — compare prose.md mtime against the generated MDX.
  // If only prose changes (no YAML edit), the YAML hash won't change, so we check here.
  if (work.proseSourcePath && isFile(work.proseSourcePath)) {
    const mdxPath = path.join(CONTENT_DIR, `${work.slug}.mdx`)
    if (isNewerThan(work.proseSourcePath, mdxPath)) return true
  }

  return false
}

// ─── Asset Processing ────────────────────────────────────────────────────────

const RASTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])

function copyImage(srcPath, targetName) {
  const targetPath = path.join(IMAGES_DIR, targetName)
  fs.mkdirSync(IMAGES_DIR, { recursive: true })

  // For raster files, check against the final 740w.webp rather than the intermediate copy.
  // generate-works-images deletes the intermediate after conversion, so that check is unreliable.
  const ext = path.extname(targetName).toLowerCase()
  if (RASTER_EXTS.has(ext)) {
    const base = path.basename(targetName, ext).replace(/-crop-[a-z]{2}$/, '')
    const webpPath = path.join(IMAGES_DIR, `${base}-740w.webp`)
    if (!isNewerThan(srcPath, webpPath)) return targetName
  } else if (!isNewerThan(srcPath, targetPath)) {
    return targetName
  }

  fs.copyFileSync(srcPath, targetPath)
  console.log(`  Image: copied ${targetName}`)
  return targetName
}

function processAudio(srcPath, targetFilename, config, id3Tags) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  const targetPath = path.join(AUDIO_DIR, targetFilename)
  const ext = path.extname(srcPath).toLowerCase()

  if (ext === '.mp3') {
    // Just copy MP3 files
    if (isNewerThan(srcPath, targetPath)) {
      fs.copyFileSync(srcPath, targetPath)
      console.log(`  Audio: copied ${targetFilename}`)
    }
  } else if (['.wav', '.aiff', '.flac'].includes(ext)) {
    // Convert to MP3 via ffmpeg
    if (!hasFfmpeg()) {
      console.warn(`  Warning: ffmpeg not found, cannot convert ${path.basename(srcPath)}`)
      console.warn('  Install with: brew install ffmpeg')
      return null
    }
    if (isNewerThan(srcPath, targetPath)) {
      const args = ['-i', srcPath, '-codec:a', 'libmp3lame', '-b:a', `${config.mp3Bitrate}k`]
      // Embed ID3 tags
      if (id3Tags.title) args.push('-metadata', `title=${id3Tags.title}`)
      if (id3Tags.artist) args.push('-metadata', `artist=${id3Tags.artist}`)
      if (id3Tags.albumArtist) args.push('-metadata', `album_artist=${id3Tags.albumArtist}`)
      if (id3Tags.album) args.push('-metadata', `album=${id3Tags.album}`)
      if (id3Tags.year) args.push('-metadata', `date=${id3Tags.year}`)
      if (id3Tags.comment) args.push('-metadata', `comment=${id3Tags.comment}`)
      args.push('-y', targetPath)

      const result = spawnSync('ffmpeg', args, { stdio: 'pipe' })
      if (result.status !== 0) {
        console.error(`  Error converting ${path.basename(srcPath)}:`, result.stderr?.toString().slice(-200))
        return null
      }
      console.log(`  Audio: converted ${path.basename(srcPath)} → ${targetFilename}`)
    }
  } else {
    console.warn(`  Warning: unsupported audio format ${ext} for ${path.basename(srcPath)}`)
    return null
  }

  return `/audio/${targetFilename}`
}

function buildAudioFilename(title, subtitle, performers, ensemble, composer, movementLabel) {
  const who = ensemble || performers?.join(' and ') || 'Unknown'
  const fullTitle = subtitle ? `${title} ${subtitle}` : title
  let name
  if (movementLabel) {
    name = `${who} performing ${composer}'s ${fullTitle} - ${movementLabel}.mp3`
  } else {
    name = `${who} performing ${fullTitle} by ${composer}.mp3`
  }
  return name
}

function processRecordingImage(srcPath, slug, recFolderName, suffix, crop) {
  const ext = path.extname(srcPath)
  const cropSuffix = buildCropSuffix(crop)
  const targetName = `${slug}-${recFolderName}${suffix}${cropSuffix}${ext}`
  copyImage(srcPath, targetName)
  return targetName
}

// ─── MDX Generation ──────────────────────────────────────────────────────────

function buildFrontmatter(work, config) {
  const workMeta = yaml.load(fs.readFileSync(work.metaPath, 'utf8')) || {}

  // Build top-level frontmatter
  const fm = {}
  fm.title = workMeta.title || work.slug
  if (workMeta.subtitle) fm.subtitle = workMeta.subtitle
  fm.composer = workMeta.composer || config.defaultComposer
  fm.description = workMeta.description || ''

  // Categorization (nested object from work.yaml)
  const cat = workMeta.categorization
  if (cat && typeof cat === 'object') {
    const categorization = {}
    if (cat.tags?.length) categorization.tags = cat.tags
    if (cat.instrumentation && typeof cat.instrumentation === 'object') {
      // New object format: { instruments: [...] } or { grouped: true, sections: [...] }
      categorization.instrumentation = cat.instrumentation
    } else if (Array.isArray(cat.instrumentation) && cat.instrumentation.length) {
      // Legacy flat array format — wrap in object
      categorization.instrumentation = { instruments: cat.instrumentation }
    }
    if (cat.searchKeywords?.length) categorization.searchKeywords = cat.searchKeywords
    if (Object.keys(categorization).length > 0) fm.categorization = categorization
  }

  // Dates, difficulty, etc.
  if (workMeta.completionDate) fm.completionDate = workMeta.completionDate
  if (workMeta.duration) fm.duration = workMeta.duration
  if (workMeta.difficulty) fm.difficulty = workMeta.difficulty
  if (workMeta.programNote) fm.programNote = workMeta.programNote
  if (workMeta.movements?.length) fm.movements = workMeta.movements

  // Perusal score: auto-detected as score.pdf in the work folder
  if (isFile(path.join(work.sourceDir, 'score.pdf'))) {
    fm.hasPerusalScore = true
  }

  // Score & PDF overrides: nested object from work.yaml
  const so = workMeta.scoreOverrides
  if (so && typeof so === 'object') {
    const overrides = {}
    if (so.viewerWatermark) overrides.viewerWatermark = so.viewerWatermark
    if (so.viewerGating) overrides.viewerGating = so.viewerGating
    if (so.pdfWatermarked) overrides.pdfWatermarked = so.pdfWatermarked
    if (so.pdfOriginal) overrides.pdfOriginal = so.pdfOriginal
    if (so.pdfWatermarkedGating) overrides.pdfWatermarkedGating = so.pdfWatermarkedGating
    if (so.pdfOriginalGating) overrides.pdfOriginalGating = so.pdfOriginalGating
    if (Object.keys(overrides).length > 0) fm.scoreOverrides = overrides
  }

  if (workMeta.preferredHeroId) fm.preferredHeroId = workMeta.preferredHeroId

  // Homepage selection (nested object from work.yaml)
  const hs = workMeta.homepageSelection
  if (hs && typeof hs === 'object') {
    const homepageSelection = {}
    if (hs.selected) homepageSelection.selected = true
    if (hs.selectedOrder != null) homepageSelection.selectedOrder = hs.selectedOrder
    if (Object.keys(homepageSelection).length > 0) fm.homepageSelection = homepageSelection
  }

  // Thumbnail: auto-detected as thumbnail.{webp,jpg,jpeg,png,tiff} in the work folder
  const thumbnailSrcPath = findFile(work.sourceDir, 'thumbnail', IMAGE_EXTS)
  if (thumbnailSrcPath) {
    const cropSuffix = buildCropSuffix(workMeta.thumbnail?.crop)
    const ext = path.extname(thumbnailSrcPath)
    const targetName = `${work.slug}-thumbnail${cropSuffix}${ext}`
    copyImage(thumbnailSrcPath, targetName)
    // The webp name that generate-works-images.mjs will produce
    const webpName = `${work.slug}-thumbnail-740w.webp`
    fm.thumbnail = {
      src: `/assets/images/works/${webpName}`,
      alt: workMeta.thumbnail?.alt || `${fm.title} by ${fm.composer}`,
    }
  }

  // Sheet music
  if (workMeta.sheetMusic?.length) {
    fm.sheetMusic = workMeta.sheetMusic
  }

  // Performances
  if (workMeta.performances?.length) {
    fm.performances = workMeta.performances
  }

  // Recordings
  fm.recordings = []
  for (const recFolder of work.recordingFolders) {
    const recMeta = recFolder.meta
    const recording = buildRecording(recMeta, recFolder, work, workMeta, config)
    if (recording) fm.recordings.push(recording)
  }

  return fm
}

function buildRecording(recMeta, recFolder, work, workMeta, config) {
  const rec = {}

  if (recMeta.ensemble) rec.ensemble = recMeta.ensemble
  if (recMeta.performers?.length) rec.performers = recMeta.performers
  if (recMeta.date) rec.date = recMeta.date
  if (recMeta.notes) rec.notes = recMeta.notes

  // Recording-level image: auto-detected as photo.{ext} in the recording folder
  const photoSrcPath = findFile(recFolder.dir, 'photo', IMAGE_EXTS)
  if (photoSrcPath) {
    const imgName = processRecordingImage(photoSrcPath, work.slug, recFolder.name, '-photo', recMeta.photo?.crop)
    const webpBase = imgName.replace(/-crop-\w+/, '').replace(/\.\w+$/, '')
    rec.image = {
      src: `/assets/images/works/${webpBase}-740w.webp`,
    }
    if (recMeta.photo?.alt) rec.image.alt = recMeta.photo.alt
    if (recMeta.photo?.crop) rec.image.position = recMeta.photo.crop
  }

  const title = workMeta.title || work.slug
  const subtitle = workMeta.subtitle || ''
  const composer = workMeta.composer || config.defaultComposer
  const performers = recMeta.performers || []
  const ensemble = recMeta.ensemble || ''

  rec.links = []

  // Multi-movement detection: look for movement-NN/ subdirs in the recording folder.
  // YAML movements[] entries are matched to movement dirs by position (index 0 → movement-01, etc.).
  const movDirs = findMovementDirs(recFolder.dir)
  if (movDirs.length > 0) {
    const movements = recMeta.movements ?? []
    for (let i = 0; i < movDirs.length; i++) {
      const movDir = movDirs[i]
      const movMeta = movements[i] ?? {}
      const link = buildRecordingLink(
        movMeta,
        movDir,
        recFolder,
        work,
        workMeta,
        config,
        performers,
        ensemble,
        title,
        subtitle,
        composer,
        movMeta.label,
      )
      if (link) rec.links.push(link)
    }
  } else {
    // Single recording
    const link = buildSingleRecordingLink(
      recMeta,
      recFolder,
      work,
      workMeta,
      config,
      performers,
      ensemble,
      title,
      subtitle,
      composer,
    )
    if (link) rec.links.push(link)
  }

  return rec
}

function buildSingleRecordingLink(
  recMeta,
  recFolder,
  work,
  workMeta,
  config,
  performers,
  ensemble,
  title,
  subtitle,
  composer,
) {
  const link = {}

  if (recMeta.youtubeUrl) link.url = recMeta.youtubeUrl

  // Audio: auto-detected as recording.{wav,aiff,flac,mp3} in the recording folder
  const audioSrcPath = findFile(recFolder.dir, 'recording', AUDIO_EXTS)

  // Duration: auto-detect from file if not specified in YAML
  let duration = recMeta.duration
  if (!duration && audioSrcPath) {
    const secs = getAudioDuration(audioSrcPath)
    if (secs) duration = formatDuration(secs)
  }
  if (duration) link.duration = duration

  // Process audio file
  if (audioSrcPath) {
    const audioFilename = buildAudioFilename(title, subtitle, performers, ensemble, composer, null)
    const id3Tags = {
      title: subtitle ? `${title} ${subtitle}` : title,
      artist: ensemble || performers?.join(', ') || '',
      albumArtist: composer,
      album: subtitle ? `${title} ${subtitle}` : title,
      year: workMeta.completionDate?.slice(0, 4) || '',
      comment: `${config.siteUrl}/music/${work.slug}/`,
    }
    const publicPath = processAudio(audioSrcPath, audioFilename, config, id3Tags)
    if (publicPath) link.mp3 = publicPath
  }

  if (recMeta.featuredRecording) link.featuredRecording = true

  // Link-level image: use recording photo if available, else work thumbnail
  const linkImage = resolveLinkImage(recMeta, recFolder, work, workMeta)
  if (linkImage) link.image = linkImage

  return Object.keys(link).length > 0 ? link : null
}

/**
 * Build a link entry for a single movement in a multi-movement recording.
 * @param {object} movMeta  - Movement metadata from YAML (label, youtubeUrl, duration, photoAlt, featuredRecording)
 * @param {{ name: string, dir: string }} movDir - Movement subdirectory info from findMovementDirs
 */
function buildRecordingLink(
  movMeta,
  movDir,
  recFolder,
  work,
  workMeta,
  config,
  performers,
  ensemble,
  title,
  subtitle,
  composer,
  movementLabel,
) {
  const link = {}

  if (movMeta.youtubeUrl) link.url = movMeta.youtubeUrl
  if (movMeta.label) link.label = movMeta.label

  // Audio: auto-detected as recording.{wav,aiff,flac,mp3} in the movement subfolder
  const audioSrcPath = findFile(movDir.dir, 'recording', AUDIO_EXTS)

  // Duration: auto-detect from file if not specified in YAML
  let duration = movMeta.duration
  if (!duration && audioSrcPath) {
    const secs = getAudioDuration(audioSrcPath)
    if (secs) duration = formatDuration(secs)
  }
  if (duration) link.duration = duration

  // Process audio file
  if (audioSrcPath) {
    const audioFilename = buildAudioFilename(title, subtitle, performers, ensemble, composer, movementLabel)
    const id3Tags = {
      title: movementLabel ? `${title} - ${movementLabel}` : title,
      artist: ensemble || performers?.join(', ') || '',
      albumArtist: composer,
      album: subtitle ? `${title} ${subtitle}` : title,
      year: workMeta.completionDate?.slice(0, 4) || '',
      comment: `${config.siteUrl}/music/${work.slug}/`,
    }
    const publicPath = processAudio(audioSrcPath, audioFilename, config, id3Tags)
    if (publicPath) link.mp3 = publicPath
  }

  if (movMeta.featuredRecording) link.featuredRecording = true

  // Per-movement image: auto-detected as photo.{ext} in the movement subfolder.
  // Use movement dir name as the suffix for stable, label-independent filenames.
  const photoSrcPath = findFile(movDir.dir, 'photo', IMAGE_EXTS)
  if (photoSrcPath) {
    const imgName = processRecordingImage(photoSrcPath, work.slug, recFolder.name, `-mov-${movDir.name}`, null)
    const webpBase = imgName.replace(/-crop-\w+/, '').replace(/\.\w+$/, '')
    link.image = {
      src: `/assets/images/works/${webpBase}-740w.webp`,
    }
    if (movMeta.photoAlt) link.image.alt = movMeta.photoAlt
  }

  return Object.keys(link).length > 0 ? link : null
}

function resolveLinkImage(recMeta, recFolder, work, workMeta) {
  // Use recording photo if available (auto-detected)
  const photoSrcPath = findFile(recFolder.dir, 'photo', IMAGE_EXTS)
  if (photoSrcPath) {
    const webpBase = `${work.slug}-${recFolder.name}-photo`
    return {
      src: `/assets/images/works/${webpBase}-740w.webp`,
      ...(recMeta.photo?.alt && { alt: recMeta.photo.alt }),
    }
  }
  // Fall back to work thumbnail (auto-detected)
  const thumbnailPath = findFile(work.sourceDir, 'thumbnail', IMAGE_EXTS)
  if (thumbnailPath) {
    const webpName = `${work.slug}-thumbnail-740w.webp`
    return {
      src: `/assets/images/works/${webpName}`,
      ...(workMeta.thumbnail?.alt && { alt: workMeta.thumbnail.alt }),
    }
  }
  return null
}

// ─── MDX File Writing ────────────────────────────────────────────────────────

function serializeFrontmatter(fm) {
  return yaml
    .dump(fm, {
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd()
}

function readExistingMdxBody(mdxPath) {
  if (!isFile(mdxPath)) return ''
  const content = fs.readFileSync(mdxPath, 'utf8')
  // Find the second --- fence
  const firstFence = content.indexOf('---')
  if (firstFence === -1) return content
  const secondFence = content.indexOf('---', firstFence + 3)
  if (secondFence === -1) return ''
  return content.slice(secondFence + 3).trim()
}

function writeMdx(slug, fm, work) {
  fs.mkdirSync(CONTENT_DIR, { recursive: true })
  const mdxPath = path.join(CONTENT_DIR, `${slug}.mdx`)

  const frontmatterYaml = serializeFrontmatter(fm)

  // Determine body content
  let body = ''
  if (work.proseSourcePath) {
    const existingMdxMtime = isFile(mdxPath) ? fs.statSync(mdxPath).mtimeMs : 0
    const proseMtime = fs.statSync(work.proseSourcePath).mtimeMs
    if (proseMtime > existingMdxMtime || !isFile(mdxPath)) {
      body = fs.readFileSync(work.proseSourcePath, 'utf8').trim()
    } else {
      body = readExistingMdxBody(mdxPath)
    }
  } else {
    body = readExistingMdxBody(mdxPath)
  }

  const mdxContent = body ? `---\n${frontmatterYaml}\n---\n${body}\n` : `---\n${frontmatterYaml}\n---\n`

  // Skip write if content is identical — avoids a spurious HMR trigger in the dev server
  if (isFile(mdxPath) && fs.readFileSync(mdxPath, 'utf8') === mdxContent) {
    return { mdxPath, written: false }
  }

  // Atomic write via a temp file in the system tmp dir (outside src/content/works/ so Astro's
  // watcher doesn't see the intermediate file) then rename into place atomically.
  const tmpPath = path.join(os.tmpdir(), `ingest-${slug}.mdx.tmp`)
  fs.writeFileSync(tmpPath, mdxContent, 'utf8')
  fs.renameSync(tmpPath, mdxPath)
  return { mdxPath, written: true }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Works Ingestion')
  console.log('===============')

  const config = await loadConfig()
  console.log(`Source: ${config.sourceDir}`)

  if (!isDir(config.sourceDir)) {
    console.error(`Error: Source directory not found: ${config.sourceDir}`)
    console.error('Create it or update the path in source.config.mjs')
    process.exit(1)
  }

  // Check for ffmpeg (needed for WAV conversion and duration detection)
  const ffmpegAvailable = hasFfmpeg()
  if (!ffmpegAvailable) {
    console.warn('Warning: ffmpeg not found. WAV conversion and auto-duration detection disabled.')
    console.warn('Install with: brew install ffmpeg\n')
  }

  if (FORCE) console.log('Mode: --force (reprocessing all works)\n')

  const works = discoverWorks(config.sourceDir)
  if (works.length === 0) {
    console.log('No work folders found.')
    return
  }

  console.log(`Found ${works.length} work(s)\n`)

  const manifest = loadManifest(config.sourceDir)
  const stats = { added: 0, updated: 0, skipped: 0 }

  for (const work of works) {
    const currentHash = computeWorkHash(work)
    const previousHash = manifest[work.slug]?.hash
    const isNew = !previousHash
    const hashChanged = currentHash !== previousHash
    const assetsChanged = hashChanged || hasAssetChanges(work, manifest)

    if (!FORCE && !hashChanged && !assetsChanged) {
      stats.skipped++
      continue
    }

    const action = isNew ? 'new' : 'updated'
    console.log(`Processing: ${work.slug} (${action})`)

    // Build frontmatter (which also copies assets)
    const fm = buildFrontmatter(work, config)
    const { mdxPath, written } = writeMdx(work.slug, fm, work)

    if (written) {
      console.log(`  MDX: wrote ${path.relative(workspaceRoot, mdxPath)}`)
    } else {
      console.log(`  MDX: unchanged (skipped)`)
    }

    // Update manifest
    manifest[work.slug] = { hash: currentHash, timestamp: new Date().toISOString() }

    if (isNew) stats.added++
    else stats.updated++
  }

  saveManifest(config.sourceDir, manifest)

  // Summary
  console.log('\n─── Summary ────────────────────────────')
  console.log(`  Added:   ${stats.added}`)
  console.log(`  Updated: ${stats.updated}`)
  console.log(`  Skipped: ${stats.skipped}`)
  console.log(`  Total:   ${works.length}`)

  if (stats.added > 0 || stats.updated > 0) {
    console.log('\nNext step: run `npm run generate:data` to process images and rebuild the search index.')
  } else {
    console.log('\nNo changes detected.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
