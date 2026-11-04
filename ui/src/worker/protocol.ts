// Shared actor protocol types (main thread + worker).

export type Person = {
  id: string // short display/URL form (W3C id for urn:w3c:person:*)
  uri: string // full catalog URI (urn:w3c:person:<id> for W3C people)
  name: string
  avatarUrl: string
  handle?: string // ex:forumHandle when present
  github?: string // connected GitHub login, from ex:siloUsername "github:<login>"
  w3cId?: number // stable W3C user id, from ex:siloId "urn:w3c:person:<id>"
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

// One grant from a funder. Its id is the funder's own project page (for NLnet,
// https://nlnet.nl/project/<slug>/), so the UI links out instead of opening a
// catalog route.
export type Funding = {
  uri: string // ex:Funding id — the funder's page
  name: string // ex:name
  fund?: string // ex:fund, the fund the grant was paid from
  startDate?: string // ex:startDate (xsd:gYearMonth or xsd:gYear)
  endDate?: string // ex:endDate
}

// Software detail: one subsection per funder reached through the inverse of
// ex:funds (funder ex:funds software).
export type SoftwareFunding = {
  funder: {
    uri: string
    id: string // short display/URL form, matching /orgs/:id
    name: string
    logo?: string
  }
  fundings: Funding[]
}

// Organization detail: the reverse grouping, one subsection per funded
// software.
export type OrgFunding = {
  software: SoftwareRef
  fundings: Funding[]
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
  funding: SoftwareFunding[] // inverse ex:funds, grouped by funder (detail only)
}

export type UseCase = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description: string
  sdo?: string // ex:sdo, URL of the standards body that owns the use case
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
  funds: OrgFunding[] // ex:funds edges grouped by funded software (detail only)
}

export type Event = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  startDate?: string // ex:startDate, xsd:dateTime in UTC
  endDate?: string // ex:endDate, xsd:dateTime in UTC
  location?: string // ex:location
  atLocation?: string // ex:atLocation, the ex:Location URI
  source?: string // ex:source, the event's own page
  sdo?: string // ex:sdo, URL of the standards body that runs the event
}

export type LocalGroup = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description?: string // ex:description
  sdo?: string // ex:sdo, URL of the standards body the group belongs to
  location?: string // ex:location, the ex:Location URI
  homepage?: string // ex:homepage, the group's profile
  logo?: string // ex:logo, a public path or absolute URL
}

export type Location = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string // city, area or country
  region?: string // ex:region
  latitude?: number // ex:latitude
  longitude?: number // ex:longitude
  sdos: string[] // distinct ex:sdo values of the local groups present
}

export type CitationNature = 'normative' | 'informative'

export type SpecReference = {
  id: string // short display/URL form of the referenced spec
  uri: string // canonical shortlink of the referenced spec
  name: string
  shortname?: string
  sdo?: string // ex:sdo, URL of the standards body that owns the spec
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
  sdo?: string // ex:sdo, URL of the standards body that owns the spec
  w3cApiUrl?: string // W3C API self link
  references: SpecReference[] // specs this one cites (normative/informative)
  citedBy: SpecReference[] // specs that cite this one
}

// Compact group shape used by listings and cross-page cards. The full roster
// is only loaded for the group page or when a group is pinned for comparison.
// `id` is the full public group URL, which is also the route key.
export type GroupSummary = {
  id?: string
  name: string
  participantCount?: number
  w3cApiUrl?: string
  sdo?: string
}

export type W3cParticipant = {
  uri: string // person URI in the catalog dump (ex:member target)
  name: string
  avatarUrl: string
  github?: string // connected GitHub login, from ex:siloUsername "github:<login>"
  w3cId?: number // stable W3C user id, from ex:siloId "urn:w3c:person:<id>"
}

export type W3cGroup = {
  id: string // full public group URL, also the route key
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

export type LocationView = {
  kind: 'location'
  location: Location
  events: Event[]
  groups: LocalGroup[]
}

export type EventView = {
  kind: 'event'
  event: Event
  location?: Location
}

export type LocalGroupView = {
  kind: 'localGroup'
  group: LocalGroup
  location?: Location
}

export type DetailView =
  | PersonView
  | ProjectView
  | SpecificationView
  | SoftwareView
  | GroupView
  | OrgView
  | UseCaseView
  | LocationView
  | EventView
  | LocalGroupView

export type DetailKind = DetailView['kind']

export type DetailState = {
  key?: string // `${kind}:${sdo ?? ''}:${id}` of the currently loaded detail
  status: AsyncStatus
  data?: DetailView
  error?: string
}

// Group comparison state is separate from the paginated listing, so pinned
// groups stay visible even when they are not part of the current search page.
export type GroupSelection = {
  selected: string[] // full group URLs
  groups: GroupSummary[]
  members: Record<string, W3cParticipant[]>
  loading: string[]
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
  | 'events'
  | 'locations'

export type AppState = {
  people: ListingState<Person>
  projects: ListingState<Project>
  software: ListingState<Software>
  specifications: ListingState<Specification>
  useCases: ListingState<UseCase>
  orgs: ListingState<Org>
  groups: ListingState<GroupSummary>
  events: ListingState<Event>
  locations: ListingState<Location>
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
  events: emptyListing(),
  locations: emptyListing(),
  detail: { status: 'idle' },
  groupSelection: {
    selected: [],
    groups: [],
    members: {},
    loading: [],
    common: [],
  },
})

export const detailKey = (kind: DetailKind, id: string, sdo?: string) =>
  `${kind}:${sdo ?? ''}:${id}`

// main -> worker (the actor mailbox): search/load on demand
export type Command =
  | { type: 'search'; kind: ListingKind; query: string; sdo?: string }
  | { type: 'loadMore'; kind: ListingKind }
  | { type: 'loadDetail'; kind: DetailKind; id: string; sdo?: string }
  | { type: 'toggleGroup'; group: GroupSummary }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate = {
  [K in keyof AppState]: { key: K; value: AppState[K] }
}[keyof AppState]
