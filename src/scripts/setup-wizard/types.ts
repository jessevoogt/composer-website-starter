/**
 * Setup Wizard — shared types and constants.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemePreset {
  id: string
  label: string
  description: string
  colors: Record<string, string>
  fontBody: string
  fontHeading: string
  borderRadius: string
  focusRingColor: string
  ctaBackground: string
  ctaText: string
  navActiveUnderline: string
  navActiveText: string
  navHoverUnderline: string
  navHoverText: string
  scrimColor: string
  disableImageOverlays: boolean
  playerBorderRadius: string
  socialIconBorderRadius: string
  profileImageBorderRadius: string
  tagBadgeBorderRadius: string
}

/** Per-step footer button configuration. */
export interface StepFooterConfig {
  back: boolean
  next: string | null // null hides the footer entirely (e.g. Done step)
}

/** Font catalog entry: font name -> { cssFamily, googleCss2Family } */
export interface FontMeta {
  cssFamily: string
  googleCss2Family: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const TOTAL_STEPS = 10
export const STEP_STORAGE_KEY = 'setup-wizard-step'

export const STEP_FOOTER_CONFIG: StepFooterConfig[] = [
  { back: false, next: 'Next: Choose a theme' }, // 0: Identity
  { back: true, next: 'Next: Branding' }, // 1: Theme
  { back: true, next: 'Next: Homepage' }, // 2: Branding
  { back: true, next: 'Next: About page' }, // 3: Homepage
  { back: true, next: 'Next: Add a work' }, // 4: About
  { back: true, next: 'Next: Social links' }, // 5: Work
  { back: true, next: 'Next: Forms & gating' }, // 6: Social
  { back: true, next: 'Next: Deployment' }, // 7: Forms
  { back: true, next: 'Save & finish' }, // 8: Deploy
  { back: false, next: null }, // 9: Done
]

// ─── Tagline pool ────────────────────────────────────────────────────────────
// Randomized composer taglines for the Homepage step. Users can cycle through
// them with a "regenerate" button or type their own.

export const TAGLINE_POOL: string[] = [
  'Music for curious ears.',
  'New music for adventurous performers.',
  'Contemporary compositions for the concert stage.',
  'Exploring timbral landscapes through new music.',
  'Where structure meets expression.',
  'Fresh perspectives in contemporary concert music.',
  'Compositions for chamber, orchestral, and solo settings.',
  'New works for today\u2019s performers.',
  'Concert music for the 21st century.',
  'Exploring the boundaries of acoustic music.',
  'Compositions shaped by craft and curiosity.',
  'Writing for instruments that breathe.',
  'Sound woven into story.',
  'Music at the crossroads of tradition and experiment.',
  'Crafting sound for the concert hall and beyond.',
  'Connecting performers and audiences through new music.',
  'Sonic explorations for acoustic instruments.',
  'Bringing new voices to the concert stage.',
  'Music drawn from gesture, texture, and space.',
  'Composing with intention, performing with passion.',
]
