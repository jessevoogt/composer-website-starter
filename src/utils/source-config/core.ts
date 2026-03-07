/**
 * Source Config — Core
 *
 * Shared infrastructure for all source-config domain modules: paths,
 * memoized YAML reader, and Zod helpers.
 */

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { z } from 'astro/zod'

// ─── Paths ──────────────────────────────────────────────────────────────────

export const SOURCE_ROOT = path.resolve(process.cwd(), 'source')
export const SITE_DIR = path.join(SOURCE_ROOT, 'site')
export const PAGES_DIR = path.join(SOURCE_ROOT, 'pages')

// ─── Shared Zod helpers ──────────────────────────────────────────────────────

/** Coerce null (from Keystatic relationship fields) to empty string. */
export const nullableString = z
  .string()
  .nullable()
  .default(null)
  .transform((v) => v ?? '')

// ─── Generic YAML reader with memoization ───────────────────────────────────

const cache = new Map<string, unknown>()

/**
 * In dev mode, skip caching so that Keystatic edits to YAML files are
 * reflected immediately on the next page request. During production
 * builds, caching is safe because the build is a single pass.
 */
const isDev = import.meta.env.DEV

/**
 * Reads a YAML file, parses it with a Zod schema, and memoizes the result.
 * If the file doesn't exist, returns the fallback value.
 *
 * Caching is disabled in dev mode so that Keystatic GUI edits to YAML
 * files are picked up by the Astro dev server without a restart.
 *
 * We use `z.ZodSchema` and cast the return because Zod's input/output type
 * distinction (from `.default()`) prevents clean generic inference with `z.ZodType<T>`.
 */
export function readYaml<T>(filePath: string, schema: z.ZodSchema, fallback: T): T {
  if (!isDev) {
    const cached = cache.get(filePath)
    if (cached !== undefined) return cached as T
  }

  if (!fs.existsSync(filePath)) {
    if (!isDev) cache.set(filePath, fallback)
    return fallback
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = yaml.load(raw)
  const result = schema.parse(parsed) as T
  if (!isDev) cache.set(filePath, result)
  return result
}

/** Clear the memoization cache (useful for tests or watch mode). */
export function clearConfigCache(): void {
  cache.clear()
}

// Re-export fs, path, yaml, and z for convenience in domain modules
export { fs, path, yaml, z }
