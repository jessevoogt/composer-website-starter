import { fields, collection } from '@keystatic/core'
import { textFieldWithPlaceholder } from '../text-field-with-placeholder'
import { workImagePreviewField } from '../work-image-preview-field'
import { fileUploadField } from '../file-upload-field'
import { scoreOverridesField } from '../score-overrides-field'
import { categorizationField } from '../categorization-field'
import { homepageSelectionField } from '../homepage-selection-field'
import { collapsibleSectionField } from '../collapsible-section-field'

// ── Badge helpers ────────────────────────────────────────────────────────────
// These inspect the reparented sibling DOM to produce informative badge text.

function detailsBadge(siblings: HTMLElement[]): string {
  const parts: string[] = []
  // completionDate (sibling 0)
  const dateInput = siblings[0]?.querySelector('input')
  if (dateInput?.value) parts.push(dateInput.value)
  // duration (sibling 1)
  const durationInput = siblings[1]?.querySelector('input')
  if (durationInput?.value) parts.push(durationInput.value)
  // programNote (sibling 3)
  const noteArea = siblings[3]?.querySelector('textarea')
  if (noteArea?.value?.trim()) parts.push('has program note')
  return parts.join(' · ') || 'empty'
}

function thumbnailBadge(siblings: HTMLElement[]): string {
  const img = siblings[0]?.querySelector('img')
  return img ? 'has image' : 'no image'
}

function scoreBadge(siblings: HTMLElement[]): string {
  const parts: string[] = []
  // scoreSrc (sibling 0): file upload field renders a Remove button when file exists
  const hasFile = siblings[0]?.querySelector('button')?.textContent?.includes('Remove')
  parts.push(hasFile ? 'has score' : 'no score')
  // scoreOverrides (sibling 1): read the badge from the inner self-contained collapsible
  // Use direct child selector (>) to avoid matching nested descendant spans (e.g. chevrons)
  const overrideBadge = siblings[1]?.querySelector('button[aria-expanded] > span:last-child')
  if (overrideBadge?.textContent && overrideBadge.textContent !== 'all defaults') {
    parts.push(overrideBadge.textContent)
  }
  return parts.join(' · ')
}

function pageSettingsBadge(siblings: HTMLElement[]): string {
  const parts: string[] = []
  // preferredHeroId (sibling 0): relationship field shows selected value
  const heroLink = siblings[0]?.querySelector('a')
  if (heroLink?.textContent?.trim()) parts.push('hero: ' + heroLink.textContent.trim())
  // homepageSelection (sibling 1): flat checkbox + position input
  const checkbox = siblings[1]?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  if (checkbox?.checked) {
    const posInput = siblings[1]?.querySelector('input[type="number"]') as HTMLInputElement | null
    const pos = posInput?.value ? `#${posInput.value}` : ''
    parts.push('selected' + (pos ? ` ${pos}` : ''))
  }
  return parts.join(' · ') || 'defaults'
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getWorksCollection() {
  return {
    works: collection({
      label: 'Works',
      slugField: 'title',
      path: 'source/works/*/work',
      format: { data: 'yaml' },
      schema: {
        title: fields.slug({ name: { label: 'Title', validation: { isRequired: true } } }),
        subtitle: fields.text({ label: 'Subtitle', validation: { isRequired: false } }),
        composer: fields.text({
          label: 'Composer',
          description: 'Leave blank to use the site composer',
        }),
        description: fields.text({
          label: 'Description',
          description: 'Short description shown on work cards and in search results',
          multiline: true,
        }),

        // ═══════════════════════════════════════════════════════════════════
        // ── Details ───────────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _detailsCollapse: collapsibleSectionField({
          id: 'details',
          label: 'Details',
          fieldCount: 4,
          badgeFn: detailsBadge,
        }),

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

        _movementsCollapse: collapsibleSectionField({
          id: 'movements',
          label: 'Movements',
          itemLabel: 'movement',
        }),
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

        // ═══════════════════════════════════════════════════════════════════
        // ── Thumbnail ─────────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _thumbnailCollapse: collapsibleSectionField({
          id: 'thumbnail',
          label: 'Thumbnail',
          fieldCount: 1,
          badgeFn: thumbnailBadge,
        }),

        // File is auto-detected: thumbnail.{webp,jpg,jpeg,png,tiff} in the work folder.
        thumbnail: fields.object(
          {
            src: workImagePreviewField({
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
          { label: 'Thumbnail', layout: [12, 6, 6] },
        ),

        // ═══════════════════════════════════════════════════════════════════
        // ── Score & PDF ───────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _scoreCollapse: collapsibleSectionField({
          id: 'score',
          label: 'Score & PDF',
          fieldCount: 2,
          badgeFn: scoreBadge,
        }),

        // Perusal score is auto-detected: score.pdf in the work folder.
        scoreSrc: fileUploadField({
          label: 'Score PDF',
          kind: 'score',
          description: 'The perusal score PDF. Auto-detected as score.pdf in the work folder.',
        }),
        scoreOverrides: scoreOverridesField({
          label: 'Score & PDF Overrides',
        }),

        // ═══════════════════════════════════════════════════════════════════
        // ── Recordings ───────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _recordingsCollapse: collapsibleSectionField({
          id: 'recordings',
          label: 'Recordings',
          itemLabel: 'recording',
        }),

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
            audioSrc: fileUploadField({
              label: 'Audio file',
              kind: 'audio',
              description:
                'The recording audio file. Auto-detected as recording.{wav,aiff,flac,mp3} in the recording folder.',
            }),
            photo: fields.object(
              {
                src: workImagePreviewField({
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

        // ═══════════════════════════════════════════════════════════════════
        // ── Tags / Instrumentation / Keywords ────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        // categorizationField is a self-contained collapsible — no outer wrapper needed
        categorization: categorizationField({
          label: 'Tags / Instrumentation / Keywords',
        }),

        // ═══════════════════════════════════════════════════════════════════
        // ── Page Settings ─────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _pageSettingsCollapse: collapsibleSectionField({
          id: 'page-settings',
          label: 'Background Image / Selected Work Flag',
          fieldCount: 2,
          badgeFn: pageSettingsBadge,
        }),

        preferredHeroId: fields.relationship({
          label: 'Background hero image override',
          description:
            'Override the default work detail page background for this specific work. Leave blank to use the default from Page: Work Detail settings.',
          collection: 'heroes',
        }),
        homepageSelection: homepageSelectionField({
          label: 'Homepage Selection',
        }),

        // ═══════════════════════════════════════════════════════════════════
        // ── Sheet Music ─────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _sheetMusicCollapse: collapsibleSectionField({
          id: 'sheet-music',
          label: 'Sheet Music',
          itemLabel: 'link',
        }),
        sheetMusic: fields.array(fields.url({ label: 'URL', validation: { isRequired: true } }), {
          label: 'Sheet music links',
          itemLabel: (props) => props.value || 'Link',
        }),

        // ═══════════════════════════════════════════════════════════════════
        // ── Performances ────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        _performancesCollapse: collapsibleSectionField({
          id: 'performances',
          label: 'Performances',
          itemLabel: 'performance',
        }),
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
