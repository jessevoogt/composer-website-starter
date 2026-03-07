/**
 * Source Config — Footer
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

// ─── Footer Block ───────────────────────────────────────────────────────

const footerSlotValues = ['copyright', 'footer-menu', 'none'] as const

const footerBlockConfigSchema = z.object({
  leftSlot: z.enum(footerSlotValues).default('copyright'),
  centerSlot: z.enum(footerSlotValues).default('none'),
  rightSlot: z.enum(footerSlotValues).default('footer-menu'),
})

export type FooterBlockConfig = z.infer<typeof footerBlockConfigSchema>

export function getFooterBlockConfig(): FooterBlockConfig {
  return readYaml(path.join(SITE_DIR, 'footer.yaml'), footerBlockConfigSchema, footerBlockConfigSchema.parse({}))
}

// ─── Footer Menu ────────────────────────────────────────────────────────

const footerMenuConfigSchema = z.object({
  links: z.array(z.object({ label: z.string(), href: z.string() })).default([
    { label: 'Accessibility', href: '/accessibility-statement/' },
    { label: 'Sitemap', href: '/sitemap/' },
  ]),
})

export type FooterMenuConfig = z.infer<typeof footerMenuConfigSchema>

export function getFooterMenuConfig(): FooterMenuConfig {
  return readYaml(path.join(SITE_DIR, 'footer-menu.yaml'), footerMenuConfigSchema, footerMenuConfigSchema.parse({}))
}
