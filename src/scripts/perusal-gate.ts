/**
 * Perusal score gating controller.
 *
 * Works in three contexts:
 *
 * 1. **Perusal score page** (`[data-perusal-page]` present):
 *    - Checks URL for ?token= and verifies it
 *    - If valid: reveals score, fires GA event, strips token
 *    - If invalid/missing: locks score and opens gating dialog
 *
 * 2. **Request score access page** (`[data-request-score-access-page]` present):
 *    - If user has a valid stored token: redirects to perusal score page
 *    - Otherwise: auto-opens the gating dialog
 *    - Cancel navigates back to work detail page via View Transition
 *
 * 3. **Work detail page** (no special markers, score link present):
 *    - Optimistically upgrades "View Score" button if user has a stored token
 *      (points directly to perusal-score instead of request-score-access)
 */

import { navigate } from 'astro:transitions/client'
import { trackAnalyticsEvent } from './analytics-events'
import { createToken } from '../utils/perusal-token'
import {
  type GateConfig,
  getTokenFromUrl,
  stripTokenFromUrl,
  storeToken,
  getStoredToken,
  clearStoredToken,
  verifyTokenWithFallback,
  trackPerusalAccess,
  submitToWebhook,
  submitToApi,
  readConfigFromDialog,
} from '../utils/perusal-gate-shared'

interface PerusalGateWindow extends Window {
  __perusalGateBound?: boolean
}

/**
 * Holds the active View Transition's `.finished` promise so that
 * `showGateDialog` can wait for the transition animation to complete
 * before fading in the dialog. Without this, the dialog becomes visible
 * while the transition snapshot images are still rendering on top of
 * the real DOM's top layer, causing a z-index flash.
 */
let pendingViewTransition: { finished: Promise<void> } | null = null

// ── Dialog controller (shared between perusal-score and request-score-access) ─

