// Shared constants, path definitions, validation sets, and mutable state
// for the Keystatic dev server integration.

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..', '..')
export const KEYSTATIC_CACHE_NAMESPACE_STORAGE_KEY = 'jv-keystatic-project-namespace'
export const KEYSTATIC_CACHE_NAMESPACE = crypto.createHash('sha1').update(ROOT).digest('hex')
export const KEYSTATIC_POST_SETUP_RESET_MARKER_PATH = path.join(ROOT, '.keystatic-post-setup-reset')
export const SOURCE_DIR = path.join(ROOT, 'source')
export const HEROES_DIR = path.join(SOURCE_DIR, 'heroes')
export const HERO_PREFERRED_API_PATH = '/api/dev/hero-preference'
export const THEME_PRESET_API_PATH = '/api/dev/theme/preset'
export const THEME_LIBRARY_API_PATH = '/api/dev/theme/library'
export const THEME_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'theme.yaml')
export const THEME_SELECTION_PATH = path.join(SOURCE_DIR, 'site', 'theme-selection.yaml')
export const THEME_LIBRARY_PATH = path.join(SOURCE_DIR, 'site', 'theme-library.yaml')
export const THEME_COLOR_KEYS = [
  'colorBackground',
  'colorBackgroundSoft',
  'colorText',
  'colorTextMuted',
  'colorAccent',
  'colorAccentStrong',
  'colorButton',
  'colorButtonText',
]
export const VALID_BORDER_RADIUS = new Set(['none', 'subtle', 'soft', 'rounded', 'round', 'pill'])
export const HERO_PREFERENCE_PAGE_KEYS = new Set([
  'home',
  'contact',
  'about',
  'music',
  'music-browse',
  'music-browse-tag',
  'work-detail',
  'not-found',
  'accessibility-statement',
  'sitemap',
  'perusal-access-granted',
  'perusal-thank-you',
  'contact-thank-you',
])
export const WORK_DETAIL_PREFERENCE_SCOPES = new Set(['this-work', 'all-work-pages'])
export const SETUP_IDENTITY_API_PATH = '/api/dev/setup/identity'
export const SETUP_SOCIAL_API_PATH = '/api/dev/setup/social'
export const SETUP_HOMEPAGE_API_PATH = '/api/dev/setup/homepage'
export const SETUP_FORMS_API_PATH = '/api/dev/setup/forms'
export const SETUP_ABOUT_API_PATH = '/api/dev/setup/about'
export const SETUP_WORK_API_PATH = '/api/dev/setup/work'
export const SETUP_UPLOAD_API_PATH = '/api/dev/setup/upload'
export const SETUP_DEPLOY_API_PATH = '/api/dev/setup/deploy'
export const SETUP_STATUS_API_PATH = '/api/dev/setup/status'
export const SETUP_FINALIZE_API_PATH = '/api/dev/setup/finalize'
export const SITE_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'site.yaml')
export const BRAND_LOGO_CONFIG_PATH = path.join(SOURCE_DIR, 'branding', 'brand-logo.yaml')
export const SOCIAL_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'social.yaml')
export const COPYRIGHT_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'copyright.yaml')
export const HOME_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'home.yaml')
export const CONTACT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'contact.yaml')
export const PERUSAL_ACCESS_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'perusal-access.yaml')
export const ABOUT_CONFIG_PATH = path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml')
export const DEPLOY_CONFIG_PATH = path.join(SOURCE_DIR, 'site', 'deploy.yaml')
export const VALID_SOCIAL_PLATFORMS = new Set([
  'instagram',
  'youtube',
  'facebook',
  'soundcloud',
  'twitter',
  'linkedin',
  'tiktok',
  'bandcamp',
])
export const WORKS_SEARCH_HTML_PATH = path.join(ROOT, 'scripts', 'works-search.html')
export const IMAGE_EXTS_SEARCH = ['.webp', '.jpg', '.jpeg', '.png', '.tiff']
export const DEPLOY_SCRIPT = path.join(ROOT, 'scripts', 'deploy.mjs')
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4323)
export const LOCAL_DEV_HOST = process.env.ASTRO_HOST || '127.0.0.1'
export const PREVIEW_URL = `http://${LOCAL_DEV_HOST}:${PREVIEW_PORT}/`
export const ASTRO_PORT = Number(process.env.ASTRO_PORT || 4321)
export const TREE_SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.astro', 'dist', '.starter-kit'])

// Read homepage URL from package.json for the "Live" toolbar button
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
export const LIVE_URL = pkg.homepage || ''

// ─── Shared mutable state ────────────────────────────────────────────────────
// These are exported as an object so route modules can read/write them by
// reference. Do NOT destructure — always access via `state.buildRunning`, etc.

export const state = {
  buildRunning: false,
  publishRunning: false,
  previewProcess: null,
}

// ─── Works pipeline constants ────────────────────────────────────────────────

export const WORKS_SOURCE_DIR = path.join(ROOT, 'source', 'works')
export const INGEST_SCRIPT = path.join(ROOT, 'scripts', 'ingest-works.mjs')
export const CLEANUP_SCRIPT = path.join(ROOT, 'scripts', 'cleanup-generated-files.mjs')
export const GENERATE_IMAGES_SCRIPT = path.join(ROOT, 'scripts', 'generate-works-images.mjs')
export const GENERATE_SCORES_SCRIPT = path.join(ROOT, 'scripts', 'generate-perusal-scores.mjs')
export const GENERATE_SEARCH_SCRIPT = path.join(ROOT, 'scripts', 'generate-page-search-index.mjs')

export const WATCHED_EXTENSIONS = new Set([
  '.yaml',
  '.md',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.mp3',
  '.wav',
  '.aiff',
  '.flac',
  '.pdf',
])

// ─── Slug rename reference configuration ─────────────────────────────────────

export const COLLECTION_REFS = {
  'source/heroes/': {
    publicDir: 'public/hero',
    refs: [
      { yamlPath: 'source/pages/home.yaml', fields: ['preferredHeroId', 'fallbackHeroId'] },
      { yamlPath: 'source/pages/contact.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/about/about.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/work-detail.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music-browse.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/music-browse-tag.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/not-found.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/accessibility-statement.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/sitemap.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/perusal-access-granted.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/perusal-thank-you.yaml', fields: ['preferredHeroId'] },
      { yamlPath: 'source/pages/contact-thank-you.yaml', fields: ['preferredHeroId'] },
    ],
  },
  'source/works/': {
    publicDir: null,
    refs: [],
  },
}
