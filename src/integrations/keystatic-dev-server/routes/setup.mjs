// Setup Wizard API route handlers

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

import {
  ROOT,
  SOURCE_DIR,
  SITE_CONFIG_PATH,
  BRAND_LOGO_CONFIG_PATH,
  SOCIAL_CONFIG_PATH,
  COPYRIGHT_CONFIG_PATH,
  HOME_CONFIG_PATH,
  CONTACT_CONFIG_PATH,
  PERUSAL_ACCESS_CONFIG_PATH,
  ABOUT_CONFIG_PATH,
  DEPLOY_CONFIG_PATH,
  VALID_SOCIAL_PLATFORMS,
  THEME_CONFIG_PATH,
} from '../constants.mjs'

import {
  readJsonRequestBody,
  isValidEmail,
  isValidHttpUrl,
  spawnScript,
  markKeystaticPostSetupReset,
} from '../helpers.mjs'

// ─── Setup Wizard: Identity API ─────────────────────────────────────────

export async function handleSetupIdentity(req, res) {
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
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
    const siteTitle = typeof body.siteTitle === 'string' ? body.siteTitle.trim() : ''
    const siteDescription = typeof body.siteDescription === 'string' ? body.siteDescription.trim() : ''

    if (!firstName || !lastName) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'firstName and lastName are required.' }))
      return
    }
    if (!email) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'email is required.' }))
      return
    }
    if (!isValidEmail(email)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'email must be a valid email address.' }))
      return
    }
    if (!siteUrl) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'siteUrl is required.' }))
      return
    }
    if (!isValidHttpUrl(siteUrl)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'siteUrl must be a valid URL (http/https).' }))
      return
    }

    const composerName = `${firstName} ${lastName}`
    const resolvedTitle = siteTitle || `${composerName} — Composer`

    // Update site.yaml
    const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
    const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}
    siteData.composerName = composerName
    siteData.siteTitle = resolvedTitle
    if (siteDescription) siteData.siteDescription = siteDescription
    siteData.email = email
    siteData.siteUrl = siteUrl
    fs.writeFileSync(
      SITE_CONFIG_PATH,
      yaml.dump(siteData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    // Update brand-logo.yaml
    const brandRaw = fs.existsSync(BRAND_LOGO_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(BRAND_LOGO_CONFIG_PATH, 'utf8'))
      : {}
    const brandData = brandRaw && typeof brandRaw === 'object' ? brandRaw : {}
    brandData.firstName = firstName
    brandData.lastName = lastName
    fs.writeFileSync(
      BRAND_LOGO_CONFIG_PATH,
      yaml.dump(brandData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    // Update copyright.yaml
    const copyrightRaw = fs.existsSync(COPYRIGHT_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(COPYRIGHT_CONFIG_PATH, 'utf8'))
      : {}
    const copyrightData = copyrightRaw && typeof copyrightRaw === 'object' ? copyrightRaw : {}
    copyrightData.copyrightHolder = composerName
    fs.writeFileSync(
      COPYRIGHT_CONFIG_PATH,
      yaml.dump(copyrightData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    // Replace placeholder name in page content files
    const PLACEHOLDER_NAME = 'FirstName LastName'
    const pageFilesToUpdate = [
      path.join(SOURCE_DIR, 'pages', 'home.yaml'),
      path.join(SOURCE_DIR, 'pages', 'contact.yaml'),
      path.join(SOURCE_DIR, 'pages', 'about', 'about.yaml'),
    ]
    for (const filePath of pageFilesToUpdate) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8')
        if (content.includes(PLACEHOLDER_NAME)) {
          fs.writeFileSync(filePath, content.replaceAll(PLACEHOLDER_NAME, composerName), 'utf8')
        }
      }
    }

    // Update source.config.mjs — defaultComposer used by ingest-works.mjs
    const sourceConfigPath = path.join(ROOT, 'source.config.mjs')
    if (fs.existsSync(sourceConfigPath)) {
      const configContent = fs.readFileSync(sourceConfigPath, 'utf8')
      const updated = configContent.replace(
        /defaultComposer:\s*'[^']*'/,
        `defaultComposer: '${composerName.replace(/'/g, "\\'")}'`,
      )
      if (updated !== configContent) {
        fs.writeFileSync(sourceConfigPath, updated, 'utf8')
      }
    }

    console.log(`[setup] Identity saved: ${composerName}`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, composerName, siteTitle: resolvedTitle }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save identity: ' + err.message }))
  }
}

// ─── Setup Wizard: Social API ──────────────────────────────────────────

export async function handleSetupSocial(req, res) {
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
    const links = Array.isArray(body.links) ? body.links : []

    const normalizedLinks = links
      .filter((link) => link && typeof link === 'object' && VALID_SOCIAL_PLATFORMS.has(link.platform))
      .map((link) => ({
        platform: link.platform,
        url: typeof link.url === 'string' ? link.url.trim() : '',
        enabled: link.enabled === true,
      }))

    const socialYaml = yaml.dump({ links: normalizedLinks }, { lineWidth: 120, noRefs: true, sortKeys: false })
    fs.writeFileSync(SOCIAL_CONFIG_PATH, socialYaml, 'utf8')

    console.log(`[setup] Social links saved: ${normalizedLinks.filter((l) => l.enabled).length} enabled`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save social links: ' + err.message }))
  }
}

// ─── Setup Wizard: Homepage API ──────────────────────────────────────────

export async function handleSetupHomepage(req, res) {
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
    const heroTagline = typeof body.heroTagline === 'string' ? body.heroTagline.trim() : ''
    const heroTaglineAsBlockquote = body.heroTaglineAsBlockquote === true
    const heroTaglineCitation = typeof body.heroTaglineCitation === 'string' ? body.heroTaglineCitation.trim() : ''

    // Read existing home.yaml and update tagline fields inside the hero section
    const homeRaw = fs.existsSync(HOME_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(HOME_CONFIG_PATH, 'utf8'))
      : {}
    const homeData = homeRaw && typeof homeRaw === 'object' ? homeRaw : {}

    // Find the hero section in the sections array
    if (Array.isArray(homeData.sections)) {
      const heroSection = homeData.sections.find(
        (s) => s?.block?.discriminant === 'hero',
      )
      if (heroSection?.block?.value) {
        if (heroTagline) heroSection.block.value.heroTagline = heroTagline
        heroSection.block.value.heroTaglineAsBlockquote = heroTaglineAsBlockquote
        heroSection.block.value.heroTaglineCitation = heroTaglineCitation || ''
      }
    }

    fs.writeFileSync(
      HOME_CONFIG_PATH,
      yaml.dump(homeData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    console.log(`[setup] Homepage tagline saved (blockquote: ${heroTaglineAsBlockquote})`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save homepage config: ' + err.message }))
  }
}

// ─── Setup Wizard: Forms API ──────────────────────────────────────────

export async function handleSetupForms(req, res) {
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

    // Contact form config -> contact.yaml
    const contactFormEnabled = body.contactFormEnabled === true
    const contactWebhookUrl = typeof body.contactWebhookUrl === 'string' ? body.contactWebhookUrl.trim() : ''

    const contactRaw = fs.existsSync(CONTACT_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(CONTACT_CONFIG_PATH, 'utf8'))
      : {}
    const contactData = contactRaw && typeof contactRaw === 'object' ? contactRaw : {}
    contactData.contactFormEnabled = contactFormEnabled
    contactData.contactWebhookUrl = contactWebhookUrl
    fs.writeFileSync(
      CONTACT_CONFIG_PATH,
      yaml.dump(contactData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    // Perusal access config -> perusal-access.yaml
    const perusalGatingEnabled = body.perusalGatingEnabled === true
    const perusalWebhookUrl = typeof body.perusalWebhookUrl === 'string' ? body.perusalWebhookUrl.trim() : ''
    const perusalTokenSecret = typeof body.perusalTokenSecret === 'string' ? body.perusalTokenSecret.trim() : ''
    const perusalTokenExpirationDays =
      typeof body.perusalTokenExpirationDays === 'number' && body.perusalTokenExpirationDays >= 1
        ? Math.round(body.perusalTokenExpirationDays)
        : 90

    const perusalRaw = fs.existsSync(PERUSAL_ACCESS_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(PERUSAL_ACCESS_CONFIG_PATH, 'utf8'))
      : {}
    const perusalData = perusalRaw && typeof perusalRaw === 'object' ? perusalRaw : {}
    perusalData.gatingEnabled = perusalGatingEnabled
    perusalData.webhookUrl = perusalWebhookUrl
    if (perusalTokenSecret) perusalData.tokenSecret = perusalTokenSecret
    perusalData.tokenExpirationDays = perusalTokenExpirationDays
    fs.writeFileSync(
      PERUSAL_ACCESS_CONFIG_PATH,
      yaml.dump(perusalData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    console.log(`[setup] Forms saved: contact=${contactFormEnabled}, perusal-gating=${perusalGatingEnabled}`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save forms config: ' + err.message }))
  }
}

// ─── Setup Wizard: File Upload API ──────────────────────────────────────

export async function handleSetupUpload(req, res, rawUrl) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'PUT') {
    res.statusCode = 405
    res.setHeader('Allow', 'PUT, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
    return
  }

  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const dest = url.searchParams.get('dest') || ''

    // Validate destination path — must start with an allowed prefix
    const ALLOWED_PREFIXES = ['pages/about/', 'works/']
    const isAllowed = ALLOWED_PREFIXES.some((prefix) => dest.startsWith(prefix))
    if (!dest || !isAllowed) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid upload destination.' }))
      return
    }

    // Prevent path traversal
    const resolved = path.resolve(SOURCE_DIR, dest)
    if (!resolved.startsWith(SOURCE_DIR)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid path.' }))
      return
    }

    // Stream request body to file
    const destDir = path.dirname(resolved)
    fs.mkdirSync(destDir, { recursive: true })

    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const fileBuffer = Buffer.concat(chunks)
    fs.writeFileSync(resolved, fileBuffer)

    console.log(`[setup] File uploaded: ${dest} (${fileBuffer.length} bytes)`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, path: dest, size: fileBuffer.length }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to upload file: ' + err.message }))
  }
}

// ─── Setup Wizard: About Page API ──────────────────────────────────────

export async function handleSetupAbout(req, res) {
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
    const profileImageAlt = typeof body.profileImageAlt === 'string' ? body.profileImageAlt.trim() : ''
    const aboutBody = typeof body.body === 'string' ? body.body.trim() : ''
    const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim() : ''

    // Read composer name for auto-generating meta title
    const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
    const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}
    const composerName = siteData.composerName || 'FirstName LastName'

    // Read existing about.yaml and merge
    const aboutDir = path.dirname(ABOUT_CONFIG_PATH)
    fs.mkdirSync(aboutDir, { recursive: true })
    const aboutRaw = fs.existsSync(ABOUT_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(ABOUT_CONFIG_PATH, 'utf8'))
      : {}
    const aboutData = aboutRaw && typeof aboutRaw === 'object' ? aboutRaw : {}

    aboutData.metaTitle = `About ${composerName}`
    if (metaDescription) {
      aboutData.metaDescription = metaDescription
    } else if (!aboutData.metaDescription) {
      aboutData.metaDescription = `About composer ${composerName}: artistic background, compositional voice, and current work.`
    }
    if (!aboutData.searchResultText) {
      aboutData.searchResultText = `About ${composerName}: composer writing contemporary concert and chamber music.`
    }
    if (profileImageAlt) aboutData.profileImageAlt = profileImageAlt
    if (aboutBody) aboutData.body = aboutBody

    fs.writeFileSync(
      ABOUT_CONFIG_PATH,
      yaml.dump(aboutData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    console.log(`[setup] About page saved`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save about page: ' + err.message }))
  }
}

// ─── Setup Wizard: Work API ──────────────────────────────────────────

export async function handleSetupWork(req, res) {
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
    const addFirstWork = body.addFirstWork !== false // default true
    const includeStarters = body.includeStarters !== false // default true
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const thumbnailAlt = typeof body.thumbnailAlt === 'string' ? body.thumbnailAlt.trim() : ''
    const thumbnailUploaded = body.thumbnailUploaded === true
    const hasRecording = body.hasRecording === true
    const recordingFolder = typeof body.recordingFolder === 'string' ? body.recordingFolder.trim() : ''
    const instrumentation = Array.isArray(body.instrumentation)
      ? body.instrumentation.filter((s) => typeof s === 'string' && s.trim())
      : []
    const youtubeUrl = typeof body.youtubeUrl === 'string' ? body.youtubeUrl.trim() : ''
    const sheetMusicUrl = typeof body.sheetMusicUrl === 'string' ? body.sheetMusicUrl.trim() : ''

    const removeStarterWorksIfNeeded = () => {
      if (!includeStarters) {
        const worksDir = path.join(SOURCE_DIR, 'works')
        const exampleDirs = ['example-chamber-piece', 'example-solo-with-recording']
        for (const dir of exampleDirs) {
          const examplePath = path.join(worksDir, dir)
          if (fs.existsSync(examplePath)) {
            fs.rmSync(examplePath, { recursive: true, force: true })
            console.log(`[setup] Removed starter work: ${dir}`)
          }
        }
      }
    }

    if (!addFirstWork) {
      removeStarterWorksIfNeeded()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, skipped: true }))
      return
    }

    if (!title || !slug) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'title and slug are required when adding a work.' }))
      return
    }
    if (!description) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'description is required when adding a work.' }))
      return
    }
    if (!thumbnailUploaded) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'thumbnail image is required when adding a work.' }))
      return
    }
    if (youtubeUrl && !isValidHttpUrl(youtubeUrl)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'youtubeUrl must be a valid URL (http/https).' }))
      return
    }
    if (sheetMusicUrl && !isValidHttpUrl(sheetMusicUrl)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'sheetMusicUrl must be a valid URL (http/https).' }))
      return
    }

    // Build work.yaml data
    const today = new Date().toISOString().split('T')[0]
    const workData = {
      title,
      subtitle: subtitle || '',
      description,
      thumbnail: {
        alt: thumbnailAlt || title,
        crop: '',
      },
      completionDate: today,
      duration: '',
      difficulty: '',
      tags: [],
      instrumentation,
      searchKeywords: [],
      selected: true,
      selectedOrder: 1,
      recordings: [],
      performances: [],
      sheetMusic: [],
    }

    // If audio was uploaded, add a recording entry
    if (hasRecording && recordingFolder) {
      workData.recordings.push({
        folder: recordingFolder,
        performers: [],
        date: today,
        duration: '',
        youtubeUrl: youtubeUrl || '',
        photo: { alt: '' },
        featuredRecording: true,
        movements: [],
      })
    } else if (youtubeUrl) {
      workData.recordings.push({
        folder: '',
        performers: [],
        date: today,
        duration: '',
        youtubeUrl,
        photo: { alt: '' },
        featuredRecording: true,
        movements: [],
      })
    }

    if (sheetMusicUrl) {
      workData.sheetMusic.push(sheetMusicUrl)
    }

    const workDir = path.join(SOURCE_DIR, 'works', slug)
    fs.mkdirSync(workDir, { recursive: true })
    fs.writeFileSync(
      path.join(workDir, 'work.yaml'),
      yaml.dump(workData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    removeStarterWorksIfNeeded()

    console.log(`[setup] Work created: ${slug}`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, slug }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to create work: ' + err.message }))
  }
}

