import { SparqlEndpointFetcher, type IBindings } from 'fetch-sparql-endpoint'
import type {
  DetailKind,
  Event,
  GroupSummary,
  ListingKind,
  LocalGroup,
  Location,
  Org,
  Person,
  Project,
  Software,
  SoftwareRef,
  SpecContributor,
  SpecReference,
  Specification,
  UseCase,
  W3cGroup,
  W3cParticipant,
} from './protocol'

// ---------------------------------------------------------------------------
// SPARQL endpoint
// ---------------------------------------------------------------------------
// The catalog is served by Apache Fuseki. Production is the hackers4peace VPS;
// `npm run dev` points at the redhat sandbox, `npm run prod` at production.
// Vercel builds keep the production default below. VITE_SPARQL_ENDPOINT
// overrides it for any other build/runtime.
const SPARQL_ENDPOINT =
  import.meta.env.VITE_SPARQL_ENDPOINT ??
  'https://sparql.hackers4peace.net/catalog/sparql'

// POST keeps long queries out of the URL. Fuseki replies with SPARQL JSON.
const fetcher = new SparqlEndpointFetcher({ method: 'POST' })

type BindingsStream = Awaited<
  ReturnType<SparqlEndpointFetcher['fetchBindings']>
>

// fetch-sparql-endpoint hands back plain objects keyed by variable name, not
// Comunica's Bindings with `.get()` — see
// https://github.com/rubensworks/fetch-sparql-endpoint.js/issues/92.
const value = (binding: IBindings, variable: string) =>
  binding[variable]?.value

// Drain a result stream into an array; the mapping helpers below then process
// rows synchronously (the fetcher returns a Node-style readable stream).
function collectBindings(stream: BindingsStream): Promise<IBindings[]> {
  return new Promise((resolve, reject) => {
    const rows: IBindings[] = []
    stream.on('data', (binding: IBindings) => rows.push(binding))
    stream.on('end', () => resolve(rows))
    stream.on('error', reject)
  })
}

async function queryBindings(query: string): Promise<IBindings[]> {
  return collectBindings(await fetcher.fetchBindings(SPARQL_ENDPOINT, query))
}

// ---------------------------------------------------------------------------
// SPARQL helpers
// ---------------------------------------------------------------------------
const EX = 'http://example.org#'
const TAX = 'https://solidproject.solidcommunity.net/catalog/taxonomy#'
// Software is described in DOAP; `ex:` entries are still read during the
// migration so the older catalog records keep showing up.
const DOAP = 'http://usefulinc.com/ns/doap#'
const DCTERMS = 'http://purl.org/dc/terms/'
const BIBO = 'http://purl.org/ontology/bibo/'
const SDO = 'ex:sdo'

const PREFIXES = `PREFIX ex: <${EX}>
PREFIX tax: <${TAX}>
PREFIX doap: <${DOAP}>
PREFIX dcterms: <${DCTERMS}>
PREFIX bibo: <${BIBO}>`

// JSON string escaping matches the SPARQL string escapes we need (quotes,
// backslashes, control characters), so query input cannot break out.
const lit = (value: string) => JSON.stringify(value)

// Catalog URIs only contain safe characters, but route ids do not. Percent
// encode anything that would terminate or corrupt an IRI in a query.
const iri = (uri: string) =>
  `<${uri.replace(/[<>"{}|^`\\\s]/g, (char) => encodeURIComponent(char))}>`

// Short display/URL form of a catalog URI: tail after the last / or #,
// with trailing separators and the known URN prefixes dropped.
const short = (uri: string) => {
  const trimmed = uri.replace(/[/#]+$/, '')
  return trimmed
    .replace(/^.*[/#]/, '')
    .replace(/^urn:uuid:/, '')
    .replace(/^urn:w3c:person:/, '')
}

const robohash = (seed: string) =>
  `https://robohash.org/${seed}?set=set4&size=128x128`

// ex:siloId carries the stable W3C ids as URNs (urn:w3c:person:, urn:w3c:group:,
// urn:w3c:affiliation:); ex:w3cApiUrl keeps the opaque API self link. The
// pre-migration "w3c:<id>" spelling is still parsed so this UI also works
// against a dataset seeded before the migration.
const W3C_PERSON_SILO = ['urn:w3c:person:', 'w3c:']
const W3C_GROUP_SILO = ['urn:w3c:group:', 'w3c:']

const parseSiloId = (
  siloId: string | undefined,
  prefixes: string[],
): number | undefined => {
  if (!siloId) return undefined
  for (const prefix of prefixes) {
    if (!siloId.startsWith(prefix)) continue
    const id = Number(siloId.slice(prefix.length))
    if (Number.isInteger(id)) return id
  }
  return undefined
}

// ex:siloUsername carries the connected GitHub account as "github:<login>".
const GITHUB_SILO_PREFIX = 'github:'

const parseGithubUsername = (
  siloUsername: string | undefined,
): string | undefined => {
  if (!siloUsername?.startsWith(GITHUB_SILO_PREFIX)) return undefined
  return siloUsername.slice(GITHUB_SILO_PREFIX.length) || undefined
}

const toPerson = (
  uri: string,
  name: string,
  fields: { handle?: string; logo?: string; github?: string } = {},
): Person => ({
  id: short(uri),
  uri,
  name,
  handle: fields.handle,
  github: fields.github,
  avatarUrl: fields.logo ?? robohash(short(uri)),
})

