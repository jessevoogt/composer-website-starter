/**
 * Standalone menu initializer for non-homepage pages.
 * The homepage loads index.ts which handles menu init (along with parallax, carousel, etc.).
 * We skip init here if the immersive root is present (homepage) to avoid double-init.
 */

import { initMenu } from './menu'

document.addEventListener('astro:page-load', () => {
  // Homepage has [data-immersive-root] and its own index.ts handles menu
  const isHomepage = !!document.querySelector('[data-immersive-root]')
  if (isHomepage) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const teardown = initMenu(prefersReducedMotion)

  document.addEventListener('astro:before-swap', () => teardown(), { once: true })
})
