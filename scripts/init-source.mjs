#!/usr/bin/env node
/**
 * Initialize local source content from the committed source template.
 *
 * Usage:
 *   node ./scripts/init-source.mjs
 *   node ./scripts/init-source.mjs --reset
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const sourceTemplateDir = path.join(rootDir, 'source-template')
const sourceDir = path.join(rootDir, 'source')

const shouldReset = process.argv.includes('--reset')

if (!fs.existsSync(sourceTemplateDir) || !fs.statSync(sourceTemplateDir).isDirectory()) {
  console.error('[init-source] Missing source-template/. Cannot initialize source/.')
  process.exit(1)
}

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
