import { defineToolbarApp } from 'astro/toolbar'

// ── Dev Tools Toolbar App ────────────────────────────────────────────────────
//
// Provides quick access to Build / Preview / Publish / Search / Export Starter
// actions from the Astro dev toolbar — the same actions available in the studio
// shell's header menu. Renders a floating window with action buttons.

const PREVIEW_PARAM = 'cmsLivePreview'
const PREVIEW_FRAME_NAME = '__cms-live-editor-preview__'

function isPreviewPage(): boolean {
  const hasParam = new URL(window.location.href).searchParams.get(PREVIEW_PARAM) === '1'
  return hasParam || window.name === PREVIEW_FRAME_NAME
}

function getCanonicalLocalOrigin(): string {
  const url = new URL(window.location.origin)
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1'
  }
  return url.origin
}

interface ActionDef {
  id: string
  label: string
  endpoint: string
  confirm?: string
}

const PURGE_DRAFT_DATABASES = ['keystatic', 'keystatic-blobs'] as const

const ACTIONS: ActionDef[] = [
  { id: 'build', label: '\u2699 Build', endpoint: '/api/build' },
  { id: 'preview', label: '\u25B6 Preview', endpoint: '/api/preview' },
  {
    id: 'publish',
    label: '\u2B06 Publish',
    endpoint: '/api/publish',
    confirm:
      'Deploy to live?\n\n' +
      'This uploads the current dist/ build to the server as-is.\n\n' +
      'Make sure you have:\n' +
      '  1. Clicked Build after your last changes\n' +
      '  2. Clicked Preview to verify everything looks good\n\n' +
      'Continue?',
  },
  {
    id: 'starter',
    label: '\uD83D\uDCE6 Export Starter',
    endpoint: '/api/generate-starter-kit',
    confirm:
      'Generate starter kit?\n\n' +
      'This creates a clean, distributable project in .starter-kit/\n' +
      'with all personal data, credentials, and purchased assets stripped.\n\n' +
      'Continue?',
  },
]

