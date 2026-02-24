import {
  collection,
  config,
  fields,
  singleton,
  type FormFieldInputProps,
  type FormFieldStoredValue,
  type Glob,
  type SlugFormField,
} from '@keystatic/core'
import { TextField } from '@keystar/ui/text-field'
import { createElement, useState } from 'react'
import {
  DEFAULT_THEME_FONT_BODY,
  DEFAULT_THEME_FONT_HEADING,
  THEME_FONT_SELECT_OPTIONS,
} from './src/utils/theme-fonts'

// Keystatic manages:
// - Work definitions in source/works/
// - Site configuration singletons in source/site/ and source/pages/
//
// Run: npm run dev  →  open http://localhost:4321/keystatic

const HOME_HERO_IMAGE_OPTIONS = [
  { label: 'Use hero config default', value: '' },
  { label: 'Hall', value: 'hall' },
  { label: 'Piano', value: 'score' },
  { label: 'Manuscript', value: 'inside-piano' },
  { label: 'Keyboard Score', value: 'keyboard-sheet-music' },
]

const OPTIONAL_HERO_IMAGE_OPTIONS = [
  { label: 'No background hero', value: '' },
  { label: 'Hall', value: 'hall' },
  { label: 'Piano', value: 'score' },
  { label: 'Manuscript', value: 'inside-piano' },
  { label: 'Keyboard Score', value: 'keyboard-sheet-music' },
]

const HIDE_CONTROL_OVERRIDE_OPTIONS = [
  { label: 'Inherit site setting', value: 'inherit' },
  { label: 'Force hide', value: 'hide' },
  { label: 'Force show', value: 'show' },
]

function sortSingletonsByLabel<T extends Record<string, unknown>>(singletons: T): T {
  return Object.fromEntries(
    Object.entries(singletons).sort(([, left], [, right]) =>
      String((left as { label?: unknown }).label ?? '').localeCompare(
        String((right as { label?: unknown }).label ?? ''),
      ),
    ),
  ) as T
}

type LockedWorkTitleValue = {
  name: string
  slug: string
  isExisting: boolean
}

const WORK_SLUG_DESCRIPTION =
  'To change the URL slug, rename the folder under source/works/ and move the files into that folder.'

function slugifyWorkTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseStoredWorkTitleName(value: FormFieldStoredValue) {
  if (value === undefined) return ''
  if (typeof value !== 'string') {
    throw new Error('Title must be a string')
  }
  return value
}

function parseLockedWorkTitleDraft(value: FormFieldStoredValue): LockedWorkTitleValue {
  if (value === undefined) {
    return { name: '', slug: '', isExisting: false }
  }

  if (typeof value === 'string') {
    return {
      name: value,
      slug: slugifyWorkTitle(value),
      isExisting: false,
    }
  }

  if (typeof value === 'object' && value !== null && 'name' in value && 'slug' in value) {
    const objectValue = value as { name: unknown; slug: unknown; isExisting?: unknown }
    if (typeof objectValue.name === 'string' && typeof objectValue.slug === 'string') {
      return {
        name: objectValue.name,
        slug: objectValue.slug,
        isExisting: objectValue.isExisting === true,
      }
    }
  }

  throw new Error('Title must be a string')
}

function validateWorkSlugUniqueness(
  slug: string,
  slugField: { slugs: Set<string>; glob: Glob } | undefined,
  title: string,
) {
  if (!slug) {
    throw new Error('Could not generate a valid slug from the title')
  }

  if (!slugField) return

  const hasInvalidPathCharacter = slugField.glob === '**' ? /[\\]/.test(slug) : /[\\/]/.test(slug)
  if (hasInvalidPathCharacter) {
    throw new Error('Slug cannot contain slashes')
  }

  if (slugField.slugs.has(slug)) {
    throw new Error(`"${title}" would duplicate an existing work slug`)
  }
}