function initGateDialog(
  config: GateConfig,
  opts: { autoOpen: boolean; onUnlock?: () => void; alertMessage?: string },
): () => void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-perusal-gate-dialog]')
  const panel = dialog?.querySelector<HTMLElement>('[data-perusal-gate-panel]')
  const form = dialog?.querySelector<HTMLFormElement>('[data-perusal-gate-form]')
  const formView = dialog?.querySelector<HTMLElement>('[data-perusal-gate-form-view]')
  const successEl = dialog?.querySelector<HTMLElement>('[data-perusal-gate-success]')
  const errorEl = dialog?.querySelector<HTMLElement>('[data-perusal-gate-error-message]')
  const submitBtn = dialog?.querySelector<HTMLButtonElement>('[data-perusal-gate-submit]')
  const submitLabel = dialog?.querySelector<HTMLElement>('[data-perusal-gate-submit-label]')
  const spinner = dialog?.querySelector<HTMLElement>('[data-perusal-gate-spinner]')
  const cancelBtn = dialog?.querySelector<HTMLButtonElement>('[data-perusal-gate-cancel]')
  const firstNameInput = dialog?.querySelector<HTMLInputElement>('[name="firstName"]')

  if (!dialog || !form || !panel) return () => {}

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const closeAnimationMs = 180

  let closeTimer = 0
  let openFrame = 0

  function clearTimers(): void {
    if (closeTimer) {
      window.clearTimeout(closeTimer)
      closeTimer = 0
    }
    if (openFrame) {
      window.cancelAnimationFrame(openFrame)
      openFrame = 0
    }
  }

  function syncClosedState(): void {
    dialog!.classList.remove('is-visible', 'is-closing')
  }

  function finishClose(reason = 'dismiss'): void {
    clearTimers()
    if (dialog!.open) {
      dialog!.close(reason)
      return
    }
    syncClosedState()
  }

  function closeGateDialog(reason = 'dismiss'): void {
    clearTimers()
    if (!dialog!.open) {
      syncClosedState()
      return
    }
    if (prefersReducedMotion) {
      finishClose(reason)
      return
    }
    dialog!.classList.remove('is-visible')
    dialog!.classList.add('is-closing')
    closeTimer = window.setTimeout(() => {
      finishClose(reason)
    }, closeAnimationMs)
  }

  function showGateDialog(): void {
    if (dialog!.open) return

    // Put the dialog in the top layer at opacity 0. During a View
    // Transition the snapshot images render above the top layer, so
    // this is invisible until we add `is-visible` after the transition.
    dialog!.showModal()
    dialog!.classList.remove('is-closing')

    const makeVisible = (): void => {
      if (prefersReducedMotion) {
        dialog!.classList.add('is-visible')
      } else {
        openFrame = window.requestAnimationFrame(() => {
          openFrame = window.requestAnimationFrame(() => {
            openFrame = 0
            dialog!.classList.add('is-visible')
          })
        })
      }
    }

    // If a View Transition is animating, wait for it to finish before
    // making the dialog visible. This prevents the dialog from appearing
    // behind the transition snapshot images during the cross-fade.
    if (pendingViewTransition) {
      pendingViewTransition.finished.then(makeVisible).catch(makeVisible)
    } else {
      makeVisible()
    }

    // Focus the first name input so the user can start typing immediately.
    // Falls back to the panel container if the input isn't found.
    const focusTarget = firstNameInput ?? panel!
    focusTarget.focus({ preventScroll: true })

    trackAnalyticsEvent('perusal_gate_shown', {
      work_id: config.workId,
    })
  }

  function setSubmitLoading(loading: boolean): void {
    if (submitBtn) submitBtn.disabled = loading
    if (submitLabel) submitLabel.hidden = loading
    if (spinner) spinner.hidden = !loading
    if (form) form.setAttribute('aria-busy', loading ? 'true' : 'false')
  }

  function resetToForm(): void {
    if (formView) formView.hidden = false
    if (successEl) successEl.hidden = true
    if (errorEl) errorEl.hidden = true
    setSubmitLoading(false)
    const focusTarget = firstNameInput ?? panel!
    focusTarget.focus({ preventScroll: true })
  }

  function showErrorWithFallback(
    firstName: string,
    email: string,
    customMessage?: string,
    customMailtoBody?: string,
  ): void {
    if (!errorEl) return

    const subject = encodeURIComponent(`Score access request error – ${config.workTitle || config.workId}`)
    const defaultBody = firstName
      ? `Hi,\n\nI tried to request access to the perusal score for "${config.workTitle || config.workId}" but encountered an error.\n\nMy name is ${firstName} and my email is ${email}.`
      : `Hi,\n\nI previously requested access to the perusal score for "${config.workTitle || config.workId}" but am having trouble accessing it.`
    const body = encodeURIComponent(customMailtoBody ?? defaultBody)
    const mailtoHref = config.composerEmail ? `mailto:${config.composerEmail}?subject=${subject}&body=${body}` : ''

    const mailtoLink = mailtoHref
      ? `<span class="perusal-gate-error-divider">or</span> <a href="${mailtoHref}" class="perusal-gate-error-mailto">send a direct email</a>`
      : ''

    const message =
      customMessage ?? `Something went wrong. You can try again${mailtoHref ? ' or send a direct email' : ''}.`

    errorEl.innerHTML = `
      <p>${message}</p>
      <div class="perusal-gate-error-actions">
        <button type="button" class="perusal-gate-error-retry">Try Again</button>
        ${mailtoLink}
      </div>
    `
    errorEl.hidden = false
    if (formView) formView.hidden = true
    errorEl.focus()

    const retryBtn = errorEl.querySelector<HTMLButtonElement>('.perusal-gate-error-retry')
    retryBtn?.addEventListener('click', resetToForm, { once: true })
  }

  function clearFieldErrors(): void {
    const errors = form!.querySelectorAll<HTMLElement>('[data-field-error]')
    for (const el of errors) {
      el.textContent = ''
    }
  }

  function setFieldError(fieldName: string, message: string): void {
    const el = form!.querySelector<HTMLElement>(`[data-field-error="${fieldName}"]`)
    if (el) el.textContent = message
  }

  function validateForm(): boolean {
    clearFieldErrors()
    let valid = true

    const firstName = form!.querySelector<HTMLInputElement>('[name="firstName"]')
    const email = form!.querySelector<HTMLInputElement>('[name="email"]')

    if (firstName && !firstName.value.trim()) {
      setFieldError('firstName', 'Please enter your first name.')
      if (valid) firstName.focus()
      valid = false
    }

    if (email && !email.value.trim()) {
      setFieldError('email', 'Please enter your email address.')
      if (valid) email.focus()
      valid = false
    } else if (email && !email.validity.valid) {
      setFieldError('email', 'Please enter a valid email address.')
      if (valid) email.focus()
      valid = false
    }

    return valid
  }

  async function onFormSubmit(event: Event): Promise<void> {
    event.preventDefault()

    // Check honeypot
    const honeypot = form!.querySelector<HTMLInputElement>('[name="website"]')
    if (honeypot?.value) return

    if (!validateForm()) return

    setSubmitLoading(true)
    if (errorEl) errorEl.hidden = true

    const formData = new FormData(form!)
    const firstName = (formData.get('firstName') as string)?.trim() ?? ''
    const email = (formData.get('email') as string)?.trim().toLowerCase() ?? ''

    const submissionData: Record<string, string> = {
      firstName,
      email,
      workId: config.workId,
      timestamp: new Date().toISOString(),
    }

    // ── Dual channel: always fire webhook as backup data capture ──
    submitToWebhook(config.webhookUrl, submissionData)

    // ── Try API first (production mode) ──
    if (config.apiEndpoint) {
      const result = await submitToApi(config.apiEndpoint, submissionData)

      if (result.success) {
        trackAnalyticsEvent('perusal_gate_submit', {
          work_id: config.workId,
          status: 'success',
        })
        navigate(`/music/${config.workId}/perusal-score/thank-you/`)
        return
      }

      // API failed — fall through to client-side token as fallback
    }

    // ── Client-side token generation (interim mode or API fallback) ──
    if (config.tokenSecret) {
      const payload = {
        workId: config.workId,
        email,
        firstName,
        exp: Date.now() + config.tokenExpirationDays * 24 * 60 * 60 * 1000,
      }

      try {
        const token = await createToken(payload, config.tokenSecret)

        // Persist token so returning visitors skip the gate.
        storeToken(config.workId, token)

        trackAnalyticsEvent('perusal_gate_submit', {
          work_id: config.workId,
          status: 'success',
        })

        // Navigate to access-granted page (token is already in localStorage)
        navigate(`/music/${config.workId}/perusal-score/access-granted/`)
        return
      } catch {
        // Token generation failed — fall through to error fallback
      }
    }

    // ── All channels failed — show error with retry + mailto ──
    setSubmitLoading(false)
    showErrorWithFallback(firstName, email)
    trackAnalyticsEvent('perusal_gate_submit', {
      work_id: config.workId,
      status: 'error',
    })
  }

  // --- Event listeners ---

  const onSubmit = (e: Event) => {
    void onFormSubmit(e)
  }

  const onCancelClick = (): void => {
    trackAnalyticsEvent('perusal_gate_cancel', {
      work_id: config.workId,
    })

    // On the perusal score page, navigate back to the work detail page
    // rather than just closing the dialog (the score stays locked — dead end).
    const perusalPage = document.querySelector<HTMLElement>('[data-perusal-page]')
    if (perusalPage) {
      const workUrl = window.location.pathname.replace(/\/perusal-score\/?$/, '/')
      window.location.href = workUrl
      return
    }

    // On the request-score-access page, navigate back to the work detail
    // page via Astro View Transition for a smooth animated return.
    const requestPage = document.querySelector<HTMLElement>('[data-request-score-access-page]')
    if (requestPage) {
      const workUrl = window.location.pathname.replace(/\/request-score-access\/?$/, '/')
      navigate(workUrl)
      return
    }

    closeGateDialog('cancel')
  }

  const onDialogCancel = (e: Event): void => {
    // Prevent Escape key from closing without tracking
    e.preventDefault()
    onCancelClick()
  }

  const onDialogClose = (): void => {
    syncClosedState()
  }

  form.addEventListener('submit', onSubmit)
  cancelBtn?.addEventListener('click', onCancelClick)
  dialog.addEventListener('cancel', onDialogCancel)
  dialog.addEventListener('close', onDialogClose)

  // Auto-open if requested
  if (opts.autoOpen) {
    // Insert an inline alert above the form heading when redirected with a reason
    if (opts.alertMessage && formView) {
      const alert = document.createElement('p')
      alert.setAttribute('role', 'alert')
      alert.style.cssText =
        'margin:0 0 1rem;padding:0.65rem 0.85rem;border:1px solid #d97706;' +
        'background:rgb(217 119 6 / 0.1);color:#fbbf24;' +
        'font-size:var(--font-size-sm, 0.875rem);line-height:1.45;'
      alert.textContent = opts.alertMessage
      formView.insertBefore(alert, formView.firstChild)
    }

    showGateDialog()
  }

  // Cleanup
  const teardown = (): void => {
    clearTimers()
    form.removeEventListener('submit', onSubmit)
    cancelBtn?.removeEventListener('click', onCancelClick)
    dialog.removeEventListener('cancel', onDialogCancel)
    dialog.removeEventListener('close', onDialogClose)
    if (dialog.open) {
      dialog.close('swap')
    }
    syncClosedState()
  }

  return teardown
}

