/**
 * Source Config — Header
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

const headerElementValues = ['brand-logo', 'main-menu', 'site-search', 'mobile-menu'] as const
export type HeaderElement = (typeof headerElementValues)[number]

const headerBreakpoints = ['desktop', 'tablet', 'mobile'] as const
export type HeaderBreakpoint = (typeof headerBreakpoints)[number]

/** Accepts a single string (legacy) or an array of element names. */
function coerceSlotToArray(val: unknown): unknown {
  if (typeof val === 'string') return val === 'none' ? [] : [val]
  return val
}

const headerSlotSchema = z.preprocess(coerceSlotToArray, z.array(z.enum(headerElementValues)).default([]))

function makeHeaderSchema(defaults: { left: HeaderElement[]; center: HeaderElement[]; right: HeaderElement[] }) {
  return z.object({
    slots: z
      .object({
        left: headerSlotSchema.default(defaults.left),
        center: headerSlotSchema.default(defaults.center),
        right: headerSlotSchema.default(defaults.right),
      })
      .default(defaults),
  })
}

const headerBreakpointDefaults: Record<
  HeaderBreakpoint,
  { left: HeaderElement[]; center: HeaderElement[]; right: HeaderElement[] }
> = {
  desktop: { left: ['brand-logo'], center: [], right: ['main-menu', 'site-search'] },
  tablet: { left: ['brand-logo'], center: [], right: ['mobile-menu', 'site-search'] },
  mobile: { left: ['brand-logo'], center: [], right: ['mobile-menu'] },
}

export interface HeaderConfig {
  left: HeaderElement[]
  center: HeaderElement[]
  right: HeaderElement[]
}
export type ResponsiveHeaderConfigs = Record<HeaderBreakpoint, HeaderConfig>

export function getHeaderConfigForBreakpoint(bp: HeaderBreakpoint): HeaderConfig {
  const schema = makeHeaderSchema(headerBreakpointDefaults[bp])
  const raw = readYaml(path.join(SITE_DIR, `header-${bp}.yaml`), schema, schema.parse({}))
  return { left: raw.slots.left, center: raw.slots.center, right: raw.slots.right }
}

export function getResponsiveHeaderConfigs(): ResponsiveHeaderConfigs {
  return {
    desktop: getHeaderConfigForBreakpoint('desktop'),
    tablet: getHeaderConfigForBreakpoint('tablet'),
    mobile: getHeaderConfigForBreakpoint('mobile'),
  }
}

/** Returns which slot contains the given element, or null if not placed. */
export function findHeaderSlot(config: HeaderConfig, element: HeaderElement): 'left' | 'center' | 'right' | null {
  if (config.left.includes(element)) return 'left'
  if (config.center.includes(element)) return 'center'
  if (config.right.includes(element)) return 'right'
  return null
}

/** Returns true if the given element appears in any header slot. */
export function headerHasElement(config: HeaderConfig, element: HeaderElement): boolean {
  return findHeaderSlot(config, element) !== null
}

/** Returns true if the given element appears in any breakpoint's config. */
export function anyHeaderHasElement(configs: ResponsiveHeaderConfigs, element: HeaderElement): boolean {
  return headerBreakpoints.some((bp) => headerHasElement(configs[bp], element))
}
