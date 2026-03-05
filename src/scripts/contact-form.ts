/**
 * Contact form AJAX handler.
 *
 * Dual-channel submission with resilient error handling:
 *
 * 1. **Webhook** (`data-contact-webhook-url`):
 *    Always fires as fire-and-forget backup data capture.
 *
 * 2. **API** (`data-contact-api-endpoint`):
 *    POST JSON to the API's /contact endpoint. On failure, shows
 *    a retry button + mailto fallback link.
 *
 * 3. **Webhook-only mode** (no API endpoint):
 *    Fire-and-forget POST to webhook, show success immediately.
 *
 * If neither attribute is present, native form behavior is untouched.
 */

import { navigate } from 'astro:transitions/client'
import { trackAnalyticsEvent } from './analytics-events'
import { initTextareaCounter } from './character-counter'

interface ContactFormWindow extends Window {
  __contactFormBound?: boolean
}

function initContactForm(): () => void {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]')
  if (!form) return () => {}

  const apiEndpoint = form.dataset.contactApiEndpoint ?? ''
  const webhookUrl = form.dataset.contactWebhookUrl ?? ''
  const composerEmail = form.dataset.composerEmail ?? ''

  // Character counter on the message textarea (independent of submit channels).
  let teardownCounter: (() => void) | undefined
  if (form.dataset.charCounterEnabled === 'true') {
    const threshold = parseInt(form.dataset.charCounterThreshold ?? '50', 10)
    teardownCounter = initTextareaCounter(form, threshold)
  }

  // If neither is configured, let native form behavior continue.
  if (!apiEndpoint && !webhookUrl) return () => { teardownCounter?.() }

  const submitBtn = form.querySelector<HTMLButtonElement>('[type="submit"]')
  const submitLabel = form.querySelector<HTMLElement>('[data-contact-submit-label]')
  const spinner = form.querySelector<HTMLElement>('[data-contact-spinner]')
  const successEl = form.querySelector<HTMLElement>('[data-contact-success]')
  const errorEl = form.querySelector<HTMLElement>('[data-contact-error]')

  function setLoading(loading: boolean): void {
    if (submitBtn) submitBtn.disabled = loading
    if (submitLabel) submitLabel.hidden = loading
    if (spinner) spinner.hidden = !loading
    form!.setAttribute('aria-busy', loading ? 'true' : 'false')
  }

  function resetFeedback(): void {
    if (successEl) successEl.hidden = true
    if (errorEl) errorEl.hidden = true
  }

  function showErrorWithFallback(userName: string, userMessage: string): void {
    if (!errorEl) return

    const truncatedMessage = userMessage.length > 500 ? userMessage.slice(0, 500) + '...' : userMessage
    const subject = encodeURIComponent(`Contact form error – ${userName || 'Unknown'}`)
    const body = encodeURIComponent(
      `Hi,\n\nI tried to send a message via the contact form but encountered an error.\n\nName: ${userName}\n\nOriginal message:\n${truncatedMessage}`,
    )
    const mailtoHref = composerEmail ? `mailto:${composerEmail}?subject=${subject}&body=${body}` : ''

    const mailtoLink = mailtoHref
      ? `<span class="contact-error-divider">or</span> <a href="${mailtoHref}" class="contact-error-mailto">send a direct email</a>`
      : ''

    errorEl.innerHTML = `
      <p>Something went wrong. You can try again${mailtoHref ? ' or send a direct email' : ''}.</p>
      <div class="contact-error-actions">
        <button type="button" class="contact-error-retry">Try Again</button>
        ${mailtoLink}
      </div>
    `
    errorEl.hidden = false
    errorEl.focus()

    const retryBtn = errorEl.querySelector<HTMLButtonElement>('.contact-error-retry')
    retryBtn?.addEventListener(
      'click',
      () => {
        resetFeedback()
        setLoading(false)
        form!.querySelector<HTMLInputElement>('[name="name"]')?.focus()
      },
      { once: true },
    )
  }

  async function onSubmit(event: Event): Promise<void> {
    event.preventDefault()
    resetFeedback()

    // Check honeypot
    const honeypot = form!.querySelector<HTMLInputElement>('[name="website"]')
    if (honeypot?.value) return

    // Validate with native constraint validation
    if (!form!.checkValidity()) {
      form!.reportValidity()
      return
    }

    setLoading(true)

    const formData = new FormData(form!)
    const data: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (key !== 'website' && typeof value === 'string') {
        data[key] = value
      }
    }
    data.timestamp = new Date().toISOString()

    const userName = data.name ?? ''
    const userMessage = data.request ?? ''

    // ── Dual channel: always fire webhook as backup data capture ──
    if (webhookUrl) {
      try {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          mode: 'no-cors',
        }).catch(() => {
          // Fire-and-forget — ignore errors.
        })
      } catch {
        // Ignore.
      }
    }

    // ── Try API (production mode) ──
    if (apiEndpoint) {
      try {
        const response = await fetch(`${apiEndpoint}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        setLoading(false)
        if (response.ok) {
          form!.reset()
          trackAnalyticsEvent('contact_form_submit', { status: 'success' })
          navigate('/contact/thank-you/')
        } else {
          showErrorWithFallback(userName, userMessage)
          trackAnalyticsEvent('contact_form_submit', { status: 'error' })
        }
      } catch {
        setLoading(false)
        showErrorWithFallback(userName, userMessage)
        trackAnalyticsEvent('contact_form_submit', { status: 'network_error' })
      }
      return
    }

    // ── No API — webhook-only mode (interim): navigate to thank-you ──
    form!.reset()
    setLoading(false)
    trackAnalyticsEvent('contact_form_submit', { status: 'success' })
    window.location.href = '/contact/thank-you/'
  }

  const handler = (e: Event) => {
    void onSubmit(e)
  }

  form.addEventListener('submit', handler)

  return () => {
    form.removeEventListener('submit', handler)
    teardownCounter?.()
  }
}

// Astro View Transition lifecycle
const contactWindow = window as ContactFormWindow
if (!contactWindow.__contactFormBound) {
  contactWindow.__contactFormBound = true

  document.addEventListener('astro:page-load', () => {
    const teardown = initContactForm()
    document.addEventListener('astro:before-swap', () => teardown(), { once: true })
  })
}