// ─── Setup Wizard: Deploy API ──────────────────────────────────────────

export async function handleSetupDeploy(req, res) {
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
    const sftpHost = typeof body.sftpHost === 'string' ? body.sftpHost.trim() : ''
    const sftpUser = typeof body.sftpUser === 'string' ? body.sftpUser.trim() : ''
    const sftpRemotePath = typeof body.sftpRemotePath === 'string' ? body.sftpRemotePath.trim() : '/public_html'
    const sftpPort = typeof body.sftpPort === 'number' && body.sftpPort > 0 ? body.sftpPort : 22

    const deployData = {
      sftpHost,
      sftpUser,
      sftpRemotePath,
      sftpPrivateRemotePath: '',
      sftpPort,
    }

    fs.writeFileSync(
      DEPLOY_CONFIG_PATH,
      yaml.dump(deployData, { lineWidth: 120, noRefs: true, sortKeys: false }),
      'utf8',
    )

    console.log(`[setup] Deploy config saved: ${sftpHost}`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to save deploy config: ' + err.message }))
  }
}

// ─── Setup Wizard: Status API ──────────────────────────────────────────

export async function handleSetupStatus(req, res) {
  try {
    const siteRaw = fs.existsSync(SITE_CONFIG_PATH) ? yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')) : {}
    const siteData = siteRaw && typeof siteRaw === 'object' ? siteRaw : {}

    const brandRaw = fs.existsSync(BRAND_LOGO_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(BRAND_LOGO_CONFIG_PATH, 'utf8'))
      : {}
    const brandData = brandRaw && typeof brandRaw === 'object' ? brandRaw : {}

    const themeRaw = fs.existsSync(THEME_CONFIG_PATH) ? yaml.load(fs.readFileSync(THEME_CONFIG_PATH, 'utf8')) : {}
    const themeData = themeRaw && typeof themeRaw === 'object' ? themeRaw : {}

    const socialRaw = fs.existsSync(SOCIAL_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(SOCIAL_CONFIG_PATH, 'utf8'))
      : {}
    const socialData = socialRaw && typeof socialRaw === 'object' ? socialRaw : {}

    const homeRaw = fs.existsSync(HOME_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(HOME_CONFIG_PATH, 'utf8'))
      : {}
    const homeFileData = homeRaw && typeof homeRaw === 'object' ? homeRaw : {}

    // Extract hero section tagline data from nested sections array
    const heroSection = Array.isArray(homeFileData.sections)
      ? homeFileData.sections.find((s) => s?.block?.discriminant === 'hero')
      : null
    const heroFileData = heroSection?.block?.value || {}

    const contactRaw = fs.existsSync(CONTACT_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(CONTACT_CONFIG_PATH, 'utf8'))
      : {}
    const contactData = contactRaw && typeof contactRaw === 'object' ? contactRaw : {}

    const perusalRaw = fs.existsSync(PERUSAL_ACCESS_CONFIG_PATH)
      ? yaml.load(fs.readFileSync(PERUSAL_ACCESS_CONFIG_PATH, 'utf8'))
      : {}
    const perusalData = perusalRaw && typeof perusalRaw === 'object' ? perusalRaw : {}

    const composerName = siteData.composerName || 'FirstName LastName'

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        ok: true,
        site: {
          composerName,
          email: siteData.email || '',
          siteTitle: siteData.siteTitle || '',
          siteDescription: siteData.siteDescription || '',
        },
        brand: {
          firstName: brandData.firstName || '',
          lastName: brandData.lastName || '',
        },
        theme: {
          currentThemeId: themeData.currentThemeId || '',
        },
        social: {
          links: Array.isArray(socialData.links) ? socialData.links : [],
        },
        homepage: {
          heroTagline: heroFileData.heroTagline || '',
          heroTaglineAsBlockquote: heroFileData.heroTaglineAsBlockquote === true,
          heroTaglineCitation: heroFileData.heroTaglineCitation || '',
        },
        forms: {
          contactFormEnabled: contactData.contactFormEnabled === true,
          contactWebhookUrl: contactData.contactWebhookUrl || '',
          perusalGatingEnabled: perusalData.gatingEnabled !== false,
          perusalWebhookUrl: perusalData.webhookUrl || '',
          perusalTokenSecret: perusalData.tokenSecret || '',
          perusalTokenExpirationDays: perusalData.tokenExpirationDays || 90,
        },
        isPlaceholder: composerName === 'FirstName LastName',
      }),
    )
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Failed to read setup status: ' + err.message }))
  }
}

