export const UI_ICONS = {
  // Navigation
  chevronLeft: 'lucide:chevron-left',
  chevronRight: 'lucide:chevron-right',
  chevronDown: 'lucide:chevron-down',
  arrowLeft: 'lucide:arrow-left',
  arrowRight: 'lucide:arrow-right',

  // Media
  play: 'lucide:play',
  pause: 'lucide:pause',
  volume2: 'lucide:volume-2',

  // Actions
  mail: 'lucide:mail',
  search: 'lucide:search',
  x: 'lucide:x',
  copy: 'lucide:copy',
  share2: 'lucide:share-2',
  externalLink: 'lucide:external-link',

  // Content
  quote: 'lucide:quote',

  // Social sharing
  shareFacebook: 'share-facebook',
  shareX: 'share-x',
  shareThreads: 'share-threads',
  shareBluesky: 'share-bluesky',
  shareEmail: 'share-email',
  shareCopy: 'share-copy',
  shareLinkedin: 'share-linkedin',
  shareNative: 'share-native',
} as const

export type UiIconName = keyof typeof UI_ICONS
