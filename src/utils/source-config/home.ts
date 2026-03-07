/**
 * Source Config — Home Page
 *
 * The homepage is stored as a single consolidated YAML file with a `sections`
 * array using Keystatic's conditional (discriminant/value) format. Each public
 * reader function below extracts its slice from the consolidated data, keeping
 * the same public API and types so that index.astro / setup.astro need no changes.
 */

import { z } from 'astro/zod'
import { readYaml, PAGES_DIR, path, nullableString } from './core'
import { getSiteConfig } from './site'

const HOME_YAML_PATH = path.join(PAGES_DIR, 'home.yaml')

/** Shape of a single section entry in the consolidated home YAML. */
const homeSectionBlockSchema = z.object({
  discriminant: z.string(),
  value: z.record(z.unknown()).default({}),
})

/** Top-level shape of the consolidated home YAML. */
const consolidatedHomeSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  sections: z
    .array(
      z.object({
        block: homeSectionBlockSchema,
      }),
    )
    .default([]),
})

type ConsolidatedHome = z.infer<typeof consolidatedHomeSchema>

/** Read and parse the consolidated home YAML (memoized via readYaml). */
function getHomePageRaw(): ConsolidatedHome {
  return readYaml(HOME_YAML_PATH, consolidatedHomeSchema, consolidatedHomeSchema.parse({}))
}

/**
 * Find the first section matching `discriminant` and parse its `.value`
 * with the given Zod schema. Returns the schema's default if no match.
 */
function findHomeSection<T>(discriminant: string, schema: z.ZodSchema, fallback: T): T {
  const home = getHomePageRaw()
  const match = home.sections.find((s) => s.block.discriminant === discriminant)
  if (!match) return fallback
  return schema.parse(match.block.value) as T
}

// ─── Home: Hero Config ──────────────────────────────────────────────────────

const homeHeroActionsSchema = z
  .object({
    listenNow: z
      .object({
        visible: z.boolean().default(true),
        label: z.string().default('Listen Now'),
      })
      .default({
        visible: true,
        label: 'Listen Now',
      }),
    searchMusic: z
      .object({
        visible: z.boolean().default(true),
        label: z.string().default('Search Music'),
      })
      .default({
        visible: true,
        label: 'Search Music',
      }),
  })
  .default({
    listenNow: {
      visible: true,
      label: 'Listen Now',
    },
    searchMusic: {
      visible: true,
      label: 'Search Music',
    },
  })

const homeHeroSchema = z.object({
  heroTitle: z.string().default(''),
  heroSubtitle: z.string().default('Composer'),
  heroTagline: z.string().default('Original concert music for acoustic instruments and ensembles.'),
  heroTaglineAsBlockquote: z.boolean().default(false),
  heroTaglineCitation: z.string().default(''),
  actions: homeHeroActionsSchema,
  preferredHeroId: nullableString,
  fallbackHeroId: nullableString,
  defaultFilter: z.string().default('saturate(0.72) contrast(1.06) brightness(0.72)'),
})

export type HomeHeroConfig = z.infer<typeof homeHeroSchema>

export function getHomeHero(): HomeHeroConfig {
  const config = findHomeSection('hero', homeHeroSchema, homeHeroSchema.parse({}))
  if (!config.heroTitle) {
    const site = getSiteConfig()
    return { ...config, heroTitle: site.composerName }
  }
  return config
}

// ─── Home: SEO Config ───────────────────────────────────────────────────────

const homeSeoSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
})

export type HomeSeoConfig = z.infer<typeof homeSeoSchema>

export function getHomeSeo(): HomeSeoConfig {
  const home = getHomePageRaw()
  return homeSeoSchema.parse({
    metaTitle: home.metaTitle,
    metaDescription: home.metaDescription,
    searchResultText: home.searchResultText,
  })
}

// ─── Home: Contact Config ───────────────────────────────────────────────────

const homeContactSchema = z.object({
  contactIntro: z
    .string()
    .default(
      'Whether you are interested in a score, a performance, or something else, I would be glad to hear from you.',
    ),
  sectionTitle: z.string().default('Contact'),
})

export type HomeContactConfig = z.infer<typeof homeContactSchema>

export function getHomeContact(): HomeContactConfig {
  return findHomeSection('contact', homeContactSchema, homeContactSchema.parse({}))
}

// ─── Home: Featured Work Config ─────────────────────────────────────────────

const homeFeaturedWorkSchema = z.object({
  sectionTitle: z.string().default('Featured Recording'),
  activeSectionTitle: z.string().default('Currently Playing'),
  buttonText: z.string().default('More Details'),
})

export type HomeFeaturedWorkConfig = z.infer<typeof homeFeaturedWorkSchema>

export function getHomeFeaturedWork(): HomeFeaturedWorkConfig {
  return findHomeSection('featured-work', homeFeaturedWorkSchema, homeFeaturedWorkSchema.parse({}))
}

// ─── Home: Select Works Config ──────────────────────────────────────────────

const homeSelectWorksSortOrderSchema = z.enum(['selected-order', 'random', 'newest', 'oldest', 'title'])

export type HomeSelectWorksSortOrder = z.infer<typeof homeSelectWorksSortOrderSchema>

const homeSelectWorksSchema = z.object({
  sectionTitle: z.string().default('Select Works'),
  ignoreSelected: z.boolean().default(false),
  showAllIfNoSelected: z.boolean().default(true),
  sortOrder: homeSelectWorksSortOrderSchema.default('random'),
})

export type HomeSelectWorksConfig = z.infer<typeof homeSelectWorksSchema>

export function getHomeSelectWorks(): HomeSelectWorksConfig {
  return findHomeSection('select-works', homeSelectWorksSchema, homeSelectWorksSchema.parse({}))
}

// ─── Home: Layout Config ────────────────────────────────────────────────────

const homeLayoutSchema = z.object({
  sections: z
    .array(
      z.object({
        key: z.string(),
      }),
    )
    .default([{ key: 'hero' }, { key: 'featured-work' }, { key: 'select-works' }, { key: 'contact' }]),
})

export type HomeLayoutConfig = z.infer<typeof homeLayoutSchema>

export function getHomeLayout(): HomeLayoutConfig {
  const home = getHomePageRaw()
  if (home.sections.length === 0) return homeLayoutSchema.parse({})
  return {
    sections: home.sections.map((s) => ({ key: s.block.discriminant })),
  }
}
