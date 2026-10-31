/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { SparqlEndpointFetcher, type IBindings } from 'fetch-sparql-endpoint'
import type {
  AppState,
  Command,
  Person,
  Project,
  SliceUpdate,
  Software,
  SpecContributor,
  SpecReference,
  Specification,
  Org,
  UseCase,
  W3cGroup,
  W3cParticipant,
} from './protocol'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
  software: { status: 'idle', data: [] },
  useCases: { status: 'idle', data: [] },
  orgs: { status: 'idle', data: [] },
  specifications: { status: 'idle', data: [] },
  w3cGroups: {
    status: 'idle',
    data: { groups: [], selected: [], common: [] },
  },
}

const emit = (u: SliceUpdate) => self.postMessage(u)

// ---------------------------------------------------------------------------
// SPARQL endpoint
// ---------------------------------------------------------------------------
// The catalog is served by Apache Fuseki on the hackers4peace VPS, so the UI
// queries it directly instead of downloading the (previously public/dump.nq)
// snapshot. This is the public, read-only query endpoint proxied by Caddy;
// writes go through an SSH tunnel (see scripts/fuseki.ts). VITE_SPARQL_ENDPOINT
// overrides the endpoint for local or preview builds.
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

// Drain a result stream into an array; the handlers below then process rows
// synchronously (the fetcher returns a Node-style readable stream).
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
// The catalog uses the local `ex:` namespace (http://example.org#).
const EX = 'http://example.org#'
const TAX = 'https://solidproject.solidcommunity.net/catalog/taxonomy#'
// Software is described in DOAP; `ex:` entries are still read during the
// migration so the older catalog records keep showing up.
const DOAP = 'http://usefulinc.com/ns/doap#'

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

// Groups and people both use ex:siloId "w3c:<numeric id>" for the stable W3C
// identifier; ex:w3cApiUrl keeps the opaque API self link.
const W3C_SILO_PREFIX = 'w3c:'

const parseW3cId = (siloId: string | undefined): number | undefined => {
  if (!siloId?.startsWith(W3C_SILO_PREFIX)) return undefined
  const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
  return Number.isInteger(id) ? id : undefined
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
  // Everyone binds once per logo/siloId/siloUsername, so fold the rows.
  fields: { handle?: string; logo?: string; github?: string } = {},
): Person => ({
  id: short(uri),
  uri,
  name,
  handle: fields.handle,
  github: fields.github,
  avatarUrl: fields.logo ?? robohash(short(uri)),
})

async function sparqlPeople(): Promise<Person[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?id ?name ?handle ?logo ?siloUsername ?siloId WHERE {
       ?id a ex:Person ; ex:name ?name .
       OPTIONAL { ?id ex:forumHandle ?handle }
       OPTIONAL { ?id ex:logo ?logo }
       OPTIONAL { ?id ex:siloUsername ?siloUsername }
       OPTIONAL { ?id ex:siloId ?siloId }
     }`,
  )
  const people = new Map<string, Person>()
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
    const w3cId = parseW3cId(value(b, 'siloId'))
    if (w3cId !== undefined && person.w3cId === undefined) person.w3cId = w3cId
  }
  return [...people.values()]
}

async function sparqlProjects(): Promise<Project[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     PREFIX tax: <${TAX}>
     SELECT ?id ?name ?description ?member WHERE {
       ?id a ex:Organization ; ex:name ?name ; ex:subType ?subType .
       FILTER (?subType = tax:OpenSourceProject || ?subType = tax:UniversityProject)
       OPTIONAL { ?id ex:description ?description }
       OPTIONAL { ?id ex:member ?member }
     }`,
  )
  // Gather members per project
  const map = new Map<string, Project>()
  for (const b of rows) {
    const id = value(b, 'id')
    if (!id) continue
    const shortId = short(id)
    if (!map.has(shortId)) {
      map.set(shortId, {
        id: shortId,
        uri: id,
        name: value(b, 'name') ?? '',
        description: value(b, 'description') ?? '',
        memberIds: [],
      })
    }
    const member = value(b, 'member')
    if (member) {
      const p = map.get(shortId)!
      const shortMember = short(member)
      if (!p.memberIds.includes(shortMember)) p.memberIds.push(shortMember)
    }
  }
  return [...map.values()]
}

