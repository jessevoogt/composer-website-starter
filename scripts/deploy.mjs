#!/usr/bin/env node
// Deploy script: build output + API backend → SFTP server (changed files only)
//
// Deploys two directories:
//   dist/  → SFTP_REMOTE_PATH/          (Astro static site)
//   api/   → SFTP_REMOTE_PATH/api/      (PHP backend — excludes .env, storage/)
//
// Credentials:
//   Password stored in macOS Keychain — NEVER in any file on disk.
//   One-time setup:
//     security add-generic-password -a "YOUR_SFTP_USER" -s "YOUR_SFTP_HOST" -w
//   (prompts for password; it never appears on screen or in shell history)
//
// Config:
//   source/site/deploy.yaml (managed via Keystatic)
//   YAML keys: sftpHost, sftpUser, sftpRemotePath, sftpPort
//
// Flags:
//   --dry-run    Show what would be uploaded (manifest-based, no network). Fast.
//   --verify     Compare local files against the live server via SFTP. Slow but
//                thorough — useful for auditing drift between local and remote.
//   --force      Clear the local manifest and re-upload all files.
//   --skip-api   Deploy dist/ only, skip the api/ backend.
//
// Change detection (normal deploy):
//   A local .deploy-manifest.json records { size, hash } for every uploaded file.
//   On each run: size differs → upload; same size → SHA-256 compare → upload if changed.
//   Files absent from manifest are treated as new. Remote files not in dist/ are left alone.
//
// Skipped files:
//   .DS_Store, Thumbs.db, desktop.ini — OS metadata, never deployed.
//   api/.env, api/storage/ — server-only, never overwritten.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import SftpClient from 'ssh2-sftp-client'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const VERIFY = process.argv.includes('--verify')
const FORCE = process.argv.includes('--force')
const SKIP_API = process.argv.includes('--skip-api')

// ─── Load deploy config (source/site/deploy.yaml via Keystatic) ─────────────

function loadDeployYaml() {
  const yamlPath = path.join(root, 'source', 'site', 'deploy.yaml')
  if (!fs.existsSync(yamlPath)) return {}
  try {
    const raw = fs.readFileSync(yamlPath, 'utf8')
    return yaml.load(raw) || {}
  } catch {
    return {}
  }
}

const deployYaml = loadDeployYaml()

const SFTP_HOST = deployYaml.sftpHost || ''
const SFTP_USER = deployYaml.sftpUser || ''
const SFTP_REMOTE_PATH = (deployYaml.sftpRemotePath || '').replace(/\/$/, '')
const SFTP_PORT = Number(deployYaml.sftpPort || 22)
// Private remote path: auto-derived from public path if blank (public_html → private_html)
const SFTP_PRIVATE_REMOTE_PATH = (() => {
  const explicit = (deployYaml.sftpPrivateRemotePath || '').replace(/\/$/, '')
  if (explicit) return explicit
  if (SFTP_REMOTE_PATH.includes('public_html')) {
    return SFTP_REMOTE_PATH.replace('public_html', 'private_html')
  }
  return ''
})()

const missing = []
if (!SFTP_HOST) missing.push('sftpHost')
if (!SFTP_USER) missing.push('sftpUser')
if (!SFTP_REMOTE_PATH) missing.push('sftpRemotePath')

if (missing.length > 0) {
  console.error('[deploy] Missing required config in source/site/deploy.yaml:')
  for (const key of missing) console.error(`  ${key}`)
  console.error('\nConfigure deployment via Keystatic or edit source/site/deploy.yaml directly.')
  process.exit(1)
}

// ─── Keychain password retrieval ─────────────────────────────────────────────

function getKeychainPassword(host, user) {
  try {
    return execSync(
      `security find-generic-password -a ${JSON.stringify(user)} -s ${JSON.stringify(host)} -w`,
      { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }
    ).trim()
  } catch {
    console.error('[deploy] SFTP password not found in macOS Keychain.')
    console.error('[deploy] Run this once to store it (you will be prompted for the password):')
    console.error(`\n  security add-generic-password -a ${JSON.stringify(user)} -s ${JSON.stringify(host)} -w\n`)
    process.exit(1)
  }
}

// ─── Change detection ─────────────────────────────────────────────────────────

const MANIFEST_PATH = path.join(root, '.deploy-manifest.json')

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function needsUpload(localPath, relPath, manifest) {
  const localSize = fs.statSync(localPath).size
  const entry = manifest[relPath]
  if (!entry || entry.size !== localSize) return true
  return sha256File(localPath) !== entry.hash
}

// OS-generated metadata files that should never be deployed
const SKIP_FILENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

// ─── Recursive directory walkers ─────────────────────────────────────────────

