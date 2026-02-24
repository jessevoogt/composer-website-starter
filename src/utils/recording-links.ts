import type { RecordingLinkType } from '../content.config'

export function getRecordingLinkDuration(link: RecordingLinkType): string | undefined {
  return typeof link === 'string' ? undefined : link.duration
}

export function getRecordingLinkLabel(link: RecordingLinkType): string | undefined {
  const baseLabel = typeof link === 'string' ? undefined : link.label
  const duration = getRecordingLinkDuration(link)
  if (baseLabel) {
    return baseLabel
  }
  if (duration) {
    return `Duration: ${duration}`
  }
  return undefined
}
