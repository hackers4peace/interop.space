// Pure helpers for the IETF crawl: Datatracker resource types, RDF builders and
// validation. Network I/O lives in activities.ts so this module stays testable.
import { DataFactory } from 'n3'
import type { Quad } from 'n3'
import { IETF_API, IETF_GROUP_URL, IETF_SDO } from './stages.ts'
import { ietfSiloId } from './silo-ids.ts'

const { literal, namedNode, quad } = DataFactory

export const EX = 'http://example.org#'
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export const GROUP_CLASS = `${EX}Group`
export const AREA_CLASS = `${EX}Area`
export const SDO = `${EX}sdo`
export const NAME = `${EX}name`
export const SHORTNAME = `${EX}shortname`
export const DESCRIPTION = `${EX}description`
export const SILO_ID = `${EX}siloId`
export const GROUP_TYPE = `${EX}type`
export const GROUP_STATE = `${EX}state`
export const PARENT = `${EX}parent`
export const HOMEPAGE = `${EX}homepage`
export const GITHUB_ORG = `${EX}githubOrg`
export const WIKI = `${EX}wiki`
export const IETF_API_URL = `${EX}ietfApiUrl`
export const LIST_ARCHIVE = `${EX}listArchive`

/** Group types that are not IETF working bodies (ietf-plan.md D13). */
export const EXCLUDED_GROUP_TYPES = new Set(['area', 'sdo', 'nomcom'])

/** One Datatracker group, normalised. */
export interface IetfGroupRef {
  /** Datatracker numeric id (stable). */
  id: number
  /** Group acronym, unique in Datatracker (`wit`, `httpbis`, `maprg`). */
  acronym: string
  name: string
  /** Group type slug (`area`, `wg`, `rg`, `ag`, `team`, …). */
  type: string
  /** Group state slug (`active`, `conclude`, `bof`, …). */
  state: string
  description?: string
  listArchive?: string
  /** Numeric id of the parent group, when Datatracker records one. */
  parentId?: number
  /** Parent group URL, set only when the parent is published in this catalog. */
  parentUri?: string
  /** External homepage from the group's `webpage` ext resource. */
  homepage?: string
  /** GitHub organisation from the group's `github_org` ext resource. */
  githubOrg?: string
  /** Wiki from the group's `wiki` ext resource. */
  wiki?: string
  /** Full public homepage URL, the catalog subject. */
  uri: string
  /** REST self link, provenance only. */
  apiUrl: string
}

/**
 * Public group URL. Datatracker 302-redirects `…/group/<acronym>/` to
 * `…/group/<acronym>/about/`; the redirect target is a UI detail, so the stable
 * entry point is the subject and `ex:ietfApiUrl` carries provenance.
 */
export const groupUri = (acronym: string): string =>
  `${IETF_GROUP_URL}/${encodeURIComponent(acronym)}/`

/** REST self link for a group, the value of `ex:ietfApiUrl`. */
export const groupApiUrl = (id: number): string =>
  `${IETF_API}/group/group/${id}/`

/** Last path segment of a Datatracker `resource_uri`, e.g. `…/grouptypename/wg/`. */
export function slugFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined
  const parts = uri.split('/').filter(Boolean)
  return parts.at(-1)
}

/** Numeric id from a Datatracker reference such as `/api/v1/group/group/2412/`. */
export function idFromUri(uri: string | undefined): number | undefined {
  const slug = slugFromUri(uri)
  if (slug === undefined) return undefined
  const id = Number(slug)
  return Number.isInteger(id) ? id : undefined
}

/** RDF for the areas stage: one node per area, typed ex:Group and ex:Area. */
export function buildAreaQuads(areas: IetfGroupRef[]): Quad[] {
  const quads: Quad[] = []
  for (const area of areas) {
    const node = namedNode(area.uri)
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(GROUP_CLASS)),
      quad(node, namedNode(RDF_TYPE), namedNode(AREA_CLASS)),
      quad(node, namedNode(SDO), namedNode(IETF_SDO)),
      quad(node, namedNode(NAME), literal(area.name)),
      quad(node, namedNode(SHORTNAME), literal(area.acronym)),
      quad(node, namedNode(SILO_ID), literal(ietfSiloId('group', area.id))),
      quad(node, namedNode(IETF_API_URL), namedNode(area.apiUrl)),
      // Datatracker keeps concluded areas (tsv, app, rai, sub); the slug keeps
      // them distinguishable without filtering them out of the catalog.
      quad(node, namedNode(GROUP_TYPE), literal('Area')),
      quad(node, namedNode(GROUP_STATE), literal(area.state)),
    )
    if (area.description) {
      quads.push(quad(node, namedNode(DESCRIPTION), literal(area.description)))
    }
    if (area.listArchive) {
      quads.push(
        quad(node, namedNode(LIST_ARCHIVE), namedNode(area.listArchive)),
      )
    }
  }
  return quads
}

