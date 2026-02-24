/**
 * Shared analytics helpers.
 * Keeps tracking calls safe in environments where GA is unavailable.
 */

type AnalyticsValue = string | number | boolean | null | undefined
type AnalyticsParams = Record<string, AnalyticsValue>

interface AnalyticsWindow extends Window {
  gtag?: (...args: unknown[]) => void
  __analyticsLinkTrackingBound?: boolean
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeEventName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function sanitizeKey(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function sanitizeParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {}

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) return

    const normalizedKey = sanitizeKey(key)
    if (!normalizedKey) return

    if (typeof value === 'string') {
      const normalizedValue = normalizeWhitespace(value).slice(0, 160)
      if (!normalizedValue) return
      sanitized[normalizedKey] = normalizedValue
      return
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return
      sanitized[normalizedKey] = value
      return
    }

    sanitized[normalizedKey] = value
  })

  return sanitized
}

function getLinkLabel(link: HTMLAnchorElement): string {
  const ariaLabel = link.getAttribute('aria-label')
  if (ariaLabel) return normalizeWhitespace(ariaLabel).slice(0, 120)
  return normalizeWhitespace(link.textContent ?? '').slice(0, 120)
}

function toPathWithQuery(url: URL): string {
  return `${url.pathname}${url.search}`
}

function isPrimaryClick(event: MouseEvent): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

function trackHashLinkClick(link: HTMLAnchorElement, href: string): void {
  const target = href.startsWith('#') ? href.slice(1) : href.split('#')[1] ?? ''
  trackAnalyticsEvent('in_page_link_click', {
    target_id: target || 'top',
    link_label: getLinkLabel(link),
    link_href: href,
    page_path: `${window.location.pathname}${window.location.search}`,
  })
}

function trackMailtoLinkClick(): void {
  const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const placement =
    normalizedPathname === '/contact' ? 'contact_page' : normalizedPathname === '/' ? 'home_contact_section' : 'other'

  trackAnalyticsEvent('email_link_click', {
    placement,
  })
}

function handleAnchorClick(event: MouseEvent): void {
  if (!isPrimaryClick(event)) return
  if (!(event.target instanceof Element)) return

  const link = event.target.closest<HTMLAnchorElement>('a[href]')
  if (!link) return

  const href = (link.getAttribute('href') ?? '').trim()
  if (!href) return

  if (/^mailto:/i.test(href)) {
    trackMailtoLinkClick()
    return
  }

  if (href.startsWith('#')) {
    trackHashLinkClick(link, href)
    return
  }

  let parsed: URL
  try {
    parsed = new URL(href, window.location.href)
  } catch {
    return
  }

  if (parsed.origin !== window.location.origin) return
  if (!parsed.hash) return
  if (toPathWithQuery(parsed) !== `${window.location.pathname}${window.location.search}`) return

  trackHashLinkClick(link, `${parsed.pathname}${parsed.search}${parsed.hash}`)
}

function initGlobalLinkTracking(): void {
  const analyticsWindow = window as AnalyticsWindow
  if (analyticsWindow.__analyticsLinkTrackingBound) return
  analyticsWindow.__analyticsLinkTrackingBound = true
  document.addEventListener('click', handleAnchorClick)
}

export function resolveSearchSurface(container: HTMLElement, mode: 'works' | 'site'): string {
  if (mode === 'works') return 'works_page'
  if (container.closest('#works-search-modal')) return 'search_modal'
  if (container.closest('[data-mobile-menu-search]')) return 'mobile_menu'
  return 'site'
}

export function trackAnalyticsEvent(name: string, params: AnalyticsParams = {}): void {
  const eventName = sanitizeEventName(name)
  if (!eventName) return

  const analyticsWindow = window as AnalyticsWindow
  if (typeof analyticsWindow.gtag !== 'function') return

  try {
    analyticsWindow.gtag('event', eventName, sanitizeParams(params))
  } catch {
    // Ignore analytics failures so behavior is never affected.
  }
}

document.addEventListener('astro:page-load', initGlobalLinkTracking)
initGlobalLinkTracking()
