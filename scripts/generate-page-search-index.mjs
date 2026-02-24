#!/usr/bin/env node
// Script: generate-page-search-index.mjs
// Scans src/pages and writes src/data/generated-page-search-metadata.ts
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const workspaceRoot = process.cwd()
const pagesDir = path.join(workspaceRoot, 'src', 'pages')
const sourcePagesDir = path.join(workspaceRoot, 'source', 'pages')
const outFile = path.join(workspaceRoot, 'src', 'data', 'generated-page-search-metadata.ts')

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'this',
  'those',
  'through',
  'to',
  'we',
  'were',
  'while',
  'with',
  'you',
  'your',
])

function walkAstroFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkAstroFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.astro')) {
      files.push(entryPath)
    }
  }

  return files
}

function hasDynamicSegment(segment) {
  return /\[[^/]+\]/.test(segment)
}

function toTitleCase(segment) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function defaultTitleForRoute(route) {
  if (route === '/') return 'Home'
  const segments = route.replace(/^\/|\/$/g, '').split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? 'Page'
  return toTitleCase(last)
}

function routeToId(route) {
  if (route === '/') return 'home'
  return route.replace(/^\/|\/$/g, '').replace(/\//g, '-')
}

function stripMarkdown(value) {
  return String(value ?? '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]/g, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAscii(value) {
  return value.normalize('NFD').replace(/\p{Mn}/gu, '')
}

function tokenizeText(value) {
  return normalizeAscii(stripMarkdown(value).toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function extractContentKeywords(content, maxKeywords = 80) {
  const counts = new Map()

  for (const token of tokenizeText(content)) {
    if (token.length < 3) continue
    if (/^\d+$/.test(token)) continue
    if (STOP_WORDS.has(token)) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, maxKeywords)
    .map(([token]) => token)
}

function buildKeywordPool(route, title, content = '') {
  const routeTokens = route
    .replace(/^\/|\/$/g, '')
    .split('/')
    .flatMap((segment) => segment.split('-'))
    .filter(Boolean)
    .map((token) => token.toLowerCase())

  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  const contentTokens = extractContentKeywords(content)
  const fallback = route === '/' ? ['home'] : []

  return Array.from(new Set([...routeTokens, ...titleTokens, ...contentTokens, ...fallback])).slice(0, 80)
}

function toNonEmptyString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = toNonEmptyString(value)
    if (normalized) return normalized
  }
  return ''
}

function joinNonEmpty(values) {
  return values.map((value) => toNonEmptyString(value)).filter(Boolean).join(' ')
}

function buildSearchDescription(explicitValue, ...fallbackValues) {
  const explicit = toNonEmptyString(explicitValue)
  if (explicit) return explicit

  const fallback = stripMarkdown(firstNonEmpty(...fallbackValues))
  if (!fallback) return ''

  return fallback.length <= 220 ? fallback : `${fallback.slice(0, 217).trimEnd()}...`
}

function readYamlFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = yaml.load(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('Warning: unable to parse YAML file:', filePath, error)
    return {}
  }
}

function extractStaticAttribute(source, componentName, attributeName) {
  const openingTagRegex = new RegExp(`<${componentName}\\b([\\s\\S]*?)>`, 'm')
  const tagMatch = source.match(openingTagRegex)
  if (!tagMatch) return null

  const attrs = tagMatch[1]
  const doubleQuoted = attrs.match(new RegExp(`\\b${attributeName}\\s*=\\s*"([^"]+)"`, 'm'))
  if (doubleQuoted) return doubleQuoted[1].trim()

  const singleQuoted = attrs.match(new RegExp(`\\b${attributeName}\\s*=\\s*'([^']+)'`, 'm'))
  if (singleQuoted) return singleQuoted[1].trim()

  return null
}

function resolveRouteFromFile(filePath) {
  const relPath = path.relative(pagesDir, filePath).replace(/\\/g, '/')
  const segments = relPath.split('/')
  const fileName = segments.pop()
  if (!fileName) return null

  const stem = fileName.replace(/\.astro$/, '')
  if (stem === '404') return null

  const dirHasDynamic = segments.some(hasDynamicSegment)
  if (stem === '[...page]') {
    if (dirHasDynamic) return null
    if (segments.length === 0) return '/'
    return `/${segments.join('/')}/`
  }

  if (dirHasDynamic || hasDynamicSegment(stem)) return null

  if (stem === 'index') {
    if (segments.length === 0) return '/'
    return `/${segments.join('/')}/`
  }

  return `/${[...segments, stem].join('/')}/`
}

function resolvePageEntry(filePath) {
  const href = resolveRouteFromFile(filePath)
  if (!href) return null

  const source = fs.readFileSync(filePath, 'utf8')
  const discoveredTitle =
    extractStaticAttribute(source, 'ImmersivePageHeader', 'title') ??
    extractStaticAttribute(source, 'SiteLayout', 'title')
  const title = href === '/' ? 'Home' : (discoveredTitle ?? defaultTitleForRoute(href))
  const description =
    extractStaticAttribute(source, 'SiteLayout', 'description') ??
    extractStaticAttribute(source, 'ImmersivePageHeader', 'subtitle') ??
    ''

  return {
    id: routeToId(href),
    title,
    description,
    keywords: buildKeywordPool(href, title, description),
    href,
    category: 'page',
  }
}

function buildConfiguredPageEntries() {
  const homeHero = readYamlFile(path.join(sourcePagesDir, 'home', 'hero.yaml'))
  const homeSeo = readYamlFile(path.join(sourcePagesDir, 'home', 'seo.yaml'))
  const homeContact = readYamlFile(path.join(sourcePagesDir, 'home', 'contact.yaml'))
  const aboutPage = readYamlFile(path.join(sourcePagesDir, 'about', 'about.yaml'))
  const contactPage = readYamlFile(path.join(sourcePagesDir, 'contact.yaml'))

  const homeTitle = 'Home'
  const homeDescription = buildSearchDescription(homeSeo.searchResultText, homeSeo.metaDescription, homeHero.heroTagline)
  const homeContent = joinNonEmpty([
    homeHero.heroTitle,
    homeHero.heroSubtitle,
    homeHero.heroTagline,
    homeSeo.metaTitle,
    homeSeo.metaDescription,
    homeSeo.searchResultText,
    homeContact.contactIntro,
  ])

  const aboutTitle = 'About'
  const aboutDescription = buildSearchDescription(aboutPage.searchResultText, aboutPage.metaDescription, aboutPage.body)
  const aboutContent = joinNonEmpty([
    aboutPage.metaTitle,
    aboutPage.metaDescription,
    aboutPage.profileImageAlt,
    aboutPage.body,
    aboutPage.searchResultText,
  ])

  const contactTitle = firstNonEmpty(contactPage.title) || 'Contact'
  const contactDescription = buildSearchDescription(
    contactPage.searchResultText,
    contactPage.metaDescription,
    contactPage.introText,
  )
  const contactContent = joinNonEmpty([
    contactPage.title,
    contactPage.metaTitle,
    contactPage.metaDescription,
    contactPage.searchResultText,
    contactPage.introText,
  ])

  return [
    {
      id: routeToId('/'),
      title: homeTitle,
      description: homeDescription,
      keywords: buildKeywordPool('/', homeTitle, homeContent),
      href: '/',
      category: 'page',
    },
    {
      id: routeToId('/about/'),
      title: aboutTitle,
      description: aboutDescription,
      keywords: buildKeywordPool('/about/', aboutTitle, aboutContent),
      href: '/about/',
      category: 'page',
    },
    {
      id: routeToId('/contact/'),
      title: contactTitle,
      description: contactDescription,
      keywords: buildKeywordPool('/contact/', contactTitle, contactContent),
      href: '/contact/',
      category: 'page',
    },
  ]
}

function main() {
  if (!fs.existsSync(pagesDir)) {
    console.error('Pages directory not found:', pagesDir)
    process.exit(1)
  }

  const files = walkAstroFiles(pagesDir)
  const byHref = new Map()

  for (const filePath of files) {
    const entry = resolvePageEntry(filePath)
    if (!entry) continue
    byHref.set(entry.href, entry)
  }

  for (const entry of buildConfiguredPageEntries()) {
    byHref.set(entry.href, entry)
  }

  const entries = Array.from(byHref.values()).sort((left, right) => {
    if (left.href === '/') return -1
    if (right.href === '/') return 1
    return left.href.localeCompare(right.href)
  })

  const serialized = JSON.stringify(entries, null, 2)
  const fileContent = `// THIS FILE IS AUTO-GENERATED BY scripts/generate-page-search-index.mjs
// Run: node ./scripts/generate-page-search-index.mjs

import type { SearchablePageItem } from '../scripts/search-types'

export const generatedPageSearchEntries: SearchablePageItem[] = ${serialized}
`

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === fileContent) {
    console.log('generated-page-search-metadata.ts unchanged, skipping write')
    return
  }
  fs.writeFileSync(outFile, fileContent, 'utf8')
  console.log('Wrote', outFile, 'with', entries.length, 'pages')
}

main()