/**
 * RDF for the groups stage. Areas are published by `areas.nq` and are not
 * repeated here; every other node is a group with its Datatracker type label
 * and state, plus the resolved parent when that parent is in the catalog.
 */
export function buildGroupQuads(
  groups: IetfGroupRef[],
  typeLabels: ReadonlyMap<string, string> = new Map(),
): Quad[] {
  const quads: Quad[] = []
  for (const group of groups) {
    const node = namedNode(group.uri)
    const typeLabel = typeLabels.get(group.type) ?? group.type
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(GROUP_CLASS)),
      quad(node, namedNode(SDO), namedNode(IETF_SDO)),
      quad(node, namedNode(NAME), literal(group.name)),
      quad(node, namedNode(SHORTNAME), literal(group.acronym)),
      quad(node, namedNode(SILO_ID), literal(ietfSiloId('group', group.id))),
      quad(node, namedNode(IETF_API_URL), namedNode(group.apiUrl)),
      quad(node, namedNode(GROUP_TYPE), literal(typeLabel)),
      quad(node, namedNode(GROUP_STATE), literal(group.state)),
    )
    if (group.description) {
      quads.push(
        quad(node, namedNode(DESCRIPTION), literal(group.description)),
      )
    }
    if (group.parentUri) {
      quads.push(quad(node, namedNode(PARENT), namedNode(group.parentUri)))
    }
    if (group.homepage) {
      quads.push(quad(node, namedNode(HOMEPAGE), namedNode(group.homepage)))
    }
    if (group.githubOrg) {
      quads.push(quad(node, namedNode(GITHUB_ORG), namedNode(group.githubOrg)))
    }
    if (group.wiki) {
      quads.push(quad(node, namedNode(WIKI), namedNode(group.wiki)))
    }
    if (group.listArchive) {
      quads.push(
        quad(node, namedNode(LIST_ARCHIVE), namedNode(group.listArchive)),
      )
    }
  }
  return quads
}

interface UniquenessOptions {
  /** Plural label used in error messages and duplicate listings. */
  what: string
  /** Message when nothing was produced; usually an upstream fetch problem. */
  emptyMessage: string
}

/**
 * Reject nodes that cannot become unique catalog subjects: duplicate
 * Datatracker ids, duplicate public URLs, or a URL another SDO already
 * published.
 */
function validateUniqueGroupNodes(
  nodes: IetfGroupRef[],
  existingUris: ReadonlySet<string>,
  options: UniquenessOptions,
): void {
  if (nodes.length === 0) {
    throw new Error(options.emptyMessage)
  }

  const byId = new Map<number, string[]>()
  const byUri = new Map<string, string[]>()
  const crossSdo: string[] = []
  for (const node of nodes) {
    byId.set(node.id, [...(byId.get(node.id) ?? []), node.acronym])
    byUri.set(node.uri, [...(byUri.get(node.uri) ?? []), node.acronym])
    if (existingUris.has(node.uri)) {
      crossSdo.push(`${node.name}: ${node.uri}`)
    }
  }

  const duplicateIds = [...byId.entries()].filter(([, names]) => names.length > 1)
  if (duplicateIds.length > 0) {
    throw new Error(
      `duplicate Datatracker ids in ${options.what}:\n${duplicateIds
        .map(([id, names]) => `${id}: ${names.join(', ')}`)
        .join('\n')}`,
    )
  }

  const duplicateUris = [...byUri.entries()].filter(
    ([, names]) => names.length > 1,
  )
  if (duplicateUris.length > 0) {
    throw new Error(
      `duplicate group homepages in ${options.what}:\n${duplicateUris
        .map(([uri, names]) => `${uri}: ${names.join(', ')}`)
        .join('\n')}`,
    )
  }

  if (crossSdo.length > 0) {
    throw new Error(
      `group homepage already used by another SDO:\n${crossSdo.join('\n')}`,
    )
  }
}

