/**
 * Source Config — Perusal Access & Viewer
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Perusal Access Config ──────────────────────────────────────────────────

const perusalAccessGatingModes = ['magic-link', 'none'] as const
export type PerusalAccessGatingMode = (typeof perusalAccessGatingModes)[number]

const perusalAccessConfigSchema = z.object({
  gatingEnabled: z.boolean().default(false),
  gatingMode: z.enum(perusalAccessGatingModes).default('magic-link'),
  tokenExpirationDays: z.number().int().min(1).default(90),
  webhookUrl: z.string().default(''),
  tokenSecret: z.string().default(''),
  emailSubject: z.string().default('Your perusal score, {{firstName}} — {{workTitle}}'),
  emailMessage: z.string().default(''),
  pdfWatermarkedEnabled: z.boolean().default(true),
  pdfOriginalEnabled: z.boolean().default(false),
  pdfWatermarkedGated: z.boolean().default(true),
  pdfOriginalGated: z.boolean().default(true),
  nameMaxLength: z.number().int().min(1).default(120),
})

export type PerusalAccessConfig = z.infer<typeof perusalAccessConfigSchema>

export function getPerusalAccessConfig(): PerusalAccessConfig {
  return readYaml(
    path.join(SITE_DIR, 'perusal-access.yaml'),
    perusalAccessConfigSchema,
    perusalAccessConfigSchema.parse({}),
  )
}

/** Returns true when gating is enabled and the mode is 'magic-link'. */
export function isPerusalGatingActive(): boolean {
  const config = getPerusalAccessConfig()
  return config.gatingEnabled && config.gatingMode === 'magic-link'
}

// ─── Perusal Viewer Config ──────────────────────────────────────────

const perusalViewerModes = ['spreads', 'single'] as const
export type PerusalViewerMode = (typeof perusalViewerModes)[number]

const watermarkFonts = ['sans-serif', 'serif', 'heading', 'body'] as const
export type WatermarkFont = (typeof watermarkFonts)[number]

const perusalViewerConfigSchema = z.object({
  flipAnimationEnabled: z.boolean().default(true),
  defaultViewMode: z.enum(perusalViewerModes).default('spreads'),
  watermarkEnabled: z.boolean().default(true),
  watermarkText: z.string().default('PERUSAL COPY'),
  watermarkColor: z.string().default('#B40000'),
  watermarkOpacity: z.number().int().min(1).max(100).default(12),
  watermarkAngle: z.number().int().min(-90).max(90).default(-35),
  watermarkFont: z.enum(watermarkFonts).default('sans-serif'),
  watermarkFontScale: z.number().int().min(50).max(200).default(100),
  watermarkSpacing: z.number().int().min(50).max(300).default(100),
})

export type PerusalViewerConfig = z.infer<typeof perusalViewerConfigSchema>

export function getPerusalViewerConfig(): PerusalViewerConfig {
  return readYaml(
    path.join(SITE_DIR, 'score-viewer.yaml'),
    perusalViewerConfigSchema,
    perusalViewerConfigSchema.parse({}),
  )
}
