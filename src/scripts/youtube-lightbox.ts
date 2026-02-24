/**
 * YouTube lightbox controller.
 * Opens a modal dialog with a YouTube iframe embed when a user clicks
 * a "Watch on YouTube" link, pausing any active audio player first.
 */

import { trackAnalyticsEvent } from './analytics-events'

interface YoutubeLightboxWindow extends Window {
  __youtubeLightboxBound?: boolean
}

function extractYouTubeVideoId(url: string): string | null {
  const regex = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
  const match = url.match(regex)
  return match && match[2].length === 11 ? match[2] : null
}

function initYoutubeLightbox(): () => void {
  const dialog = document.querySelector<HTMLDialogElement>('#youtube-lightbox')
  const panel = dialog?.querySelector<HTMLElement>('.youtube-lightbox-panel')
  const embedContainer = dialog?.querySelector<HTMLElement>('[data-youtube-lightbox-embed]')
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-youtube-lightbox-close]')

  if (!dialog || !embedContainer) return () => {}

  const dialogEl = dialog as HTMLDialogElement
  const panelEl = panel as HTMLElement
  const containerEl = embedContainer as HTMLElement
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const closeAnimationMs = 180

  let closeTimer = 0
  let openFrame = 0
  let triggerElement: HTMLElement | null = null

  function clearTimers(): void {
    if (closeTimer) {
      window.clearTimeout(closeTimer)
      closeTimer = 0
    }
    if (openFrame) {
      window.cancelAnimationFrame(openFrame)
      openFrame = 0
    }
  }

  function destroyEmbed(): void {
    containerEl.innerHTML = ''
  }

  function syncClosedState(): void {
    dialogEl.classList.remove('is-visible', 'is-closing')
    document.body.style.overflow = ''
    destroyEmbed()
  }

  function finishClose(reason = 'dismiss'): void {
    clearTimers()
    if (dialogEl.open) {
      dialogEl.close(reason)
      return
    }
    syncClosedState()
  }

  function closeModal(reason = 'dismiss'): void {
    clearTimers()

    if (!dialogEl.open) {
      syncClosedState()
      return
    }

    if (prefersReducedMotion) {
      finishClose(reason)
      return
    }

    dialogEl.classList.remove('is-visible')
    dialogEl.classList.add('is-closing')
    closeTimer = window.setTimeout(() => {
      finishClose(reason)
    }, closeAnimationMs)
  }

  function pauseAudioPlayer(): void {
    const player = document.querySelector<HTMLAudioElement>('[data-featured-player]')
    if (player && !player.paused && !player.ended) {
      player.pause()
    }
  }

  function openModal(youtubeUrl: string, title: string): void {
    const videoId = extractYouTubeVideoId(youtubeUrl)
    if (!videoId) return

    clearTimers()
    pauseAudioPlayer()
    trackAnalyticsEvent('youtube_lightbox_open', {
      video_id: videoId,
      video_title: title,
    })

    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&feature=oembed`
    const iframe = document.createElement('iframe')
    iframe.src = embedUrl
    iframe.title = title
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.allowFullscreen = true
    iframe.style.cssText =
      'aspect-ratio: 16/9; border: 0; inline-size: 100%; block-size: 100%; border-radius: 0;'

    containerEl.innerHTML = ''
    containerEl.appendChild(iframe)

    document.body.style.overflow = 'hidden'

    if (!dialogEl.open) {
      dialogEl.showModal()
      panelEl.focus({ preventScroll: true })
    }

    dialogEl.classList.remove('is-closing')
    if (prefersReducedMotion) {
      dialogEl.classList.add('is-visible')
    } else {
      openFrame = window.requestAnimationFrame(() => {
        openFrame = window.requestAnimationFrame(() => {
          openFrame = 0
          dialogEl.classList.add('is-visible')
        })
      })
    }
  }

  const onTriggerClick = (event: MouseEvent): void => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-youtube-lightbox-trigger]')
    if (!link) return

    event.preventDefault()
    triggerElement = link
    const url = link.getAttribute('data-youtube-lightbox-url') ?? link.href
    const title = link.getAttribute('data-youtube-lightbox-title') ?? 'YouTube video'
    openModal(url, title)
  }

  const onCloseClick = (): void => closeModal('dismiss')

  const onDialogCancel = (event: Event): void => {
    event.preventDefault()
    closeModal('dismiss')
  }

  const onDialogClick = (event: MouseEvent): void => {
    if (event.target === dialog) {
      closeModal('dismiss')
    }
  }

  const onDialogClose = (): void => {
    if (dialogEl.returnValue !== 'swap') {
      trackAnalyticsEvent('youtube_lightbox_close', {
        reason: dialogEl.returnValue || 'dismiss',
      })
    }
    syncClosedState()
    if (triggerElement) {
      triggerElement.focus()
      triggerElement = null
    }
  }

  document.addEventListener('click', onTriggerClick)
  closeButton?.addEventListener('click', onCloseClick)
  dialogEl.addEventListener('cancel', onDialogCancel)
  dialogEl.addEventListener('click', onDialogClick)
  dialogEl.addEventListener('close', onDialogClose)

  return () => {
    clearTimers()
    document.removeEventListener('click', onTriggerClick)
    closeButton?.removeEventListener('click', onCloseClick)
    dialogEl.removeEventListener('cancel', onDialogCancel)
    dialogEl.removeEventListener('click', onDialogClick)
    dialogEl.removeEventListener('close', onDialogClose)
    if (dialogEl.open) {
      dialogEl.close('swap')
    }
    syncClosedState()
  }
}

const youtubeLightboxWindow = window as YoutubeLightboxWindow
if (!youtubeLightboxWindow.__youtubeLightboxBound) {
  youtubeLightboxWindow.__youtubeLightboxBound = true

  document.addEventListener('astro:page-load', () => {
    const teardown = initYoutubeLightbox()
    document.addEventListener('astro:before-swap', () => teardown(), { once: true })
  })
}
