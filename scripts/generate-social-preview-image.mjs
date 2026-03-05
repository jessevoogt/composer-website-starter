import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import sharp from 'sharp'

const width = 1200
const height = 630
const workSocialImageDir = '/social/work'

const outputSvgPath = path.resolve('public/social-preview-image.svg')
const outputPngPath = path.resolve('public/social-preview-image.png')
const socialImageVersionPath = path.resolve('src/data/social-image-version.ts')
const worksContentDir = path.resolve('src/content/works')
const workSocialOutputDir = path.resolve(`public${workSocialImageDir}`)
const faviconPngPath = path.resolve('public/favicon-96x96.png')

// Personal brand data — falls back to generic text-based social preview if not present
const brandTailPathsFile = path.resolve('src/personal/data/brand-tail-paths.json')
const hasPersonalData = existsSync(brandTailPathsFile)

// Generic social preview generator (used when personal brand data is absent)
const { buildGenericSocialPreviewSvg } = await import('./generate-social-preview-svg.mjs')

// ─── Personal brand SVG builder (only when brand tail paths exist) ──────────

function buildPersonalBrandSvg() {
  const brandTailPaths = JSON.parse(readFileSync(brandTailPathsFile, 'utf8'))

  const initialJPath =
    'M5.01211 3.704V9.908C5.01211 10.836 4.82011 11.612 4.43611 12.236C4.06011 12.868 3.46811 13.392 2.66011 13.808L2.49211 13.592C2.72411 13.448 2.93211 13.284 3.11611 13.1C3.30811 12.916 3.46811 12.684 3.59611 12.404C3.72411 12.132 3.82011 11.788 3.88411 11.372C3.95611 10.964 3.99211 10.456 3.99211 9.848V3.704C3.99211 3.64 3.97611 3.556 3.94411 3.452C3.92011 3.34 3.87211 3.276 3.80011 3.26L2.93611 3.044V2.792L3.02011 2.72H6.02011L6.10411 2.792L6.08011 3.08L5.26411 3.248C5.19211 3.264 5.13211 3.316 5.08411 3.404C5.03611 3.492 5.01211 3.592 5.01211 3.704Z'
  const initialVPath =
    'M7.62581 3.83333L8.65781 3.62933L8.72981 3.85733C8.53781 4.09733 8.34981 4.34933 8.16581 4.61333C7.98181 4.87733 7.81381 5.13333 7.66181 5.38133C7.50981 5.62133 7.38181 5.83333 7.27781 6.01733C7.17381 6.19333 7.10181 6.31333 7.06181 6.37733C6.62981 7.17733 6.20181 8.04533 5.77781 8.98133C5.36181 9.91733 4.98181 10.8813 4.63781 11.8733L3.82181 12.1853L3.70181 12.1013L1.98581 6.31733C1.89781 6.03733 1.80981 5.76133 1.72181 5.48933C1.63381 5.21733 1.52981 4.94933 1.40981 4.68533C1.31381 4.48533 1.18181 4.35733 1.01381 4.30133C0.853813 4.23733 0.605813 4.18133 0.269813 4.13333L0.257812 3.80933L0.341813 3.73733L2.44181 3.61733C2.91381 5.92133 3.57381 8.16133 4.42181 10.3373C4.43781 10.3613 4.45381 10.3813 4.46981 10.3973C4.49381 10.4053 4.50981 10.4133 4.51781 10.4213C4.55781 10.4053 4.64581 10.2493 4.78181 9.95333C4.92581 9.65733 5.12181 9.24133 5.36981 8.70533L6.79781 5.41733C6.90981 5.14533 7.03781 4.87733 7.18181 4.61333C7.32581 4.34933 7.47381 4.08933 7.62581 3.83333Z'

  // Mirrors the on-site brand lockup proportions in src/styles/site.css.
  const logoInitialHeight = 216
  const logoInitialScale = logoInitialHeight / 14
  const logoInitialWidth = 9 * logoInitialScale
  const tailFirstPathWidth = Number(brandTailPaths.esse.width)
  const tailLastPathWidth = Number(brandTailPaths.oogt.width)
  const tailFirstPathMinX = Number(brandTailPaths.esse.x ?? 0)
  const tailLastPathMinX = Number(brandTailPaths.oogt.x ?? 0)
  const tailFirstPathData = String(brandTailPaths.esse.path)
  const tailLastPathData = String(brandTailPaths.oogt.path)
  const line2OffsetX = 71
  const line2OffsetY = -121
  const initialJMarginRight = -19
  const initialVMarginRight = -5
  const tailFirstX = logoInitialWidth + initialJMarginRight - tailFirstPathMinX
  const tailLastX = logoInitialWidth + initialVMarginRight - tailLastPathMinX
  const line2Y = logoInitialHeight + line2OffsetY
  const logoWidth = Math.max(
    tailFirstX + tailFirstPathMinX + tailFirstPathWidth,
    line2OffsetX + tailLastX + tailLastPathMinX + tailLastPathWidth,
  )
  const logoHeight = line2Y + logoInitialHeight
  const logoStartX = Math.round((width - logoWidth) / 2)
  const logoStartY = 116
  const composerY = logoStartY + logoHeight + 66
  const domainY = composerY + 82

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    <linearGradient id="bg" x1="100" y1="60" x2="1100" y2="590" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#040812"/>
      <stop offset="0.55" stop-color="#0B1426"/>
      <stop offset="1" stop-color="#111E32"/>
    </linearGradient>
    <radialGradient id="spot" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(600 262) rotate(90) scale(340 560)">
      <stop stop-color="#4E658F" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#4E658F" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#spot)" />
  <rect x="26" y="26" width="${width - 52}" height="${height - 52}" rx="20" stroke="#95A7C9" stroke-opacity="0.18" />

  <g opacity="0.65">
    <circle cx="600" cy="250" r="175" stroke="#BFCBE0" stroke-opacity="0.08" />
    <circle cx="600" cy="250" r="206" stroke="#BFCBE0" stroke-opacity="0.05" />
  </g>

  <g transform="translate(${logoStartX} ${logoStartY})">
    <g>
      <g transform="scale(${logoInitialScale})">
        <path d="${initialJPath}" fill="#F5F9FF" />
      </g>
      <path transform="translate(${tailFirstX} 0)" d="${tailFirstPathData}" fill="#D7E0EE" fill-opacity="0.88" />
    </g>

    <g transform="translate(${line2OffsetX} ${line2Y})">
      <g transform="scale(${logoInitialScale})">
        <path d="${initialVPath}" fill="#F5F9FF" />
      </g>
      <path transform="translate(${tailLastX} 0)" d="${tailLastPathData}" fill="#D7E0EE" fill-opacity="0.88" />
    </g>
  </g>

  <text
    x="600"
    y="${composerY}"
    text-anchor="middle"
    fill="#DCE6F6"
    font-family="'Avenir Next', 'Atkinson Hyperlegible Next', 'Helvetica Neue', Arial, sans-serif"
    font-size="40"
    font-weight="500"
    letter-spacing="0.2em"
  >
    COMPOSER
  </text>
  <text
    x="600"
    y="${domainY}"
    text-anchor="middle"
    fill="#AEBBD4"
    font-family="'Avenir Next', 'Atkinson Hyperlegible Next', 'Helvetica Neue', Arial, sans-serif"
    font-size="24"
    font-weight="500"
    letter-spacing="0.16em"
  >
    {SITE_NAME}
  </text>
</svg>
`
}

// ─── Generic SVG builder (reads from YAML config) ───────────────────────────

function buildGenericSvg() {
  const siteYamlPath = path.resolve('source/site/site.yaml')
  const themeYamlPath = path.resolve('source/site/theme.yaml')

  let composerName = 'Composer'
  let siteUrl = ''
  if (existsSync(siteYamlPath)) {
    const siteConfig = yaml.load(readFileSync(siteYamlPath, 'utf8')) || {}
    composerName = siteConfig.composerName || 'Composer'
    siteUrl = siteConfig.siteUrl || ''
  }

  const svgOptions = { siteUrl }
  if (existsSync(themeYamlPath)) {
    const themeConfig = yaml.load(readFileSync(themeYamlPath, 'utf8')) || {}
    if (themeConfig.branding) {
      svgOptions.gradientStart = themeConfig.branding.socialGradientStart
      svgOptions.gradientEnd = themeConfig.branding.socialGradientEnd
      svgOptions.textColor = themeConfig.branding.socialText
      svgOptions.mutedColor = themeConfig.branding.socialMuted
    }
  }

  return buildGenericSocialPreviewSvg(composerName, svgOptions)
}

const workForegroundMaxWidth = 980
const workForegroundMaxHeight = 430
const workCardPadding = 24
const workCardAreaTop = 40
const workBadgeSize = 72
const workBadgeBottomInset = 26
const workCardAreaBottom = height - (workBadgeSize + workBadgeBottomInset + 12)

function buildRectSvg({ width: rectWidth, height: rectHeight, radius, fill, stroke, strokeWidth = 1 }) {
  const inset = stroke ? strokeWidth / 2 : 0
  const rectAttrs = [
    `x="${inset}"`,
    `y="${inset}"`,
    `width="${rectWidth - inset * 2}"`,
    `height="${rectHeight - inset * 2}"`,
    `rx="${Math.max(0, radius - inset)}"`,
    `fill="${fill}"`,
  ]

  if (stroke) {
    rectAttrs.push(`stroke="${stroke}"`, `stroke-width="${strokeWidth}"`)
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${rectWidth}" height="${rectHeight}" viewBox="0 0 ${rectWidth} ${rectHeight}">
  <rect ${rectAttrs.join(' ')} />
</svg>`,
  )
}

