/** Serializable hero variant data passed to the client. */
export interface ClientHeroVariant {
  id: string
  label: string
  src: string
  alt: string
  credit: string
  position: string
  filter: string
}

/** Serializable featured recording data passed to the client. */
export interface ClientRecordingEntry {
  key: string
  workId: string
  workHref: string
  perusalScoreHref?: string
  title: string
  performer: string
  instrumentation: string
  date: string
  imageSrc: string
  imageAlt: string
  imagePosition: string
  mp3: string
  featured: boolean
}

export type ClientSelectWorksSortOrder = 'selected-order' | 'random' | 'newest' | 'oldest' | 'title'

/** Shape of the JSON data block embedded in the page. */
export interface ImmersivePageData {
  imageCredits: { hero: string; listen: string }
  heroVariants: ClientHeroVariant[]
  fallbackHeroSrc: string
  defaultHeroFilter: string
  selectWorksSortOrder: ClientSelectWorksSortOrder
  featuredRecordingPool: ClientRecordingEntry[]
  fallbackFeaturedRecording: ClientRecordingEntry | null
  devMode: boolean
  heroVariantEventName: string
}

/** Read the embedded JSON data from the page. */
export function readPageData(): ImmersivePageData {
  const el = document.getElementById('immersive-page-data')
  if (!el?.textContent) {
    throw new Error('Missing #immersive-page-data script block')
  }
  return JSON.parse(el.textContent) as ImmersivePageData
}
