const GENERATED_PAGE_SEARCH_EXCLUDED_FILES = new Set([
  'contact/thank-you.astro',
  'music/[work]/perusal-score/thank-you.astro',
  'music/[work]/perusal-score/access-granted.astro',
  'setup.astro',
])

const SEARCH_AND_CRAWLER_EXCLUDED_PATTERNS = [
  /^\/contact\/thank-you\/$/,
  /^\/music\/[^/]+\/perusal-score\/thank-you\/$/,
  /^\/music\/[^/]+\/perusal-score\/access-granted\/$/,
  /^\/setup\/$/,
]

function normalizePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return '/'

  let normalized = value.trim()

  try {
    normalized = new URL(normalized).pathname
  } catch {
    // Preserve path-like input when it is not a full URL.
  }

  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  normalized = normalized.replace(/\/+/g, '/')
  if (normalized !== '/' && !normalized.endsWith('/')) normalized += '/'
  return normalized
}

export function isGeneratedPageSearchExcludedFile(relativePagePath) {
  return GENERATED_PAGE_SEARCH_EXCLUDED_FILES.has(relativePagePath)
}

export function isSearchAndCrawlerExcludedPath(value) {
  const normalized = normalizePath(value)
  return SEARCH_AND_CRAWLER_EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))
}