function walkDir(dir, baseDir) {
  const results = []
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir))
    } else {
      if (SKIP_FILENAMES.has(name)) continue
      results.push({ localPath: fullPath, relPath: path.relative(baseDir, fullPath).replace(/\\/g, '/') })
    }
  }
  return results
}

// Files and directories inside api/ that must never be deployed.
// .env contains secrets (configured on the server manually).
// storage/ contains runtime state (rate limit counters).
const API_SKIP = new Set(['.env', 'storage', '.gitignore'])

function walkApiDir(dir, baseDir) {
  const results = []
  for (const name of fs.readdirSync(dir)) {
    if (API_SKIP.has(name)) continue
    if (SKIP_FILENAMES.has(name)) continue
    const fullPath = path.join(dir, name)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkApiDir(fullPath, baseDir))
    } else {
      // Prefix with api/ so remote path becomes SFTP_REMOTE_PATH/api/…
      const relPath = 'api/' + path.relative(baseDir, fullPath).replace(/\\/g, '/')
      results.push({ localPath: fullPath, relPath })
    }
  }
  return results
}

// ─── Private scores walker ──────────────────────────────────────────────────

const PRIVATE_SKIP = new Set(['.pdf-manifest.json'])

function walkPrivateScoresDir(dir, baseDir) {
  if (!fs.existsSync(dir)) return []
  const results = []
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_FILENAMES.has(name)) continue
    if (PRIVATE_SKIP.has(name)) continue
    const fullPath = path.join(dir, name)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkPrivateScoresDir(fullPath, baseDir))
    } else {
      // Prefix with scores/ so remote path becomes PRIVATE_REMOTE_PATH/scores/…
      const relPath = 'scores/' + path.relative(baseDir, fullPath).replace(/\\/g, '/')
      results.push({ localPath: fullPath, relPath, remoteRoot: SFTP_PRIVATE_REMOTE_PATH })
    }
  }
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const distDir = path.join(root, 'dist')
const apiDir = path.join(root, 'api')
const privateScoresDir = path.join(root, 'private', 'scores')

if (!fs.existsSync(distDir)) {
  console.error('[deploy] dist/ not found. Run a build first.')
  process.exit(1)
}

const allFiles = walkDir(distDir, distDir)

console.log(`[deploy] ${allFiles.length} files in dist/`)

// Include API backend files (unless --skip-api)
if (!SKIP_API && fs.existsSync(apiDir)) {
  const apiFiles = walkApiDir(apiDir, apiDir)
  allFiles.push(...apiFiles)
  console.log(`[deploy] ${apiFiles.length} files in api/ (excludes .env, storage/)`)
} else if (SKIP_API) {
  console.log('[deploy] Skipping api/ (--skip-api)')
}

// Include private PDF scores (for private_html deployment)
if (SFTP_PRIVATE_REMOTE_PATH && fs.existsSync(privateScoresDir)) {
  const privateFiles = walkPrivateScoresDir(privateScoresDir, privateScoresDir)
  allFiles.push(...privateFiles)
  console.log(`[deploy] ${privateFiles.length} files in private/scores/ → ${SFTP_PRIVATE_REMOTE_PATH}/scores/`)
} else if (!SFTP_PRIVATE_REMOTE_PATH && fs.existsSync(privateScoresDir)) {
  console.log('[deploy] Skipping private/scores/ (no private remote path configured)')
}

// ─── Dry run: manifest-based preview (no network) ───────────────────────────

if (DRY_RUN) {
  const manifest = FORCE ? {} : loadManifest()

  if (FORCE) {
    console.log('[deploy] --force: manifest cleared, all files shown as pending.\n')
  }

  console.log('[deploy] Dry run — comparing against local manifest…\n')

  const wouldUpload = []
  let unchanged = 0

  for (const { localPath, relPath } of allFiles) {
    const localSize = fs.statSync(localPath).size
    const entry = manifest[relPath]

    if (!entry) {
      wouldUpload.push({ relPath, reason: 'new (not in manifest)' })
    } else if (entry.size !== localSize) {
      wouldUpload.push({ relPath, reason: `size: ${entry.size} → ${localSize}` })
    } else {
      const localHash = sha256File(localPath)
      if (localHash !== entry.hash) {
        wouldUpload.push({ relPath, reason: 'content changed (same size)' })
      } else {
        unchanged++
      }
    }
  }

  if (wouldUpload.length > 0) {
    for (const { relPath, reason } of wouldUpload) {
      const prefix = reason.startsWith('new') ? '  +' : '  ↑'
      console.log(`${prefix} ${relPath}  (${reason})`)
    }
    console.log('')
  }

  console.log(`[deploy] Dry run complete. Would upload: ${wouldUpload.length}  Unchanged: ${unchanged}  Total: ${allFiles.length}`)
  process.exit(0)
}

