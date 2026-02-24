/** Category discriminator for search result types. */
export type SearchItemCategory = 'work' | 'page' | 'tag'

/** Base fields shared by all searchable items. */
interface SearchableItemBase {
  id: string
  title: string
  description: string
  keywords: string[]
  href: string
}

/** A searchable work entry — carries work-specific display metadata. */
export interface SearchableWorkItem extends SearchableItemBase {
  category: 'work'
  subtitle: string
  tags: string[]
  instrumentation: string[]
  performers: string[]
  composer: string
  venues: string[]
  duration: string
  difficulty: string
  completionDate: string
  programNote: string
}

/** A searchable static page entry. */
export interface SearchablePageItem extends SearchableItemBase {
  category: 'page'
}

/** A searchable works-tag page entry. */
export interface SearchableTagItem extends SearchableItemBase {
  category: 'tag'
  tagLabel: string
}

/** Discriminated union of all searchable items. */
export type SearchableItem = SearchableWorkItem | SearchablePageItem | SearchableTagItem

/** A search result paired with its computed relevance score. */
export interface ScoredSearchResult {
  item: SearchableItem
  score: number
}