export function validateAreas(
  areas: IetfGroupRef[],
  existingUris: ReadonlySet<string> = new Set(),
): void {
  validateUniqueGroupNodes(areas, existingUris, {
    what: 'areas',
    emptyMessage: 'areas stage produced zero areas',
  })
}

export function validateGroups(
  groups: IetfGroupRef[],
  existingUris: ReadonlySet<string> = new Set(),
): void {
  validateUniqueGroupNodes(groups, existingUris, {
    what: 'groups',
    emptyMessage: 'groups stage produced zero groups',
  })
}

// --- series stage ---------------------------------------------------------

export const SERIES_CLASS = `${EX}SpecificationSeries`
export const HAS_SPECIFICATION = `${EX}hasSpecification`
export const LANDING_PAGE = `${EX}landingPage`

/** RFC Editor pages are the public identity of RFCs and of subseries. */
export const RFC_INFO_BASE = 'https://www.rfc-editor.org/info'

/** `rfc9110` -> `https://www.rfc-editor.org/info/rfc9110/` */
export const specUri = (name: string): string =>
  `${RFC_INFO_BASE}/${encodeURIComponent(name)}/`

/** Subseries share the RFC Editor namespace: `bcp14` -> `.../info/bcp14/`. */
export const seriesUri = specUri

/** `bcp14` -> `BCP 14`; undefined when the name is not a known subseries. */
export function seriesLabel(name: string): string | undefined {
  const match = /^(bcp|std|fyi)(\d+)$/i.exec(name)
  if (!match?.[1] || !match[2]) return undefined
  return `${match[1].toUpperCase()} ${Number(match[2])}`
}

/** One BCP/STD/FYI subseries with its member RFCs, in publication order. */
export interface IetfSeriesRef {
  /** Datatracker document name (`bcp14`). */
  name: string
  /** Display name (`BCP 14`). */
  label: string
  /** Subseries kind (`bcp`, `std`, `fyi`). */
  kind: string
  /** Public RFC Editor page, the catalog subject. */
  uri: string
  /** Datatracker document URI, provenance only. */
  apiUrl: string
  /** Member RFC names (`rfc2119`). */
  members: string[]
}

/**
 * RDF for the series stage. `ex:hasSpecification` points at the member RFCs,
 * which the `specs` stage describes; `spec ex:series` adds the reverse edge.
 */
export function buildSeriesQuads(series: IetfSeriesRef[]): Quad[] {
  const quads: Quad[] = []
  for (const entry of series) {
    const node = namedNode(entry.uri)
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(SERIES_CLASS)),
      quad(node, namedNode(SDO), namedNode(IETF_SDO)),
      quad(node, namedNode(NAME), literal(entry.label)),
      quad(node, namedNode(SHORTNAME), literal(entry.name)),
      quad(node, namedNode(LANDING_PAGE), namedNode(entry.uri)),
      quad(node, namedNode(IETF_API_URL), namedNode(entry.apiUrl)),
    )
    for (const member of entry.members) {
      quads.push(
        quad(
          node,
          namedNode(HAS_SPECIFICATION),
          namedNode(specUri(member)),
        ),
      )
    }
  }
  return quads
}

/** Reject series that cannot become unique, non-empty catalog nodes. */
export function validateSeries(series: IetfSeriesRef[]): void {
  if (series.length === 0) {
    throw new Error('series stage produced zero series')
  }
  const byName = new Map<string, number>()
  const byUri = new Map<string, number>()
  for (const entry of series) {
    if (!entry.members.length) {
      throw new Error(`subseries ${entry.name} has no member documents`)
    }
    if (!seriesLabel(entry.name)) {
      throw new Error(`unexpected subseries name: ${entry.name}`)
    }
    byName.set(entry.name, (byName.get(entry.name) ?? 0) + 1)
    byUri.set(entry.uri, (byUri.get(entry.uri) ?? 0) + 1)
  }
  const duplicateNames = [...byName].filter(([, count]) => count > 1)
  if (duplicateNames.length > 0) {
    throw new Error(
      `duplicate subseries names:\n${duplicateNames
        .map(([name, count]) => `${name} ×${count}`)
        .join('\n')}`,
    )
  }
  const duplicateUris = [...byUri].filter(([, count]) => count > 1)
  if (duplicateUris.length > 0) {
    throw new Error(
      `duplicate subseries homepages:\n${duplicateUris
        .map(([uri, count]) => `${uri} ×${count}`)
        .join('\n')}`,
    )
  }
}

