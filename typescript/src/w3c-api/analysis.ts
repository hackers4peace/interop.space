// Pure helpers for the W3C API workflow: read the seed graph (the previous
// dump or a generated start record), find the people whose W3C memberships
// should be fetched, and turn API group participants into catalog RDF. The
// catalog's own vocabulary is reused (ex:Group, ex:Organization, ex:Person,
// ex:name, ex:siloId, ex:member) so the UI queries W3C data like any other
// catalog data.
import { DataFactory, Parser, Store, Writer } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import { EX, RDF_TYPE } from '../software-dependencies/analysis.ts'
import type { Quad } from 'n3'
import { canonicalW3cId } from './person-ids.ts'
import { resolvePerson } from './identity.ts'
import { W3C_SDO } from './stages.ts'

export const W3C_SILO_PREFIX = 'w3c:'
export const GITHUB_SILO_PREFIX = 'github:'
export const GROUP_CLASS = `${EX}Group`
export const PERSON_TYPE = `${EX}Person`
export const SILO_ID = `${EX}siloId`
export const SILO_USERNAME = `${EX}siloUsername`
export const NAME = `${EX}name`
export const LOGO = `${EX}logo`
export const MEMBER = `${EX}member`
export const SPECIFICATION = `${EX}specification`
export const SPECIFICATION_TYPE = `${EX}Specification`
export const SHORTNAME = `${EX}shortname`
export const LANDING_PAGE = `${EX}landingPage`
export const EDITOR_DRAFT = `${EX}editorDraft`
export const W3C_API_URL = `${EX}w3cApiUrl`
export const W3C_LATEST_VERSION_URL = `${EX}w3cLatestVersionUrl`
export const SDO = `${EX}sdo`
export const GROUP_TYPE = `${EX}type`
export const BIBO_EDITOR = 'http://purl.org/ontology/bibo/editor'

export interface W3cGroupRef {
  /** Canonical public IRI: API homepage when available, API self URI otherwise. */
  uri: string
  /** W3C API self link. */
  apiUrl: string
  /** W3C API homepage, when it differs from the API self URI. */
  homepage?: string
  id: number
  name: string
  shortname?: string
  type?: string
}

export interface W3cParticipant {
  /** W3C API user id (the numeric IPP id the catalog stores as "w3c:<id>"). */
  id: number
  /** API user URI; identifies people the seed does not know yet. */
  href: string
  name: string
  /** Profile thumbnail from the API, when the account has one. */
  photo?: string
  /** GitHub numeric id from the user's connected accounts, when linked. */
  githubId?: string
  /** GitHub login from the user's connected accounts, when linked. */
  githubUsername?: string
}

export interface W3cGroupParticipants {
  group: W3cGroupRef
  participants: W3cParticipant[]
}

export interface W3cSpecification {
  /** Public Technical Report URL, used as the catalog subject. */
  uri: string
  /** W3C API self link. */
  apiUrl: string
  title: string
  shortname?: string
  editorDraft?: string
  /** Latest W3C API version URL, the source of the editor list for now. */
  latestVersionUrl?: string
}

export interface W3cEditor {
  /** Numeric W3C user id. */
  id: number
  /** W3C API user self link. */
  href: string
  name: string
  photo?: string
  githubId?: string
  githubUsername?: string
}

export interface W3cSpecificationEditors {
  specification: W3cSpecification
  editors: W3cEditor[]
  /** Set when the editors endpoint failed; the step continues. */
  error?: string
}

/** A person already present in the seed graph. */
export interface W3cPersonRef {
  uri: string
  name: string
}

export interface W3cGroupSpecifications {
  group: W3cGroupRef
  specifications: W3cSpecification[]
}

/**
 * A person in the seed graph the workflow starts from. The GitHub account is
 * the join key: api.w3.org can resolve it to the person's W3C user, which in
 * turn lists the groups they belong to.
 */