// ─── Setup Wizard: Finalize (runs ingest pipeline) ─────────────────────

export async function handleSetupFinalize(req, res) {
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

  // Force a one-time Keystatic cache reset on next /keystatic load.
  // This runs before the editor mounts, avoiding manual in-session DB
  // clears that can leave singletons stuck in a loading state.
  markKeystaticPostSetupReset()

  // Respond immediately so the wizard doesn't wait — run the pipeline async.
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: true }))

  // Run the full works pipeline in the background:
  // 1. ingest-works — converts source/works/ YAML -> src/content/works/ MDX
  // 2. generate-works-images — creates webp thumbnails from ingested images
  // 3. generate-page-search-index — rebuilds the search index with new works
  ;(async () => {
    try {
      console.log('[setup] Running works ingest pipeline…')
      await spawnScript(path.join(ROOT, 'scripts', 'ingest-works.mjs'))
      console.log('[setup] Works ingest complete. Running data generation…')
      await spawnScript(path.join(ROOT, 'scripts', 'generate-works-images.mjs'))
      console.log('[setup] Works images generated.')
      await spawnScript(path.join(ROOT, 'scripts', 'generate-page-search-index.mjs'))
      console.log('[setup] Search index rebuilt. Works pipeline done.')
    } catch (err) {
      console.error('[setup] Works pipeline error:', err.message)
    }
  })()
}
