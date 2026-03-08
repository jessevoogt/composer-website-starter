// Astro integration: embeds Keystatic CMS and dev tools into Astro's Vite server.
// Replaces the former standalone Keystatic server (scripts/keystatic-server.mjs)
// by registering all functionality as Vite plugins that run on the same port as Astro.
//
// The critical trick: Astro's trailingSlash:'always' middleware uses stack.unshift()
// to insert itself at the front of the Vite middleware stack. We also use unshift()
// in the configureServer return callback — because integration plugins resolve after
// Astro's internal plugins, our unshift goes to the very front, running BEFORE the
// trailing slash middleware. This avoids the original conflict that forced Keystatic
// onto a separate port.

import path from 'path'
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic'
import { getAllowedDirectories } from '@keystatic/core/api/utils'

import {
  ROOT,
  KEYSTATIC_CACHE_NAMESPACE,
  HERO_PREFERRED_API_PATH,
  THEME_PRESET_API_PATH,
  THEME_LIBRARY_API_PATH,
  SETUP_IDENTITY_API_PATH,
  SETUP_SOCIAL_API_PATH,
  SETUP_HOMEPAGE_API_PATH,
  SETUP_FORMS_API_PATH,
  SETUP_ABOUT_API_PATH,
  SETUP_WORK_API_PATH,
  SETUP_UPLOAD_API_PATH,
  SETUP_DEPLOY_API_PATH,
  SETUP_STATUS_API_PATH,
  SETUP_FINALIZE_API_PATH,
  NEWSLETTER_ADMIN_API_PREFIX,
  SUBMISSIONS_ADMIN_API_PREFIX,
  FILE_UPLOAD_API_PATH,
  state,
} from './constants.mjs'

import { startWorksWatcher, startHeroesWatcher } from './helpers.mjs'

// Route handlers
import { handleHeroPreference } from './routes/hero-preference.mjs'
import { handleThemePreset, handleThemeLibrary } from './routes/theme.mjs'
import {
  handleSetupIdentity,
  handleSetupSocial,
  handleSetupHomepage,
  handleSetupForms,
  handleSetupUpload,
  handleSetupAbout,
  handleSetupWork,
  handleSetupDeploy,
  handleSetupStatus,
  handleSetupFinalize,
} from './routes/setup.mjs'
import {
  handleToolbarConfig,
  handleBuild,
  handlePublish,
  handlePreview,
  handleGenerateStarterKit,
} from './routes/build-publish.mjs'
import {
  handleKeystaticApi,
  handleWorksData,
  handleWorksSearch,
  handleKeystaticAdmin,
  setSharedState,
} from './routes/keystatic-api.mjs'
import {
  handleNewsletterAdmin,
  handleNewsletterConfig,
  handleNewsletterSubscribersProxy,
  handleNewsletterSubscriberDetailProxy,
  handleNewsletterSubscribersDeleteProxy,
  handleNewsletterSubscribersUpdateProxy,
  handleNewsletterSendProxy,
  handleNewsletterTemplatesList,
  handleNewsletterTemplateRead,
} from './routes/newsletter-admin.mjs'
import {
  handleSubmissionsAdmin,
  handleSubmissionsConfig,
  handleSubmissionsListProxy,
  handleSubmissionsDetailProxy,
  handleSubmissionsDeleteProxy,
} from './routes/submissions-admin.mjs'
import { handleFileUpload } from './routes/file-upload.mjs'

// ─── Vite plugin: combined Keystatic middleware + toolbar ─────────────────────

