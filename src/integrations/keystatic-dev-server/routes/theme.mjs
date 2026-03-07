// Theme Preset and Theme Library API route handlers

import fs from 'fs'
import yaml from 'js-yaml'

import {
  THEME_COLOR_KEYS,
  THEME_CONFIG_PATH,
  THEME_SELECTION_PATH,
  VALID_BORDER_RADIUS,
} from '../constants.mjs'

import {
  readJsonRequestBody,
  normalizeThemeScalar,
  normalizeThemeCustomCss,
  normalizeThemeBoolean,
  normalizeThemeAboutPage,
  normalizeThemeContactPage,
  normalizeThemeHomeHero,
  normalizeThemeRecord,
  readThemeLibrary,
  writeThemeLibrary,
  createUniqueThemeId,
} from '../helpers.mjs'

export async function handleThemePreset(req, res) {
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

    // Validate and normalize hex colors
    const normalizeHex = (value) => {
      if (typeof value !== 'string') return ''
      const trimmed = value.trim()
      if (!trimmed) return ''
      const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      if (!match) return ''
      const hex = match[1]
      if (hex.length === 3)
        return (
          '#' +
          hex
            .split('')
            .map((c) => c + c)
            .join('')
            .toLowerCase()
        )
      return '#' + hex.toLowerCase()
    }

    const colors = body.colors && typeof body.colors === 'object' ? body.colors : {}
    const normalizedColors = {}
    for (const key of THEME_COLOR_KEYS) {
      normalizedColors[key] = normalizeHex(colors[key])
    }
    const focusRingColor = normalizeHex(body.focusRingColor)
    const navActiveUnderline = normalizeHex(body.navActiveUnderline)
    const navActiveText = normalizeHex(body.navActiveText)
    const navHoverUnderline = normalizeHex(body.navHoverUnderline)
    const navHoverText = normalizeHex(body.navHoverText)
    const scrimColor = normalizeHex(body.scrimColor)
    const disableImageOverlays = normalizeThemeBoolean(body.disableImageOverlays)
    const ctaBackground = normalizeHex(body.ctaBackground)
    const ctaText = normalizeHex(body.ctaText)
    const currentThemeId = normalizeThemeScalar(body.currentThemeId)
    const customCss = normalizeThemeCustomCss(body.customCss)
    const aboutPage = normalizeThemeAboutPage(body.aboutPage)
    const contactPage = normalizeThemeContactPage(body.contactPage)
    const homeHero = normalizeThemeHomeHero(body.homeHero, currentThemeId)

    const fontBody = typeof body.fontBody === 'string' ? body.fontBody.trim() : ''
    const fontHeading = typeof body.fontHeading === 'string' ? body.fontHeading.trim() : ''
    const borderRadius =
      typeof body.borderRadius === 'string' && VALID_BORDER_RADIUS.has(body.borderRadius.trim())
        ? body.borderRadius.trim()
        : 'none'
    const playerBorderRadius = typeof body.playerBorderRadius === 'string' ? body.playerBorderRadius.trim() : ''
    const socialIconBorderRadius =
      typeof body.socialIconBorderRadius === 'string' ? body.socialIconBorderRadius.trim() : ''
    const profileImageBorderRadius =
      typeof body.profileImageBorderRadius === 'string' ? body.profileImageBorderRadius.trim() : ''
    const tagBadgeBorderRadius =
      typeof body.tagBadgeBorderRadius === 'string' ? body.tagBadgeBorderRadius.trim() : ''

    // Build YAML content
    const lines = [
      '# Theme configuration',
      '# This is the applied snapshot used by the live site.',
      '# Theme Studio writes this file when you click Apply.',
      '# Colors should be specified as hex values (e.g. #1a1a2e).',
      '',
    ]
    lines.push(currentThemeId ? `currentThemeId: '${currentThemeId}'` : `currentThemeId: ''`)
    for (const key of THEME_COLOR_KEYS) {
      const value = normalizedColors[key]
      lines.push(value ? `${key}: '${value}'` : `${key}: ''`)
    }
    lines.push(focusRingColor ? `focusRingColor: '${focusRingColor}'` : `focusRingColor: ''`)
    lines.push(navActiveUnderline ? `navActiveUnderline: '${navActiveUnderline}'` : `navActiveUnderline: ''`)
    lines.push(navActiveText ? `navActiveText: '${navActiveText}'` : `navActiveText: ''`)
    lines.push(navHoverUnderline ? `navHoverUnderline: '${navHoverUnderline}'` : `navHoverUnderline: ''`)
    lines.push(navHoverText ? `navHoverText: '${navHoverText}'` : `navHoverText: ''`)
    lines.push(scrimColor ? `scrimColor: '${scrimColor}'` : `scrimColor: ''`)
    lines.push(`disableImageOverlays: ${disableImageOverlays ? 'true' : 'false'}`)
    lines.push(ctaBackground ? `ctaBackground: '${ctaBackground}'` : `ctaBackground: ''`)
    lines.push(ctaText ? `ctaText: '${ctaText}'` : `ctaText: ''`)
    lines.push(fontBody ? `fontBody: ${fontBody}` : `fontBody: Atkinson Hyperlegible`)
    lines.push(fontHeading ? `fontHeading: ${fontHeading}` : `fontHeading: Gothic A1`)
    lines.push(`borderRadius: ${borderRadius}`)
    lines.push(playerBorderRadius ? `playerBorderRadius: ${playerBorderRadius}` : `playerBorderRadius: ''`)
    lines.push(
      socialIconBorderRadius ? `socialIconBorderRadius: ${socialIconBorderRadius}` : `socialIconBorderRadius: ''`,
    )
    lines.push(
      profileImageBorderRadius
        ? `profileImageBorderRadius: ${profileImageBorderRadius}`
        : `profileImageBorderRadius: ''`,
    )
    lines.push(tagBadgeBorderRadius ? `tagBadgeBorderRadius: ${tagBadgeBorderRadius}` : `tagBadgeBorderRadius: ''`)
    if (customCss) {
      const customCssYaml = yaml
        .dump({ customCss }, { lineWidth: -1, noRefs: true, sortKeys: false })
        .trimEnd()
        .split('\n')
      lines.push(...customCssYaml)
    }
    const aboutPageYaml = yaml
      .dump({ aboutPage }, { lineWidth: -1, noRefs: true, sortKeys: false })
      .trimEnd()
      .split('\n')
    lines.push(...aboutPageYaml)
    const contactPageYaml = yaml
      .dump({ contactPage }, { lineWidth: -1, noRefs: true, sortKeys: false })
      .trimEnd()
      .split('\n')
    lines.push(...contactPageYaml)
    const homeHeroYaml = yaml
      .dump({ homeHero }, { lineWidth: -1, noRefs: true, sortKeys: false })
      .trimEnd()
      .split('\n')
    lines.push(...homeHeroYaml)
    lines.push('')

    fs.writeFileSync(THEME_CONFIG_PATH, lines.join('\n'), 'utf-8')
    fs.writeFileSync(
      THEME_SELECTION_PATH,
      [
        '# Active theme selection',
        '# Leave blank to keep using the applied custom snapshot from theme.yaml.',
        currentThemeId ? `currentThemeId: '${currentThemeId}'` : `currentThemeId: ''`,
        '',
      ].join('\n'),
      'utf-8',
    )

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to persist theme preset.' }))
  }
}

