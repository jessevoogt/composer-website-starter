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

export type RecordingLinkType = z.infer<typeof recordingLinkSchema>
export type RecordingImageType = z.infer<typeof recordingImageSchema>
export type RecordingType = z.infer<typeof recordingSchema>


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
    tags: z.array(z.string()).default([]),
    searchKeywords: z.array(z.string()).default([]),
    selected: z.boolean().default(false),
    selectedOrder: z.number().int().optional(),
    instrumentation: z.array(z.string()).default([]),
    duration: z.string().optional(),
    completionDate: z.string().optional(),
    difficulty: z.string().optional(),
    programNote: z.string().optional(),
    hasPerusalScore: z.boolean().optional(),
    sheetMusic: z.array(sheetMusicSchema).default([]),
    recordings: z.array(recordingSchema).default([]),
    performances: z.array(z.object({
      date: z.string().optional(),
      venue: z.string().optional(),
      performers: z.array(z.string()).default([]),
      notes: z.string().optional(),
    })).default([]),
  }),
})

// 4. Export a single `collections` object to register you collection(s)
export const collections = { works }