export default defineToolbarApp({
  init(canvas, app) {
    // Don't show in preview iframe
    if (isPreviewPage()) return

    // ── Window container ─────────────────────────────────────────────────
    const win = document.createElement('astro-dev-toolbar-window')
    win.style.display = 'none'
    canvas.appendChild(win)
    let isAppOpen = false
    let outsideClickListenerTimer: number | null = null

    // ── Styles ───────────────────────────────────────────────────────────
    const style = document.createElement('style')
    style.textContent = `
      .dt-menu { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
      .dt-heading { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin: 0 0 4px; }
      .dt-btn {
        display: flex; width: 100%; box-sizing: border-box;
        padding: 6px 10px; background: transparent; color: #e0e0e0;
        border: 1px solid transparent; border-radius: 6px;
        font: 500 13px/1.3 system-ui, -apple-system, sans-serif;
        cursor: pointer; text-align: left; transition: background 100ms;
      }
      .dt-btn:hover:not([disabled]) { background: rgba(255,255,255,0.08); }
      .dt-btn[disabled] { opacity: 0.5; cursor: default; }
      .dt-btn.success { background: #14532d; color: #fafafa; }
      .dt-btn.error { background: #450a0a; color: #fafafa; }
      .dt-sep { height: 1px; background: rgba(255,255,255,0.1); margin: 2px 0; }
      .dt-search-btn {
        display: flex; width: 100%; box-sizing: border-box;
        padding: 6px 10px; background: transparent; color: #e0e0e0;
        border: 1px solid transparent; border-radius: 6px;
        font: 500 13px/1.3 system-ui, -apple-system, sans-serif;
        cursor: pointer; text-align: left; transition: background 100ms;
      }
      .dt-search-btn:hover { background: rgba(255,255,255,0.08); }
    `
    win.appendChild(style)

    // ── Menu content ─────────────────────────────────────────────────────
    const menu = document.createElement('div')
    menu.className = 'dt-menu'
    win.appendChild(menu)

    const heading = document.createElement('div')
    heading.className = 'dt-heading'
    heading.textContent = 'Dev Tools'
    menu.appendChild(heading)

    // Search button
    const searchBtn = document.createElement('button')
    searchBtn.type = 'button'
    searchBtn.className = 'dt-search-btn'
    searchBtn.textContent = 'Search'
    menu.appendChild(searchBtn)

    // Live link slot (fetched async)
    const liveSlot = document.createElement('span')
    menu.appendChild(liveSlot)

    void fetch('/api/toolbar-config')
      .then((r) => r.json())
      .then((data: { liveUrl?: string }) => {
        if (data.liveUrl) {
          const a = document.createElement('a')
          a.className = 'dt-btn'
          a.href = data.liveUrl
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          a.textContent = '\u2197 Live'
          a.style.textDecoration = 'none'
          a.style.color = 'inherit'
          liveSlot.replaceWith(a)
        } else {
          liveSlot.remove()
        }
      })
      .catch(() => liveSlot.remove())

    const sep = document.createElement('div')
    sep.className = 'dt-sep'
    menu.appendChild(sep)

    // Action buttons
    const buttons = new Map<string, HTMLButtonElement>()
    let busy = false

    function resetBtn(btn: HTMLButtonElement, label: string) {
      btn.className = 'dt-btn'
      btn.textContent = label
      btn.disabled = false
    }

    function deleteIndexedDb(name: string): Promise<void> {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not available in this browser.'))
          return
        }

        let settled = false
        const request = indexedDB.deleteDatabase(name)

        const resolveOnce = () => {
          if (settled) return
          settled = true
          resolve()
        }

        const rejectOnce = (error?: unknown) => {
          if (settled) return
          settled = true
          reject(error instanceof Error ? error : new Error(`Failed to delete ${name}.`))
        }

        request.onsuccess = () => resolveOnce()
        request.onerror = () => rejectOnce(request.error ?? new Error(`Failed to delete ${name}.`))
        request.onblocked = () =>
          rejectOnce(new Error(`Could not delete ${name}. Close any open Keystatic tabs and try again.`))
      })
    }

    const purgeBtn = document.createElement('button')
    purgeBtn.type = 'button'
    purgeBtn.className = 'dt-btn'
    purgeBtn.textContent = '\uD83E\uDDF9 Purge Drafts'
    menu.appendChild(purgeBtn)

    purgeBtn.addEventListener('click', async () => {
      if (busy) return
      const confirmed = window.confirm(
        'Delete all local Keystatic drafts and cached blobs for this browser?\n\n' +
          'This removes the IndexedDB databases:\n' +
          `  - ${PURGE_DRAFT_DATABASES[0]}\n` +
          `  - ${PURGE_DRAFT_DATABASES[1]}\n\n` +
          'Close any open /keystatic tabs first.\n\n' +
          'Continue?',
      )
      if (!confirmed) return

      busy = true
      purgeBtn.disabled = true
      purgeBtn.textContent = '\u23F3 Purging\u2026'

      try {
        await Promise.all(PURGE_DRAFT_DATABASES.map((name) => deleteIndexedDb(name)))
        purgeBtn.className = 'dt-btn success'
        purgeBtn.textContent = '\u2713 Drafts purged'
        setTimeout(() => resetBtn(purgeBtn, '\uD83E\uDDF9 Purge Drafts'), 4000)
      } catch (e) {
        purgeBtn.className = 'dt-btn error'
        purgeBtn.textContent = '\u2717 Purge failed'
        console.error('[dev-tools:purge-drafts]', e)
        setTimeout(() => resetBtn(purgeBtn, '\uD83E\uDDF9 Purge Drafts'), 6000)
      } finally {
        busy = false
      }
    })

    for (const action of ACTIONS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dt-btn'
      btn.textContent = action.label
      buttons.set(action.id, btn)

      btn.addEventListener('click', async () => {
        if (busy) return
        if (action.confirm && !window.confirm(action.confirm)) return

        busy = true
        btn.disabled = true
        btn.textContent = '\u23F3 Working\u2026'

        try {
          const res = await fetch(action.endpoint, { method: 'POST' })
          const data = await res.json()

          if (res.ok) {
            if (action.id === 'preview' && data.url) {
              window.open(data.url, '_blank', 'noopener,noreferrer')
              resetBtn(btn, action.label)
            } else {
              btn.className = 'dt-btn success'
              btn.textContent = '\u2713 Done'
              setTimeout(() => resetBtn(btn, action.label), 3000)
            }
          } else if (res.status === 409) {
            resetBtn(btn, action.label)
          } else {
            btn.className = 'dt-btn error'
            btn.textContent = '\u2717 Failed'
            console.error(`[dev-tools:${action.id}]`, data.error)
            setTimeout(() => resetBtn(btn, action.label), 5000)
          }
        } catch (e) {
          btn.className = 'dt-btn error'
          btn.textContent = '\u2717 Network error'
          console.error(`[dev-tools:${action.id}]`, e)
          setTimeout(() => resetBtn(btn, action.label), 5000)
        } finally {
          busy = false
        }
      })

      menu.appendChild(btn)
    }

    // ── Search modal ─────────────────────────────────────────────────────
    let searchOverlay: HTMLDivElement | null = null

    function closeSearch() {
      if (!searchOverlay) return
      searchOverlay.remove()
      searchOverlay = null
    }

    searchBtn.addEventListener('click', () => {
      if (searchOverlay) return
      app.toggleState({ state: false })

      const overlay = document.createElement('div')
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '100000',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        padding: '1rem',
      })

      const closeModalBtn = document.createElement('button')
      closeModalBtn.type = 'button'
      closeModalBtn.setAttribute('aria-label', 'Close search')
      Object.assign(closeModalBtn.style, {
        position: 'absolute',
        top: '0.25rem',
        right: '0.25rem',
        zIndex: '1',
        background: 'rgba(24, 24, 27, 0.9)',
        color: '#e4e4e7',
        border: '1px solid #3f3f46',
        borderRadius: '6px',
        width: '28px',
        height: '28px',
        fontSize: '16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: '1',
      })
      closeModalBtn.textContent = '\u00d7'
      closeModalBtn.addEventListener('click', closeSearch)
      overlay.appendChild(closeModalBtn)

      const frame = document.createElement('iframe')
      frame.src = '/works-search/?modal=1'
      frame.title = 'Works Search'
      Object.assign(frame.style, {
        flex: '1',
        border: 'none',
        borderRadius: '6px',
        background: '#0e0e10',
      })
      overlay.appendChild(frame)

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSearch()
      })

      document.body.appendChild(overlay)
      searchOverlay = overlay
      closeModalBtn.focus()
    })

    // Listen for search close messages from the search iframe
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'works-search-close') closeSearch()
      if (e.data?.type === 'works-search-view' && e.data.slug) {
        closeSearch()
        window.location.href = `/music/${e.data.slug}/`
      }
      if (e.data?.type === 'works-search-edit' && e.data.slug) {
        closeSearch()
        window.location.href = new URL(`/__studio/music/${e.data.slug}/`, getCanonicalLocalOrigin()).toString()
      }
    })

    const stopListeningForOutsideClicks = (): void => {
      if (outsideClickListenerTimer !== null) {
        window.clearTimeout(outsideClickListenerTimer)
        outsideClickListenerTimer = null
      }
      document.removeEventListener('click', onDocumentClick)
    }

    // Astro may clear toolbar app canvases during soft navigations, so
    // re-attach the window if it gets detached.
    const ensureAttached = (): void => {
      if (!win.isConnected) {
        canvas.append(win)
      }
    }

    const onDocumentClick = (event: MouseEvent): void => {
      if (!isAppOpen) return
      if (event.composedPath().includes(win)) return
      app.toggleState({ state: false })
    }

    const startListeningForOutsideClicks = (): void => {
      stopListeningForOutsideClicks()
      outsideClickListenerTimer = window.setTimeout(() => {
        outsideClickListenerTimer = null
        if (!isAppOpen) return
        document.addEventListener('click', onDocumentClick)
      }, 0)
    }

    // ── Toggle visibility ────────────────────────────────────────────────
    app.onToggled(({ state }: { state: boolean }) => {
      isAppOpen = state
      if (state) {
        ensureAttached()
      }
      win.style.display = state ? '' : 'none'
      if (state) {
        startListeningForOutsideClicks()
      } else {
        stopListeningForOutsideClicks()
      }
    })

    const onAfterSwap = (): void => {
      ensureAttached()
    }

    const onPageLoad = (): void => {
      ensureAttached()
    }

    document.addEventListener('astro:after-swap', onAfterSwap)
    document.addEventListener('astro:page-load', onPageLoad)
    ensureAttached()
  },
})