const toSpecContributor = (
  value: string | undefined,
  name: string | undefined,
  logo: string | undefined,
  siloUsername: string | undefined,
): SpecContributor | undefined => {
  if (!value) return undefined
  const isIri =
    value.startsWith('urn:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  const github = parseGithubUsername(siloUsername)
  if (!name && !isIri) return { name: value }
  const displayName = name ?? value
  return {
    ...(isIri ? { uri: value, id: short(value) } : {}),
    name: displayName,
    ...(isIri ? { avatarUrl: logo ?? robohash(short(value)) } : {}),
    ...(github ? { github } : {}),
  }
}

const addSpecContributor = (
  people: SpecContributor[],
  person: SpecContributor | undefined,
) => {
  if (!person) return
  const key = person.uri ?? person.name
  if (!people.some((item) => (item.uri ?? item.name) === key)) {
    people.push(person)
  }
}

const toW3cParticipant = (
  uri: string,
  name: string,
  logo?: string,
): W3cParticipant => ({
  uri,
  name,
  avatarUrl: logo ?? robohash(short(uri)),
})

// ---------------------------------------------------------------------------
// Keyset pagination
// ---------------------------------------------------------------------------
export type ListingCursor = { key: string; uri: string }

export type ListingPage = {
  data:
    | Person[]
    | Project[]
    | Software[]
    | Specification[]
    | UseCase[]
    | Org[]
    | GroupSummary[]
    | Event[]
    | Location[]
  hasMore: boolean
  cursor: ListingCursor | null
  total?: number
}

// People get a larger first page; the other directories stay compact.
export const PAGE_SIZE: Record<ListingKind, number> = {
  people: 50,
  projects: 20,
  software: 20,
  specifications: 20,
  useCases: 20,
  orgs: 20,
  groups: 20,
  events: 20,
  locations: 20,
}

// The ordering is authoritative on the server. The URI tie-breaker makes it a
// total order even when two records share a name, so page boundaries can never
// skip or duplicate a record.
const LISTING_BODY: Record<ListingKind, string> = {
  people: `?id a ex:Person ; ex:name ?name .`,
  projects: `?id a ex:Organization ; ex:name ?name ; ex:subType ?subType .
    FILTER (?subType = tax:OpenSourceProject || ?subType = tax:UniversityProject)`,
  software: `{ ?id a doap:Project } UNION { ?id a ex:Software }
    OPTIONAL { ?id doap:name ?doapName }
    OPTIONAL { ?id ex:name ?exName }
    BIND(COALESCE(?doapName, ?exName) AS ?name)
    FILTER (BOUND(?name))`,
  specifications: `?id a ex:Specification ; ex:name ?name .`,
  useCases: `?id a ex:UseCase ; ex:name ?name .`,
  orgs: `?id a ex:Organization ; ex:name ?name .
    FILTER NOT EXISTS { ?id ex:subType ?subType }`,
  groups: `?id a ex:Group ; ex:name ?name .`,
  events: `?id a ex:Event ; ex:name ?name .
    OPTIONAL { ?id ex:startDate ?startDate }`,
  locations: `?id a ex:Location ; ex:name ?name .`,
}

// Events read chronologically; every other directory is alphabetical.
const LISTING_SORT_KEY: Partial<Record<ListingKind, string>> = {
  events: 'COALESCE(STR(?startDate), "")',
}

// Only specs, groups, use cases, events and locations belong to an SDO.
// People, projects, organizations and software are SDO-independent.
const SDO_LISTINGS = new Set<ListingKind>([
  'specifications',
  'useCases',
  'groups',
  'events',
  'locations',
])

const sdoFilter = (kind: ListingKind, sdo: string | undefined) => {
  if (!sdo || !SDO_LISTINGS.has(kind)) return ''
  // A location has no SDO of its own; it is scoped through the local groups
  // present there, which can belong to several standards bodies.
  if (kind === 'locations') {
    return `?group ex:location ?id ; ${SDO} ${iri(sdo)} .`
  }
  return `?id ${SDO} ${iri(sdo)} .`
}

const searchFilter = (query: string) => {
  const normalized = query.trim()
  if (!normalized) return ''
  return `FILTER (CONTAINS(LCASE(STR(?name)), LCASE(${lit(normalized)})))`
}

const cursorFilter = (cursor: ListingCursor | null) => {
  if (!cursor) return ''
  return `FILTER (?sortKey > ${lit(cursor.key)}
    || (?sortKey = ${lit(cursor.key)} && STR(?id) > ${lit(cursor.uri)}))`
}

const idPageQuery = (
  kind: ListingKind,
  query: string,
  cursor: ListingCursor | null,
  limit: number,
  sdo?: string,
) => `${PREFIXES}
SELECT ?id ?sortKey WHERE {
  {
    SELECT DISTINCT ?id (${LISTING_SORT_KEY[kind] ?? 'LCASE(STR(?name))'} AS ?sortKey) WHERE {
      ${LISTING_BODY[kind]}
      ${sdoFilter(kind, sdo)}
      ${searchFilter(query)}
    }
  }
  ${cursorFilter(cursor)}
}
ORDER BY ?sortKey STR(?id)
LIMIT ${limit}`

const countQuery = (kind: ListingKind, query: string, sdo?: string) => `${PREFIXES}
SELECT (COUNT(DISTINCT ?id) AS ?total) WHERE {
  ${LISTING_BODY[kind]}
  ${sdoFilter(kind, sdo)}
  ${searchFilter(query)}
}`

type IdRow = { id: string; sortKey: string }

type IdPage = {
  rows: IdRow[]
  hasMore: boolean
  cursor: ListingCursor | null
  total?: number
}

async function fetchIdPage(
  kind: ListingKind,
  query: string,
  cursor: ListingCursor | null,
  limit: number,
  sdo?: string,
): Promise<IdPage> {
  const withTotal = cursor === null
  const [rows, totalRows] = await Promise.all([
    queryBindings(idPageQuery(kind, query, cursor, limit + 1, sdo)),
    withTotal
      ? queryBindings(countQuery(kind, query, sdo))
      : Promise.resolve([]),
  ])

  // DISTINCT should already keep subjects unique; this guards against a
  // second name slipping through a BIND/COALESCE path.
  const seen = new Set<string>()
  const unique: IdRow[] = []
  for (const binding of rows) {
    const id = value(binding, 'id')
    if (!id || seen.has(id)) continue
    seen.add(id)
    unique.push({ id, sortKey: value(binding, 'sortKey') ?? id })
  }

  const hasMore = unique.length > limit
  const pageRows = unique.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  const totalValue = totalRows[0] ? value(totalRows[0], 'total') : undefined
  const total = totalValue === undefined ? undefined : Number(totalValue)

  return {
    rows: pageRows,
    hasMore,
    cursor: hasMore && last ? { key: last.sortKey, uri: last.id } : null,
    total: Number.isFinite(total) ? total : undefined,
  }
}

// ---------------------------------------------------------------------------
// Hydration by URI: each listing page fetches nested fields only for its page,
// never for the whole directory.
// ---------------------------------------------------------------------------
async function peopleByUris(uris: string[]): Promise<Map<string, Person>> {
  const people = new Map<string, Person>()
  if (!uris.length) return people
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?id ?name ?handle ?logo ?siloUsername ?siloId WHERE {
      VALUES ?id { ${uris.map(iri).join(' ')} }
      ?id a ex:Person ; ex:name ?name .
      OPTIONAL { ?id ex:forumHandle ?handle }
      OPTIONAL { ?id ex:logo ?logo }
      OPTIONAL { ?id ex:siloUsername ?siloUsername }
      OPTIONAL { ?id ex:siloId ?siloId }
    }`)
  for (const b of rows) {
    const uri = value(b, 'id')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let person = people.get(uri)
    if (!person) {
      person = toPerson(uri, name, {
        handle: value(b, 'handle'),
        logo: value(b, 'logo'),
      })
      people.set(uri, person)
    }
    const github = parseGithubUsername(value(b, 'siloUsername'))
    if (github && person.github === undefined) person.github = github
    const w3cId = parseSiloId(value(b, 'siloId'), W3C_PERSON_SILO)
    if (w3cId !== undefined && person.w3cId === undefined) person.w3cId = w3cId
  }
  return people
}

async function projectsByUris(uris: string[]): Promise<Map<string, Project>> {
  const projects = new Map<string, Project>()
  if (!uris.length) return projects
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?id ?name ?description
           ?member ?memberName ?memberLogo ?memberHandle ?memberSiloUsername ?memberSiloId
    WHERE {
      VALUES ?id { ${uris.map(iri).join(' ')} }
      ?id a ex:Organization ; ex:name ?name .
      OPTIONAL { ?id ex:description ?description }
      OPTIONAL {
        ?id ex:member ?member .
        ?member a ex:Person ; ex:name ?memberName .
        OPTIONAL { ?member ex:logo ?memberLogo }
        OPTIONAL { ?member ex:forumHandle ?memberHandle }
        OPTIONAL { ?member ex:siloUsername ?memberSiloUsername }
        OPTIONAL { ?member ex:siloId ?memberSiloId }
      }
    }`)
  for (const b of rows) {
    const uri = value(b, 'id')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let project = projects.get(uri)
    if (!project) {
      project = {
        id: short(uri),
        uri,
        name,
        description: value(b, 'description') ?? '',
        memberIds: [],
        members: [],
      }
      projects.set(uri, project)
    }
    const description = value(b, 'description')
    if (description && !project.description) project.description = description

    const memberUri = value(b, 'member')
    const memberName = value(b, 'memberName')
    if (!memberUri || !memberName) continue
    let member = project.members.find((person) => person.uri === memberUri)
    if (!member) {
      member = toPerson(memberUri, memberName, {
        handle: value(b, 'memberHandle'),
        logo: value(b, 'memberLogo'),
      })
      member.github = parseGithubUsername(value(b, 'memberSiloUsername'))
      member.w3cId = parseSiloId(value(b, 'memberSiloId'), W3C_PERSON_SILO)
      project.members.push(member)
      project.memberIds.push(short(memberUri))
    } else {
      const github = parseGithubUsername(value(b, 'memberSiloUsername'))
      if (github && member.github === undefined) member.github = github
      const w3cId = parseSiloId(value(b, 'memberSiloId'), W3C_PERSON_SILO)
      if (w3cId !== undefined && member.w3cId === undefined)
        member.w3cId = w3cId
    }
  }
  for (const project of projects.values()) {
    project.members.sort((a, b) => a.name.localeCompare(b.name))
  }
  return projects
}

