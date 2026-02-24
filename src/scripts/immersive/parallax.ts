/**
 * Scroll-driven parallax effects for the immersive hero and listen sections.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function initParallax(): () => void {
  const root = document.querySelector<HTMLElement>('[data-immersive-root]')
  const hero = document.querySelector<HTMLElement>('[data-parallax-hero]')
  const siteHeader = document.querySelector<HTMLElement>('.site-header')
  const listenSection = document.querySelector<HTMLElement>('.listen-section')
  const listenFigure = document.querySelector<HTMLElement>('[data-parallax-listen]')

  if (!root || !hero) return () => {}

  let ticking = false
  let heroShiftLockValue = 0
  let heroShiftLocked = false

  function updateParallax(): void {
    ticking = false

    const viewport = window.innerHeight || 1
    const heroRect = hero!.getBoundingClientRect()

    const heroProgress = clamp(-heroRect.top / (viewport * 0.92), -1.35, 1.35)
    const heroShiftTarget = heroProgress * 104
    root!.style.setProperty('--copy-shift', `${heroProgress * -42}px`)
    root!.style.setProperty('--scrim-shift', '0px')
    root!.style.setProperty('--hero-freeze-gray', '0')
    root!.style.setProperty('--hero-freeze-contrast', '1')

    let shouldLockHeroShift = false

    if (listenFigure && listenSection) {
      const sectionRect = listenSection.getBoundingClientRect()
      const headerBottom = siteHeader ? siteHeader.getBoundingClientRect().bottom : 0
      const alignDistance = Math.max(1, viewport - headerBottom)
      const listenProgress = clamp((viewport - sectionRect.top) / alignDistance, 0, 1)
      root!.style.setProperty('--listen-scroll-progress', listenProgress.toFixed(3))
      const headerReveal = listenProgress * listenProgress * (3 - 2 * listenProgress)
      const sectionDivergeStart = 0.12
      const sectionDivergeRaw =
        listenProgress <= sectionDivergeStart ? 0 : (listenProgress - sectionDivergeStart) / (1 - sectionDivergeStart)
      const sectionDiverge = sectionDivergeRaw * sectionDivergeRaw * (3 - 2 * sectionDivergeRaw)
      const fadeOutRange = Math.max(1, sectionRect.height * 0.5)
      const fadeOutProgress = clamp(sectionRect.bottom / fadeOutRange, 0, 1)
      const fadeOutEase = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress)
      const listenReveal = sectionDiverge * fadeOutEase
      const leftShade = sectionDiverge

      shouldLockHeroShift = listenProgress >= 1

      root!.style.setProperty('--section-diverge', sectionDiverge.toFixed(3))
      root!.style.setProperty('--listen-fade-out-progress', fadeOutEase.toFixed(3))
      root!.style.setProperty('--listen-reveal-progress', listenReveal.toFixed(3))
      root!.style.setProperty('--listen-left-shade', leftShade.toFixed(3))
      // Set --header-reveal on the header directly (it's outside .immersive-home in SiteLayout)
      if (siteHeader) {
        siteHeader.style.setProperty('--header-reveal', headerReveal.toFixed(3))
      }
    }

    if (shouldLockHeroShift) {
      if (!heroShiftLocked) {
        heroShiftLockValue = heroShiftTarget
        heroShiftLocked = true
      }
      root!.style.setProperty('--hero-shift', `${heroShiftLockValue}px`)
    } else {
      heroShiftLocked = false
      root!.style.setProperty('--hero-shift', `${heroShiftTarget}px`)
    }
  }

  const onScroll = (): void => {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(updateParallax)
  }

  updateParallax()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)

  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    root.style.removeProperty('--listen-scroll-progress')
  }
}
