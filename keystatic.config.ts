import yaml from 'js-yaml'
import { config, fields, collection, singleton } from '@keystatic/core'
import { tokenizedTextField } from './src/keystatic/tokenized-text-field'
import { tokenizedInputField } from './src/keystatic/tokenized-input-field'
import { textFieldWithPlaceholder } from './src/keystatic/text-field-with-placeholder'
import { filenamePreviewField } from './src/keystatic/filename-preview-field'
import { headerSlotsField } from './src/keystatic/header-slots-field'
import { heroImagePreviewField } from './src/keystatic/hero-image-preview-field'
import { workImagePreviewField } from './src/keystatic/work-image-preview-field'
import { accordionSectionsField } from './src/keystatic/accordion-sections-field'
import pdfScoresManifest from './api/pdf-scores.json'
import themeLibrarySource from './source/site/theme-library.yaml?raw'
import themeSelectionSource from './source/site/theme-selection.yaml?raw'
import { THEME_PRESETS } from './src/utils/theme-presets'

// Keystatic manages:
// - Work definitions in source/works/
// - Singletons organized by prefix (ordered for sidebar display):
//     Global:  Site-wide settings (identity, theme, deployment, score access/PDF)
//     Layout:  Page/site composition (which blocks appear and in what order)
//     Page:    Page-specific content and settings (sub-singletons like "Page: Home: Hero")
//     Block:   Reusable content blocks (header, footer, nav, social, etc.)
//
// Run: npm run dev  →  open http://localhost:4321/keystatic

// ── Hero options for accordion sections field ────────────────────────────────
// Read available hero slugs at config time via Vite glob so the custom
// accordion field can show a dropdown instead of a raw text input.

