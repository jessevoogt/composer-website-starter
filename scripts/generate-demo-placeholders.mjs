import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import yaml from 'js-yaml'

const WORKS_DIR = path.resolve('source/works')
const WIDTH = 1600
const HEIGHT = 1000

const PALETTES = [
  {
    backgroundStart: '#4a2a63',
    backgroundEnd: '#c6695c',
    bandPrimary: '#ffffff',
    bandSecondary: '#ffffff',
    bandPrimaryOpacity: 0.12,
    bandSecondaryOpacity: 0.08,
  },
  {
    backgroundStart: '#1d4866',
    backgroundEnd: '#77a7c8',
    bandPrimary: '#c9f0ff',
    bandSecondary: '#d7f6ff',
    bandPrimaryOpacity: 0.12,
    bandSecondaryOpacity: 0.08,
  },
  {
    backgroundStart: '#1a6a78',
    backgroundEnd: '#9fc477',
    bandPrimary: '#d7ffe5',
    bandSecondary: '#edfff4',
    bandPrimaryOpacity: 0.1,
    bandSecondaryOpacity: 0.07,
  },
  {
    backgroundStart: '#700544',
    backgroundEnd: '#f0861e',
    bandPrimary: '#ffd9d0',
    bandSecondary: '#ffe8df',
    bandPrimaryOpacity: 0.11,
    bandSecondaryOpacity: 0.08,
  },
  {
    backgroundStart: '#135a7a',
    backgroundEnd: '#67bea2',
    bandPrimary: '#c9f6ef',
    bandSecondary: '#ddfff8',
    bandPrimaryOpacity: 0.1,
    bandSecondaryOpacity: 0.08,
  },
]

const MUPPET_REPLACEMENTS = [
  [/\bfirst\s*name\s+last\s*name\b/gi, 'Kermit the Frog'],
  [/\bjane\s+doe\b/gi, 'Miss Piggy'],
  [/\bjohn\s+doe\b/gi, 'Fozzie Bear'],
  [/\boleg\s+bezuglov\b/gi, 'Rowlf the Dog'],
]

function hashString(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24)
  }
  return Math.abs(hash >>> 0)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeDemoName(value) {
  let normalized = normalizeWhitespace(value)
  for (const [pattern, replacement] of MUPPET_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalized
}

function humanizeSlug(value) {
  return normalizeWhitespace(value).replaceAll('-', ' ')
}

function wrapText(text, maxCharsPerLine) {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return []

  const words = normalized.split(' ')
  const lines = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= maxCharsPerLine || !currentLine) {
      currentLine = candidate
      continue
    }
    lines.push(currentLine)
    currentLine = word
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

function capLines(lines, maxLines) {
  if (lines.length <= maxLines) return lines
  const capped = lines.slice(0, maxLines)
  const last = capped[maxLines - 1] ?? ''
  capped[maxLines - 1] = last.endsWith('...') ? last : `${last}...`
  return capped
}

function summarizePerformers(performers) {
  const names = (Array.isArray(performers) ? performers : [])
    .map((value) => normalizeDemoName(value))
    .filter(Boolean)

  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} +${names.length - 2} more`
}

function choosePalette(seed) {
  return PALETTES[hashString(seed) % PALETTES.length]
}

function buildPlaceholderSvg({ primaryText, secondaryText, seed }) {
  const palette = choosePalette(seed)

  const primaryLines = capLines(wrapText(normalizeDemoName(primaryText), 26), 3)
  const secondaryLines = capLines(wrapText(normalizeDemoName(secondaryText), 30), 3)

  const longestPrimary = Math.max(...primaryLines.map((line) => line.length), 1)
  const longestSecondary = Math.max(...secondaryLines.map((line) => line.length), 1)

  let primarySize = clamp(Math.floor((WIDTH * 0.79) / (longestPrimary * 0.58)), 58, 102)
  let secondarySize = clamp(Math.floor((WIDTH * 0.72) / (longestSecondary * 0.56)), 40, 66)

  if (primaryLines.length > 2) primarySize -= 8
  if (secondaryLines.length > 2) secondarySize -= 6
  primarySize = clamp(primarySize, 52, 102)
  secondarySize = clamp(secondarySize, 36, 66)

  const primaryLineHeight = Math.round(primarySize * 1.16)
  const secondaryLineHeight = Math.round(secondarySize * 1.2)
  const sectionGap = secondaryLines.length > 0 ? Math.round(primarySize * 0.32) : 0

  const blockHeight =
    primaryLines.length * primaryLineHeight +
    sectionGap +
    secondaryLines.length * secondaryLineHeight

  let currentY = (HEIGHT - blockHeight) / 2 + primaryLineHeight / 2
  const textElements = []

  for (const line of primaryLines) {
    textElements.push(
      `<text x="${WIDTH / 2}" y="${currentY}" text-anchor="middle" dominant-baseline="middle" font-family="Atkinson Hyperlegible Next, Avenir Next, Segoe UI, sans-serif" font-size="${primarySize}" font-weight="700" fill="#f5f7fa" fill-opacity="0.94">${escapeXml(line)}</text>`,
    )
    currentY += primaryLineHeight
  }

  currentY += sectionGap

  for (const line of secondaryLines) {
    textElements.push(
      `<text x="${WIDTH / 2}" y="${currentY}" text-anchor="middle" dominant-baseline="middle" font-family="Atkinson Hyperlegible Next, Avenir Next, Segoe UI, sans-serif" font-size="${secondarySize}" font-weight="500" fill="#f5f7fa" fill-opacity="0.9">${escapeXml(line)}</text>`,
    )
    currentY += secondaryLineHeight
  }

  return `\
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.backgroundStart}" />
      <stop offset="100%" stop-color="${palette.backgroundEnd}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <path d="M 0 520 L ${WIDTH} 290 L ${WIDTH} 560 L 0 790 Z" fill="${palette.bandPrimary}" fill-opacity="${palette.bandPrimaryOpacity}" />
  <path d="M 0 610 L ${WIDTH} 380 L ${WIDTH} 450 L 0 700 Z" fill="${palette.bandSecondary}" fill-opacity="${palette.bandSecondaryOpacity}" />
  <circle cx="270" cy="190" r="460" fill="#ffffff" fill-opacity="0.1" />
  <circle cx="320" cy="320" r="220" fill="#ffffff" fill-opacity="0.12" />
  ${textElements.join('\n  ')}
