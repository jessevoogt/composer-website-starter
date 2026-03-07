import { fields, singleton } from '@keystatic/core'
import { tokenizedTextField } from '../tokenized-text-field'
import { accordionSectionsField } from '../accordion-sections-field'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageSingletonsDeps {
  heroSelectOptions: Array<{ label: string; value: string }>
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getPageSingletons(deps: PageSingletonsDeps) {
  return {
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
          heroOptions: deps.heroSelectOptions,
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
        showAudioPlayer: fields.checkbox({
          label: 'Show audio player',
          description:
            'Display the audio player on perusal score pages when a recording is available for the work. Disabling this hides the transport controls and playback UI.',
          defaultValue: true,
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
  }
}
