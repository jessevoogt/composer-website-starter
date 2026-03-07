/**
 * Source Config — Brand Logo
 */

import { z } from 'astro/zod'
import { readYaml, SOURCE_ROOT, path } from './core'
import { getSiteConfig } from './site'

const brandModes = ['text', 'plugin', 'custom'] as const
export type BrandMode = (typeof brandModes)[number]
const brandPluginIds = ['custom-animation'] as const
export type BrandPluginId = (typeof brandPluginIds)[number]

const brandConfigSchema = z.object({
  mode: z.enum(brandModes).default('text'),
  pluginId: z.enum(brandPluginIds).default('custom-animation'),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
})

export type BrandConfig = z.infer<typeof brandConfigSchema>

export function getBrandConfig(): BrandConfig {
  const config = readYaml(
    path.join(SOURCE_ROOT, 'branding', 'brand-logo.yaml'),
    brandConfigSchema,
    brandConfigSchema.parse({}),
  )
  // Derive first/last name from composerName if not set
  if (!config.firstName && !config.lastName) {
    const site = getSiteConfig()
    const parts = site.composerName.split(' ')
    return {
      ...config,
      firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
      lastName: parts.length > 1 ? parts[parts.length - 1] || '' : '',
    }
  }
  return config
}
