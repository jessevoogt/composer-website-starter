#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const worksDir = path.resolve(__dirname, '../src/content/works')

async function migrateFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  // Only replace in the top YAML frontmatter block
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return false
  const fm = fmMatch[1]
  if (!/\bauthor\s*:/m.test(fm)) return false
  const newFm = fm.replace(/^author\s*:/m, 'composer:')
  const newContent = content.replace(fm, newFm)
  await fs.writeFile(filePath, newContent, 'utf8')
  return true
}

const dirents = await fs.readdir(worksDir)
const files = dirents.filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
let changed = 0
for (const f of files) {
  const p = path.join(worksDir, f)
  try {
    const ok = await migrateFile(p)
    if (ok) {
      console.log('Migrated', f)
      changed++
    }
  } catch (err) {
    console.error('Error migrating', f, err.message)
  }
}
console.log(`Done. ${changed} file(s) updated.`)
