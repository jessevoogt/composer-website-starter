/** Serializable work entry passed to the client for search. */
export interface SearchableWork {
  id: string
  title: string
  subtitle: string
  description: string
  keywords: string[]
  tags: string[]
  instrumentation: string[]
  performers: string[]
  composer: string
  venues: string[]
  duration: string
  difficulty: string
  completionDate: string
  programNote: string
  href: string
}
