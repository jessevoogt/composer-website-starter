// Shared helper to prepare works collection with featured images and tag metadata
import type { CollectionEntry } from 'astro:content'
import { slugify } from '@/utils/slugify'
import { getPerformerCreditKey, getPerformerCreditLabel, normalizeCreditKey } from '@/utils/credit-labels'

// Import images used as fallbacks / optimizations
import worksImages from '@/utils/works-images'

type ImageData = typeof worksImages[number]['data']

export type WorkWithImage = CollectionEntry<'works'> & {
  featuredImage: ImageData | null
  tagSlugs: string[]
  creditTagLinks: Record<string, string>
}

function sanitizePath(path: string) {
  return path.trim().toLowerCase()
}

// Helper to find an image entry from the provided images array by filename (case-insensitive).
function findImageByFilename(path: string) {
  return worksImages.find((img) => {
    const needle = sanitizePath(path)
    return sanitizePath(img.path) === needle
  })
}

/**
 * Prepare works by resolving featuredImage from frontmatter (matching imported images or using external URLs)
 * Also computes uniqueTags and tag slugs on each work for easier filtering.
 * Derived tags are created for performers/ensembles that appear in more than one work.
 */
export function prepareWorks(works: CollectionEntry<'works'>[]) {
  const creditWorkIdsByKey = new Map<string, Set<string>>()
  const creditLabelByKey = new Map<string, string>()
  const creditKeysByWorkId = new Map<string, Set<string>>()

  for (const work of works) {
    const keysForWork = new Set<string>()

    for (const recording of work.data.recordings) {
      const ensemble = recording.ensemble?.trim()
      if (ensemble) {
        const key = normalizeCreditKey(ensemble)
        keysForWork.add(key)
        if (!creditLabelByKey.has(key)) {
          creditLabelByKey.set(key, ensemble)
        }
      }

      for (const performer of recording.performers) {
        const performerLabel = performer.trim()
        if (!performerLabel) continue

        const normalizedPerformerLabel = getPerformerCreditLabel(performerLabel)
        const key = getPerformerCreditKey(performerLabel)
        keysForWork.add(key)

        if (!creditLabelByKey.has(key)) {
          creditLabelByKey.set(key, normalizedPerformerLabel)
        }
      }
    }

    for (const key of keysForWork) {
      const workIds = creditWorkIdsByKey.get(key) ?? new Set<string>()
      workIds.add(work.id)
      creditWorkIdsByKey.set(key, workIds)
    }

    creditKeysByWorkId.set(work.id, keysForWork)
  }

  const sharedCreditKeys = new Set<string>(
    [...creditWorkIdsByKey.entries()]
      .filter(([, workIds]) => workIds.size > 1)
      .map(([key]) => key),
  )

  const uniqueTagLabelSet = new Set<string>()

  const worksWithImages: WorkWithImage[] = works.map((work) => {
    let featuredImage: ImageData | null = null

    if (work.data.thumbnail?.src) {
      const match = findImageByFilename(work.data.thumbnail.src)
      if (match) {
        featuredImage = match.data
      }
    }

    const derivedCreditKeys = [...(creditKeysByWorkId.get(work.id) ?? new Set<string>())]
      .filter((key) => sharedCreditKeys.has(key))
      .sort((a, b) => (creditLabelByKey.get(a) ?? a).localeCompare(creditLabelByKey.get(b) ?? b))
    const derivedCreditTags = derivedCreditKeys
      .map((key) => creditLabelByKey.get(key))
      .filter((label): label is string => Boolean(label))

    const tagLabels = [...new Set([...work.data.categorization.tags, ...derivedCreditTags])]
    const tagSlugs = tagLabels.map((tagLabel) => slugify(tagLabel))
    const creditTagLinks = Object.fromEntries(
      derivedCreditKeys.map((key) => {
        const label = creditLabelByKey.get(key) ?? key
        return [key, `/music/browse/${slugify(label)}/`]
      }),
    )

    tagLabels.forEach((tagLabel) => uniqueTagLabelSet.add(tagLabel))

    return {
      ...work,
      featuredImage,
      tagSlugs,
      creditTagLinks,
    }
  })

  const uniqueTags = [...uniqueTagLabelSet]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, slug: slugify(label) }))

  return {
    works: worksWithImages,
    uniqueTags,
  }
}

export default prepareWorks
