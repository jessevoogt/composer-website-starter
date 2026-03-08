// 1. Import utilities from `astro:content`
import { defineCollection, z } from 'astro:content'

// 2. Import loader(s)
import { glob } from 'astro/loaders'

// 3. Define your collection(s)
export const recordingLinkUrlSchema = z.string().url()

export const recordingImageSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
  position: z.string().optional(),
})

// Reusable recording link schema: either a string URL or an object with optional mp3, image, etc.
export const recordingLinkSchema = z.object({
  url: recordingLinkUrlSchema.optional(),
  label: z.string().optional(),
  duration: z.string().optional(),
  mp3: z.string().optional(),
  featuredRecording: z.boolean().optional(),
  date: z.string().optional(),
  image: recordingImageSchema.optional(),
}).or(recordingLinkUrlSchema)

export const recordingSchema = z.object({
  ensemble: z.string().optional(),
  performers: z.array(z.string()).default([]),
  date: z.string().optional(),
  links: z.array(recordingLinkSchema).default([]),
  image: recordingImageSchema.optional(),
  notes: z.string().optional(),
})
// Reusable sheet music URL schema
export const sheetMusicUrlSchema = z.string().url()
// Reusable sheet music schema: either a string URL or an object { url, title, description }
export const sheetMusicSchema = z.object({
  label: z.string(),
  url: sheetMusicUrlSchema,
  tooltip: z.string().optional(),
}).or(sheetMusicUrlSchema)

export const movementSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

export const performanceSchema = z.object({
  date: z.string().optional(),
  venue: z.string().optional(),
  performers: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

export const instrumentLineSchema = z.object({
  label: z.string(),
  details: z.array(z.string()).default([]),
  note: z.string().optional(),
})

export const instrumentSectionSchema = z.object({
  section: z.string(),
  instruments: z.array(
    z.union([z.string(), instrumentLineSchema])
  ).default([]),
})

export const instrumentationSchema = z.object({
  label: z.string().optional(),
  grouped: z.boolean().default(false),
  instruments: z.array(z.string()).default([]),
  sections: z.array(instrumentSectionSchema).default([]),
}).default({ grouped: false, instruments: [], sections: [] })

export type InstrumentLineType = z.infer<typeof instrumentLineSchema>
export type InstrumentSectionType = z.infer<typeof instrumentSectionSchema>
export type InstrumentationType = z.infer<typeof instrumentationSchema>

export type RecordingLinkType = z.infer<typeof recordingLinkSchema>
export type RecordingImageType = z.infer<typeof recordingImageSchema>
export type RecordingType = z.infer<typeof recordingSchema>
export type MovementType = z.infer<typeof movementSchema>
export type PerformanceType = z.infer<typeof performanceSchema>


const works = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/works' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    composer: z.string(),
    description: z.string(),
    thumbnail: z.object({
      src: z.string(),
      alt: z.string(),
    }).optional(),
    categorization: z.object({
      tags: z.array(z.string()).default([]),
      instrumentation: instrumentationSchema,
      searchKeywords: z.array(z.string()).default([]),
    }).default({}),
    homepageSelection: z.object({
      selected: z.boolean().default(false),
      selectedOrder: z.number().int().optional(),
    }).default({}),
    duration: z.string().optional(),
    completionDate: z.string().optional(),
    difficulty: z.string().optional(),
    programNote: z.string().optional(),
    movements: z.array(movementSchema).default([]),
    hasPerusalScore: z.boolean().optional(),
    scoreOverrides: z.object({
      viewerWatermark: z.enum(['', 'enabled', 'disabled']).default(''),
      viewerGating: z.enum(['', 'gated', 'ungated']).default(''),
      pdfWatermarked: z.enum(['', 'enabled', 'disabled']).default(''),
      pdfOriginal: z.enum(['', 'enabled', 'disabled']).default(''),
      pdfWatermarkedGating: z.enum(['', 'gated', 'ungated']).default(''),
      pdfOriginalGating: z.enum(['', 'gated', 'ungated']).default(''),
    }).default({}),
    preferredHeroId: z.string().optional(),
    sheetMusic: z.array(sheetMusicSchema).default([]),
    recordings: z.array(recordingSchema).default([]),
    performances: z.array(performanceSchema).default([]),
  }),
})

// 4. Export a single `collections` object to register you collection(s)
export const collections = { works }