async function specificationsByUris(
  uris: string[],
): Promise<Map<string, Specification>> {
  const specs = new Map<string, Specification>()
  if (!uris.length) return specs
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?spec ?name ?shortname ?landingPage ?editorDraft ?w3cApiUrl ?sdo
           ?group ?groupName
           ?author ?authorName ?authorLogo ?authorSilo
           ?editor ?editorName ?editorLogo ?editorSilo
    WHERE {
      VALUES ?spec { ${uris.map(iri).join(' ')} }
      ?spec a ex:Specification ; ex:name ?name .
      OPTIONAL { ?spec ex:shortname ?shortname }
      OPTIONAL { ?spec ex:landingPage ?landingPage }
      OPTIONAL { ?spec ex:editorDraft ?editorDraft }
      OPTIONAL { ?spec ex:w3cApiUrl ?w3cApiUrl }
      OPTIONAL { ?spec ex:sdo ?sdo }
      OPTIONAL {
        ?group a ex:Organization ; ex:specification ?spec ; ex:name ?groupName .
      }
      OPTIONAL {
        ?spec dcterms:creator ?author .
        OPTIONAL { ?author ex:name ?authorName }
        OPTIONAL { ?author ex:logo ?authorLogo }
        OPTIONAL { ?author ex:siloUsername ?authorSilo }
      }
      OPTIONAL {
        ?spec bibo:editor ?editor .
        OPTIONAL { ?editor ex:name ?editorName }
        OPTIONAL { ?editor ex:logo ?editorLogo }
        OPTIONAL { ?editor ex:siloUsername ?editorSilo }
      }
    }`)
  for (const b of rows) {
    const uri = value(b, 'spec')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let spec = specs.get(uri)
    if (!spec) {
      spec = {
        id: short(uri),
        uri,
        name,
        shortname: value(b, 'shortname'),
        landingPage: value(b, 'landingPage'),
        editorDraft: value(b, 'editorDraft'),
        authors: [],
        editors: [],
        groups: [],
        groupUris: [],
        sdo: value(b, 'sdo'),
        w3cApiUrl: value(b, 'w3cApiUrl'),
        references: [],
        citedBy: [],
      }
      specs.set(uri, spec)
    }
    spec.shortname ??= value(b, 'shortname')
    spec.landingPage ??= value(b, 'landingPage')
    spec.editorDraft ??= value(b, 'editorDraft')
    spec.sdo ??= value(b, 'sdo')
    spec.w3cApiUrl ??= value(b, 'w3cApiUrl')
    addSpecContributor(
      spec.authors,
      toSpecContributor(
        value(b, 'author'),
        value(b, 'authorName'),
        value(b, 'authorLogo'),
        value(b, 'authorSilo'),
      ),
    )
    addSpecContributor(
      spec.editors,
      toSpecContributor(
        value(b, 'editor'),
        value(b, 'editorName'),
        value(b, 'editorLogo'),
        value(b, 'editorSilo'),
      ),
    )
    const group = value(b, 'group')
    if (group && !spec.groupUris.includes(group)) spec.groupUris.push(group)
    const groupName = value(b, 'groupName')
    if (groupName && !spec.groups.includes(groupName)) spec.groups.push(groupName)
  }
  for (const spec of specs.values()) {
    spec.authors.sort((a, b) => a.name.localeCompare(b.name))
    spec.editors.sort((a, b) => a.name.localeCompare(b.name))
    spec.groups.sort((a, b) => a.localeCompare(b))
    spec.groupUris.sort((a, b) => a.localeCompare(b))
  }
  return specs
}

const citationRank = (reference: SpecReference) =>
  reference.normative ? 0 : reference.informative ? 1 : 2

const sortReferences = (references: Iterable<SpecReference>) =>
  [...references].sort(
    (a, b) => citationRank(a) - citationRank(b) || a.name.localeCompare(b.name),
  )

const addReference = (
  index: Map<string, Map<string, SpecReference>>,
  ownerUri: string,
  otherUri: string,
  otherName: string | undefined,
  otherShortname: string | undefined,
  otherSdo: string | undefined,
  predicate: string | undefined,
) => {
  if (!predicate) return
  let references = index.get(ownerUri)
  if (!references) {
    references = new Map()
    index.set(ownerUri, references)
  }
  let reference = references.get(otherUri)
  if (!reference) {
    reference = {
      id: short(otherUri),
      uri: otherUri,
      name: otherName ?? short(otherUri),
      ...(otherShortname ? { shortname: otherShortname } : {}),
      sdo: otherSdo,
      normative: false,
      informative: false,
    }
    references.set(otherUri, reference)
  }
  reference.sdo ??= otherSdo
  if (predicate === `${EX}normativeRef`) reference.normative = true
  if (predicate === `${EX}informativeRef`) reference.informative = true
}

async function outgoingReferences(
  specUris: string[],
): Promise<Record<string, SpecReference[]>> {
  const result: Record<string, SpecReference[]> = {}
  if (!specUris.length) return result
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?spec ?target ?targetName ?targetShortname ?targetSdo ?predicate WHERE {
      VALUES ?spec { ${specUris.map(iri).join(' ')} }
      VALUES ?predicate { ex:normativeRef ex:informativeRef }
      ?spec ?predicate ?target .
      ?target a ex:Specification .
      OPTIONAL { ?target ex:name ?targetName }
      OPTIONAL { ?target ex:shortname ?targetShortname }
      OPTIONAL { ?target ex:sdo ?targetSdo }
    }`)
  const index = new Map<string, Map<string, SpecReference>>()
  for (const b of rows) {
    const spec = value(b, 'spec')
    const target = value(b, 'target')
    if (!spec || !target) continue
    addReference(
      index,
      spec,
      target,
      value(b, 'targetName'),
      value(b, 'targetShortname'),
      value(b, 'targetSdo'),
      value(b, 'predicate'),
    )
  }
  for (const [spec, references] of index) {
    result[spec] = sortReferences(references.values())
  }
  return result
}

