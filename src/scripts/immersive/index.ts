/**
 * Orchestrator for all immersive-stage client-side behaviors.
 * Reads configuration from a JSON script block, initializes modules,
 * and handles cleanup on Astro page transitions.
 */

import { prefersReducedMotion as prefersReducedMotionCheck } from '../a11y-utils'
import { readPageData } from './types'
import { initMenu } from './menu'
import { initCarousel } from './carousel'
import { initFeaturedPlayer } from './featured-player'
import { initParallax } from './parallax'
import { initHeroVariants } from './hero-variants'
import { applyFeaturedRecording } from './featured-recording-data'

/**
 * Carry fixed-player classes across View Transition swaps so the bar
 * never flashes out and back in during navigation.
 */
const playerClassesToPreserve = ['has-fixed-player', 'has-fixed-player-reveal-done']

document.addEventListener('astro:before-swap', (event) => {
  const swapEvent = event as Event & { newDocument: Document }
  const currentRoot = document.documentElement
  const incomingRoot = swapEvent.newDocument.documentElement

  for (const cls of playerClassesToPreserve) {
    if (currentRoot.classList.contains(cls)) {
      incomingRoot.classList.add(cls)
    }
  }
})

document.addEventListener('astro:page-load', () => {
  const teardownFeaturedPlayer = initFeaturedPlayer()
  const root = document.querySelector<HTMLElement>('[data-immersive-root]')
  const hero = document.querySelector<HTMLElement>('[data-parallax-hero]')
  if (!root || !hero) {
    document.addEventListener(
      'astro:before-swap',
      () => {
        teardownFeaturedPlayer()
      },
      { once: true },
    )
    return
  }

  const data = readPageData()
  const prefersReducedMotion = prefersReducedMotionCheck()
  const introKey = 'jv-immersive-intro-v2'

  // First-visit intro animation
  if (!prefersReducedMotion && localStorage.getItem(introKey) !== 'seen') {
    root.classList.add('is-intro')
    localStorage.setItem(introKey, 'seen')
  }

  // Apply the featured recording and adjust the works carousel ordering
  applyFeaturedRecording({
    selectWorksSortOrder: data.selectWorksSortOrder,
    featuredRecordingPool: data.featuredRecordingPool,
    fallbackFeaturedRecording: data.fallbackFeaturedRecording,
  })

  // Initialize all interactive modules
  const teardownMenu = initMenu(prefersReducedMotion)
  const teardownCarousel = initCarousel(prefersReducedMotion)
  const teardownParallax = prefersReducedMotion ? () => {} : initParallax()
  const teardownHeroVariants = initHeroVariants({
    heroVariants: data.heroVariants,
    defaultHeroFilter: data.defaultHeroFilter,
    fallbackHeroSrc: data.fallbackHeroSrc,
    heroVariantEventName: data.heroVariantEventName,
    devMode: data.devMode,
  })

  // Clean up on Astro page transition
  document.addEventListener(
    'astro:before-swap',
    () => {
      teardownHeroVariants()
      teardownMenu()
      teardownCarousel()
      teardownFeaturedPlayer()
      teardownParallax()
    },
    { once: true },
  )
})
