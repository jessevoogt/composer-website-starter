/**
 * Cross-tab audio coordination.
 *
 * 1. When a new browser tab opens a page on this site, other tabs
 *    pause their audio players and close the YouTube lightbox.
 * 2. When audio starts playing in any tab (featured player, perusal
 *    player, or YouTube lightbox), other tabs pause their audio.
 *
 * Uses BroadcastChannel (same-origin, no server needed).
 */

interface CrossTabAudioMessage {
  type: 'new-tab-opened' | 'audio-started'
  tabId: string
}

interface CrossTabWindow extends Window {
  __crossTabAudioBound?: boolean
  __crossTabId?: string
}

const CHANNEL_NAME = 'cross-tab-audio'

function pauseAllAudio(): void {
  // Pause featured player (SiteLayout pages).
  // The featured player's own `pause` event listener handles UI sync.
  const featuredPlayer = document.querySelector<HTMLAudioElement>('[data-featured-player]')
  if (featuredPlayer && !featuredPlayer.paused) {
    featuredPlayer.pause()
  }

  // Pause perusal score player (PerusalLayout pages).
  // Its `pause` event listener handles UI sync.
  const perusalAudio = document.querySelector<HTMLAudioElement>('[data-perusal-audio]')
  if (perusalAudio && !perusalAudio.paused) {
    perusalAudio.pause()
  }

  // Close YouTube lightbox if open.
  // The dialog's `close` event handler destroys the iframe and restores body overflow.
  const youtubeDialog = document.querySelector<HTMLDialogElement>('#youtube-lightbox')
  if (youtubeDialog?.open) {
    youtubeDialog.close('cross-tab')
  }
}

const crossTabWindow = window as CrossTabWindow

if (!crossTabWindow.__crossTabAudioBound) {
  crossTabWindow.__crossTabAudioBound = true

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    // BroadcastChannel not supported; degrade gracefully.
  }

  if (channel) {
    const broadcast = (type: CrossTabAudioMessage['type']): void => {
      if (crossTabWindow.__crossTabId) {
        channel!.postMessage({
          type,
          tabId: crossTabWindow.__crossTabId,
        } satisfies CrossTabAudioMessage)
      }
    }

    channel.onmessage = (event: MessageEvent<CrossTabAudioMessage>) => {
      const data = event.data
      if (
        (data?.type === 'new-tab-opened' || data?.type === 'audio-started') &&
        data.tabId !== crossTabWindow.__crossTabId
      ) {
        pauseAllAudio()
      }
    }

    // Guard against double-binding play listeners when both the
    // DOMContentLoaded fallback and astro:page-load fire on the same page.
    // Reset on astro:before-swap so the next view-transition page re-binds.
    let playListenersBound = false

    function initPage(): void {
      // Assign a tab ID on first load (idempotent across view transitions).
      if (!crossTabWindow.__crossTabId) {
        crossTabWindow.__crossTabId = crypto.randomUUID()
        broadcast('new-tab-opened')
      }

      if (playListenersBound) return
      playListenersBound = true

      // --- Bind play-event listeners for the current page ---

      const featured = document.querySelector<HTMLAudioElement>('[data-featured-player]')
      const perusal = document.querySelector<HTMLAudioElement>('[data-perusal-audio]')

      const onPlay = (): void => {
        broadcast('audio-started')
      }

      // Media `play` events don't bubble, so attach directly to each element.
      featured?.addEventListener('play', onPlay)
      perusal?.addEventListener('play', onPlay)

      // Observe YouTube lightbox opening (showModal sets the `open` attribute).
      let ytObserver: MutationObserver | null = null
      const ytDialog = document.querySelector<HTMLDialogElement>('#youtube-lightbox')
      if (ytDialog) {
        ytObserver = new MutationObserver(() => {
          if (ytDialog.open) broadcast('audio-started')
        })
        ytObserver.observe(ytDialog, { attributes: true, attributeFilter: ['open'] })
      }

      // Teardown on view transition swap so the next page re-binds.
      // Never fires on PerusalLayout pages (no ClientRouter), which is fine —
      // the page unload handles cleanup.
      document.addEventListener(
        'astro:before-swap',
        () => {
          playListenersBound = false
          featured?.removeEventListener('play', onPlay)
          perusal?.removeEventListener('play', onPlay)
          ytObserver?.disconnect()
        },
        { once: true },
      )
    }

    // SiteLayout pages: astro:page-load fires on initial load + each view transition.
    document.addEventListener('astro:page-load', initPage)

    // PerusalLayout pages lack the ClientRouter, so astro:page-load never fires.
    // Fall back to DOMContentLoaded. On SiteLayout pages both may fire, but
    // the playListenersBound guard prevents double-binding.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPage, { once: true })
    } else {
      initPage()
    }
  }
}
