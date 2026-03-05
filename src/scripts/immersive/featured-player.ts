/**
 * Featured recording audio player with play/pause, mute, seek, track cycling, and time display.
 */

import { normalizeMediaSrc } from '@/utils/immersive-helpers'
import { focusElement } from '../focus-policy'
import { trackAnalyticsEvent } from '../analytics-events'

interface FeaturedRecording {
  key: string
  workId: string
  workHref: string
  perusalScoreHref?: string
  title: string
  performer: string
  instrumentation: string
  date: string
  imageSrc: string
  imageAlt: string
  imagePosition: string
  mp3: string
}

type TrackCycleDirection = 'previous' | 'next'
type FeaturedImageTransitionTarget = Pick<FeaturedRecording, 'imageSrc' | 'imagePosition'>

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function asMetaText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asDataText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toComparableMediaSrc(value: string | null | undefined): string {
  if (!value) return ''
  try {
    const parsed = new URL(value, window.location.href)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return normalizeMediaSrc(value)
  }
}

function parseFeaturedRecordings(): FeaturedRecording[] {
  const dataScript = document.querySelector<HTMLScriptElement>('[data-featured-recordings-data]')
  if (!dataScript?.textContent) return []

  try {
    const parsed = JSON.parse(dataScript.textContent)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry): FeaturedRecording | null => {
        if (!entry || typeof entry !== 'object') return null
        const row = entry as Record<string, unknown>
        const key = asDataText(row.key)
        const mp3 = asDataText(row.mp3)
        if (!key || !mp3) return null
        const perusalScoreHref = asDataText(row.perusalScoreHref)
        return {
          key,
          workId: asDataText(row.workId),
          workHref: asDataText(row.workHref),
          ...(perusalScoreHref ? { perusalScoreHref } : {}),
          title: asDataText(row.title),
          performer: asDataText(row.performer),
          instrumentation: asDataText(row.instrumentation),
          date: asDataText(row.date),
          imageSrc: asDataText(row.imageSrc),
          imageAlt: asDataText(row.imageAlt),
          imagePosition: asDataText(row.imagePosition),
          mp3,
        }
      })
      .filter((entry): entry is FeaturedRecording => entry !== null)
  } catch {
    return []
  }
}

function getScrollPaddingTop(): number {
  const scrollPaddingTop = window.getComputedStyle(document.documentElement).scrollPaddingTop
  const parsed = Number.parseFloat(scrollPaddingTop)
  return Number.isFinite(parsed) ? parsed : 0
}

function isSectionAligned(section: HTMLElement): boolean {
  return Math.abs(section.getBoundingClientRect().top - getScrollPaddingTop()) <= 4
}

