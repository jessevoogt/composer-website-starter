/**
 * Relevance scoring for site-wide search.
 * Scores each item against a query, then ranks by descending score.
 */

import type { SearchableItem, SearchableWorkItem, ScoredSearchResult } from './search-types'

/** Split a query string into lowercase tokens. */
function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

/** Check whether `haystack` contains `token` as an exact whole word. */
function isExactWordMatch(haystack: string, token: string): boolean {
  const words = haystack.toLowerCase().split(/[\s,;.\-/()]+/)
  return words.includes(token)
}

/** Check whether `haystack` contains `token` as a substring. */
function isSubstringMatch(haystack: string, token: string): boolean {
  return haystack.toLowerCase().includes(token)
}

function isWorkItem(item: SearchableItem): item is SearchableWorkItem {
  return item.category === 'work'
}

function isTagItem(item: SearchableItem): boolean {
  return item.category === 'tag'
}

/**
 * Compute a relevance score for a single item against a query.
 *
 * Field weights (per token):
 *   Title exact word: 100 | substring: 60
 *   Subtitle (works) exact word: 55 | substring: 35
 *   Performers (works) exact word: 50 | substring: 30
 *   Composer (works) exact word: 50 | substring: 30
 *   Tags/keywords exact word: 40 | substring: 20
 *   Instrumentation (works) exact word: 30 | substring: 15
 *   Venues (works) exact word: 25 | substring: 12
 *   Description exact word: 15 | substring: 8
 *   Program note (works) exact word: 10 | substring: 5
 *   Other metadata (duration/difficulty/date) exact word: 10 | substring: 5
 *
 * Bonuses:
 *   Full query contiguous match in title: +50
 *   Exact tag-page title match for the full query: +250
 *   Works category base boost: +10
 */
export function scoreItem(item: SearchableItem, query: string): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) return 0

  let tokenScore = 0

  for (const token of tokens) {
    // Title
    if (isExactWordMatch(item.title, token)) {
      tokenScore += 100
    } else if (isSubstringMatch(item.title, token)) {
      tokenScore += 60
    }

    // Subtitle (works only)
    if (isWorkItem(item) && item.subtitle) {
      if (isExactWordMatch(item.subtitle, token)) {
        tokenScore += 55
      } else if (isSubstringMatch(item.subtitle, token)) {
        tokenScore += 35
      }
    }

    // Performers (works only)
    if (isWorkItem(item)) {
      const performerHaystack = item.performers.join(' ')
      if (isExactWordMatch(performerHaystack, token)) {
        tokenScore += 50
      } else if (isSubstringMatch(performerHaystack, token)) {
        tokenScore += 30
      }
    }

    // Composer (works only)
    if (isWorkItem(item) && item.composer) {
      if (isExactWordMatch(item.composer, token)) {
        tokenScore += 50
      } else if (isSubstringMatch(item.composer, token)) {
        tokenScore += 30
      }
    }

    // Keywords + tags
    const keywordPool = isWorkItem(item) ? [...item.keywords, ...item.tags] : item.keywords
    const keywordHaystack = keywordPool.join(' ')
    if (isExactWordMatch(keywordHaystack, token)) {
      tokenScore += 40
    } else if (isSubstringMatch(keywordHaystack, token)) {
      tokenScore += 20
    }

    // Instrumentation (works only)
    if (isWorkItem(item)) {
      const instrHaystack = item.instrumentation.join(' ')
      if (isExactWordMatch(instrHaystack, token)) {
        tokenScore += 30
      } else if (isSubstringMatch(instrHaystack, token)) {
        tokenScore += 15
      }
    }

    // Venues (works only)
    if (isWorkItem(item)) {
      const venueHaystack = item.venues.join(' ')
      if (isExactWordMatch(venueHaystack, token)) {
        tokenScore += 25
      } else if (isSubstringMatch(venueHaystack, token)) {
        tokenScore += 12
      }
    }

    // Description
    if (isExactWordMatch(item.description, token)) {
      tokenScore += 15
    } else if (isSubstringMatch(item.description, token)) {
      tokenScore += 8
    }

    // Program note (works only)
    if (isWorkItem(item) && item.programNote) {
      if (isExactWordMatch(item.programNote, token)) {
        tokenScore += 10
      } else if (isSubstringMatch(item.programNote, token)) {
        tokenScore += 5
      }
    }

    // Other metadata: duration, difficulty, completionDate (works only)
    if (isWorkItem(item)) {
      const otherMeta = [item.duration, item.difficulty, item.completionDate].filter(Boolean).join(' ')
      if (otherMeta) {
        if (isExactWordMatch(otherMeta, token)) {
          tokenScore += 10
        } else if (isSubstringMatch(otherMeta, token)) {
          tokenScore += 5
        }
      }
    }
  }

  // Only add bonuses when at least one token matched
  if (tokenScore === 0) return 0

  let score = tokenScore

  // Full query contiguous match in title
  const normalizedQuery = query.toLowerCase().trim()
  if (normalizedQuery.length > 0 && item.title.toLowerCase().includes(normalizedQuery)) {
    score += 50
  }

  // Promote direct tag hits (e.g., "guitar" -> /works/browse/guitar/).
  if (isTagItem(item) && normalizedQuery === item.title.toLowerCase().trim()) {
    score += 250
  }

  // Works category base boost
  if (isWorkItem(item)) {
    score += 10
  }

  return score
}

/**
 * Rank a list of searchable items by relevance to the given query.
 * Returns only items with a positive score, sorted descending.
 */
export function rankResults(items: SearchableItem[], query: string): ScoredSearchResult[] {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) return []

  return items
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
}
