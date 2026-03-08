#!/usr/bin/env node
/**
 * One-time migration: flatten score override fields → nested scoreOverrides object.
 *
 * Before:
 *   perusalScoreGated: ungated
 *   pdfWatermarkedOverride: disabled
 *   pdfOriginalOverride: ''
 *   pdfWatermarkedGatedOverride: ''
 *   pdfOriginalGatedOverride: ''
 *
 * After:
 *   scoreOverrides:
 *     viewerWatermark: ''
 *     viewerGating: ungated
 *     pdfWatermarked: disabled
 *     pdfOriginal: ''
 *     pdfWatermarkedGating: ''
 *     pdfOriginalGating: ''
 *
 * Run: node scripts/migrate-score-overrides.mjs
 * Delete this script after running.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const worksDir = path.join(__dirname, '..', 'source', 'works')

const FIELD_MAP = {
  perusalScoreGated: 'viewerGating',
  pdfWatermarkedOverride: 'pdfWatermarked',
  pdfOriginalOverride: 'pdfOriginal',
  pdfWatermarkedGatedOverride: 'pdfWatermarkedGating',
  pdfOriginalGatedOverride: 'pdfOriginalGating',
}

const OLD_KEYS = Object.keys(FIELD_MAP)

let migrated = 0
let skipped = 0

const entries = fs.readdirSync(worksDir, { withFileTypes: true })

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

  const yamlPath = path.join(worksDir, entry.name, 'work.yaml')
  if (!fs.existsSync(yamlPath)) continue

  const raw = fs.readFileSync(yamlPath, 'utf8')
  const data = yaml.load(raw) || {}

  // Check if already migrated
  if (data.scoreOverrides) {
    console.log(`  SKIP ${entry.name} — already has scoreOverrides`)
    skipped++
    continue
  }

  // Build the nested object
  const scoreOverrides = {
    viewerWatermark: '',
    viewerGating: '',
    pdfWatermarked: '',
    pdfOriginal: '',
    pdfWatermarkedGating: '',
    pdfOriginalGating: '',
  }

  // Map old flat fields to new nested fields
  for (const [oldKey, newKey] of Object.entries(FIELD_MAP)) {
    if (typeof data[oldKey] === 'string') {
      scoreOverrides[newKey] = data[oldKey]
    }
  }

  // Remove old flat fields
  for (const oldKey of OLD_KEYS) {
    delete data[oldKey]
  }

  // Add the nested object
  data.scoreOverrides = scoreOverrides

  // Write back
  const output = yaml.dump(data, {
    lineWidth: -1,
    quotingType: "'",
    forceQuotes: false,
    noRefs: true,
    sortKeys: false,
  })
  fs.writeFileSync(yamlPath, output)

  const active = Object.values(scoreOverrides).filter((v) => v !== '').length
  const detail = active > 0 ? ` (${active} active override${active > 1 ? 's' : ''})` : ''
  console.log(`  MIGRATED ${entry.name}${detail}`)
  migrated++
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`)