function lockedWorkTitleField(): SlugFormField<LockedWorkTitleValue, LockedWorkTitleValue, string, string> {
  return {
    kind: 'form',
    formKind: 'slug',
    label: 'Title',
    Input(props: FormFieldInputProps<LockedWorkTitleValue>) {
      const [blurred, setBlurred] = useState(false)
      const showError = props.forceValidation || blurred
      const normalizedTitle = props.value.name.trim()
      const errorMessage = showError && normalizedTitle.length === 0 ? 'Title is required' : undefined

      return createElement(TextField, {
        label: 'Title',
        description: WORK_SLUG_DESCRIPTION,
        autoFocus: props.autoFocus,
        value: props.value.name,
        isRequired: true,
        errorMessage,
        onBlur: () => setBlurred(true),
        onChange: (nextName: string) => {
          const nextSlug = props.value.isExisting ? props.value.slug : slugifyWorkTitle(nextName)
          props.onChange({
            name: nextName,
            slug: nextSlug,
            isExisting: props.value.isExisting,
          })
        },
      })
    },
    defaultValue() {
      return {
        name: '',
        slug: '',
        isExisting: false,
      }
    },
    parse(value, args) {
      if (args?.slug !== undefined) {
        return {
          name: parseStoredWorkTitleName(value),
          slug: args.slug,
          isExisting: true,
        }
      }

      return parseLockedWorkTitleDraft(value)
    },
    serialize(value) {
      return {
        value: value.name.trim() || undefined,
      }
    },
    serializeWithSlug(value) {
      const normalizedName = value.name.trim()
      const slug = (value.slug || slugifyWorkTitle(normalizedName)).trim()
      validateWorkSlugUniqueness(slug, undefined, normalizedName || 'Untitled')

      return {
        slug,
        value: normalizedName || undefined,
      }
    },
    validate(value, args) {
      const normalizedName = value.name.trim()
      if (!normalizedName) {
        throw new Error('Title is required')
      }

      const slug = (value.slug || slugifyWorkTitle(normalizedName)).trim()
      validateWorkSlugUniqueness(slug, args?.slugField, normalizedName)

      return {
        name: normalizedName,
        slug,
        isExisting: value.isExisting,
      }
    },
    reader: {
      parse(value) {
        return parseStoredWorkTitleName(value)
      },
      parseWithSlug(value) {
        return parseStoredWorkTitleName(value)
      },
    },
  }
}