async function incomingReferences(uri: string): Promise<SpecReference[]> {
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?source ?sourceName ?sourceShortname ?sourceSdo ?predicate WHERE {
      VALUES ?predicate { ex:normativeRef ex:informativeRef }
      ?source ?predicate ${iri(uri)} .
      ?source a ex:Specification .
      OPTIONAL { ?source ex:name ?sourceName }
      OPTIONAL { ?source ex:shortname ?sourceShortname }
      OPTIONAL { ?source ex:sdo ?sourceSdo }
    }`)
  const index = new Map<string, Map<string, SpecReference>>()
  for (const b of rows) {
    const source = value(b, 'source')
    if (!source) continue
    addReference(
      index,
      uri,
      source,
      value(b, 'sourceName'),
      value(b, 'sourceShortname'),
      value(b, 'sourceSdo'),
      value(b, 'predicate'),
    )
  }
  return sortReferences(index.get(uri)?.values() ?? [])
}

async function softwareByUris(
  uris: string[],
  withEdges = false,
): Promise<Map<string, Software>> {
  const projects = new Map<string, Software>()
  if (!uris.length) return projects
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?s ?name ?description ?language ?license ?homepage ?repo ?repoLocation ?docs
           ?maintainer ?maintainerName ?maintainerLogo ?maintainerSiloUsername
           ?spec ?specName ?specShortname ?specLandingPage WHERE {
      VALUES ?s { ${uris.map(iri).join(' ')} }
      OPTIONAL { ?s doap:name ?doapName }
      OPTIONAL { ?s ex:name ?exName }
      BIND(COALESCE(?doapName, ?exName) AS ?name)
      FILTER (BOUND(?name))
      OPTIONAL { ?s doap:shortdesc ?shortDescription }
      OPTIONAL { ?s doap:description ?longDescription }
      BIND(COALESCE(?shortDescription, ?longDescription) AS ?description)
      OPTIONAL { ?s doap:programming-language ?language }
      OPTIONAL { ?s doap:license ?license }
      OPTIONAL { ?s doap:homepage ?homepage }
      OPTIONAL { ?s doap:documentation ?docs }
      OPTIONAL {
        ?s doap:repository ?repo .
        OPTIONAL { ?repo doap:location ?repoLocation }
      }
      OPTIONAL {
        ?s doap:maintainer ?maintainer .
        OPTIONAL { ?maintainer ex:name ?maintainerName }
        OPTIONAL { ?maintainer ex:logo ?maintainerLogo }
        OPTIONAL { ?maintainer ex:siloUsername ?maintainerSiloUsername }
      }
      OPTIONAL {
        ?s doap:implements ?spec .
        OPTIONAL { ?spec ex:name ?specName }
        OPTIONAL { ?spec ex:shortname ?specShortname }
        OPTIONAL { ?spec ex:landingPage ?specLandingPage }
      }
    }`)
  for (const b of rows) {
    const uri = value(b, 's')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let project = projects.get(uri)
    if (!project) {
      project = {
        id: short(uri),
        uri,
        name,
        description: value(b, 'description') ?? '',
        programmingLanguages: [],
        maintainers: [],
        implements: [],
        homepage: value(b, 'homepage'),
        // The repository node may carry the URL itself or point at it.
        repository: value(b, 'repoLocation') ?? value(b, 'repo'),
        documentation: value(b, 'docs'),
        license: value(b, 'license'),
        dependencies: [],
        dependents: [],
      }
      projects.set(uri, project)
    }
    const description = value(b, 'description')
    if (description && !project.description) project.description = description
    project.homepage ??= value(b, 'homepage')
    project.repository ??= value(b, 'repoLocation') ?? value(b, 'repo')
    project.documentation ??= value(b, 'docs')
    project.license ??= value(b, 'license')

    const language = value(b, 'language')
    if (language && !project.programmingLanguages.includes(language)) {
      project.programmingLanguages.push(language)
    }
    const maintainer = toSpecContributor(
      value(b, 'maintainer'),
      value(b, 'maintainerName'),
      value(b, 'maintainerLogo'),
      value(b, 'maintainerSiloUsername'),
    )
    if (
      maintainer &&
      !project.maintainers.some(
        (m) => (m.uri ?? m.name) === (maintainer.uri ?? maintainer.name),
      )
    ) {
      project.maintainers.push(maintainer)
    }
    const spec = value(b, 'spec')
    if (spec && !project.implements.some((s) => s.uri === spec)) {
      project.implements.push({
        uri: spec,
        id: short(spec),
        name: value(b, 'specName') ?? short(spec),
        shortname: value(b, 'specShortname'),
        landingPage: value(b, 'specLandingPage'),
      })
    }
  }

  if (withEdges && projects.size) {
    const subjects = [...projects.keys()].map(iri).join(' ')
    const [dependencyRows, dependentRows] = await Promise.all([
      queryBindings(`${PREFIXES}
        SELECT ?s ?dep ?depName ?depImplements WHERE {
          VALUES ?s { ${subjects} }
          ?s ex:hasDependencyOn ?dep .
          OPTIONAL { ?dep doap:name ?depDoapName }
          OPTIONAL { ?dep ex:name ?depExName }
          BIND(COALESCE(?depDoapName, ?depExName) AS ?depName)
          OPTIONAL { ?dep doap:implements ?depImplements }
        }`),
      queryBindings(`${PREFIXES}
        SELECT ?s ?dependent ?dependentName WHERE {
          VALUES ?s { ${subjects} }
          ?dependent ex:hasDependencyOn ?s .
          { ?dependent a doap:Project } UNION { ?dependent a ex:Software }
          OPTIONAL { ?dependent doap:name ?dependentDoapName }
          OPTIONAL { ?dependent ex:name ?dependentExName }
          BIND(COALESCE(?dependentDoapName, ?dependentExName) AS ?dependentName)
        }`),
    ])
    for (const b of dependencyRows) {
      const subject = value(b, 's')
      const dep = value(b, 'dep')
      const project = subject ? projects.get(subject) : undefined
      if (!project || !dep) continue
      let reference = project.dependencies.find((item) => item.uri === dep)
      if (!reference) {
        reference = {
          uri: dep,
          id: short(dep),
          name: value(b, 'depName') ?? short(dep),
          implements: [],
        }
        project.dependencies.push(reference)
      }
      const implemented = value(b, 'depImplements')
      if (implemented && !reference.implements?.includes(implemented)) {
        reference.implements = [...(reference.implements ?? []), implemented]
      }
    }
    for (const b of dependentRows) {
      const subject = value(b, 's')
      const dependent = value(b, 'dependent')
      const project = subject ? projects.get(subject) : undefined
      if (!project || !dependent) continue
      if (project.dependents.some((item) => item.uri === dependent)) continue
      project.dependents.push({
        uri: dependent,
        id: short(dependent),
        name: value(b, 'dependentName') ?? short(dependent),
      })
    }
  }

  for (const project of projects.values()) {
    project.dependencies.sort((a, b) => a.name.localeCompare(b.name))
    project.dependents.sort((a, b) => a.name.localeCompare(b.name))
    project.maintainers.sort((a, b) => a.name.localeCompare(b.name))
    project.implements.sort((a, b) => a.name.localeCompare(b.name))
  }
  return projects
}

