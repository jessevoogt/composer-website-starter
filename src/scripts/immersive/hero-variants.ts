/**
 * Hero variant switcher — resolves initial variant from URL param / data attribute,
 * handles error fallback, and listens for custom events from the dev toolbar.
 */

import type { ClientHeroVariant } from './types'

interface HeroVariantOptions {
  heroVariants: ClientHeroVariant[]
  defaultHeroFilter: string
  fallbackHeroSrc: string
  heroVariantEventName: string
  devMode: boolean
}

export function initHeroVariants(options: HeroVariantOptions): () => void {
  const { heroVariants, defaultHeroFilter, fallbackHeroSrc, heroVariantEventName, devMode } = options

  const root = document.querySelector<HTMLElement>('[data-immersive-root]')
  const heroBackdropImage = document.querySelector<HTMLImageElement>('.stage-backdrop-image')

  if (!root || !heroBackdropImage) return () => {}

  // Re-bind after null guard so TypeScript narrows in closures
  const heroRoot: HTMLElement = root
  const heroImage: HTMLImageElement = heroBackdropImage

  const markHeroImageLoaded = (): void => {
    heroImage.classList.add('is-loaded')
  }

  function queueHeroImageReveal(resetOpacity: boolean): void {
    heroImage.removeEventListener('load', markHeroImageLoaded)

    if (resetOpacity) {
      heroImage.classList.remove('is-loaded')
    }

    if (heroImage.complete && heroImage.naturalWidth > 0) {
      window.requestAnimationFrame(markHeroImageLoaded)
      return
    }

    heroImage.addEventListener('load', markHeroImageLoaded, { once: true })
  }

  function findById(heroId: string | null | undefined): ClientHeroVariant | null {
    if (!heroId) return null
    return heroVariants.find((v) => v.id === heroId) ?? null
  }

  function setHeroVariant(variant: ClientHeroVariant): void {
    if (!variant.src) return
    const srcChanged = heroImage.getAttribute('src') !== variant.src

    heroImage.src = variant.src
    heroImage.alt = variant.alt || ''
    heroImage.style.objectPosition = variant.position || '50% 50%'
    heroRoot.style.setProperty('--hero-image-filter', variant.filter || defaultHeroFilter)
    queueHeroImageReveal(srcChanged)

    if (variant.id) {
      heroRoot.setAttribute('data-active-hero', variant.id)
    } else {
      heroRoot.removeAttribute('data-active-hero')
    }

    if (devMode) {
      console.info('Hero image:', variant.credit || variant.src)
    }
  }

  function resolveInitialVariant(): ClientHeroVariant | null {
    const queryVariantId = new URL(window.location.href).searchParams.get('hero')
    const queryVariant = findById(queryVariantId)
    if (queryVariant) return queryVariant

    const activeVariant = findById(heroRoot.getAttribute('data-active-hero'))
    if (activeVariant) return activeVariant

    return heroVariants[0] ?? null
  }

  const onHeroVariantSet = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return
    const nextHeroId = event.detail && typeof event.detail.heroId === 'string' ? event.detail.heroId : ''
    const nextVariant = findById(nextHeroId)
    if (!nextVariant) return
    setHeroVariant(nextVariant)
  }

  const onHeroImageError = (): void => {
    const fallbackVariant = findById('inside-piano')
    if (fallbackVariant) {
      setHeroVariant(fallbackVariant)
      return
    }

    console.warn('Hero image failed to load; falling back to local Option A.')
    const srcChanged = heroImage.getAttribute('src') !== fallbackHeroSrc
    heroImage.src = fallbackHeroSrc
    heroImage.alt = 'Open score pages in warm light.'
    heroImage.style.objectPosition = '44% 56%'
    heroRoot.style.setProperty('--hero-image-filter', defaultHeroFilter)
    heroRoot.setAttribute('data-active-hero', 'inside-piano')
    queueHeroImageReveal(srcChanged)
  }

  const initialVariant = resolveInitialVariant()
  if (initialVariant) {
    setHeroVariant(initialVariant)
  } else {
    queueHeroImageReveal(false)
  }

  window.addEventListener(heroVariantEventName, onHeroVariantSet)
  heroImage.addEventListener('error', onHeroImageError)

  return () => {
    window.removeEventListener(heroVariantEventName, onHeroVariantSet)
    heroImage.removeEventListener('error', onHeroImageError)
  }
}