export default config({
  storage: {
    kind: 'local',
  },

  singletons: sortSingletonsByLabel({
    // ── Site Identity ──────────────────────────────────────────────────────────
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
        copyrightHolder: fields.text({
          label: 'Copyright holder',
          description: 'Footer copyright name. Defaults to composer name if left blank.',
        }),
        googleAnalyticsId: fields.text({
          label: 'Google Analytics ID',
          description: 'Measurement ID (e.g. G-XXXXXXXXXX). Leave blank to disable analytics.',
        }),
        perusalScoreOnlyMode: fields.checkbox({
          label: 'Perusal score only mode',
          description:
            'When enabled, the site only outputs perusal score pages with a simple index. Useful if you already have a main website.',
          defaultValue: false,
        }),
      },
    }),

    // ── Site: Audio Player Controls ────────────────────────────────────────────
    siteAudioPlayerControls: singleton({
      label: 'Global: Audio Player Controls',
      path: 'source/site/audio-player',
      format: { data: 'yaml' },
      schema: {
        hideFeaturedPlayerControls: fields.checkbox({
          label: 'Hide featured-player controls',
          description:
            'Hide the shared featured player controls (inline shell and fixed bar). Audio can still be triggered from individual recording play buttons.',
          defaultValue: false,
        }),
        enableTrackTextScroll: fields.checkbox({
          label: 'Enable track text scrolling',
          description:
            'Scroll long track text in the fixed player bar. Disable to show truncated text with ellipses.',
          defaultValue: true,
        }),
        forceHideControls: fields.object(
          {
            previousTrack: fields.checkbox({ label: 'Hide previous-track controls', defaultValue: false }),
            playPause: fields.checkbox({ label: 'Hide play/pause controls', defaultValue: false }),
            nextTrack: fields.checkbox({ label: 'Hide next-track controls', defaultValue: false }),
            seek: fields.checkbox({ label: 'Hide seek controls', defaultValue: false }),
            mute: fields.checkbox({ label: 'Hide mute controls', defaultValue: false }),
            volume: fields.checkbox({ label: 'Hide volume controls', defaultValue: false }),
            currentTime: fields.checkbox({ label: 'Hide current-time label', defaultValue: false }),
            duration: fields.checkbox({ label: 'Hide duration label', defaultValue: false }),
            trackDetails: fields.checkbox({ label: 'Hide track-details control', defaultValue: false }),
            trackText: fields.checkbox({ label: 'Hide track text', defaultValue: false }),
          },
          { label: 'Force-hide controls' },
        ),
      },
    }),

    // ── Perusal Scores: Audio Player Overrides ─────────────────────────────────
    perusalScoreAudioPlayerControls: singleton({
      label: 'Page: Perusal Scores - Audio Player Overrides',
      path: 'source/pages/perusal-scores/audio-player',
      format: { data: 'yaml' },
      schema: {
        hideFeaturedPlayerControls: fields.select({
          label: 'Hide perusal audio controls',
          description:
            'Override whether perusal-score pages hide their audio control group. Inherit uses the site-level setting.',
          defaultValue: 'inherit',
          options: HIDE_CONTROL_OVERRIDE_OPTIONS,
        }),
        hideFullscreenControl: fields.checkbox({
          label: 'Hide fullscreen control',
          description: 'Page-level setting for the perusal fullscreen button.',
          defaultValue: false,
        }),
        forceHideControls: fields.object(
          {
            previousTrack: fields.select({
              label: 'Previous-track controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            playPause: fields.select({
              label: 'Play/pause controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            nextTrack: fields.select({
              label: 'Next-track controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            seek: fields.select({
              label: 'Seek controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            mute: fields.select({
              label: 'Mute controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            volume: fields.select({
              label: 'Volume controls',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
            trackDetails: fields.select({
              label: 'Track-details control',
              defaultValue: 'inherit',
              options: HIDE_CONTROL_OVERRIDE_OPTIONS,
            }),
          },
          { label: 'Per-control overrides' },
        ),
      },
    }),

    // ── Navigation ─────────────────────────────────────────────────────────────
    navigation: singleton({
      label: 'Global: Navigation',
      path: 'source/site/navigation',
      format: { data: 'yaml' },
      schema: {
        mainNavFontSizePx: fields.integer({
          label: 'Main navigation font size (px)',
          description: 'Desktop header menu font size in pixels.',
          defaultValue: 15,
        }),
        menuItems: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { isRequired: true } }),
            href: fields.text({ label: 'URL path', description: 'e.g. /works/', validation: { isRequired: true } }),
            enabled: fields.checkbox({ label: 'Visible', defaultValue: true }),
            order: fields.integer({ label: 'Sort order', description: 'Lower numbers appear first' }),
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
        footerLinks: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { isRequired: true } }),
            href: fields.text({ label: 'URL path', validation: { isRequired: true } }),
          }),
          {
            label: 'Footer links',
            itemLabel: (props) => props.fields.label.value || 'Footer link',
          },
        ),
      },
    }),

    // ── Social Media Links ─────────────────────────────────────────────────────
    social: singleton({
      label: 'Global: Social Media',
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

    // ── Share Links ────────────────────────────────────────────────────────────
    sharing: singleton({
      label: 'Global: Share Links',
      path: 'source/site/sharing',
      format: { data: 'yaml' },
      schema: {
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
      },
    }),

    // ── Theme ──────────────────────────────────────────────────────────────────
    theme: singleton({
      label: 'Global: Theme',
      path: 'source/site/theme',
      format: { data: 'yaml' },
      schema: {
        colorBackground: fields.text({
          label: 'Background color',
          description: 'Hex color (e.g. #1a1a2e). Leave blank for default.',
        }),
        colorBackgroundSoft: fields.text({ label: 'Background soft color' }),
        colorText: fields.text({ label: 'Text color' }),
        colorTextMuted: fields.text({ label: 'Muted text color' }),
        colorAccent: fields.text({ label: 'Accent color' }),
        colorAccentStrong: fields.text({ label: 'Strong accent color' }),
        colorButton: fields.text({ label: 'Button background color' }),
        colorButtonText: fields.text({ label: 'Button text color' }),
        interiorHeroOverlayOpacity: fields.text({
          label: 'Interior hero overlay opacity',
          description: '0 to 1. Lower values reveal more background image. Leave blank for default.',
        }),
        fontBody: fields.select({
          label: 'Body font',
          defaultValue: DEFAULT_THEME_FONT_BODY,
          options: THEME_FONT_SELECT_OPTIONS,
        }),
        fontHeading: fields.select({
          label: 'Heading font',
          defaultValue: DEFAULT_THEME_FONT_HEADING,
          options: THEME_FONT_SELECT_OPTIONS,
        }),
      },
    }),

    // ── Deploy ─────────────────────────────────────────────────────────────────
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
        sftpSkipAudio: fields.checkbox({
          label: 'Skip audio files',
          description: 'Skip uploading audio files during deploy',
          defaultValue: false,
        }),
      },
    }),

    // ── Brand Logo ─────────────────────────────────────────────────────────────
    brandLogo: singleton({
      label: 'Global: Brand / Logo',
      path: 'source/branding/brand-logo',
      format: { data: 'yaml' },
      schema: {
        logoImageAlt: fields.text({
          label: 'Logo image alt text',
          description:
            'Accessibility text for source/branding/logo.* when present. Defaults to "[Composer Name] logo" when blank.',
        }),
        logoWidth: fields.integer({
          label: 'Logo width (px)',
          description: 'Optional rendered width in pixels for source/branding/logo.*.',
          validation: { min: 1, max: 1200 },
        }),
        logoHeight: fields.integer({
          label: 'Logo height (px)',
          description: 'Optional rendered height in pixels for source/branding/logo.*.',
          validation: { min: 1, max: 600 },
        }),
        firstName: fields.text({
          label: 'First name',
          description: 'Used for text logo mode. Defaults to first part of composer name.',
        }),
        lastName: fields.text({
          label: 'Last name',
          description: 'Used for text logo mode. Defaults to last part of composer name.',
        }),
      },
    }),

    // ── Home: Hero ─────────────────────────────────────────────────────────────
    homeHero: singleton({
      label: 'Page: Home - Hero',
      path: 'source/pages/home/hero',
      format: { data: 'yaml' },
      schema: {
        hideHeroSection: fields.checkbox({
          label: 'Hide hero section',
          description: 'Skip rendering the hero section on the homepage.',
          defaultValue: false,
        }),
        hideHeroTitle: fields.checkbox({
          label: 'Hide hero title',
          description: 'Do not render the hero title text.',
          defaultValue: false,
        }),
        hideHeroSubtitle: fields.checkbox({
          label: 'Hide hero subtitle',
          description: 'Do not render the hero subtitle text.',
          defaultValue: false,
        }),
        heroTitle: fields.text({
          label: 'Hero title',
          description: 'Large heading on the homepage hero. Defaults to composer name.',
        }),
        heroSubtitle: fields.text({
          label: 'Hero subtitle',
          description: 'Shown next to the title (e.g. "Composer")',
        }),
        heroTagline: fields.text({
          label: 'Hero tagline',
          description: 'Descriptive text below the title',
          multiline: true,
        }),
        listenNowText: fields.text({
          label: 'Listen button text',
          description: 'Label for the primary hero button.',
          defaultValue: 'Listen Now',
        }),
        hideSearchMusicButton: fields.checkbox({
          label: 'Hide Search music button',
          description: 'Do not render the secondary hero search button.',
          defaultValue: false,
        }),
        searchMusicText: fields.text({
          label: 'Search music button label',
          description: 'Label for the hero search button.',
          defaultValue: 'Search Music',
        }),
        preferredHeroId: fields.select({
          label: 'Preferred hero image',
          description: 'Default homepage hero image to show first.',
          defaultValue: '',
          options: HOME_HERO_IMAGE_OPTIONS,
        }),
        heroImageColumnSide: fields.select({
          label: 'Hero image side',
          description: 'Choose whether the hero image column is on the left or right.',
          defaultValue: 'left',
          options: [
            { label: 'Image on left', value: 'left' },
            { label: 'Image on right', value: 'right' },
          ],
        }),
        heroImageColumnWidthPercent: fields.integer({
          label: 'Hero image width (%)',
          description: 'Desktop width for the hero image column (recommended 25-75).',
          defaultValue: 41,
        }),
      },
    }),

    // ── Home: Featured Recording ───────────────────────────────────────────────
    homeFeaturedRecording: singleton({
      label: 'Page: Home - Featured Recording',
      path: 'source/pages/home/featured-recording',
      format: { data: 'yaml' },
      schema: {
        hideFeaturedRecordingSection: fields.checkbox({
          label: 'Hide featured recording section',
          description: 'Skip rendering the featured recording section on the homepage.',
          defaultValue: false,
        }),
        featuredSectionTitle: fields.text({
          label: 'Section title',
          description: 'Label shown above the featured recording metadata.',
          defaultValue: 'Featured Recording',
        }),
        featuredMoreDetailsText: fields.text({
          label: 'Details button text',
          description: 'Button text used for the featured recording details link.',
          defaultValue: 'More Details',
        }),
        featuredPlayerImageColumnSide: fields.select({
          label: 'Featured image side',
          description: 'Choose whether the featured recording image column is on the left or right.',
          defaultValue: 'right',
          options: [
            { label: 'Image on right', value: 'right' },
            { label: 'Image on left', value: 'left' },
          ],
        }),
        featuredPlayerImageColumnWidthPercent: fields.integer({
          label: 'Featured image width (%)',
          description: 'Desktop width for the featured recording image column (recommended 30-75).',
          defaultValue: 58,
        }),
      },
    }),

    // ── Home: Select Works ─────────────────────────────────────────────────────
    homeSelectWorks: singleton({
      label: 'Page: Home - Select Works',
      path: 'source/pages/home/select-works',
      format: { data: 'yaml' },
      schema: {
        hideSelectWorksSection: fields.checkbox({
          label: 'Hide select works section',
          description: 'Skip rendering the Select Works section on the homepage.',
          defaultValue: false,
        }),
        selectWorksLabel: fields.text({
          label: 'Select works label',
          description: 'Heading for the selected works section. Leave blank to visually hide the heading.',
          defaultValue: 'Select Works',
        }),
        selectWorksRandomize: fields.checkbox({
          label: 'Randomize selected works',
          description: 'Shuffle cards on page load.',
          defaultValue: true,
        }),
        selectWorksShowAll: fields.checkbox({
          label: 'Show all works',
          description: 'Ignore selected flags and pull from the full works collection.',
          defaultValue: false,
        }),
        selectWorksMaxItems: fields.integer({
          label: 'Select works max items',
          description: 'Maximum number of cards in the section. Leave blank for no maximum.',
        }),
        selectWorksExcludeFeaturedWork: fields.checkbox({
          label: 'Hide featured track work',
          description: 'Remove the currently featured recording work from the selected works list.',
          defaultValue: true,
        }),
      },
    }),

    // ── Home: SEO ──────────────────────────────────────────────────────────────
    homeSeo: singleton({
      label: 'Page: Home - SEO',
      path: 'source/pages/home/seo',
      format: { data: 'yaml' },
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
      },
    }),

    // ── Home: Contact ──────────────────────────────────────────────────────────
    homeContact: singleton({
      label: 'Page: Home - Contact',
      path: 'source/pages/home/contact',
      format: { data: 'yaml' },
      schema: {
        hideContactSection: fields.checkbox({
          label: 'Hide contact section',
          description: 'Skip rendering the contact section on the homepage.',
          defaultValue: false,
        }),
        contactIntro: fields.text({
          label: 'Contact intro text',
          description:
            'Optional override for the homepage contact intro. Leave blank to use Contact Page → Intro text.',
          multiline: true,
          defaultValue: '',
        }),
        contactEmailLeadText: fields.text({
          label: 'Email mode lead text',
          description:
            'Optional override for the homepage email-mode lead text. Leave blank to use Contact Page → Email mode lead text.',
          multiline: true,
          defaultValue: '',
        }),
      },
    }),

    // ── Contact Page ───────────────────────────────────────────────────────────
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
        contactEmailLeadText: fields.text({
          label: 'Email mode lead text',
          description: 'Optional text shown before the email link when contact form is disabled.',
          multiline: true,
        }),
        contactEmailLinkText: fields.text({
          label: 'Email link text',
          description: 'Link text for email mode. Leave blank to show the email address.',
        }),
        contactFormEnabled: fields.checkbox({
          label: 'Enable contact form',
          description: 'Show a contact form instead of just the email link. Requires a server-side handler.',
          defaultValue: false,
        }),
        contactFormNameLabel: fields.text({
          label: 'Form name label',
          defaultValue: 'Name',
        }),
        contactFormNamePlaceholder: fields.text({
          label: 'Form name placeholder',
          defaultValue: 'What should I call you?',
        }),
        contactFormEmailLabel: fields.text({
          label: 'Form email label',
          defaultValue: 'Email',
        }),
        contactFormEmailPlaceholder: fields.text({
          label: 'Form email placeholder',
          defaultValue: 'you@domain.com',
        }),
        contactFormMessageLabel: fields.text({
          label: 'Form message label',
          defaultValue: 'Message',
        }),
        contactFormMessagePlaceholder: fields.text({
          label: 'Form message placeholder',
          defaultValue: 'Enter your message here...',
        }),
        contactFormSubmitText: fields.text({
          label: 'Form submit button text',
          defaultValue: 'Send',
        }),
        preferredHeroId: fields.select({
          label: 'Background hero image',
          description: 'Hero image used for the contact page background.',
          defaultValue: '',
          options: OPTIONAL_HERO_IMAGE_OPTIONS,
        }),
      },
    }),

    // ── Works Page ───────────────────────────────────────────────────────────
    worksPage: singleton({
      label: 'Page: Works',
      path: 'source/pages/works',
      format: { data: 'yaml' },
      schema: {
        title: fields.text({
          label: 'Page title',
          description: 'Main heading shown on the works page.',
          defaultValue: 'Works',
        }),
        introText: fields.text({
          label: 'Intro text',
          description:
            "Shown below the works page title. Leave blank to default to “A showcase of compositions by [composer name].”",
          multiline: true,
          defaultValue: '',
        }),
        hideIntroText: fields.checkbox({
          label: 'Hide intro text',
          description: 'Hide the intro text under the works page title.',
          defaultValue: false,
        }),
        workLabelSingular: fields.text({
          label: 'Singular work label',
          description: 'Singular noun used in works UI copy (e.g., "work", "piece").',
          defaultValue: 'work',
        }),
        workLabelPlural: fields.text({
          label: 'Plural work label',
          description: 'Plural noun used in works UI copy (e.g., "works", "pieces").',
          defaultValue: 'works',
        }),
        searchLabel: fields.text({
          label: 'Search label',
          description: 'Accessible label shown for the works search input.',
          defaultValue: 'Search works',
        }),
        searchPlaceholder: fields.text({
          label: 'Search placeholder',
          description: 'Placeholder text shown in the works search input.',
          defaultValue: 'Enter keywords...',
        }),
        preferredHeroId: fields.select({
          label: 'Background hero image',
          description: 'Hero image used across works pages as the background.',
          defaultValue: '',
          options: OPTIONAL_HERO_IMAGE_OPTIONS,
        }),
      },
    }),

    // ── About Page ─────────────────────────────────────────────────────────────
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
        preferredHeroId: fields.select({
          label: 'Background hero image',
          description: 'Hero image used for the about page background.',
          defaultValue: '',
          options: OPTIONAL_HERO_IMAGE_OPTIONS,
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
      },
    }),
  }),

  collections: {
    works: collection({
      label: 'Works',
      slugField: 'title',
      path: 'source/works/*/work',
      format: { data: 'yaml' },
      schema: {
        title: lockedWorkTitleField(),
        subtitle: fields.text({ label: 'Subtitle', validation: { isRequired: false } }),
        composer: fields.text({
          label: 'Composer',
          description: 'Leave blank to use the default composer from source.config.mjs',
        }),
        description: fields.mdx.inline({
          label: 'Description',
          description: 'Rich text description. Supports bold, italic, and links.',
          options: {
            bold: true,
            italic: true,
            link: true,
          },
        }),

        // ── Thumbnail ───────────────────────────────────────────────────────
        // File is auto-detected: thumbnail.{webp,jpg,jpeg,png,tiff} in the work folder.
        thumbnail: fields.object(
          {
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
        // Perusal score is auto-detected: score.pdf in the work folder.

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

        // ── Featured ────────────────────────────────────────────────────────
        selected: fields.checkbox({
          label: 'Featured work',
          description: 'Show this work in the featured/selected section',
          defaultValue: false,
        }),
        selectedOrder: fields.integer({
          label: 'Featured order',
          description: 'Integer controlling position among featured works (lower = first)',
        }),

        // ── Recordings ──────────────────────────────────────────────────────
        recordings: fields.array(
          fields.object({
            folder: fields.text({
              label: 'Folder name',
              description:
                'Subfolder under recordings/ that holds the asset files (e.g. kermit-the-frog-2021). Use a numeric prefix to control order (e.g. 01-kermit-the-frog-2021).',
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
            notes: fields.text({
              label: 'Notes',
              description: 'Optional context displayed with this recording',
              multiline: true,
            }),
            photo: fields.object(
              {
                alt: fields.text({ label: 'Photo alt text', description: 'Describe the photo for screen readers' }),
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
        sheetMusic: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            url: fields.url({ label: 'URL', validation: { isRequired: true } }),
            tooltip: fields.text({ label: 'Tooltip' }),
          }),
          {
            label: 'Sheet music links',
            itemLabel: (props) => props.fields.label.value || props.fields.url.value || 'Link',
          },
        ),

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
  },
})