// --- specs stage ----------------------------------------------------------

export const SPECIFICATION_CLASS = `${EX}Specification`
export const SPECIFICATION = `${EX}specification`
export const STATUS = `${EX}status`
export const STREAM = `${EX}stream`
export const DRAFT = `${EX}draft`
export const DOI = `${EX}doi`
export const ERRATA = `${EX}errata`
export const OBSOLETES = `${EX}obsoletes`
export const OBSOLETED_BY = `${EX}obsoletedBy`
export const UPDATES = `${EX}updates`
export const UPDATED_BY = `${EX}updatedBy`
export const SERIES = `${EX}series`
/** Pages come from the RFC index, same predicate the Specref import uses. */
export const BIBO_PAGES = 'http://purl.org/ontology/bibo/pages'

export const DCTERMS_DATE = 'http://purl.org/dc/terms/date'
/** Datatracker document page for a draft name, e.g. `draft-ietf-httpbis-semantics`. */
export const draftDocUri = (draft: string): string =>
  `https://datatracker.ietf.org/doc/${encodeURIComponent(draft)}/`

/** One published RFC, the catalog's specification node. */
export interface IetfSpecRef {
  /** Datatracker document name (`rfc9110`). */
  name: string
  /** RFC number, also the cross-source join key. */
  number: number
  /** Public RFC Editor page, the catalog subject. */
  uri: string
  /** Datatracker document URI, provenance only. */
  apiUrl: string
  title: string
  /** `current-status` from the RFC index (`INTERNET STANDARD`, …). */
  status?: string
  /** Publication stream (`IETF`, `IRTF`, `IAB`, `INDEPENDENT`, `Legacy`, `Editorial`). */
  stream?: string
  /** `YYYY-MM` or `YYYY-MM-DD`. */
  date?: string
  pages?: string
  doi?: string
  errata?: string
  /** Draft this RFC was published from, revision stripped. */
  draft?: string
  groupUri?: string
  seriesUri?: string
  obsoletes: string[]
  obsoletedBy: string[]
  updates: string[]
  updatedBy: string[]
}

const IRIS = [
  [OBSOLETES, 'obsoletes'],
  [OBSOLETED_BY, 'obsoletedBy'],
  [UPDATES, 'updates'],
  [UPDATED_BY, 'updatedBy'],
] as const

/** RDF for the specs stage: one ex:Specification per published RFC. */
export function buildSpecQuads(specs: IetfSpecRef[]): Quad[] {
  const quads: Quad[] = []
  for (const spec of specs) {
    const node = namedNode(spec.uri)
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(SPECIFICATION_CLASS)),
      quad(node, namedNode(SDO), namedNode(IETF_SDO)),
      quad(node, namedNode(NAME), literal(spec.title)),
      quad(node, namedNode(SHORTNAME), literal(spec.name)),
      quad(node, namedNode(LANDING_PAGE), namedNode(spec.uri)),
      quad(node, namedNode(IETF_API_URL), namedNode(spec.apiUrl)),
    )
    if (spec.status) {
      quads.push(quad(node, namedNode(STATUS), literal(spec.status)))
    }
    if (spec.stream) {
      quads.push(quad(node, namedNode(STREAM), literal(spec.stream)))
    }
    if (spec.date) {
      quads.push(quad(node, namedNode(DCTERMS_DATE), literal(spec.date)))
    }
    if (spec.pages) {
      quads.push(quad(node, namedNode(BIBO_PAGES), literal(spec.pages)))
    }
    if (spec.doi) {
      quads.push(quad(node, namedNode(DOI), literal(spec.doi)))
    }
    if (spec.errata) {
      quads.push(quad(node, namedNode(ERRATA), namedNode(spec.errata)))
    }
    if (spec.draft) {
      quads.push(
        quad(node, namedNode(DRAFT), namedNode(draftDocUri(spec.draft))),
      )
    }
    if (spec.seriesUri) {
      quads.push(quad(node, namedNode(SERIES), namedNode(spec.seriesUri)))
    }
    for (const [predicate, key] of IRIS) {
      for (const target of spec[key]) {
        quads.push(quad(node, namedNode(predicate), namedNode(target)))
      }
    }
    if (spec.groupUri) {
      quads.push(
        quad(
          namedNode(spec.groupUri),
          namedNode(SPECIFICATION),
          namedNode(spec.uri),
        ),
      )
    }
  }
  return quads
}

