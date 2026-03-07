/**
 * Source Config Reader
 *
 * Reads YAML configuration files from the `source/` directory at build time.
 * Each reader parses YAML with Zod validation for type safety.
 * Results are memoized per build to avoid redundant file reads.
 *
 * This module is the single source of truth for all site-wide configuration.
 * Components import these helpers instead of hardcoded data files.
 *
 * Implementation is split into domain modules in ./source-config/ for
 * maintainability. This file re-exports everything for backward compatibility.
 */

export * from './source-config/index'
