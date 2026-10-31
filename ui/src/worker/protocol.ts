// Shared actor protocol types (main thread + worker).

export type Person = {
  id: string // short display/URL form (W3C id for urn:w3c:person:*)
  uri: string // full catalog URI (urn:w3c:person:<id> for W3C people)
  name: string
  avatarUrl: string
  handle?: string // ex:forumHandle when present
  github?: string // connected GitHub login, from ex:siloUsername "github:<login>"
  w3cId?: number // stable W3C user id, from ex:siloId "w3c:<id>"
}

export type Project = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description: string
  memberIds: string[] // short ids referencing Person.id
  members: Person[] // member previews resolved for the listing card
}

export type SoftwareSpec = {
  uri: string // doap:implements target (specification IRI)
  id: string // short display/URL form, matching /specifications/:id
  name: string // catalog name when the spec is in the catalog, else the tail
  shortname?: string
  landingPage?: string
}

// One end of a dependency edge: used for both directions, so a project can
// list what it depends on and what depends on it.
export type SoftwareRef = {
  uri: string // ex:hasDependencyOn subject or object
  id: string // short display/URL form, matching /software/:id
  name: string // catalog name when the project is in the catalog
  implements?: string[] // dependency only: doap:implements targets, for pinning
}

export type Software = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description: string // doap:shortdesc / doap:description
  programmingLanguages: string[] // doap:programming-language literals
  maintainers: SpecContributor[] // doap:maintainer, resolved to ex:Person when known
  implements: SoftwareSpec[] // doap:implements targets
  homepage?: string
  repository?: string
  documentation?: string // doap:documentation
  license?: string // doap:license, SPDX identifier as a literal
  dependencies: SoftwareRef[] // ex:hasDependencyOn targets ("depends on")
  dependents: SoftwareRef[] // projects pointing at this one ("dependency of")
}

export type UseCase = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description: string
  specificationUris: string[] // ex:useCaseOf targets
}

export type Org = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  homepage?: string
  logo?: string // ex:logo, a public path or absolute URL
  affiliates: SpecContributor[] // people linked with ex:affiliation
  proposedUseCaseUris: string[] // ex:proposed targets
}

export type CitationNature = 'normative' | 'informative'

export type SpecReference = {
  id: string // short display/URL form of the referenced spec
  uri: string // canonical shortlink of the referenced spec
  name: string
  shortname?: string
  normative: boolean
  informative: boolean
}

export type SpecContributor = {
  uri?: string // person URN when the author/editor is resolved
  id?: string // short display/URL form of the person
  name: string
  avatarUrl?: string
  github?: string // connected GitHub login, when known
}

export type Specification = {
  id: string // short display/URL form (tail of the canonical shortlink)
  uri: string // canonical public shortlink
  name: string
  shortname?: string
  landingPage?: string // public TR URL
  editorDraft?: string
  authors: SpecContributor[]
  editors: SpecContributor[]
  groups: string[] // names of W3C groups that deliver the spec
  groupUris: string[] // canonical group IRIs that deliver the spec
  w3cApiUrl?: string // W3C API self link
  references: SpecReference[] // specs this one cites (normative/informative)
  citedBy: SpecReference[] // specs that cite this one
}

// Compact group shape used by listings and cross-page cards. The full roster
// is only loaded for the group page or when a group is pinned for comparison.
export type GroupSummary = {
  id?: number // W3C API group id when the catalog group resolves
  uri?: string
  name: string
  participantCount?: number
  w3cApiUrl?: string
}

export type W3cParticipant = {
  uri: string // person URI in the catalog dump (ex:member target)
  name: string
  avatarUrl: string
  github?: string // connected GitHub login, from ex:siloUsername "github:<login>"
  w3cId?: number // stable W3C user id, from ex:siloId "w3c:<id>"
}