async function useCasesByUris(uris: string[]): Promise<Map<string, UseCase>> {
  const useCases = new Map<string, UseCase>()
  if (!uris.length) return useCases
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?uc ?name ?description ?sdo ?spec WHERE {
      VALUES ?uc { ${uris.map(iri).join(' ')} }
      ?uc a ex:UseCase ; ex:name ?name .
      OPTIONAL { ?uc ex:description ?description }
      OPTIONAL { ?uc ex:sdo ?sdo }
      OPTIONAL { ?uc ex:useCaseOf ?spec }
    }`)
  for (const b of rows) {
    const uri = value(b, 'uc')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let useCase = useCases.get(uri)
    if (!useCase) {
      useCase = {
        id: short(uri),
        uri,
        name,
        description: value(b, 'description') ?? '',
        sdo: value(b, 'sdo'),
        specificationUris: [],
      }
      useCases.set(uri, useCase)
    }
    if (!useCase.description && value(b, 'description')) {
      useCase.description = value(b, 'description')!
    }
    useCase.sdo ??= value(b, 'sdo')
    const spec = value(b, 'spec')
    if (spec && !useCase.specificationUris.includes(spec)) {
      useCase.specificationUris.push(spec)
    }
  }
  return useCases
}

async function eventsByUris(uris: string[]): Promise<Map<string, Event>> {
  const events = new Map<string, Event>()
  if (!uris.length) return events
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?event ?name ?startDate ?endDate ?location ?source ?sdo WHERE {
      VALUES ?event { ${uris.map(iri).join(' ')} }
      ?event a ex:Event ; ex:name ?name .
      OPTIONAL { ?event ex:startDate ?startDate }
      OPTIONAL { ?event ex:endDate ?endDate }
      OPTIONAL { ?event ex:location ?location }
      OPTIONAL { ?event ex:source ?source }
      OPTIONAL { ?event ex:sdo ?sdo }
    }`)
  for (const b of rows) {
    const uri = value(b, 'event')
    const name = value(b, 'name')
    if (!uri || !name) continue
    events.set(uri, {
      id: short(uri),
      uri,
      name,
      startDate: value(b, 'startDate'),
      endDate: value(b, 'endDate'),
      location: value(b, 'location'),
      source: value(b, 'source'),
      sdo: value(b, 'sdo'),
    })
  }
  return events
}

async function locationsByUris(
  uris: string[],
): Promise<Map<string, Location>> {
  const locations = new Map<string, Location>()
  if (!uris.length) return locations
  const subjects = uris.map(iri).join(' ')
  const [rows, sdoRows] = await Promise.all([
    queryBindings(`${PREFIXES}
      SELECT ?location ?name ?region ?latitude ?longitude WHERE {
        VALUES ?location { ${subjects} }
        ?location a ex:Location ; ex:name ?name .
        OPTIONAL { ?location ex:region ?region }
        OPTIONAL { ?location ex:latitude ?latitude }
        OPTIONAL { ?location ex:longitude ?longitude }
      }`),
    queryBindings(`${PREFIXES}
      SELECT DISTINCT ?location ?sdo WHERE {
        VALUES ?location { ${subjects} }
        ?group ex:location ?location ; ${SDO} ?sdo .
      }`),
  ])
  for (const b of rows) {
    const uri = value(b, 'location')
    const name = value(b, 'name')
    if (!uri || !name) continue
    const latitude = value(b, 'latitude')
    const longitude = value(b, 'longitude')
    locations.set(uri, {
      id: short(uri),
      uri,
      name,
      region: value(b, 'region'),
      latitude: latitude === undefined ? undefined : Number(latitude),
      longitude: longitude === undefined ? undefined : Number(longitude),
      sdos: [],
    })
  }
  for (const b of sdoRows) {
    const uri = value(b, 'location')
    const sdo = value(b, 'sdo')
    const location = uri ? locations.get(uri) : undefined
    if (!location || !sdo || location.sdos.includes(sdo)) continue
    location.sdos.push(sdo)
  }
  for (const location of locations.values()) {
    location.sdos.sort((a, b) => a.localeCompare(b))
  }
  return locations
}

