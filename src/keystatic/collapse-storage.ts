/**
 * Shared sessionStorage helpers for collapsible section state.
 * Key format: `ks-collapse:{pathname}:{id}` — per-page, per-collapsible.
 */

export function collapseStorageKey(id: string): string {
  return `ks-collapse:${window.location.pathname}:${id}`
}

export function readCollapseState(id: string, fallback: boolean): boolean {
  try {
    const stored = sessionStorage.getItem(collapseStorageKey(id))
    if (stored !== null) return stored === '1'
  } catch {
    /* SSR or restricted context */
  }
  return fallback
}

export function persistCollapseState(id: string, open: boolean): void {
  try {
    sessionStorage.setItem(collapseStorageKey(id), open ? '1' : '0')
  } catch {
    /* SSR or restricted context */
  }
}
