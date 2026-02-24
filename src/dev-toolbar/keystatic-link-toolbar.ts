import { defineToolbarApp } from 'astro/toolbar'

const KEYSTATIC_PORT = '4322'
const KEYSTATIC_ROOT_PATH = '/keystatic/'
const WORKS_ITEM_BASE_PATH = '/keystatic/collection/works/item/'
const PAGE_SINGLETON_PATHS: Record<string, string> = {
  '/': '/keystatic/singleton/homeHero',
  '/about': '/keystatic/singleton/aboutPage',
  '/contact': '/keystatic/singleton/contactPage',
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/').trim()
  if (!normalized || normalized === '/') return '/'
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function resolveWorkItemPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'works') return null
  if (segments.length < 2) return null
  if (segments[1] === 'browse') return null
  return `${WORKS_ITEM_BASE_PATH}${encodeURIComponent(segments[1])}`
}

function resolveKeystaticPath(pathname: string): string {
  const normalizedPath = normalizePathname(pathname)

  const singletonPath = PAGE_SINGLETON_PATHS[normalizedPath]
  if (singletonPath) return singletonPath

  if (normalizedPath === '/works' || normalizedPath.startsWith('/works/browse')) {
    return '/keystatic/singleton/worksPage'
  }

  const workItemPath = resolveWorkItemPath(normalizedPath)
  if (workItemPath) return workItemPath

  return KEYSTATIC_ROOT_PATH
}

function buildKeystaticUrl(): string {
  const keystaticOrigin = new URL(window.location.origin)
  keystaticOrigin.port = KEYSTATIC_PORT
  const keystaticPath = resolveKeystaticPath(window.location.pathname)
  return new URL(keystaticPath, keystaticOrigin).toString()
}

export default defineToolbarApp({
  init(_canvas, app) {
    app.onToggled(({ state }: { state: boolean }) => {
      if (!state) return
      window.open(buildKeystaticUrl(), '_blank', 'noopener,noreferrer')
      // Reset button to inactive state immediately after opening the tab
      requestAnimationFrame(() => app.toggleState({ state: false }))
    })
  },
})