/** Reject specs that cannot become unique catalog nodes. */
export function validateSpecs(
  specs: IetfSpecRef[],
  existingUris: ReadonlySet<string> = new Set(),
): void {
  if (specs.length === 0) {
    throw new Error('specs stage produced zero specifications')
  }
  const byName = new Map<string, number>()
  const byUri = new Map<string, number>()
  const noTitle: string[] = []
  const crossSdo: string[] = []
  for (const spec of specs) {
    byName.set(spec.name, (byName.get(spec.name) ?? 0) + 1)
    byUri.set(spec.uri, (byUri.get(spec.uri) ?? 0) + 1)
    if (!spec.title.trim()) noTitle.push(spec.name)
    if (existingUris.has(spec.uri)) crossSdo.push(spec.uri)
  }
  const duplicateNames = [...byName].filter(([, count]) => count > 1)
  if (duplicateNames.length > 0) {
    throw new Error(
      `duplicate specification names:\n${duplicateNames
        .map(([name, count]) => `${name} ×${count}`)
        .join('\n')}`,
    )
  }
  const duplicateUris = [...byUri].filter(([, count]) => count > 1)
  if (duplicateUris.length > 0) {
    throw new Error(
      `duplicate specification homepages:\n${duplicateUris
        .map(([uri, count]) => `${uri} ×${count}`)
        .join('\n')}`,
    )
  }
  if (noTitle.length > 0) {
    throw new Error(
      `specifications without a title:\n${noTitle.slice(0, 20).join(', ')}`,
    )
  }
  if (crossSdo.length > 0) {
    throw new Error(
      `specification homepage already used by another source:\n${crossSdo
        .slice(0, 20)
        .join('\n')}`,
    )
  }
}

// --- RFC index helpers (pure, used by the specs stage) --------------------

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** `June` + `2022` (+ optional day) -> `2022-06` / `2022-06-15`. */
export function rawDateFromParts(
  month: string | undefined,
  year: string | undefined,
  day?: string,
): string | undefined {
  const y = year?.trim()
  if (!y || !/^\d{4}$/.test(y)) return undefined
  const index = MONTHS.indexOf((month ?? '').trim().toLowerCase())
  if (index < 0) return undefined
  const mm = String(index + 1).padStart(2, '0')
  const d = Number(day?.trim())
  return Number.isInteger(d) && d > 0
    ? `${y}-${mm}-${String(d).padStart(2, '0')}`
    : `${y}-${mm}`
}

/** `RFC0911` -> `911`; undefined for anything that is not an RFC doc-id. */
export function rfcNumberFromDocId(docId: string | undefined): number | undefined {
  const match = /^RFC0*(\d+)$/i.exec(docId?.trim() ?? '')
  if (!match?.[1]) return undefined
  const number = Number(match[1])
  return Number.isInteger(number) && number > 0 ? number : undefined
}

/** `draft-ietf-httpbis-semantics-19` -> `draft-ietf-httpbis-semantics`. */
export function draftNameFromIndex(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/-\d{2}$/, '') || undefined
}

// --- spec-people stage: authors, editors and person records ---------------

export const PERSON_CLASS = `${EX}Person`
export const SILO_USERNAME = `${EX}siloUsername`
export const LOGO = `${EX}logo`
export const AFFILIATION_NAME = `${EX}affiliationName`
export const BIBO_EDITOR = 'http://purl.org/ontology/bibo/editor'
export const DCTERMS_CREATOR = 'http://purl.org/dc/terms/creator'

/** One author as the RFC index names them, with the editor marker. */
export interface IndexAuthor {
  name: string
  /** True when the index writes `<title>Editor</title>` for this author. */
  editor: boolean
}

