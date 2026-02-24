import { getHeroConfig, getHeroVariants, type HeroConfig, type HeroVariant } from './source-config'

export type PageHeroKey = 'home' | 'contact' | 'works' | 'about'

export interface ResolvedPageHero {
  pageHero: HeroVariant | null
  heroVariants: HeroVariant[]
  heroConfig: HeroConfig
  fallbackHeroSrc: string
}

interface ResolvePageHeroOptions {
  allowEmptyPreferredHero?: boolean
}

export function resolvePageHero(preferredHeroId: string, options: ResolvePageHeroOptions = {}): ResolvedPageHero {
  const heroVariants = getHeroVariants()
  const heroConfig = getHeroConfig()
  const preferredId = preferredHeroId.trim()
  const shouldReturnEmptyHero = options.allowEmptyPreferredHero === true && preferredId.length === 0
  const resolvedPreferredId = preferredId || heroConfig.preferredHeroId
  const preferredHeroIndex = heroVariants.findIndex((variant) => variant.id === resolvedPreferredId)
  const defaultHeroIndex = preferredHeroIndex >= 0 ? preferredHeroIndex : 0
  const pageHero = shouldReturnEmptyHero ? null : heroVariants[defaultHeroIndex] ?? heroVariants[0] ?? null
  const fallbackHeroSrc =
    heroVariants.find((variant) => variant.id === heroConfig.fallbackHeroId)?.src ?? heroVariants[0]?.src ?? ''

  return {
    pageHero,
    heroVariants,
    heroConfig,
    fallbackHeroSrc,
  }
}

export function buildHeroSwitcherPageData(
  pageKey: PageHeroKey,
  resolvedHero: ResolvedPageHero,
  isDevMode: boolean,
  heroVariantEventName: string,
): string {
  return JSON.stringify({
    pageKey,
    heroVariants: isDevMode ? resolvedHero.heroVariants : [],
    fallbackHeroSrc: resolvedHero.fallbackHeroSrc,
    defaultHeroFilter: resolvedHero.heroConfig.defaultFilter,
    heroVariantEventName,
    devMode: isDevMode,
  })
}