export interface W3cAccount {
  /** Person subject in the seed dataset (urn:uuid:… in new dumps). */
  personUri: string
  name: string
  /** GitHub account id from ex:siloId "github:<id>". */
  githubId: string
  /** Numeric W3C user id, when the dataset already carries one. */
  w3cId?: number
  /**
   * True when the seed already links this person to a W3C group. With frozen
   * upstream data we treat "has a group" as "already fetched": the person's
   * full group list is not queried again. This deliberately does not discover
   * groups beyond the ones already in the graph.
   */
  hasW3cGroups: boolean
}

export interface W3cDataset {
  /** People with a GitHub account, i.e. the W3C API entry points. */
  accounts: W3cAccount[]
  /** W3C group ids already represented by an ex:Group record. */
  groupIds: number[]
  /** Local urn:uuid subjects of people already present in the seed graph. */
  knownPersonUris: Set<string>
  /** W3C groups that have no ex:specification link yet. */
  groupsWithoutSpecs: W3cGroupRef[]
  /** Specifications already present in the seed graph. */
  specifications: W3cSpecification[]
  /** People already present in the seed graph, with their display names. */
  people: W3cPersonRef[]
}

/** Person record generated when there is no dump to seed from. */
export interface W3cSeedPerson {
  name: string
  githubId: string
  githubUsername: string
  w3cId: number
  /** W3C API self link, when the API user is known. */
  w3cApiUrl?: string
  logo?: string
}

let engine: QueryEngine | undefined

function queryEngine(): QueryEngine {
  engine ??= new QueryEngine()
  return engine
}

/** Parse an N-Quads document (the seed dataset format) into an N3 store. */
export function parseDataset(nquads: string): Promise<Store> {
  return new Promise((resolve, reject) => {
    const store = new Store()
    new Parser({ format: 'N-Quads' }).parse(nquads, (error, quad) => {
      if (error) {
        reject(error)
      } else if (quad) {
        store.addQuad(quad)
      } else {
        resolve(store)
      }
    })
  })
}

/**
 * People already linked from a W3C group with ex:member. Membership in a
 * non-W3C organization (e.g. a catalog project) does not count.
 */
