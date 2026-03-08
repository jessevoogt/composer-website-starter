#!/usr/bin/env node
/**
 * One-time migration: nest flat fields into grouped YAML objects.
 *
 * tags, instrumentation, searchKeywords → categorization: { tags, instrumentation, searchKeywords }
 * selected, selectedOrder              → homepageSelection: { selected, selectedOrder }
 *
 * Usage:
 *   node scripts/migrate-works-grouping.mjs            # migrate
 *   node scripts/migrate-works-grouping.mjs --dry-run   # preview only
 */

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const WORKS_DIR = path.join(process.cwd(), 'source', 'works')
const DRY_RUN = process.argv.includes('--dry-run')

function migrate() {
  const entries = fs.readdirSync(WORKS_DIR, { withFileTypes: true })
  let migrated = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const yamlPath = path.join(WORKS_DIR, entry.name, 'work.yaml')
    if (!fs.existsSync(yamlPath)) continue

    const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8'))
    if (!raw || typeof raw !== 'object') continue

    const data = { ...raw }
    let changed = false

    // ── Categorization ─────────────────────────────────────────────────
    // Only migrate if flat fields exist (skip if already nested)
    if (!data.categorization) {
      const tags = Array.isArray(data.tags) ? data.tags : []
      const instrumentation = Array.isArray(data.instrumentation) ? data.instrumentation : []
      const searchKeywords = Array.isArray(data.searchKeywords) ? data.searchKeywords : []

      data.categorization = { tags, instrumentation, searchKeywords }
      delete data.tags
      delete data.instrumentation
      delete data.searchKeywords
      changed = true
    }

    // ── Homepage Selection ──────────────────────────────────────────────
    if (!data.homepageSelection) {
      const selected = data.selected === true
      const selectedOrder = typeof data.selectedOrder === 'number' ? data.selectedOrder : null

      data.homepageSelection = {
        selected,
        ...(selectedOrder != null ? { selectedOrder } : {}),
      }
      delete data.selected
      delete data.selectedOrder
      changed = true
    }

    if (!changed) {
      console.log(`  ${entry.name}: already migrated, skipping`)
      continue
    }

    if (DRY_RUN) {
      const tagCount = data.categorization.tags.length
      const instrCount = data.categorization.instrumentation.length
      const kwCount = data.categorization.searchKeywords.length
      const sel = data.homepageSelection.selected
      console.log(
        `  ${entry.name}: would migrate (${tagCount} tags, ${instrCount} instruments, ${kwCount} keywords, selected=${sel})`,
      )
    } else {
      const output = yaml.dump(data, {
        lineWidth: 120,
        quotingType: "'",
        forceQuotes: false,
        noRefs: true,
        sortKeys: false,
      })
      fs.writeFileSync(yamlPath, output, 'utf8')
      console.log(`  ${entry.name}: migrated`)
    }
    migrated++
  }

  console.log(`\n${DRY_RUN ? 'Would migrate' : 'Migrated'}: ${migrated} work(s)`)
}

console.log(`Works Grouping Migration${DRY_RUN ? ' (DRY RUN)' : ''}`)
console.log('='.repeat(40))
migrate()