function buildWorkOverlaySvg() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    <linearGradient id="wash" x1="600" y1="0" x2="600" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#040812" stop-opacity="0.2" />
      <stop offset="0.58" stop-color="#040812" stop-opacity="0.44" />
      <stop offset="1" stop-color="#040812" stop-opacity="0.82" />
    </linearGradient>
    <radialGradient id="spot" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(600 290) rotate(90) scale(360 620)">
      <stop stop-color="#B8C7DE" stop-opacity="0.12" />
      <stop offset="1" stop-color="#B8C7DE" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wash)" />
  <rect width="${width}" height="${height}" fill="url(#spot)" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" stroke="#E8EFFC" stroke-opacity="0.14" />
</svg>`,
  )
}

function parseFrontmatter(mdxContent) {
  const match = mdxContent.match(/^---\r?\n([\s\S]+?)\r?\n---/)
  if (!match) return null

  try {
    return yaml.load(match[1]) || null
  } catch {
    return null
  }
}

function resolveThumbnailFile(thumbnailSrc) {
  if (typeof thumbnailSrc !== 'string') return null
  const normalized = thumbnailSrc.trim()
  if (!normalized.startsWith('/assets/images/works/')) return null
  return path.resolve('src', normalized.replace(/^\/+/, ''))
}

async function writeTextFileIfChanged(filePath, contents) {
  const nextBuffer = Buffer.from(contents, 'utf8')

  try {
    const existing = await readFile(filePath)
    if (existing.equals(nextBuffer)) return false
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
  return true
}

async function writeBinaryFileIfChanged(filePath, contents) {
  try {
    const existing = await readFile(filePath)
    if (existing.equals(contents)) return false
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
  return true
}

async function buildFaviconBadge() {
  const iconSize = 36
  const badgeBase = sharp({
    create: {
      width: workBadgeSize,
      height: workBadgeSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  const badgeChrome = buildRectSvg({
    width: workBadgeSize,
    height: workBadgeSize,
    radius: Math.round(workBadgeSize / 2),
    fill: 'rgba(8, 14, 24, 0.82)',
    stroke: 'rgba(236, 243, 255, 0.22)',
    strokeWidth: 2,
  })

  const favicon = await sharp(faviconPngPath).resize(iconSize, iconSize, { fit: 'contain' }).png().toBuffer()

  return badgeBase
    .composite([
      { input: badgeChrome, top: 0, left: 0 },
      {
        input: favicon,
        top: Math.round((workBadgeSize - iconSize) / 2),
        left: Math.round((workBadgeSize - iconSize) / 2),
      },
    ])
    .png()
    .toBuffer()
}

async function buildWorkSocialImage(inputPath, faviconBadgeBuffer) {
  const backgroundBuffer = await sharp(inputPath)
    .resize(width, height, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .modulate({
      brightness: 0.78,
      saturation: 1.04,
    })
    .blur(18)
    .png()
    .toBuffer()

  const { data: foregroundBuffer, info: foregroundInfo } = await sharp(inputPath)
    .resize({
      width: workForegroundMaxWidth,
      height: workForegroundMaxHeight,
      fit: 'inside',
    })
    .png()
    .toBuffer({ resolveWithObject: true })

  const cardWidth = foregroundInfo.width + workCardPadding * 2
  const cardHeight = foregroundInfo.height + workCardPadding * 2
  const cardX = Math.round((width - cardWidth) / 2)
  const cardY = workCardAreaTop + Math.max(0, Math.round((workCardAreaBottom - workCardAreaTop - cardHeight) / 2))

  const cardShadow = await sharp(
    buildRectSvg({
      width: cardWidth + 28,
      height: cardHeight + 28,
      radius: 30,
      fill: 'rgba(4, 8, 18, 0.46)',
    }),
  )
    .blur(16)
    .png()
    .toBuffer()

  const cardPlate = buildRectSvg({
    width: cardWidth,
    height: cardHeight,
    radius: 24,
    fill: 'rgba(8, 12, 22, 0.66)',
    stroke: 'rgba(236, 243, 255, 0.14)',
    strokeWidth: 2,
  })

  return sharp(backgroundBuffer)
    .composite([
      { input: buildWorkOverlaySvg(), top: 0, left: 0 },
      { input: cardShadow, top: cardY + 16, left: cardX - 14 },
      { input: cardPlate, top: cardY, left: cardX },
      { input: foregroundBuffer, top: cardY + workCardPadding, left: cardX + workCardPadding },
      {
        input: faviconBadgeBuffer,
        top: height - workBadgeSize - workBadgeBottomInset,
        left: Math.round((width - workBadgeSize) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function collectWorkSocialSources() {
  const entries = await readdir(worksContentDir, { withFileTypes: true })
  const workSources = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue

    const workSlug = entry.name.replace(/\.mdx$/, '')
    const filePath = path.join(worksContentDir, entry.name)
    const frontmatter = parseFrontmatter(await readFile(filePath, 'utf8'))
    const thumbnailSrc = frontmatter?.thumbnail?.src
    const thumbnailFile = resolveThumbnailFile(thumbnailSrc)
    if (!thumbnailFile) continue

    workSources.push({ workSlug, thumbnailFile })
  }

  return workSources.sort((left, right) => left.workSlug.localeCompare(right.workSlug))
}

async function cleanupStaleWorkImages(activeWorkSlugs) {
  try {
    const entries = await readdir(workSocialOutputDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.png')) continue
      const workSlug = entry.name.replace(/\.png$/, '')
      if (activeWorkSlugs.has(workSlug)) continue
      await unlink(path.join(workSocialOutputDir, entry.name))
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

// Build the site-level social preview SVG (personal brand or generic)
const svg = hasPersonalData ? buildPersonalBrandSvg() : buildGenericSvg()
const pngBuffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()

// Build per-work social images (only if favicon badge is available)
const hasFavicon = existsSync(faviconPngPath)
const faviconBadgeBuffer = hasFavicon ? await buildFaviconBadge() : null
const workSources = await collectWorkSocialSources()
const generatedWorkImages = []

for (const workSource of workSources) {
  if (!faviconBadgeBuffer) continue
  const imageBuffer = await buildWorkSocialImage(workSource.thumbnailFile, faviconBadgeBuffer)
  generatedWorkImages.push({ workSlug: workSource.workSlug, buffer: imageBuffer })
}

await cleanupStaleWorkImages(new Set(workSources.map((entry) => entry.workSlug)))

const versionHash = createHash('sha256')
versionHash.update(svg)
versionHash.update(pngBuffer)

for (const workImage of generatedWorkImages) {
  versionHash.update(workImage.workSlug)
  versionHash.update(workImage.buffer)
}

const socialImageVersion = versionHash.digest('hex').slice(0, 12)
const socialImageVersionFile = `// Auto-generated by scripts/generate-social-preview-image.mjs
// Updates only when generated social preview assets change.
export const SOCIAL_IMAGE_VERSION = '${socialImageVersion}' as const
`

await writeTextFileIfChanged(outputSvgPath, svg)
await writeBinaryFileIfChanged(outputPngPath, pngBuffer)

for (const workImage of generatedWorkImages) {
  const outputPath = path.join(workSocialOutputDir, `${workImage.workSlug}.png`)
  await writeBinaryFileIfChanged(outputPath, workImage.buffer)
}

await writeTextFileIfChanged(socialImageVersionPath, socialImageVersionFile)

console.log(`Wrote ${outputSvgPath}`)
console.log(`Wrote ${outputPngPath}`)
console.log(`Wrote ${generatedWorkImages.length} work social preview images in ${workSocialOutputDir}`)
console.log(`Wrote ${socialImageVersionPath}`)
