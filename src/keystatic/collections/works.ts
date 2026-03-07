import { fields, collection } from '@keystatic/core'
import { textFieldWithPlaceholder } from '../text-field-with-placeholder'
import { workImagePreviewField } from '../work-image-preview-field'

// ── Factory ──────────────────────────────────────────────────────────────────

export function getWorksCollection() {
  return {
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
  }
}
