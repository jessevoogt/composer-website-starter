import { defineToolbarApp } from 'astro/toolbar'

const KEYSTATIC_ROOT_PATH = '/keystatic/'

const PAGE_SINGLETON_PATHS: Record<string, string> = {
  '/': '/keystatic/singleton/homePage',
  '/about': '/keystatic/singleton/aboutPage',
  '/contact': '/keystatic/singleton/contactPage',
  '/contact/thank-you': '/keystatic/singleton/contactThankYouPage',
  '/music': '/keystatic/singleton/musicPage',
  '/music/browse': '/keystatic/singleton/musicBrowsePage',
  '/accessibility-statement': '/keystatic/singleton/accessibilityPage',
  '/sitemap': '/keystatic/singleton/sitemapPage',
  '/404': '/keystatic/singleton/notFoundPage',
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/').trim()
  if (!normalized || normalized === '/') return '/'
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function resolveWorkItemPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'music') return null
  if (segments.length < 2) return null
  if (segments[1] === 'browse') {
    // /music/browse/<tag>/... → browse tag singleton; /music/browse → browse singleton
    if (segments.length >= 3) return '/keystatic/singleton/musicBrowseTagPage'
    return PAGE_SINGLETON_PATHS['/music/browse'] ?? null
  }
  // /music/<work>/request-score-access → request score access singleton
  if (segments[2] === 'request-score-access') {
    return '/keystatic/singleton/workDetailScoreAccessRequestPage'
  }
  // /music/<work>/perusal-score/access-granted → access granted singleton
  if (segments[2] === 'perusal-score' && segments[3] === 'access-granted') {
    return '/keystatic/singleton/workDetailScoreAccessGrantedPage'
  }
  // /music/<work>/perusal-score/thank-you → thank you singleton
  if (segments[2] === 'perusal-score' && segments[3] === 'thank-you') {
    return '/keystatic/singleton/workDetailScoreAccessThankYouPage'
  }
  return `/keystatic/collection/works/item/${encodeURIComponent(segments[1])}`
}

function isNotFoundPage(): boolean {
  return document.querySelector('.not-found-section') !== null
}

function resolveKeystaticPath(pathname: string): string {
  // 404 pages can have any pathname — detect via DOM marker
  if (isNotFoundPage()) return PAGE_SINGLETON_PATHS['/404'] ?? KEYSTATIC_ROOT_PATH

  const normalizedPath = normalizePathname(pathname)

  const singletonPath = PAGE_SINGLETON_PATHS[normalizedPath]
  if (singletonPath) return singletonPath

  const workItemPath = resolveWorkItemPath(normalizedPath)
  if (workItemPath) return workItemPath

  return KEYSTATIC_ROOT_PATH
}

function getCanonicalLocalOrigin(): string {
  const url = new URL(window.location.origin)
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1'
  }
  return url.origin
}

function buildKeystaticUrl(): string {
  const keystaticPath = resolveKeystaticPath(window.location.pathname)
  return new URL(keystaticPath, getCanonicalLocalOrigin()).toString()
}

export default defineToolbarApp({
  init(_canvas, app) {
    app.onToggled(({ state }: { state: boolean }) => {
      if (!state) return
      window.open(buildKeystaticUrl(), '_blank', 'noopener,noreferrer')
      requestAnimationFrame(() => app.toggleState({ state: false }))
    })
  },
})