function keystatic_DevPlugin() {
  let apiHandler = null
  let keystaticConfig = null
  let allowedDirectories = null
  let viteServer = null

  async function getKeystaticConfig() {
    if (keystaticConfig) return keystaticConfig
    const mod = await viteServer.ssrLoadModule(path.join(ROOT, 'keystatic.config.ts'))
    keystaticConfig = mod.default || mod
    return keystaticConfig
  }

  async function getAllowedDirectoriesCached() {
    if (allowedDirectories) return allowedDirectories
    const config = await getKeystaticConfig()
    allowedDirectories = getAllowedDirectories(config)
    return allowedDirectories
  }

  async function getApiHandler() {
    if (apiHandler) return apiHandler
    const config = await getKeystaticConfig()
    apiHandler = makeGenericAPIRouteHandler({ config }, {})
    return apiHandler
  }

  // Combined middleware that handles all Keystatic-related routes.
  // This is unshifted to the front of the middleware stack so it runs
  // before Astro's trailing slash middleware.
  async function combinedMiddleware(req, res, next) {
    const rawUrl = req.url || ''
    const pathname = rawUrl.split('?')[0]

    // ── Keystatic API ──────────────────────────────────────────────────────
    if (rawUrl.startsWith('/api/keystatic')) {
      await handleKeystaticApi(req, res, rawUrl, pathname)
      return
    }

    // ── Toolbar config API (consumed by CMS Live Editor header menu) ────
    if (rawUrl === '/api/toolbar-config' && req.method === 'GET') {
      await handleToolbarConfig(req, res)
      return
    }

    // ── Build API ──────────────────────────────────────────────────────────
    if (rawUrl === '/api/build' && req.method === 'POST') {
      await handleBuild(req, res)
      return
    }

    // ── Publish API ────────────────────────────────────────────────────────
    if (rawUrl === '/api/publish' && req.method === 'POST') {
      await handlePublish(req, res)
      return
    }

    // ── Preview API ────────────────────────────────────────────────────────
    if (rawUrl === '/api/preview' && req.method === 'POST') {
      await handlePreview(req, res)
      return
    }

    // ── Generate Starter Kit API ────────────────────────────────────────────
    if (rawUrl === '/api/generate-starter-kit' && req.method === 'POST') {
      await handleGenerateStarterKit(req, res)
      return
    }

    // ── Hero Preference API (same-origin, no CORS needed) ──────────────────
    if (pathname === HERO_PREFERRED_API_PATH) {
      await handleHeroPreference(req, res)
      return
    }

    // ── Theme Preset API (same-origin, no CORS needed) ────────────────────
    if (pathname === THEME_PRESET_API_PATH) {
      await handleThemePreset(req, res)
      return
    }

    // ── Theme Library API (same-origin, no CORS needed) ───────────────────
    if (pathname === THEME_LIBRARY_API_PATH) {
      await handleThemeLibrary(req, res)
      return
    }

    // ── Setup Wizard: Identity API ─────────────────────────────────────────
    if (pathname === SETUP_IDENTITY_API_PATH) {
      await handleSetupIdentity(req, res)
      return
    }

    // ── Setup Wizard: Social API ──────────────────────────────────────────
    if (pathname === SETUP_SOCIAL_API_PATH) {
      await handleSetupSocial(req, res)
      return
    }

    // ── Setup Wizard: Homepage API ──────────────────────────────────────────
    if (pathname === SETUP_HOMEPAGE_API_PATH) {
      await handleSetupHomepage(req, res)
      return
    }

    // ── Setup Wizard: Forms API ──────────────────────────────────────────
    if (pathname === SETUP_FORMS_API_PATH) {
      await handleSetupForms(req, res)
      return
    }

    // ── Setup Wizard: File Upload API ──────────────────────────────────────
    if (pathname === SETUP_UPLOAD_API_PATH) {
      await handleSetupUpload(req, res, rawUrl)
      return
    }

    // ── Setup Wizard: About Page API ──────────────────────────────────────
    if (pathname === SETUP_ABOUT_API_PATH) {
      await handleSetupAbout(req, res)
      return
    }

    // ── Setup Wizard: Work API ──────────────────────────────────────────
    if (pathname === SETUP_WORK_API_PATH) {
      await handleSetupWork(req, res)
      return
    }

    // ── Setup Wizard: Deploy API ──────────────────────────────────────────
    if (pathname === SETUP_DEPLOY_API_PATH) {
      await handleSetupDeploy(req, res)
      return
    }

    // ── Setup Wizard: Status API ──────────────────────────────────────────
    if (pathname === SETUP_STATUS_API_PATH && req.method === 'GET') {
      await handleSetupStatus(req, res)
      return
    }

    // ── Setup Wizard: Finalize (runs ingest pipeline) ─────────────────────
    if (pathname === SETUP_FINALIZE_API_PATH) {
      await handleSetupFinalize(req, res)
      return
    }

    // ── Newsletter Admin API ────────────────────────────────────────────────
    if (pathname.startsWith(NEWSLETTER_ADMIN_API_PREFIX)) {
      const sub = pathname.slice(NEWSLETTER_ADMIN_API_PREFIX.length)
      if (sub === '/config' && req.method === 'GET') {
        await handleNewsletterConfig(req, res)
        return
      }
      if (sub === '/subscribers' && req.method === 'GET') {
        await handleNewsletterSubscribersProxy(req, res)
        return
      }
      if (sub === '/subscribers/detail' && req.method === 'GET') {
        await handleNewsletterSubscriberDetailProxy(req, res)
        return
      }
      if (sub === '/subscribers/delete' && req.method === 'POST') {
        await handleNewsletterSubscribersDeleteProxy(req, res)
        return
      }
      if (sub === '/subscribers/update' && req.method === 'POST') {
        await handleNewsletterSubscribersUpdateProxy(req, res)
        return
      }
      if (sub === '/send') {
        await handleNewsletterSendProxy(req, res)
        return
      }
      if (sub === '/templates' && req.method === 'GET') {
        await handleNewsletterTemplatesList(req, res)
        return
      }
      if (sub.startsWith('/templates/') && req.method === 'GET') {
        const fileName = decodeURIComponent(sub.slice('/templates/'.length))
        await handleNewsletterTemplateRead(req, res, fileName)
        return
      }
    }

    // ── Submissions Admin API ────────────────────────────────────────────────
    if (pathname.startsWith(SUBMISSIONS_ADMIN_API_PREFIX)) {
      const sub = pathname.slice(SUBMISSIONS_ADMIN_API_PREFIX.length)
      if (sub === '/config' && req.method === 'GET') {
        await handleSubmissionsConfig(req, res)
        return
      }
      if (sub === '/list' && req.method === 'GET') {
        await handleSubmissionsListProxy(req, res)
        return
      }
      if (sub === '/detail' && req.method === 'GET') {
        await handleSubmissionsDetailProxy(req, res)
        return
      }
      if (sub === '/delete' && req.method === 'POST') {
        await handleSubmissionsDeleteProxy(req, res)
        return
      }
    }

    // ── File Upload API (Keystatic preview fields) ────────────────────────
    if (pathname === FILE_UPLOAD_API_PATH) {
      await handleFileUpload(req, res, rawUrl)
      return
    }

    // ── Works Data API ─────────────────────────────────────────────────────
    if (pathname === '/api/works-data' && req.method === 'GET') {
      await handleWorksData(req, res)
      return
    }

    // ── Works Search HTML page ─────────────────────────────────────────────
    if (pathname === '/works-search' || pathname === '/works-search/') {
      await handleWorksSearch(req, res)
      return
    }

    // ── Newsletter Admin HTML page (dev-only, under /keystatic/ namespace) ─
    if (pathname === '/keystatic/newsletter' || pathname === '/keystatic/newsletter/') {
      await handleNewsletterAdmin(req, res)
      return
    }

    // ── Submissions Admin HTML page (dev-only, under /keystatic/ namespace) ─
    if (pathname === '/keystatic/submissions' || pathname === '/keystatic/submissions/') {
      await handleSubmissionsAdmin(req, res)
      return
    }

    // ── Keystatic Admin HTML ───────────────────────────────────────────────
    // Serve keystatic.html directly and run it through Vite's HTML transform
    // pipeline (injects React HMR preamble, processes script modules, etc.)
    // We serve it directly rather than rewriting + next() because Astro's
    // intermediate middleware layers would intercept the rewritten request.
    if (pathname === '/keystatic' || pathname.startsWith('/keystatic/')) {
      await handleKeystaticAdmin(req, res, rawUrl)
      return
    }

    // Not a Keystatic route — pass through to Astro's handlers
    next()
  }

  return {
    name: 'keystatic-dev',

    configureServer(server) {
      viteServer = server

      // Share viteServer and accessor functions with the keystatic-api route module
      setSharedState({
        viteServer,
        getApiHandler,
        getAllowedDirectoriesCached,
      })

      // Start file watchers (only when running `npm run dev:watch`).
      // The watchers trigger the ingest pipeline on source/ changes, which
      // modifies files imported by keystatic.config.ts. Vite's HMR then
      // re-mounts the Keystatic React tree, causing "Entry not found" errors
      // for items that were just created. `npm run dev` skips watchers so
      // Keystatic editing is uninterrupted; the post-save pipeline handles
      // ingestion after saves. Use `npm run dev:watch` when you need live
      // filesystem monitoring (e.g. dropping files into source/ via Finder).
      if (!process.env.KEYSTATIC_NO_WATCH) {
        startWorksWatcher()
        startHeroesWatcher()
      } else {
        console.log('[dev] File watchers disabled. Post-save pipeline active. Use npm run dev:watch for live filesystem monitoring.')
      }

      // Kill preview process on server close
      server.httpServer?.on('close', () => {
        state.previewProcess?.kill()
      })

      // Return callback: runs AFTER Vite's internal middleware is set up.
      // Using unshift ensures our middleware runs before Astro's trailing
      // slash middleware (which also uses unshift but is registered earlier).
      return () => {
        server.middlewares.stack.unshift({
          route: '',
          handle: combinedMiddleware,
        })
      }
    },
  }
}

// ─── Astro Integration ───────────────────────────────────────────────────────

export default function keystatic_DevServerIntegration() {
  return {
    name: 'keystatic-dev-server',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        // Only register Keystatic plugins in dev mode
        if (command !== 'dev') return

        updateConfig({
          vite: {
            plugins: [keystatic_DevPlugin()],
            optimizeDeps: {
              include: ['react', 'react-dom', '@keystatic/core'],
              // Keep optimized dependency URLs project-specific even when
              // multiple starter projects run on the same origin/port.
              // This reduces cross-project browser cache collisions that can
              // surface as duplicate React/Yjs runtime state on first load.
              esbuildOptions: {
                banner: {
                  js: `/* project:${KEYSTATIC_CACHE_NAMESPACE} */`,
                },
              },
            },
          },
        })
      },
    },
  }
}