async function localGroupsAt(uri: string): Promise<LocalGroup[]> {
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?group ?name ?description ?sdo ?homepage ?logo WHERE {
      ?group a ex:LocalGroup ; ex:location ${iri(uri)} ; ex:name ?name .
      OPTIONAL { ?group ex:description ?description }
      OPTIONAL { ?group ${SDO} ?sdo }
      OPTIONAL { ?group ex:homepage ?homepage }
      OPTIONAL { ?group ex:logo ?logo }
    }`)
  const groups: LocalGroup[] = []
  for (const b of rows) {
    const groupUri = value(b, 'group')
    const name = value(b, 'name')
    if (!groupUri || !name) continue
    groups.push({
      id: short(groupUri),
      uri: groupUri,
      name,
      description: value(b, 'description'),
      sdo: value(b, 'sdo'),
      homepage: value(b, 'homepage'),
      logo: value(b, 'logo'),
    })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

async function orgsByUris(
  uris: string[],
  full = false,
): Promise<Map<string, Org>> {
  const orgs = new Map<string, Org>()
  if (!uris.length) return orgs
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?org ?name ?homepage ?logo WHERE {
      VALUES ?org { ${uris.map(iri).join(' ')} }
      ?org a ex:Organization ; ex:name ?name .
      OPTIONAL { ?org ex:homepage ?homepage }
      OPTIONAL { ?org ex:logo ?logo }
    }`)
  for (const b of rows) {
    const uri = value(b, 'org')
    const name = value(b, 'name')
    if (!uri || !name) continue
    orgs.set(uri, {
      id: short(uri),
      uri,
      name,
      homepage: value(b, 'homepage'),
      logo: value(b, 'logo'),
      affiliates: [],
      proposedUseCaseUris: [],
    })
  }

  if (full && orgs.size) {
    const subjects = [...orgs.keys()].map(iri).join(' ')
    const [affiliateRows, proposedRows] = await Promise.all([
      queryBindings(`${PREFIXES}
        SELECT ?org ?person ?personName ?personLogo ?personSilo WHERE {
          VALUES ?org { ${subjects} }
          ?person ex:affiliation ?org .
          OPTIONAL { ?person ex:name ?personName }
          OPTIONAL { ?person ex:logo ?personLogo }
          OPTIONAL { ?person ex:siloUsername ?personSilo }
        }`),
      queryBindings(`${PREFIXES}
        SELECT ?org ?uc WHERE {
          VALUES ?org { ${subjects} }
          ?org ex:proposed ?uc .
        }`),
    ])
    for (const b of affiliateRows) {
      const org = value(b, 'org') ? orgs.get(value(b, 'org')!) : undefined
      if (!org) continue
      addSpecContributor(
        org.affiliates,
        toSpecContributor(
          value(b, 'person'),
          value(b, 'personName'),
          value(b, 'personLogo'),
          value(b, 'personSilo'),
        ),
      )
    }
    for (const b of proposedRows) {
      const org = value(b, 'org') ? orgs.get(value(b, 'org')!) : undefined
      const useCase = value(b, 'uc')
      if (!org || !useCase) continue
      if (!org.proposedUseCaseUris.includes(useCase)) {
        org.proposedUseCaseUris.push(useCase)
      }
    }
    for (const org of orgs.values()) {
      org.affiliates.sort((a, b) => a.name.localeCompare(b.name))
    }
  }
  return orgs
}

