#!/usr/bin/env node

/**
 * First-run detection gate.
 *
 * Runs at the start of `npm run dev` to detect if setup has been completed.
 * If the brand-logo.yaml still has placeholder names ("First" / "Last"),
 * this script launches the standalone setup wizard server. Otherwise it
 * exits immediately and the npm run dev pipeline continues.
 *
 * The setup-server auto-exits after finalize, so this script's exit code
 * propagates naturally — if setup succeeds (exit 0), the pipeline continues.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(ROOT, 'source')
const SOURCE_TEMPLATE_DIR = path.join(ROOT, 'source-template')
const BRAND_LOGO_PATH = path.join(ROOT, 'source', 'branding', 'brand-logo.yaml')
const SCAFFOLD_MARKER_PATH = path.join(SOURCE_DIR, '.scaffold-initialized')

function copyMissingTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyMissingTree(srcPath, destPath)
      continue
    }
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function ensureSourceScaffold() {
  if (!fs.existsSync(SOURCE_TEMPLATE_DIR)) return

  const heroesDir = path.join(SOURCE_DIR, 'heroes')
  const worksDir = path.join(SOURCE_DIR, 'works')
  const markerExists = fs.existsSync(SCAFFOLD_MARKER_PATH)
  const sourceExists = fs.existsSync(SOURCE_DIR)
  const hasHeroes = fs.existsSync(heroesDir)
  const hasWorks = fs.existsSync(worksDir)

  // Fresh clone without source/: copy entire template once.
  if (!sourceExists) {
    copyMissingTree(SOURCE_TEMPLATE_DIR, SOURCE_DIR)
    fs.writeFileSync(SCAFFOLD_MARKER_PATH, 'initialized\n', 'utf8')
    console.log('[maybe-setup] Initialized source/ from source-template/.')
    return
  }

  // Capture healthy scaffold state so later intentional deletions are respected.
  if (!markerExists && hasHeroes && hasWorks) {
    fs.writeFileSync(SCAFFOLD_MARKER_PATH, 'initialized\n', 'utf8')
    return
  }

  // One-time repair for partial setup states (source exists, but both collections missing).
  if (!markerExists && !hasHeroes && !hasWorks) {
    copyMissingTree(path.join(SOURCE_TEMPLATE_DIR, 'heroes'), heroesDir)
    copyMissingTree(path.join(SOURCE_TEMPLATE_DIR, 'works'), worksDir)
    copyMissingTree(path.join(SOURCE_TEMPLATE_DIR, 'works-templates'), path.join(SOURCE_DIR, 'works-templates'))
    fs.writeFileSync(SCAFFOLD_MARKER_PATH, 'initialized\n', 'utf8')
    console.log('[maybe-setup] Repaired missing source heroes/works from source-template/.')
  }
}

function needsSetup() {
  try {
    if (!fs.existsSync(BRAND_LOGO_PATH)) return true
    const raw = yaml.load(fs.readFileSync(BRAND_LOGO_PATH, 'utf8'))
    if (!raw || typeof raw !== 'object') return true
    return raw.firstName === 'First' && raw.lastName === 'Last'
  } catch {
    return true
  }
}

ensureSourceScaffold()

if (needsSetup()) {
  console.log('\n  First run detected! Launching setup wizard\u2026\n')
  const child = spawn(process.execPath, [path.join(__dirname, 'setup-server.mjs')], {
    stdio: 'inherit',
    cwd: ROOT,
  })
  child.on('exit', (code) => process.exit(code ?? 1))
  child.on('error', (err) => {
    console.error('Failed to launch setup wizard:', err.message)
    process.exit(1)
  })
} else {
  // Setup already done — continue with npm run dev pipeline
  process.exit(0)
}