/** One `documentauthor` row, joined with the person record it points at. */
export interface AuthorRow {
  personId: number
  /** Datatracker `person.name`, used for surname matching only. */
  personName: string
  affiliation?: string
  /** `documentauthor.order`, the publication order. */
  order: number
}

export interface MatchedAuthor {
  personId: number
  indexName: string
  editor: boolean
  affiliation?: string
}

interface NameKey {
  surname: string
  initial: string
}

/** Honorifics and generational suffixes that must not become the initial/surname. */
const NAME_NOISE = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'sir', 'dame'])
const NAME_SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

/** `S.D. Crocker` / `Dr. Stephen Crocker` -> { surname: crocker, initial: s }. */
function nameKey(name: string): NameKey | undefined {
  let tokens = name
    .toLowerCase()
    .replace(/[^a-z\s.'-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/[.'\-]/g, ''))
    .filter((token) => /[a-z]/.test(token))
  while (tokens.length > 1 && NAME_SUFFIX.has(tokens[tokens.length - 1]!)) {
    tokens = tokens.slice(0, -1)
  }
  while (tokens.length > 1 && NAME_NOISE.has(tokens[0]!)) {
    tokens = tokens.slice(1)
  }
  if (tokens.length === 0) return undefined
  const surname = tokens[tokens.length - 1]!
  const initial = tokens[0]!.match(/[a-z]/)?.[0] ?? ''
  if (!surname) return undefined
  return { surname, initial }
}

/**
 * Pair RFC-index authors with `documentauthor` rows.
 *
 * Equal counts are matched by position (8,530 RFCs). Otherwise the index name
 * and the Datatracker person name are compared by surname + first initial, then
 * by a unique surname. Anything left over is reported and **skipped** — no
 * literal fallback (ietf-plan.md §7.5).
 */
export function matchIndexAuthors(
  authors: IndexAuthor[],
  rows: AuthorRow[],
): { matched: MatchedAuthor[]; unmatched: string[] } {
  const ordered = [...rows].sort((a, b) => a.order - b.order)
  const matched: MatchedAuthor[] = []
  const unmatched: string[] = []

  if (ordered.length === authors.length) {
    authors.forEach((author, index) => {
      const row = ordered[index]
      if (!row) return
      matched.push({
        personId: row.personId,
        indexName: author.name,
        editor: author.editor,
        ...(row.affiliation ? { affiliation: row.affiliation } : {}),
      })
    })
    return { matched, unmatched }
  }

  const remaining = [...ordered]
  const take = (author: IndexAuthor, predicate: (row: AuthorRow) => boolean) => {
    const index = remaining.findIndex(predicate)
    if (index < 0) return false
    const row = remaining.splice(index, 1)[0]!
    matched.push({
      personId: row.personId,
      indexName: author.name,
      editor: author.editor,
      ...(row.affiliation ? { affiliation: row.affiliation } : {}),
    })
    return true
  }

  for (const author of authors) {
    const key = nameKey(author.name)
    if (!key) {
      unmatched.push(author.name)
      continue
    }
    const exact = take(author, (row) => {
      const candidate = nameKey(row.personName)
      return (
        candidate !== undefined &&
        candidate.surname === key.surname &&
        candidate.initial === key.initial
      )
    })
    if (exact) continue
    // Surname-only, but only when unambiguous among the remaining rows.
    const bySurname = remaining.filter(
      (row) => nameKey(row.personName)?.surname === key.surname,
    )
    if (bySurname.length === 1 && take(author, (row) => row === bySurname[0])) {
      continue
    }
    unmatched.push(author.name)
  }

  return { matched, unmatched }
}

/** One author person, resolved through the identity map. */
export interface IetfPersonNode {
  /** Local `urn:uuid:` identity, the node subject. */
  uri: string
  /** Datatracker numeric id, the `urn:ietf:person:<id>` silo id. */
  personId: number
  name: string
  apiUrl?: string
  logo?: string
  githubId?: string
  githubUsername?: string
  orcid?: string
  /** Distinct `documentauthor.affiliation` strings. */
  affiliations: string[]
}