async function findPeopleWithW3cGroups(store: Store): Promise<Set<string>> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person WHERE {
       ?group <${RDF_TYPE}> <${GROUP_CLASS}> ;
              <${SILO_ID}> ?groupSiloId ;
              <${MEMBER}> ?person .
       FILTER (STRSTARTS(STR(?groupSiloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const people = new Set<string>()
  for await (const binding of bindings) {
    const person = binding.get('person')?.value
    if (person) people.add(person)
  }
  return people
}

/**
 * People the workflow can start from: ex:Person records carrying a GitHub
 * siloId. Other siloIds (e.g. the numeric "w3c:<id>") are collected too so the
 * person can be matched by their stable W3C id.
 */
async function findAccounts(store: Store): Promise<W3cAccount[]> {
  const withGroups = await findPeopleWithW3cGroups(store)
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person ?name ?siloId WHERE {
       ?person <${RDF_TYPE}> <${PERSON_TYPE}> ; <${SILO_ID}> ?siloId .
       OPTIONAL { ?person <${NAME}> ?name }
     }`,
    { sources: [store] },
  )
  const people = new Map<
    string,
    { name?: string; githubId?: string; w3cId?: number }
  >()
  for await (const binding of bindings) {
    const person = binding.get('person')?.value
    const siloId = binding.get('siloId')?.value
    if (!person || !siloId) continue
    let entry = people.get(person)
    if (!entry) {
      entry = {}
      people.set(person, entry)
    }
    entry.name ??= binding.get('name')?.value
    if (siloId.startsWith(GITHUB_SILO_PREFIX)) {
      entry.githubId ??= siloId.slice(GITHUB_SILO_PREFIX.length)
    } else if (siloId.startsWith(W3C_SILO_PREFIX)) {
      const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
      if (Number.isInteger(id)) entry.w3cId ??= canonicalW3cId(id)
    }
  }
  return [...people.entries()]
    .filter(([, entry]) => entry.githubId !== undefined)
    .map(([personUri, entry]) => ({
      personUri,
      name: entry.name ?? personUri,
      githubId: entry.githubId!,
      w3cId: entry.w3cId,
      hasW3cGroups: withGroups.has(personUri),
    }))
    .sort((a, b) => a.personUri.localeCompare(b.personUri))
}

async function findKnownPersonUris(store: Store): Promise<Set<string>> {
  const bindings = await queryEngine().queryBindings(
    `SELECT DISTINCT ?person WHERE {
       ?person <${RDF_TYPE}> <${PERSON_TYPE}> .
     }`,
    { sources: [store] },
  )
  const uris = new Set<string>()
  for await (const binding of bindings) {
    const uri = binding.get('person')?.value
    if (uri) uris.add(uri)
  }
  return uris
}

async function findPeople(store: Store): Promise<W3cPersonRef[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person ?name WHERE {
       ?person <${RDF_TYPE}> <${PERSON_TYPE}> ; <${NAME}> ?name .
     }`,
    { sources: [store] },
  )
  const people = new Map<string, string>()
  for await (const binding of bindings) {
    const uri = binding.get('person')?.value
    const name = binding.get('name')?.value
    if (uri && name) people.set(uri, name)
  }
  return [...people.entries()]
    .map(([uri, name]) => ({ uri, name }))
    .sort((a, b) => a.uri.localeCompare(b.uri))
}

async function findGroupIds(store: Store): Promise<number[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?siloId WHERE {
       ?group <${RDF_TYPE}> <${GROUP_CLASS}> ; <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const ids = new Set<number>()
  for await (const binding of bindings) {
    const siloId = binding.get('siloId')?.value
    if (!siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (Number.isInteger(id)) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

async function findGroupsWithoutSpecs(store: Store): Promise<W3cGroupRef[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?group ?name ?siloId ?apiUrl ?shortname ?type WHERE {
       ?group <${RDF_TYPE}> <${GROUP_CLASS}> ;
              <${NAME}> ?name ;
              <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
       FILTER NOT EXISTS { ?group <${SPECIFICATION}> ?spec }
       OPTIONAL { ?group <${W3C_API_URL}> ?apiUrl }
       OPTIONAL { ?group <${SHORTNAME}> ?shortname }
       OPTIONAL { ?group <${GROUP_TYPE}> ?type }
     }`,
    { sources: [store] },
  )
  const groups: W3cGroupRef[] = []
  for await (const binding of bindings) {
    const uri = binding.get('group')?.value
    const name = binding.get('name')?.value
    const siloId = binding.get('siloId')?.value
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    const apiUrl = binding.get('apiUrl')?.value ?? uri
    const shortname = binding.get('shortname')?.value
    const type = binding.get('type')?.value
    groups.push({
      uri,
      apiUrl,
      id,
      name,
      ...(shortname ? { shortname } : {}),
      ...(type ? { type } : {}),
    })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

async function findSpecifications(store: Store): Promise<W3cSpecification[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?spec ?apiUrl ?name ?shortname ?editorDraft ?latestVersionUrl WHERE {
       ?spec <${RDF_TYPE}> <${SPECIFICATION_TYPE}> .
       OPTIONAL { ?spec <${W3C_API_URL}> ?apiUrl }
       OPTIONAL { ?spec <${NAME}> ?name }
       OPTIONAL { ?spec <${SHORTNAME}> ?shortname }
       OPTIONAL { ?spec <${EDITOR_DRAFT}> ?editorDraft }
       OPTIONAL { ?spec <${W3C_LATEST_VERSION_URL}> ?latestVersionUrl }
     }`,
    { sources: [store] },
  )
  const specs = new Map<string, W3cSpecification>()
  for await (const binding of bindings) {
    const uri = binding.get('spec')?.value
    if (!uri) continue
    const apiUrl = binding.get('apiUrl')?.value ?? uri
    const title = binding.get('name')?.value ?? uri
    const shortname = binding.get('shortname')?.value
    const editorDraft = binding.get('editorDraft')?.value
    const latestVersionUrl = binding.get('latestVersionUrl')?.value
    specs.set(uri, {
      uri,
      apiUrl,
      title,
      ...(shortname ? { shortname } : {}),
      ...(editorDraft ? { editorDraft } : {}),
      ...(latestVersionUrl ? { latestVersionUrl } : {}),
    })
  }
  return [...specs.values()].sort((a, b) => a.uri.localeCompare(b.uri))
}

/** Read the seed graph once for accounts, known people and known groups. */
export async function readDataset(nquads: string): Promise<W3cDataset> {
  const store = await parseDataset(nquads)
  return {
    accounts: await findAccounts(store),
    groupIds: await findGroupIds(store),
    knownPersonUris: await findKnownPersonUris(store),
    groupsWithoutSpecs: await findGroupsWithoutSpecs(store),
    specifications: await findSpecifications(store),
    people: await findPeople(store),
  }
}

/**
 * All people the current graph knows about: seed people plus newly fetched
 * participants and editors. Known seed subjects win over later names so the
 * author-name index does not gain duplicates.
 */
export function collectPeople(
  seedPeople: W3cPersonRef[],
  groups: W3cGroupParticipants[],
  editorData: W3cSpecificationEditors[],
  knownPersonUris: ReadonlySet<string>,
): W3cPersonRef[] {
  const people = new Map<string, string>()
  for (const person of seedPeople) people.set(person.uri, person.name)
  for (const group of groups) {
    for (const participant of group.participants) {
      const entry = resolvePerson({
        w3cId: participant.id,
        githubId: participant.githubId,
        githubUsername: participant.githubUsername,
        sourceUrl: participant.href,
        name: participant.name,
      })
      if (knownPersonUris.has(entry.id)) continue
      if (!people.has(entry.id)) people.set(entry.id, participant.name)
    }
  }
  for (const { editors } of editorData) {
    for (const editor of editors) {
      const entry = resolvePerson({
        w3cId: editor.id,
        githubId: editor.githubId,
        githubUsername: editor.githubUsername,
        sourceUrl: editor.href,
        name: editor.name,
      })
      if (knownPersonUris.has(entry.id)) continue
      if (!people.has(entry.id)) people.set(entry.id, editor.name)
    }
  }
  return [...people.entries()]
    .map(([uri, name]) => ({ uri, name }))
    .sort((a, b) => a.uri.localeCompare(b.uri))
}

const { namedNode, literal, quad } = DataFactory

/**
 * RDF for the groups the W3C API returned. The group subject is the full
 * public homepage URL; ex:Group is the distinct group type and ex:sdo links it
 * to the standards body.
 */
export function buildGroupQuads(groups: W3cGroupRef[]): Quad[] {
  const quads: Quad[] = []
  const seenGroups = new Set<string>()
  for (const group of groups) {
    if (seenGroups.has(group.uri)) continue
    seenGroups.add(group.uri)
    const groupNode = namedNode(group.uri)
    quads.push(quad(groupNode, namedNode(RDF_TYPE), namedNode(GROUP_CLASS)))
    quads.push(quad(groupNode, namedNode(SDO), namedNode(W3C_SDO)))
    quads.push(quad(groupNode, namedNode(W3C_API_URL), namedNode(group.apiUrl)))
    quads.push(quad(groupNode, namedNode(NAME), literal(group.name)))
    quads.push(
      quad(groupNode, namedNode(SILO_ID), literal(`${W3C_SILO_PREFIX}${group.id}`)),
    )
    if (group.shortname) {
      quads.push(quad(groupNode, namedNode(SHORTNAME), literal(group.shortname)))
    }
    if (group.type) {
      quads.push(quad(groupNode, namedNode(GROUP_TYPE), literal(group.type)))
    }
  }
  return quads
}

/**
 * RDF for the person a fresh run starts from when there is no dump yet. The
 * GitHub account is what lets the workflow resolve the W3C user (and mirrors
 * what future dumps get for every participant with a connected GitHub account).
 */
export function buildStartPersonQuads(person: W3cSeedPerson): Quad[] {
  const w3cId = canonicalW3cId(person.w3cId)
  const identity = resolvePerson({
    w3cId,
    githubId: person.githubId,
    githubUsername: person.githubUsername,
    sourceUrl: person.w3cApiUrl,
    name: person.name,
  })
  const personNode = namedNode(identity.id)
  const quads = [
    quad(personNode, namedNode(RDF_TYPE), namedNode(PERSON_TYPE)),
    quad(personNode, namedNode(NAME), literal(person.name)),
    quad(
      personNode,
      namedNode(SILO_ID),
      literal(`${GITHUB_SILO_PREFIX}${person.githubId}`),
    ),
    quad(
      personNode,
      namedNode(SILO_ID),
      literal(`${W3C_SILO_PREFIX}${w3cId}`),
    ),
    quad(
      personNode,
      namedNode(SILO_USERNAME),
      literal(`${GITHUB_SILO_PREFIX}${person.githubUsername}`),
    ),
  ]
  if (person.w3cApiUrl) {
    quads.push(
      quad(personNode, namedNode(W3C_API_URL), namedNode(person.w3cApiUrl)),
    )
  }
  if (person.logo) {
    quads.push(quad(personNode, namedNode(LOGO), namedNode(person.logo)))
  }
  return quads
}

/**
 * RDF for the fetched participants, in the catalog's vocabulary: every
 * participant is linked from its group with ex:member, and every person gets
 * the local urn:uuid identity. External W3C/GitHub ids stay as ex:siloId /
 * ex:siloUsername provenance.
 */
export function buildParticipantQuads(
  groups: W3cGroupParticipants[],
  knownPersonUris: ReadonlySet<string>,
): Quad[] {
  const quads: Quad[] = []
  const seenPeople = new Set<string>()
  const seenApiUrls = new Set<string>()
  for (const { group, participants } of groups) {
    const groupNode = namedNode(group.uri)
    for (const participant of participants) {
      const canonicalId = canonicalW3cId(participant.id)
      const siloId = `${W3C_SILO_PREFIX}${canonicalId}`
      const identity = resolvePerson({
        w3cId: canonicalId,
        githubId: participant.githubId,
        githubUsername: participant.githubUsername,
        sourceUrl: participant.href,
        name: participant.name,
      })
      const personNode = namedNode(identity.id)
      quads.push(quad(groupNode, namedNode(MEMBER), personNode))

      if (!seenApiUrls.has(identity.id)) {
        seenApiUrls.add(identity.id)
        quads.push(
          quad(personNode, namedNode(W3C_API_URL), namedNode(participant.href)),
        )
      }

      if (knownPersonUris.has(identity.id) || seenPeople.has(identity.id)) {
        continue
      }
      seenPeople.add(identity.id)
      quads.push(quad(personNode, namedNode(RDF_TYPE), namedNode(PERSON_TYPE)))
      quads.push(quad(personNode, namedNode(NAME), literal(participant.name)))
      quads.push(quad(personNode, namedNode(SILO_ID), literal(siloId)))
      if (participant.githubId) {
        quads.push(
          quad(
            personNode,
            namedNode(SILO_ID),
            literal(`${GITHUB_SILO_PREFIX}${participant.githubId}`),
          ),
        )
      }
      if (participant.githubUsername) {
        quads.push(
          quad(
            personNode,
            namedNode(SILO_USERNAME),
            literal(`${GITHUB_SILO_PREFIX}${participant.githubUsername}`),
          ),
        )
      }
      if (participant.photo) {
        quads.push(quad(personNode, namedNode(LOGO), namedNode(participant.photo)))
      }
    }
  }
  return quads
}

/**
 * Editors of the latest W3C API version of each specification. Versions are not
 * modeled yet, so the series spec points at the editor person and records the
 * source version URL; the same links can move to version nodes later.
 */
export function buildEditorQuads(
  editorData: W3cSpecificationEditors[],
  knownPersonUris: ReadonlySet<string>,
): Quad[] {
  const quads: Quad[] = []
  const seenPeople = new Set<string>()
  for (const { specification, editors } of editorData) {
    const specNode = namedNode(specification.uri)
    for (const editor of editors) {
      const canonicalId = canonicalW3cId(editor.id)
      const identity = resolvePerson({
        w3cId: canonicalId,
        githubId: editor.githubId,
        githubUsername: editor.githubUsername,
        sourceUrl: editor.href,
        name: editor.name,
      })
      const personNode = namedNode(identity.id)
      quads.push(quad(specNode, namedNode(BIBO_EDITOR), personNode))

      if (seenPeople.has(identity.id)) continue
      seenPeople.add(identity.id)
      if (!knownPersonUris.has(identity.id)) {
        quads.push(
          quad(personNode, namedNode(W3C_API_URL), namedNode(editor.href)),
        )
        quads.push(quad(personNode, namedNode(RDF_TYPE), namedNode(PERSON_TYPE)))
        quads.push(quad(personNode, namedNode(NAME), literal(editor.name)))
        quads.push(
          quad(personNode, namedNode(SILO_ID), literal(`${W3C_SILO_PREFIX}${canonicalId}`)),
        )
        if (editor.githubId) {
          quads.push(
            quad(
              personNode,
              namedNode(SILO_ID),
              literal(`${GITHUB_SILO_PREFIX}${editor.githubId}`),
            ),
          )
        }
        if (editor.githubUsername) {
          quads.push(
            quad(
              personNode,
              namedNode(SILO_USERNAME),
              literal(`${GITHUB_SILO_PREFIX}${editor.githubUsername}`),
            ),
          )
        }
        if (editor.photo) {
          quads.push(quad(personNode, namedNode(LOGO), namedNode(editor.photo)))
        }
      }
    }
  }
  return quads
}

/** Group records plus their participants, ready to store as N-Quads. */
export function buildW3cQuads(
  groups: W3cGroupParticipants[],
  knownPersonUris: ReadonlySet<string>,
): Quad[] {
  return [
    ...buildGroupQuads(groups.map((group) => group.group)),
    ...buildParticipantQuads(groups, knownPersonUris),
  ]
}

/**
 * RDF for the specifications delivered by each group. A group gets one
 * ex:specification link per spec, which is also the "specs fetched" check for
 * later runs; a group without specs produces no link and is retried.
 */
export function buildSpecificationQuads(
  groups: W3cGroupSpecifications[],
): Quad[] {
  const quads: Quad[] = []
  const seenSpecs = new Set<string>()
  for (const { group, specifications } of groups) {
    const groupNode = namedNode(group.uri)
    for (const spec of specifications) {
      const specNode = namedNode(spec.uri)
      quads.push(quad(groupNode, namedNode(SPECIFICATION), specNode))
      if (seenSpecs.has(spec.uri)) continue
      seenSpecs.add(spec.uri)
      quads.push(
        quad(specNode, namedNode(RDF_TYPE), namedNode(SPECIFICATION_TYPE)),
      )
      quads.push(quad(specNode, namedNode(SDO), namedNode(W3C_SDO)))
      quads.push(quad(specNode, namedNode(W3C_API_URL), namedNode(spec.apiUrl)))
      if (spec.latestVersionUrl) {
        quads.push(
          quad(
            specNode,
            namedNode(W3C_LATEST_VERSION_URL),
            namedNode(spec.latestVersionUrl),
          ),
        )
      }
      quads.push(quad(specNode, namedNode(NAME), literal(spec.title)))
      if (spec.shortname) {
        quads.push(
          quad(specNode, namedNode(SHORTNAME), literal(spec.shortname)),
        )
      }
      quads.push(
        quad(specNode, namedNode(LANDING_PAGE), namedNode(spec.uri)),
      )
      if (spec.editorDraft) {
        quads.push(
          quad(specNode, namedNode(EDITOR_DRAFT), namedNode(spec.editorDraft)),
        )
      }
    }
  }
  return quads
}

/** N-Quads serialization, the format the SPARQL store accepts. */
export function serializeQuads(quads: Quad[]): string {
  // N-Quads requires quoted literals; the default Turtle writer emits bare
  // booleans, which the store rejects.
  return new Writer({ format: 'N-Quads' }).quadsToString(quads)
}
