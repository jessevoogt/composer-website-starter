import { useState, useEffect, type CSSProperties } from 'react'
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core'

// ── Types ────────────────────────────────────────────────────────────────────

interface HeroImagePreviewFieldConfig {
  label: string
  description?: string
}

// ── Styles ───────────────────────────────────────────────────────────────────

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate9)',
  lineHeight: '1.4',
}

const imageWrapperStyle: CSSProperties = {
  position: 'relative',
  border: '1px solid var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  maxWidth: '480px',
}

const imageStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 'auto',
  maxHeight: '270px',
  objectFit: 'cover',
}

const filenameStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: '11px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: 'var(--kui-color-scale-slate9)',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  borderTop: '1px solid var(--kui-color-scale-slate5)',
}

const emptyStyle: CSSProperties = {
  padding: '24px 16px',
  fontSize: '13px',
  color: 'var(--kui-color-scale-slate8)',
  textAlign: 'center',
  border: '1px dashed var(--kui-color-scale-slate5)',
  borderRadius: '6px',
  maxWidth: '480px',
}

// ── Image extensions to probe ────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'webp', 'png']

// ── Preview component ────────────────────────────────────────────────────────

function HeroImagePreview({ description }: HeroImagePreviewFieldConfig) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageFilename, setImageFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Extract the hero slug from the Keystatic URL
    // URL pattern: /keystatic/collection/heroes/item/{slug}
    const pathname = window.location.pathname
    const match = pathname.match(/\/keystatic\/collection\/heroes\/item\/([^/]+)/)
    if (!match) {
      setLoading(false)
      return
    }

    const slug = match[1]

    // Probe for the image file at /hero/{slug}/image.{ext}
    // The ingest pipeline copies source/heroes/{slug}/*.{jpg,webp,png} → public/hero/{slug}/
    let found = false
    let remaining = IMAGE_EXTENSIONS.length

    for (const ext of IMAGE_EXTENSIONS) {
      const url = `/hero/${slug}/image.${ext}`
      const img = new Image()

      img.onload = () => {
        if (!found) {
          found = true
          setImageSrc(url)
          setImageFilename(`image.${ext}`)
          setLoading(false)
        }
      }

      img.onerror = () => {
        remaining--
        if (remaining === 0 && !found) {
          setLoading(false)
        }
      }

      img.src = url
    }
  }, [])

  if (loading) {
    return (
      <div style={wrapperStyle}>
        {description && <p style={descriptionStyle}>{description}</p>}
        <div style={emptyStyle}>Loading image preview...</div>
      </div>
    )
  }

  if (!imageSrc) {
    return (
      <div style={wrapperStyle}>
        {description && <p style={descriptionStyle}>{description}</p>}
        <div style={emptyStyle}>
          No image found. Place an image file named <code>image.jpg</code> (or .webp, .png) in this
          hero&apos;s folder.
        </div>
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      {description && <p style={descriptionStyle}>{description}</p>}
      <div style={imageWrapperStyle}>
        <img src={imageSrc} alt="Hero preview" style={imageStyle} />
        <div style={filenameStyle}>{imageFilename}</div>
      </div>
    </div>
  )
}

// ── Field factory ────────────────────────────────────────────────────────────

/**
 * Display-only Keystatic field that shows a preview of the hero image.
 *
 * The image file is detected by convention: `image.{jpg,jpeg,webp,png}` placed
 * alongside the hero.yaml in the hero's directory. This field never writes to
 * YAML — `serialize` always returns `{ value: undefined }`.
 */
export function heroImagePreviewField(
  cfg: HeroImagePreviewFieldConfig,
): BasicFormField<string, string, string> {
  return {
    kind: 'form',
    formKind: undefined,
    label: cfg.label,

    Input(_props: FormFieldInputProps<string>) {
      return <HeroImagePreview {...cfg} />
    },

    defaultValue: () => '',

    parse(_value: FormFieldStoredValue): string {
      return ''
    },

    serialize() {
      return { value: undefined }
    },

    validate(value: string): string {
      return value
    },

    reader: {
      parse(_value: FormFieldStoredValue): string {
        return ''
      },
    },
  }
}
