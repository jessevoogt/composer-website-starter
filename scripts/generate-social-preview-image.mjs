import fs from 'node:fs'
import { copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import yaml from 'js-yaml'

const width = 1200
const height = 630

const brandingDirPath = path.resolve('source/branding')
const sourceSvgPath = path.join(brandingDirPath, 'social-preview-image.svg')
const sourcePngPath = path.join(brandingDirPath, 'social-preview-image.png')
const sourceLogoSvgPath = path.join(brandingDirPath, 'favicon.svg')
const sourceLogoPngPath = path.join(brandingDirPath, 'favicon-96x96.png')

const outputSvgPath = path.resolve('public/social-preview-image.svg')
const outputPngPath = path.resolve('public/social-preview-image.png')
const socialImageVersionPath = path.resolve('src/data/social-image-version.ts')
const siteConfigPath = path.resolve('source/site/site.yaml')
const themeConfigPath = path.resolve('source/site/theme.yaml')

const forceRegenerate = process.argv.includes('--force')

const DEFAULT_THEME_COLORS = {
  colorBackground: '#10161d',
  colorBackgroundSoft: '#141b23',
  colorText: '#ecf2f7',
  colorTextMuted: '#aab8c4',
  colorAccent: '#97c6de',
  colorAccentStrong: '#d5edf9',
  colorButton: '#89b9d3',
  colorButtonText: '#08131d',
}

const placeholderDomains = new Set(['example.com', 'www.example.com', 'localhost'])

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function readYamlObject(filePath) {
  if (!fs.existsSync(filePath)) return {}

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = yaml.load(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn(`Warning: unable to parse ${filePath}`, error)
    return {}
  }
}

function toNonEmptyString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHexColor(value, fallback) {
  const normalized = toNonEmptyString(value)
  if (!normalized) return fallback

  const match = normalized.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return fallback

  const hexBody = match[1]
  if (hexBody.length === 3) {
    const expanded = hexBody
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
    return `#${expanded.toLowerCase()}`
  }

  return `#${hexBody.toLowerCase()}`
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, '#000000').slice(1)
  const value = Number.parseInt(normalized, 16)
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

function toHexChannel(value) {
  return Math.round(value).toString(16).padStart(2, '0')
}

function rgbToHex(red, green, blue) {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mixHex(baseHex, targetHex, ratio) {
  const mixRatio = clamp(ratio, 0, 1)
  const base = hexToRgb(baseHex)
  const target = hexToRgb(targetHex)
  return rgbToHex(
    base.red + (target.red - base.red) * mixRatio,
    base.green + (target.green - base.green) * mixRatio,
    base.blue + (target.blue - base.blue) * mixRatio,
  )
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveFontFamily(fontName, fallbackStack) {
  const normalized = toNonEmptyString(fontName)
  if (!normalized) return fallbackStack
  if (normalized === 'system-ui') return "system-ui, -apple-system, 'Segoe UI', sans-serif"
  if (fallbackStack.includes(`'${normalized}'`) || fallbackStack.includes(normalized)) return fallbackStack
  return `'${normalized.replace(/'/g, "\\'")}', ${fallbackStack}`
}

function wrapComposerName(name, maxCharsPerLine = 14, maxLines = 3) {
  const words = toNonEmptyString(name).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['Composer Name']

  const lines = []
  let current = ''

  for (const word of words) {
    if (!current) {
      current = word
      continue
    }

    const candidate = `${current} ${word}`
    if (candidate.length <= maxCharsPerLine || lines.length + 1 >= maxLines) {
      current = candidate
      continue
    }

    lines.push(current)
    current = word
  }

  if (current) lines.push(current)
  return lines
}

function extractSiteDomain(siteUrl) {
  const normalized = toNonEmptyString(siteUrl)
  if (!normalized) return ''

  const withProtocol = normalized.includes('://') ? normalized : `https://${normalized}`
  try {
    const hostname = new URL(withProtocol).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
    if (!hostname || placeholderDomains.has(hostname)) return ''
    return hostname
  } catch {
    return ''
  }
}

function getVersionStamp(date = new Date()) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

function needsCopy(src, dest) {
  if (!fs.existsSync(dest)) return true
  const srcStat = fs.statSync(src)
  const destStat = fs.statSync(dest)
  return srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size
}

async function copyFileIfNeeded(src, dest) {
  ensureDir(path.dirname(dest))
  if (!needsCopy(src, dest)) return false
  await copyFile(src, dest)
  return true
}

function svgToDataUri(svg) {
  const compact = String(svg)
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`
}

function pngBufferToDataUri(pngBuffer) {
  return `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`
}

async function loadBrandLogoDataUri({ toneHex = '#ffffff', size = 720 } = {}) {
  const tone = hexToRgb(toneHex)

  async function rasterizeAsMonotonePng(inputBuffer) {
    return sharp(inputBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .grayscale()
      .tint({ r: tone.red, g: tone.green, b: tone.blue })
      .png()
      .toBuffer()
  }

  if (fs.existsSync(sourceLogoSvgPath)) {
    const svgBuffer = fs.readFileSync(sourceLogoSvgPath)
    try {
      const rasterizedPng = await rasterizeAsMonotonePng(svgBuffer)
      return pngBufferToDataUri(rasterizedPng)
    } catch (error) {
      console.warn(`Warning: unable to rasterize ${sourceLogoSvgPath}`, error)
      return svgToDataUri(svgBuffer.toString('utf8'))
    }
  }
  if (fs.existsSync(sourceLogoPngPath)) {
    try {
      const rasterizedPng = await rasterizeAsMonotonePng(fs.readFileSync(sourceLogoPngPath))
      return pngBufferToDataUri(rasterizedPng)
    } catch (error) {
      console.warn(`Warning: unable to rasterize ${sourceLogoPngPath}`, error)
      return pngBufferToDataUri(fs.readFileSync(sourceLogoPngPath))
    }
  }
  return ''
}

function buildSvgFromPng(pngBuffer) {
  const dataUri = escapeXml(pngBufferToDataUri(pngBuffer))
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#000000" />
  <image href="${dataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
</svg>
`
}

const siteConfig = readYamlObject(siteConfigPath)
const themeConfig = readYamlObject(themeConfigPath)

const composerName = toNonEmptyString(siteConfig.composerName) || 'Composer Name'
const siteDomain = extractSiteDomain(siteConfig.siteUrl)

const palette = {
  background: normalizeHexColor(themeConfig.colorBackground, DEFAULT_THEME_COLORS.colorBackground),
  backgroundSoft: normalizeHexColor(themeConfig.colorBackgroundSoft, DEFAULT_THEME_COLORS.colorBackgroundSoft),
  text: normalizeHexColor(themeConfig.colorText, DEFAULT_THEME_COLORS.colorText),
  textMuted: normalizeHexColor(themeConfig.colorTextMuted, DEFAULT_THEME_COLORS.colorTextMuted),
  accent: normalizeHexColor(themeConfig.colorAccent, DEFAULT_THEME_COLORS.colorAccent),
  accentStrong: normalizeHexColor(themeConfig.colorAccentStrong, DEFAULT_THEME_COLORS.colorAccentStrong),
  button: normalizeHexColor(themeConfig.colorButton, DEFAULT_THEME_COLORS.colorButton),
  buttonText: normalizeHexColor(themeConfig.colorButtonText, DEFAULT_THEME_COLORS.colorButtonText),
}

const fonts = {
  heading: resolveFontFamily(themeConfig.fontHeading, "'Gothic A1', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif"),
  body: resolveFontFamily(
    themeConfig.fontBody,
    "'Atkinson Hyperlegible', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
  ),
}

function buildGeneratedSvg(logoDataUri = '') {
  const nameLines = wrapComposerName(composerName)
  const longestLineLength = nameLines.reduce((max, line) => Math.max(max, line.length), 0)
  const nameFontSize = Math.round(clamp(112 - Math.max(0, longestLineLength - 11) * 3.2 - (nameLines.length - 1) * 10, 58, 112))
  const lineHeight = Math.round(nameFontSize * 1.08)
  const firstLineY = Math.round(314 - ((nameLines.length - 1) * lineHeight) / 2)
  const footerLabel = siteDomain || 'Music Portfolio'

  const nameLinesSvg = nameLines
    .map(
      (line, index) => `  <text
    x="${width / 2}"
    y="${firstLineY + index * lineHeight}"
    text-anchor="middle"
    fill="${mixHex(palette.text, '#ffffff', 0.08)}"
    font-family="${fonts.heading}"
    font-size="${nameFontSize}"
    font-weight="700"
    letter-spacing="0.01em"
  >${escapeXml(line)}</text>`,
    )
    .join('\n')

  const logoMarkup = logoDataUri
    ? `  <g opacity="0.14">
    <image href="${escapeXml(logoDataUri)}" x="290" y="20" width="620" height="620" preserveAspectRatio="xMidYMid meet" />
  </g>`
    : `  <circle cx="600" cy="316" r="230" fill="${mixHex(palette.accentStrong, palette.accent, 0.42)}" fill-opacity="0.12" stroke="${mixHex(palette.accentStrong, palette.backgroundSoft, 0.45)}" stroke-opacity="0.2" />`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    <linearGradient id="bg" x1="64" y1="34" x2="1162" y2="626" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.background}" />
      <stop offset="0.56" stop-color="${mixHex(palette.background, palette.backgroundSoft, 0.42)}" />
      <stop offset="1" stop-color="${palette.backgroundSoft}" />
    </linearGradient>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(970 188) rotate(131.5) scale(433 320)">
      <stop stop-color="${mixHex(palette.accent, '#ffffff', 0.18)}" stop-opacity="0.42" />
      <stop offset="1" stop-color="${mixHex(palette.accent, '#ffffff', 0.18)}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(862 492) rotate(176) scale(540 270)">
      <stop stop-color="${mixHex(palette.accentStrong, palette.accent, 0.35)}" stop-opacity="0.18" />
      <stop offset="1" stop-color="${mixHex(palette.accentStrong, palette.accent, 0.35)}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="accentBar" x1="116" y1="0" x2="544" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${mixHex(palette.accent, palette.button, 0.35)}" />
      <stop offset="1" stop-color="${mixHex(palette.accentStrong, palette.accent, 0.55)}" />
    </linearGradient>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="1.8" cy="1.8" r="1.2" fill="${palette.text}" fill-opacity="0.085" />
    </pattern>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#glowA)" />
  <rect width="${width}" height="${height}" fill="url(#glowB)" />
  <rect width="${width}" height="${height}" fill="url(#dots)" opacity="0.15" />

  <rect
    x="54"
    y="54"
    width="${width - 108}"
    height="${height - 108}"
    rx="28"
    fill="${mixHex(palette.backgroundSoft, '#ffffff', 0.08)}"
    fill-opacity="0.54"
    stroke="${mixHex(palette.textMuted, palette.background, 0.45)}"
    stroke-width="1.5"
  />
  <rect
    x="76"
    y="76"
    width="${width - 152}"
    height="${height - 152}"
    rx="22"
    stroke="${mixHex(palette.textMuted, palette.background, 0.6)}"
    stroke-opacity="0.5"
  />

${logoMarkup}

  <text
    x="${width / 2}"
    y="166"
    text-anchor="middle"
    fill="${mixHex(palette.accentStrong, palette.textMuted, 0.45)}"
    font-family="${fonts.body}"
    font-size="28"
    font-weight="600"
    letter-spacing="0.18em"
  >COMPOSER</text>

${nameLinesSvg}

  <rect x="386" y="448" width="428" height="4" rx="2" fill="url(#accentBar)" />

  <text
    x="${width / 2}"
    y="506"
    text-anchor="middle"
    fill="${mixHex(palette.textMuted, palette.text, 0.24)}"
    font-family="${fonts.body}"
    font-size="30"
    font-weight="500"
    letter-spacing="0.04em"
  >${escapeXml(footerLabel)}</text>
</svg>
`
}

async function writeSourceSvg(svg) {
  ensureDir(path.dirname(sourceSvgPath))
  await writeFile(sourceSvgPath, svg, 'utf8')
}

async function writeSourcePngFromSvg(svgBuffer) {
  ensureDir(path.dirname(sourcePngPath))
  await sharp(svgBuffer).resize(width, height, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(sourcePngPath)
}

async function writeSocialImageVersion() {
  const socialImageVersion = getVersionStamp()
  const socialImageVersionFile = `// Auto-generated by scripts/generate-social-preview-image.mjs
// Updates only when the social preview image is regenerated.
export const SOCIAL_IMAGE_VERSION = '${socialImageVersion}' as const
`
  await writeFile(socialImageVersionPath, socialImageVersionFile, 'utf8')
}

async function ensureSocialPreviewImages() {
  let sourceFilesWritten = false

  const hasSourceSvg = fs.existsSync(sourceSvgPath)
  const hasSourcePng = fs.existsSync(sourcePngPath)
  let generatedSvgCache = ''

  async function getGeneratedSvg() {
    if (generatedSvgCache) return generatedSvgCache
    const logoTone = mixHex(palette.textMuted, palette.text, 0.22)
    const logoDataUri = await loadBrandLogoDataUri({ toneHex: logoTone, size: 720 })
    generatedSvgCache = buildGeneratedSvg(logoDataUri)
    return generatedSvgCache
  }

  if (forceRegenerate) {
    const generatedSvg = await getGeneratedSvg()
    await writeSourceSvg(generatedSvg)
    await writeSourcePngFromSvg(Buffer.from(generatedSvg))
    sourceFilesWritten = true
    console.log(`Regenerated ${sourceSvgPath}`)
    console.log(`Regenerated ${sourcePngPath}`)
  } else if (!hasSourceSvg && !hasSourcePng) {
    const generatedSvg = await getGeneratedSvg()
    await writeSourceSvg(generatedSvg)
    await writeSourcePngFromSvg(Buffer.from(generatedSvg))
    sourceFilesWritten = true
    console.log(`Generated ${sourceSvgPath}`)
    console.log(`Generated ${sourcePngPath}`)
  } else if (hasSourceSvg && !hasSourcePng) {
    await writeSourcePngFromSvg(fs.readFileSync(sourceSvgPath))
    sourceFilesWritten = true
    console.log(`Generated missing ${sourcePngPath} from ${sourceSvgPath}`)
  } else if (!hasSourceSvg && hasSourcePng) {
    const generatedSvg = buildSvgFromPng(fs.readFileSync(sourcePngPath))
    await writeSourceSvg(generatedSvg)
    sourceFilesWritten = true
    console.log(`Generated missing ${sourceSvgPath} from ${sourcePngPath}`)
  } else {
    console.log('Social preview assets already exist in source/branding. Use --force to regenerate.')
  }

  if (!fs.existsSync(sourceSvgPath) || !fs.existsSync(sourcePngPath)) {
    throw new Error('Unable to resolve both source/branding social preview assets.')
  }

  const mirroredSvg = await copyFileIfNeeded(sourceSvgPath, outputSvgPath)
  const mirroredPng = await copyFileIfNeeded(sourcePngPath, outputPngPath)

  if (mirroredSvg) console.log(`Synced ${outputSvgPath}`)
  if (mirroredPng) console.log(`Synced ${outputPngPath}`)

  if (sourceFilesWritten || mirroredSvg || mirroredPng) {
    await writeSocialImageVersion()
    console.log(`Wrote ${socialImageVersionPath}`)
  }
}

await ensureSocialPreviewImages()