export function buildAuthorPersonQuads(people: IetfPersonNode[]): Quad[] {
  const quads: Quad[] = []
  for (const person of people) {
    const node = namedNode(person.uri)
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(PERSON_CLASS)),
      quad(node, namedNode(NAME), literal(person.name)),
      quad(
        node,
        namedNode(SILO_ID),
        literal(ietfSiloId('person', person.personId)),
      ),
    )
    if (person.apiUrl) {
      quads.push(quad(node, namedNode(IETF_API_URL), namedNode(person.apiUrl)))
    }
    if (person.logo) {
      quads.push(quad(node, namedNode(LOGO), namedNode(person.logo)))
    }
    if (person.githubId) {
      quads.push(quad(node, namedNode(SILO_ID), literal(`github:${person.githubId}`)))
    }
    if (person.githubUsername) {
      quads.push(
        quad(
          node,
          namedNode(SILO_USERNAME),
          literal(`github:${person.githubUsername}`),
        ),
      )
    }
    if (person.orcid) {
      quads.push(quad(node, namedNode(SILO_ID), literal(`orcid:${person.orcid}`)))
    }
    for (const affiliation of person.affiliations) {
      quads.push(quad(node, namedNode(AFFILIATION_NAME), literal(affiliation)))
    }
  }
  return quads
}

/** One authorship edge: `bibo:editor` for editors, `dcterms:creator` otherwise. */
export interface AuthorshipEdge {
  specUri: string
  personUri: string
  editor: boolean
}

export function buildAuthorshipQuads(edges: AuthorshipEdge[]): Quad[] {
  return edges.map((edge) =>
    quad(
      namedNode(edge.specUri),
      namedNode(edge.editor ? BIBO_EDITOR : DCTERMS_CREATOR),
      namedNode(edge.personUri),
    ),
  )
}

/**
 * Authorship edges must point at a published spec and a known person, and must
 * never be literals (ietf-plan.md §7.5).
 */
export function validateAuthorship(
  edges: AuthorshipEdge[],
  specUris: ReadonlySet<string>,
  personUris: ReadonlySet<string>,
): void {
  if (edges.length === 0) {
    throw new Error('spec-people stage produced zero authorship edges')
  }
  const unknownSpecs = new Set<string>()
  const unknownPeople = new Set<string>()
  for (const edge of edges) {
    if (typeof edge.specUri !== 'string' || typeof edge.personUri !== 'string') {
      throw new Error('authorship edge with a non-IRI endpoint')
    }
    if (!specUris.has(edge.specUri)) unknownSpecs.add(edge.specUri)
    if (!personUris.has(edge.personUri)) unknownPeople.add(edge.personUri)
  }
  if (unknownSpecs.size > 0) {
    throw new Error(
      `authorship edge on an unpublished spec:\n${[...unknownSpecs]
        .slice(0, 10)
        .join('\n')}`,
    )
  }
  if (unknownPeople.size > 0) {
    throw new Error(
      `authorship edge on an unknown person:\n${[...unknownPeople]
        .slice(0, 10)
        .join('\n')}`,
    )
  }
}

/**
 * Specref metadata for an IETF spec, minus the author quads: Specref authors
 * are name strings and would reintroduce the literal authors we deliberately
 * skip (ietf-plan.md §7.5).
 */
export function importableSpecrefQuads(
  quads: Quad[],
): Quad[] {
  return quads.filter(
    (entry) =>
      entry.predicate.value !== DCTERMS_CREATOR &&
      entry.predicate.value !== `https://w3id.org/specref/etAl`,
  )
}

// --- citations stage ------------------------------------------------------

/** Same predicates the W3C crawl uses, so references are queryable across SDOs. */
export const NORMATIVE_REF = `${EX}normativeRef`
export const INFORMATIVE_REF = `${EX}informativeRef`

export type CitationNature = 'normative' | 'informative'

/** One `relateddocument` row, already reduced to catalog document names. */
export interface RawCitation {
  /** Source document name (`rfc9110`). */
  source: string
  /** Target document name (`rfc7230`, `bcp14`, `draft-…`). */
  target: string
  nature: CitationNature
}

export interface CitationEdge {
  source: string
  target: string
  nature: CitationNature
}

/** A subseries node and the member RFC URIs published by the series stage. */
export interface SeriesMembers {
  uri: string
  members: string[]
}

export interface CitationCounts {
  sources: number
  edges: number
  normative: number
  informative: number
  selfReferences: number
  duplicates: number
  conflicts: number
  seriesExpanded: number
  outOfCatalogTargets: number
  outOfCatalogRows: number
  missingSource: number
}

