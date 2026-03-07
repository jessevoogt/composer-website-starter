/**
 * Session journey tracker.
 *
 * Records page visits and audio plays in sessionStorage. Data is only
 * sent to the backend when a form is submitted (via submission-meta.ts).
 *
 * Lifecycle:
 * - `astro:page-load` → log page visit, bind audio listeners
 * - `astro:before-swap` → finalize in-progress audio play, unbind
 * - Audio `play` → start tracking a new audio play
 * - Audio `pause` / `ended` → record duration
 */

const STORAGE_KEY = '_journey'

interface PageVisit {
  url: string
  title: string
  ts: string
}

interface AudioPlay {
  key: string
  title: string
  startedAt: string
  duration: number
}

interface JourneyData {
  sessionId: string
  startedAt: string
  pages: PageVisit[]
  audioPlays: AudioPlay[]
}

// ── sessionStorage helpers ────────────────────────────────────────────────

function readJourney(): JourneyData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.pages) ? parsed : null
  } catch {
    return null
  }
}

function writeJourney(data: JourneyData): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage full or unavailable — silently degrade.
  }
}

function ensureJourney(): JourneyData {
  const existing = readJourney()
  if (existing) return existing

  const fresh: JourneyData = {
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    pages: [],
    audioPlays: [],
  }
  writeJourney(fresh)
  return fresh
}

// ── In-progress audio play tracking ───────────────────────────────────────

let currentPlay: { key: string; title: string; startedAt: string; playStartTime: number } | null = null

function finalizeCurrentPlay(): void {
  if (!currentPlay) return

  const duration = Math.round((Date.now() - currentPlay.playStartTime) / 1000)
  if (duration < 1) {
    currentPlay = null
    return
  }

  const journey = ensureJourney()
  journey.audioPlays.push({
    key: currentPlay.key,
    title: currentPlay.title,
    startedAt: currentPlay.startedAt,
    duration,
  })
  writeJourney(journey)
  currentPlay = null
}

// ── Recording title lookup ────────────────────────────────────────────────

function lookupRecordingTitle(key: string): string {
  // Try the homepage meta title element first (only exists on index page).
  const metaTitle = document.querySelector<HTMLElement>('[data-featured-meta-title]')
  if (metaTitle?.textContent?.trim()) return metaTitle.textContent.trim()

  // Fall back to the featured recordings JSON data embedded in the page.
  try {
    const dataScript = document.querySelector<HTMLScriptElement>('[data-featured-recordings-data]')
    if (dataScript?.textContent) {
      const recordings = JSON.parse(dataScript.textContent) as Array<{ key: string; title: string }>
      const match = recordings.find((r) => r.key === key)
      if (match?.title) return match.title
    }
  } catch {
    // Ignore parse errors.
  }

  return ''
}

// ── Audio event handlers ──────────────────────────────────────────────────

function onAudioPlay(): void {
  // Finalize any previous play that wasn't ended cleanly.
  finalizeCurrentPlay()

  const audio = document.querySelector<HTMLAudioElement>('[data-featured-player]')
  if (!audio) return

  const key = audio.dataset.featuredRecordingKey ?? ''
  if (!key) return

  currentPlay = {
    key,
    title: lookupRecordingTitle(key),
    startedAt: new Date().toISOString(),
    playStartTime: Date.now(),
  }
}

function onAudioPauseOrEnded(): void {
  finalizeCurrentPlay()
}

// ── Bind / unbind ─────────────────────────────────────────────────────────

let audioListenersBound = false

function bindAudioListeners(): void {
  if (audioListenersBound) return

  const audio = document.querySelector<HTMLAudioElement>('[data-featured-player]')
  if (!audio) return

  audio.addEventListener('play', onAudioPlay)
  audio.addEventListener('pause', onAudioPauseOrEnded)
  audio.addEventListener('ended', onAudioPauseOrEnded)
  audioListenersBound = true
}

function unbindAudioListeners(): void {
  if (!audioListenersBound) return

  const audio = document.querySelector<HTMLAudioElement>('[data-featured-player]')
  if (audio) {
    audio.removeEventListener('play', onAudioPlay)
    audio.removeEventListener('pause', onAudioPauseOrEnded)
    audio.removeEventListener('ended', onAudioPauseOrEnded)
  }
  audioListenersBound = false
}

// ── Page visit tracking ───────────────────────────────────────────────────

function logPageVisit(): void {
  const journey = ensureJourney()
  const url = window.location.pathname

  // Deduplicate consecutive visits to the same URL (view transition replays).
  const last = journey.pages[journey.pages.length - 1]
  if (last && last.url === url) {
    console.log('[journey-module] dedup skip:', url)
    return
  }

  console.log('[journey-module] logging page:', url)
  journey.pages.push({
    url,
    title: document.title,
    ts: new Date().toISOString(),
  })
  writeJourney(journey)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

interface SessionJourneyWindow extends Window {
  __sessionJourneyBound?: boolean
}

const journeyWindow = window as SessionJourneyWindow
if (!journeyWindow.__sessionJourneyBound) {
  journeyWindow.__sessionJourneyBound = true

  console.log('[journey-module] init — immediate call')
  // Log immediately in case astro:page-load already fired for the initial page.
  // The deduplication in logPageVisit() prevents double-logging.
  logPageVisit()
  bindAudioListeners()

  document.addEventListener('astro:page-load', () => {
    console.log('[journey-module] astro:page-load fired for', window.location.pathname)
    logPageVisit()
    bindAudioListeners()
  })

  document.addEventListener('astro:before-swap', () => {
    console.log('[journey-module] astro:before-swap')
    finalizeCurrentPlay()
    unbindAudioListeners()
  })
} else {
  console.log('[journey-module] already bound, skipping init')
}
