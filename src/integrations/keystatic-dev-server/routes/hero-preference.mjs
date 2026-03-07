// Hero Preference API route handler

import fs from 'fs'
import path from 'path'

import {
  HERO_PREFERENCE_PAGE_KEYS,
  WORK_DETAIL_PREFERENCE_SCOPES,
  SOURCE_DIR,
} from '../constants.mjs'

import {
  readJsonRequestBody,
  resolvePreferredHeroConfigPath,
  listHeroIds,
  upsertPreferredHeroInYaml,
} from '../helpers.mjs'

export async function handleHeroPreference(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)
    const requestedId = typeof body.preferredHeroId === 'string' ? body.preferredHeroId.trim() : null
    const pageKeyRaw = typeof body.pageKey === 'string' ? body.pageKey.trim().toLowerCase() : 'home'
    const scopeRaw = typeof body.scope === 'string' ? body.scope.trim() : ''
    const workSlug = typeof body.workSlug === 'string' ? body.workSlug.trim() : ''

    if (requestedId === null) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'preferredHeroId must be a string.' }))
      return
    }

    if (!HERO_PREFERENCE_PAGE_KEYS.has(pageKeyRaw)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Unknown pageKey.' }))
      return
    }

    if (pageKeyRaw === 'work-detail' && scopeRaw && !WORK_DETAIL_PREFERENCE_SCOPES.has(scopeRaw)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Unknown work-detail scope.' }))
      return
    }

    const heroIds = listHeroIds()
    if (requestedId !== '' && !heroIds.includes(requestedId)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Unknown hero id.', heroIds }))
      return
    }

    // Per-work override: write to source/works/{slug}/work.yaml
    let configPath
    if (pageKeyRaw === 'work-detail') {
      const resolvedScope = scopeRaw || (workSlug ? 'this-work' : 'all-work-pages')
      if (resolvedScope === 'this-work') {
        if (!workSlug) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'workSlug is required for this-work scope.' }))
          return
        }

        const workDir = path.join(SOURCE_DIR, 'works', workSlug)
        if (!fs.existsSync(workDir)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Unknown work slug.' }))
          return
        }

        configPath = path.join(workDir, 'work.yaml')
      } else {
        configPath = resolvePreferredHeroConfigPath(pageKeyRaw)
      }
    } else {
      configPath = resolvePreferredHeroConfigPath(pageKeyRaw)
    }

    const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
    const nextContent = upsertPreferredHeroInYaml(current, requestedId)

    if (nextContent !== current) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, nextContent, 'utf-8')
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        ok: true,
        preferredHeroId: requestedId,
        pageKey: pageKeyRaw,
        scope: scopeRaw || undefined,
        workSlug: workSlug || undefined,
      }),
    )
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to persist preferred hero id.' }))
  }
}
