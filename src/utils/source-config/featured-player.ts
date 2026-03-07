/**
 * Source Config — Featured Player
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

const featuredPlayerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  position: z.enum(['top', 'bottom', 'header-center']).default('bottom'),
  showScrubber: z.boolean().default(true),
  showMuteToggle: z.boolean().default(true),
  showVolumeControl: z.boolean().default(true),
  showDuration: z.boolean().default(true),
  showInfoButton: z.boolean().default(true),
  showTrackInfo: z.boolean().default(true),
  trackInfoScrollingText: z.boolean().default(true),
  showPrevButton: z.boolean().default(true),
  showNextButton: z.boolean().default(true),
})

export type FeaturedPlayerConfig = z.infer<typeof featuredPlayerConfigSchema>

export function getFeaturedPlayerConfig(): FeaturedPlayerConfig {
  return readYaml(
    path.join(SITE_DIR, 'featured-player.yaml'),
    featuredPlayerConfigSchema,
    featuredPlayerConfigSchema.parse({}),
  )
}