export async function handleThemeLibrary(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET') {
    try {
      const themes = readThemeLibrary()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, themes }))
    } catch {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Failed to read theme library.' }))
    }
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
    return
  }

  try {
    const body = await readJsonRequestBody(req)
    const action = normalizeThemeScalar(body?.action)
    const existingThemes = readThemeLibrary()

    if (action === 'create') {
      const draftTheme = normalizeThemeRecord(body?.theme)
      const createdTheme = {
        ...draftTheme,
        id: createUniqueThemeId(draftTheme.label, existingThemes),
      }
      const nextThemes = [...existingThemes, createdTheme]
      writeThemeLibrary(nextThemes)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, theme: createdTheme, themes: nextThemes }))
      return
    }

    if (action === 'update') {
      const themeId = normalizeThemeScalar(body?.id)
      const themeIndex = existingThemes.findIndex((theme) => theme.id === themeId)
      if (themeIndex < 0) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Unknown theme id.' }))
        return
      }

      const updatedTheme = {
        ...normalizeThemeRecord(body?.theme, themeId),
        id: existingThemes[themeIndex].id,
      }
      const nextThemes = [...existingThemes]
      nextThemes[themeIndex] = updatedTheme
      writeThemeLibrary(nextThemes)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, theme: updatedTheme, themes: nextThemes }))
      return
    }

    if (action === 'delete') {
      const themeId = normalizeThemeScalar(body?.id)
      const nextThemes = existingThemes.filter((theme) => theme.id !== themeId)
      if (nextThemes.length === existingThemes.length) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Unknown theme id.' }))
        return
      }

      writeThemeLibrary(nextThemes)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, deletedId: themeId, themes: nextThemes }))
      return
    }

    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Unknown theme library action.' }))
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to persist theme library.' }))
  }
}
