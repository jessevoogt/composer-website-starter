import { defineToolbarApp } from 'astro/toolbar'

// ── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_PARAM = 'cmsLivePreview'
const PREVIEW_FRAME_NAME = '__cms-live-editor-preview__'
const PREVIEW_STYLE_ID = 'cms-live-editor-preview-style'
const STUDIO_PREFIX = '/__studio'

// ── Preview detection ────────────────────────────────────────────────────────

function isPreviewPage(): boolean {
  const hasParam = new URL(window.location.href).searchParams.get(PREVIEW_PARAM) === '1'
  if (hasParam && window.name !== PREVIEW_FRAME_NAME) window.name = PREVIEW_FRAME_NAME
  return hasParam || window.name === PREVIEW_FRAME_NAME
}

function hideDevToolbar(doc: Document): void {
  if (doc.getElementById(PREVIEW_STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = PREVIEW_STYLE_ID
  s.textContent = 'astro-dev-toolbar { display: none !important; }'
  doc.head?.append(s)
}

function getCanonicalLocalOrigin(): string {
  const url = new URL(window.location.origin)
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1'
  }
  return url.origin
}

function buildStudioUrl(): string {
  return new URL(`${STUDIO_PREFIX}${location.pathname}`, getCanonicalLocalOrigin()).toString()
}

// ── Toolbar app ──────────────────────────────────────────────────────────────
//
// Three code paths:
// 1. Preview iframe (inside studio): hide dev toolbar so it doesn't clutter the preview
// 2. Normal page: clicking the toolbar button navigates to /__studio/{current path}
//
// The studio page itself is standalone HTML (no SiteLayout, no Astro dev toolbar),
// so no studio-page code path is needed here.

export default defineToolbarApp({
  init(_canvas, app) {
    // Preview iframe: hide dev toolbar and bail
    if (isPreviewPage()) {
      hideDevToolbar(document)
      document.addEventListener('astro:after-swap', () => hideDevToolbar(document))
      return
    }

    // Normal page: toggle navigates to studio
    app.onToggled(({ state }: { state: boolean }) => {
      if (state) {
        window.location.href = buildStudioUrl()
      }
    })
  },
})
