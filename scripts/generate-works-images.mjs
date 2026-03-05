#!/usr/bin/env node
// Script: generate-works-images.mjs
// Scans src/assets/images/works and writes src/utils/works-images.ts exporting imports and an array
import fs from 'fs'
import path from 'path'

const workspaceRoot = process.cwd()
const imagesDir = path.join(workspaceRoot, 'src', 'assets', 'images', 'works')
const outFile = path.join(workspaceRoot, 'src', 'utils', 'works-images.ts')
const TARGET_WIDTH = 740
const TARGET_HEIGHT = 470

const cropPositionToSharp = {
  'top-left': 'northwest',
  'top-center': 'north',
  'top-right': 'northeast',
  'center-left': 'west',
  'center-center': 'center',
  'center-right': 'east',
  'bottom-left': 'southwest',
  'bottom-center': 'south',
  'bottom-right': 'southeast',
}

const cropShortCodeMap = {
  tl: 'top-left',
  tc: 'top-center',
  tr: 'top-right',
  cl: 'center-left',
  cc: 'center-center',
  cr: 'center-right',
  bl: 'bottom-left',
  bc: 'bottom-center',
  br: 'bottom-right',
}

function isImageFile(name) {
  const ext = path.extname(name).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'].includes(ext)
}

function slugifyImportName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1')
}

function parseCropDirective(baseName) {
  // Supports both verbose and shorter suffixes:
  // -name-crop-position-top-center
  // -name-crop-top-center
  // -name-crop-tc
  let match = baseName.match(/-(?:crop-position|crop)-(top|center|bottom)-(left|center|right)$/)
  if (match && typeof match.index === 'number') {
    const key = `${match[1]}-${match[2]}`
    return {
      outputBase: baseName.slice(0, match.index),
      cropPosition: cropPositionToSharp[key] || null,
    }
  }

  match = baseName.match(/-(?:crop-position|crop)-(tl|tc|tr|cl|cc|cr|bl|bc|br)$/)
  if (match && typeof match.index === 'number') {
    const key = cropShortCodeMap[match[1]]
    return {
      outputBase: baseName.slice(0, match.index),
      cropPosition: cropPositionToSharp[key] || null,
    }
  }

  match = baseName.match(/-(?:crop-position|crop)-center$/)
  if (match && typeof match.index === 'number') {
    return {
      outputBase: baseName.slice(0, match.index),
      cropPosition: cropPositionToSharp['center-center'],
    }
  }

  return {
    outputBase: baseName,
    cropPosition: null,
  }
}

// Returns true if a webp was generated (or already exists) — meaning the source raster can be cleaned up
async function ensure740wWebp(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.svg') return false // don't rasterize SVGs

  const base = path.basename(file, ext)
  const { outputBase, cropPosition } = parseCropDirective(base)
  const targetName = `${outputBase}-740w.webp`
  const srcPath = path.join(imagesDir, file)
  const targetPath = path.join(imagesDir, targetName)

  // only produce 740w from raster sources
  try {
    const sharp = await import('sharp')

    if (fs.existsSync(targetPath)) {
      const srcStats = fs.statSync(srcPath)
      const targetStats = fs.statSync(targetPath)
      const targetIsNewer = targetStats.mtimeMs >= srcStats.mtimeMs

      if (targetIsNewer && !cropPosition) return true // already present and up to date

      if (targetIsNewer && cropPosition) {
        const targetMetadata = await sharp.default(targetPath).metadata()
        if (targetMetadata.width === TARGET_WIDTH && targetMetadata.height === TARGET_HEIGHT) {
          return true
        }
      }
    }

    const pipeline = sharp.default(srcPath)

    if (cropPosition) {
      await pipeline
        .resize({ width: TARGET_WIDTH, height: TARGET_HEIGHT, fit: 'cover', position: cropPosition })
        .webp({ quality: 80 })
        .toFile(targetPath)
      console.log('Generated', targetName, `with crop position ${cropPosition}`)
      return true
    }

    await pipeline.resize({ width: TARGET_WIDTH }).webp({ quality: 80 }).toFile(targetPath)
    console.log('Generated', targetName)
    return true
  } catch (err) {
    console.warn('Could not generate', targetName + ':', err.message || err)
    console.warn('Install `sharp` (npm install --save-dev sharp) to enable automatic resizing.')
    return false
  }
}

async function main() {
  if (!fs.existsSync(imagesDir)) {
    console.error('Images directory not found:', imagesDir)
    process.exit(1)
  }

  // find original raster files (jpg/png) and ensure a 740w webp exists for each
  const initialFiles = fs.readdirSync(imagesDir).filter(isImageFile).sort()
  const rasterSourcesToCleanup = []

  for (const file of initialFiles) {
    const ext = path.extname(file).toLowerCase()
    // skip if already a 740w.webp
    if (file.endsWith('-740w.webp')) continue
    // create -740w.webp from raster sources
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(ext)) {
      const webpReady = await ensure740wWebp(file)
      if (webpReady) rasterSourcesToCleanup.push(file)
    }
  }

  // Clean up source raster files now that webps exist — keeps only webps in git
  for (const file of rasterSourcesToCleanup) {
    const srcPath = path.join(imagesDir, file)
    fs.unlinkSync(srcPath)
    console.log('Cleaned up source raster:', file)
  }

  // re-read files after possible generation
  const files = fs.readdirSync(imagesDir).filter(isImageFile).sort()

  const imports = []
  const list = []

  const fileSet = new Set(files)
  files.forEach((file) => {
    const ext = path.extname(file).toLowerCase()
    const base = path.basename(file, ext)
    const { outputBase } = parseCropDirective(base)

    // ignore legacy generated files that keep crop suffixes if canonical output exists
    if (file.endsWith('-740w.webp')) {
      const generatedBase = base.slice(0, -'-740w'.length)
      const { outputBase: normalizedGeneratedBase } = parseCropDirective(generatedBase)
      if (normalizedGeneratedBase !== generatedBase && fileSet.has(`${normalizedGeneratedBase}-740w.webp`)) {
        return
      }
    }

    // if a generated 740w.webp exists for this base, skip the original raster source
    if (
      !file.endsWith('-740w.webp') &&
      fileSet.has(`${outputBase}-740w.webp`) &&
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(ext)
    ) {
      return
    }

    const importName = slugifyImportName(path.basename(file, path.extname(file)))
    const relPath = `@assets/images/works/${file}`
    imports.push(`import ${importName} from '${relPath}'`)
    const publicPath = `/assets/images/works/${file}`
    list.push(`{ data: ${importName}, path: '${publicPath}', filename: '${file}' }`)
  })

  // When the array is empty, add an explicit type annotation so TypeScript strict mode
  // doesn't infer `any[]`. When populated, the type is inferred from the image imports.
  const typeAnnotation = list.length === 0
    ? ': { data: ImageMetadata; path: string; filename: string }[]'
    : ''
  const extraImports = list.length === 0
    ? "import type { ImageMetadata } from 'astro'\n"
    : ''

  const content = `// THIS FILE IS AUTO-GENERATED BY scripts/generate-works-images.mjs
// Run: node ./scripts/generate-works-images.mjs\n\n${extraImports}${imports.join('\n')}\n\nconst worksImages${typeAnnotation} = [${list.join(', ')}]\n\nexport default worksImages\n`

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === content) {
    console.log('works-images.ts unchanged, skipping write')
    return
  }
  fs.writeFileSync(outFile, content, 'utf8')
  console.log('Wrote', outFile, 'with', files.length, 'images')
}

main()
