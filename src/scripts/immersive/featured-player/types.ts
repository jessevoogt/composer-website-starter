export interface FeaturedRecording {
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
}

export type TrackCycleDirection = 'previous' | 'next'
export type FeaturedImageTransitionTarget = Pick<FeaturedRecording, 'imageSrc' | 'imagePosition'>
