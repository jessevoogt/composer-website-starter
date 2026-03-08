// Keystatic API, Works Data, Works Search HTML, and Keystatic Admin HTML route handlers

import fs from 'fs'
import path from 'path'

import {
  ROOT,
  LOCAL_DEV_HOST,
  ASTRO_PORT,
  COLLECTION_REFS,
  WORKS_SEARCH_HTML_PATH,
  KEYSTATIC_CACHE_NAMESPACE_STORAGE_KEY,
  KEYSTATIC_CACHE_NAMESPACE,
} from '../constants.mjs'

import {
  readRawBody,
  buildKeystaticTreeEntries,
  detectSlugRename,
  migrateRemainingFiles,
  renamePublicDir,
  updateSlugReferences,
  gatherWorksData,
  injectToolbarIntoHtml,
  consumeKeystaticPostSetupResetMarker,
  runPipeline,
  runHeroPipeline,
} from '../helpers.mjs'

// Debounce timer for CMS-mode post-save pipeline (npm run cms)
let cmsPipelineTimer = null

// These are set by the index.mjs module via setSharedState()
let viteServer = null
let getApiHandler = null
let getAllowedDirectoriesCached = null

export function setSharedState(state) {
  viteServer = state.viteServer
  getApiHandler = state.getApiHandler
  getAllowedDirectoriesCached = state.getAllowedDirectoriesCached
}

// ─── Keystatic API ──────────────────────────────────────────────────────

export async function handleKeystaticApi(req, res, rawUrl, pathname) {
  try {
    // Local-mode tree scan that ignores .gitignore and only includes
    // directories Keystatic can actually read/write from the schema.
    if (pathname === '/api/keystatic/tree' && req.method === 'GET') {
      if (req.headers['no-cors'] !== '1') {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bad Request')
        return
      }
      const dirs = await getAllowedDirectoriesCached()
      const entries = await buildKeystaticTreeEntries(ROOT, dirs)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(entries))
      return
    }

    const handler = await getApiHandler()
    const body = await readRawBody(req)

    // Detect slug renames from the update payload before forwarding
    let slugRenames = []
    if (pathname === '/api/keystatic/update' && req.method === 'POST' && body.length > 0) {
      try {
        const payload = JSON.parse(body.toString('utf-8'))
        for (const [prefix, config] of Object.entries(COLLECTION_REFS)) {
          if (config.refs.length === 0) continue
          const rename = detectSlugRename(payload, prefix)
          if (rename) {
            slugRenames.push({ ...rename, prefix, ...config })
          }
        }
      } catch {
        // JSON parse failure — proceed without rename detection
      }
    }

    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v
    }
    const request = new Request(`http://${LOCAL_DEV_HOST}:${ASTRO_PORT}${rawUrl}`, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
    })
    const response = await handler(request)

    // The handler returns a standard Response object. Extract headers.
    const hdrs = response.headers
    let headersObj = { 'Content-Type': 'application/json' }
    if (hdrs) {
      if (typeof hdrs.entries === 'function') {
        headersObj = Object.fromEntries(hdrs.entries())
      } else if (Array.isArray(hdrs)) {
        for (const [k, v] of hdrs) headersObj[k] = v
      } else if (typeof hdrs === 'object') {
        headersObj = hdrs
      }
    }

    // Handle both string body (legacy) and ReadableStream body (standard Response)
    let responseBody
    if (typeof response.body === 'string') {
      responseBody = response.body
    } else if (response.body && typeof response.arrayBuffer === 'function') {
      // Standard Response object — read the body
      responseBody = Buffer.from(await response.arrayBuffer())
    } else {
      responseBody = response.body ?? ''
    }

    // After successful update, migrate remaining files and propagate slug renames
    if (response.status === 200 && slugRenames.length > 0) {
      for (const { oldSlug, newSlug, prefix, publicDir, refs } of slugRenames) {
        const collection = prefix.replace(/^source\//, '').replace(/\/$/, '')
        console.log(`[slug-ref] ${collection} slug renamed: "${oldSlug}" → "${newSlug}"`)
        migrateRemainingFiles(prefix, oldSlug, newSlug)
        renamePublicDir(publicDir, oldSlug, newSlug)
        const count = updateSlugReferences(oldSlug, newSlug, refs)
        if (count > 0) {
          console.log(`[slug-ref] Updated ${count} reference(s)`)
        } else {
          console.log(`[slug-ref] No references found to update`)
        }
      }
    }

    // Keep update responses aligned with the same tree source used above,
    // so local edits never depend on .gitignore visibility rules.
    if (pathname === '/api/keystatic/update' && req.method === 'POST' && response.status === 200) {
      const dirs = await getAllowedDirectoriesCached()
      const entries = await buildKeystaticTreeEntries(ROOT, dirs)
      responseBody = Buffer.from(JSON.stringify(entries), 'utf8')
      headersObj['content-type'] = 'application/json'
      delete headersObj['Content-Length']
      delete headersObj['content-length']
    }

    res.writeHead(response.status, headersObj)
    res.end(responseBody)

    // ── Post-save pipeline ──────────────────────────────────────────────────
    // When running `npm run dev` (KEYSTATIC_NO_WATCH), file watchers are
    // disabled so the ingest pipeline never runs automatically. After a
    // successful update we detect which collections were touched and
    // schedule the appropriate pipeline(s) with a debounce so the user
    // doesn't wait and rapid saves don't queue up redundant runs.
    if (process.env.KEYSTATIC_NO_WATCH && pathname === '/api/keystatic/update' && req.method === 'POST' && response.status === 200) {
      try {
        const payloadStr = body.toString('utf-8')
        const touchesWorks = payloadStr.includes('source/works/')
        const touchesHeroes = payloadStr.includes('source/heroes/')

        if (touchesWorks || touchesHeroes) {
          clearTimeout(cmsPipelineTimer)
          cmsPipelineTimer = setTimeout(async () => {
            if (touchesWorks) await runPipeline()
            if (touchesHeroes) await runHeroPipeline()
          }, 1500)
        }
      } catch {
        // Payload inspection failed — skip pipeline trigger
      }
    }
  } catch (e) {
    console.error('[keystatic-api]', e)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}