// ── Perusal score page init ─────────────────────────────────────────────────

function initPerusalScorePage(): () => void {
  const page = document.querySelector<HTMLElement>('[data-perusal-page]')
  if (!page) return () => {}

  const gatingEnabled = page.dataset.perusalGatingEnabled === 'true'
  if (!gatingEnabled) return () => {}

  // On the initial page load, astro:page-load fires after module scripts have
  // already run, causing initPerusalScorePage() to execute a second time.
  // Use a dedicated flag rather than checking gateState === 'unlocked' because
  // with network throttling the async token verification may still be in-flight
  // (gateState still 'locked') when astro:page-load fires.  A second run would
  // start a redundant lock → verify → unlock cycle — or worse, re-lock a gate
  // that the first run already unlocked.
  if (page.dataset.perusalGateInitStarted === 'true') {
    console.debug('[Gate] initPerusalScorePage: already started, skipping duplicate init')
    return () => {}
  }
  page.dataset.perusalGateInitStarted = 'true'

  const workId = page.dataset.perusalWorkId ?? ''
  const verifyConfig = {
    apiEndpoint: page.dataset.perusalApiEndpoint ?? '',
    tokenSecret: page.dataset.perusalTokenSecret ?? '',
  }

  function revealScore(): void {
    console.debug('[Gate] revealScore: setting gateState=unlocked, dispatching perusal-gate-revealed')
    page!.dataset.perusalGateState = 'unlocked'
    document.dispatchEvent(new CustomEvent('perusal-gate-revealed'))
  }

  function lockScore(): void {
    console.debug('[Gate] lockScore: setting gateState=locked')
    page!.dataset.perusalGateState = 'locked'
  }

  function redirectToRequestAccess(reason?: string): void {
    const url = `/music/${workId}/request-score-access/${reason ? `?reason=${reason}` : ''}`
    console.debug(`[Gate] redirectToRequestAccess: ${url}`)
    window.location.replace(url)
  }

  // Attempt to verify a token from the URL or from localStorage.
  const urlToken = getTokenFromUrl()
  const storedToken = getStoredToken(workId)
  const token = urlToken ?? storedToken

  if (token) {
    console.debug('[Gate] token found, starting verification', {
      source: urlToken ? 'url' : 'localStorage',
      hasApiEndpoint: !!verifyConfig.apiEndpoint,
      hasTokenSecret: !!verifyConfig.tokenSecret,
    })
    lockScore()

    verifyTokenWithFallback(token, workId, verifyConfig)
      .then(async (result) => {
        console.debug('[Gate] verification result:', { valid: result.valid, hasEmail: !!result.email })
        if (result.valid) {
          if (urlToken) stripTokenFromUrl()
          // Persist (or refresh) the token in localStorage.
          storeToken(workId, token)
          revealScore()
          if (result.email) {
            await trackPerusalAccess(workId, result.email)
          }
        } else {
          // Token is genuinely invalid/expired — redirect to request access page
          clearStoredToken(workId)
          redirectToRequestAccess('expired')
        }
      })
      .catch((err) => {
        console.debug('[Gate] verification error:', err)
        clearStoredToken(workId)
        redirectToRequestAccess('expired')
      })

    return () => {}
  }

  // No token anywhere — redirect to request access page.
  redirectToRequestAccess()
  return () => {}
}

