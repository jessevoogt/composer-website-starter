import { fields, singleton } from '@keystatic/core'

// ── Factory ──────────────────────────────────────────────────────────────────

export function getBlockSingletons() {
  return {
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
  }
}
