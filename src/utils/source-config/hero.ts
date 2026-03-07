/**
 * Source Config — Hero Variants
 */

import { z } from 'astro/zod'
import { SOURCE_ROOT, fs, path, yaml } from './core'
import { getHomeHero } from './home'

const heroVariantSchema = z.object({
  label: z.string().default(''),
  alt: z.string().default(''),
  credit: z.string().default(''),
  position: z.string().default('50% 50%'),
  filter: z.string().default(''),
  sortOrder: z.number().default(0),
})

export interface HeroVariant {
  id: string
  label: string
  src: string
  alt: string
  credit: string
  position: string
  filter: string
}

export interface HeroConfig {
  preferredHeroId: string
  fallbackHeroId: string
  defaultFilter: string
}

export function getHeroConfig(): HeroConfig {
  const { preferredHeroId, fallbackHeroId, defaultFilter } = getHomeHero()
  return { preferredHeroId, fallbackHeroId, defaultFilter }
}

export function getHeroVariants(): HeroVariant[] {
  const heroesDir = path.join(SOURCE_ROOT, 'heroes')
  if (!fs.existsSync(heroesDir)) return []

  const heroConfig = getHeroConfig()
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp'])

  const entries = fs.readdirSync(heroesDir, { withFileTypes: true }).filter((d) => d.isDirectory())

  const sortable: { variant: HeroVariant; sortOrder: number }[] = []

  for (const entry of entries) {
    const slug = entry.name
    const heroYamlPath = path.join(heroesDir, slug, 'hero.yaml')

    // Read the hero YAML (required for collection entries)
    if (!fs.existsSync(heroYamlPath)) continue
    const raw = yaml.load(fs.readFileSync(heroYamlPath, 'utf-8'))
    const meta = heroVariantSchema.parse(raw)

    // Auto-detect image file by convention: image.{jpg,jpeg,webp,png} in the hero directory
    const heroDir = path.join(heroesDir, slug)
    const files = fs.readdirSync(heroDir)
    const imageFile =
      files.find((f) => {
        const base = path.basename(f, path.extname(f)).toLowerCase()
        return base === 'image' && imageExts.has(path.extname(f).toLowerCase())
      }) ?? ''

    if (!imageFile) continue

    sortable.push({
      variant: {
        id: slug,
        label: meta.label || slug,
        src: `/hero/${slug}/${imageFile}`,
        alt: meta.alt,
        credit: meta.credit,
        position: meta.position,
        filter: meta.filter || heroConfig.defaultFilter,
      },
      sortOrder: meta.sortOrder,
    })
  }

  return sortable
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.variant.label.localeCompare(b.variant.label)
    })
    .map((entry) => entry.variant)
}
