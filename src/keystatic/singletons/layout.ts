import { fields, singleton } from '@keystatic/core'
import { headerSlotsField } from '../header-slots-field'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LayoutSingletonsDeps {
  headerElementOptions: ReadonlyArray<{ label: string; value: string }>
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getLayoutSingletons(deps: LayoutSingletonsDeps) {
  const { headerElementOptions } = deps

  return {
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
  }
}
