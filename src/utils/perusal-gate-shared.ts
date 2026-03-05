/**
 * Shared perusal gate utilities.
 *
 * Pure functions for token management, storage, verification, and submission.
 * No side effects — safe to import from any script without triggering
 * initialisation logic.
 */

import { hashEmail, verifyToken } from './perusal-token'
import { trackAnalyticsEvent } from '../scripts/analytics-events'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GateConfig {
  workId: string
  workTitle: string
  apiEndpoint: string
  webhookUrl: string
  tokenSecret: string
  tokenExpirationDays: number
  /** URL of the perusal score page (set when the dialog is on a work detail page) */
  perusalScoreUrl: string
  /** Composer email for mailto fallback */
  composerEmail: string
}

// ── URL helpers ──────────────────────────────────────────────────────────────

export function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('token')
}

export function stripTokenFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', url.toString())
}

// ── localStorage persistence ─────────────────────────────────────────────────

export const STORAGE_PREFIX = 'perusal_gate:'

export function storeToken(workId: string, token: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + workId, token)
  } catch {
    // Storage full or unavailable — silently degrade.
  }
}

export function getStoredToken(workId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + workId)
  } catch {
    return null
  }
}

export function clearStoredToken(workId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + workId)
  } catch {
    // Ignore.
  }
}

// ── Token verification ───────────────────────────────────────────────────────

export async function verifyTokenViaApi(
  token: string,
  workId: string,
  apiEndpoint: string,
): Promise<{ valid: boolean; email?: string }> {
  try {
    const response = await fetch(`${apiEndpoint}/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, workId }),
    })
    if (!response.ok) return { valid: false }
    return (await response.json()) as { valid: boolean; email?: string }
  } catch {
    return { valid: false }
  }
}

export async function verifyTokenClientSide(
  token: string,
  workId: string,
  secret: string,
): Promise<{ valid: boolean; email?: string }> {
  const result = await verifyToken(token, workId, secret)
  if (result.valid && result.payload) {
    return { valid: true, email: result.payload.email }
  }
  return { valid: false }
}

export async function verifyTokenWithFallback(
  token: string,
  workId: string,
  config: Pick<GateConfig, 'apiEndpoint' | 'tokenSecret'>,
): Promise<{ valid: boolean; email?: string }> {
  // Try API verification first
  if (config.apiEndpoint) {
    const apiResult = await verifyTokenViaApi(token, workId, config.apiEndpoint)
    if (apiResult.valid) return apiResult
    // API failed or returned invalid — fall through to client-side
  }

  // Fall back to client-side verification
  if (config.tokenSecret) {
    return verifyTokenClientSide(token, workId, config.tokenSecret)
  }

  return { valid: false }
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function trackPerusalAccess(workId: string, email: string): Promise<void> {
  const viewerHash = await hashEmail(email)
  trackAnalyticsEvent('perusal_score_view', {
    work_id: workId,
    viewer_id: viewerHash,
  })
}

// ── Submission ───────────────────────────────────────────────────────────────

export async function submitToWebhook(webhookUrl: string, data: Record<string, string>): Promise<void> {
  if (!webhookUrl) return
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      mode: 'no-cors',
    })
  } catch {
    // Fire-and-forget
  }
}

export async function submitToApi(
  apiEndpoint: string,
  data: Record<string, string>,
): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(`${apiEndpoint}/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return { success: false, message: 'Failed to send access link. Please try again.' }
    }
    return { success: true }
  } catch {
    return { success: false, message: 'Network error. Please check your connection and try again.' }
  }
}

// ── Config reader ────────────────────────────────────────────────────────────

/** Read GateConfig from a dialog element's data attributes. */
export function readConfigFromDialog(dialog: HTMLDialogElement): GateConfig {
  return {
    workId: dialog.dataset.workId ?? '',
    workTitle: dialog.dataset.workTitle ?? '',
    apiEndpoint: dialog.dataset.perusalApiEndpoint ?? '',
    webhookUrl: dialog.dataset.perusalWebhookUrl ?? '',
    tokenSecret: dialog.dataset.perusalTokenSecret ?? '',
    tokenExpirationDays: parseInt(dialog.dataset.perusalTokenExpDays ?? '90', 10),
    perusalScoreUrl: dialog.dataset.perusalScoreUrl ?? '',
    composerEmail: dialog.dataset.composerEmail ?? '',
  }
}