async function groupSummariesByUris(
  uris: string[],
): Promise<Map<string, GroupSummary>> {
  const groups = new Map<string, GroupSummary>()
  if (!uris.length) return groups
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?group ?name ?w3cApiUrl ?sdo (COUNT(DISTINCT ?member) AS ?count)
    WHERE {
      VALUES ?group { ${uris.map(iri).join(' ')} }
      ?group a ex:Group ; ex:name ?name .
      OPTIONAL { ?group ex:w3cApiUrl ?w3cApiUrl }
      OPTIONAL { ?group ex:sdo ?sdo }
      OPTIONAL { ?group ex:member ?member }
    }
    GROUP BY ?group ?name ?w3cApiUrl ?sdo`)
  for (const b of rows) {
    const uri = value(b, 'group')
    const name = value(b, 'name')
    if (!uri || !name) continue
    const count = value(b, 'count')
    groups.set(uri, {
      id: uri,
      name,
      w3cApiUrl: value(b, 'w3cApiUrl'),
      sdo: value(b, 'sdo'),
      participantCount: count === undefined ? 0 : Number(count),
    })
  }
  return groups
}

async function groupMembers(uri: string): Promise<W3cParticipant[]> {
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?person ?name ?logo ?siloUsername ?siloId WHERE {
      ${iri(uri)} ex:member ?person .
      ?person a ex:Person ; ex:name ?name .
      OPTIONAL { ?person ex:logo ?logo }
      OPTIONAL { ?person ex:siloUsername ?siloUsername }
      OPTIONAL { ?person ex:siloId ?siloId }
    }`)
  const participants = new Map<string, W3cParticipant>()
  for (const b of rows) {
    const personUri = value(b, 'person')
    const name = value(b, 'name')
    if (!personUri || !name) continue
    let participant = participants.get(personUri)
    if (!participant) {
      participant = toW3cParticipant(personUri, name, value(b, 'logo'))
      participants.set(personUri, participant)
    }
    const github = parseGithubUsername(value(b, 'siloUsername'))
    if (github && participant.github === undefined) participant.github = github
    const w3cId = parseSiloId(value(b, 'siloId'), W3C_PERSON_SILO)
    if (w3cId !== undefined && participant.w3cId === undefined) {
      participant.w3cId = w3cId
    }
  }
  return [...participants.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const fetchGroupMembers = (uri: string) => groupMembers(uri)

async function groupFull(uri: string): Promise<W3cGroup | undefined> {
  const [baseRows, participants] = await Promise.all([
    queryBindings(`${PREFIXES}
      SELECT ?name ?w3cApiUrl WHERE {
        ${iri(uri)} a ex:Group ; ex:name ?name .
        OPTIONAL { ${iri(uri)} ex:w3cApiUrl ?w3cApiUrl }
      }
      LIMIT 1`),
    groupMembers(uri),
  ])
  const binding = baseRows[0]
  if (!binding) return undefined
  const name = value(binding, 'name')
  if (!name) return undefined
  return {
    id: uri,
    name,
    w3cApiUrl: value(binding, 'w3cApiUrl'),
    participants,
  }
}

async function groupsOfPerson(uri: string): Promise<GroupSummary[]> {
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?group ?name ?w3cApiUrl ?sdo (COUNT(DISTINCT ?member) AS ?count)
    WHERE {
      ?group a ex:Group ; ex:name ?name ; ex:member ${iri(uri)} .
      OPTIONAL { ?group ex:w3cApiUrl ?w3cApiUrl }
      OPTIONAL { ?group ex:sdo ?sdo }
      OPTIONAL { ?group ex:member ?member }
    }
    GROUP BY ?group ?name ?w3cApiUrl ?sdo`)
  const groups: GroupSummary[] = []
  for (const b of rows) {
    const groupUri = value(b, 'group')
    const name = value(b, 'name')
    if (!groupUri || !name) continue
    const count = value(b, 'count')
    groups.push({
      id: groupUri,
      name,
      w3cApiUrl: value(b, 'w3cApiUrl'),
      sdo: value(b, 'sdo'),
      participantCount: count === undefined ? 0 : Number(count),
    })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

async function groupsDeliveringSpec(uri: string): Promise<GroupSummary[]> {
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?group ?name ?w3cApiUrl ?sdo (COUNT(DISTINCT ?member) AS ?count)
    WHERE {
      ?group a ex:Group ; ex:specification ${iri(uri)} ; ex:name ?name .
      OPTIONAL { ?group ex:w3cApiUrl ?w3cApiUrl }
      OPTIONAL { ?group ex:sdo ?sdo }
      OPTIONAL { ?group ex:member ?member }
    }
    GROUP BY ?group ?name ?w3cApiUrl ?sdo`)
  const groups: GroupSummary[] = []
  for (const b of rows) {
    const groupUri = value(b, 'group')
    const name = value(b, 'name')
    if (!groupUri || !name) continue
    const count = value(b, 'count')
    groups.push({
      id: groupUri,
      name,
      w3cApiUrl: value(b, 'w3cApiUrl'),
      sdo: value(b, 'sdo'),
      participantCount: count === undefined ? 0 : Number(count),
    })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Listing pages
// ---------------------------------------------------------------------------
export async function fetchListingPage(
  kind: ListingKind,
  query: string,
  cursor: ListingCursor | null,
  sdo?: string,
): Promise<ListingPage> {
  const page = await fetchIdPage(kind, query, cursor, PAGE_SIZE[kind], sdo)
  const ids = page.rows.map((row) => row.id)

  const result = (
    data: ListingPage['data'],
  ): ListingPage => ({
    data,
    hasMore: page.hasMore,
    cursor: page.cursor,
    total: page.total,
  })

  switch (kind) {
    case 'people': {
      const people = await peopleByUris(ids)
      return result(
        ids
          .map((id) => people.get(id))
          .filter((person): person is Person => person !== undefined),
      )
    }
    case 'projects': {
      const projects = await projectsByUris(ids)
      return result(
        ids
          .map((id) => projects.get(id))
          .filter((project): project is Project => project !== undefined),
      )
    }
    case 'software': {
      const software = await softwareByUris(ids)
      return result(
        ids
          .map((id) => software.get(id))
          .filter((entry): entry is Software => entry !== undefined),
      )
    }
    case 'specifications': {
      const specs = await specificationsByUris(ids)
      return result(
        ids
          .map((id) => specs.get(id))
          .filter((spec): spec is Specification => spec !== undefined),
      )
    }
    case 'useCases': {
      const useCases = await useCasesByUris(ids)
      return result(
        ids
          .map((id) => useCases.get(id))
          .filter((useCase): useCase is UseCase => useCase !== undefined),
      )
    }
    case 'orgs': {
      const orgs = await orgsByUris(ids)
      return result(
        ids
          .map((id) => orgs.get(id))
          .filter((org): org is Org => org !== undefined),
      )
    }
    case 'groups': {
      const groups = await groupSummariesByUris(ids)
      return result(
        ids
          .map((id) => groups.get(id))
          .filter((group): group is GroupSummary => group !== undefined),
      )
    }
    case 'events': {
      const events = await eventsByUris(ids)
      return result(
        ids
          .map((id) => events.get(id))
          .filter((event): event is Event => event !== undefined),
      )
    }
    case 'locations': {
      const locations = await locationsByUris(ids)
      return result(
        ids
          .map((id) => locations.get(id))
          .filter((location): location is Location => location !== undefined),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// URI resolution and targeted detail loads
// ---------------------------------------------------------------------------
const shortIdFilter = (id: string, person = false) => {
  const clauses = [
    `STR(?s) = ${lit(id)}`,
    `STR(?s) = ${lit(`urn:uuid:${id}`)}`,
    `STRENDS(STR(?s), ${lit(`/${id}`)})`,
    `STRENDS(STR(?s), ${lit(`/${id}/`)})`,
    `STRENDS(STR(?s), ${lit(`#${id}`)})`,
  ]
  if (person) clauses.push(`STR(?s) = ${lit(`urn:w3c:person:${id}`)}`)
  return `(${clauses.join(' || ')})`
}

async function resolveSubject(
  kind:
    | 'person'
    | 'project'
    | 'specification'
    | 'software'
    | 'org'
    | 'useCase'
    | 'location',
  id: string,
  sdo?: string,
): Promise<string | undefined> {
  const body = {
    person: `?s a ex:Person .`,
    project: `?s a ex:Organization ; ex:subType ?subType .
      FILTER (?subType = tax:OpenSourceProject || ?subType = tax:UniversityProject)`,
    specification: `?s a ex:Specification .`,
    software: `{ ?s a doap:Project } UNION { ?s a ex:Software }`,
    org: `?s a ex:Organization .
      FILTER NOT EXISTS { ?s ex:subType ?subType }`,
    useCase: `?s a ex:UseCase .`,
    location: `?s a ex:Location .`,
  }[kind]
  const scoped =
    sdo && (kind === 'specification' || kind === 'useCase')
      ? `?s ${SDO} ${iri(sdo)} .`
      : ''
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?s WHERE {
      ${body}
      ${scoped}
      FILTER (${shortIdFilter(id, kind === 'person')})
    }
    LIMIT 1`)
  return rows[0] ? value(rows[0], 's') : undefined
}

async function resolveGroup(
  id: string,
  sdo?: string,
): Promise<string | undefined> {
  const scoped = sdo ? `?s ${SDO} ${iri(sdo)} .` : ''
  const rows = await queryBindings(`${PREFIXES}
    SELECT ?s WHERE {
      ?s a ex:Group .
      ${scoped}
      FILTER (STR(?s) = ${lit(id)})
    }
    LIMIT 1`)
  if (rows[0]) return value(rows[0], 's')

  // Legacy numeric W3C group links from before groups used full URLs.
  const groupId = Number(id)
  if (!Number.isInteger(groupId)) return undefined
  const candidates = W3C_GROUP_SILO.map((prefix) => `STR(?siloId) = ${lit(`${prefix}${groupId}`)}`)
  const legacy = await queryBindings(`${PREFIXES}
    SELECT ?s WHERE {
      ?s a ex:Group ; ex:siloId ?siloId .
      FILTER (${candidates.join(' || ')})
    }
    LIMIT 1`)
  return legacy[0] ? value(legacy[0], 's') : undefined
}

async function personDetail(id: string) {
  const uri = await resolveSubject('person', id)
  if (!uri) return undefined

  const [people, specLinks, groupRows, softwareUris] = await Promise.all([
    peopleByUris([uri]),
    queryBindings(`${PREFIXES}
      SELECT ?spec ?predicate WHERE {
        VALUES ?predicate { dcterms:creator bibo:editor }
        ?spec ?predicate ${iri(uri)} .
        ?spec a ex:Specification .
      }`),
    groupsOfPerson(uri),
    queryBindings(`${PREFIXES}
      SELECT DISTINCT ?sw WHERE {
        ?sw doap:maintainer ${iri(uri)} .
        { ?sw a doap:Project } UNION { ?sw a ex:Software }
      }`),
  ])

  const person = people.get(uri)
  if (!person) return undefined

  const authored: string[] = []
  const edited: string[] = []
  for (const b of specLinks) {
    const spec = value(b, 'spec')
    if (!spec) continue
    if (value(b, 'predicate') === `${DCTERMS}creator`) {
      if (!authored.includes(spec)) authored.push(spec)
    } else if (!edited.includes(spec)) {
      edited.push(spec)
    }
  }

  const maintained = softwareUris
    .map((b) => value(b, 'sw'))
    .filter((sw): sw is string => Boolean(sw))

  const [specs, software] = await Promise.all([
    specificationsByUris([...new Set([...authored, ...edited])]),
    softwareByUris(maintained),
  ])

  return {
    kind: 'person' as const,
    person,
    groups: groupRows,
    authored: authored
      .map((spec) => specs.get(spec))
      .filter((spec): spec is Specification => spec !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
    edited: edited
      .map((spec) => specs.get(spec))
      .filter((spec): spec is Specification => spec !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
    software: maintained
      .map((sw) => software.get(sw))
      .filter((entry): entry is Software => entry !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function projectDetail(id: string) {
  const uri = await resolveSubject('project', id)
  if (!uri) return undefined
  const projects = await projectsByUris([uri])
  const project = projects.get(uri)
  if (!project) return undefined
  return { kind: 'project' as const, project }
}

async function specificationDetail(id: string, sdo?: string) {
  const uri = await resolveSubject('specification', id, sdo)
  if (!uri) return undefined

  const [specs, outgoing, groups, softwareUris, useCaseUris] = await Promise.all([
    specificationsByUris([uri]),
    outgoingReferences([uri]),
    groupsDeliveringSpec(uri),
    queryBindings(`${PREFIXES}
      SELECT DISTINCT ?sw WHERE {
        ?sw doap:implements ${iri(uri)} .
        { ?sw a doap:Project } UNION { ?sw a ex:Software }
      }`),
    queryBindings(`${PREFIXES}
      SELECT DISTINCT ?uc WHERE {
        ?uc a ex:UseCase ; ex:useCaseOf ${iri(uri)} .
      }`),
  ])

  const spec = specs.get(uri)
  if (!spec) return undefined
  spec.references = outgoing[uri] ?? []
  spec.citedBy = await incomingReferences(uri)

  const softwareUrisList = softwareUris
    .map((b) => value(b, 'sw'))
    .filter((sw): sw is string => Boolean(sw))
  const useCaseUrisList = useCaseUris
    .map((b) => value(b, 'uc'))
    .filter((uc): uc is string => Boolean(uc))

  const [software, useCases] = await Promise.all([
    softwareByUris(softwareUrisList),
    useCasesByUris(useCaseUrisList),
  ])

  // Prefer the groups discovered through ex:specification; fall back to the
  // names captured while hydrating the specification for older records.
  const publishedBy =
    groups.length > 0
      ? groups
      : spec.groups.map((name) => ({ name }))

  return {
    kind: 'specification' as const,
    spec,
    groups: publishedBy,
    software: softwareUrisList
      .map((sw) => software.get(sw))
      .filter((entry): entry is Software => entry !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
    useCases: useCaseUrisList
      .map((uc) => useCases.get(uc))
      .filter((useCase): useCase is UseCase => useCase !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function softwareDetail(id: string) {
  const uri = await resolveSubject('software', id)
  if (!uri) return undefined
  const software = await softwareByUris([uri], true)
  const entry = software.get(uri)
  if (!entry) return undefined
  const references = await outgoingReferences(
    entry.implements.map((spec) => spec.uri),
  )
  return { kind: 'software' as const, software: entry, references }
}

async function groupDetail(id: string, sdo?: string) {
  const uri = await resolveGroup(id, sdo)
  if (!uri) return undefined
  const group = await groupFull(uri)
  if (!group) return undefined
  const specRows = await queryBindings(`${PREFIXES}
    SELECT DISTINCT ?spec WHERE {
      ${iri(uri)} ex:specification ?spec .
      ?spec a ex:Specification .
    }`)
  const specUris = specRows
    .map((b) => value(b, 'spec'))
    .filter((spec): spec is string => Boolean(spec))
  const specs = await specificationsByUris(specUris)
  return {
    kind: 'group' as const,
    group,
    specifications: specUris
      .map((spec) => specs.get(spec))
      .filter((spec): spec is Specification => spec !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function orgDetail(id: string) {
  const uri = await resolveSubject('org', id)
  if (!uri) return undefined
  const orgs = await orgsByUris([uri], true)
  const org = orgs.get(uri)
  if (!org) return undefined
  const useCases = await useCasesByUris(org.proposedUseCaseUris)
  return {
    kind: 'org' as const,
    org,
    proposed: org.proposedUseCaseUris.map((ucUri) => ({
      uri: ucUri,
      useCase: useCases.get(ucUri),
    })),
  }
}

async function useCaseDetail(id: string, sdo?: string) {
  const uri = await resolveSubject('useCase', id, sdo)
  if (!uri) return undefined
  const useCases = await useCasesByUris([uri])
  const useCase = useCases.get(uri)
  if (!useCase) return undefined

  const [orgRows, specs] = await Promise.all([
    queryBindings(`${PREFIXES}
      SELECT DISTINCT ?org WHERE {
        ?org a ex:Organization ; ex:proposed ${iri(uri)} .
      }`),
    specificationsByUris(useCase.specificationUris),
  ])
  const orgUris = orgRows
    .map((b) => value(b, 'org'))
    .filter((org): org is string => Boolean(org))
  const orgs = await orgsByUris(orgUris)

  return {
    kind: 'useCase' as const,
    useCase,
    orgs: orgUris
      .map((orgUri) => orgs.get(orgUri))
      .filter((org): org is Org => org !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
    specifications: useCase.specificationUris.map((specUri) => ({
      uri: specUri,
      spec: specs.get(specUri),
    })),
  }
}

async function locationDetail(id: string) {
  const uri = await resolveSubject('location', id)
  if (!uri) return undefined
  const [locations, groups] = await Promise.all([
    locationsByUris([uri]),
    localGroupsAt(uri),
  ])
  const location = locations.get(uri)
  if (!location) return undefined
  return { kind: 'location' as const, location, groups }
}

export type DetailResult =
  | Awaited<ReturnType<typeof personDetail>>
  | Awaited<ReturnType<typeof projectDetail>>
  | Awaited<ReturnType<typeof specificationDetail>>
  | Awaited<ReturnType<typeof softwareDetail>>
  | Awaited<ReturnType<typeof groupDetail>>
  | Awaited<ReturnType<typeof orgDetail>>
  | Awaited<ReturnType<typeof useCaseDetail>>
  | Awaited<ReturnType<typeof locationDetail>>

export async function fetchDetail(
  kind: DetailKind,
  id: string,
  sdo?: string,
): Promise<DetailResult> {
  switch (kind) {
    case 'person':
      return personDetail(id)
    case 'project':
      return projectDetail(id)
    case 'specification':
      return specificationDetail(id, sdo)
    case 'software':
      return softwareDetail(id)
    case 'group':
      return groupDetail(id, sdo)
    case 'org':
      return orgDetail(id)
    case 'useCase':
      return useCaseDetail(id, sdo)
    case 'location':
      return locationDetail(id)
  }
}
