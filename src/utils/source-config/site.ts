/**
 * Source Config — Site & Copyright
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Site Config ────────────────────────────────────────────────────────────

const siteConfigSchema = z.object({
  composerName: z.string().default('Composer Name'),
  siteTitle: z.string().default('Composer Portfolio'),
  siteDescription: z.string().default('A portfolio of original compositions.'),
  siteUrl: z.string().default(''),
  email: z.string().default(''),
  googleAnalyticsId: z.string().default(''),
  apiEndpoint: z.string().default(''),
  perusalScoreOnlyMode: z.boolean().default(false),
})

export type SiteConfig = z.infer<typeof siteConfigSchema>

export function getSiteConfig(): SiteConfig {
  return readYaml(path.join(SITE_DIR, 'site.yaml'), siteConfigSchema, siteConfigSchema.parse({}))
}

/** Returns true if the site still has the default starter-kit placeholder name. */
export function isPlaceholderConfig(): boolean {
  const site = getSiteConfig()
  return site.composerName === 'FirstName LastName'
}

// ─── Copyright ──────────────────────────────────────────────────────────────

const copyrightConfigSchema = z.object({
  copyrightHolder: z.string().default(''),
})

export type CopyrightConfig = z.infer<typeof copyrightConfigSchema>

export function getCopyrightConfig(): CopyrightConfig {
  return readYaml(path.join(SITE_DIR, 'copyright.yaml'), copyrightConfigSchema, copyrightConfigSchema.parse({}))
}
