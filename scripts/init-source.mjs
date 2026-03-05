#!/usr/bin/env node
/**
 * Initialize local source content from the committed source template.
 *
 * This runs automatically on `npm install` (via postinstall).
 * It copies source-template/ → source/ so you have a working local copy
 * to customize. Your source/ directory is gitignored — the template
 * (source-template/) is the shared starting point.
 *
 * Usage:
 *   node ./scripts/init-source.mjs          # Initialize if missing
 *   node ./scripts/init-source.mjs --reset  # Force reinitialize
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const sourceTemplateDir = path.join(rootDir, 'source-template')
const sourceDir = path.join(rootDir, 'source')
const sourceGitExcludeRule = 'source/'
const sourceGitExcludeComment = '# Local composer content (managed by init:source)'

const shouldReset = process.argv.includes('--reset')

function resolveGitDir() {
  const dotGitPath = path.join(rootDir, '.git')
  if (!fs.existsSync(dotGitPath)) return null

  const dotGitStats = fs.statSync(dotGitPath)
  if (dotGitStats.isDirectory()) return dotGitPath
  if (!dotGitStats.isFile()) return null

  const dotGitContents = fs.readFileSync(dotGitPath, 'utf8').trim()
  const gitDirMatch = dotGitContents.match(/^gitdir:\\s*(.+)$/i)
  if (!gitDirMatch) return null

  const gitDirPath = gitDirMatch[1].trim()
  return path.isAbsolute(gitDirPath) ? gitDirPath : path.resolve(rootDir, gitDirPath)
}

function ensureSourceExcludedFromGitStatus() {
  const gitDir = resolveGitDir()
  if (!gitDir) return

  const gitInfoExcludePath = path.join(gitDir, 'info', 'exclude')
  let currentExcludeContents = ''
  try {
    currentExcludeContents = fs.existsSync(gitInfoExcludePath)
      ? fs.readFileSync(gitInfoExcludePath, 'utf8')
      : ''
  } catch (error) {
    console.warn(`[init-source] Warning: could not read .git/info/exclude (${error.message}).`)
    return
  }

  const hasSourceExcludeRule = currentExcludeContents
    .split(/\r?\n/)
    .some((line) => line.trim() === sourceGitExcludeRule)
  if (hasSourceExcludeRule) return

  const prefix = currentExcludeContents.length > 0 && !currentExcludeContents.endsWith('\n') ? '\n' : ''
  const block = `${prefix}${sourceGitExcludeComment}\n${sourceGitExcludeRule}\n`

  try {
    fs.mkdirSync(path.dirname(gitInfoExcludePath), { recursive: true })
    fs.writeFileSync(gitInfoExcludePath, `${currentExcludeContents}${block}`, 'utf8')
    console.log('[init-source] Added source/ to .git/info/exclude.')
  } catch (error) {
    console.warn(`[init-source] Warning: could not update .git/info/exclude (${error.message}).`)
  }
}

if (!fs.existsSync(sourceTemplateDir) || !fs.statSync(sourceTemplateDir).isDirectory()) {
  console.error('[init-source] Missing source-template/. Cannot initialize source/.')
  process.exit(1)
}

ensureSourceExcludedFromGitStatus()

if (fs.existsSync(sourceDir)) {
  if (!shouldReset) {
    console.log('[init-source] source/ already exists. Skipping.')
    process.exit(0)
  }

  fs.rmSync(sourceDir, { recursive: true, force: true })
  console.log('[init-source] Removed existing source/.')
}

fs.cpSync(sourceTemplateDir, sourceDir, { recursive: true })
console.log('[init-source] Initialized source/ from source-template/.')
console.log('')
console.log('  Run \x1b[36mnpm run dev\x1b[0m to get started \u2014 the setup wizard will launch automatically.')
console.log('')