function waitForScrollSettle(section: HTMLElement): Promise<boolean> {
  const timeoutMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 2600
  const settledFramesNeeded = 4

  return new Promise((resolve) => {
    const startedAt = performance.now()
    let previousScrollY = window.scrollY
    let settledFrames = 0

    const tick = (): void => {
      const moved = Math.abs(window.scrollY - previousScrollY) > 0.5
      const aligned = isSectionAligned(section)
      previousScrollY = window.scrollY

      if (aligned && !moved) {
        settledFrames += 1
      } else {
        settledFrames = 0
      }

      if (settledFrames >= settledFramesNeeded) {
        resolve(true)
        return
      }

      if (performance.now() - startedAt >= timeoutMs) {
        resolve(aligned)
        return
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })
}

export function initFeaturedPlayer(): () => void {
  const listenSection = document.querySelector<HTMLElement>('.listen-section')
  const listenTrigger = document.querySelector<HTMLButtonElement>('[data-listen-trigger]')
  const heroListenTrigger = document.querySelector<HTMLAnchorElement>('a.hero-action-listen-btn[href="#listen"]')
  const featuredPlayerDock = document.querySelector<HTMLElement>('[data-featured-player-dock]')
  const featuredPlayerShell = document.querySelector<HTMLElement>('[data-featured-player-shell]')
  const featuredPlayer = document.querySelector<HTMLAudioElement>('[data-featured-player]')
  const featuredSource = featuredPlayer?.querySelector<HTMLSourceElement>('[data-featured-source]') ?? null
  const featuredToggle = document.querySelector<HTMLButtonElement>('[data-featured-toggle]')
  const fixedBarToggle = document.querySelector<HTMLButtonElement>('[data-fixed-bar-toggle]')
  const featuredPrev = document.querySelector<HTMLButtonElement>('[data-featured-prev]')
  const fixedBarPrev = document.querySelector<HTMLButtonElement>('[data-fixed-bar-prev]')
  const featuredNext = document.querySelector<HTMLButtonElement>('[data-featured-next]')
  const fixedBarNext = document.querySelector<HTMLButtonElement>('[data-fixed-bar-next]')
  const listenPrev = document.querySelector<HTMLButtonElement>('[data-listen-prev]')
  const listenNext = document.querySelector<HTMLButtonElement>('[data-listen-next]')
  const featuredMute = document.querySelector<HTMLButtonElement>('[data-featured-mute]')
  const fixedBarMute = document.querySelector<HTMLButtonElement>('[data-fixed-bar-mute]')
  const fixedBarVolume = document.querySelector<HTMLInputElement>('[data-fixed-bar-volume]')
  const featuredSeek = document.querySelector<HTMLInputElement>('[data-featured-seek]')
  const featuredTimeCurrent = document.querySelector<HTMLElement>('[data-featured-time-current]')
  const featuredTimeTotal = document.querySelector<HTMLElement>('[data-featured-time-total]')
  const bleedPause = document.querySelector<HTMLButtonElement>('[data-bleed-pause]')
  const fixedBar = document.querySelector<HTMLElement>('[data-fixed-player-bar]')
  const fixedBarControls = fixedBar?.querySelector<HTMLElement>('.fixed-player-bar-controls') ?? null
  const fixedBarMarquee = fixedBar?.querySelector<HTMLElement>('[data-fixed-bar-marquee]') ?? null
  const fixedBarMarqueeContent = fixedBar?.querySelector<HTMLElement>('[data-fixed-bar-marquee-content]') ?? null
  const fixedBarLinkIcon = fixedBar?.querySelector<HTMLAnchorElement>('[data-fixed-bar-link-icon]') ?? null
  const featuredImage = document.querySelector<HTMLImageElement>('[data-featured-image]')
  const listenFigure = document.querySelector<HTMLElement>('[data-parallax-listen]')
  const featuredMeta = document.querySelector<HTMLElement>('[data-featured-meta]')
  const featuredMetaTitle = document.querySelector<HTMLElement>('[data-featured-meta-title]')
  const featuredMetaPerformer = document.querySelector<HTMLElement>('[data-featured-meta-performer]')
  const featuredMetaDate = document.querySelector<HTMLElement>('[data-featured-meta-date]')
  const featuredWorkLink = document.querySelector<HTMLAnchorElement>('[data-featured-work-link]')
  const featuredScoreLink = document.querySelector<HTMLAnchorElement>('[data-featured-score-link]')
  const featuredSectionTitle = document.querySelector<HTMLElement>('[data-featured-section-title]')
  const isPerusalScorePage = document.body.classList.contains('perusal-score-body')

  if (isPerusalScorePage) {
    featuredPlayer?.pause()
    if (featuredPlayer) {
      featuredPlayer.currentTime = 0
    }
    featuredPlayerShell?.setAttribute('hidden', '')
    fixedBar?.setAttribute('hidden', '')
    document.documentElement.classList.remove(
      'has-fixed-player',
      'home-player-deferred',
      'has-fixed-player-reveal-done',
    )
    return () => {}
  }

  if (
    !featuredPlayerShell ||
    !featuredPlayer ||
    !featuredToggle ||
    !featuredMute ||
    !featuredSeek ||
    !featuredTimeCurrent ||
    !featuredTimeTotal ||
    !fixedBar ||
    !fixedBarControls
  ) {
    return () => {}
  }

  // Re-bind guarded elements so TypeScript narrows them in closures
  const playerShell: HTMLElement = featuredPlayerShell
  const player: HTMLAudioElement = featuredPlayer
  const playerSeek: HTMLInputElement = featuredSeek
  const playerTimeCurrent: HTMLElement = featuredTimeCurrent
  const playerTimeTotal: HTMLElement = featuredTimeTotal
  const playerBar: HTMLElement = fixedBar
  const playerBarControls: HTMLElement = fixedBarControls
  const playerToggleButtons = [featuredToggle, fixedBarToggle].filter(
    (button): button is HTMLButtonElement => button !== null,
  )
  const trackPrevButtons = [featuredPrev, fixedBarPrev, listenPrev].filter(
    (button): button is HTMLButtonElement => button !== null,
  )
  const trackNextButtons = [featuredNext, fixedBarNext, listenNext].filter(
    (button): button is HTMLButtonElement => button !== null,
  )
  const playerMuteButtons = [featuredMute, fixedBarMute].filter(
    (button): button is HTMLButtonElement => button !== null,
  )
  const fixedBarLinks = [fixedBarLinkIcon].filter(
    (link): link is HTMLAnchorElement => link !== null,
  )

  const featuredRecordings = parseFeaturedRecordings()
  const inlineParent = featuredPlayerDock ?? playerShell.parentElement

  if (
    inlineParent &&
    playerShell.parentElement !== playerBarControls &&
    playerShell.parentElement !== inlineParent
  ) {
    inlineParent.appendChild(playerShell)
  }

  let isSeeking = false
  let activeSeekTouchId: number | null = null
  let isPendingHeroScrollPlayback = false
  let lastTrackedSeekAt = 0
  let isFixedBarOpen = !playerBar.hidden || playerShell.parentElement === playerBarControls
  let currentRecordingIndex = -1
  let resizeFrame = 0
  let activeListenSwipePointerId: number | null = null
  let listenSwipeStartX = 0
  let listenSwipeStartY = 0
  let isListenSwipeGestureHorizontal = false
  let suppressNextListenFigureClick = false
  let clearListenFigureClickSuppressionFrame = 0
  let activeImageTransitionLayer: HTMLElement | null = null
  let activeImageTransitionOutgoingLayer: HTMLElement | null = null
  let activeImageTransitionAnimation: Animation | null = null
  let activeImageTransitionDirection: TrackCycleDirection | null = null
  let activeImageTransitionTargetSrc = ''
  let activeImageTransitionProgress = 0
  const preloadedFeaturedImageKeys = new Set<string>()
  const recordingAvailabilityBySrc = new Map<string, boolean>()
  let revealDoneFrame = 0
  let revealDoneTimer = 0
  let lastPlayerPlayingState: boolean | null = null
  let lastNonZeroVolume = Math.min(Math.max(player.volume, 0), 1)
  if (lastNonZeroVolume <= 0) {
    lastNonZeroVolume = 1
  }
  const fixedPlayerRevealDoneClass = 'has-fixed-player-reveal-done'
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarsePointerMediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
  const mobileTapBounceClass = 'is-mobile-tap-bounce'
  const listenSwipeActivationDistancePx = 56
  const listenSwipeScrollLockDistancePx = 18
  const listenSwipePreviewMaxProgress = 0.88
  const listenSwipePreviewDistanceFactor = 0.72

  /* ---- Home player deferral (hide bar until scroll on mobile/tablet) ---- */
  const homePlayerDeferredClass = 'home-player-deferred'
  const deferMediaQuery = window.matchMedia(
    '(max-width: 68.75rem) and (orientation: portrait), (max-height: 35.75rem) and (orientation: landscape)',
  )
  let deferralScrollHandler: (() => void) | null = null
  let deferralDismissed = false

  function shouldDeferPlayerOnHome(): boolean {
    return (
      !deferralDismissed &&
      document.documentElement.getAttribute('data-page') === 'home' &&
      !hasRevealAnimationCompleted() &&
      deferMediaQuery.matches
    )
  }

  function clearHomeDeferral(): void {
    deferralDismissed = true
    document.documentElement.classList.remove(homePlayerDeferredClass)
    if (deferralScrollHandler) {
      window.removeEventListener('scroll', deferralScrollHandler)
      deferralScrollHandler = null
    }
  }

  function setupHomeDeferral(): void {
    if (deferralDismissed) return
    if (document.documentElement.classList.contains(homePlayerDeferredClass)) return
    document.documentElement.classList.add(homePlayerDeferredClass)

    const onScroll = (): void => {
      clearHomeDeferral()
    }
    deferralScrollHandler = onScroll
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  function hasRevealAnimationCompleted(): boolean {
    return playerBar.dataset.fixedPlayerRevealDone === 'true'
  }

  function syncRevealAnimationClass(): void {
    document.documentElement.classList.toggle(fixedPlayerRevealDoneClass, hasRevealAnimationCompleted())
  }

  function isHomeIntroAnimating(): boolean {
    return (
      document.documentElement.getAttribute('data-page') === 'home' &&
      document.documentElement.classList.contains('home-intro-animating')
    )
  }

  function isHomePlayerDeferred(): boolean {
    return document.documentElement.classList.contains(homePlayerDeferredClass)
  }

  function markRevealAnimationCompleted(): void {
    if (hasRevealAnimationCompleted()) return
    playerBar.dataset.fixedPlayerRevealDone = 'true'
    syncRevealAnimationClass()
  }

  function clearRevealDoneWatcher(): void {
    if (revealDoneFrame) {
      window.cancelAnimationFrame(revealDoneFrame)
      revealDoneFrame = 0
    }
    if (revealDoneTimer) {
      window.clearTimeout(revealDoneTimer)
      revealDoneTimer = 0
    }
  }

  function watchForFirstRevealCompletion(): void {
    if (hasRevealAnimationCompleted() || revealDoneFrame || revealDoneTimer) return

    const tick = (): void => {
      const isVisible =
        !playerBar.hidden &&
        document.documentElement.classList.contains('has-fixed-player') &&
        !isHomeIntroAnimating() &&
        !isHomePlayerDeferred()

      if (isVisible) {
        revealDoneFrame = 0
        if (prefersReducedMotion.matches) {
          markRevealAnimationCompleted()
          return
        }

        const revealDelay = deferMediaQuery.matches ? 1600 : 340
        revealDoneTimer = window.setTimeout(() => {
          revealDoneTimer = 0
          const stillVisible =
            !playerBar.hidden &&
            document.documentElement.classList.contains('has-fixed-player') &&
            !isHomeIntroAnimating() &&
            !isHomePlayerDeferred()
          if (stillVisible) {
            markRevealAnimationCompleted()
          }
        }, revealDelay)
        return
      }

      revealDoneFrame = window.requestAnimationFrame(tick)
    }

    revealDoneFrame = window.requestAnimationFrame(tick)
  }

  syncRevealAnimationClass()

  function moveShellToInlineParent(): void {
    if (!inlineParent) return
    if (playerShell.parentElement !== inlineParent) {
      inlineParent.appendChild(playerShell)
    }
  }

  function openFeaturedPlayer(): void {
    if (!isFixedBarOpen) {
      moveShellToInlineParent()
    }
    playerShell.hidden = false
  }

  function animateMobileListenBleedTapBounce(target: HTMLElement | null): void {
    if (!target) return
    if (!coarsePointerMediaQuery.matches || prefersReducedMotion.matches) return

    target.classList.remove(mobileTapBounceClass)
    void target.offsetWidth
    target.classList.add(mobileTapBounceClass)
    target.addEventListener(
      'animationend',
      () => {
        target.classList.remove(mobileTapBounceClass)
      },
      { once: true },
    )
  }

  function getActiveRecording(): FeaturedRecording | null {
    if (currentRecordingIndex < 0 || currentRecordingIndex >= featuredRecordings.length) return null
    return featuredRecordings[currentRecordingIndex]!
  }

  function trackFeaturedInteraction(
    action: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): void {
    const activeRecording = getActiveRecording()
    trackAnalyticsEvent('featured_player_interaction', {
      action,
      recording_key: activeRecording?.key,
      recording_title: activeRecording?.title,
      recording_work_id: activeRecording?.workId,
      ...params,
    })
  }

  function updateMarqueeOverflow(): void {
    if (!fixedBarMarquee || !fixedBarMarqueeContent) return
    const containerWidth = fixedBarMarquee.clientWidth
    const contentWidth = fixedBarMarqueeContent.scrollWidth
    const isOverflowing = contentWidth > containerWidth + 2
    fixedBarMarquee.classList.toggle('is-overflowing', isOverflowing)
    if (isOverflowing) {
      fixedBarMarquee.style.setProperty('--marquee-distance', `${-(contentWidth - containerWidth + 16)}px`)
      return
    }

    fixedBarMarquee.style.removeProperty('--marquee-distance')
    resetMarqueeToStart()
  }

  function resetMarqueeToStart(): void {
    if (!fixedBarMarqueeContent) return
    fixedBarMarqueeContent.style.animation = 'none'
    fixedBarMarqueeContent.style.transform = 'translateX(0)'
    void fixedBarMarqueeContent.offsetWidth
    fixedBarMarqueeContent.style.removeProperty('animation')
  }

  function syncTrackNavigationButtons(): void {
    const hasMultiple = featuredRecordings.length > 1
    for (const prevButton of trackPrevButtons) {
      prevButton.hidden = !hasMultiple
      prevButton.disabled = !hasMultiple
    }
    for (const nextButton of trackNextButtons) {
      nextButton.hidden = !hasMultiple
      nextButton.disabled = !hasMultiple
    }

    if (!hasMultiple || currentRecordingIndex < 0) return

    const previousRecording = featuredRecordings[
      (currentRecordingIndex - 1 + featuredRecordings.length) % featuredRecordings.length
    ]
    const nextRecording = featuredRecordings[(currentRecordingIndex + 1) % featuredRecordings.length]
    const previousLabel = `Previous featured recording${previousRecording?.title ? `: ${previousRecording.title}` : ''}`
    const nextLabel = `Next featured recording${nextRecording?.title ? `: ${nextRecording.title}` : ''}`
    for (const prevButton of trackPrevButtons) {
      prevButton.setAttribute('aria-label', previousLabel)
    }
    for (const nextButton of trackNextButtons) {
      nextButton.setAttribute('aria-label', nextLabel)
    }
  }

  function syncFeaturedSectionTitle(recordingKey: string): void {
    if (!featuredSectionTitle) return

    const defaultTitle =
      asMetaText(featuredSectionTitle.getAttribute('data-featured-section-default-title')) ||
      'Featured Recording'
    const activeTitle =
      asMetaText(featuredSectionTitle.getAttribute('data-featured-section-active-title')) ||
      'Currently Playing'
    const defaultRecordingKey = asMetaText(
      featuredSectionTitle.getAttribute('data-featured-default-recording-key'),
    )
    const isDefaultRecording = !defaultRecordingKey || recordingKey === defaultRecordingKey
    featuredSectionTitle.textContent = isDefaultRecording ? defaultTitle : activeTitle
  }

  function markSourceDirty(isDirty: boolean): void {
    if (isDirty) {
      player.dataset.featuredSourceDirty = 'true'
      return
    }
    delete player.dataset.featuredSourceDirty
  }

  function preparePlaybackSource(): void {
    if (player.dataset.featuredSourceDirty !== 'true') return
    player.load()
    markSourceDirty(false)
  }

  async function audioSourceExists(source: string): Promise<boolean> {
    const normalizedSource = normalizeMediaSrc(source)
    if (!normalizedSource) return false

    const comparableSource = toComparableMediaSrc(normalizedSource) || normalizedSource
    const cached = recordingAvailabilityBySrc.get(comparableSource)
    if (typeof cached === 'boolean') return cached

    let exists = false
    try {
      const response = await fetch(normalizedSource, { method: 'HEAD', cache: 'no-store' })
      exists = response.ok
    } catch {
      exists = false
    }

    recordingAvailabilityBySrc.set(comparableSource, exists)
    return exists
  }

  async function isRecordingIndexAvailable(index: number): Promise<boolean> {
    if (index < 0 || index >= featuredRecordings.length) return false
    const recording = featuredRecordings[index]
    if (!recording) return false
    return audioSourceExists(recording.mp3)
  }

  async function resolvePlayableRecordingIndex(startIndex: number, step: number): Promise<number> {
    if (featuredRecordings.length === 0 || startIndex < 0) return -1
    const normalizedStep = step < 0 ? -1 : 1
    const total = featuredRecordings.length

    for (let offset = 0; offset < total; offset += 1) {
      const index = ((startIndex + offset * normalizedStep) % total + total) % total
      if (await isRecordingIndexAvailable(index)) {
        return index
      }
    }

    return -1
  }

  function preloadRecordingImage(imageSrc: string | null | undefined): void {
    if (!imageSrc) return
    const imageKey = toComparableMediaSrc(imageSrc)
    if (!imageKey || preloadedFeaturedImageKeys.has(imageKey)) return

    const preloader = new Image()
    preloader.decoding = 'async'
    preloader.src = imageSrc
    preloadedFeaturedImageKeys.add(imageKey)
  }

  function preloadNeighborRecordingImages(centerIndex: number): void {
    const total = featuredRecordings.length
    if (total <= 1) return
    const previousRecording = featuredRecordings[(centerIndex - 1 + total) % total]
    const nextRecording = featuredRecordings[(centerIndex + 1) % total]
    preloadRecordingImage(previousRecording?.imageSrc)
    preloadRecordingImage(nextRecording?.imageSrc)
  }

  function clearFeaturedImageTransition(): void {
    const animation = activeImageTransitionAnimation
    const layer = activeImageTransitionLayer
    activeImageTransitionAnimation = null
    activeImageTransitionLayer = null
    activeImageTransitionOutgoingLayer = null
    activeImageTransitionDirection = null
    activeImageTransitionTargetSrc = ''
    activeImageTransitionProgress = 0
    animation?.cancel()
    layer?.remove()
  }

  function getFeaturedImageTransitionTransform(direction: TrackCycleDirection, progress: number): string {
    const distance = Math.max(0, Math.min(progress, 1)) * 100
    const signedDistance = direction === 'next' ? -distance : distance
    return `translate3d(${signedDistance}%, 0, 0)`
  }

  function getFeaturedImageTransitionOpacity(progress: number): number {
    return Math.max(0, Math.min(1, 1 - Math.max(0, Math.min(progress, 1))))
  }

  function ensureFeaturedImageTransitionLayer(
    direction: TrackCycleDirection,
    target: FeaturedImageTransitionTarget | null = null,
  ): HTMLElement | null {
    if (!featuredImage || !listenFigure) return null
    const targetComparableSrc = toComparableMediaSrc(target?.imageSrc)
    if (
      activeImageTransitionLayer &&
      activeImageTransitionOutgoingLayer &&
      activeImageTransitionDirection === direction &&
      activeImageTransitionTargetSrc === targetComparableSrc &&
      activeImageTransitionLayer.isConnected
    ) {
      return activeImageTransitionOutgoingLayer
    }

    clearFeaturedImageTransition()

    const computedStyles = window.getComputedStyle(featuredImage)

    const layer = document.createElement('span')
    layer.className = 'listen-bleed-transition-layer'
    layer.setAttribute('aria-hidden', 'true')

    if (target?.imageSrc) {
      const incomingImage = featuredImage.cloneNode(true) as HTMLImageElement
      incomingImage.removeAttribute('data-featured-image')
      incomingImage.classList.add('listen-bleed-transition-image', 'listen-bleed-transition-image-incoming')
      incomingImage.setAttribute('aria-hidden', 'true')
      incomingImage.style.position = 'absolute'
      incomingImage.style.inset = '0'
      incomingImage.style.zIndex = '0'
      incomingImage.style.opacity = '1'
      incomingImage.style.objectPosition = target.imagePosition || computedStyles.objectPosition
      incomingImage.src = target.imageSrc
      layer.append(incomingImage)
    }

    const outgoingImage = featuredImage.cloneNode(true) as HTMLImageElement
    outgoingImage.removeAttribute('data-featured-image')
    outgoingImage.classList.add('listen-bleed-transition-image', 'listen-bleed-transition-image-outgoing')
    outgoingImage.setAttribute('aria-hidden', 'true')
    outgoingImage.style.position = 'absolute'
    outgoingImage.style.inset = '0'
    outgoingImage.style.zIndex = '1'
    outgoingImage.style.objectPosition = computedStyles.objectPosition
    outgoingImage.style.opacity = computedStyles.opacity
    const outgoingLayer = document.createElement('span')
    outgoingLayer.style.position = 'absolute'
    outgoingLayer.style.inset = '0'
    outgoingLayer.style.zIndex = '1'
    outgoingLayer.style.pointerEvents = 'none'
    outgoingLayer.style.transform = getFeaturedImageTransitionTransform(direction, 0)
    outgoingLayer.style.opacity = `${getFeaturedImageTransitionOpacity(0)}`
    outgoingLayer.append(outgoingImage)
    layer.append(outgoingLayer)

    listenFigure.append(layer)

    activeImageTransitionLayer = layer
    activeImageTransitionOutgoingLayer = outgoingLayer
    activeImageTransitionDirection = direction
    activeImageTransitionTargetSrc = targetComparableSrc
    activeImageTransitionProgress = 0

    return outgoingLayer
  }

  function previewFeaturedImageTransition(
    direction: TrackCycleDirection,
    progress: number,
    target: FeaturedImageTransitionTarget | null = null,
  ): void {
    if (prefersReducedMotion.matches) return

    const clampedProgress = Math.max(0, Math.min(progress, listenSwipePreviewMaxProgress))
    if (clampedProgress <= 0) {
      clearFeaturedImageTransition()
      return
    }

    const outgoingLayer = ensureFeaturedImageTransitionLayer(direction, target)
    if (!outgoingLayer) return

    const runningAnimation = activeImageTransitionAnimation
    if (runningAnimation) {
      activeImageTransitionAnimation = null
      runningAnimation.cancel()
    }

    outgoingLayer.style.transform = getFeaturedImageTransitionTransform(direction, clampedProgress)
    outgoingLayer.style.opacity = `${getFeaturedImageTransitionOpacity(clampedProgress)}`
    activeImageTransitionProgress = clampedProgress
  }

  function revertFeaturedImageTransitionPreview(): void {
    const outgoingLayer = activeImageTransitionOutgoingLayer
    const direction = activeImageTransitionDirection
    const startProgress = activeImageTransitionProgress
    if (!outgoingLayer || !direction || startProgress <= 0) {
      clearFeaturedImageTransition()
      return
    }

    if (prefersReducedMotion.matches) {
      clearFeaturedImageTransition()
      return
    }

    const runningAnimation = activeImageTransitionAnimation
    if (runningAnimation) {
      activeImageTransitionAnimation = null
      runningAnimation.cancel()
    }

    const animation = outgoingLayer.animate(
      [
        {
          transform: getFeaturedImageTransitionTransform(direction, startProgress),
          opacity: getFeaturedImageTransitionOpacity(startProgress),
        },
        {
          transform: getFeaturedImageTransitionTransform(direction, 0),
          opacity: getFeaturedImageTransitionOpacity(0),
        },
      ],
      {
        duration: Math.max(120, Math.round(180 * Math.max(startProgress, 0.25))),
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )

    activeImageTransitionAnimation = animation

    animation.addEventListener('finish', () => {
      if (activeImageTransitionAnimation !== animation) return
      clearFeaturedImageTransition()
    })
    animation.addEventListener('cancel', () => {
      if (activeImageTransitionAnimation !== animation) return
      clearFeaturedImageTransition()
    })
  }

  function animateFeaturedImageTransition(
    direction: TrackCycleDirection,
    startProgress = 0,
    target: FeaturedImageTransitionTarget | null = null,
  ): void {
    if (prefersReducedMotion.matches) return

    const outgoingLayer = ensureFeaturedImageTransitionLayer(direction, target)
    if (!outgoingLayer) return

    const runningAnimation = activeImageTransitionAnimation
    if (runningAnimation) {
      activeImageTransitionAnimation = null
      runningAnimation.cancel()
    }

    const clampedStartProgress = Math.max(0, Math.min(startProgress, 0.96))
    const animation = outgoingLayer.animate(
      [
        {
          transform: getFeaturedImageTransitionTransform(direction, clampedStartProgress),
          opacity: getFeaturedImageTransitionOpacity(clampedStartProgress),
        },
        {
          transform: getFeaturedImageTransitionTransform(direction, 1),
          opacity: getFeaturedImageTransitionOpacity(1),
        },
      ],
      {
        duration: Math.max(160, Math.round(980 * (1 - clampedStartProgress))),
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )

    activeImageTransitionAnimation = animation
    activeImageTransitionProgress = clampedStartProgress

    animation.addEventListener('finish', () => {
      if (activeImageTransitionAnimation !== animation) return
      clearFeaturedImageTransition()
    })
    animation.addEventListener('cancel', () => {
      if (activeImageTransitionAnimation !== animation) return
      clearFeaturedImageTransition()
    })
  }

  function syncHomeMeta(
    recording: FeaturedRecording,
    transitionDirection: TrackCycleDirection | null = null,
    transitionStartProgress = 0,
  ): void {
    syncFeaturedSectionTitle(recording.key)
    if (featuredImage) {
      const currentImageSrc = toComparableMediaSrc(featuredImage.currentSrc || featuredImage.getAttribute('src'))
      const nextImageSrc = toComparableMediaSrc(recording.imageSrc)
      const shouldAnimateImageTransition =
        transitionDirection !== null &&
        !!nextImageSrc &&
        !!currentImageSrc &&
        currentImageSrc !== nextImageSrc &&
        !!listenFigure
      if (shouldAnimateImageTransition) {
        animateFeaturedImageTransition(transitionDirection, transitionStartProgress, {
          imageSrc: recording.imageSrc,
          imagePosition: recording.imagePosition,
        })
      } else {
        clearFeaturedImageTransition()
      }

      if (recording.imageSrc) featuredImage.src = recording.imageSrc
      featuredImage.alt = recording.imageAlt || ''
    }
    if (listenFigure && recording.imagePosition) {
      listenFigure.style.setProperty('--listen-image-position', recording.imagePosition)
    }
    if (featuredMetaTitle) {
      featuredMetaTitle.textContent = recording.title || 'Featured Recording'
    }
    if (featuredMetaPerformer) {
      featuredMetaPerformer.textContent = recording.performer || 'Performer to be announced'
    }
    if (featuredMetaDate) {
      featuredMetaDate.textContent = recording.date || 'Date unavailable'
    }
    if (featuredMeta) {
      if (recording.instrumentation) {
        featuredMeta.setAttribute('data-featured-meta-instrumentation', recording.instrumentation)
      } else {
        featuredMeta.removeAttribute('data-featured-meta-instrumentation')
      }
    }
    if (featuredWorkLink) {
      featuredWorkLink.href = recording.workHref || '/music/'
      featuredWorkLink.setAttribute(
        'aria-label',
        `More details for ${recording.title || 'featured work'}`,
      )
    }
    if (featuredScoreLink) {
      const scoreHref = recording.perusalScoreHref
      if (scoreHref) {
        featuredScoreLink.href = scoreHref
        featuredScoreLink.hidden = false
      } else {
        featuredScoreLink.hidden = true
      }
    }
  }

  function syncFixedBarMeta(): void {
    const activeRecording = getActiveRecording()
    if (activeRecording) {
      if (fixedBarMarqueeContent) {
        const parts = [
          activeRecording.title,
          activeRecording.performer,
          activeRecording.instrumentation,
          activeRecording.date,
        ].filter((part) => {
          if (!part) return false
          const normalized = part.toLowerCase()
          return normalized !== 'date unavailable' && normalized !== 'performer to be announced'
        })
        fixedBarMarqueeContent.textContent = parts.length > 0 ? parts.join(' \u2022 ') : 'Featured recording'
      }
      if (fixedBarLinks.length > 0) {
        for (const link of fixedBarLinks) {
          link.href = activeRecording.workHref || '/music/'
          link.setAttribute('aria-label', `Details for ${activeRecording.title || 'featured work'}`)
        }
      }
      return
    }

    const title = asMetaText(featuredMetaTitle?.textContent)
    const performer = asMetaText(featuredMetaPerformer?.textContent)
    const instrumentation = asMetaText(featuredMeta?.getAttribute('data-featured-meta-instrumentation'))
    const date = asMetaText(featuredMetaDate?.textContent)

    if (fixedBarMarqueeContent) {
      const parts = [title, performer, instrumentation, date].filter((part) => {
        if (!part) return false
        const normalized = part.toLowerCase()
        return normalized !== 'date unavailable' && normalized !== 'performer to be announced'
      })
      fixedBarMarqueeContent.textContent = parts.length > 0 ? parts.join(' \u2022 ') : 'Featured recording'
    }
    if (fixedBarLinks.length > 0 && featuredWorkLink) {
      for (const link of fixedBarLinks) {
        link.href = featuredWorkLink.href
        link.setAttribute('aria-label', `Details for ${title || 'featured work'}`)
      }
    }
  }

  function setActiveRecording(
    index: number,
    transitionDirection: TrackCycleDirection | null = null,
    transitionStartProgress = 0,
  ): boolean {
    if (featuredRecordings.length === 0) {
      currentRecordingIndex = -1
      markSourceDirty(false)
      syncTrackNavigationButtons()
      syncFixedBarMeta()
      return false
    }

    const normalizedIndex = ((index % featuredRecordings.length) + featuredRecordings.length) % featuredRecordings.length
    const recording = featuredRecordings[normalizedIndex]!
    const nextSrc = normalizeMediaSrc(recording.mp3)
    if (!nextSrc) {
      markSourceDirty(false)
      return false
    }

    const currentComparableSrc = toComparableMediaSrc(
      player.currentSrc || featuredSource?.getAttribute('src') || player.getAttribute('src'),
    )
    const nextComparableSrc = toComparableMediaSrc(nextSrc)
    const sourceChanged = !nextComparableSrc || nextComparableSrc !== currentComparableSrc

    if (featuredSource) {
      if (featuredSource.getAttribute('src') !== nextSrc) {
        featuredSource.src = nextSrc
      }
    } else if (player.getAttribute('src') !== nextSrc) {
      player.src = nextSrc
    }

    player.dataset.featuredRecordingKey = recording.key
    player.dataset.featuredRecordingInitialized = 'true'
    currentRecordingIndex = normalizedIndex
    preloadNeighborRecordingImages(normalizedIndex)
    syncHomeMeta(recording, transitionDirection, transitionStartProgress)
    syncTrackNavigationButtons()
    syncFixedBarMeta()

    markSourceDirty(sourceChanged)

    return sourceChanged
  }

  function findRecordingIndexByKey(key: string): number {
    if (!key) return -1
    return featuredRecordings.findIndex((recording) => recording.key === key)
  }

  function findRecordingIndexBySrc(source: string | null | undefined): number {
    const comparableSource = toComparableMediaSrc(source)
    if (!comparableSource) return -1
    return featuredRecordings.findIndex(
      (recording) => toComparableMediaSrc(normalizeMediaSrc(recording.mp3)) === comparableSource,
    )
  }

  function resolveCurrentWorkRecordingIndex(): number {
    const pathSegments = window.location.pathname.split('/').filter(Boolean)
    const candidateWorkId = pathSegments.length === 2 && pathSegments[0] === 'works' ? pathSegments[1] : ''
    if (!candidateWorkId || candidateWorkId === 'browse') return -1
    return featuredRecordings.findIndex((recording) => recording.workId === candidateWorkId)
  }

  function resolveInitialRecordingIndex(): number {
    if (featuredRecordings.length === 0) return -1

    const currentWorkRecordingIndex = resolveCurrentWorkRecordingIndex()
    const isPlayerCurrentlyPlaying = !player.paused && !player.ended
    if (currentWorkRecordingIndex >= 0 && !isPlayerCurrentlyPlaying) {
      return currentWorkRecordingIndex
    }

    const selectedKey = player.dataset.featuredRecordingKey?.trim()
    const selectedByKey = selectedKey ? findRecordingIndexByKey(selectedKey) : -1
    if (selectedByKey >= 0) return selectedByKey

    const hasInitializedSelection = player.dataset.featuredRecordingInitialized === 'true'
    if (hasInitializedSelection) {
      const selectedBySource = findRecordingIndexBySrc(
        player.currentSrc || featuredSource?.getAttribute('src') || player.getAttribute('src'),
      )
      if (selectedBySource >= 0) return selectedBySource
    }

    return Math.floor(Math.random() * featuredRecordings.length)
  }

  function showFixedBar(): void {
    syncFixedBarMeta()
    if (playerShell.parentElement !== playerBarControls) {
      playerBarControls.prepend(playerShell)
    }
    playerShell.hidden = false
    playerBar.hidden = false
    document.documentElement.classList.add('has-fixed-player')
    isFixedBarOpen = true
    updateMarqueeOverflow()
    watchForFirstRevealCompletion()

    if (shouldDeferPlayerOnHome()) {
      setupHomeDeferral()
    }
  }

  function syncPlayerUi(): void {
    const duration = Number.isFinite(player.duration) ? player.duration : 0
    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0
    const volume = Math.min(Math.max(player.volume, 0), 1)
    const playing = !player.paused && !player.ended
    const previousPlayingState = lastPlayerPlayingState
    const muted = player.muted || volume <= 0
    if (volume > 0) {
      lastNonZeroVolume = volume
    }

    if (!isSeeking) {
      playerSeek.max = duration > 0 ? `${duration}` : '100'
      playerSeek.value = duration > 0 ? `${Math.min(currentTime, duration)}` : '0'
    }

    const seekMax = Number.parseFloat(playerSeek.max)
    const seekValue = Number.parseFloat(playerSeek.value)
    const seekProgressPercent =
      Number.isFinite(seekMax) && seekMax > 0 && Number.isFinite(seekValue)
        ? Math.min(Math.max((seekValue / seekMax) * 100, 0), 100)
        : 0
    playerSeek.style.setProperty('--seek-progress', `${seekProgressPercent}%`)

    if (fixedBarVolume) {
      const volumePercent = Math.round((muted ? 0 : volume) * 100)
      fixedBarVolume.value = `${volumePercent}`
      fixedBarVolume.style.setProperty('--volume-progress', `${volumePercent}%`)
    }

    const currentTimeLabel = formatTime(currentTime)
    const totalTimeLabel = duration > 0 ? formatTime(duration) : '--:--'

    playerTimeCurrent.textContent = currentTimeLabel
    playerTimeTotal.textContent = totalTimeLabel
    listenSection?.classList.toggle('has-player-playing', playing)
    listenSection?.classList.toggle('has-player-muted', muted)
    playerBar.classList.toggle('has-player-playing', playing)
    playerBar.classList.toggle('has-player-muted', muted)
    for (const toggleButton of playerToggleButtons) {
      toggleButton.setAttribute('aria-label', playing ? 'Pause featured recording' : 'Play featured recording')
    }
    for (const muteButton of playerMuteButtons) {
      muteButton.setAttribute('aria-label', muted ? 'Unmute featured recording' : 'Mute featured recording')
    }

    if (listenTrigger) {
      listenTrigger.hidden = playing
      listenTrigger.setAttribute('aria-label', 'Play featured recording')
    }
    if (bleedPause) {
      bleedPause.hidden = !playing
      bleedPause.setAttribute('aria-label', playing ? 'Pause featured recording' : 'Play featured recording')
    }

    if (previousPlayingState !== null && previousPlayingState !== playing) {
      const visibleControlInner = playing
        ? bleedPause?.querySelector<HTMLElement>('.listen-bleed-pause-inner') ?? null
        : listenTrigger?.querySelector<HTMLElement>('.listen-bleed-trigger-inner') ?? null
      animateMobileListenBleedTapBounce(visibleControlInner)
      listenSection?.dispatchEvent(new Event('playerstatechange'))
    }
    lastPlayerPlayingState = playing

    if (isFixedBarOpen) {
      showFixedBar()
    }
  }

  const playFeaturedRecording = async (focusFrom?: HTMLElement | null): Promise<void> => {
    openFeaturedPlayer()
    clearHomeDeferral()
    if (focusFrom && document.activeElement === focusFrom) {
      const focusTarget =
        fixedBarToggle && !playerBar.hidden
          ? fixedBarToggle
          : featuredToggle
      focusElement(focusTarget)
    }
    try {
      showFixedBar()
      const preferredIndex =
        currentRecordingIndex >= 0 && currentRecordingIndex < featuredRecordings.length
          ? currentRecordingIndex
          : resolveInitialRecordingIndex()
      const playableIndex = await resolvePlayableRecordingIndex(preferredIndex, 1)
      if (playableIndex < 0) return
      setActiveRecording(playableIndex)
      preparePlaybackSource()
      await player.play()
    } catch (error) {
      console.warn('Featured track could not start playback.', error)
    } finally {
      syncPlayerUi()
    }
  }

  const cycleRecording = async (step: number, transitionStartProgress = 0): Promise<void> => {
    if (featuredRecordings.length <= 1) return
    const wasPlaying = !player.paused && !player.ended
    const baseIndex =
      currentRecordingIndex >= 0 && currentRecordingIndex < featuredRecordings.length
        ? currentRecordingIndex
        : resolveInitialRecordingIndex()
    if (baseIndex < 0) return

    const nextIndex = (baseIndex + step + featuredRecordings.length) % featuredRecordings.length
    const playableIndex = await resolvePlayableRecordingIndex(nextIndex, step)
    if (playableIndex < 0) return
    const direction: TrackCycleDirection = step < 0 ? 'previous' : 'next'
    openFeaturedPlayer()
    clearHomeDeferral()
    showFixedBar()
    setActiveRecording(playableIndex, direction, transitionStartProgress)

    if (wasPlaying) {
      try {
        preparePlaybackSource()
        await player.play()
      } catch (error) {
        console.warn('Featured track could not start playback.', error)
      }
    }

    syncPlayerUi()
  }

  const onListenTriggerClick = async (): Promise<void> => {
    trackFeaturedInteraction('launch', {
      trigger: 'listen_section_button',
    })
    await playFeaturedRecording(listenTrigger)
  }

  const onHeroListenTriggerClick = async (event: MouseEvent): Promise<void> => {
    if (!listenSection) return
    if (event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (isPendingHeroScrollPlayback) return

    isPendingHeroScrollPlayback = true
    try {
      const settledOnListenSection = await waitForScrollSettle(listenSection)
      if (!settledOnListenSection) return
      trackFeaturedInteraction('launch', {
        trigger: 'hero_listen_link',
      })
      await playFeaturedRecording(heroListenTrigger)
    } finally {
      isPendingHeroScrollPlayback = false
    }
  }

  const onFeaturedToggleClick = async (): Promise<void> => {
    const wasPlaying = !player.paused && !player.ended
    openFeaturedPlayer()
    try {
      if (player.paused || player.ended) {
        const preferredIndex =
          currentRecordingIndex >= 0 && currentRecordingIndex < featuredRecordings.length
            ? currentRecordingIndex
            : resolveInitialRecordingIndex()
        const playableIndex = await resolvePlayableRecordingIndex(preferredIndex, 1)
        if (playableIndex < 0) return
        setActiveRecording(playableIndex)
        preparePlaybackSource()
        await player.play()
      } else {
        player.pause()
      }
    } catch (error) {
      console.warn('Featured track control action failed.', error)
    } finally {
      syncPlayerUi()
      trackFeaturedInteraction('toggle_playback', {
        trigger: 'player_toggle',
        previous_state: wasPlaying ? 'playing' : 'paused',
        state: !player.paused && !player.ended ? 'playing' : 'paused',
      })
    }
  }

  const cycleToPreviousRecording = async (transitionStartProgress = 0): Promise<void> => {
    await cycleRecording(-1, transitionStartProgress)
    trackFeaturedInteraction('cycle_track', {
      direction: 'previous',
    })
  }

  const cycleToNextRecording = async (transitionStartProgress = 0): Promise<void> => {
    await cycleRecording(1, transitionStartProgress)
    trackFeaturedInteraction('cycle_track', {
      direction: 'next',
    })
  }

  const onFeaturedPrevClick = (): void => {
    void cycleToPreviousRecording()
  }

  const onFeaturedNextClick = (): void => {
    void cycleToNextRecording()
  }

  const clearListenFigureClickSuppression = (): void => {
    suppressNextListenFigureClick = false
    if (clearListenFigureClickSuppressionFrame) {
      window.cancelAnimationFrame(clearListenFigureClickSuppressionFrame)
      clearListenFigureClickSuppressionFrame = 0
    }
  }

  const scheduleListenFigureClickSuppressionClear = (): void => {
    if (clearListenFigureClickSuppressionFrame) {
      window.cancelAnimationFrame(clearListenFigureClickSuppressionFrame)
    }
    clearListenFigureClickSuppressionFrame = window.requestAnimationFrame(() => {
      clearListenFigureClickSuppressionFrame = 0
      suppressNextListenFigureClick = false
    })
  }

  const resetListenSwipe = (): void => {
    activeListenSwipePointerId = null
    listenSwipeStartX = 0
    listenSwipeStartY = 0
    isListenSwipeGestureHorizontal = false
  }

  const getListenSwipeMetrics = (
    clientX: number,
    clientY: number,
  ): { deltaX: number; horizontalDistance: number; verticalDistance: number } => {
    const deltaX = clientX - listenSwipeStartX
    const deltaY = clientY - listenSwipeStartY

    return {
      deltaX,
      horizontalDistance: Math.abs(deltaX),
      verticalDistance: Math.abs(deltaY),
    }
  }

  const shouldLockListenSwipeScroll = (horizontalDistance: number, verticalDistance: number): boolean => {
    return (
      horizontalDistance >= listenSwipeScrollLockDistancePx &&
      horizontalDistance > verticalDistance * 1.1
    )
  }

  const resolveSwipePreviewTarget = (direction: TrackCycleDirection): FeaturedRecording | null => {
    if (featuredRecordings.length <= 1) return null
    const baseIndex =
      currentRecordingIndex >= 0 && currentRecordingIndex < featuredRecordings.length
        ? currentRecordingIndex
        : resolveInitialRecordingIndex()
    if (baseIndex < 0) return null

    const step = direction === 'next' ? 1 : -1
    const targetIndex = (baseIndex + step + featuredRecordings.length) % featuredRecordings.length
    return featuredRecordings[targetIndex] ?? null
  }

  const onListenFigurePointerDown = (event: PointerEvent): void => {
    if (!listenFigure || event.pointerType !== 'touch') return
    if (activeListenSwipePointerId !== null) return

    activeListenSwipePointerId = event.pointerId
    listenSwipeStartX = event.clientX
    listenSwipeStartY = event.clientY
    isListenSwipeGestureHorizontal = false

    try {
      listenFigure.setPointerCapture(event.pointerId)
    } catch {
      // Ignore capture failures; swipe handling still works for most touch interactions.
    }
  }

  const onListenFigurePointerMove = (event: PointerEvent): void => {
    if (!listenFigure || event.pointerType !== 'touch') return
    if (activeListenSwipePointerId !== event.pointerId) return

    const { deltaX, horizontalDistance, verticalDistance } = getListenSwipeMetrics(event.clientX, event.clientY)

    if (!isListenSwipeGestureHorizontal) {
      isListenSwipeGestureHorizontal = shouldLockListenSwipeScroll(horizontalDistance, verticalDistance)
    }

    if (isListenSwipeGestureHorizontal && featuredRecordings.length > 1 && horizontalDistance > 0) {
      const swipeDirection: TrackCycleDirection = deltaX < 0 ? 'next' : 'previous'
      const previewTarget = resolveSwipePreviewTarget(swipeDirection)
      const previewDistance = Math.max(
        listenFigure.clientWidth * listenSwipePreviewDistanceFactor,
        listenSwipeActivationDistancePx,
      )
      const previewProgress = Math.min(horizontalDistance / Math.max(previewDistance, 1), listenSwipePreviewMaxProgress)
      previewFeaturedImageTransition(swipeDirection, previewProgress, previewTarget)
    }

    if (isListenSwipeGestureHorizontal && event.cancelable) {
      event.preventDefault()
    }
  }

  const onListenFigureTouchMove = (event: TouchEvent): void => {
    if (activeListenSwipePointerId === null) return
    const activeTouch = event.touches[0]
    if (!activeTouch) return

    const { deltaX, horizontalDistance, verticalDistance } = getListenSwipeMetrics(
      activeTouch.clientX,
      activeTouch.clientY,
    )

    if (!isListenSwipeGestureHorizontal) {
      isListenSwipeGestureHorizontal = shouldLockListenSwipeScroll(horizontalDistance, verticalDistance)
    }

    if (isListenSwipeGestureHorizontal && featuredRecordings.length > 1 && horizontalDistance > 0) {
      const swipeDirection: TrackCycleDirection = deltaX < 0 ? 'next' : 'previous'
      const previewTarget = resolveSwipePreviewTarget(swipeDirection)
      const previewDistance = Math.max(
        listenFigure?.clientWidth ? listenFigure.clientWidth * listenSwipePreviewDistanceFactor : 0,
        listenSwipeActivationDistancePx,
      )
      const previewProgress = Math.min(horizontalDistance / Math.max(previewDistance, 1), listenSwipePreviewMaxProgress)
      previewFeaturedImageTransition(swipeDirection, previewProgress, previewTarget)
    }

    if (isListenSwipeGestureHorizontal && event.cancelable) {
      event.preventDefault()
    }
  }

  const onListenFigurePointerUp = async (event: PointerEvent): Promise<void> => {
    if (!listenFigure || event.pointerType !== 'touch') return
    if (activeListenSwipePointerId !== event.pointerId) return

    const { deltaX, horizontalDistance, verticalDistance } = getListenSwipeMetrics(
      event.clientX,
      event.clientY,
    )
    const isHorizontalSwipe =
      horizontalDistance >= listenSwipeActivationDistancePx &&
      horizontalDistance > verticalDistance * 1.2
    const swipeDirection = deltaX < 0 ? 'next' : 'previous'
    const transitionStartProgress =
      swipeDirection === activeImageTransitionDirection ? activeImageTransitionProgress : 0

    try {
      if (listenFigure.hasPointerCapture(event.pointerId)) {
        listenFigure.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore release failures.
    }

    resetListenSwipe()

    if (!isHorizontalSwipe || featuredRecordings.length <= 1) {
      revertFeaturedImageTransitionPreview()
      return
    }

    suppressNextListenFigureClick = true
    scheduleListenFigureClickSuppressionClear()
    event.preventDefault()

    if (swipeDirection === 'next') {
      await cycleToNextRecording(transitionStartProgress)
      return
    }

    await cycleToPreviousRecording(transitionStartProgress)
  }

  const onListenFigurePointerCancel = (event: PointerEvent): void => {
    if (!listenFigure) return
    if (activeListenSwipePointerId !== event.pointerId) return
    resetListenSwipe()
    revertFeaturedImageTransitionPreview()
  }

  const onListenFigureClickCapture = (event: MouseEvent): void => {
    if (!suppressNextListenFigureClick) return
    clearListenFigureClickSuppression()
    event.preventDefault()
    event.stopPropagation()
  }

  const onBleedPauseClick = async (): Promise<void> => {
    const wasPlaying = !player.paused && !player.ended
    try {
      if (player.paused || player.ended) {
        const preferredIndex =
          currentRecordingIndex >= 0 && currentRecordingIndex < featuredRecordings.length
            ? currentRecordingIndex
            : resolveInitialRecordingIndex()
        const playableIndex = await resolvePlayableRecordingIndex(preferredIndex, 1)
        if (playableIndex < 0) return
        setActiveRecording(playableIndex)
        preparePlaybackSource()
        await player.play()
      } else {
        player.pause()
      }
    } catch (error) {
      console.warn('Featured track control action failed.', error)
    } finally {
      syncPlayerUi()
      trackFeaturedInteraction('toggle_playback', {
        trigger: 'bleed_overlay',
        previous_state: wasPlaying ? 'playing' : 'paused',
        state: !player.paused && !player.ended ? 'playing' : 'paused',
      })
    }
  }

  const onFeaturedMuteClick = (): void => {
    const currentlyMuted = player.muted || player.volume <= 0
    if (currentlyMuted) {
      const restoreVolume = lastNonZeroVolume > 0 ? lastNonZeroVolume : 1
      player.volume = restoreVolume
      player.muted = false
    } else {
      const volume = Math.min(Math.max(player.volume, 0), 1)
      if (volume > 0) {
        lastNonZeroVolume = volume
      }
      player.muted = true
    }
    syncPlayerUi()
    trackFeaturedInteraction('toggle_mute', {
      muted: player.muted || player.volume <= 0,
    })
  }

  const onFixedBarVolumeInput = (): void => {
    if (!fixedBarVolume) return
    const nextValue = Number.parseFloat(fixedBarVolume.value)
    if (!Number.isFinite(nextValue)) return

    const volume = Math.min(Math.max(nextValue, 0), 100) / 100
    player.volume = volume
    if (volume > 0) {
      lastNonZeroVolume = volume
      player.muted = false
    } else {
      player.muted = true
    }
    syncPlayerUi()

    trackFeaturedInteraction('set_volume', {
      trigger: 'fixed_bar_slider',
      volume_percent: Math.round(volume * 100),
      muted: player.muted || player.volume <= 0,
    })
  }

  const onFeaturedSeekStart = (): void => {
    isSeeking = true
  }

  const onFeaturedSeekInput = (): void => {
    const duration = Number.isFinite(player.duration) ? player.duration : 0
    const nextValue = Number.parseFloat(playerSeek.value)
    if (duration > 0 && Number.isFinite(nextValue)) {
      player.currentTime = Math.min(Math.max(nextValue, 0), duration)
    }
    syncPlayerUi()
  }

  const onFeaturedSeekInputEvent = (): void => {
    if (!isSeeking) {
      onFeaturedSeekStart()
    }
    onFeaturedSeekInput()
  }

  const onFeaturedSeekEnd = (): void => {
    if (!isSeeking) {
      onFeaturedSeekInputEvent()
    } else {
      onFeaturedSeekInput()
    }

    if (!isSeeking) return
    isSeeking = false
    const now = Date.now()
    if (now - lastTrackedSeekAt < 200) return
    lastTrackedSeekAt = now

    const duration = Number.isFinite(player.duration) ? player.duration : 0
    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0
    const progressPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0
    trackFeaturedInteraction('seek', {
      position_seconds: Math.round(currentTime),
      position_percent: progressPercent,
    })
  }

  const syncSeekFromClientX = (clientX: number): void => {
    const seekRect = playerSeek.getBoundingClientRect()
    if (!(seekRect.width > 0)) return

    const minValue = Number.parseFloat(playerSeek.min)
    const maxValue = Number.parseFloat(playerSeek.max)
    const rangeMin = Number.isFinite(minValue) ? minValue : 0
    const rangeMax = Number.isFinite(maxValue) && maxValue > rangeMin ? maxValue : rangeMin + 100

    const progress = Math.min(Math.max((clientX - seekRect.left) / seekRect.width, 0), 1)
    const nextValue = rangeMin + progress * (rangeMax - rangeMin)
    playerSeek.value = `${nextValue}`
    onFeaturedSeekInputEvent()
  }

  const findTouchByIdentifier = (touches: TouchList, identifier: number): Touch | null => {
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index)
      if (touch?.identifier === identifier) {
        return touch
      }
    }
    return null
  }

  const onFeaturedSeekTouchStart = (event: TouchEvent): void => {
    const activeTouch = event.changedTouches.item(0)
    if (!activeTouch) return

    activeSeekTouchId = activeTouch.identifier
    syncSeekFromClientX(activeTouch.clientX)

    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const onFeaturedSeekTouchMove = (event: TouchEvent): void => {
    if (activeSeekTouchId === null) return
    const activeTouch = findTouchByIdentifier(event.touches, activeSeekTouchId)
    if (!activeTouch) return

    syncSeekFromClientX(activeTouch.clientX)

    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const onFeaturedSeekTouchEnd = (event: TouchEvent): void => {
    if (activeSeekTouchId === null) return
    const activeTouch = findTouchByIdentifier(event.changedTouches, activeSeekTouchId)
    if (!activeTouch) return

    syncSeekFromClientX(activeTouch.clientX)
    activeSeekTouchId = null
    onFeaturedSeekEnd()

    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const onFeaturedSeekTouchCancel = (event: TouchEvent): void => {
    if (activeSeekTouchId === null) return
    const canceledTouch = findTouchByIdentifier(event.changedTouches, activeSeekTouchId)
    if (!canceledTouch) return

    activeSeekTouchId = null
    onFeaturedSeekEnd()

    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const onPlayerEvent = (): void => syncPlayerUi()
  const onPlayerError = (): void => {
    const activeRecording = getActiveRecording()
    if (activeRecording) {
      const comparableSource = toComparableMediaSrc(normalizeMediaSrc(activeRecording.mp3))
      if (comparableSource) {
        recordingAvailabilityBySrc.set(comparableSource, false)
      }
    }
    markSourceDirty(false)
    syncPlayerUi()
  }
  const onTimeUpdate = (): void => {
    if (!isSeeking) syncPlayerUi()
  }
  const onEnded = (): void => {
    player.currentTime = 0
    syncPlayerUi()
  }

  const onWindowResize = (): void => {
    if (!fixedBarMarqueeContent) return
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame)
    }
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0
      resetMarqueeToStart()
      updateMarqueeOverflow()
    })
  }

  listenTrigger?.addEventListener('click', onListenTriggerClick)
  if (heroListenTrigger && listenSection) {
    heroListenTrigger.addEventListener('click', onHeroListenTriggerClick)
  }
  for (const toggleButton of playerToggleButtons) {
    toggleButton.addEventListener('click', onFeaturedToggleClick)
  }
  for (const prevButton of trackPrevButtons) {
    prevButton.addEventListener('click', onFeaturedPrevClick)
  }
  for (const nextButton of trackNextButtons) {
    nextButton.addEventListener('click', onFeaturedNextClick)
  }
  bleedPause?.addEventListener('click', onBleedPauseClick)
  for (const muteButton of playerMuteButtons) {
    muteButton.addEventListener('click', onFeaturedMuteClick)
  }
  fixedBarVolume?.addEventListener('input', onFixedBarVolumeInput)
  fixedBarVolume?.addEventListener('change', onFixedBarVolumeInput)
  playerSeek.addEventListener('pointerdown', onFeaturedSeekStart)
  playerSeek.addEventListener('mousedown', onFeaturedSeekStart)
  playerSeek.addEventListener('touchstart', onFeaturedSeekTouchStart, { passive: false })
  playerSeek.addEventListener('input', onFeaturedSeekInputEvent)
  playerSeek.addEventListener('change', onFeaturedSeekEnd)
  playerSeek.addEventListener('pointerup', onFeaturedSeekEnd)
  playerSeek.addEventListener('pointercancel', onFeaturedSeekEnd)
  playerSeek.addEventListener('mouseup', onFeaturedSeekEnd)
  playerSeek.addEventListener('keyup', onFeaturedSeekEnd)
  window.addEventListener('touchmove', onFeaturedSeekTouchMove, { passive: false })
  window.addEventListener('touchend', onFeaturedSeekTouchEnd, { passive: false })
  window.addEventListener('touchcancel', onFeaturedSeekTouchCancel, { passive: false })
  player.addEventListener('play', onPlayerEvent)
  player.addEventListener('pause', onPlayerEvent)
  player.addEventListener('timeupdate', onTimeUpdate)
  player.addEventListener('loadedmetadata', onPlayerEvent)
  player.addEventListener('durationchange', onPlayerEvent)
  player.addEventListener('volumechange', onPlayerEvent)
  player.addEventListener('error', onPlayerError)
  player.addEventListener('ended', onEnded)
  window.addEventListener('resize', onWindowResize)
  listenFigure?.addEventListener('pointerdown', onListenFigurePointerDown)
  listenFigure?.addEventListener('pointermove', onListenFigurePointerMove, { passive: false })
  listenFigure?.addEventListener('pointerup', onListenFigurePointerUp)
  listenFigure?.addEventListener('pointercancel', onListenFigurePointerCancel)
  listenFigure?.addEventListener('touchmove', onListenFigureTouchMove, { passive: false })
  listenFigure?.addEventListener('click', onListenFigureClickCapture, true)

  const onRequestRecording = async (event: Event): Promise<void> => {
    const detail = (event as CustomEvent<{ key: string; play?: boolean }>).detail
    if (!detail?.key) return

    const index = findRecordingIndexByKey(detail.key)
    if (index < 0) return

    if (detail.play !== false) {
      const isAvailable = await isRecordingIndexAvailable(index)
      if (!isAvailable) {
        syncPlayerUi()
        return
      }
    }

    openFeaturedPlayer()
    clearHomeDeferral()
    showFixedBar()
    setActiveRecording(index)

    if (detail.play !== false) {
      preparePlaybackSource()
      try {
        await player.play()
      } catch (error) {
        console.warn('Featured track could not start playback.', error)
      }
    }

    syncPlayerUi()
    trackFeaturedInteraction('select_track', {
      trigger: 'recording_request',
      requested_key: detail.key,
      autoplay: detail.play !== false,
    })
  }

  player.addEventListener('featured-player:request-recording', onRequestRecording)

  const initialRecordingIndex = resolveInitialRecordingIndex()
  if (initialRecordingIndex >= 0) {
    // Treat the randomly-selected initial recording as "the default" for this
    // visit so the section title stays "Featured Recording" until the user
    // explicitly cycles tracks.
    const initialRecording = featuredRecordings[initialRecordingIndex]
    if (initialRecording && featuredSectionTitle) {
      featuredSectionTitle.setAttribute('data-featured-default-recording-key', initialRecording.key)
    }
    setActiveRecording(initialRecordingIndex)
  } else {
    syncTrackNavigationButtons()
    syncFixedBarMeta()
  }

  if (!isFixedBarOpen) {
    showFixedBar()
  }

  syncPlayerUi()

  return () => {
    listenTrigger?.removeEventListener('click', onListenTriggerClick)
    if (heroListenTrigger && listenSection) {
      heroListenTrigger.removeEventListener('click', onHeroListenTriggerClick)
    }
    for (const toggleButton of playerToggleButtons) {
      toggleButton.removeEventListener('click', onFeaturedToggleClick)
    }
    for (const prevButton of trackPrevButtons) {
      prevButton.removeEventListener('click', onFeaturedPrevClick)
    }
    for (const nextButton of trackNextButtons) {
      nextButton.removeEventListener('click', onFeaturedNextClick)
    }
    bleedPause?.removeEventListener('click', onBleedPauseClick)
    for (const muteButton of playerMuteButtons) {
      muteButton.removeEventListener('click', onFeaturedMuteClick)
    }
    fixedBarVolume?.removeEventListener('input', onFixedBarVolumeInput)
    fixedBarVolume?.removeEventListener('change', onFixedBarVolumeInput)
    playerSeek.removeEventListener('pointerdown', onFeaturedSeekStart)
    playerSeek.removeEventListener('mousedown', onFeaturedSeekStart)
    playerSeek.removeEventListener('touchstart', onFeaturedSeekTouchStart)
    playerSeek.removeEventListener('input', onFeaturedSeekInputEvent)
    playerSeek.removeEventListener('change', onFeaturedSeekEnd)
    playerSeek.removeEventListener('pointerup', onFeaturedSeekEnd)
    playerSeek.removeEventListener('pointercancel', onFeaturedSeekEnd)
    playerSeek.removeEventListener('mouseup', onFeaturedSeekEnd)
    playerSeek.removeEventListener('keyup', onFeaturedSeekEnd)
    window.removeEventListener('touchmove', onFeaturedSeekTouchMove)
    window.removeEventListener('touchend', onFeaturedSeekTouchEnd)
    window.removeEventListener('touchcancel', onFeaturedSeekTouchCancel)
    activeSeekTouchId = null
    player.removeEventListener('play', onPlayerEvent)
    player.removeEventListener('pause', onPlayerEvent)
    player.removeEventListener('timeupdate', onTimeUpdate)
    player.removeEventListener('loadedmetadata', onPlayerEvent)
    player.removeEventListener('durationchange', onPlayerEvent)
    player.removeEventListener('volumechange', onPlayerEvent)
    player.removeEventListener('error', onPlayerError)
    player.removeEventListener('ended', onEnded)
    player.removeEventListener('featured-player:request-recording', onRequestRecording)
    window.removeEventListener('resize', onWindowResize)
    listenFigure?.removeEventListener('pointerdown', onListenFigurePointerDown)
    listenFigure?.removeEventListener('pointermove', onListenFigurePointerMove)
    listenFigure?.removeEventListener('pointerup', onListenFigurePointerUp)
    listenFigure?.removeEventListener('pointercancel', onListenFigurePointerCancel)
    listenFigure?.removeEventListener('touchmove', onListenFigureTouchMove)
    listenFigure?.removeEventListener('click', onListenFigureClickCapture, true)
    clearHomeDeferral()
    clearRevealDoneWatcher()
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
    }
    clearListenFigureClickSuppression()
    clearFeaturedImageTransition()
    if (!isFixedBarOpen) {
      if (featuredPlayerDock && playerShell.parentElement !== featuredPlayerDock) {
        featuredPlayerDock.appendChild(playerShell)
      }
      playerShell.hidden = true
    }
  }
}