</svg>
`
}

async function writePlaceholderImage(targetPath, primaryText, secondaryText, seed) {
  const svg = buildPlaceholderSvg({ primaryText, secondaryText, seed })
  const output = Buffer.from(svg)
  await sharp(output).png({ compressionLevel: 9 }).toFile(targetPath)
}

function loadYaml(yamlPath) {
  return yaml.load(fs.readFileSync(yamlPath, 'utf8')) || {}
}

function getWorkDirectories() {
  if (!fs.existsSync(WORKS_DIR)) return []
  return fs
    .readdirSync(WORKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(WORKS_DIR, entry.name))
}

function formatRecordingSecondary(workTitle, date) {
  const parts = [normalizeDemoName(workTitle)]
  if (date) parts.push(`Recorded ${normalizeDemoName(date)}`)
  return parts.join(' | ')
}

function formatMovementSecondary(recordingPrimary, date) {
  const parts = [normalizeDemoName(recordingPrimary)]
  if (date) parts.push(`Recorded ${normalizeDemoName(date)}`)
  return parts.join(' | ')
}

async function run() {
  const workDirs = getWorkDirectories()
  let written = 0
  let skipped = 0

  for (const workDir of workDirs) {
    const workSlug = path.basename(workDir)
    const workYamlPath = path.join(workDir, 'work.yaml')
    if (!fs.existsSync(workYamlPath)) {
      skipped += 1
      continue
    }

    const workMeta = loadYaml(workYamlPath)
    const workTitle = normalizeDemoName(workMeta.title || humanizeSlug(workSlug))
    const workSubtitle = normalizeDemoName(workMeta.subtitle || 'Demo thumbnail')

    const thumbnailPath = path.join(workDir, 'thumbnail.png')
    if (fs.existsSync(thumbnailPath)) {
      await writePlaceholderImage(thumbnailPath, workTitle, workSubtitle, `${workSlug}-thumbnail`)
      written += 1
    }

    const recordings = Array.isArray(workMeta.recordings) ? workMeta.recordings : []
    for (const recording of recordings) {
      const recordingFolder = normalizeWhitespace(recording.folder)
      if (!recordingFolder) continue

      const recordingDir = path.join(workDir, 'recordings', recordingFolder)
      const photoPath = path.join(recordingDir, 'photo.png')
      const recordingPrimary =
        normalizeDemoName(recording.ensemble) ||
        summarizePerformers(recording.performers) ||
        normalizeDemoName(humanizeSlug(recordingFolder))
      const recordingSecondary = formatRecordingSecondary(workTitle, recording.date)

      if (fs.existsSync(photoPath)) {
        await writePlaceholderImage(
          photoPath,
          recordingPrimary,
          recordingSecondary,
          `${workSlug}-${recordingFolder}-photo`,
        )
        written += 1
      }

      const movementMetadata = Array.isArray(recording.movements) ? recording.movements : []
      const movementDirs = fs.existsSync(recordingDir)
        ? fs
            .readdirSync(recordingDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^movement-\d+$/i.test(entry.name))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        : []

      for (const movementDir of movementDirs) {
        const movementPhotoPath = path.join(recordingDir, movementDir.name, 'photo.png')
        if (!fs.existsSync(movementPhotoPath)) continue

        const folderMatch = movementDir.name.match(/^movement-(\d+)$/i)
        const movementIndex = folderMatch ? Math.max(0, Number(folderMatch[1]) - 1) : -1
        const movementMeta =
          (movementIndex >= 0 && movementIndex < movementMetadata.length
            ? movementMetadata[movementIndex]
            : undefined) ??
          movementMetadata[movementDirs.indexOf(movementDir)] ??
          {}

        const movementPrimary =
          normalizeDemoName(movementMeta.label) ||
          `Movement ${movementDir.name.replace(/^movement-/i, '')}`
        const movementSecondary = formatMovementSecondary(recordingPrimary, recording.date)

        await writePlaceholderImage(
          movementPhotoPath,
          movementPrimary,
          movementSecondary,
          `${workSlug}-${recordingFolder}-${movementDir.name}-photo`,
        )
        written += 1
      }
    }
  }

  console.log(`Generated ${written} placeholder PNG file(s).`)
  if (skipped > 0) {
    console.log(`Skipped ${skipped} folder(s) without work.yaml.`)
  }
}

run().catch((error) => {
  console.error('Failed to generate demo placeholders.')
  console.error(error)
  process.exitCode = 1
})
