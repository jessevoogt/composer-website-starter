import { fields, collection } from '@keystatic/core'
import { heroImagePreviewField } from '../hero-image-preview-field'

// ── Factory ──────────────────────────────────────────────────────────────────

export function getHeroesCollection() {
  return {
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
  }
}