const heroYamlModules = import.meta.glob('./source/heroes/*/hero.yaml')
const heroSelectOptions = Object.keys(heroYamlModules)
  .map((p) => p.match(/\/heroes\/([^/]+)\//)?.[1])
  .filter((s): s is string => s != null)
  .sort()
  .map((slug) => ({ label: slug, value: slug }))

const headerElementOptions = [
  { label: 'Brand / Logo', value: 'brand-logo' },
  { label: 'Main Menu (inline nav links)', value: 'main-menu' },
  { label: 'Site Search', value: 'site-search' },
  { label: 'Mobile Menu (hamburger)', value: 'mobile-menu' },
] as const

function readCurrentThemeSelectionId(): string {
  try {
    const parsed = yaml.load(themeSelectionSource)
    if (!parsed || typeof parsed !== 'object') return ''
    const currentThemeId = (parsed as { currentThemeId?: unknown }).currentThemeId
    return typeof currentThemeId === 'string' ? currentThemeId.trim() : ''
  } catch {
    return ''
  }
}

function getThemeSelectionOptions(currentThemeId: string): Array<{ label: string; value: string }> {
  const fallbackThemes = THEME_PRESETS.map((theme) => ({
    label: theme.label,
    value: theme.id,
  }))

  const libraryThemes = (() => {
    try {
      const parsed = yaml.load(themeLibrarySource)
      if (!parsed || typeof parsed !== 'object') return fallbackThemes
      const rawThemes = Array.isArray((parsed as { themes?: unknown }).themes)
        ? (parsed as { themes: unknown[] }).themes
        : []
      const options = rawThemes
        .map((theme) => {
          const record = theme && typeof theme === 'object' ? (theme as { id?: unknown; label?: unknown }) : {}
          const value = typeof record.id === 'string' ? record.id.trim() : ''
          const label = typeof record.label === 'string' ? record.label.trim() : ''
          return value && label ? { label, value } : null
        })
        .filter((option): option is { label: string; value: string } => option !== null)

      return options.length > 0 ? options : fallbackThemes
    } catch {
      return fallbackThemes
    }
  })()

  const options = [...libraryThemes]
  if (currentThemeId && !options.some((option) => option.value === currentThemeId)) {
    options.unshift({
      label: `Current theme (${currentThemeId})`,
      value: currentThemeId,
    })
  }

  options.push({
    label: 'Custom applied theme',
    value: '',
  })

  return options
}

const currentThemeSelectionId = readCurrentThemeSelectionId()
const themeSelectionOptions = getThemeSelectionOptions(currentThemeSelectionId)
const defaultThemeSelectionValue =
  currentThemeSelectionId || themeSelectionOptions.find((option) => option.value)?.value || ''

export default config({
  storage: {
    kind: 'local',
  },

  singletons: {
    // ── Global: Deployment ───────────────────────────────────────────────────
    deploy: singleton({
      label: 'Global: Deployment',
      path: 'source/site/deploy',
      format: { data: 'yaml' },
      schema: {
        sftpHost: fields.text({
          label: 'SFTP host',
          description: 'Server hostname or IP. Leave blank to disable deploy.',
        }),
        sftpUser: fields.text({ label: 'SFTP username' }),
        sftpRemotePath: fields.text({
          label: 'Remote path',
          description: 'e.g. /public_html',
        }),
        sftpPort: fields.integer({ label: 'Port', defaultValue: 22 }),
        sftpPrivateRemotePath: fields.text({
          label: 'Private remote path',
          description:
            'Remote path for private files (PDF scores). Auto-derived from Remote path if blank (replaces public_html with private_html).',
        }),
      },
    }),

    // ── Global: Redirects ──────────────────────────────────────────────────
    redirects: singleton({
      label: 'Global: Redirects',
      path: 'source/site/redirects',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        rules: fields.array(
          fields.object({
            from: fields.text({
              label: 'From path',
              description: 'The old URL path (e.g. /works/). Must start with /.',
              validation: { isRequired: true },
            }),
            to: fields.text({
              label: 'To path',
              description: 'The new URL path (e.g. /music/). Leave blank for 410 Gone.',
            }),
            type: fields.select({
              label: 'Type',
              defaultValue: '301',
              options: [
                { label: '301 Permanent', value: '301' },
                { label: '302 Temporary', value: '302' },
                { label: '410 Gone', value: '410' },
              ],
            }),
            matchType: fields.select({
              label: 'Match type',
              defaultValue: 'exact',
              options: [
                { label: 'Exact path', value: 'exact' },
                { label: 'Prefix (wildcard)', value: 'prefix' },
              ],
            }),
            enabled: fields.checkbox({ label: 'Enabled', defaultValue: true }),
            note: fields.text({
              label: 'Note',
              description: 'Optional reminder for why this redirect exists',
            }),
          }),
          {
            label: 'Redirect rules',
            itemLabel: (props) => {
              const from = props.fields.from.value || '...'
              const to = props.fields.to.value || '(gone)'
              const type = props.fields.type.value
              const enabled = props.fields.enabled.value
              const prefix = enabled ? '' : '[OFF] '
              return `${prefix}${from} → ${to} [${type}]`
            },
          },
        ),
      },
    }),

    // ── Global: Email Layout ──────────────────────────────────────────────────
    emailLayout: singleton({
      label: 'Global: Email Layout',
      path: 'source/site/email-layout',
      format: { data: 'yaml' },
      schema: {
        showHeaderFavicon: fields.checkbox({
          label: 'Show favicon in email header',
          description: 'Display the site favicon to the left of the title in the email header bar.',
          defaultValue: true,
        }),
        showSignatureLogo: fields.checkbox({
          label: 'Show brand logo in email signature',
          description:
            'Display the brand logo above the copyright text in user-facing emails (magic link, auto-reply).',
          defaultValue: true,
        }),
        signatureLogoWidth: fields.integer({
          label: 'Signature logo display width (px)',
          description:
            'Width at which the brand logo is displayed in the email signature. The image is generated at 2× for retina screens.',
          defaultValue: 160,
          validation: { min: 60, max: 400 },
        }),
      },
    }),

    // ── Global: Score: Access ────────────────────────────────────────────────
    scoreAccess: singleton({
      label: 'Global: Score: Access',
      path: 'source/site/perusal-access',
      format: { data: 'yaml' },
      schema: {
        gatingEnabled: fields.checkbox({
          label: 'Enable score gating',
          description:
            'When enabled, visitors must provide their name and email before viewing perusal scores. A magic link is sent to their email.',
          defaultValue: false,
        }),
        gatingMode: fields.select({
          label: 'Gating mode',
          description: 'How score access is granted after the visitor submits the form',
          defaultValue: 'magic-link',
          options: [
            { label: 'Magic link (email verification)', value: 'magic-link' },
            { label: 'None (gating disabled)', value: 'none' },
          ],
        }),
        tokenExpirationDays: fields.integer({
          label: 'Token expiration (days)',
          description: 'How many days a magic link remains valid',
          defaultValue: 90,
        }),
        webhookUrl: fields.text({
          label: 'Webhook URL (interim mode)',
          description:
            'URL to POST form submissions to (e.g. Zapier, Google Apps Script). Used when no API endpoint is configured.',
        }),
        tokenSecret: fields.text({
          label: 'Token secret',
          description:
            'HMAC signing secret for tokens. In interim mode this is embedded in the page source. In production mode this should only exist on the server.',
        }),
        emailSubject: fields.text({
          label: 'Magic link email subject',
          description:
            'Subject line for the access link email. Tokens: {{firstName}}, {{workTitle}}, {{composerName}}. Leave blank for the default.',
        }),
        emailMessage: tokenizedTextField({
          label: 'Magic link email body',
          description:
            'Full body text for the magic link email. Click a token to insert it at the cursor. Button tokens (scoreLink, PDF links) render as buttons. Use {{#if token}}…{{/if}} to conditionally show content only when available. Use {{#if false}}…{{/if}} to disable a block without deleting it, or {{#if true}}…{{/if}} to force a block on.',
          tokens: [
            { name: 'firstName', description: "Recipient's first name" },
            { name: 'workTitle', description: 'Title of the composition' },
            { name: 'composerName', description: 'Your name (from Site Identity)' },
            { name: 'scoreLink', description: 'Perusal score link (renders as button in email)' },
            {
              name: 'watermarkedPdfLink',
              description: 'Download link for watermarked PDF score (renders as button)',
              conditional: true,
            },
            {
              name: 'originalPdfLink',
              description: 'Download link for original PDF score (renders as button)',
              conditional: true,
            },
            { name: 'workPageLink', description: "Link to the work's page on your site" },
            { name: 'siteUrl', description: 'Your website URL' },
            { name: 'expirationDays', description: 'Number of days until the link expires' },
          ],
        }),
        notificationSubject: textFieldWithPlaceholder({
          label: 'Owner notification email subject',
          description:
            'Subject for the email you receive when someone requests a perusal score. Tokens: {{firstName}}, {{workTitle}}, {{composerName}}, {{siteDomain}}.',
          defaultValue: 'New score request from {{firstName}} via {{siteDomain}}',
          placeholder: 'New score request from {{firstName}} via {{siteDomain}}',
        }),
        pdfWatermarkedEnabled: fields.checkbox({
          label: 'Enable watermarked PDF downloads',
          description:
            'Generate and deploy watermarked PDF scores for download. Download links are included in the magic-link email.',
          defaultValue: true,
        }),
        pdfOriginalEnabled: fields.checkbox({
          label: 'Enable original PDF downloads',
          description:
            'Generate and deploy original (unwatermarked) PDF scores for download. Use with caution — originals have no copy protection.',
          defaultValue: false,
        }),
        pdfWatermarkedGated: fields.checkbox({
          label: 'Gate watermarked PDF downloads',
          description:
            'Require a valid token to download watermarked PDFs. When unchecked, watermarked PDFs can be downloaded without authentication.',
          defaultValue: true,
        }),
        pdfOriginalGated: fields.checkbox({
          label: 'Gate original PDF downloads',
          description:
            'Require a valid token to download original PDFs. When unchecked, original PDFs can be downloaded without authentication.',
          defaultValue: true,
        }),
        nameMaxLength: fields.integer({
          label: 'Name field max length',
          description:
            'Maximum characters allowed in the name field. Synced to backend validation via api/.env.validation.',
          defaultValue: 120,
          validation: { min: 1, max: 500 },
        }),
      },
    }),

    // ── Global: Score: PDF ───────────────────────────────────────────────────
    scorePdf: singleton({
      label: 'Global: Score: PDF',
      path: 'source/site/score-pdf',
      format: { data: 'yaml' },
      schema: {
        downloadFilenameFormat: tokenizedInputField({
          label: 'PDF download filename format',
          description:
            'Template for the download filename. Tokens are replaced with actual values. ' +
            'Empty tokens are collapsed. The .pdf extension is appended automatically.',
          defaultValue: '{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}',
          placeholder: '{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}',
          fieldName: 'downloadFilenameFormat',
          tokens: [
            { name: 'composerName', description: 'Composer name (from Site Identity)' },
            { name: 'workTitle', description: 'Title of the composition' },
            { name: 'workSubtitle', description: 'Subtitle of the composition (if set)' },
            { name: 'instrumentation', description: 'Instrumentation list (joined with commas)' },
            { name: 'downloadDate', description: 'Current date (YYYY-MM-DD format)' },
            {
              name: 'suffix',
              description: 'Filename suffix (resolved from the fields below, depending on PDF type)',
            },
          ],
        }),
        downloadWatermarkedSuffix: textFieldWithPlaceholder({
          label: 'Watermarked PDF filename suffix',
          description: 'Appended to the filename for watermarked PDF downloads.',
          defaultValue: 'PERUSAL SCORE',
          placeholder: 'PERUSAL SCORE',
          fieldName: 'downloadWatermarkedSuffix',
        }),
        downloadOriginalSuffix: textFieldWithPlaceholder({
          label: 'Original score PDF filename suffix',
          description:
            'Appended to the filename for original (unwatermarked) PDF downloads. Leave blank for no suffix.',
          placeholder: 'e.g. SCORE',
          fieldName: 'downloadOriginalSuffix',
        }),
        downloadFilenamePreview: filenamePreviewField({
          label: 'Filename preview',
          description: 'Preview resolved filenames for all works using the current template and suffix values above.',
          works: pdfScoresManifest,
          templateFieldName: 'downloadFilenameFormat',
          watermarkedSuffixFieldName: 'downloadWatermarkedSuffix',
          originalSuffixFieldName: 'downloadOriginalSuffix',
          defaultTemplate: '{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}',
          defaultWatermarkedSuffix: 'PERUSAL SCORE',
        }),
        watermarkOverrides: fields.conditional(
          fields.checkbox({
            label: 'Override watermark settings for PDFs',
            description:
              'When checked, the PDF watermark uses the settings below instead of inheriting from Page: Score Viewer.',
            defaultValue: false,
          }),
          {
            true: fields.object({
              watermarkText: fields.text({
                label: 'Watermark text',
                description: 'Text stamped on each page of the watermarked PDF.',
              }),
              watermarkColor: fields.text({
                label: 'Watermark color',
                description: 'CSS hex color (e.g. #B40000).',
              }),
              watermarkOpacity: fields.integer({
                label: 'Watermark opacity (%)',
                description: 'Opacity of the watermark text (1–100).',
                validation: { min: 1, max: 100 },
              }),
              watermarkAngle: fields.integer({
                label: 'Watermark angle (degrees)',
                description: 'Rotation angle for the watermark text (-90 to 90).',
                validation: { min: -90, max: 90 },
              }),
              watermarkFont: fields.select({
                label: 'Watermark font',
                options: [
                  { label: 'Sans-serif (system default)', value: 'sans-serif' },
                  { label: 'Serif (system default)', value: 'serif' },
                  { label: 'Heading font (from Theme)', value: 'heading' },
                  { label: 'Body font (from Theme)', value: 'body' },
                ],
                defaultValue: 'sans-serif',
              }),
              watermarkFontScale: fields.integer({
                label: 'Watermark font scale (%)',
                description: 'Scale relative to default size (50–200).',
                validation: { min: 50, max: 200 },
              }),
              watermarkSpacing: fields.integer({
                label: 'Watermark spacing (%)',
                description: 'Spacing between watermark repetitions (50–300).',
                validation: { min: 50, max: 300 },
              }),
            }),
            false: fields.empty(),
          },
        ),
      },
    }),
    // ── Global: Site Identity ────────────────────────────────────────────────
    site: singleton({
      label: 'Global: Site Identity',
      path: 'source/site/site',
      format: { data: 'yaml' },
      schema: {
        composerName: fields.text({
          label: 'Composer name',
          description: 'Your full name — used throughout the site (titles, meta tags, copyright, etc.)',
          validation: { isRequired: true },
        }),
        siteTitle: fields.text({
          label: 'Site title',
          description: 'Default browser tab title (e.g. "FirstName LastName - Composer")',
        }),
        siteDescription: fields.text({
          label: 'Site description',
          description: 'Default meta description for search engines',
          multiline: true,
        }),
        siteUrl: fields.url({
          label: 'Site URL',
          description: 'Canonical URL (e.g. https://example.com)',
        }),
        email: fields.text({
          label: 'Contact email',
          description: 'Shown on the contact page',
        }),
        googleAnalyticsId: fields.text({
          label: 'Google Analytics ID',
          description: 'Measurement ID (e.g. G-XXXXXXXXXX). Leave blank to disable analytics.',
        }),
        apiEndpoint: fields.text({
          label: 'API endpoint URL',
          description:
            'URL for the backend API that handles form submissions and sends emails (e.g. https://example.com/api). Leave blank if no backend is deployed.',
        }),
        perusalScoreOnlyMode: fields.checkbox({
          label: 'Perusal score only mode',
          description:
            'When enabled, the site only outputs perusal score pages with a simple index. Useful if you already have a main website.',
          defaultValue: false,
        }),
      },
    }),

    // ── Global: Theme ────────────────────────────────────────────────────────
    theme: singleton({
      label: 'Global: Theme',
      path: 'source/site/theme-selection',
      format: { data: 'yaml' },
      schema: {
        currentThemeId: fields.select({
          label: 'Current theme',
          description:
            'This only switches which saved theme is live. Use Theme Studio in the Astro dev toolbar (paint palette icon) to edit themes live, save variants, and click Apply when you want to commit a draft.',
          defaultValue: defaultThemeSelectionValue,
          options: themeSelectionOptions,
        }),
      },
    }),

    // ── Layout: Footer ─────────────────────────────────────────────────────
    footer: singleton({
      label: 'Layout: Footer',
      path: 'source/site/footer',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        leftSlot: fields.select({
          label: 'Left slot',
          description: 'Content displayed on the left side of the footer.',
          defaultValue: 'copyright',
          options: [
            { label: 'Copyright', value: 'copyright' },
            { label: 'Footer Menu', value: 'footer-menu' },
            { label: 'None', value: 'none' },
          ],
        }),
        centerSlot: fields.select({
          label: 'Center slot',
          description: 'Content displayed in the center of the footer.',
          defaultValue: 'none',
          options: [
            { label: 'None', value: 'none' },
            { label: 'Copyright', value: 'copyright' },
            { label: 'Footer Menu', value: 'footer-menu' },
          ],
        }),
        rightSlot: fields.select({
          label: 'Right slot',
          description: 'Content displayed on the right side of the footer.',
          defaultValue: 'footer-menu',
          options: [
            { label: 'Footer Menu', value: 'footer-menu' },
            { label: 'Copyright', value: 'copyright' },
            { label: 'None', value: 'none' },
          ],
        }),
      },
    }),

    // ── Layout: Global ────────────────────────────────────────────────────
    globalLayout: singleton({
      label: 'Layout: Global',
      path: 'source/site/global-layout',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        sections: fields.array(
          fields.object({
            key: fields.select({
              label: 'Block',
              defaultValue: 'header',
              options: [
                { label: 'Block: Header', value: 'header' },
                { label: 'Block: Breadcrumbs', value: 'breadcrumbs' },
                { label: 'Block: Footer', value: 'footer' },
                { label: 'Block: Social Media', value: 'social-media' },
              ],
            }),
          }),
          {
            label: 'Structural blocks',
            description: 'Controls which structural blocks appear on every page. Remove a block to hide it.',
            itemLabel: (props) => {
              const key = props.fields.key.value
              const labels: Record<string, string> = {
                header: 'Block: Header',
                breadcrumbs: 'Block: Breadcrumbs',
                footer: 'Block: Footer',
                'social-media': 'Block: Social Media',
              }
              return labels[key] ?? key
            },
          },
        ),
      },
    }),

    // ── Layout: Header (Desktop) ─────────────────────────────────────────
    headerDesktop: singleton({
      label: 'Layout: Header: Desktop',
      path: 'source/site/header-desktop',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        slots: headerSlotsField({
          label: 'Header slots',
          description: 'Drag elements between slots to rearrange the desktop header layout.',
          elements: headerElementOptions,
          defaultValue: { left: ['brand-logo'], center: [], right: ['main-menu', 'site-search'] },
        }),
      },
    }),

    // ── Layout: Header (Mobile) ──────────────────────────────────────────
    headerMobile: singleton({
      label: 'Layout: Header: Mobile',
      path: 'source/site/header-mobile',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        slots: headerSlotsField({
          label: 'Header slots',
          description: 'Drag elements between slots to rearrange the mobile header layout.',
          elements: headerElementOptions,
          defaultValue: { left: ['brand-logo'], center: [], right: ['mobile-menu'] },
        }),
      },
    }),

    // ── Layout: Header (Tablet) ──────────────────────────────────────────
    headerTablet: singleton({
      label: 'Layout: Header: Tablet',
      path: 'source/site/header-tablet',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        slots: headerSlotsField({
          label: 'Header slots',
          description: 'Drag elements between slots to rearrange the tablet header layout.',
          elements: headerElementOptions,
          defaultValue: { left: ['brand-logo'], center: [], right: ['mobile-menu', 'site-search'] },
        }),
      },
    }),

    // ── Page: 404 (Not Found) ───────────────────────────────────────────────
    notFoundPage: singleton({
      label: 'Page: 404 (Not Found)',
      path: 'source/pages/not-found',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({
          label: 'Title',
          description: 'Large heading shown on the 404 page. Defaults to "404".',
        }),
        message: fields.text({
          label: 'Message',
          description: 'Primary message shown below the title.',
        }),
        submessage: fields.text({
          label: 'Submessage',
          description: 'Secondary message shown below the primary message.',
        }),
        buttonLabel: fields.text({
          label: 'Button label',
          description: 'Label for the "go home" button. Defaults to "Da capo".',
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: About ──────────────────────────────────────────────────────────
    aboutPage: singleton({
      label: 'Page: About',
      path: 'source/pages/about/about',
      format: { data: 'yaml' },
      schema: {
        metaTitle: fields.text({ label: 'Meta title' }),
        metaDescription: fields.text({ label: 'Meta description', multiline: true }),
        searchResultText: fields.text({
          label: 'Search result text',
          description: 'Text shown for this page inside search suggestions/results.',
          multiline: true,
        }),
        profileImageAlt: fields.text({
          label: 'Profile image alt text',
          description: 'Describe the profile image for screen readers',
        }),
        body: fields.mdx.inline({
          label: 'Bio content',
          description:
            'Rich text biography content. Supports bold, italic, and links. Separate paragraphs with blank lines. The first paragraph is styled as a lede.',
          options: {
            bold: true,
            italic: true,
            link: true,
          },
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Accessibility Statement ────────────────────────────────────────
    accessibilityPage: singleton({
      label: 'Page: Accessibility Statement',
      path: 'source/pages/accessibility-statement',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({
          label: 'Page title',
          description: 'Heading shown on the accessibility statement page. Defaults to "Accessibility statement".',
        }),
        subtitle: fields.text({
          label: 'Page subtitle',
          description: 'Subtitle shown below the title.',
          multiline: true,
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Contact ────────────────────────────────────────────────────────
    contactPage: singleton({
      label: 'Page: Contact',
      path: 'source/pages/contact',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({ label: 'Page title', description: 'Heading shown on the contact page' }),
        metaTitle: fields.text({ label: 'Meta title', description: 'Browser tab title' }),
        metaDescription: fields.text({ label: 'Meta description', multiline: true }),
        searchResultText: fields.text({
          label: 'Search result text',
          description: 'Text shown for this page inside search suggestions/results.',
          multiline: true,
        }),
        introText: fields.text({
          label: 'Intro text',
          description: 'Shown above the email/contact form',
          multiline: true,
        }),
        contactFormEnabled: fields.checkbox({
          label: 'Enable contact form',
          description: 'Show a contact form instead of just the email link.',
          defaultValue: false,
        }),
        contactWebhookUrl: fields.text({
          label: 'Contact form webhook URL',
          description:
            'URL to POST contact form submissions to (e.g. Google Apps Script). When a backend API endpoint is configured, submissions go there instead.',
        }),
        autoReplySubject: fields.text({
          label: 'Auto-reply email subject',
          description:
            'Subject line for the automatic thank-you email. Tokens: {{name}}, {{composerName}}. Leave blank for the default.',
        }),
        autoReplyMessage: tokenizedTextField({
          label: 'Auto-reply email body',
          description:
            'Body text for the auto-reply email. The original message is automatically shown below this text. Click a token to insert it.',
          tokens: [
            { name: 'name', description: "Sender's full name" },
            { name: 'composerName', description: 'Your name (from Site Identity)' },
            { name: 'siteUrl', description: 'Your website URL' },
          ],
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
        nameMaxLength: fields.integer({
          label: 'Name field max length',
          description:
            'Maximum characters allowed in the name field. Synced to backend validation via api/.env.validation.',
          defaultValue: 120,
          validation: { min: 1, max: 500 },
        }),
        messageMaxLength: fields.integer({
          label: 'Message field max length',
          description:
            'Maximum characters allowed in the message field. Synced to backend validation via api/.env.validation.',
          defaultValue: 4000,
          validation: { min: 1, max: 10000 },
        }),
        showCharacterCount: fields.checkbox({
          label: 'Show character count',
          description: 'Show remaining character count on the message field when nearing the limit.',
          defaultValue: true,
        }),
        characterCountThreshold: fields.integer({
          label: 'Character count threshold',
          description: 'Number of characters remaining at which the counter appears.',
          defaultValue: 50,
          validation: { min: 1, max: 500 },
        }),
      },
    }),

    // ── Page: Contact Thank You ──────────────────────────────────────────────
    contactThankYouPage: singleton({
      label: 'Page: Contact Thank You',
      path: 'source/pages/contact-thank-you',
      format: { data: 'yaml' },
      schema: {
        heading: fields.text({
          label: 'Heading',
          description: 'Large heading shown on the page. Defaults to "Thank You!".',
        }),
        message: fields.text({
          label: 'Message',
          description: 'Message shown below the heading. Defaults to "Message sent! We will get back to you soon.".',
        }),
        buttonLabel: fields.text({
          label: 'Button label',
          description: 'Label for the back button. Defaults to "Back Home".',
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Home ────────────────────────────────────────────────────────
    homePage: singleton({
      label: 'Page: Home',
      path: 'source/pages/home',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        metaTitle: fields.text({ label: 'Meta title', description: 'Browser tab title for the homepage' }),
        metaDescription: fields.text({
          label: 'Meta description',
          description: 'Search engine description for the homepage',
          multiline: true,
        }),
        searchResultText: fields.text({
          label: 'Search result text',
          description: 'Text shown for the homepage inside search suggestions/results.',
          multiline: true,
        }),
        sections: accordionSectionsField({
          label: 'Homepage sections',
          description: 'Controls which blocks appear and in what order. Click a section to edit its content.',
          heroOptions: heroSelectOptions,
        }),
      },
    }),

    // ── Page: Music ──────────────────────────────────────────────────────────
    musicPage: singleton({
      label: 'Page: Music',
      path: 'source/pages/music',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({
          label: 'Page title',
          description: 'Heading shown on the music page. Defaults to "Music".',
        }),
        subtitle: fields.text({
          label: 'Page subtitle',
          description:
            'Subtitle shown below the title. Use {composerName} as a placeholder — it will be automatically replaced with the composer name from Site Identity settings. Defaults to "A showcase of compositions by {composerName}".',
          multiline: true,
        }),
        filterNote: fields.mdx.inline({
          label: 'Filter note',
          description:
            'Optional short rich text shown alongside the filter controls (e.g. a link to the browse-by-tag page). Supports bold, italic, and links. Leave empty to hide.',
          options: {
            bold: true,
            italic: true,
            link: true,
          },
        }),
        searchPlaceholder: fields.text({
          label: 'Filter placeholder',
          description: 'Placeholder text in the filter input. Defaults to "Filter works...".',
        }),
        sortEnabled: fields.checkbox({
          label: 'Show sort control',
          description: 'Show a dropdown to let visitors change the sort order of works.',
          defaultValue: true,
        }),
        sortOptions: fields.multiselect({
          label: 'Available sort options',
          description:
            'Which sort options appear in the dropdown. The smart default "Sort…" option is always included.',
          options: [
            { label: 'Sort by title', value: 'title' },
            { label: 'Newest first', value: 'newest' },
            { label: 'Oldest first', value: 'oldest' },
          ],
        }),
        defaultSortNoFilter: fields.select({
          label: 'Default sort (no filter)',
          description: 'How works are sorted when no text filter is applied.',
          defaultValue: 'newest',
          options: [
            { label: 'Newest first', value: 'newest' },
            { label: 'Oldest first', value: 'oldest' },
            { label: 'By title', value: 'title' },
          ],
        }),
        defaultSortWithFilter: fields.select({
          label: 'Default sort (with filter)',
          description: 'How works are sorted when a text filter is applied.',
          defaultValue: 'relevance',
          options: [
            { label: 'By relevance', value: 'relevance' },
            { label: 'Newest first', value: 'newest' },
            { label: 'Oldest first', value: 'oldest' },
            { label: 'By title', value: 'title' },
          ],
        }),
        scoreCheckboxEnabled: fields.checkbox({
          label: 'Show "Has score" filter',
          description:
            'Show a checkbox to filter works that have a perusal score. Only appears when not all works have scores.',
          defaultValue: true,
        }),
        scoreCheckboxLabel: fields.text({
          label: '"Has score" checkbox label',
          description: 'Custom label for the score filter checkbox. Defaults to "Has score".',
        }),
        recordingCheckboxEnabled: fields.checkbox({
          label: 'Show "Has recording" filter',
          description:
            'Show a checkbox to filter works that have at least one recording. Only appears when not all works have recordings.',
          defaultValue: true,
        }),
        recordingCheckboxLabel: fields.text({
          label: '"Has recording" checkbox label',
          description: 'Custom label for the recording filter checkbox. Defaults to "Has recording".',
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Music Browse ──────────────────────────────────────────────────
    musicBrowsePage: singleton({
      label: 'Page: Music Browse',
      path: 'source/pages/music-browse',
      format: { data: 'yaml' },
      schema: {
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Music Browse Tag ──────────────────────────────────────────────
    musicBrowseTagPage: singleton({
      label: 'Page: Music Browse Tag',
      path: 'source/pages/music-browse-tag',
      format: { data: 'yaml' },
      schema: {
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description:
            'Hero image to use as page background on browse-by-tag pages. Leave blank to inherit from Page: Music Browse.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Score Viewer ──────────────────────────────────────────────────
    scoreViewer: singleton({
      label: 'Page: Score Viewer',
      path: 'source/site/score-viewer',
      format: { data: 'yaml' },
      schema: {
        flipAnimationEnabled: fields.checkbox({
          label: 'Enable page-flip animation',
          description:
            'When enabled, scores in spreads mode use an animated page-flip effect. Disable this as an emergency kill switch if the page-flip library causes issues — spreads will use a simple CSS fade transition instead.',
          defaultValue: true,
        }),
        defaultViewMode: fields.select({
          label: 'Default viewing mode',
          description: 'The initial viewing mode when a perusal score page loads',
          defaultValue: 'spreads',
          options: [
            { label: 'Spreads (two pages side by side)', value: 'spreads' },
            { label: 'Single page', value: 'single' },
          ],
        }),
        watermarkEnabled: fields.checkbox({
          label: 'Apply watermark',
          description:
            'Overlay a repeating watermark on perusal score pages. Disable to generate clean (unwatermarked) images.',
          defaultValue: true,
        }),
        watermarkText: fields.text({
          label: 'Watermark text',
          description: 'The text repeated across each score page (e.g. "PERUSAL COPY", "REVIEW ONLY")',
          defaultValue: 'PERUSAL COPY',
        }),
        watermarkColor: fields.text({
          label: 'Watermark color',
          description: 'Hex color for the watermark text (e.g. #B40000). Alpha/opacity is controlled separately.',
          defaultValue: '#B40000',
        }),
        watermarkOpacity: fields.integer({
          label: 'Watermark opacity (%)',
          description: 'How visible the watermark is — 1% is barely visible, 100% is fully opaque. Default: 12%',
          defaultValue: 12,
          validation: { min: 1, max: 100 },
        }),
        watermarkAngle: fields.integer({
          label: 'Watermark angle (degrees)',
          description: 'Rotation angle for the watermark text. Negative values tilt left. Default: −35°',
          defaultValue: -35,
          validation: { min: -90, max: 90 },
        }),
        watermarkFont: fields.select({
          label: 'Watermark font',
          description:
            'Font used for watermark text. "Heading font" and "Body font" use the fonts from Theme settings (must be installed on the build machine).',
          defaultValue: 'sans-serif',
          options: [
            { label: 'Sans-serif (system default)', value: 'sans-serif' },
            { label: 'Serif (system default)', value: 'serif' },
            { label: 'Heading font (from Theme)', value: 'heading' },
            { label: 'Body font (from Theme)', value: 'body' },
          ],
        }),
        watermarkFontScale: fields.integer({
          label: 'Watermark font scale (%)',
          description: 'Scales the auto-calculated font size. 100% is the default size, 150% is 50% larger, etc.',
          defaultValue: 100,
          validation: { min: 50, max: 200 },
        }),
        watermarkSpacing: fields.integer({
          label: 'Watermark spacing (%)',
          description:
            'Controls gap between repeated watermark text. 100% is default density, higher values spread text further apart.',
          defaultValue: 100,
          validation: { min: 50, max: 300 },
        }),
      },
    }),

    // ── Page: Sitemap ────────────────────────────────────────────────────────
    sitemapPage: singleton({
      label: 'Page: Sitemap',
      path: 'source/pages/sitemap',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({
          label: 'Page title',
          description: 'Heading shown on the sitemap page. Defaults to "Sitemap".',
        }),
        subtitle: fields.text({
          label: 'Page subtitle',
          description: 'Subtitle shown below the title.',
          multiline: true,
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Work Detail ──────────────────────────────────────────────────
    workDetail: singleton({
      label: 'Page: Work Detail',
      path: 'source/pages/work-detail',
      format: { data: 'yaml' },
      schema: {
        preferredHeroId: fields.relationship({
          label: 'Default background hero image',
          description:
            'Hero image to use as background on work detail pages. Individual works can override this. Leave blank for no default background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Work Detail: Score Access Granted ─────────────────────────────
    workDetailScoreAccessGrantedPage: singleton({
      label: 'Page: Work Detail: Score Access Granted',
      path: 'source/pages/perusal-access-granted',
      format: { data: 'yaml' },
      schema: {
        heading: fields.text({
          label: 'Heading',
          description: 'Large heading shown on the page. Defaults to "Access Granted!".',
        }),
        message: fields.text({
          label: 'Message',
          description:
            'Message shown below the heading. Use {{workTitle}} for the work title. Defaults to "You can now view the perusal score for {{workTitle}}.".',
        }),
        buttonLabel: fields.text({
          label: 'Button label',
          description: 'Label for the button that opens the score. Defaults to "View Perusal Score".',
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Page: Work Detail: Score Access Request ─────────────────────────────
    workDetailScoreAccessRequestPage: singleton({
      label: 'Page: Work Detail: Score Access Request',
      path: 'source/pages/request-score-access',
      format: { data: 'yaml' },
      schema: {
        gateTitle: fields.text({
          label: 'Dialog title',
          description: 'Heading shown in the score access dialog.',
        }),
        gateMessage: fields.text({
          label: 'Dialog message',
          description: 'Explanatory text shown below the title.',
          multiline: true,
        }),
        successMessage: fields.text({
          label: 'Success message',
          description: 'Shown after the user submits the form successfully.',
          multiline: true,
        }),
        hideBackground: fields.checkbox({
          label: 'Hide background image',
          description:
            'Hide the hero background image on this page. Useful to avoid a visual glitch when the access dialog opens.',
          defaultValue: false,
        }),
      },
    }),

    // ── Page: Work Detail: Score Access Thank You ───────────────────────────
    workDetailScoreAccessThankYouPage: singleton({
      label: 'Page: Work Detail: Score Access Thank You',
      path: 'source/pages/perusal-thank-you',
      format: { data: 'yaml' },
      schema: {
        heading: fields.text({
          label: 'Heading',
          description: 'Large heading shown on the page. Defaults to "Thank You!".',
        }),
        message: fields.text({
          label: 'Message',
          description:
            'Message shown below the heading. Use {{workTitle}} for the work title. Defaults to "Check your inbox! A link to view the perusal score for {{workTitle}} has been sent to your email.".',
        }),
        buttonLabel: fields.text({
          label: 'Button label',
          description:
            'Label for the back button. Use {{workTitle}} for the work title. Defaults to "Back to {{workTitle}}".',
        }),
        preferredHeroId: fields.relationship({
          label: 'Background hero image',
          description: 'Hero image to use as page background. Leave blank for no background.',
          collection: 'heroes',
        }),
      },
    }),

    // ── Block: Brand / Logo ─────────────────────────────────────────────────
    brandLogo: singleton({
      label: 'Block: Brand / Logo',
      path: 'source/branding/brand-logo',
      format: { data: 'yaml' },
      schema: {
        mode: fields.select({
          label: 'Logo mode',
          description: 'How the site logo is displayed in the header (text by default, or plugin mode)',
          defaultValue: 'text',
          options: [
            { label: 'Text (shows composer name)', value: 'text' },
            { label: 'Custom image', value: 'custom' },
            { label: 'Plugin (advanced)', value: 'plugin' },
          ],
        }),
        pluginId: fields.select({
          label: 'Plugin id',
          description: 'Only used when Logo mode is "plugin".',
          defaultValue: 'custom-animation',
          options: [{ label: 'custom-animation', value: 'custom-animation' }],
        }),
        firstName: fields.text({
          label: 'First name',
          description: 'Used for the logo display. Defaults to first part of composer name.',
        }),
        lastName: fields.text({
          label: 'Last name',
          description: 'Used for the logo display. Defaults to last part of composer name.',
        }),
      },
    }),

    // ── Block: Breadcrumbs ────────────────────────────────────────────────
    breadcrumbs: singleton({
      label: 'Block: Breadcrumbs',
      path: 'source/site/breadcrumbs',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        homeCrumbLabel: fields.text({
          label: 'Home crumb label',
          description: 'Label for the first breadcrumb item that links to the homepage. Defaults to "Home".',
        }),
      },
    }),

    // ── Block: Copyright ──────────────────────────────────────────────────
    copyright: singleton({
      label: 'Block: Copyright',
      path: 'source/site/copyright',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        copyrightHolder: fields.text({
          label: 'Copyright holder',
          description: 'Name shown in the copyright notice. Defaults to composer name from Site Identity if blank.',
        }),
      },
    }),

    // ── Block: Footer Menu ────────────────────────────────────────────────
    footerMenu: singleton({
      label: 'Block: Footer Menu',
      path: 'source/site/footer-menu',
      format: { data: 'yaml' },
      entryLayout: 'form',
      schema: {
        links: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { isRequired: true } }),
            href: fields.text({ label: 'URL', validation: { isRequired: true } }),
          }),
          {
            label: 'Footer links',
            itemLabel: (props) => props.fields.label.value || 'Footer link',
          },
        ),
      },
    }),

    // ── Block: Main Menu ───────────────────────────────────────────────────
    navigation: singleton({
      label: 'Block: Main Menu',
      path: 'source/site/navigation',
      format: { data: 'yaml' },
      schema: {
        menuItems: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { isRequired: true } }),
            href: fields.text({ label: 'URL path', description: 'e.g. /music/', validation: { isRequired: true } }),
            enabled: fields.checkbox({ label: 'Visible', defaultValue: true }),
            order: fields.integer({ label: 'Sort order', description: 'Lower numbers appear first' }),
            anchorTarget: fields.text({
              label: 'Anchor target',
              description: 'Optional anchor ID for inner pages to scroll to a homepage section (e.g. #works)',
            }),
          }),
          {
            label: 'Menu items',
            itemLabel: (props) => {
              const label = props.fields.label.value || 'Menu item'
              const enabled = props.fields.enabled.value
              return enabled ? label : `${label} (hidden)`
            },
          },
        ),
      },
    }),

    // ── Block: Share Links ──────────────────────────────────────────────────
    sharing: singleton({
      label: 'Block: Share Links',
      path: 'source/site/sharing',
      format: { data: 'yaml' },
      schema: {
        hidden: fields.checkbox({
          label: 'Hide share section',
          description: 'When checked, the entire share links section is hidden on work detail pages.',
          defaultValue: false,
        }),
        sectionTitle: fields.text({
          label: 'Section title',
          description: 'Heading shown above the share buttons. Defaults to "Share this work".',
        }),
        sectionDescription: fields.text({
          label: 'Section description',
          description: 'Text shown below the section title. Defaults to "Like this work? Share it with your network!".',
        }),
        enabledShares: fields.multiselect({
          label: 'Enabled share buttons',
          description: 'Which share buttons appear on work detail pages',
          options: [
            { label: 'Facebook', value: 'facebook' },
            { label: 'Twitter / X', value: 'twitter' },
            { label: 'Threads', value: 'threads' },
            { label: 'Bluesky', value: 'bluesky' },
            { label: 'Email', value: 'email' },
            { label: 'Copy link', value: 'copy-link' },
            { label: 'LinkedIn', value: 'linkedin' },
          ],
        }),
        facebookAppId: fields.text({
          label: 'Facebook App ID',
          description:
            'Optional Facebook App ID for the og:fb:app_id meta tag and Facebook share dialog. Leave blank if not needed.',
        }),
      },
    }),

    // ── Block: Social Media ────────────────────────────────────────────────
    social: singleton({
      label: 'Block: Social Media',
      path: 'source/site/social',
      format: { data: 'yaml' },
      schema: {
        links: fields.array(
          fields.object({
            platform: fields.select({
              label: 'Platform',
              defaultValue: 'instagram',
              options: [
                { label: 'Instagram', value: 'instagram' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'Facebook', value: 'facebook' },
                { label: 'SoundCloud', value: 'soundcloud' },
                { label: 'Twitter / X', value: 'twitter' },
                { label: 'LinkedIn', value: 'linkedin' },
                { label: 'TikTok', value: 'tiktok' },
                { label: 'Bandcamp', value: 'bandcamp' },
              ],
            }),
            url: fields.url({ label: 'Profile URL', validation: { isRequired: true } }),
            enabled: fields.checkbox({ label: 'Visible', defaultValue: true }),
          }),
          {
            label: 'Social links',
            itemLabel: (props) => {
              const platform = props.fields.platform.value || 'Platform'
              const enabled = props.fields.enabled.value
              return enabled ? platform : `${platform} (hidden)`
            },
          },
        ),
      },
    }),
  },

  collections: {
    works: collection({
      label: 'Works',
      slugField: 'title',
      path: 'source/works/*/work',
      format: { data: 'yaml' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        subtitle: fields.text({ label: 'Subtitle', validation: { isRequired: false } }),
        composer: fields.text({
          label: 'Composer',
          description: 'Leave blank to use the default composer from source.config.mjs',
        }),
        description: fields.text({
          label: 'Description',
          description: 'Short description shown on work cards and in search results',
          multiline: true,
        }),

        // ── Thumbnail ───────────────────────────────────────────────────────
        // File is auto-detected: thumbnail.{webp,jpg,jpeg,png,tiff} in the work folder.
        thumbnail: fields.object(
          {
            preview: workImagePreviewField({
              label: 'Generated thumbnail preview',
              kind: 'thumbnail',
            }),
            alt: fields.text({
              label: 'Alt text',
              description: 'Describe the image for screen readers',
            }),
            crop: fields.select({
              label: 'Crop position',
              description: 'Where to crop when resizing to 740×470px',
              defaultValue: '',
              options: [
                { label: 'No crop (proportional)', value: '' },
                { label: 'Top left', value: 'tl' },
                { label: 'Top center', value: 'tc' },
                { label: 'Top right', value: 'tr' },
                { label: 'Center left', value: 'cl' },
                { label: 'Center (default)', value: 'cc' },
                { label: 'Center right', value: 'cr' },
                { label: 'Bottom left', value: 'bl' },
                { label: 'Bottom center', value: 'bc' },
                { label: 'Bottom right', value: 'br' },
              ],
            }),
          },
          { label: 'Thumbnail' },
        ),

        // ── Dates & details ─────────────────────────────────────────────────
        completionDate: fields.text({
          label: 'Completion date',
          description: 'ISO date string (e.g. 2025-01-15)',
        }),
        duration: fields.text({
          label: 'Duration',
          description: 'e.g. ca. 6\' 30"',
        }),
        difficulty: fields.select({
          label: 'Difficulty',
          defaultValue: '',
          options: [
            { label: 'Not set', value: '' },
            { label: 'Beginner', value: 'Beginner' },
            { label: 'Intermediate', value: 'Intermediate' },
            { label: 'Advanced', value: 'Advanced' },
          ],
        }),
        programNote: fields.text({ label: 'Program note', multiline: true }),

        // ── Movements ──────────────────────────────────────────────────────
        movements: fields.array(
          fields.object({
            name: fields.text({ label: 'Name', description: 'e.g. I. Allegro', validation: { isRequired: true } }),
            description: fields.text({ label: 'Description', multiline: true }),
          }),
          {
            label: 'Movements',
            description: 'Movements of this composition. Independent of recordings — describes the work itself.',
            itemLabel: (props) => props.fields.name.value || 'Movement',
          },
        ),

        // Perusal score is auto-detected: score.pdf in the work folder.
        perusalScoreGated: fields.select({
          label: 'Score gating override',
          description: 'Override the site-wide gating setting for this specific work',
          defaultValue: '',
          options: [
            { label: 'Use site default', value: '' },
            { label: 'Always gated', value: 'gated' },
            { label: 'Always ungated', value: 'ungated' },
          ],
        }),
        pdfWatermarkedOverride: fields.select({
          label: 'Watermarked PDF override',
          description: 'Override the global watermarked PDF setting for this work',
          defaultValue: '',
          options: [
            { label: 'Use site default', value: '' },
            { label: 'Enabled', value: 'enabled' },
            { label: 'Disabled', value: 'disabled' },
          ],
        }),
        pdfOriginalOverride: fields.select({
          label: 'Original PDF override',
          description: 'Override the global original PDF setting for this work',
          defaultValue: '',
          options: [
            { label: 'Use site default', value: '' },
            { label: 'Enabled', value: 'enabled' },
            { label: 'Disabled', value: 'disabled' },
          ],
        }),
        pdfWatermarkedGatedOverride: fields.select({
          label: 'Watermarked PDF gating override',
          description: 'Override the global gating setting for watermarked PDF downloads of this work',
          defaultValue: '',
          options: [
            { label: 'Use site default', value: '' },
            { label: 'Always gated', value: 'gated' },
            { label: 'Always ungated', value: 'ungated' },
          ],
        }),
        pdfOriginalGatedOverride: fields.select({
          label: 'Original PDF gating override',
          description: 'Override the global gating setting for original PDF downloads of this work',
          defaultValue: '',
          options: [
            { label: 'Use site default', value: '' },
            { label: 'Always gated', value: 'gated' },
            { label: 'Always ungated', value: 'ungated' },
          ],
        }),

        // ── Page background ─────────────────────────────────────────────────
        preferredHeroId: fields.relationship({
          label: 'Background hero image override',
          description:
            'Override the default work detail page background for this specific work. Leave blank to use the default from Page: Work Detail settings.',
          collection: 'heroes',
        }),

        // ── Categorization ──────────────────────────────────────────────────
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value || 'Tag',
        }),
        instrumentation: fields.array(fields.text({ label: 'Instrument' }), {
          label: 'Instrumentation',
          itemLabel: (props) => props.value || 'Instrument',
        }),
        searchKeywords: fields.array(fields.text({ label: 'Keyword' }), {
          label: 'Search keywords',
          description: 'Additional terms that should find this work (e.g. performer surnames)',
          itemLabel: (props) => props.value || 'Keyword',
        }),

        // ── Selected ───────────────────────────────────────────────────────
        selected: fields.checkbox({
          label: 'Selected work',
          description: 'Show this work in the selected works section on the homepage',
          defaultValue: false,
        }),
        selectedOrder: fields.integer({
          label: 'Selected order',
          description: 'Integer controlling position among selected works (lower = first)',
        }),

        // ── Recordings ──────────────────────────────────────────────────────
        recordings: fields.array(
          fields.object({
            folder: textFieldWithPlaceholder({
              label: 'Folder name',
              description:
                'Subfolder under recordings/ that holds the asset files (e.g. anna-heller-2021). Use a numeric prefix to control order (e.g. 01-anna-heller-2021).',
              placeholder: 'e.g. 01-anna-heller-2021',
              fieldName: 'recording-folder',
            }),
            performers: fields.array(fields.text({ label: 'Name' }), {
              label: 'Performers',
              itemLabel: (props) => props.value || 'Performer',
            }),
            ensemble: fields.text({
              label: 'Ensemble',
              description: 'Ensemble name, if different from the individual performers list',
            }),
            date: fields.text({
              label: 'Date',
              description: 'ISO date string (e.g. 2021-08-27)',
            }),
            duration: fields.text({ label: 'Duration', description: 'e.g. 6\' 19"' }),
            youtubeUrl: fields.url({ label: 'YouTube URL' }),
            photo: fields.object(
              {
                preview: workImagePreviewField({
                  label: 'Generated photo preview',
                  kind: 'recordingPhoto',
                }),
                alt: fields.text({ label: 'Photo alt text', description: 'Describe the photo for screen readers' }),
              },
              { label: 'Photo' },
            ),
            featuredRecording: fields.checkbox({
              label: 'Featured recording',
              description: 'Use this as the primary recording shown on the work page',
              defaultValue: false,
            }),
            movements: fields.array(
              fields.object({
                label: fields.text({ label: 'Label', description: 'e.g. I. Allegro' }),
                youtubeUrl: fields.url({ label: 'YouTube URL' }),
                duration: fields.text({ label: 'Duration' }),
                photoAlt: fields.text({ label: 'Photo alt text' }),
                featuredRecording: fields.checkbox({
                  label: 'Featured movement',
                  defaultValue: false,
                }),
              }),
              {
                label: 'Movements',
                description:
                  'One entry per movement-NN/ subfolder. Audio and photo are auto-detected inside each folder.',
                itemLabel: (props) => props.fields.label.value || 'Movement',
              },
            ),
          }),
          {
            label: 'Recordings',
            itemLabel: (props) =>
              [
                props.fields.ensemble.value || props.fields.performers.elements.map((p) => p.value).join(', '),
                props.fields.date.value,
              ]
                .filter(Boolean)
                .join(' · ') || 'Recording',
          },
        ),

        // ── Sheet music ─────────────────────────────────────────────────────
        sheetMusic: fields.array(fields.url({ label: 'URL', validation: { isRequired: true } }), {
          label: 'Sheet music links',
          itemLabel: (props) => props.value || 'Link',
        }),

        // ── Performances ────────────────────────────────────────────────────
        performances: fields.array(
          fields.object({
            date: fields.text({ label: 'Date', description: 'e.g. 2025-01-15' }),
            venue: fields.text({ label: 'Venue' }),
            performers: fields.array(fields.text({ label: 'Name' }), {
              label: 'Performers',
              itemLabel: (props) => props.value || 'Performer',
            }),
            notes: fields.text({ label: 'Notes', multiline: true }),
          }),
          {
            label: 'Performances',
            itemLabel: (props) => props.fields.venue.value || props.fields.date.value || 'Performance',
          },
        ),
      },
    }),

    // ── Hero Images ─────────────────────────────────────────────────────────
    heroes: collection({
      label: 'Hero Images',
      slugField: 'label',
      path: 'source/heroes/*/hero',
      format: { data: 'yaml' },
      schema: {
        label: fields.slug({
          name: {
            label: 'Label',
            description: 'Display name for this hero image (e.g. "Profile", "Concert Hall")',
          },
        }),
        // Image file is auto-detected by convention: image.{jpg,jpeg,webp,png} in the hero folder.
        imagePreview: heroImagePreviewField({
          label: 'Hero image',
          description:
            "Place a file named image.jpg (or .webp, .png) in this hero's folder. Large landscape images (1200px+ wide) work best.",
        }),
        alt: fields.text({
          label: 'Alt text',
          description:
            'Describe the image for screen readers. Required for accessibility, even if the image is used decoratively (the alt text is available if the image is ever displayed as a non-decorative element).',
        }),
        credit: fields.text({
          label: 'Credit / source',
          description: 'Attribution for the image (e.g. photographer, stock photo ID)',
        }),
        position: fields.text({
          label: 'Background position (CSS)',
          description:
            'CSS background-position value controlling which part of the image is visible (e.g. "50% 50%", "34% 52%"). Defaults to center.',
          defaultValue: '50% 50%',
        }),
        filter: fields.text({
          label: 'CSS filter override',
          description:
            'Optional CSS filter for this specific image (e.g. "grayscale(0.1) saturate(0.5)"). Leave blank to use the default filter from the Home Hero block.',
        }),
        sortOrder: fields.integer({
          label: 'Sort order',
          description: 'Controls display order in hero dropdowns. Lower numbers appear first.',
          defaultValue: 0,
        }),
      },
    }),
  },
})
