import type { SearchableTagItem, SearchableWorkItem } from '../scripts/search-types'
import type { WorkWithImage } from '@/utils/prepareWorks'

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Mn}/gu, '')
}

export function buildSearchableWorkItems(worksWithImages: WorkWithImage[]): SearchableWorkItem[] {
  return worksWithImages.map((work) => {
    const recordingPerformers = work.data.recordings.flatMap((recording) => {
      const ensemble = recording.ensemble?.trim()
      const performers = recording.performers.map((performer) => performer.trim()).filter(Boolean)
      return ensemble ? [ensemble, ...performers] : performers
    })
    const performancePerformers = work.data.performances.flatMap((p) => p.performers)
    const performers = unique([...recordingPerformers, ...performancePerformers])
    const venues = unique(work.data.performances.map((p) => p.venue).filter((v): v is string => Boolean(v)))

    const titleStripped = stripDiacritics(work.data.title)
    const subtitleStripped = work.data.subtitle ? stripDiacritics(work.data.subtitle) : ''
    const extraKeywords = [
      work.id,
      ...(titleStripped !== work.data.title ? [titleStripped] : []),
      ...(subtitleStripped && subtitleStripped !== work.data.subtitle ? [subtitleStripped] : []),
    ]

    return {
      id: work.id,
      title: work.data.title,
      subtitle: work.data.subtitle ?? '',
      description: work.data.description,
      keywords: unique([...work.data.searchKeywords, ...extraKeywords]),
      tags: work.data.tags,
      instrumentation: work.data.instrumentation,
      performers,
      composer: work.data.composer,
      venues,
      duration: work.data.duration ?? '',
      difficulty: work.data.difficulty ?? '',
      completionDate: work.data.completionDate ?? '',
      programNote: work.data.programNote ?? '',
      href: `/works/${work.id}/`,
      category: 'work',
    }
  })
}

export function buildSearchableTagItems(uniqueTags: Array<{ label: string; slug: string }>): SearchableTagItem[] {
  return uniqueTags.map((tag) => {
    const tagTokens = tokenize(tag.label)
    const keywords = unique([tag.label.toLowerCase(), ...tagTokens, 'works', 'browse', 'tag'])

    return {
      id: `works-browse-${tag.slug}`,
      title: tag.label,
      description: `Browse works tagged "${tag.label}".`,
      keywords,
      href: `/works/browse/${tag.slug}/`,
      category: 'tag',
      tagLabel: tag.label,
    }
  })
}
