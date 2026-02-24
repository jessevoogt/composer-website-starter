/**
 * Custom brand animation plugin runtime.
 *
 * Isolated from SiteLayout so generic composer builds can omit it.
 */

document.addEventListener('astro:page-load', () => {
  const brandLink = document.querySelector('[data-brand-link][data-brand-plugin="custom-animation"]')
  if (!(brandLink instanceof HTMLAnchorElement)) return

  const brandEndStateClass = 'brand-end-state'
  const brandHomeIntroStartClass = 'brand-home-intro-start'
  const brandIntroLockedClass = 'brand-intro-locked'
  const brandIntroMeasuringClass = 'brand-intro-measuring'
  const brandIntroMaterializingClass = 'brand-intro-materializing'
  const brandIntroTailHiddenClass = 'brand-intro-tail-hidden'
  const brandIntroPendingClass = 'brand-intro-pending'
  const brandAnimatingClass = 'brand-is-animating'
  const homeIntroAnimatingClass = 'home-intro-animating'
  const brandMenuOpenClass = 'immersive-menu-search-open'
  const currentUrl = new URL(window.location.href)
  const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const isHomepagePath = normalizedPathname === '/'
  const brandIntroLockParam = currentUrl.searchParams.get('brandIntroLock')
  const shouldLockBrandIntro = ['1', 'true', 'yes', 'on'].includes((brandIntroLockParam || '').toLowerCase())
  const brandIntroDebugParam = currentUrl.searchParams.get('brandIntroDebug')
  const shouldDebugBrandIntro = ['1', 'true', 'yes', 'on'].includes((brandIntroDebugParam || '').toLowerCase())
  const brandAnimationDurationMs = 700
  const brandAnimationEndHoldMs = 2000
  // Keep in sync with .hero-action-search-btn intro timing in site.css.
  const homeSearchActionRevealDelayMs = 1480
  const homeHeroActionRevealDurationMs = 640
  const brandIntroBootDelayMs = homeSearchActionRevealDelayMs + homeHeroActionRevealDurationMs
  const brandIntroStartDelayMs = 80
  const brandIntroTransformDelayMs = 280
  const brandIntroTransformDurationMs = 660
  const brandIntroMaterializeDurationMs = 840
  const brandIntroOpacityAfterMaterialize = 0.2
  const brandHashFadeDurationMs = 280
  const brandTopThresholdPx = 2
  const brandScrollTriggerKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'])
  const ensureAtLeast = (value, min) => Math.max(min, value)
  const debugTimestamp = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now().toFixed(1)
    }
    return String(Date.now())
  }
  const toRectSnapshot = (rect) => {
    if (!rect) return null
    return {
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
    }
  }
  const debugBrandIntro = (label, details) => {
    if (!shouldDebugBrandIntro) return
    const prefix = `[brand-intro ${debugTimestamp()}ms] ${label}`
    if (typeof details === 'undefined') {
      console.debug(prefix)
      return
    }
    console.debug(prefix, details)
  }
  const debugBrandIntroVisualState = (label, details) => {
    if (!shouldDebugBrandIntro) return
    const computedStyle = window.getComputedStyle(brandLink)
    debugBrandIntro(label, {
      opacity: computedStyle.opacity,
      filter: computedStyle.filter,
      transform: computedStyle.transform,
      transition: computedStyle.transition,
      introStartOpacityVar: computedStyle.getPropertyValue('--brand-intro-start-opacity').trim(),
      introOpacityDurationVar: computedStyle.getPropertyValue('--brand-intro-opacity-duration').trim(),
      introScaleVar: computedStyle.getPropertyValue('--brand-intro-scale').trim(),
      introShiftXVar: computedStyle.getPropertyValue('--brand-intro-shift-x').trim(),
      introShiftYVar: computedStyle.getPropertyValue('--brand-intro-shift-y').trim(),
      introBlurVar: computedStyle.getPropertyValue('--brand-intro-blur').trim(),
      inlineOpacity: brandLink.style.opacity || '(none)',
      classes: Array.from(brandLink.classList),
      ...details,
    })
  }
  const getBrandScrollTop = () =>
    Math.max(
      window.scrollY || 0,
      window.pageYOffset || 0,
      document.documentElement.scrollTop || 0,
      document.body.scrollTop || 0,
    )
  const isBrandAtTop = () => getBrandScrollTop() <= brandTopThresholdPx
  const getPrefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const setHomeIntroAnimating = (isAnimating) => {
    const shouldAnimate = Boolean(isAnimating) && isHomepagePath && !getPrefersReducedMotion()
    document.documentElement.classList.toggle(homeIntroAnimatingClass, shouldAnimate)
  }
  const clearInitialBrandVisibility = () => {
    if (brandLink.style.visibility === 'hidden') {
      brandLink.style.removeProperty('visibility')
    }
  }
  const clearBrandIntroOpacityPhaseTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandIntroOpacityTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandIntroOpacityPhaseTimer', { timerId })
      window.clearTimeout(timerId)
    }
    delete brandLink.dataset.brandIntroOpacityTimerId
  }
  const scheduleBrandIntroOpacityPhase = (delayMs, opacityValue, durationMs) => {
    debugBrandIntro('scheduleBrandIntroOpacityPhase', {
      delayMs,
      opacityValue,
      durationMs,
    })
    clearBrandIntroOpacityPhaseTimer()
    const timerId = window.setTimeout(() => {
      const currentPathname = window.location.pathname.replace(/\/+$/, '') || '/'
      if (currentPathname !== '/') {
        delete brandLink.dataset.brandIntroOpacityTimerId
        return
      }
      debugBrandIntro('brandIntroOpacityPhaseFired', { timerId, opacityValue, durationMs })
      debugBrandIntroVisualState('brandIntroOpacityPhaseBeforeWrite', {
        timerId,
        opacityValue,
        durationMs,
      })
      brandLink.style.setProperty('--brand-intro-opacity-duration', `${durationMs}ms`)
      brandLink.style.setProperty('--brand-intro-start-opacity', String(opacityValue))
      brandLink.style.setProperty('opacity', String(opacityValue))
      debugBrandIntroVisualState('brandIntroOpacityPhaseAfterWrite', {
        timerId,
        opacityValue,
        durationMs,
      })
      window.requestAnimationFrame(() => {
        const latestPathname = window.location.pathname.replace(/\/+$/, '') || '/'
        if (latestPathname !== '/') return
        debugBrandIntroVisualState('brandIntroOpacityPhaseAfterPaint', {
          timerId,
          opacityValue,
          durationMs,
        })
      })
      delete brandLink.dataset.brandIntroOpacityTimerId
    }, delayMs)
    brandLink.dataset.brandIntroOpacityTimerId = String(timerId)
  }
  const clearBrandIntroPhaseOverrides = () => {
    clearBrandIntroOpacityPhaseTimer()
    brandLink.classList.remove(brandIntroMaterializingClass)
    brandLink.style.removeProperty('--brand-intro-opacity-duration')
    brandLink.style.removeProperty('opacity')
    if (!shouldLockBrandIntro) {
      brandLink.style.removeProperty('--brand-intro-start-opacity')
    }
  }
  const clearBrandHashFadeInlineStyles = () => {
    brandLink.style.removeProperty('transition')
    brandLink.style.removeProperty('opacity')
  }
  const clearBrandHashFadeTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandHashFadeTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandHashFadeTimer', { timerId })
      window.clearTimeout(timerId)
    }
    delete brandLink.dataset.brandHashFadeTimerId
  }
  const stopBrandHashFadeIn = () => {
    clearBrandHashFadeTimer()
    clearBrandHashFadeInlineStyles()
  }
  const startBrandHashFadeIn = () => {
    stopBrandHashFadeIn()
    brandLink.style.setProperty('transition', `opacity ${brandHashFadeDurationMs}ms ease`)
    brandLink.style.setProperty('opacity', '0')
    void brandLink.offsetWidth
    window.requestAnimationFrame(() => {
      const currentPathname = window.location.pathname.replace(/\/+$/, '') || '/'
      if (currentPathname !== '/') return
      brandLink.style.setProperty('opacity', '1')
    })
    const timerId = window.setTimeout(() => {
      debugBrandIntro('hashFadeInCleanup', { timerId })
      clearBrandHashFadeInlineStyles()
      delete brandLink.dataset.brandHashFadeTimerId
    }, brandHashFadeDurationMs + 80)
    brandLink.dataset.brandHashFadeTimerId = String(timerId)
  }
  const clearBrandIntroStartTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandIntroTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandIntroStartTimer', { timerId })
      window.clearTimeout(timerId)
    }
  }
  const scheduleIntroStartReset = (delayMs) => {
    debugBrandIntro('scheduleIntroStartReset', { delayMs })
    clearBrandIntroStartTimer()
    const timerId = window.setTimeout(() => {
      debugBrandIntro('introStartResetFired', { timerId })
      brandLink.classList.remove(brandIntroMeasuringClass)
      brandLink.classList.remove(brandHomeIntroStartClass)
      delete brandLink.dataset.brandIntroTimerId
    }, delayMs)
    brandLink.dataset.brandIntroTimerId = String(timerId)
  }
  const clearBrandAnimationTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandAnimationTimer', { timerId })
      window.clearTimeout(timerId)
    }
  }
  const scheduleBrandStateReset = (delayMs) => {
    debugBrandIntro('scheduleBrandStateReset', { delayMs })
    clearBrandAnimationTimer()
    const timerId = window.setTimeout(() => {
      debugBrandIntro('brandStateResetFired', { timerId })
      brandLink.classList.remove(brandEndStateClass)
      brandLink.classList.remove(brandIntroTailHiddenClass)
      delete brandLink.dataset.brandTimerId
    }, delayMs)
    brandLink.dataset.brandTimerId = String(timerId)
  }
  const clearBrandAnimatingTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandAnimatingTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandAnimatingTimer', { timerId })
      window.clearTimeout(timerId)
    }
  }
  const scheduleBrandAnimatingClear = (delayMs) => {
    debugBrandIntro('scheduleBrandAnimatingClear', { delayMs })
    clearBrandAnimatingTimer()
    const timerId = window.setTimeout(() => {
      debugBrandIntro('brandAnimatingClearFired', { timerId })
      brandLink.classList.remove(brandAnimatingClass)
      clearBrandIntroPhaseOverrides()
      setHomeIntroAnimating(false)
      delete brandLink.dataset.brandAnimatingTimerId
    }, delayMs)
    brandLink.dataset.brandAnimatingTimerId = String(timerId)
  }
  const clearBrandIntroBootTimer = () => {
    const timerId = Number.parseInt(brandLink.dataset.brandIntroBootTimerId || '0', 10)
    if (Number.isFinite(timerId) && timerId > 0) {
      debugBrandIntro('clearBrandIntroBootTimer', { timerId })
      window.clearTimeout(timerId)
    }
  }
  const scheduleBrandIntroBoot = (delayMs, callback) => {
    debugBrandIntro('scheduleBrandIntroBoot', { delayMs })
    clearBrandIntroBootTimer()
    const timerId = window.setTimeout(() => {
      delete brandLink.dataset.brandIntroBootTimerId
      debugBrandIntro('brandIntroBootFired', { timerId })
      callback()
    }, delayMs)
    brandLink.dataset.brandIntroBootTimerId = String(timerId)
  }
  const clearBrandIntroRuntimeState = () => {
    clearBrandIntroBootTimer()
    delete brandLink.dataset.brandIntroBootTimerId
    clearBrandIntroStartTimer()
    delete brandLink.dataset.brandIntroTimerId
    clearBrandAnimationTimer()
    delete brandLink.dataset.brandTimerId
    clearBrandAnimatingTimer()
    delete brandLink.dataset.brandAnimatingTimerId
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()
    brandLink.classList.remove(brandAnimatingClass)
    brandLink.classList.remove(brandIntroMeasuringClass)
    brandLink.classList.remove(brandIntroPendingClass)
    brandLink.classList.remove(brandHomeIntroStartClass)
    brandLink.classList.remove(brandIntroTailHiddenClass)
    clearInitialBrandVisibility()
    setHomeIntroAnimating(false)
  }
  const runBrandEndStateAnimation = ({ keepEndState = false, source = 'unknown' } = {}) => {
    const prefersReducedMotion = getPrefersReducedMotion()
    const brandStateAnimationMs = prefersReducedMotion ? 0 : brandAnimationDurationMs
    const brandAnimationResetDelayMs = prefersReducedMotion ? 0 : brandAnimationDurationMs + brandAnimationEndHoldMs
    const animationClearDelayMs = keepEndState
      ? brandStateAnimationMs
      : prefersReducedMotion
        ? 0
        : brandAnimationDurationMs + brandAnimationEndHoldMs + brandAnimationDurationMs

    debugBrandIntro('brandEndStateAnimation:start', {
      source,
      keepEndState,
      brandStateAnimationMs,
      brandAnimationResetDelayMs,
      animationClearDelayMs,
      classes: Array.from(brandLink.classList),
    })

    clearBrandIntroRuntimeState()
    brandLink.classList.add(brandAnimatingClass)
    scheduleBrandAnimatingClear(animationClearDelayMs)

    brandLink.classList.remove(brandEndStateClass)
    void brandLink.offsetWidth
    brandLink.classList.add(brandEndStateClass)

    if (keepEndState) {
      clearBrandAnimationTimer()
      delete brandLink.dataset.brandTimerId
      return
    }

    scheduleBrandStateReset(brandAnimationResetDelayMs)
  }
  const hasPendingBrandIntroWork = () =>
    document.documentElement.classList.contains(homeIntroAnimatingClass) ||
    brandLink.classList.contains(brandHomeIntroStartClass) ||
    brandLink.classList.contains(brandIntroPendingClass) ||
    brandLink.classList.contains(brandIntroMeasuringClass) ||
    brandLink.classList.contains(brandIntroMaterializingClass) ||
    Boolean(brandLink.dataset.brandIntroBootTimerId) ||
    Boolean(brandLink.dataset.brandIntroTimerId) ||
    Boolean(brandLink.dataset.brandIntroOpacityTimerId)
  const shouldSkipAnyPendingBrandIntro = () => isHomepagePath && !shouldLockBrandIntro && hasPendingBrandIntroWork()
  const completePendingBrandIntro = (source, debugLabel) => {
    if (!shouldSkipAnyPendingBrandIntro()) return false
    const scrollTop = getBrandScrollTop()
    debugBrandIntro(debugLabel, {
      source,
      scrollTop: Number(scrollTop.toFixed(2)),
      classes: Array.from(brandLink.classList),
    })

    clearBrandIntroRuntimeState()
    brandLink.classList.remove(brandEndStateClass)
    return true
  }
  const shouldSkipBrandIntroForScroll = () => shouldSkipAnyPendingBrandIntro() && !isBrandAtTop()
  const skipBrandIntroForScroll = (source) => {
    if (!shouldSkipBrandIntroForScroll()) return false
    return completePendingBrandIntro(source, 'introStart:skipForScroll')
  }
  const skipBrandIntroForInteraction = (source) => completePendingBrandIntro(source, 'introStart:skipForInteraction')
  const scheduleSkipBrandIntroForScroll = (source) => {
    if (!isHomepagePath || shouldLockBrandIntro || !hasPendingBrandIntroWork()) return
    window.requestAnimationFrame(() => {
      skipBrandIntroForScroll(source)
    })
  }
  const scheduleSkipBrandIntroForInteraction = (source) => {
    if (!isHomepagePath || shouldLockBrandIntro || !hasPendingBrandIntroWork()) return
    window.requestAnimationFrame(() => {
      skipBrandIntroForInteraction(source)
    })
  }
  const runAfterLayoutSettles = (callback) => {
    debugBrandIntro('runAfterLayoutSettles:start')
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        debugBrandIntro('runAfterLayoutSettles:callback')
        callback()
      })
    })
  }
  const ensureIntroStartVisualState = ({ keepMeasuringClass = false, includeMaterializeClass = false } = {}) => {
    const hadMeasuringClass = brandLink.classList.contains(brandIntroMeasuringClass)
    if (!hadMeasuringClass) {
      brandLink.classList.add(brandIntroMeasuringClass)
    }

    brandLink.classList.add(brandEndStateClass)
    brandLink.classList.add(brandIntroTailHiddenClass)
    brandLink.classList.add(brandHomeIntroStartClass)
    if (includeMaterializeClass) {
      brandLink.classList.add(brandIntroMaterializingClass)
    } else {
      brandLink.classList.remove(brandIntroMaterializingClass)
    }
    brandLink.classList.remove(brandIntroPendingClass)
    clearInitialBrandVisibility()
    void brandLink.offsetWidth

    if (!hadMeasuringClass && !keepMeasuringClass) {
      brandLink.classList.remove(brandIntroMeasuringClass)
    }
  }
  const setBrandIntroStartGeometry = () => {
    if (!brandLink.classList.contains(brandHomeIntroStartClass)) return

    const imageColumn = document.querySelector('.image-column')
    const imageColumnRect = imageColumn instanceof HTMLElement ? imageColumn.getBoundingClientRect() : null
    const hasImageColumnRect = !!imageColumnRect && imageColumnRect.width > 1 && imageColumnRect.height > 1

    const targetColumnLeft = hasImageColumnRect ? imageColumnRect.left : 0
    const targetColumnWidth = hasImageColumnRect ? imageColumnRect.width : Math.max(window.innerWidth * 0.5, 1)
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight

    const hadMeasuringClass = brandLink.classList.contains(brandIntroMeasuringClass)
    if (!hadMeasuringClass) {
      brandLink.classList.add(brandIntroMeasuringClass)
    }

    const previousVisibility = brandLink.style.visibility
    let baseRect = brandLink.getBoundingClientRect()
    let visibleRect = baseRect

    try {
      brandLink.style.visibility = 'hidden'
      brandLink.classList.remove(brandHomeIntroStartClass)
      void brandLink.offsetWidth
      baseRect = brandLink.getBoundingClientRect()

      const brandInitials = Array.from(brandLink.querySelectorAll('.brand-initial')).filter(
        (node) => node instanceof SVGElement,
      )

      if (brandInitials.length > 0) {
        let minLeft = Number.POSITIVE_INFINITY
        let minTop = Number.POSITIVE_INFINITY
        let maxRight = Number.NEGATIVE_INFINITY
        let maxBottom = Number.NEGATIVE_INFINITY

        for (const initial of brandInitials) {
          const rect = initial.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) continue
          minLeft = Math.min(minLeft, rect.left)
          minTop = Math.min(minTop, rect.top)
          maxRight = Math.max(maxRight, rect.right)
          maxBottom = Math.max(maxBottom, rect.bottom)
        }

        if (
          Number.isFinite(minLeft) &&
          Number.isFinite(minTop) &&
          Number.isFinite(maxRight) &&
          Number.isFinite(maxBottom) &&
          maxRight > minLeft &&
          maxBottom > minTop
        ) {
          visibleRect = {
            left: minLeft,
            top: minTop,
            right: maxRight,
            bottom: maxBottom,
            width: maxRight - minLeft,
            height: maxBottom - minTop,
          }
        }
      }
    } finally {
      brandLink.classList.add(brandHomeIntroStartClass)
      brandLink.style.visibility = previousVisibility
      if (!hadMeasuringClass) {
        brandLink.classList.remove(brandIntroMeasuringClass)
      }
    }

    debugBrandIntro('setBrandIntroStartGeometry:measurements', {
      imageColumnRect: toRectSnapshot(imageColumnRect),
      hasImageColumnRect,
      baseRect: toRectSnapshot(baseRect),
      visibleRect: toRectSnapshot(visibleRect),
      targetColumnLeft: Number(targetColumnLeft.toFixed(2)),
      targetColumnWidth: Number(targetColumnWidth.toFixed(2)),
      viewportHeight: Number(viewportHeight.toFixed(2)),
    })

    if (baseRect.width <= 0 || baseRect.height <= 0 || visibleRect.width <= 0 || visibleRect.height <= 0) return

    const targetCenterX = targetColumnLeft + targetColumnWidth / 2
    const targetCenterY = viewportHeight / 2
    const introScaleMaxByWidth = (targetColumnWidth * 0.92) / visibleRect.width
    const introScaleMaxByHeight = (viewportHeight * 0.82) / visibleRect.height
    const introScale = ensureAtLeast(Math.min(introScaleMaxByWidth, introScaleMaxByHeight), 1)
    const visibleCenterOffsetX = visibleRect.left - baseRect.left + visibleRect.width / 2
    const visibleCenterOffsetY = visibleRect.top - baseRect.top + visibleRect.height / 2
    const introShiftX = targetCenterX - baseRect.left - visibleCenterOffsetX * introScale
    const introShiftY = targetCenterY - baseRect.top - visibleCenterOffsetY * introScale

    brandLink.style.setProperty('--brand-intro-scale', introScale.toFixed(4))
    brandLink.style.setProperty('--brand-intro-shift-x', `${introShiftX.toFixed(2)}px`)
    brandLink.style.setProperty('--brand-intro-shift-y', `${introShiftY.toFixed(2)}px`)

    debugBrandIntro('setBrandIntroStartGeometry:computed', {
      targetCenterX: Number(targetCenterX.toFixed(2)),
      targetCenterY: Number(targetCenterY.toFixed(2)),
      introScaleMaxByWidth: Number(introScaleMaxByWidth.toFixed(4)),
      introScaleMaxByHeight: Number(introScaleMaxByHeight.toFixed(4)),
      introScale: Number(introScale.toFixed(4)),
      visibleCenterOffsetX: Number(visibleCenterOffsetX.toFixed(2)),
      visibleCenterOffsetY: Number(visibleCenterOffsetY.toFixed(2)),
      introShiftX: Number(introShiftX.toFixed(2)),
      introShiftY: Number(introShiftY.toFixed(2)),
    })
  }

  if (shouldLockBrandIntro) {
    brandLink.classList.add(brandIntroLockedClass)
    brandLink.style.setProperty('--brand-intro-start-opacity', '1')
  } else {
    brandLink.classList.remove(brandIntroLockedClass)
    brandLink.style.removeProperty('--brand-intro-start-opacity')
  }

  const prefersReducedMotion = getPrefersReducedMotion()
  const hasIntroStartState = brandLink.classList.contains(brandHomeIntroStartClass)
  const hasBrandEndState = brandLink.classList.contains(brandEndStateClass)
  const hasInitialHash = isHomepagePath && !!currentUrl.hash && currentUrl.hash !== '#' && !shouldLockBrandIntro
  const shouldRunIntroMaterialize = !prefersReducedMotion && !shouldLockBrandIntro
  const shouldRunHomeIntroAnimations =
    isHomepagePath && hasIntroStartState && !hasInitialHash && !shouldLockBrandIntro && !prefersReducedMotion
  const introPhaseTotalMs = brandIntroStartDelayMs + brandIntroTransformDelayMs + brandIntroTransformDurationMs
  const introAnimationTotalMs = prefersReducedMotion ? 0 : introPhaseTotalMs + brandAnimationDurationMs
  setHomeIntroAnimating(shouldRunHomeIntroAnimations)

  debugBrandIntro('init', {
    pathname: normalizedPathname,
    hash: currentUrl.hash,
    isHomepagePath,
    shouldLockBrandIntro,
    prefersReducedMotion,
    hasIntroStartState,
    hasBrandEndState,
    hasInitialHash,
    shouldRunIntroMaterialize,
    shouldRunHomeIntroAnimations,
    classes: Array.from(brandLink.classList),
    brandIntroMaterializeDurationMs,
    brandIntroOpacityAfterMaterialize,
    introPhaseTotalMs,
    introAnimationTotalMs,
  })
  const skippedIntroForScrollAtInit = skipBrandIntroForScroll('init')
  if (skippedIntroForScrollAtInit) {
    setHomeIntroAnimating(false)
    debugBrandIntro('branch:introSkippedForScrollAtInit')
  } else if (hasInitialHash) {
    setHomeIntroAnimating(false)
    debugBrandIntro('branch:hashSkipIntro', {
      hash: currentUrl.hash,
      brandHashFadeDurationMs,
    })
    clearBrandIntroBootTimer()
    delete brandLink.dataset.brandIntroBootTimerId
    clearBrandIntroStartTimer()
    delete brandLink.dataset.brandIntroTimerId
    clearBrandAnimationTimer()
    delete brandLink.dataset.brandTimerId
    clearBrandAnimatingTimer()
    delete brandLink.dataset.brandAnimatingTimerId
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()

    brandLink.classList.remove(brandIntroMeasuringClass)
    brandLink.classList.remove(brandIntroPendingClass)
    brandLink.classList.remove(brandHomeIntroStartClass)
    brandLink.classList.remove(brandIntroTailHiddenClass)
    brandLink.classList.remove(brandEndStateClass)
    brandLink.classList.remove(brandAnimatingClass)
    clearInitialBrandVisibility()

    if (!prefersReducedMotion) {
      startBrandHashFadeIn()
    }
  } else if (isHomepagePath && hasIntroStartState) {
    setHomeIntroAnimating(true)
    stopBrandHashFadeIn()
    const bootDelayMs = prefersReducedMotion ? 0 : brandIntroBootDelayMs
    debugBrandIntro('branch:introStart', { bootDelayMs })
    scheduleBrandIntroBoot(bootDelayMs, () => {
      runAfterLayoutSettles(() => {
        const currentPathname = window.location.pathname.replace(/\/+$/, '') || '/'
        if (currentPathname !== '/') return
        if (skipBrandIntroForScroll('introStart:bootReady')) return

        brandLink.classList.add(brandIntroMeasuringClass)
        setBrandIntroStartGeometry()
        ensureIntroStartVisualState({
          keepMeasuringClass: true,
          includeMaterializeClass: shouldRunIntroMaterialize,
        })
        brandLink.classList.remove(brandIntroPendingClass)

        if (shouldLockBrandIntro) {
          debugBrandIntro('introStart:locked')
          clearBrandIntroStartTimer()
          delete brandLink.dataset.brandIntroTimerId
          clearBrandAnimationTimer()
          delete brandLink.dataset.brandTimerId
          clearBrandAnimatingTimer()
          delete brandLink.dataset.brandAnimatingTimerId
          brandLink.classList.remove(brandAnimatingClass)
          brandLink.classList.remove(brandIntroMeasuringClass)
          clearBrandIntroPhaseOverrides()
          return
        }

        brandLink.classList.add(brandAnimatingClass)
        runAfterLayoutSettles(() => {
          const nextPathname = window.location.pathname.replace(/\/+$/, '') || '/'
          if (nextPathname !== '/') return
          if (skipBrandIntroForScroll('introStart:phase1')) return

          ensureIntroStartVisualState({
            keepMeasuringClass: true,
            includeMaterializeClass: shouldRunIntroMaterialize,
          })
          runAfterLayoutSettles(() => {
            const latestPathname = window.location.pathname.replace(/\/+$/, '') || '/'
            if (latestPathname !== '/') return
            if (skipBrandIntroForScroll('introStart:phase2')) return

            brandLink.classList.remove(brandIntroMeasuringClass)
            void brandLink.offsetWidth

            const introMaterializeDurationMs = shouldRunIntroMaterialize ? brandIntroMaterializeDurationMs : 0
            const introOpacitySecondPhaseDelayMs =
              introMaterializeDurationMs + brandIntroStartDelayMs + brandIntroTransformDelayMs
            const introOpacityDurationAfterMaterializeMs = brandIntroTransformDurationMs
            if (prefersReducedMotion) {
              brandLink.style.setProperty('--brand-intro-opacity-duration', '0ms')
              brandLink.style.setProperty('--brand-intro-start-opacity', '1')
              brandLink.style.setProperty('opacity', '1')
              brandLink.classList.remove(brandIntroMaterializingClass)
            } else if (shouldRunIntroMaterialize) {
              brandLink.style.setProperty('--brand-intro-opacity-duration', `${introMaterializeDurationMs}ms`)
              brandLink.style.setProperty('--brand-intro-start-opacity', String(brandIntroOpacityAfterMaterialize))
              brandLink.style.setProperty('opacity', String(brandIntroOpacityAfterMaterialize))
              brandLink.classList.remove(brandIntroMaterializingClass)
              scheduleBrandIntroOpacityPhase(introOpacitySecondPhaseDelayMs, 1, introOpacityDurationAfterMaterializeMs)
              window.setTimeout(() => {
                const latestPathname = window.location.pathname.replace(/\/+$/, '') || '/'
                if (latestPathname !== '/') return
                debugBrandIntroVisualState('brandIntroBlurPhaseEndSnapshot', {
                  introMaterializeDurationMs,
                  expectedOpacityAtBlurEnd: brandIntroOpacityAfterMaterialize,
                })
              }, introMaterializeDurationMs)
            } else {
              clearBrandIntroPhaseOverrides()
            }

            debugBrandIntro('introStart:phase2')
            debugBrandIntroVisualState('introStart:phase2Style', {
              hasIntroStartClass: brandLink.classList.contains(brandHomeIntroStartClass),
              hasEndStateClass: brandLink.classList.contains(brandEndStateClass),
              hasTailHiddenClass: brandLink.classList.contains(brandIntroTailHiddenClass),
              hasMaterializingClass: brandLink.classList.contains(brandIntroMaterializingClass),
              introMaterializeDurationMs,
              introOpacitySecondPhaseDelayMs,
              introOpacityDurationAfterMaterializeMs,
              brandIntroOpacityAfterMaterialize,
            })
            const introStartResetDelayMs = prefersReducedMotion ? 0 : introOpacitySecondPhaseDelayMs
            scheduleIntroStartReset(introStartResetDelayMs)

            if (brandLink.classList.contains(brandEndStateClass)) {
              const brandExpandDelayMs = prefersReducedMotion ? 0 : introMaterializeDurationMs + introPhaseTotalMs
              debugBrandIntro('introStart:scheduleBrandEndReset', { brandExpandDelayMs })
              scheduleBrandStateReset(brandExpandDelayMs)
            }

            const totalIntroAnimationDelayMs = prefersReducedMotion
              ? 0
              : introMaterializeDurationMs + introAnimationTotalMs
            scheduleBrandAnimatingClear(totalIntroAnimationDelayMs)
          })
        })
      })
    })
  } else {
    setHomeIntroAnimating(false)
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()
    debugBrandIntro('branch:noIntroStart')
    clearBrandIntroBootTimer()
    delete brandLink.dataset.brandIntroBootTimerId
    clearBrandIntroStartTimer()
    delete brandLink.dataset.brandIntroTimerId
    brandLink.classList.remove(brandIntroMeasuringClass)
    if (!shouldLockBrandIntro) {
      brandLink.classList.remove(brandHomeIntroStartClass)
    }
    brandLink.classList.remove(brandIntroPendingClass)
    clearInitialBrandVisibility()
  }

  if (!skippedIntroForScrollAtInit && isHomepagePath && hasBrandEndState && !hasIntroStartState) {
    setHomeIntroAnimating(false)
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()
    brandLink.classList.remove(brandIntroPendingClass)
    clearInitialBrandVisibility()
    debugBrandIntro('branch:brandEndStateOnly')
    if (shouldLockBrandIntro) {
      clearBrandAnimationTimer()
      delete brandLink.dataset.brandTimerId
      clearBrandAnimatingTimer()
      delete brandLink.dataset.brandAnimatingTimerId
      brandLink.classList.remove(brandAnimatingClass)
    } else {
      const brandExpandDelayMs = 0
      scheduleBrandStateReset(brandExpandDelayMs)
      brandLink.classList.add(brandAnimatingClass)
      const brandStateAnimationMs = prefersReducedMotion ? 0 : brandAnimationDurationMs
      debugBrandIntro('brandEndStateOnly:scheduleAnimatingClear', { brandStateAnimationMs })
      scheduleBrandAnimatingClear(brandStateAnimationMs)
    }
  } else if (!isHomepagePath) {
    setHomeIntroAnimating(false)
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()
    debugBrandIntro('branch:notHomepage')
    clearBrandAnimationTimer()
    delete brandLink.dataset.brandTimerId
    if (!shouldLockBrandIntro && !isHomepagePath) {
      brandLink.classList.remove(brandEndStateClass)
      brandLink.classList.remove(brandIntroTailHiddenClass)
    }
  }

  if (!isHomepagePath) {
    setHomeIntroAnimating(false)
    stopBrandHashFadeIn()
    clearBrandIntroPhaseOverrides()
    clearBrandIntroBootTimer()
    delete brandLink.dataset.brandIntroBootTimerId
    clearBrandAnimationTimer()
    delete brandLink.dataset.brandTimerId
    clearBrandAnimatingTimer()
    delete brandLink.dataset.brandAnimatingTimerId
    brandLink.classList.remove(brandAnimatingClass)
    brandLink.classList.remove(brandIntroMeasuringClass)
    brandLink.classList.remove(brandIntroPendingClass)
    brandLink.classList.remove(brandIntroTailHiddenClass)
    clearInitialBrandVisibility()
  }

  document.addEventListener(
    'astro:before-swap',
    () => {
      setHomeIntroAnimating(false)
    },
    { once: true },
  )

  if (brandLink.dataset.brandScrollInterruptBound !== 'true') {
    brandLink.dataset.brandScrollInterruptBound = 'true'
    const isEventInsideHeroContent = (event) => {
      const heroContent = document.querySelector('.hero-content')
      if (!(heroContent instanceof HTMLElement)) return false
      if (typeof event.composedPath === 'function') {
        const eventPath = event.composedPath()
        if (Array.isArray(eventPath) && eventPath.includes(heroContent)) {
          return true
        }
      }
      return event.target instanceof Node && heroContent.contains(event.target)
    }
    const cleanupBrandScrollInterruptListeners = () => {
      window.removeEventListener('scroll', onBrandIntroScroll)
      window.removeEventListener('keydown', onBrandIntroKeydown)
      document.removeEventListener('click', onBrandIntroClick, true)
      document.removeEventListener('focusin', onBrandIntroFocusIn, true)
      delete brandLink.dataset.brandScrollInterruptBound
    }
    const maybeCleanupBrandScrollInterruptListeners = () => {
      if (hasPendingBrandIntroWork()) return
      cleanupBrandScrollInterruptListeners()
    }

    const onBrandIntroScroll = () => {
      skipBrandIntroForScroll('scroll')
      maybeCleanupBrandScrollInterruptListeners()
    }
    const onBrandIntroKeydown = (event) => {
      if (!brandScrollTriggerKeys.has(event.key)) return
      const keyLabel = event.key === ' ' ? 'Space' : event.key
      scheduleSkipBrandIntroForScroll(`keydown:${keyLabel}`)
      window.requestAnimationFrame(maybeCleanupBrandScrollInterruptListeners)
    }
    const onBrandIntroClick = (event) => {
      if (isEventInsideHeroContent(event)) return
      scheduleSkipBrandIntroForInteraction('click:outsideHeroContent')
      window.requestAnimationFrame(maybeCleanupBrandScrollInterruptListeners)
    }
    const onBrandIntroFocusIn = (event) => {
      if (isEventInsideHeroContent(event)) return
      scheduleSkipBrandIntroForInteraction('focusin:outsideHeroContent')
      window.requestAnimationFrame(maybeCleanupBrandScrollInterruptListeners)
    }

    window.addEventListener('scroll', onBrandIntroScroll, { passive: true })
    window.addEventListener('keydown', onBrandIntroKeydown)
    document.addEventListener('click', onBrandIntroClick, true)
    document.addEventListener('focusin', onBrandIntroFocusIn, true)

    document.addEventListener(
      'astro:before-swap',
      () => {
        cleanupBrandScrollInterruptListeners()
      },
      { once: true },
    )
  }

  if (brandLink.dataset.brandMenuStateBound !== 'true') {
    brandLink.dataset.brandMenuStateBound = 'true'
    let wasMenuOpen = document.body.classList.contains(brandMenuOpenClass)

    const syncBrandWithMenuState = (force = false) => {
      if (isHomepagePath && shouldLockBrandIntro) return
      const isMenuOpen = document.body.classList.contains(brandMenuOpenClass)
      if (!force && isMenuOpen === wasMenuOpen) return
      wasMenuOpen = isMenuOpen

      if (isMenuOpen) {
        brandLink.dataset.brandMenuForcingEndState = 'true'
        runBrandEndStateAnimation({ keepEndState: true, source: 'search-open' })
        return
      }

      if (brandLink.dataset.brandMenuForcingEndState !== 'true') return
      delete brandLink.dataset.brandMenuForcingEndState

      clearBrandIntroRuntimeState()
      brandLink.classList.add(brandAnimatingClass)
      brandLink.classList.remove(brandEndStateClass)
      scheduleBrandAnimatingClear(getPrefersReducedMotion() ? 0 : brandAnimationDurationMs)
    }

    const brandMenuStateObserver = new MutationObserver(() => {
      syncBrandWithMenuState()
    })

    brandMenuStateObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    document.addEventListener(
      'astro:before-swap',
      () => {
        brandMenuStateObserver.disconnect()
        delete brandLink.dataset.brandMenuStateBound
      },
      { once: true },
    )

    syncBrandWithMenuState(true)
  }

  if (brandLink.dataset.brandBound === 'true') return
  brandLink.dataset.brandBound = 'true'

  const onBrandClick = (event) => {
    const currentPathname = window.location.pathname.replace(/\/+$/, '') || '/'
    if (currentPathname !== '/') return
    const scrollTop = getBrandScrollTop()
    if (!isBrandAtTop()) {
      debugBrandIntro('click:scrollToTop', {
        currentPathname,
        scrollTop: Number(scrollTop.toFixed(2)),
        hash: window.location.hash,
      })
      skipBrandIntroForScroll('click:scrollToTop')
      event.preventDefault()

      if (window.location.hash) {
        const urlWithoutHash = `${window.location.pathname}${window.location.search}`
        history.replaceState(null, '', urlWithoutHash)
      }

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: getPrefersReducedMotion() ? 'auto' : 'smooth',
      })
      return
    }
    event.preventDefault()

    debugBrandIntro('click:start', {
      currentPathname,
      scrollTop: Number(scrollTop.toFixed(2)),
      classes: Array.from(brandLink.classList),
    })
    runBrandEndStateAnimation({ source: 'click' })
  }

  brandLink.addEventListener('click', onBrandClick)
})
