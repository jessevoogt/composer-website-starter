import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'url'
import path from 'node:path'
import fs from 'node:fs'
import yaml from 'js-yaml'
import react from '@astrojs/react'
import icon from 'astro-icon'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import mailObfuscation from 'astro-mail-obfuscation'
import backgroundSwitcherDevToolbar from './src/integrations/background-switcher-dev-toolbar.mjs'
import cmsLiveEditorDevToolbar from './src/integrations/cms-live-editor-dev-toolbar.mjs'
import themePresetsDevToolbar from './src/integrations/theme-presets-dev-toolbar.mjs'
import keystatic_DevServerIntegration from './src/integrations/keystatic-dev-server.mjs'
import { isSearchAndCrawlerExcludedPath } from './src/utils/route-exclusions.mjs'

const SOURCE_DIR = fileURLToPath(new URL('./source', import.meta.url))
const ASTRO_HOST = process.env.ASTRO_HOST || '127.0.0.1'
const ASTRO_PORT = Number(process.env.ASTRO_PORT || 4321)

// Read siteUrl from YAML so it stays in sync with Keystatic edits
const SITE_YAML_PATH = path.join(SOURCE_DIR, 'site', 'site.yaml')
let siteUrl = 'https://example.com'
try {
  if (fs.existsSync(SITE_YAML_PATH)) {
    const siteData = yaml.load(fs.readFileSync(SITE_YAML_PATH, 'utf8'))
    if (siteData?.siteUrl && typeof siteData.siteUrl === 'string') {
      siteUrl = siteData.siteUrl
    }
  }
} catch {
  // Fall back to default
}

/**
 * Vite plugin: watch `source/` YAML files for changes and broadcast a custom
 * HMR event. Astro pages listen for this event and reload themselves, while the
 * standalone Keystatic app intentionally does not.
 */
function sourceYamlHmr() {
  return {
    name: 'source-yaml-hmr',
    configureServer(/** @type {import('vite').ViteDevServer} */ server) {
      server.watcher.add(path.join(SOURCE_DIR, '**/*.yaml'))
      server.watcher.on('change', (/** @type {string} */ file) => {
        if (file.startsWith(SOURCE_DIR) && file.endsWith('.yaml')) {
          server.ws.send({
            type: 'custom',
            event: 'jv:source-yaml-changed',
            data: { file },
          })
        }
      })

      // Intercept Vite's full-reload and re-broadcast as a custom event.
      // This prevents the studio shell (and its iframes) from reloading when
      // content files change. Only Astro pages with the sourceYamlReloadBridge
      // script will act on the custom event.
      // Wrap both server.ws.send and server.hot.send to cover all Vite/Astro
      // code paths (Astro may use server.hot which is the HMRBroadcaster).
      function wrapSend(target) {
        const orig = target.send.bind(target)
        target.send = function (...args) {
          if (args.length === 1 && args[0] && args[0].type === 'full-reload') {
            orig({ type: 'custom', event: 'jv:vite-full-reload', data: { path: args[0].path } })
            return
          }
          orig(...args)
        }
      }
      wrapSend(server.ws)
      if (server.hot && server.hot !== server.ws) wrapSend(server.hot)
    },
  }
}

/**
 * Astro integration: reload site pages when source YAML changes in dev. This
 * restores the previous "live content updates" behavior without reloading the
 * standalone /keystatic app, which uses a separate HTML entrypoint.
 */
