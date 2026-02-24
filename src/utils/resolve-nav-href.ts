import type { NavItem } from '@/utils/source-config'

/** Returns the correct href for a nav link based on the current page path. */
export function resolveNavHref(link: NavItem, currentPath: string): string {
  if (currentPath === '/' || !link.anchorTarget) return link.href
  return link.anchorTarget
}
