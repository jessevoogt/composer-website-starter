/**
 * Source Config — Miscellaneous
 *
 * Global layout, redirects, breadcrumbs, email layout, and score PDF config.
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Global Layout ──────────────────────────────────────────────────────────

const globalLayoutSchema = z.object({
  sections: z
    .array(z.object({ key: z.string() }))
    .default([{ key: 'header' }, { key: 'breadcrumbs' }, { key: 'footer' }, { key: 'social-media' }]),
})

export type GlobalLayoutConfig = z.infer<typeof globalLayoutSchema>

export function getGlobalLayout(): GlobalLayoutConfig {
  return readYaml(path.join(SITE_DIR, 'global-layout.yaml'), globalLayoutSchema, globalLayoutSchema.parse({}))
}

// ─── Redirects ──────────────────────────────────────────────────────────────

const redirectRuleSchema = z.object({
  from: z.string(),
  to: z.string().default(''),
  type: z.enum(['301', '302', '410']).default('301'),
  matchType: z.enum(['exact', 'prefix']).default('exact'),
  enabled: z.boolean().default(true),
  note: z.string().default(''),
})

const redirectsSchema = z.object({
  rules: z.array(redirectRuleSchema).default([]),
})

export type RedirectRule = z.infer<typeof redirectRuleSchema>
export type RedirectsConfig = z.infer<typeof redirectsSchema>

export function getRedirects(): RedirectsConfig {
  return readYaml(path.join(SITE_DIR, 'redirects.yaml'), redirectsSchema, redirectsSchema.parse({}))
}

// ─── Breadcrumbs Config ─────────────────────────────────────────────────────

const breadcrumbsConfigSchema = z.object({
  homeCrumbLabel: z.string().default('Home'),
})

export type BreadcrumbsConfig = z.infer<typeof breadcrumbsConfigSchema>

export function getBreadcrumbsConfig(): BreadcrumbsConfig {
  return readYaml(path.join(SITE_DIR, 'breadcrumbs.yaml'), breadcrumbsConfigSchema, breadcrumbsConfigSchema.parse({}))
}

// ─── Email Layout Config ────────────────────────────────────────────────────

const emailLayoutConfigSchema = z.object({
  showHeaderFavicon: z.boolean().default(true),
  showSignatureLogo: z.boolean().default(true),
  signatureLogoWidth: z.number().int().min(60).max(400).default(160),
})

export type EmailLayoutConfig = z.infer<typeof emailLayoutConfigSchema>

export function getEmailLayoutConfig(): EmailLayoutConfig {
  return readYaml(path.join(SITE_DIR, 'email-layout.yaml'), emailLayoutConfigSchema, emailLayoutConfigSchema.parse({}))
}

// ─── Score: PDF Config ──────────────────────────────────────────────────────

const watermarkOverridesSchema = z.object({
  watermarkText: z.string().default(''),
  watermarkColor: z.string().default(''),
  watermarkOpacity: z.number().default(12),
  watermarkAngle: z.number().default(-35),
  watermarkFont: z.string().default('sans-serif'),
  watermarkFontScale: z.number().default(100),
  watermarkSpacing: z.number().default(100),
})

const scorePdfConfigSchema = z.object({
  downloadFilenameFormat: z.string().default('{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}'),
  downloadWatermarkedSuffix: z.string().default('PERUSAL SCORE'),
  downloadOriginalSuffix: z.string().default(''),
  watermarkOverrides: z
    .object({
      discriminant: z.boolean().default(false),
      value: watermarkOverridesSchema.nullable().default(null),
    })
    .default({ discriminant: false, value: null }),
})

export type ScorePdfConfig = z.infer<typeof scorePdfConfigSchema>

export function getScorePdfConfig(): ScorePdfConfig {
  return readYaml(path.join(SITE_DIR, 'score-pdf.yaml'), scorePdfConfigSchema, scorePdfConfigSchema.parse({}))
}