// ─── Verify: compare against live remote state via SFTP ─────────────────────

if (VERIFY) {
  const password = getKeychainPassword(SFTP_HOST, SFTP_USER)
  const sftp = new SftpClient()

  console.log('[deploy] Verify — comparing against live server…\n')

  try {
    console.log(`[deploy] Connecting to ${SFTP_USER}@${SFTP_HOST}:${SFTP_PORT}…`)
    await sftp.connect({ host: SFTP_HOST, port: SFTP_PORT, username: SFTP_USER, password })
    console.log('[deploy] Connected.\n')

    const wouldUpload = []
    let unchanged = 0

    for (const { localPath, relPath, remoteRoot } of allFiles) {
      const base = remoteRoot || SFTP_REMOTE_PATH
      const remotePath = `${base}/${relPath}`
      const localSize = fs.statSync(localPath).size

      const remoteType = await sftp.exists(remotePath)

      if (remoteType === false) {
        wouldUpload.push({ relPath, reason: 'new' })
        continue
      }

      const remoteStats = await sftp.stat(remotePath)

      if (remoteStats.size !== localSize) {
        wouldUpload.push({ relPath, reason: `size: ${remoteStats.size} → ${localSize}` })
        continue
      }

      // Same size — download remote and compare hashes
      const remoteBuffer = await sftp.get(remotePath)
      const remoteHash = crypto.createHash('sha256').update(remoteBuffer).digest('hex')
      const localHash = sha256File(localPath)

      if (remoteHash !== localHash) {
        wouldUpload.push({ relPath, reason: 'content changed (same size)' })
      } else {
        unchanged++
      }
    }

    if (wouldUpload.length > 0) {
      for (const { relPath, reason } of wouldUpload) {
        const prefix = reason === 'new' ? '  +' : '  ↑'
        console.log(`${prefix} ${relPath}  (${reason})`)
      }
      console.log('')
    }

    console.log(`[deploy] Verify complete. Would upload: ${wouldUpload.length}  Unchanged: ${unchanged}  Total: ${allFiles.length}`)
  } finally {
    await sftp.end()
  }

  process.exit(0)
}

// ─── Normal deploy: manifest-based change detection ───────────────────────────

// Retrieve password from Keychain (may prompt for macOS login password if Keychain is locked)
const password = getKeychainPassword(SFTP_HOST, SFTP_USER)
const sftp = new SftpClient()

const manifest = FORCE ? {} : loadManifest()

if (FORCE) {
  console.log('[deploy] --force: manifest cleared, all files will be uploaded.')
}

const toUpload = allFiles.filter(({ localPath, relPath }) => needsUpload(localPath, relPath, manifest))
const toSkip = allFiles.length - toUpload.length

console.log(`[deploy] ${toUpload.length} to upload, ${toSkip} unchanged (manifest)`)

if (toUpload.length === 0) {
  console.log('[deploy] Nothing to upload. Already up to date.')
  process.exit(0)
}

try {
  console.log(`[deploy] Connecting to ${SFTP_USER}@${SFTP_HOST}:${SFTP_PORT}…`)
  await sftp.connect({ host: SFTP_HOST, port: SFTP_PORT, username: SFTP_USER, password })
  console.log('[deploy] Connected.\n')

  const newManifest = { ...manifest }
  const ensuredDirs = new Set()

  let uploaded = 0
  let failed = 0

  for (const { localPath, relPath, remoteRoot } of toUpload) {
    const base = remoteRoot || SFTP_REMOTE_PATH
    const remotePath = `${base}/${relPath}`
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf('/'))

    // Ensure remote parent directory exists (create once per unique dir)
    if (!ensuredDirs.has(remoteDir)) {
      await sftp.mkdir(remoteDir, true)
      ensuredDirs.add(remoteDir)
    }

    try {
      await sftp.put(localPath, remotePath)
      const localSize = fs.statSync(localPath).size
      const hash = sha256File(localPath)
      newManifest[relPath] = { size: localSize, hash }
      uploaded++
      process.stdout.write(`  ↑ ${relPath}\n`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${relPath} — ${err.message}`)
    }
  }

  // Prune stale manifest entries (files no longer in dist/)
  const currentRelPaths = new Set(allFiles.map(({ relPath }) => relPath))
  for (const key of Object.keys(newManifest)) {
    if (!currentRelPaths.has(key)) delete newManifest[key]
  }

  saveManifest(newManifest)

  console.log(`\n[deploy] Done. Uploaded: ${uploaded}  Skipped: ${toSkip}  Failed: ${failed}  Total: ${allFiles.length}`)

  if (failed > 0) {
    process.exit(1)
  }
} finally {
  await sftp.end()
}