export type W3cGroup = {
  id: number // W3C API group id, from the catalog's ex:siloId "w3c:<id>"
  uri: string // canonical public homepage
  name: string
  w3cApiUrl?: string // W3C API self link
  participants: W3cParticipant[]
}

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'

// One paginated listing: the current query, the rows loaded so far, and the
// cursor/hasMore flags owned by the worker.
export type ListingState<T> = {
  status: AsyncStatus
  query: string
  data: T[]
  hasMore: boolean
  loadingMore: boolean
  total?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Detail views: each route gets exactly the data it renders, composed by the
// worker with targeted SPARQL queries.
// ---------------------------------------------------------------------------
export type PersonView = {
  kind: 'person'
  person: Person
  groups: GroupSummary[]
  authored: Specification[]
  edited: Specification[]
  software: Software[]
}

export type ProjectView = {
  kind: 'project'
  project: Project
}

export type SpecificationView = {
  kind: 'specification'
  spec: Specification
  groups: GroupSummary[]
  software: Software[]
  useCases: UseCase[]
}

export type SoftwareView = {
  kind: 'software'
  software: Software
  // Normative/informative references of each implemented specification, keyed
  // by that specification's URI. Used by the pin-and-compare dependency view.
  references: Record<string, SpecReference[]>
}

export type GroupView = {
  kind: 'group'
  group: W3cGroup
  specifications: Specification[]
}

export type OrgView = {
  kind: 'org'
  org: Org
  proposed: { uri: string; useCase?: UseCase }[]
}

export type UseCaseView = {
  kind: 'useCase'
  useCase: UseCase
  orgs: Org[]
  specifications: { uri: string; spec?: Specification }[]
}

export type DetailView =
  | PersonView
  | ProjectView
  | SpecificationView
  | SoftwareView
  | GroupView
  | OrgView
  | UseCaseView

export type DetailKind = DetailView['kind']

export type DetailState = {
  key?: string // `${kind}:${id}` of the currently loaded detail
  status: AsyncStatus
  data?: DetailView
  error?: string
}

// Group comparison state is separate from the paginated listing, so pinned
// groups stay visible even when they are not part of the current search page.
export type GroupSelection = {
  selected: number[]
  groups: GroupSummary[]
  members: Record<number, W3cParticipant[]>
  loading: number[]
  common: W3cParticipant[]
  error?: string
}

export type ListingKind =
  | 'people'
  | 'projects'
  | 'software'
  | 'specifications'
  | 'useCases'
  | 'orgs'
  | 'groups'

export type AppState = {
  people: ListingState<Person>
  projects: ListingState<Project>
  software: ListingState<Software>
  specifications: ListingState<Specification>
  useCases: ListingState<UseCase>
  orgs: ListingState<Org>
  groups: ListingState<GroupSummary>
  detail: DetailState
  groupSelection: GroupSelection
}

export const emptyListing = <T>(): ListingState<T> => ({
  status: 'idle',
  query: '',
  data: [],
  hasMore: false,
  loadingMore: false,
})

export const initialAppState = (): AppState => ({
  people: emptyListing(),
  projects: emptyListing(),
  software: emptyListing(),
  specifications: emptyListing(),
  useCases: emptyListing(),
  orgs: emptyListing(),
  groups: emptyListing(),
  detail: { status: 'idle' },
  groupSelection: {
    selected: [],
    groups: [],
    members: {},
    loading: [],
    common: [],
  },
})

export const detailKey = (kind: DetailKind, id: string) => `${kind}:${id}`

// main -> worker (the actor mailbox): search/load on demand
export type Command =
  | { type: 'search'; kind: ListingKind; query: string }
  | { type: 'loadMore'; kind: ListingKind }
  | { type: 'loadDetail'; kind: DetailKind; id: string }
  | { type: 'toggleGroup'; group: GroupSummary }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate = {
  [K in keyof AppState]: { key: K; value: AppState[K] }
}[keyof AppState]
