/**
 * Perusal score access token utilities.
 *
 * Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 *
 * Payload: { workId: string, email: string, firstName: string, exp: number }
 *
 * The HMAC is computed over the base64url-encoded payload string.
 * Uses Web Crypto API — works in both browser and modern Node.
 */

export interface PerusalTokenPayload {
  workId: string
  email: string
  firstName: string
  exp: number
}

export function encodeBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded)
}

export function parseTokenPayload(token: string): PerusalTokenPayload | null {
  const dotIndex = token.lastIndexOf('.')
  if (dotIndex <= 0) return null

  const payloadB64 = token.slice(0, dotIndex)
  try {
    const decoded = decodeBase64Url(payloadB64)
    const parsed: unknown = JSON.parse(decoded)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'workId' in parsed &&
      'email' in parsed &&
      'exp' in parsed &&
      typeof (parsed as PerusalTokenPayload).workId === 'string' &&
      typeof (parsed as PerusalTokenPayload).email === 'string' &&
      typeof (parsed as PerusalTokenPayload).exp === 'number'
    ) {
      return parsed as PerusalTokenPayload
    }
  } catch {
    // Invalid token
  }
  return null
}

export function isTokenExpired(payload: PerusalTokenPayload): boolean {
  return Date.now() > payload.exp
}

export function isTokenForWork(payload: PerusalTokenPayload, workId: string): boolean {
  return payload.workId === workId
}

/**
 * Derive an HMAC-SHA256 CryptoKey from a secret string.
 * Insecure fallback is only allowed in local dev contexts.
 */
function allowInsecureFallback(): boolean {
  if (import.meta.env?.DEV) return true

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return true
    }
  }

  return false
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const provided = secret.trim()
  const keyMaterial = provided || 'perusal-gate-default-dev-key'

  if (!provided && !allowInsecureFallback()) {
    throw new Error('HMAC secret is required outside local development.')
  }

  return crypto.subtle.importKey('raw', encoder.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createToken(payload: PerusalTokenPayload, secret: string): Promise<string> {
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = encodeBase64Url(payloadJson)

  const encoder = new TextEncoder()
  const key = await getHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64))
  const sigB64 = arrayBufferToBase64Url(signature)

  return `${payloadB64}.${sigB64}`
}

export async function verifyToken(
  token: string,
  workId: string,
  secret: string,
): Promise<{ valid: boolean; payload?: PerusalTokenPayload }> {
  const dotIndex = token.lastIndexOf('.')
  if (dotIndex <= 0) return { valid: false }

  const payloadB64 = token.slice(0, dotIndex)
  const signatureB64 = token.slice(dotIndex + 1)

  // Verify HMAC signature
  const encoder = new TextEncoder()
  const key = await getHmacKey(secret)
  const computedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64))
  const computedSigB64 = arrayBufferToBase64Url(computedSig)

  if (computedSigB64 !== signatureB64) return { valid: false }

  // Decode and validate payload
  const payload = parseTokenPayload(token)
  if (!payload) return { valid: false }
  if (!isTokenForWork(payload, workId)) return { valid: false }
  if (isTokenExpired(payload)) return { valid: false }

  return { valid: true, payload }
}

export async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(email.toLowerCase().trim())
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 8)
}
