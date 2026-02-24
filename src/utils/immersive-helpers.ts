/**
 * Shared helper functions for the immersive-stage page.
 * Used both in frontmatter (server) and client scripts.
 */

import type { WorkWithImage } from '@/utils/prepareWorks'
import type { RecordingLinkType } from '../content.config'
import type { ClientRecordingEntry } from '../scripts/immersive/types'

/** Parse a date-like string to a timestamp, returning 0 on failure. */
export function asDate(value: string | null | undefined): number {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

/** Format a date-like string for display, or return the raw string if not parseable. */
export function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp))
}

/**
 * Normalize a media source URL.
 * Absolute URLs are returned as-is; relative paths are encoded.
 */
export function normalizeMediaSrc(value: string | null | undefined): string {
  if (!value) return ''
  return /^(https?:)?\/\//.test(value) ? value : encodeURI(value)
}

/** Check if a value is a non-empty string. */
export function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Type guard: is a recording link an object (not a bare URL string)? */
function isLinkObject(link: RecordingLinkType): link is Exclude<RecordingLinkType, string> {
  return typeof link !== 'string'
}

/**
 * Build a flat array of ClientRecordingEntry from all works.
 * Each entry corresponds to a link that has an mp3 field.
 * Date and image inherit from the parent recording when the link doesn't override.
 */
export function flattenRecordingEntries(
  worksWithImages: WorkWithImage[],
  resolveImagePath: (src: string | undefined) => string,
  fallbackImage: { src: string; alt: string; position: string },
  perusalScoreMap?: Record<string, number>,
): ClientRecordingEntry[] {
  return worksWithImages.flatMap((work) =>
    work.data.recordings.flatMap((recording, recordingIndex) =>
      recording.links
        .filter(isLinkObject)
        .filter((link) => typeof link.mp3 === 'string' && link.mp3.trim().length > 0)
        .map((link, linkIndex) => {
          const ensemble = recording.ensemble?.trim()
          const primaryPerformer = recording.performers.find((performer) => performer.trim().length > 0)?.trim()

          return {
            key: `${work.id}-${recordingIndex}-${linkIndex}`,
            workId: work.id,
            workHref: `/works/${work.id}/`,
            perusalScoreHref: perusalScoreMap?.[work.id]
              ? `/works/${work.id}/perusal-score/`
              : undefined,
            title: link.label ? `${work.data.title} — ${link.label}` : work.data.title,
            performer: ensemble || primaryPerformer || 'Performer to be announced',
            instrumentation: work.data.instrumentation.length > 0 ? work.data.instrumentation.join(', ') : '',
            date: formatDateLabel(link.date ?? recording.date) ?? 'Date unavailable',
            imageSrc:
              resolveImagePath(link.image?.src ?? recording.image?.src) ||
              work.featuredImage?.src ||
              resolveImagePath(work.data.thumbnail?.src) ||
              fallbackImage.src,
            imageAlt:
              link.image?.alt ?? recording.image?.alt ?? work.data.thumbnail?.alt ?? fallbackImage.alt,
            imagePosition:
              link.image?.position ?? recording.image?.position ?? fallbackImage.position,
            mp3: link.mp3!.trim(),
            featured: Boolean(link.featuredRecording),
          }
        }),
    ),
  )
}