export interface ResolvedCitations {
  edges: CitationEdge[]
  counts: CitationCounts
  /** Target name → number of references, most referenced first. */
  outOfCatalog: [string, number][]
}

/**
 * Turn `relateddocument` rows into catalog edges.
 *
 * - a target that is a published spec becomes an edge;
 * - a subseries target becomes an edge to the series **and** to each member
 *   RFC (ietf-plan.md D4);
 * - anything else (expired drafts, unofficial documents) is counted as
 *   out-of-catalog and produces no edge;
 * - a target seen as both normative and informative stays normative.
 */
export function resolveCitations(
  raw: RawCitation[],
  specUris: ReadonlySet<string>,
  seriesByName: ReadonlyMap<string, SeriesMembers>,
): ResolvedCitations {
  const seen = new Map<string, CitationEdge>()
  const outOfCatalog = new Map<string, number>()
  let selfReferences = 0
  let duplicates = 0
  let conflicts = 0
  let seriesExpanded = 0
  let missingSource = 0
  let outOfCatalogRows = 0

  const add = (
    source: string,
    target: string,
    nature: CitationNature,
  ): boolean => {
    const key = `${source}\u0000${target}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, { source, target, nature })
      return true
    }
    if (existing.nature === nature) {
      duplicates += 1
      return false
    }
    if (nature === 'normative') {
      existing.nature = 'normative'
      conflicts += 1
      return false
    }
    duplicates += 1
    return false
  }

  for (const row of raw) {
    const sourceUri = specUri(row.source)
    if (!specUris.has(sourceUri)) {
      missingSource += 1
      continue
    }
    if (row.target === row.source) {
      selfReferences += 1
      continue
    }
    const targetUri = specUri(row.target)
    if (specUris.has(targetUri)) {
      add(sourceUri, targetUri, row.nature)
      continue
    }
    const series = seriesByName.get(row.target)
    if (series) {
      add(sourceUri, series.uri, row.nature)
      for (const member of series.members) {
        if (member === sourceUri) {
          selfReferences += 1
          continue
        }
        if (add(sourceUri, member, row.nature)) seriesExpanded += 1
      }
      continue
    }
    outOfCatalogRows += 1
    outOfCatalog.set(row.target, (outOfCatalog.get(row.target) ?? 0) + 1)
  }

  const edges = [...seen.values()].sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  )
  const normative = edges.filter((edge) => edge.nature === 'normative').length
  return {
    edges,
    counts: {
      sources: new Set(edges.map((edge) => edge.source)).size,
      edges: edges.length,
      normative,
      informative: edges.length - normative,
      selfReferences,
      duplicates,
      conflicts,
      seriesExpanded,
      outOfCatalogTargets: outOfCatalog.size,
      outOfCatalogRows,
      missingSource,
    },
    outOfCatalog: [...outOfCatalog.entries()].sort((a, b) => b[1] - a[1]),
  }
}

/** RDF for the citation edges: `ex:normativeRef` / `ex:informativeRef`. */
export function buildCitationQuads(edges: CitationEdge[]): Quad[] {
  return edges.map((edge) =>
    quad(
      namedNode(edge.source),
      namedNode(
        edge.nature === 'normative' ? NORMATIVE_REF : INFORMATIVE_REF,
      ),
      namedNode(edge.target),
    ),
  )
}

/**
 * Citation edges must join published nodes: the source is always a spec, the
 * target is a spec or a subseries node (the fan-out keeps the series edge). A
 * dangling reference is a resolution bug, not a data condition.
 */
export function validateCitations(
  edges: CitationEdge[],
  specUris: ReadonlySet<string>,
  seriesUris: ReadonlySet<string> = new Set(),
): void {
  if (edges.length === 0) {
    throw new Error('citations stage produced zero citation edges')
  }
  const unknown = new Set<string>()
  for (const edge of edges) {
    if (!specUris.has(edge.source)) unknown.add(`source ${edge.source}`)
    if (!specUris.has(edge.target) && !seriesUris.has(edge.target)) {
      unknown.add(`target ${edge.target}`)
    }
  }
  if (unknown.size > 0) {
    throw new Error(
      `citation edge outside the catalog:\n${[...unknown].slice(0, 10).join('\n')}`,
    )
  }
}
