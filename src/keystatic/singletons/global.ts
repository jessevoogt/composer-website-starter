import { fields, singleton } from '@keystatic/core'
import { tokenizedTextField } from '../tokenized-text-field'
import { tokenizedInputField } from '../tokenized-input-field'
import { textFieldWithPlaceholder } from '../text-field-with-placeholder'
import { filenamePreviewField } from '../filename-preview-field'

// ── Types ────────────────────────────────────────────────────────────────────

interface PdfScoresManifest {
  [slug: string]: {
    title: string
    subtitle: string
    instrumentation: string[]
    composerName: string
    hasWatermarkedPdf: boolean
    hasOriginalPdf: boolean
  }
}

export interface GlobalSingletonsDeps {
  themeSelectionOptions: Array<{ label: string; value: string }>
  defaultThemeSelectionValue: string
  pdfScoresManifest: PdfScoresManifest
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getGlobalSingletons(deps: GlobalSingletonsDeps) {
  return {
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
          works: deps.pdfScoresManifest,
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
          defaultValue: deps.defaultThemeSelectionValue,
          options: deps.themeSelectionOptions,
        }),
      },
    }),
  }
}
