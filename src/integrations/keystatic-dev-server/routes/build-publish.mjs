// Build, Preview, Publish, Starter Kit, and Toolbar config route handlers

import fs from 'fs'
import path from 'path'
import { spawn, execSync } from 'child_process'

import {
  ROOT,
  DEPLOY_SCRIPT,
  PREVIEW_PORT,
  PREVIEW_URL,
  LIVE_URL,
  state,
} from '../constants.mjs'

import { spawnScript } from '../helpers.mjs'

// ─── Toolbar config API (consumed by CMS Live Editor header menu) ────

export async function handleToolbarConfig(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ liveUrl: LIVE_URL || null }))
}

// ─── Build API ──────────────────────────────────────────────────────────

export async function handleBuild(req, res) {
  if (state.buildRunning || state.publishRunning) {
    res.writeHead(409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'busy', error: 'A build or publish is already in progress' }))
    return
  }

  state.buildRunning = true
  console.log('\n[build] Starting build:content...')
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('npm', ['run', 'build:content'], { stdio: 'inherit', cwd: ROOT, shell: false })
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
    })
    console.log('[build] Build complete\n')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'success' }))
  } catch (err) {
    console.error(`[build] Build failed — ${err.message}\n`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', error: err.message }))
  } finally {
    state.buildRunning = false
  }
}

// ─── Publish API ────────────────────────────────────────────────────────

export async function handlePublish(req, res) {
  if (state.buildRunning || state.publishRunning) {
    res.writeHead(409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'busy', error: 'A build or publish is already in progress' }))
    return
  }

  state.publishRunning = true
  console.log('\n[publish] Starting SFTP deploy...')
  try {
    await spawnScript(DEPLOY_SCRIPT)
    console.log('[publish] Deploy complete\n')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'success' }))
  } catch (err) {
    console.error(`[publish] Failed — ${err.message}\n`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', error: err.message }))
  } finally {
    state.publishRunning = false
  }
}

// ─── Preview API ────────────────────────────────────────────────────────

export async function handlePreview(req, res) {
  if (state.previewProcess) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'running', url: PREVIEW_URL }))
    return
  }

  const distDir = path.join(ROOT, 'dist')
  if (!fs.existsSync(distDir)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', error: 'No dist/ found — run Build first.' }))
    return
  }

  console.log(`\n[preview] Starting astro preview on port ${PREVIEW_PORT}...`)

  try {
    const pids = execSync(`lsof -ti :${PREVIEW_PORT}`, { encoding: 'utf8' }).trim()
    if (pids) {
      for (const pid of pids.split('\n')) {
        try {
          process.kill(Number(pid), 'SIGKILL')
        } catch {
          /* may have exited */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  } catch {
    // lsof exits non-zero when no process is found
  }

  state.previewProcess = spawn(
    'node',
    ['node_modules/.bin/astro', 'preview', '--port', String(PREVIEW_PORT), '--host', '127.0.0.1'],
    { stdio: 'inherit', cwd: ROOT },
  )
  state.previewProcess.on('exit', () => {
    console.log('[preview] Preview server stopped.')
    state.previewProcess = null
  })
  state.previewProcess.on('error', (err) => {
    console.error(`[preview] Error — ${err.message}`)
    state.previewProcess = null
  })

  await new Promise((resolve) => setTimeout(resolve, 1200))

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'started', url: PREVIEW_URL }))
}

// ─── Generate Starter Kit API ────────────────────────────────────────────

export async function handleGenerateStarterKit(req, res) {
  console.log('\n[starter-kit] Generating starter kit...')
  try {
    await spawnScript(path.join(ROOT, 'scripts', 'generate-starter-kit.mjs'))

    // Read the output stats
    const outputDir = path.join(ROOT, '.starter-kit')
    function countFilesRecursive(dir) {
      let count = 0
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) count += countFilesRecursive(full)
        else count++
      }
      return count
    }
    function dirSizeRecursive(dir) {
      let size = 0
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) size += dirSizeRecursive(full)
        else size += fs.statSync(full).size
      }
      return size
    }
    function formatBytes(bytes) {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const fileCount = countFilesRecursive(outputDir)
    const totalSize = formatBytes(dirSizeRecursive(outputDir))

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, fileCount, totalSize, path: '.starter-kit/' }))
  } catch (err) {
    console.error('[starter-kit] Generation failed:', err.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: err.message }))
  }
}
