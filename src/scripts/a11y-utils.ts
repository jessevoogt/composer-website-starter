/** Cached reduced motion media query for efficient repeated access. */
const reducedMotionQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

/** Returns true when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false
}

/** Returns the MediaQueryList for listeners that need to react to changes. */
export function getReducedMotionQuery(): MediaQueryList | null {
  return reducedMotionQuery
}