async function sparqlSoftware(): Promise<Software[]> {
  // DOAP projects (the LWS implementations) plus any catalog ex:Software, with
  // their languages, maintainers, implemented specs and dependency edges.
  // Dependency targets are resolved to names below, once every project is known.
  const [rows, edgeRows] = await Promise.all([
    queryBindings(
      `PREFIX doap: <${DOAP}>
       PREFIX ex: <${EX}>
       SELECT ?s ?name ?description ?language ?license ?homepage ?repo ?repoLocation
              ?docs ?maintainer ?maintainerName ?maintainerLogo ?maintainerSiloUsername
              ?spec ?specName ?specShortname ?specLandingPage WHERE {
         { ?s a doap:Project } UNION { ?s a ex:Software }
         { ?s doap:name ?name } UNION { ?s ex:name ?name }
         OPTIONAL {
           { ?s doap:shortdesc ?description }
           UNION { ?s doap:description ?description }
         }
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
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?s ?dep WHERE {
         ?s ex:hasDependencyOn ?dep
       }`,
    ),
  ])
  const map = new Map<string, Software>()
  for (const b of rows) {
    const uri = value(b, 's')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let sw = map.get(uri)
    if (!sw) {
      sw = {
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
      map.set(uri, sw)
    }
    const language = value(b, 'language')
    if (language && !sw.programmingLanguages.includes(language)) {
      sw.programmingLanguages.push(language)
    }
    const maintainer = toSpecContributor(
      value(b, 'maintainer'),
      value(b, 'maintainerName'),
      value(b, 'maintainerLogo'),
      value(b, 'maintainerSiloUsername'),
    )
    if (
      maintainer &&
      !sw.maintainers.some(
        (m) => (m.uri ?? m.name) === (maintainer.uri ?? maintainer.name),
      )
    ) {
      sw.maintainers.push(maintainer)
    }
    const spec = value(b, 'spec')
    if (spec && !sw.implements.some((s) => s.uri === spec)) {
      sw.implements.push({
        uri: spec,
        id: short(spec),
        name: value(b, 'specName') ?? short(spec),
        shortname: value(b, 'specShortname'),
        landingPage: value(b, 'specLandingPage'),
      })
    }
  }
  for (const b of edgeRows) {
    const uri = value(b, 's')
    const dep = value(b, 'dep')
    const sw = uri ? map.get(uri) : undefined
    if (!sw || !dep) continue
    if (sw.dependencies.some((d) => d.uri === dep)) continue
    // Keep the URI: the detail page resolves it to the dependency's own
    // doap:implements targets when a specification is pinned.
    sw.dependencies.push({
      uri: dep,
      id: short(dep),
      name: map.get(dep)?.name ?? short(dep),
    })
  }
  // Mirror the edges so a project can also list who depends on it; every
  // dependency target is a project row too, so both ends are already in `map`.
  for (const sw of map.values()) {
    for (const dep of sw.dependencies) {
      const target = map.get(dep.uri)
      if (!target || target.dependents.some((d) => d.uri === sw.uri)) continue
      target.dependents.push({ uri: sw.uri, id: sw.id, name: sw.name })
    }
  }
  for (const sw of map.values()) {
    sw.dependencies.sort((a, b) => a.name.localeCompare(b.name))
    sw.dependents.sort((a, b) => a.name.localeCompare(b.name))
    sw.maintainers.sort((a, b) => a.name.localeCompare(b.name))
    sw.implements.sort((a, b) => a.name.localeCompare(b.name))
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function sparqlUseCases(): Promise<UseCase[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?uc ?name ?description ?spec WHERE {
       ?uc a ex:UseCase ; ex:name ?name .
       OPTIONAL { ?uc ex:description ?description }
       OPTIONAL { ?uc ex:useCaseOf ?spec }
     }`,
  )
  const useCases = new Map<string, UseCase>()
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
        specificationUris: [],
      }
      useCases.set(uri, useCase)
    }
    const spec = value(b, 'spec')
    if (spec && !useCase.specificationUris.includes(spec)) {
      useCase.specificationUris.push(spec)
    }
  }
  return [...useCases.values()].sort((a, b) => a.name.localeCompare(b.name))
}

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

async function sparqlOrgs(): Promise<Org[]> {
  // Organizations that are neither W3C groups (siloId) nor project-like
  // catalog orgs (subType). Affiliates and proposed use cases are both
  // optional so an org with only one of the two still appears.
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?org ?name ?homepage ?logo ?person ?personName ?personLogo ?personSilo ?uc WHERE {
       ?org a ex:Organization ; ex:name ?name .
       FILTER NOT EXISTS { ?org ex:siloId ?siloId }
       FILTER NOT EXISTS { ?org ex:subType ?subType }
       OPTIONAL { ?org ex:homepage ?homepage }
       OPTIONAL { ?org ex:logo ?logo }
       OPTIONAL {
         ?person ex:affiliation ?org .
         OPTIONAL { ?person ex:name ?personName }
         OPTIONAL { ?person ex:logo ?personLogo }
         OPTIONAL { ?person ex:siloUsername ?personSilo }
       }
       OPTIONAL { ?org ex:proposed ?uc }
     }`,
  )
  const orgs = new Map<string, Org>()
  for (const b of rows) {
    const uri = value(b, 'org')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let org = orgs.get(uri)
    if (!org) {
      org = {
        id: short(uri),
        uri,
        name,
        homepage: value(b, 'homepage'),
        logo: value(b, 'logo'),
        affiliates: [],
        proposedUseCaseUris: [],
      }
      orgs.set(uri, org)
    }
    addSpecContributor(
      org.affiliates,
      toSpecContributor(
        value(b, 'person'),
        value(b, 'personName'),
        value(b, 'personLogo'),
        value(b, 'personSilo'),
      ),
    )
    const useCase = value(b, 'uc')
    if (useCase && !org.proposedUseCaseUris.includes(useCase)) {
      org.proposedUseCaseUris.push(useCase)
    }
  }
  for (const org of orgs.values()) {
    org.affiliates.sort((a, b) => a.name.localeCompare(b.name))
  }
  return [...orgs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function sparqlSpecifications(): Promise<Specification[]> {
  const [rows, outgoingRows, incomingRows] = await Promise.all([
    queryBindings(
      `PREFIX ex: <${EX}>
       PREFIX dcterms: <http://purl.org/dc/terms/>
       PREFIX bibo: <http://purl.org/ontology/bibo/>
       SELECT ?spec ?name ?shortname ?landingPage ?editorDraft ?group ?groupName ?w3cApiUrl
              ?author ?authorName ?authorLogo ?authorSilo
              ?editor ?editorName ?editorLogo ?editorSilo WHERE {
         ?spec a ex:Specification ; ex:name ?name .
         OPTIONAL { ?spec ex:shortname ?shortname }
         OPTIONAL { ?spec ex:landingPage ?landingPage }
         OPTIONAL { ?spec ex:editorDraft ?editorDraft }
         OPTIONAL { ?spec ex:w3cApiUrl ?w3cApiUrl }
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
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?spec ?target ?targetName ?targetShortname ?predicate WHERE {
         VALUES ?predicate { ex:normativeRef ex:informativeRef }
         ?spec ?predicate ?target .
         ?target a ex:Specification .
         OPTIONAL { ?target ex:name ?targetName }
         OPTIONAL { ?target ex:shortname ?targetShortname }
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?spec ?source ?sourceName ?sourceShortname ?predicate WHERE {
         VALUES ?predicate { ex:normativeRef ex:informativeRef }
         ?source ?predicate ?spec .
         ?spec a ex:Specification .
         ?source a ex:Specification .
         OPTIONAL { ?source ex:name ?sourceName }
         OPTIONAL { ?source ex:shortname ?sourceShortname }
       }`,
    ),
  ])

  // Merge the two citation directions by spec and target. A target can be both
  // normative and informative, so the flags are not exclusive.
  type SpecReferenceIndex = Map<string, Map<string, SpecReference>>
  const referencesBySpec: SpecReferenceIndex = new Map()
  const citedByBySpec: SpecReferenceIndex = new Map()

  const addSpecReference = (
    index: SpecReferenceIndex,
    specUri: string,
    otherUri: string,
    otherName: string | undefined,
    otherShortname: string | undefined,
    predicate: string | undefined,
  ) => {
    if (!predicate) return
    let references = index.get(specUri)
    if (!references) {
      references = new Map()
      index.set(specUri, references)
    }
    let reference = references.get(otherUri)
    if (!reference) {
      reference = {
        id: short(otherUri),
        uri: otherUri,
        name: otherName ?? short(otherUri),
        ...(otherShortname ? { shortname: otherShortname } : {}),
        normative: false,
        informative: false,
      }
      references.set(otherUri, reference)
    }
    if (predicate === `${EX}normativeRef`) reference.normative = true
    if (predicate === `${EX}informativeRef`) reference.informative = true
  }

  for (const b of outgoingRows) {
    const spec = value(b, 'spec')
    const target = value(b, 'target')
    if (!spec || !target) continue
    addSpecReference(
      referencesBySpec,
      spec,
      target,
      value(b, 'targetName'),
      value(b, 'targetShortname'),
      value(b, 'predicate'),
    )
  }
  for (const b of incomingRows) {
    const spec = value(b, 'spec')
    const source = value(b, 'source')
    if (!spec || !source) continue
    addSpecReference(
      citedByBySpec,
      spec,
      source,
      value(b, 'sourceName'),
      value(b, 'sourceShortname'),
      value(b, 'predicate'),
    )
  }

  // Normative first, then informative, then (should not happen) unflagged.
  // A target that is both keeps its place in the normative group and shows
  // both icons.
  const citationRank = (reference: SpecReference) =>
    reference.normative ? 0 : reference.informative ? 1 : 2
  const sortedReferences = (index: SpecReferenceIndex, uri: string) =>
    [...(index.get(uri)?.values() ?? [])].sort(
      (a, b) =>
        citationRank(a) - citationRank(b) || a.name.localeCompare(b.name),
    )

  const specs = new Map<string, Specification>()
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
        w3cApiUrl: value(b, 'w3cApiUrl'),
        references: [],
        citedBy: [],
      }
      specs.set(uri, spec)
    }
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
    if (group && !spec.groupUris.includes(group)) {
      spec.groupUris.push(group)
    }
    const groupName = value(b, 'groupName')
    if (groupName && !spec.groups.includes(groupName)) {
      spec.groups.push(groupName)
    }
  }
  for (const spec of specs.values()) {
    spec.authors.sort((a, b) => a.name.localeCompare(b.name))
    spec.editors.sort((a, b) => a.name.localeCompare(b.name))
    spec.groups.sort((a, b) => a.localeCompare(b))
    spec.groupUris.sort((a, b) => a.localeCompare(b))
    spec.references = sortedReferences(referencesBySpec, spec.uri)
    spec.citedBy = sortedReferences(citedByBySpec, spec.uri)
  }
  return [...specs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// W3C groups
// ---------------------------------------------------------------------------
// The W3C API workflow (typescript/src/w3c-api) writes the groups and their
// participants into the catalog dump, so this worker only queries it. Groups
// carry the W3C group id as ex:siloId "w3c:<group id>", participants are
// ex:Person records linked from their group with ex:member; the same siloId
// carries each participant's stable W3C user id.
const toW3cParticipant = (
  uri: string,
  name: string,
  logo?: string,
): W3cParticipant => ({
  uri,
  name,
  avatarUrl: logo ?? robohash(short(uri)),
})

async function sparqlW3cGroups(): Promise<W3cGroup[]> {
  const groups = new Map<string, W3cGroup>()
  const [groupRows, memberRows] = await Promise.all([
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?uri ?name ?siloId ?w3cApiUrl WHERE {
         ?uri a ex:Organization ; ex:name ?name ; ex:siloId ?siloId .
         FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
         OPTIONAL { ?uri ex:w3cApiUrl ?w3cApiUrl }
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?group ?person ?name ?logo ?siloUsername ?siloId WHERE {
         ?group a ex:Organization ; ex:siloId ?groupSiloId ; ex:member ?person .
         FILTER (STRSTARTS(STR(?groupSiloId), "${W3C_SILO_PREFIX}"))
         ?person a ex:Person ; ex:name ?name .
         OPTIONAL { ?person ex:logo ?logo }
         OPTIONAL { ?person ex:siloUsername ?siloUsername }
         OPTIONAL { ?person ex:siloId ?siloId }
       }`,
    ),
  ])
  for (const b of groupRows) {
    const uri = value(b, 'uri')
    const name = value(b, 'name')
    const siloId = value(b, 'siloId')
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.set(uri, {
      id,
      uri,
      name,
      w3cApiUrl: value(b, 'w3cApiUrl'),
      participants: [],
    })
  }

  // A participant binds once per logo/siloId, so fold the rows per group.
  const participants = new Map<string, W3cParticipant>()
  for (const b of memberRows) {
    const groupUri = value(b, 'group')
    const person = value(b, 'person')
    const name = value(b, 'name')
    const group = groupUri ? groups.get(groupUri) : undefined
    if (!group || !groupUri || !person || !name) continue
    const key = `${groupUri}\n${person}`
    let participant = participants.get(key)
    if (!participant) {
      participant = toW3cParticipant(person, name, value(b, 'logo'))
      participants.set(key, participant)
      group.participants.push(participant)
    }
    const github = parseGithubUsername(value(b, 'siloUsername'))
    if (github && participant.github === undefined) participant.github = github
    const w3cId = parseW3cId(value(b, 'siloId'))
    if (w3cId !== undefined && participant.w3cId === undefined)
      participant.w3cId = w3cId
  }

  for (const group of groups.values()) {
    group.participants.sort((a, b) => a.name.localeCompare(b.name))
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Intersection of every selected group's participant list. With fewer than two
// groups there is no intersection; the view shows the single group instead.
function commonParticipants(
  groups: W3cGroup[],
  selected: number[],
): W3cParticipant[] {
  const chosen = groups.filter((g) => selected.includes(g.id))
  if (chosen.length < 2) return []
  const commonUris = chosen
    .map((g) => new Set(g.participants.map((p) => p.uri)))
    .reduce((a, b) => a.intersection(b))
  return chosen[0].participants
    .filter((p) => commonUris.has(p.uri))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function loadPeople() {
  if (state.people.status === 'loading') return
  state.people = { status: 'loading', data: state.people.data }
  emit({ key: 'people', value: state.people })
  try {
    const data = await sparqlPeople()
    state.people = { status: 'ready', data }
  } catch (e) {
    state.people = { status: 'error', data: state.people.data, error: String(e) }
  }
  emit({ key: 'people', value: state.people })
}

async function loadProjects() {
  if (state.projects.status === 'loading') return
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    const data = await sparqlProjects()
    state.projects = { status: 'ready', data }
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
  }
  emit({ key: 'projects', value: state.projects })
}

async function loadSoftware() {
  if (state.software.status === 'loading') return
  state.software = { status: 'loading', data: state.software.data }
  emit({ key: 'software', value: state.software })
  try {
    const data = await sparqlSoftware()
    state.software = { status: 'ready', data }
  } catch (e) {
    state.software = {
      status: 'error',
      data: state.software.data,
      error: String(e),
    }
  }
  emit({ key: 'software', value: state.software })
}

async function loadUseCases() {
  if (state.useCases.status === 'loading') return
  state.useCases = { status: 'loading', data: state.useCases.data }
  emit({ key: 'useCases', value: state.useCases })
  try {
    const data = await sparqlUseCases()
    state.useCases = { status: 'ready', data }
  } catch (e) {
    state.useCases = {
      status: 'error',
      data: state.useCases.data,
      error: String(e),
    }
  }
  emit({ key: 'useCases', value: state.useCases })
}

async function loadOrgs() {
  if (state.orgs.status === 'loading') return
  state.orgs = { status: 'loading', data: state.orgs.data }
  emit({ key: 'orgs', value: state.orgs })
  try {
    const data = await sparqlOrgs()
    state.orgs = { status: 'ready', data }
  } catch (e) {
    state.orgs = {
      status: 'error',
      data: state.orgs.data,
      error: String(e),
    }
  }
  emit({ key: 'orgs', value: state.orgs })
}

async function loadSpecifications() {
  if (state.specifications.status === 'loading') return
  state.specifications = {
    status: 'loading',
    data: state.specifications.data,
  }
  emit({ key: 'specifications', value: state.specifications })
  try {
    const data = await sparqlSpecifications()
    state.specifications = { status: 'ready', data }
  } catch (e) {
    state.specifications = {
      status: 'error',
      data: state.specifications.data,
      error: String(e),
    }
  }
  emit({ key: 'specifications', value: state.specifications })
}

async function loadW3cGroups() {
  if (state.w3cGroups.status === 'loading') return
  state.w3cGroups = { status: 'loading', data: state.w3cGroups.data }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
  try {
    const groups = await sparqlW3cGroups()
    // Load with no groups selected; the checkboxes drive the comparison.
    const selected: number[] = []
    state.w3cGroups = {
      status: 'ready',
      data: { groups, selected, common: commonParticipants(groups, selected) },
    }
  } catch (e) {
    state.w3cGroups = {
      status: 'error',
      data: state.w3cGroups.data,
      error: String(e),
    }
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
}

// The participants are already in the dump, so selecting a group only
// recomputes the intersection — no async work, no stale-write races.
function toggleW3cGroup(id: number) {
  const data = state.w3cGroups.data
  if (!data.groups.some((g) => g.id === id)) return
  const selected = data.selected.includes(id)
    ? data.selected.filter((x) => x !== id)
    : [...data.selected, id]
  state.w3cGroups = {
    status: 'ready',
    data: {
      ...data,
      selected,
      common: commonParticipants(data.groups, selected),
    },
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
}

async function loadProject(id: string) {
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    // Prefer an already-loaded record: exact short-id match on the current
    // slice (keeps the full list intact when navigating from /projects).
    const known = state.projects.data.find(
      (p) => p.id === id || p.uri === `urn:uuid:${id}`,
    )
    let project: Project | undefined = known
      ? { ...known, memberIds: [] }
      : undefined

    if (!project) {
      // Resolve the catalog URI from the short id: urn:uuid:<id>, https://<id>,
      // or any URI ending in /<id> or #<id>.
      const rows = await queryBindings(
        `PREFIX ex: <${EX}>
         SELECT ?id ?name ?description WHERE {
           ?id a ex:Organization .
           FILTER (
             STR(?id) = "urn:uuid:${id}"
             || STR(?id) = "https://${id}"
             || STRENDS(STR(?id), "/${id}")
             || STRENDS(STR(?id), "#${id}")
           )
           OPTIONAL { ?id ex:name ?name }
           OPTIONAL { ?id ex:description ?description }
         }
         LIMIT 1`,
      )
      for (const b of rows) {
        const uri = value(b, 'id')
        if (!uri) continue
        project = {
          id: short(uri),
          uri,
          name: value(b, 'name') ?? '',
          description: value(b, 'description') ?? '',
          memberIds: [],
        }
        break
      }
    }

    if (project) {
      const memberIds: string[] = []
      const memberUris: string[] = []
      const memberRows = await queryBindings(
        `PREFIX ex: <${EX}>
         SELECT ?member WHERE { <${project.uri}> ex:member ?member }`,
      )
      for (const b of memberRows) {
        const member = value(b, 'member')
        if (member) {
          const shortMember = short(member)
          if (!memberIds.includes(shortMember)) {
            memberIds.push(shortMember)
            memberUris.push(member)
          }
        }
      }
      project.memberIds = memberIds

      // Keep the full list when we already had it; otherwise the resolved
      // record is the slice (direct navigation to a detail page).
      const data = known
        ? state.projects.data.map((p) =>
            p.id === project!.id ? project! : p,
          )
        : [project]
      state.projects = { status: 'ready', data }
      emit({ key: 'projects', value: state.projects })

      // Load associated member people
      if (memberUris.length) {
        const values = memberUris.map((uri) => `<${uri}>`).join(' ')
        const peopleRows = await queryBindings(
          `PREFIX ex: <${EX}>
           SELECT ?id ?name ?handle ?siloUsername ?siloId WHERE {
             VALUES ?id { ${values} }
             ?id a ex:Person ; ex:name ?name .
             OPTIONAL { ?id ex:forumHandle ?handle }
             OPTIONAL { ?id ex:siloUsername ?siloUsername }
             OPTIONAL { ?id ex:siloId ?siloId }
           }`,
        )
        const members = new Map<string, Person>()
        for (const b of peopleRows) {
          const pid = value(b, 'id')
          const pname = value(b, 'name')
          if (!pid || !pname) continue
          let person = members.get(pid)
          if (!person) {
            person = toPerson(pid, pname, { handle: value(b, 'handle') })
            members.set(pid, person)
          }
          const github = parseGithubUsername(value(b, 'siloUsername'))
          if (github && person.github === undefined) person.github = github
          const w3cId = parseW3cId(value(b, 'siloId'))
          if (w3cId !== undefined && person.w3cId === undefined)
            person.w3cId = w3cId
        }
        state.people = { status: 'ready', data: [...members.values()] }
        emit({ key: 'people', value: state.people })
      }
    }
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
    emit({ key: 'projects', value: state.projects })
  }
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------
self.onmessage = (e: MessageEvent<Command>) => {
  switch (e.data.type) {
    case 'loadPeople':
      loadPeople()
      break
    case 'loadProjects':
      loadProjects()
      break
    case 'loadProject':
      loadProject(e.data.id)
      break
    case 'loadSoftware':
      loadSoftware()
      break
    case 'loadUseCases':
      loadUseCases()
      break
    case 'loadOrgs':
      loadOrgs()
      break
    case 'loadSpecifications':
      loadSpecifications()
      break
    case 'loadW3cGroups':
      loadW3cGroups()
      break
    case 'toggleW3cGroup':
      toggleW3cGroup(e.data.id)
      break
  }
}