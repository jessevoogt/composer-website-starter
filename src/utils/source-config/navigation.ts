/**
 * Source Config — Navigation
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  enabled: z.boolean().default(true),
  order: z.number().default(0),
  /** For anchor links that target homepage sections. Inner pages use this instead of href. */
  anchorTarget: z.string().optional(),
})

export type NavItem = z.infer<typeof navItemSchema>

const navigationSchema = z.object({
  menuItems: z.array(navItemSchema).default([
    { label: 'Music', href: '/music/', enabled: true, order: 0 },
    { label: 'About', href: '/about/', enabled: true, order: 1 },
    { label: 'Contact', href: '/contact/', enabled: true, order: 2 },
  ]),
})

export type NavigationConfig = z.infer<typeof navigationSchema>

export function getNavigation(): NavigationConfig {
  return readYaml(path.join(SITE_DIR, 'navigation.yaml'), navigationSchema, navigationSchema.parse({}))
}

/** Returns only enabled menu items, sorted by order. */
export function getPrimaryNavLinks(): NavItem[] {
  const nav = getNavigation()
  return nav.menuItems.filter((item) => item.enabled).sort((a, b) => a.order - b.order)
}