// ── Request score access page init ──────────────────────────────────────────

function initRequestScoreAccessPage(): () => void {
  const pageEl = document.querySelector<HTMLElement>('[data-request-score-access-page]')
  if (!pageEl) return () => {}

  const dialog = document.querySelector<HTMLDialogElement>('[data-perusal-gate-dialog]')
  if (!dialog) return () => {}

  const config = readConfigFromDialog(dialog)

  // Check for error reason from perusal-score page redirect
  const urlParams = new URLSearchParams(window.location.search)
  const reason = urlParams.get('reason')

  // Strip the reason param from URL without adding history
  if (reason) {
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', cleanUrl)
  }

  const alertMessage = reason === 'expired'
    ? 'Your access link has expired or is no longer valid. Please request a new link below.'
    : undefined

  // If the user already has a valid stored token, redirect to the perusal
  // score page — they don't need to fill the form again.
  const storedToken = getStoredToken(config.workId)
  if (storedToken) {
    verifyTokenWithFallback(storedToken, config.workId, config)
      .then((result) => {
        if (result.valid) {
          window.location.replace(`/music/${config.workId}/perusal-score/`)
          return
        }
        // Expired / invalid — clear it and show the gate form.
        clearStoredToken(config.workId)
        initGateDialog(config, { autoOpen: true, alertMessage })
      })
      .catch(() => {
        clearStoredToken(config.workId)
        initGateDialog(config, { autoOpen: true, alertMessage })
      })

    return () => {}
  }

  // No stored token — auto-open the dialog. The normal double-rAF animation
  // ensures the dialog is still at opacity 0 when the View Transition captures
  // its new-page snapshot, so it doesn't appear in the cross-fade. The dialog
  // then fades in from the real top layer, always on top of page content.
  return initGateDialog(config, { autoOpen: true, alertMessage })
}

