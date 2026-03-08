// Route handler: file upload for Keystatic preview fields.
//
// PUT /api/dev/file-upload?dest=heroes/my-hero/image.jpg
//
// Accepts a raw binary body (the file contents). The `dest` query param
// specifies the target path relative to `source/`. Before writing the new
// file, any existing files with the same conventional stem (e.g. `image.*`)
// are renamed with a timestamp suffix so they remain available as backups.
//
// After a successful upload the handler triggers the appropriate ingest
// pipeline so the change is reflected in the dev server immediately.

import fs from 'fs'
import path from 'path'
import { spawnScript } from '../helpers.mjs'
import { ROOT, SOURCE_DIR } from '../constants.mjs'

// ── Allowed upload prefixes (path segments relative to source/) ─────────

const ALLOWED_PREFIXES = ['heroes/', 'works/', 'pages/about/']

// ── Timestamp suffix for backup renames ─────────────────────────────────

function timestampSuffix() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// ── Rename existing files that share the same conventional stem ─────────

function backupExistingFiles(destDir, stem) {
  if (!fs.existsSync(destDir)) return []

  const renamed = []
  const entries = fs.readdirSync(destDir)
  const suffix = timestampSuffix()

  for (const entry of entries) {
    const ext = path.extname(entry)
    const name = path.basename(entry, ext)

    // Match files with the same stem (e.g. "image", "thumbnail", "recording", "photo", "score", "profile")
    if (name.toLowerCase() !== stem.toLowerCase()) continue

    const oldPath = path.join(destDir, entry)
    if (!fs.statSync(oldPath).isFile()) continue

    const backupName = `${stem}-${suffix}${ext}`
    const newPath = path.join(destDir, backupName)
    fs.renameSync(oldPath, newPath)
    renamed.push({ from: entry, to: backupName })
  }

  return renamed
}

// Ingest pipelines are triggered by file watchers (npm run dev:watch) or
// the post-save pipeline (npm run dev). For pages/about/ profile images,
// neither mechanism covers that path, so we trigger ingest-assets explicitly.

async function triggerIngestIfNeeded(dest) {
  if (!dest.startsWith('pages/about/')) return
  try {
    const script = path.join(ROOT, 'scripts', 'ingest-assets.mjs')
    console.log('[file-upload] Triggering ingest-assets for profile image…')
    await spawnScript(script)
    console.log('[file-upload] ingest-assets complete.')
  } catch (err) {
    console.error('[file-upload] Ingest trigger failed:', err.message)
  }
}

// ── Route handler ───────────────────────────────────────────────────────

export async function handleFileUpload(req, res, rawUrl) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  // HEAD request: probe if a file exists (used by file-upload-field to detect existing files)
  if (req.method === 'HEAD') {
    try {
      const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
      const probe = url.searchParams.get('probe') || ''
      if (!probe || !ALLOWED_PREFIXES.some((prefix) => probe.startsWith(prefix))) {
        res.statusCode = 400
        res.end()
        return
      }
      const resolved = path.resolve(SOURCE_DIR, probe)
      if (!resolved.startsWith(SOURCE_DIR) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.statusCode = 404
        res.end()
        return
      }
      const stat = fs.statSync(resolved)
      res.statusCode = 200
      res.setHeader('X-File-Size', String(stat.size))
      res.end()
    } catch {
      res.statusCode = 404
      res.end()
    }
    return
  }

  // DELETE request: remove a source file (backs up rather than permanently deleting)
  if (req.method === 'DELETE') {
    try {
      const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
      const filePath = url.searchParams.get('path') || ''

      if (!filePath || !ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid file path.' }))
        return
      }

      const resolved = path.resolve(SOURCE_DIR, filePath)
      if (!resolved.startsWith(SOURCE_DIR)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid path.' }))
        return
      }

      const destDir = path.dirname(resolved)
      const destFilename = path.basename(resolved)
      const destExt = path.extname(destFilename)
      const destStem = path.basename(destFilename, destExt)

      // Back up all files with the same stem (e.g. thumbnail.jpg, thumbnail.png)
      const backups = backupExistingFiles(destDir, destStem)

      if (backups.length === 0) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'No file found to remove.' }))
        return
      }

      console.log(`[file-upload] Removed (backed up) ${backups.length} file(s) for ${filePath}:`)
      for (const b of backups) {
        console.log(`  ${b.from} → ${b.to}`)
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, backups }))

      // Trigger ingest if needed (after response)
      triggerIngestIfNeeded(filePath)
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Failed to remove file: ' + err.message }))
    }
    return
  }

  if (req.method !== 'PUT') {
    res.statusCode = 405
    res.setHeader('Allow', 'PUT, HEAD, DELETE, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
    return
  }

  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const dest = url.searchParams.get('dest') || ''

    // Validate destination path
    const isAllowed = ALLOWED_PREFIXES.some((prefix) => dest.startsWith(prefix))
    if (!dest || !isAllowed) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid upload destination.' }))
      return
    }

    // Prevent path traversal
    const resolved = path.resolve(SOURCE_DIR, dest)
    if (!resolved.startsWith(SOURCE_DIR)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid path.' }))
      return
    }

    // Parse the destination into directory + filename parts
    const destDir = path.dirname(resolved)
    const destFilename = path.basename(resolved)
    const destExt = path.extname(destFilename)
    const destStem = path.basename(destFilename, destExt)

    // Ensure destination directory exists
    fs.mkdirSync(destDir, { recursive: true })

    // Backup any existing files with the same conventional stem
    const backups = backupExistingFiles(destDir, destStem, destExt)
    if (backups.length > 0) {
      console.log(`[file-upload] Backed up ${backups.length} existing file(s):`)
      for (const b of backups) {
        console.log(`  ${b.from} → ${b.to}`)
      }
    }

    // Stream request body to file
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const fileBuffer = Buffer.concat(chunks)
    fs.writeFileSync(resolved, fileBuffer)

    console.log(`[file-upload] Saved: ${dest} (${fileBuffer.length} bytes)`)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        ok: true,
        path: dest,
        size: fileBuffer.length,
        backups,
      }),
    )

    // Trigger ingest in the background if needed (after response is sent)
    triggerIngestIfNeeded(dest)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to upload file: ' + err.message }))
  }
}
