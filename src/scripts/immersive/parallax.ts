/**
 * Scroll-driven parallax effects for the immersive hero and listen sections.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const MOBILE_BREAKPOINT_PX = 58 * 16
const LISTEN_DRIFT_INTERPOLATION = 0.08

export function initParallax(): () => void {
  const root = document.querySelector<HTMLElement>('[data-immersive-root]')
  const hero = document.querySelector<HTMLElement>('[data-parallax-hero]')
  const siteHeader = document.querySelector<HTMLElement>('.site-header')
  const imageColumn = document.querySelector<HTMLElement>('.image-column')
  const listenSection = document.querySelector<HTMLElement>('.listen-section')
  const listenFigure = document.querySelector<HTMLElement>('[data-parallax-listen]')
  const listenBleed = document.querySelector<HTMLElement>('.listen-bleed')

  if (!root || !hero) return () => {}

  let ticking = false
  let heroShiftLockValue = 0
  let heroShiftLocked = false
  let listenDriftAnimationFrame = 0
  let listenDriftCurrent = 0
  let listenDriftTarget = 0
  let hasListenDriftCurrent = false
  let listenDriftEmphasized = false
  let listenDriftReturning = false

  function applyListenDrift(value: number): void {
    root!.style.setProperty('--listen-drift-x', `${value}px`)
  }

  function stopListenDriftAnimation(): void {
    if (!listenDriftAnimationFrame) return
    window.cancelAnimationFrame(listenDriftAnimationFrame)
    listenDriftAnimationFrame = 0
  }

  function stepListenDriftAnimation(): void {
    listenDriftAnimationFrame = 0
    const delta = listenDriftTarget - listenDriftCurrent
    const done = Math.abs(delta) <= 0.35

    if (done) {
      listenDriftCurrent = listenDriftTarget
      applyListenDrift(listenDriftCurrent)
      if (!listenDriftEmphasized) {
        listenDriftReturning = false
      }
      return
    }

    listenDriftCurrent += delta * LISTEN_DRIFT_INTERPOLATION
    applyListenDrift(listenDriftCurrent)
    listenDriftAnimationFrame = window.requestAnimationFrame(stepListenDriftAnimation)
  }

  function syncListenDrift(target: number, animate: boolean): void {
    listenDriftTarget = target

    if (!hasListenDriftCurrent) {
      listenDriftCurrent = target
      hasListenDriftCurrent = true
      applyListenDrift(listenDriftCurrent)
      return
    }

    if (!animate) {
      stopListenDriftAnimation()
      listenDriftCurrent = target
      applyListenDrift(listenDriftCurrent)
      listenDriftReturning = false
      return
    }

    if (Math.abs(listenDriftTarget - listenDriftCurrent) <= 0.35) {
      listenDriftCurrent = listenDriftTarget
      applyListenDrift(listenDriftCurrent)
      if (!listenDriftEmphasized) {
        listenDriftReturning = false
      }
      return
    }

    if (!listenDriftAnimationFrame) {
      listenDriftAnimationFrame = window.requestAnimationFrame(stepListenDriftAnimation)
    }
  }

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
      const driftStart = 0.12
      const driftRaw = listenProgress <= driftStart ? 0 : (listenProgress - driftStart) / (1 - driftStart)
      const driftEase = driftRaw * driftRaw * (3 - 2 * driftRaw)
      const fadeOutRange = Math.max(1, sectionRect.height * 0.5)
      const fadeOutProgress = clamp(sectionRect.bottom / fadeOutRange, 0, 1)
      const fadeOutEase = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress)
      const listenReveal = driftEase * fadeOutEase
      const driftOffsetProgress = 1 - driftEase
      const driftOffsetEased = 1 - Math.pow(1 - driftOffsetProgress, 1.2)
      const leftShade = driftEase
      const viewportWidth = window.innerWidth || 0
      const driftStartViewportRatio = 0.25
      const maxDrift = viewportWidth < MOBILE_BREAKPOINT_PX ? 0 : viewportWidth * driftStartViewportRatio
      const driftX = driftOffsetEased * maxDrift
      const driftLocked = listenProgress >= 1
      const isInteractive =
        listenSection.matches(':hover') ||
        listenSection.matches(':focus-within') ||
        listenSection.classList.contains('has-player-playing')
      if (isInteractive !== listenDriftEmphasized) {
        listenDriftEmphasized = isInteractive
        if (!isInteractive) {
          listenDriftReturning = true
        }
      }

      shouldLockHeroShift = driftLocked

      root!.style.setProperty('--section-diverge', driftEase.toFixed(3))
      root!.style.setProperty('--listen-fade-out-progress', fadeOutEase.toFixed(3))
      root!.style.setProperty('--listen-reveal-progress', listenReveal.toFixed(3))
      root!.style.setProperty('--listen-left-shade', leftShade.toFixed(3))
      const driftTarget = listenDriftEmphasized ? 0 : driftX
      const shouldAnimateDrift = listenDriftEmphasized || listenDriftReturning
      syncListenDrift(driftTarget, shouldAnimateDrift)
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

    if (listenBleed) {
      if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
        root!.style.setProperty('--listen-left', '0px')
      } else if (hero?.dataset.heroLayout === 'columns' && imageColumn) {
        const columnRect = imageColumn.getBoundingClientRect()
        const splitX = hero.dataset.heroImagePosition === 'right' ? columnRect.left : columnRect.right
        root!.style.setProperty('--listen-left', `${splitX - 1}px`)
      } else {
        const defaultListenLeft = root!.style.getPropertyValue('--stage-width').trim() || 'min(41vw, 46rem)'
        root!.style.setProperty('--listen-left', defaultListenLeft)
      }
    }
  }

  const onScroll = (): void => {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(updateParallax)
  }

  const onListenInteractionStateChange = (): void => {
    onScroll()
  }

  updateParallax()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  listenSection?.addEventListener('pointerenter', onListenInteractionStateChange)
  listenSection?.addEventListener('pointerleave', onListenInteractionStateChange)
  listenSection?.addEventListener('focusin', onListenInteractionStateChange)
  listenSection?.addEventListener('focusout', onListenInteractionStateChange)
  listenSection?.addEventListener('playerstatechange', onListenInteractionStateChange)

  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    listenSection?.removeEventListener('pointerenter', onListenInteractionStateChange)
    listenSection?.removeEventListener('pointerleave', onListenInteractionStateChange)
    listenSection?.removeEventListener('focusin', onListenInteractionStateChange)
    listenSection?.removeEventListener('focusout', onListenInteractionStateChange)
    listenSection?.removeEventListener('playerstatechange', onListenInteractionStateChange)
    stopListenDriftAnimation()
    root.style.removeProperty('--listen-scroll-progress')
  }
}