// ── Work detail page init (upgrade button if user has access) ────────────────

function initWorkDetailGate(): () => void {
  // Skip contexts handled by other init functions
  if (document.querySelector('[data-perusal-page]')) return () => {}
  if (document.querySelector('[data-request-score-access-page]')) return () => {}

  // Find the "View Score" link pointing to request-score-access.
  // If the user has a stored token, upgrade it to point directly to the
  // perusal score page so they skip the gate form entirely.
  const scoreLink = document.querySelector<HTMLAnchorElement>('a[href*="/request-score-access/"]')
  if (!scoreLink) return () => {}

  const match = scoreLink.getAttribute('href')?.match(/\/works\/([^/]+)\//)
  const workId = match?.[1]
  if (!workId) return () => {}

  if (getStoredToken(workId)) {
    scoreLink.href = `/music/${workId}/perusal-score/`
    scoreLink.setAttribute('data-astro-reload', '')
  }

  return () => {}
}

// ── Init all contexts ────────────────────────────────────────────────────────

function initPerusalGate(): () => void {
  const teardownScore = initPerusalScorePage()
  const teardownAccess = initRequestScoreAccessPage()
  const teardownWork = initWorkDetailGate()

  return () => {
    teardownScore()
    teardownAccess()
    teardownWork()
  }
}

// ── Astro lifecycle ─────────────────────────────────────────────────────────

const gateWindow = window as PerusalGateWindow
if (!gateWindow.__perusalGateBound) {
  gateWindow.__perusalGateBound = true

  // Capture the View Transition object from every Astro navigation so
  // the dialog can defer its fade-in until after the transition finishes.
  document.addEventListener('astro:before-swap', (e) => {
    const swapEvent = e as Event & { viewTransition?: { finished: Promise<void> } }
    if (swapEvent.viewTransition) {
      pendingViewTransition = swapEvent.viewTransition
      swapEvent.viewTransition.finished
        .then(() => {
          pendingViewTransition = null
        })
        .catch(() => {
          pendingViewTransition = null
        })
    }
  })

  // Run immediately for pages without View Transitions (PerusalLayout)
  console.debug('[Gate] initial initPerusalGate()')
  initPerusalGate()

  // Also listen for View Transition navigations (SiteLayout pages)
  document.addEventListener('astro:page-load', () => {
    console.debug('[Gate] astro:page-load → initPerusalGate()')
    const teardown = initPerusalGate()
    document.addEventListener('astro:before-swap', () => teardown(), { once: true })
  })
}
