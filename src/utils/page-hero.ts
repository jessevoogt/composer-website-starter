import { getHeroVariants, getHeroConfig, type HeroVariant, type HeroConfig } from './source-config'

export interface PageHero {
  id: string
  src: string
  position: string
  filter: string
}

export interface ResolvedPageHero {
  pageHero: PageHero | null
  heroVariants: HeroVariant[]
  heroConfig: HeroConfig
}

/**
 * Resolve a page's preferred hero image from the shared hero pool.
 * Returns `null` when `preferredHeroId` is empty or matches no variant.
 */
export function resolvePageHero(preferredHeroId: string | undefined): ResolvedPageHero {
  const heroVariants = getHeroVariants()
  const heroConfig = getHeroConfig()
  const trimmed = (preferredHeroId ?? '').trim()

  if (!trimmed) {
    return { pageHero: null, heroVariants, heroConfig }
  }

  const match = heroVariants.find((v) => v.id === trimmed)
  if (!match) {
    return { pageHero: null, heroVariants, heroConfig }
  }

  return {
    pageHero: {
      id: match.id,
      src: match.src,
      position: match.position,
      filter: match.filter || heroConfig.defaultFilter,
    },
    heroVariants,
    heroConfig,
  }
}
