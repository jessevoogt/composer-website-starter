/**
 * Source Config — Social Links & Sharing
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Social Links ───────────────────────────────────────────────────────

const socialPlatforms = [
  'instagram',
  'youtube',
  'facebook',
  'soundcloud',
  'twitter',
  'linkedin',
  'tiktok',
  'bandcamp',
] as const

export type SocialPlatform = (typeof socialPlatforms)[number]

const socialLinkSchema = z.object({
  platform: z.enum(socialPlatforms),
  url: z.string(),
  enabled: z.boolean().default(true),
})

export type SocialLink = z.infer<typeof socialLinkSchema>

const socialSchema = z.object({
  links: z.array(socialLinkSchema).default([]),
})

export function getSocialLinks(): SocialLink[] {
  const config = readYaml(path.join(SITE_DIR, 'social.yaml'), socialSchema, socialSchema.parse({}))
  return config.links.filter((link) => link.enabled)
}

// ─── Sharing Config (Page: Work Detail: Share Links) ────────────────────

const shareOptions = ['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link', 'linkedin'] as const

export type ShareOption = (typeof shareOptions)[number]

const sharingSchema = z.object({
  enabledShares: z
    .array(z.enum(shareOptions))
    .default(['facebook', 'twitter', 'threads', 'bluesky', 'email', 'copy-link']),
  facebookAppId: z.string().default(''),
  hidden: z.boolean().default(false),
  sectionTitle: z.string().default('Share this work'),
  sectionDescription: z.string().default('Like this work? Share it with your network!'),
})

export type SharingConfig = z.infer<typeof sharingSchema>

export function getSharingConfig(): SharingConfig {
  return readYaml(path.join(SITE_DIR, 'sharing.yaml'), sharingSchema, sharingSchema.parse({}))
}
