import type { SearchableTagItem, SearchableWorkItem } from '../scripts/search-types'
import type { WorkWithImage } from '@/utils/prepareWorks'
import type { RecordingType, PerformanceType, InstrumentationType } from '../content.config'

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

export function flattenInstrumentation(instr: InstrumentationType): string[] {
  if (!instr.grouped) return instr.instruments
  return instr.sections.flatMap((s) =>
    s.instruments.flatMap((i) => (typeof i === 'string' ? [i] : [i.label, ...i.details]))
  )
}

const INSTRUMENT_COUNT_THRESHOLD = 8

/**
 * Return a concise display string for instrumentation.
 * Uses the label if present, falls back to "N instruments" when the count
 * exceeds the threshold, otherwise joins the flat list with commas.
 */
export function summarizeInstrumentation(instr: InstrumentationType): string {
  if (instr.label) return instr.label

  if (instr.grouped) {
    const count = instr.sections.reduce(
      (sum, s) => sum + s.instruments.length,
      0,
    )
    return count > 0 ? `${count} instruments` : ''
  }

  if (instr.instruments.length > INSTRUMENT_COUNT_THRESHOLD) {
    return `${instr.instruments.length} instruments`
  }

  return instr.instruments.join(', ')
}

export function buildSearchableWorkItems(worksWithImages: WorkWithImage[]): SearchableWorkItem[] {
  return worksWithImages.map((work) => {
    const recordingPerformers = work.data.recordings.flatMap((recording: RecordingType) => {
      const ensemble = recording.ensemble?.trim()
      const performers = recording.performers.map((performer: string) => performer.trim()).filter(Boolean)
      return ensemble ? [ensemble, ...performers] : performers
    })
    const performancePerformers = work.data.performances.flatMap((p: PerformanceType) => p.performers)
    const performers = unique([...recordingPerformers, ...performancePerformers])
    const venues = unique(work.data.performances.map((p: PerformanceType) => p.venue).filter((v: string | undefined): v is string => Boolean(v)))

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
      keywords: unique([...work.data.categorization.searchKeywords, ...extraKeywords]),
      tags: work.data.categorization.tags,
      instrumentation: flattenInstrumentation(work.data.categorization.instrumentation),
      performers,
      composer: work.data.composer,
      venues,
      duration: work.data.duration ?? '',
      difficulty: work.data.difficulty ?? '',
      completionDate: work.data.completionDate ?? '',
      programNote: work.data.programNote ?? '',
      href: `/music/${work.id}/`,
      category: 'work',
    }
  })
}

export function buildSearchableTagItems(uniqueTags: Array<{ label: string; slug: string }>): SearchableTagItem[] {
  return uniqueTags.map((tag) => {
    const tagTokens = tokenize(tag.label)
    const keywords = unique([tag.label.toLowerCase(), ...tagTokens, 'music', 'browse', 'tag'])

    return {
      id: `music-browse-${tag.slug}`,
      title: tag.label,
      description: `Browse works tagged "${tag.label}".`,
      keywords,
      href: `/music/browse/${tag.slug}/`,
      category: 'tag',
      tagLabel: tag.label,
    }
  })
}
