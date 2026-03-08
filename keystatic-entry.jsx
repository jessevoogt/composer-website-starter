import React from 'react'
import { createRoot } from 'react-dom/client'
import { makePage } from '@keystatic/astro/ui'
import config from './keystatic.config.ts'

const container = document.getElementById('root')

if (container._ksRoot) {
  // HMR re-execution: the ingest pipeline (triggered by the source/ file
  // watcher) modified files imported by keystatic.config.ts (e.g.
  // api/pdf-scores.json). Vite followed the import chain here and
  // re-executed this module. Calling createRoot() again would destroy
  // Keystatic's internal tree-cache, causing "Entry not found" errors.
  // A clean page reload picks up the new config without the broken state.
  //
  // Cooldown prevents reload loops when the pipeline writes multiple files
  // in quick succession (each write triggers a separate HMR invalidation).
  const COOLDOWN_MS = 3000
  const lastReload = parseInt(sessionStorage.getItem('_ksHmrReload') || '0', 10)
  if (Date.now() - lastReload > COOLDOWN_MS) {
    sessionStorage.setItem('_ksHmrReload', String(Date.now()))
    window.location.reload()
  }
} else {
  const Page = makePage(config)
  container._ksRoot = createRoot(container)
  container._ksRoot.render(React.createElement(Page))
}

if (import.meta.hot) {
  import.meta.hot.accept()
}