function sourceYamlReloadBridge() {
  return {
    name: 'source-yaml-reload-bridge',
    hooks: {
      'astro:config:setup': ({ command, injectScript }) => {
        if (command !== 'dev') return

        // Block Vite's raw full-reload on the studio shell page. This is a
        // classic (non-module) script so it executes before @vite/client and
        // can wrap WebSocket before Vite's HMR client opens a connection.
        // Without this, a full-reload would reload the shell and both iframes.
        injectScript(
          'head-inline',
          `
            if (window.location.pathname.startsWith('/__studio')) {
              (function() {
                var O = window.WebSocket;
                window.WebSocket = function(u, p) {
                  var ws = p ? new O(u, p) : new O(u);
                  var origAEL = ws.addEventListener.bind(ws);
                  ws.addEventListener = function(t, l, o) {
                    if (t === 'message') {
                      var w = function(e) {
                        try { if (JSON.parse(e.data).type === 'full-reload') return; } catch(x) {}
                        l.call(ws, e);
                      };
                      return origAEL(t, w, o);
                    }
                    return origAEL(t, l, o);
                  };
                  return ws;
                };
                window.WebSocket.prototype = O.prototype;
                window.WebSocket.CONNECTING = O.CONNECTING;
                window.WebSocket.OPEN = O.OPEN;
                window.WebSocket.CLOSING = O.CLOSING;
                window.WebSocket.CLOSED = O.CLOSED;
              })();
            }
          `,
        )

        injectScript(
          'page',
          `
            if (import.meta.hot) {
              let sourceReloadTimer

              function scheduleReload() {
                if (window.location.pathname.startsWith('/keystatic')) return
                // Studio shell page should not reload — the preview iframe
                // has its own copy of this listener and will reload itself.
                if (window.location.pathname.startsWith('/__studio')) return
                // Setup wizard manages its own state via API calls and
                // sessionStorage — a mid-step reload would abort uploads
                // and lose form data.
                if (window.location.pathname.startsWith('/setup')) return
                window.clearTimeout(sourceReloadTimer)
                sourceReloadTimer = window.setTimeout(() => {
                  window.location.reload()
                }, 40)
              }

              // Direct YAML change (e.g. singleton save)
              import.meta.hot.on('jv:source-yaml-changed', scheduleReload)
              // Converted Vite full-reload (e.g. works pipeline regenerated content)
              import.meta.hot.on('jv:vite-full-reload', scheduleReload)
            }
          `,
        )
      },
    },
  }
}

/** Rehype plugin: add target="_blank" and rel attributes to external links in MDX body content. */
function rehypeExternalLinks() {
  return function (/** @type {{ children?: unknown[] }} */ tree) {
    function walk(/** @type {{ type?: string; tagName?: string; properties?: Record<string, unknown>; children?: unknown[] }} */ node) {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href
        if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
          node.properties.target = '_blank'
          node.properties.rel = ['nofollow', 'noopener', 'noreferrer']
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

function getPathnameForSitemapFilter(page) {
  if (page instanceof URL) return page.pathname
  if (typeof page !== 'string') return '/'

  try {
    return new URL(page).pathname
  } catch {
    return page
  }
}

// https://astro.build/config
export default defineConfig({
  compressHTML: true,
  trailingSlash: 'always',
  output: 'static',
  server: {
    host: ASTRO_HOST,
    port: ASTRO_PORT,
  },
  prefetch: {
    prefetchAll: true,
  },
  site: siteUrl,
  integrations: [
    react(),
    icon(),
    mdx({ rehypePlugins: [rehypeExternalLinks] }),
    sitemap({
      filter: (page) => !isSearchAndCrawlerExcludedPath(getPathnameForSitemapFilter(page)),
    }),
    mailObfuscation(),
    backgroundSwitcherDevToolbar(),
    themePresetsDevToolbar(),
    cmsLiveEditorDevToolbar(),
    keystatic_DevServerIntegration(),
    sourceYamlReloadBridge(),
  ],
  vite: {
    plugins: [sourceYamlHmr()],
    server: {
      fs: {
        // In a git worktree the real node_modules lives in the main repo, not the
        // worktree directory. Vite's default allow list only covers the project root,
        // so dev toolbar and other node_modules resources get blocked. Resolve the
        // actual astro package location and allow its parent node_modules tree.
        allow: (() => {
          const dirs = [fileURLToPath(new URL('.', import.meta.url))]
          try {
            // import.meta.resolve is not always available in Vite's SSR module runner
            dirs.push(path.resolve(fileURLToPath(import.meta.resolve('astro')), '..', '..'))
          } catch {
            // Fallback: allow the project-local node_modules tree
            dirs.push(path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'node_modules'))
          }
          return dirs
        })(),
      },
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'yjs'],
      alias: {
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
        '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
        '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
        '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
        '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
        '@public': fileURLToPath(new URL('./public', import.meta.url)),
        '@post-images': fileURLToPath(new URL('./public/posts', import.meta.url)),
        '@works-images': fileURLToPath(new URL('./public/works', import.meta.url)),
      },
    },
  },
})
