#!/usr/bin/env node
// Deploy script: build output → SFTP server (changed files only)
//
// Credentials:
//   The SFTP password is retrieved using a platform-specific secure store:
//
//   macOS — stored in Keychain. One-time setup:
//     security add-generic-password -a "YOUR_SFTP_USER" -s "YOUR_SFTP_HOST" -w
//     (prompts for password; it never appears on screen or in shell history)
//
//   Windows / Linux — set the SFTP_PASSWORD environment variable:
//     export SFTP_PASSWORD="your-password"        # Linux / macOS fallback
//     $env:SFTP_PASSWORD = "your-password"         # PowerShell
//     set SFTP_PASSWORD=your-password              # cmd.exe
//
// Config:
//   Primary: source/site/deploy.yaml (managed via Keystatic)
//   Fallback: .env.local (legacy, for backwards compatibility)
//
//   YAML keys: sftpHost, sftpUser, sftpRemotePath, sftpPort, sftpSkipAudio
//   .env.local keys: SFTP_HOST, SFTP_USER, SFTP_REMOTE_PATH, SFTP_PORT, SFTP_SKIP_AUDIO
//
// Flags:
//   --dry-run   Connect to SFTP, compare every local file against the live server
//               (size first, then SHA-256 hash for same-size files), and report
//               what would be uploaded — without transferring anything.
//
// Change detection (normal deploy):
//   A local .deploy-manifest.json records { size, hash } for every uploaded file.
//   On each run: size differs → upload; same size → SHA-256 compare → upload if changed.
//   Files absent from manifest are treated as new. Remote files not in dist/ are left alone.
//
// Skipped files:
//   .DS_Store, Thumbs.db, desktop.ini — OS metadata, never deployed.

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

// ─── Load deploy config (YAML primary, .env.local fallback) ─────────────────

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

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local')
  const vars = {}
  if (!fs.existsSync(envPath)) return vars
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*)$/)
    if (match) {
      const [, key, rawValue] = match
      vars[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
  }
  return vars
}

const deployYaml = loadDeployYaml()
const envVars = loadEnvLocal()

// YAML takes precedence, .env.local is fallback
const SFTP_HOST = deployYaml.sftpHost || envVars.SFTP_HOST || ''
const SFTP_USER = deployYaml.sftpUser || envVars.SFTP_USER || ''
const SFTP_REMOTE_PATH = (deployYaml.sftpRemotePath || envVars.SFTP_REMOTE_PATH || '').replace(/\/$/, '')
const SFTP_PORT = Number(deployYaml.sftpPort || envVars.SFTP_PORT || 22)
const SFTP_SKIP_AUDIO = deployYaml.sftpSkipAudio === true || envVars.SFTP_SKIP_AUDIO === 'true'

const missing = []
if (!SFTP_HOST) missing.push('SFTP_HOST')
if (!SFTP_USER) missing.push('SFTP_USER')
if (!SFTP_REMOTE_PATH) missing.push('SFTP_REMOTE_PATH')

if (missing.length > 0) {
  console.error('[deploy] Missing required config:')
  for (const key of missing) console.error(`  ${key}`)
  console.error('\nConfigure deployment in source/site/deploy.yaml (via Keystatic) or .env.local.')
  process.exit(1)
}

// ─── Password retrieval (cross-platform) ────────────────────────────────────

function getSftpPassword(host, user) {
  // 1. Environment variable — works on all platforms
  if (process.env.SFTP_PASSWORD) {
    return process.env.SFTP_PASSWORD
  }

  // 2. macOS Keychain
  if (process.platform === 'darwin') {
    try {
      return execSync(
        `security find-generic-password -a ${JSON.stringify(user)} -s ${JSON.stringify(host)} -w`,
        { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }
      ).trim()
    } catch {
      console.error('[deploy] SFTP password not found.')
      console.error('[deploy] Either set the SFTP_PASSWORD environment variable, or store it in macOS Keychain:')
      console.error(`\n  security add-generic-password -a ${JSON.stringify(user)} -s ${JSON.stringify(host)} -w\n`)
      process.exit(1)
    }
  }

  // 3. No password found on non-macOS
  console.error('[deploy] SFTP password not found.')
  console.error('[deploy] Set the SFTP_PASSWORD environment variable:')
  if (process.platform === 'win32') {
    console.error(`\n  $env:SFTP_PASSWORD = "your-password"   # PowerShell`)
    console.error(`  set SFTP_PASSWORD=your-password          # cmd.exe\n`)
  } else {
    console.error(`\n  export SFTP_PASSWORD="your-password"\n`)
  }
  process.exit(1)
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

// ─── Recursive dist/ walker ───────────────────────────────────────────────────

function walkDir(dir, baseDir, skipAudio) {
  const results = []
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name)
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/')
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      if (skipAudio && relPath === 'audio') continue
      results.push(...walkDir(fullPath, baseDir, skipAudio))
    } else {
      if (SKIP_FILENAMES.has(name)) continue
      results.push({ localPath: fullPath, relPath })
    }
  }
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const distDir = path.join(root, 'dist')

if (!fs.existsSync(distDir)) {
  console.error('[deploy] dist/ not found. Run a build first.')
  process.exit(1)
}

const allFiles = walkDir(distDir, distDir, SFTP_SKIP_AUDIO)

if (SFTP_SKIP_AUDIO) {
  console.log('[deploy] Skipping dist/audio/ (SFTP_SKIP_AUDIO=true)')
}

console.log(`[deploy] ${allFiles.length} files in dist/`)

const password = getSftpPassword(SFTP_HOST, SFTP_USER)

const sftp = new SftpClient()

// ─── Dry run: compare against live remote state ────────────────────────────────

if (DRY_RUN) {
  console.log('[deploy] Dry run — comparing against live server…\n')

  try {
    console.log(`[deploy] Connecting to ${SFTP_USER}@${SFTP_HOST}:${SFTP_PORT}…`)
    await sftp.connect({ host: SFTP_HOST, port: SFTP_PORT, username: SFTP_USER, password })
    console.log('[deploy] Connected.\n')

    const wouldUpload = []
    let unchanged = 0

    for (const { localPath, relPath } of allFiles) {
      const remotePath = `${SFTP_REMOTE_PATH}/${relPath}`
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

    console.log(`[deploy] Dry run complete. Would upload: ${wouldUpload.length}  Unchanged: ${unchanged}  Total: ${allFiles.length}`)
  } finally {
    await sftp.end()
  }

  process.exit(0)
}

// ─── Normal deploy: manifest-based change detection ───────────────────────────

const manifest = loadManifest()
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

  for (const { localPath, relPath } of toUpload) {
    const remotePath = `${SFTP_REMOTE_PATH}/${relPath}`
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
