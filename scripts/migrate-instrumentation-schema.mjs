#!/usr/bin/env node
/**
 * One-time migration: convert flat instrumentation arrays to the new object schema.
 *
 * categorization.instrumentation: string[]
 *   → categorization.instrumentation: { instruments: string[] }
 *
 * For crepusculaire-for-orchestra, also converts to grouped format with sections.
 *
 * Usage:
 *   node scripts/migrate-instrumentation-schema.mjs            # migrate
 *   node scripts/migrate-instrumentation-schema.mjs --dry-run   # preview only
 */

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const WORKS_DIR = path.join(process.cwd(), 'source', 'works')
const DRY_RUN = process.argv.includes('--dry-run')

/** Orchestral grouping heuristics for crepusculaire-for-orchestra */
const ORCHESTRAL_SECTIONS = [
  {
    section: 'Woodwinds',
    patterns: [/flute/i, /oboe/i, /english horn/i, /clarinet/i, /saxophone/i, /bassoon/i, /contrabassoon/i],
  },
  {
    section: 'Brass',
    patterns: [/horn/i, /trumpet/i, /trombone/i, /tuba/i],
  },
  {
    section: 'Percussion & Keyboards',
    patterns: [/timpani/i, /percussion/i, /celesta/i, /xylophone/i, /marimba/i, /vibraphone/i, /glockenspiel/i],
  },
  {
    section: 'Strings',
    patterns: [/harp/i, /strings/i, /violin/i, /viola/i, /cello/i, /celli/i, /bass(?!oon| clar| trom)/i],
  },
]

function classifyInstrument(label) {
  for (const { section, patterns } of ORCHESTRAL_SECTIONS) {
    if (patterns.some((p) => p.test(label))) {
      return section
    }
  }
  return null
}

function buildGroupedInstrumentation(instruments) {
  const sectionMap = new Map()
  const ungrouped = []

  for (const inst of instruments) {
    const section = classifyInstrument(inst)
    if (section) {
      if (!sectionMap.has(section)) {
        sectionMap.set(section, [])
      }
      sectionMap.get(section).push(inst)
    } else {
      ungrouped.push(inst)
    }
  }

  const sections = []
  // Maintain canonical section order
  for (const { section } of ORCHESTRAL_SECTIONS) {
    if (sectionMap.has(section)) {
      sections.push({ section, instruments: sectionMap.get(section) })
    }
  }

  // Append any ungrouped as a separate section
  if (ungrouped.length > 0) {
    sections.push({ section: 'Other', instruments: ungrouped })
  }

  return { grouped: true, sections }
}

// Works that should get the grouped treatment
const GROUPED_WORKS = new Set(['crepusculaire-for-orchestra'])

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

    if (data.categorization && Array.isArray(data.categorization.instrumentation)) {
      const flatList = data.categorization.instrumentation

      if (GROUPED_WORKS.has(entry.name) && flatList.length > 0) {
        // Convert to grouped format
        data.categorization.instrumentation = buildGroupedInstrumentation(flatList)
        changed = true
      } else {
        // Convert to flat object format
        data.categorization.instrumentation = { instruments: flatList }
        changed = true
      }
    }

    if (!changed) {
      console.log(`  ${entry.name}: already migrated or no instrumentation, skipping`)
      continue
    }

    const instr = data.categorization.instrumentation
    const isGrouped = instr.grouped === true

    if (DRY_RUN) {
      if (isGrouped) {
        const sectionNames = instr.sections.map((s) => `${s.section}(${s.instruments.length})`).join(', ')
        console.log(`  ${entry.name}: would migrate to GROUPED [${sectionNames}]`)
      } else {
        console.log(`  ${entry.name}: would migrate to flat (${instr.instruments.length} instruments)`)
      }
    } else {
      const output = yaml.dump(data, {
        lineWidth: 120,
        quotingType: "'",
        forceQuotes: false,
        noRefs: true,
        sortKeys: false,
      })
      fs.writeFileSync(yamlPath, output, 'utf8')
      console.log(`  ${entry.name}: migrated${isGrouped ? ' (grouped)' : ''}`)
    }
    migrated++
  }

  console.log(`\n${DRY_RUN ? 'Would migrate' : 'Migrated'}: ${migrated} work(s)`)
}

console.log(`Instrumentation Schema Migration${DRY_RUN ? ' (DRY RUN)' : ''}`)
console.log('='.repeat(50))
migrate()
