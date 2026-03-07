/**
 * Setup Wizard — shared helper functions.
 *
 * Error display, API calls, validation, file utilities,
 * tagline cycling, and token generation.
 */

import { TAGLINE_POOL } from './types'
import { wizard, errorRegion } from './dom'
import { state } from './state'

// ─── Error display ───────────────────────────────────────────────────────────

export function showError(message: string): void {
  if (!errorRegion) return
  errorRegion.textContent = message
  errorRegion.hidden = false

  // Scroll content area to top so the error is visible
  const content = wizard.querySelector<HTMLElement>('.setup-wizard__content')
  if (content) content.scrollTop = 0
}

export function clearError(): void {
  if (!errorRegion) return
  errorRegion.textContent = ''
  errorRegion.hidden = true
}

// ─── Button loading state ────────────────────────────────────────────────────

export function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  btn.disabled = loading
  if (loading) {
    btn.dataset.originalText = btn.textContent ?? ''
    btn.textContent = 'Saving\u2026'
  } else {
    btn.textContent = btn.dataset.originalText ?? btn.textContent
    delete btn.dataset.originalText
  }
}

// ─── API helpers ─────────────────────────────────────────────────────────────

export async function apiPost(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

export async function uploadFile(file: File, dest: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`/api/dev/setup/upload?dest=${encodeURIComponent(dest)}`, {
    method: 'PUT',
    body: file,
  })
  return response.json() as Promise<{ ok: boolean; error?: string }>
}

// ─── String / validation utilities ───────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

export function getFileExtension(file: File): string {
  const name = file.name
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Tagline cycling ─────────────────────────────────────────────────────────

/** Shuffled copy of TAGLINE_POOL so repeated "regenerate" clicks don't repeat. */
const shuffledTaglines = [...TAGLINE_POOL].sort(() => Math.random() - 0.5)

export function nextTagline(): string {
  state.taglineIndex = (state.taglineIndex + 1) % shuffledTaglines.length
  return shuffledTaglines[state.taglineIndex]
}

export function prefillTaglineIfEmpty(): void {
  const taglineField = wizard.querySelector<HTMLTextAreaElement>('#setup-hero-tagline')
  if (!taglineField) return

  const current = taglineField.value.trim()
  // Only prefill if empty or still has placeholder-like content
  if (!current) {
    taglineField.value = nextTagline()
  }
}

// ─── Token secret generator ──────────────────────────────────────────────────

export function generateTokenSecret(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function prefillTokenSecretIfEmpty(): void {
  const secretField = wizard.querySelector<HTMLInputElement>('#setup-perusal-token-secret')
  if (!secretField) return

  if (!secretField.value.trim()) {
    secretField.value = generateTokenSecret()
  }
}
