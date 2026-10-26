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

export type W3cGroupsData = {
  groups: W3cGroup[]
  selected: number[] // W3cGroup.id values the user has checked
  common: W3cParticipant[] // intersection of the selected groups' participants
}

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'
export type AsyncSlice<T> = { status: AsyncStatus; data: T; error?: string }

export type AppState = {
  people: AsyncSlice<Person[]>
  projects: AsyncSlice<Project[]>
  software: AsyncSlice<Software[]>
  specifications: AsyncSlice<Specification[]>
  w3cGroups: AsyncSlice<W3cGroupsData>
}

// main -> worker (the actor mailbox): load on demand
export type Command =
  | { type: 'loadPeople' }
  | { type: 'loadProjects' }
  | { type: 'loadProject'; id: string }
  | { type: 'loadSoftware' }
  | { type: 'loadSpecifications' }
  | { type: 'loadW3cGroups' }
  | { type: 'toggleW3cGroup'; id: number }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate =
  | { key: 'people'; value: AppState['people'] }
  | { key: 'projects'; value: AppState['projects'] }
  | { key: 'software'; value: AppState['software'] }
  | { key: 'specifications'; value: AppState['specifications'] }
  | { key: 'w3cGroups'; value: AppState['w3cGroups'] }