// ─── Works Data API ─────────────────────────────────────────────────────

export async function handleWorksData(req, res) {
  try {
    const data = gatherWorksData()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}

// ─── Works Search HTML page ─────────────────────────────────────────────

export async function handleWorksSearch(req, res) {
  try {
    const html = fs.readFileSync(WORKS_SEARCH_HTML_PATH, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Works search page not found: ' + err.message)
  }
}

// ─── Keystatic Admin HTML ───────────────────────────────────────────────

export async function handleKeystaticAdmin(req, res, rawUrl) {
  try {
    const requestHost = req.headers.host ?? ''
    const canonicalHost = requestHost.replace(/^localhost(?=[:]|$)/, '127.0.0.1')
    if (canonicalHost && canonicalHost !== requestHost) {
      res.writeHead(307, { Location: `http://${canonicalHost}${rawUrl}` })
      res.end()
      return
    }

    const htmlPath = path.join(ROOT, 'keystatic.html')
    let html = fs.readFileSync(htmlPath, 'utf-8')
    // Inject toolbar (Build/Preview/Publish buttons, Mod+S, etc.)
    html = injectToolbarIntoHtml(html)
    // Run through Vite's HTML transform pipeline (HMR preamble, module scripts, etc.)
    html = await viteServer.transformIndexHtml('/keystatic.html', html)

    // Isolate browser caches per project root. Without this, running a
    // second starter project on the same origin can restore stale Keystatic
    // drafts/tree caches from another repo, showing blank fields and
    // persistent "Unsaved" state.
    const forcePostSetupReset = consumeKeystaticPostSetupResetMarker()
    const cacheIsolationScript = [
      '<script>',
      '(function(){',
      `  var KEY=${JSON.stringify(KEYSTATIC_CACHE_NAMESPACE_STORAGE_KEY)};`,
      `  var ID=${JSON.stringify(KEYSTATIC_CACHE_NAMESPACE)};`,
      `  var FORCE_POST_SETUP_RESET=${forcePostSetupReset ? 'true' : 'false'};`,
      '  try{',
      '    var prev=window.localStorage.getItem(KEY);',
      '    if(prev!==ID||FORCE_POST_SETUP_RESET){',
      '      window.localStorage.setItem(KEY,ID);',
      '      try{window.indexedDB.deleteDatabase("keystatic")}catch(_e){}',
      '      try{window.indexedDB.deleteDatabase("keystatic-trees")}catch(_e){}',
      '      try{window.indexedDB.deleteDatabase("keystatic-blobs")}catch(_e){}',
      '    }',
      // Guard against stale multiplayer toggle keys in local mode.
      // Any truthy ks-multiplayer key can make Keystatic wait on Yjs sync.
      '    try{',
      '      for(var i=window.localStorage.length-1;i>=0;i--){',
      '        var key=window.localStorage.key(i);',
      '        if(key && (key==="ks-multiplayer" || key.indexOf("ks-multiplayer-")===0)){',
      '          window.localStorage.removeItem(key);',
      '        }',
      '      }',
      '    }catch(_e){}',
      '  }catch(_e){}',
      '})();',
      '</script>',
    ].join('')

    // Astro pages handle the converted jv:vite-full-reload event via
    // sourceYamlReloadBridge. Keystatic is a standalone HTML entry, so it
    // needs its own listener — but it should NOT reload for content/YAML
    // changes (Keystatic already knows about saves it just made, and its
    // API reads from disk on each request). Only code changes (e.g.
    // keystatic.config.ts) should trigger a reload.
    //
    // Two-layer defense:
    // 1. Suppress window: after any YAML change in source/, suppress all
    //    reloads for 10 s — covers the immediate full-reload AND the
    //    delayed pipeline-generated file changes (1.5 s debounce + runtime).
    // 2. Path filter: outside the suppress window, skip reloads whose path
    //    matches content/YAML/generated files.
    const keystaticReloadBridgeScript = [
      '<script type="module">',
      'if(import.meta.hot){',
      '  var _ksSuppress=0;',
      '  import.meta.hot.on("jv:source-yaml-changed",function(){',
      '    _ksSuppress=Date.now()+10000;',
      '  });',
      '  import.meta.hot.on("jv:vite-full-reload",function(data){',
      '    if(Date.now()<_ksSuppress)return;',
      '    var p=(data&&data.path)||"";',
      '    if(p&&(/\\/source\\//.test(p)||/\\/src\\/content\\//.test(p)||/\\.(yaml|mdx)$/.test(p)))return;',
      '    window.location.reload();',
      '  });',
      '}',
      '</script>',
    ].join('')

    html = html.replace('<head>', '<head>' + cacheIsolationScript + keystaticReloadBridgeScript)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    console.error('[keystatic-html]', err)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Failed to serve Keystatic admin: ' + err.message)
  }
}
