// Temporal activities for the IETF crawl. Network I/O, page following and RDF
// building live here; the workflow stays deterministic and only sequences.
//
// Stage-file first: every step skips when its `.nq` exists, and a failed stage
// writes a `.log` instead of publishing.
//
// Request budget: every Datatracker endpoint is fetched once per run and only
// for the records the catalog keeps (active groups, their roles, RFCs), so
// stage order matters — see ietf-plan.md §7.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import * as cheerio from 'cheerio'
import {
  DEFAULT_SPECREF_URL,
  loadSpecrefEntries,
} from '../specref/source.ts'
import { buildSpecrefIndexes, matchSpec } from '../specref/matching.ts'
import { buildSpecrefQuads } from '../specref/metadata.ts'
import { resolvePerson, writeNewIdentities } from '../w3c-api/identity.ts'
import { DataFactory, Parser, Store } from 'n3'
import type { Quad } from 'n3'
import pThrottle from 'p-throttle'
import { existingGroupUris } from '../catalog/stages.ts'
import {
  EXCLUDED_GROUP_TYPES,
  SILO_ID,
  buildAreaQuads,
  buildGroupQuads,
  buildAuthorPersonQuads,
  buildAuthorshipQuads,
  buildCitationQuads,
  buildSeriesQuads,
  buildSpecQuads,
  importableSpecrefQuads,
  matchIndexAuthors,
  resolveCitations,
  validateAuthorship,
  validateCitations,
  draftNameFromIndex,
  rawDateFromParts,
  rfcNumberFromDocId,
  groupApiUrl,
  groupUri,
  idFromUri,
  HAS_SPECIFICATION,
  seriesLabel,
  seriesUri,
  specUri,
  slugFromUri,
  validateAreas,
  validateGroups,
  validateSeries,
  validateSpecs,
  type AuthorRow,
  type AuthorshipEdge,
  type CitationEdge,
  type CitationNature,
  type IetfGroupRef,
  type IetfPersonNode,
  type IetfSeriesRef,
  type IetfSpecRef,
  type IndexAuthor,
  type RawCitation,
  type SeriesMembers,
} from './analysis.ts'
import {
  IETF_API,
  STAGE_FILES,
  failStage,
  hasStage,
  stageFile,
  stageSeedFiles,
  stagesDir,
  writeStage,
  type StageName,
} from './stages.ts'

const { literal, namedNode } = DataFactory

const USER_AGENT = 'interop.space ietf crawl (+https://interop.space)'
/** Datatracker is Django/tastypie; 1000 is the largest accepted page size. */
const PAGE_SIZE = 1000
/** Guard against a broken `meta.next` loop. 1,614 groups = 2 pages. */
const MAX_PAGES = 100
const RATE_LIMIT = { limit: 4, interval: 1000 }
const MAX_ATTEMPTS = 3
/** A hostile Retry-After must not stall the activity. */
const MAX_RETRY_AFTER_MS = 60_000

export interface IetfStepResult {
  step: StageName
  skipped: boolean
  reason?: string
  /** Number of quads written by a step that ran. */
  stored?: number
  detail?: string
  /** Published stage file, when the step ran and completed. */
  file?: string
}

/** Raw Datatracker group object (only the fields this crawl reads). */
interface DatatrackerGroup {
  id?: number
  acronym?: string
  name?: string
  description?: string
  list_archive?: string
  parent?: string | null
  type?: string
  state?: string
  resource_uri?: string
}

/** Raw `group/groupextresource/` row. */
interface DatatrackerExtResource {
  name?: string
  value?: string
  group?: string
  display_name?: string
}

/** Raw `doc/document/` row (only the fields the specs stage reads). */
interface DatatrackerDocument {
  name?: string
  title?: string
  group?: string | null
  rfc_number?: number | null
  resource_uri?: string
}

/** One `<rfc-entry>` of the RFC Editor index. */
interface RfcIndexEntry {
  number: number
  title: string
  status?: string
  stream?: string
  date?: string
  pages?: string
  doi?: string
  errata?: string
  draft?: string
  obsoletes: string[]
  obsoletedBy: string[]
  updates: string[]
  updatedBy: string[]
  /** Author names with their optional index title (`Editor`). */
  authors: { name: string; title?: string }[]
}

/** Raw `doc/relateddocument/` row for a citation. */
interface DatatrackerCitationRow {
  source?: string
  target?: string
  relationship?: string
}

/** Raw `doc/documentauthor/` row for a published RFC. */
interface DatatrackerDocumentAuthor {
  document?: string
  person?: string
  order?: number
  affiliation?: string
}

/** Raw `person/person/` row. */
interface DatatrackerPerson {
  id?: number
  name?: string
  photo_thumb?: string | null
  resource_uri?: string
}

/** Raw `person/personextresource/` row. */
interface DatatrackerPersonExtResource {
  person?: string
  name?: string
  value?: string
}

/** Raw `doc/relateddocument/` row (only the fields the series stage reads). */
interface DatatrackerRelatedDocument {
  source?: string
  target?: string
  relationship?: string
}

/** Raw `name/grouptypename/` row. */
interface DatatrackerGroupTypeName {
  name?: string
  verbose_name?: string
  slug?: string
  resource_uri?: string
}

interface DatatrackerPage<T> {
  meta?: {
    limit?: number
    offset?: number
    total_count?: number
    next?: string | null
  }
  objects?: T[]
}

const throttledFetch = pThrottle(RATE_LIMIT)((url: URL) =>
  fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  }),
)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One JSON response; 429 honours Retry-After, 5xx backs off. */
async function fetchIetfJson<T>(url: URL): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await throttledFetch(url)
    } catch (error) {
      lastError = error
      if (attempt >= MAX_ATTEMPTS) break
      await sleep(1000 * attempt)
      continue
    }

    if (response.ok) return (await response.json()) as T

    const retryable = response.status === 429 || response.status >= 500
    const detail = `HTTP ${response.status} ${response.statusText}`
    if (!retryable) {
      throw new Error(`Datatracker ${url}: ${detail}`)
    }
    lastError = new Error(`Datatracker ${url}: ${detail}`)
    if (attempt >= MAX_ATTEMPTS) break

    const retryAfter = Number(response.headers.get('retry-after') ?? '')
    const delay = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * attempt,
      MAX_RETRY_AFTER_MS,
    )
    await sleep(delay)
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? `Datatracker ${url}: request failed`))
}

/**
 * Every object of a tastypie list endpoint, following `meta.next`. Pages encode
 * offset and filters, so following them is safer than recomputing offsets.
 */
async function fetchIetfList<T>(
  path: string,
  params: Record<string, string> = {},
  options: { orderBy?: string | null } = {},
): Promise<T[]> {
  // `IETF_API` has no trailing slash, so concatenate rather than resolve: a
  // leading-slash path would otherwise resolve against the host root.
  const first = new URL(`${IETF_API}${path}`)
  first.searchParams.set('format', 'json')
  first.searchParams.set('limit', String(PAGE_SIZE))
  // tastypie's default order is not stable across pages: a 64,050-row sweep
  // without this returned 64,050 rows but only 42,002 distinct ids (22,048
  // duplicated, 22,048 silently missed). Every paged resource has a numeric
  // id; name tables (`name/grouptypename`) reject `order_by=id` and are single
  // page anyway, so they pass `orderBy: null`.
  const orderBy = options.orderBy === undefined ? 'id' : options.orderBy
  if (orderBy) first.searchParams.set('order_by', orderBy)
  for (const [key, value] of Object.entries(params)) {
    first.searchParams.set(key, value)
  }

  const items: T[] = []
  let cursor: string | null | undefined = first.href
  let page = 0
  while (cursor && page < MAX_PAGES) {
    const body: DatatrackerPage<T> = await fetchIetfJson<DatatrackerPage<T>>(
      new URL(cursor, IETF_API),
    )
    items.push(...(body.objects ?? []))
    const nextHref: string | null | undefined = body.meta?.next
    cursor = nextHref ? new URL(nextHref, IETF_API).href : undefined
    page += 1
  }
  return items
}

/**
 * Characters that may never appear in an IRI. N-Quads would carry them
 * verbatim, and the store (and n3) then rejects the whole file. Datatracker
 * has 8 groups whose `list_archive` is prose ("mailto:… (index x in body)"),
 * which `new URL()` happily accepts for opaque schemes like `mailto:`.
 */
const ILLEGAL_IRI_CHAR = /[\u0000-\u0020<>"{}|\\^`]/

/** Absolute IRI or undefined; keeps invalid links out of the graph. */
export function absoluteUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return undefined
  }
  if (ILLEGAL_IRI_CHAR.test(url.href)) return undefined
  return url.href
}

/** Normalise one Datatracker group; throws when a field the graph needs is missing. */
export function toGroupRef(raw: DatatrackerGroup): IetfGroupRef {
  if (!raw.id || !Number.isInteger(raw.id)) {
    throw new Error(`group without a numeric id: ${JSON.stringify(raw)}`)
  }
  if (!raw.acronym) {
    throw new Error(`group ${raw.id} has no acronym`)
  }
  if (!raw.name) {
    throw new Error(`group ${raw.acronym} has no name`)
  }
  const listArchive = absoluteUrl(raw.list_archive)
  const parentId = idFromUri(raw.parent ?? undefined)
  return {
    id: raw.id,
    acronym: raw.acronym,
    name: raw.name,
    type: slugFromUri(raw.type) ?? '',
    state: slugFromUri(raw.state) ?? '',
    uri: groupUri(raw.acronym),
    apiUrl: raw.resource_uri
      ? new URL(raw.resource_uri, IETF_API).href
      : groupApiUrl(raw.id),
    ...(raw.description?.trim()
      ? { description: raw.description.trim() }
      : {}),
    ...(listArchive ? { listArchive } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  }
}

/** All Datatracker groups of type `area` (17, including concluded ones). */
export async function fetchIetfAreas(): Promise<IetfGroupRef[]> {
  const raw = await fetchIetfList<DatatrackerGroup>('/group/group/', {
    type__slug: 'area',
  })
  return raw
    .map(toGroupRef)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Groups that belong in the catalog: every state (active, concluded, BOF,
 * replaced, abandoned) and every type except the ones in
 * `EXCLUDED_GROUP_TYPES` (areas have their own stage; `sdo` are external
 * liaison bodies; `nomcom` are historical committees).
 *
 * Inactive groups are required: most RFCs were produced by WGs that have since
 * concluded, and `document.group` is how a spec gets its `ex:specification`
 * link.
 */
export async function fetchIetfGroups(): Promise<IetfGroupRef[]> {
  const raw = await fetchIetfList<DatatrackerGroup>('/group/group/')
  return raw
    .map(toGroupRef)
    .filter((group) => !EXCLUDED_GROUP_TYPES.has(group.type))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface GroupExtResources {
  homepage?: string
  githubOrg?: string
  wiki?: string
}

/** `webpage`, `github_org` and `wiki` links of every in-scope group (2 pages). */
export async function fetchIetfGroupExtResources(): Promise<
  Map<number, GroupExtResources>
> {
  const raw = await fetchIetfList<DatatrackerExtResource>(
    '/group/groupextresource/',
  )
  const byGroup = new Map<number, GroupExtResources>()
  for (const row of raw) {
    const groupId = idFromUri(row.group)
    const slug = slugFromUri(row.name)
    const value = absoluteUrl(row.value)
    if (groupId === undefined || !slug || !value) continue
    const entry = byGroup.get(groupId) ?? {}
    if (slug === 'webpage' && !entry.homepage) entry.homepage = value
    else if (slug === 'github_org' && !entry.githubOrg) entry.githubOrg = value
    else if (slug === 'wiki' && !entry.wiki) entry.wiki = value
    byGroup.set(groupId, entry)
  }
  return byGroup
}

/**
 * Group type labels (`wg` → "Working Group"). Static for a run, and both the
 * groups stage and later UI work need it, so it is memoised per worker process.
 */
let typeLabelsPromise: Promise<Map<string, string>> | undefined

export function fetchIetfGroupTypeLabels(): Promise<Map<string, string>> {
  typeLabelsPromise ??= fetchIetfList<DatatrackerGroupTypeName>(
    '/name/grouptypename/',
    {},
    { orderBy: null },
  )
    .then((rows) => {
      const labels = new Map<string, string>()
      for (const row of rows) {
        const slug = row.slug ?? slugFromUri(row.resource_uri)
        const label = row.verbose_name?.trim() || row.name?.trim()
        if (slug && label) labels.set(slug, label)
      }
      return labels
    })
    .catch((error) => {
      // Do not poison later calls with a rejected promise.
      typeLabelsPromise = undefined
      throw error
    })
  return typeLabelsPromise
}

function skippedStep(step: StageName, reason: string): IetfStepResult {
  return { step, skipped: true, reason }
}

/** Cross-SDO group-URL check reads the whole data/dump tree. */
const allDumpsRoot = () =>
  process.env.ALL_STAGES_DIR ?? join(stagesDir(), '..')

/** Step 1: IETF areas, published before groups so ex:parent always resolves. */
export async function storeIetfAreas(): Promise<IetfStepResult> {
  if (hasStage('areas')) {
    return skippedStep('areas', 'areas.nq already exists')
  }
  try {
    const areas = await fetchIetfAreas()
    validateAreas(
      areas,
      existingGroupUris(allDumpsRoot(), STAGE_FILES.groups),
    )
    const quads: Quad[] = buildAreaQuads(areas)
    const file = await writeStage('areas', quads)
    const concluded = areas.filter((area) => area.state !== 'active').length
    return {
      step: 'areas',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${areas.length} areas (${concluded} concluded)`,
    }
  } catch (error) {
    failStage('areas', error)
    throw error
  }
}

/**
 * Step 2: groups in every state, with type labels, state, parent and their
 * external links. Areas are already published by `areas.nq`.
 */
export async function storeIetfGroups(): Promise<IetfStepResult> {
  if (hasStage('groups')) {
    return skippedStep('groups', 'groups.nq already exists')
  }
  try {
    const [groups, extResources, typeLabels] = await Promise.all([
      fetchIetfGroups(),
      fetchIetfGroupExtResources(),
      fetchIetfGroupTypeLabels(),
    ])
    validateGroups(
      groups,
      existingGroupUris(allDumpsRoot(), STAGE_FILES.groups),
    )

    // Parents are either areas (previous stage) or groups in this stage.
    const areaIndex = readAreaIndex()
    const uriById = new Map<number, string>(areaIndex)
    for (const group of groups) uriById.set(group.id, group.uri)

    const missingParents: string[] = []
    const resolved = groups.map((group) => {
      const ext = extResources.get(group.id) ?? {}
      const parentUri =
        group.parentId === undefined ? undefined : uriById.get(group.parentId)
      if (group.parentId !== undefined && parentUri === undefined) {
        missingParents.push(`${group.acronym} -> ${group.parentId}`)
      }
      return {
        ...group,
        ...(parentUri ? { parentUri } : {}),
        ...(ext.homepage ? { homepage: ext.homepage } : {}),
        ...(ext.githubOrg ? { githubOrg: ext.githubOrg } : {}),
        ...(ext.wiki ? { wiki: ext.wiki } : {}),
      }
    })

    // A dangling ex:parent is worse than a missing one: report instead of emitting.
    if (missingParents.length > 0) {
      console.warn(
        `groups: ${missingParents.length} parent(s) outside the catalog: ${missingParents.slice(0, 10).join(', ')}`,
      )
    }

    const quads: Quad[] = buildGroupQuads(resolved, typeLabels)
    const file = await writeStage('groups', quads)
    const withParent = resolved.filter((group) => group.parentUri).length
    const concluded = resolved.filter((group) => group.state !== 'active').length
    return {
      step: 'groups',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${resolved.length} groups (${concluded} not active; ${withParent} with ex:parent, ${missingParents.length} unresolved)`,
    }
  } catch (error) {
    failStage('groups', error)
    throw error
  }
}

/**
 * BCP/STD/FYI subseries and their members, from the `contains` relationships
 * (450 rows, one page). Datatracker has the subseries documents too, but their
 * `title` is empty, so the display name is derived from the document name
 * (`bcp14` → `BCP 14`) — no extra request.
 */
export async function fetchIetfSeries(): Promise<IetfSeriesRef[]> {
  const rows = await fetchIetfList<DatatrackerRelatedDocument>(
    '/doc/relateddocument/',
    { relationship__slug: 'contains' },
  )

  const members = new Map<string, Set<string>>()
  for (const row of rows) {
    const series = slugFromUri(row.source)
    const member = slugFromUri(row.target)
    if (!series || !member) continue
    const set = members.get(series) ?? new Set<string>()
    set.add(member)
    members.set(series, set)
  }

  const collator = new Intl.Collator(undefined, { numeric: true })
  return [...members.entries()]
    .map(([name, set]) => {
      const label = seriesLabel(name)
      if (!label) {
        throw new Error(`unexpected subseries name in Datatracker: ${name}`)
      }
      return {
        name,
        label,
        kind: name.replace(/\d+$/, ''),
        uri: seriesUri(name),
        apiUrl: `${IETF_API}/doc/document/${name}/`,
        members: [...set].sort((a, b) => collator.compare(a, b)),
      }
    })
    .sort((a, b) => collator.compare(a.name, b.name))
}

/** Step 2: subseries (BCP/STD/FYI) and their member RFCs. */
export async function storeIetfSeries(): Promise<IetfStepResult> {
  if (hasStage('series')) {
    return skippedStep('series', 'series.nq already exists')
  }
  try {
    const series = await fetchIetfSeries()
    validateSeries(series)
    const quads: Quad[] = buildSeriesQuads(series)
    const file = await writeStage('series', quads)
    const links = series.reduce((sum, entry) => sum + entry.members.length, 0)
    const kinds = series.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.kind] = (acc[entry.kind] ?? 0) + 1
      return acc
    }, {})
    return {
      step: 'series',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${series.length} series (${Object.entries(kinds)
        .map(([kind, count]) => `${count} ${kind.toUpperCase()}`)
        .join(', ')}), ${links} member links`,
    }
  } catch (error) {
    failStage('series', error)
    throw error
  }
}

/**
 * Published RFCs as Datatracker knows them: owning group, stream, status level
 * and the REST link (10 pages).
 */
export async function fetchIetfDocuments(): Promise<DatatrackerDocument[]> {
  return fetchIetfList<DatatrackerDocument>('/doc/document/', {
    type__slug: 'rfc',
  })
}

const RFC_INDEX_URL = 'https://www.rfc-editor.org/rfc-index.xml'

/**
 * The RFC Editor index (13.7 MB, one request) parsed with cheerio, keyed by RFC
 * number. It is the authoritative source for title, status, date, obsoletes /
 * updates, DOI, errata and the `<draft>` an RFC was published from.
 */
let rfcIndexPromise: Promise<Map<number, RfcIndexEntry>> | undefined

/**
 * One download per worker process: `specs` and `spec-people` both need the
 * index, and they run in the same container.
 */
export function fetchRfcIndex(): Promise<Map<number, RfcIndexEntry>> {
  rfcIndexPromise ??= loadRfcIndex().catch((error) => {
    rfcIndexPromise = undefined
    throw error
  })
  return rfcIndexPromise
}

async function loadRfcIndex(): Promise<Map<number, RfcIndexEntry>> {
  const response = await fetch(RFC_INDEX_URL, {
    headers: { Accept: 'application/xml', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw new Error(
      `RFC index ${RFC_INDEX_URL}: HTTP ${response.status} ${response.statusText}`,
    )
  }
  const $ = cheerio.load(await response.text(), { xmlMode: true })
  const text = (el: cheerio.Cheerio<any>, selector: string) =>
    el.find(selector).first().text().trim() || undefined
  const docIds = (el: cheerio.Cheerio<any>, selector: string) =>
    el
      .find(`${selector} doc-id`)
      .map((_, node) => $(node).text().trim().toLowerCase())
      .get()
      .filter(Boolean)

  const index = new Map<number, RfcIndexEntry>()
  $('rfc-entry').each((_, element) => {
    const entry = $(element)
    const number = rfcNumberFromDocId(text(entry, 'doc-id'))
    if (number === undefined || index.has(number)) return
    const date = entry.find('date').first()
    index.set(number, {
      number,
      title: text(entry, 'title') ?? '',
      ...(text(entry, 'current-status')
        ? { status: text(entry, 'current-status') }
        : {}),
      ...(text(entry, 'stream') ? { stream: text(entry, 'stream') } : {}),
      ...(rawDateFromParts(
        date.find('month').text(),
        date.find('year').text(),
        date.find('day').text(),
      )
        ? {
            date: rawDateFromParts(
              date.find('month').text(),
              date.find('year').text(),
              date.find('day').text(),
            ),
          }
        : {}),
      ...(text(entry, 'page-count') ? { pages: text(entry, 'page-count') } : {}),
      ...(text(entry, 'doi') ? { doi: text(entry, 'doi') } : {}),
      ...(text(entry, 'errata-url')
        ? { errata: text(entry, 'errata-url') }
        : {}),
      ...(draftNameFromIndex(text(entry, 'draft'))
        ? { draft: draftNameFromIndex(text(entry, 'draft')) }
        : {}),
      obsoletes: docIds(entry, 'obsoletes'),
      obsoletedBy: docIds(entry, 'obsoleted-by'),
      updates: docIds(entry, 'updates'),
      updatedBy: docIds(entry, 'updated-by'),
      authors: entry
        .find('author')
        .map((_, author) => {
          const node = $(author)
          return {
            name: node.find('name').text().trim(),
            ...(node.find('title').text().trim()
              ? { title: node.find('title').text().trim() }
              : {}),
          }
        })
        .get()
        .filter((author) => author.name),
    })
  })
  return index
}

/** Group silo ids published by one stage file (`areas.nq` / `groups.nq`). */
function readGroupSiloIndex(stage: 'areas' | 'groups'): Map<number, string> {
  const path = stageFile(stage)
  if (!existsSync(path)) return new Map()
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(
      readFileSync(path, 'utf8'),
    ) as Quad[],
  )
  const index = new Map<number, string>()
  for (const q of store.getQuads(null, namedNode(SILO_ID), null, null)) {
    const id = Number(q.object.value.split(':').at(-1))
    if (Number.isInteger(id)) index.set(id, q.subject.value)
  }
  return index
}

/** Area id → URI, read from `areas.nq` (groups stage needs only these). */
export function readAreaIndex(): Map<number, string> {
  const path = stageFile('areas')
  if (!existsSync(path)) {
    throw new Error(`areas.nq is missing at ${path}; run the areas stage first`)
  }
  return readGroupSiloIndex('areas')
}

/** Every group id → URI: areas plus the groups stage, when published. */
export function readGroupIndex(): Map<number, string> {
  const index = readAreaIndex()
  for (const [id, uri] of readGroupSiloIndex('groups')) index.set(id, uri)
  return index
}

/** Member RFC URI → subseries URI, read from `series.nq`. */
export function readSeriesIndex(): Map<string, string> {
  const path = stageFile('series')
  if (!existsSync(path)) {
    throw new Error(`series.nq is missing at ${path}; run the series stage first`)
  }
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(
      readFileSync(path, 'utf8'),
    ) as Quad[],
  )
  const byMember = new Map<string, string>()
  for (const q of store.getQuads(null, namedNode(HAS_SPECIFICATION), null, null)) {
    byMember.set(q.object.value, q.subject.value)
  }
  return byMember
}

export interface SpecBuildStats {
  documents: number
  missingIndex: string[]
  withoutGroup: string[]
  withoutSeries: number
  withSeries: number
}

const rfcSpecUri = (docId: string): string | undefined => {
  const number = rfcNumberFromDocId(docId)
  return number === undefined ? undefined : specUri(`rfc${number}`)
}

/** Merge Datatracker documents with the RFC index and the group/series indexes. */
export function buildIetfSpecs(
  documents: DatatrackerDocument[],
  index: ReadonlyMap<number, RfcIndexEntry>,
  groups: ReadonlyMap<number, string>,
  series: ReadonlyMap<string, string>,
): { specs: IetfSpecRef[]; stats: SpecBuildStats } {
  const specs: IetfSpecRef[] = []
  const stats: SpecBuildStats = {
    documents: documents.length,
    missingIndex: [],
    withoutGroup: [],
    withoutSeries: 0,
    withSeries: 0,
  }

  for (const document of documents) {
    const name = document.name?.trim()
    if (!name) continue
    const number =
      Number.isInteger(document.rfc_number) && document.rfc_number
        ? Number(document.rfc_number)
        : rfcNumberFromDocId(name)
    if (number === undefined) continue

    const entry = index.get(number)
    if (!entry) stats.missingIndex.push(name)

    const uri = specUri(name)
    const groupId = idFromUri(document.group ?? undefined)
    const groupUri = groupId === undefined ? undefined : groups.get(groupId)
    if (!groupUri) stats.withoutGroup.push(name)

    const seriesUri = series.get(uri)
    if (seriesUri) stats.withSeries += 1
    else stats.withoutSeries += 1

    const related = (docIds: string[]): string[] =>
      docIds
        .map(rfcSpecUri)
        .filter((target): target is string => Boolean(target))
        .filter((target) => target !== uri)

    specs.push({
      name,
      number,
      uri,
      apiUrl: document.resource_uri
        ? new URL(document.resource_uri, IETF_API).href
        : `${IETF_API}/doc/document/${name}/`,
      title: entry?.title ?? document.title?.trim() ?? '',
      ...(entry?.status ? { status: entry.status } : {}),
      ...(entry?.stream ? { stream: entry.stream } : {}),
      ...(entry?.date ? { date: entry.date } : {}),
      ...(entry?.pages ? { pages: entry.pages } : {}),
      ...(entry?.doi ? { doi: entry.doi } : {}),
      ...(entry?.errata ? { errata: entry.errata } : {}),
      ...(entry?.draft ? { draft: entry.draft } : {}),
      ...(groupUri ? { groupUri } : {}),
      ...(seriesUri ? { seriesUri } : {}),
      obsoletes: related(entry?.obsoletes ?? []),
      obsoletedBy: related(entry?.obsoletedBy ?? []),
      updates: related(entry?.updates ?? []),
      updatedBy: related(entry?.updatedBy ?? []),
    })
  }

  specs.sort((a, b) => a.number - b.number)
  return { specs, stats }
}

/** Step 4: every published RFC, with its owning group and subseries. */
export async function storeIetfSpecs(): Promise<IetfStepResult> {
  if (hasStage('specs')) {
    return skippedStep('specs', 'specs.nq already exists')
  }
  try {
    const [documents, index] = await Promise.all([
      fetchIetfDocuments(),
      fetchRfcIndex(),
    ])
    const groups = readGroupIndex()
    const series = readSeriesIndex()
    const { specs, stats } = buildIetfSpecs(documents, index, groups, series)
    validateSpecs(specs)

    const quads: Quad[] = buildSpecQuads(specs)
    const file = await writeStage('specs', quads)

    if (stats.missingIndex.length > 0) {
      console.warn(
        `specs: ${stats.missingIndex.length} RFC(s) missing from the index: ${stats.missingIndex.slice(0, 10).join(', ')}`,
      )
    }
    if (stats.withoutGroup.length > 0) {
      console.warn(
        `specs: ${stats.withoutGroup.length} RFC(s) without a catalogued group: ${stats.withoutGroup.slice(0, 10).join(', ')}`,
      )
    }

    return {
      step: 'specs',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${specs.length} RFCs (${stats.withSeries} in a subseries, ${stats.withoutGroup.length} without group, ${stats.missingIndex.length} missing from the index)`,
    }
  } catch (error) {
    failStage('specs', error)
    throw error
  }
}

/** Authorship rows of every published RFC (22 pages). */
export async function fetchIetfDocumentAuthors(): Promise<
  DatatrackerDocumentAuthor[]
> {
  return fetchIetfList<DatatrackerDocumentAuthor>('/doc/documentauthor/', {
    document__type__slug: 'rfc',
  })
}

/** Person records for the given Datatracker ids, batched with `id__in`. */
export async function fetchIetfPersons(
  ids: number[],
): Promise<Map<number, DatatrackerPerson>> {
  const people = new Map<number, DatatrackerPerson>()
  const batchSize = 200
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize)
    const rows = await fetchIetfList<DatatrackerPerson>('/person/person/', {
      id__in: batch.join(','),
    })
    for (const row of rows) {
      if (row.id !== undefined) people.set(row.id, row)
    }
  }
  return people
}

export interface PersonExtResources {
  githubUsername?: string
  orcid?: string
}

/** GitHub / ORCID links for every person that has them (2 pages, all rows). */
export async function fetchIetfPersonExtResources(): Promise<
  Map<number, PersonExtResources>
> {
  const rows = await fetchIetfList<DatatrackerPersonExtResource>(
    '/person/personextresource/',
  )
  const byPerson = new Map<number, PersonExtResources>()
  for (const row of rows) {
    const personId = idFromUri(row.person)
    const name = slugFromUri(row.name)
    const value = row.value?.trim()
    if (personId === undefined || !name || !value) continue
    const entry = byPerson.get(personId) ?? {}
    if (name === 'github_username' && !entry.githubUsername) {
      entry.githubUsername = value.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/+$/, '')
    } else if (name === 'orcid' && !entry.orcid) {
      entry.orcid = value.replace(/^https?:\/\/(www\.)?orcid\.org\//, '')
    }
    byPerson.set(personId, entry)
  }
  return byPerson
}

/** Subjects published by the specs stage, so authors only attach to real specs. */
export function readSpecSubjects(): Set<string> {
  const path = stageFile('specs')
  if (!existsSync(path)) {
    throw new Error(`specs.nq is missing at ${path}; run the specs stage first`)
  }
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(
      readFileSync(path, 'utf8'),
    ) as Quad[],
  )
  return new Set(
    store
      .getSubjects(
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://example.org#Specification'),
        null,
      )
      .map((subject) => subject.value),
  )
}

export interface AuthorsReport {
  retrievedAt: string
  counts: {
    specs: number
    specsWithAuthors: number
    legacyWithoutAuthors: number
    persons: number
    edges: number
    editors: number
    skippedAuthors: number
    specrefMatched: number
    specrefMissed: number
  }
  /** RFCs whose authors exist only as names in the index (skipped). */
  unresolved: {
    spec: string
    names: string[]
    editors: string[]
  }[]
  /** Index authors that could not be paired with a Datatracker person. */
  skipped: { spec: string; names: string[] }[]
  specrefMisses: string[]
}

const authorsReportPath = () =>
  process.env.AUTHORS_REPORT_PATH ?? join(stagesDir(), 'authors-report.json')

function writeAuthorsReport(report: AuthorsReport): string {
  const path = authorsReportPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return path
}

/**
 * Step 5: editors and authors of every published RFC, plus Specref metadata.
 *
 * Authors only ever become person IRIs: RFCs whose authorship exists solely as
 * index names (1,255 of them) get no author edges and are listed in
 * `authors-report.json` for the semi-manual pass (ietf-plan.md §7.5).
 */
export async function storeIetfSpecPeople(): Promise<IetfStepResult> {
  if (hasStage('specPeople')) {
    return skippedStep('specPeople', 'spec-people.nq already exists')
  }
  try {
    const [rows, index, extResources, specUris, specref] = await Promise.all([
      fetchIetfDocumentAuthors(),
      fetchRfcIndex(),
      fetchIetfPersonExtResources(),
      Promise.resolve(readSpecSubjects()),
      loadSpecrefEntries(
        process.env.SPECREF_PATH,
        process.env.SPECREF_URL ?? DEFAULT_SPECREF_URL,
      ),
    ])

    // documentauthor rows grouped by document, person ids collected first.
    const rowsByDocument = new Map<
      string,
      { personId: number; order: number; affiliation?: string }[]
    >()
    for (const row of rows) {
      const document = slugFromUri(row.document)
      const personId = idFromUri(row.person)
      if (!document || personId === undefined) continue
      const entry = rowsByDocument.get(document) ?? []
      entry.push({
        personId,
        order: Number.isInteger(row.order) ? Number(row.order) : 0,
        ...(row.affiliation?.trim() ? { affiliation: row.affiliation.trim() } : {}),
      })
      rowsByDocument.set(document, entry)
    }

    const personIds = [
      ...new Set(
        [...rowsByDocument.values()].flat().map((row) => row.personId),
      ),
    ].sort((a, b) => a - b)
    const persons = await fetchIetfPersons(personIds)

    // Identity map: one urn:uuid per Datatracker person, GitHub/ORCID attached.
    const nodes = new Map<number, IetfPersonNode>()
    for (const personId of personIds) {
      const person = persons.get(personId)
      const ext = extResources.get(personId) ?? {}
      const name = person?.name?.trim() ?? `IETF person ${personId}`
      const identity = resolvePerson({
        ietfPersonId: personId,
        name,
        sourceUrl: person?.resource_uri,
        ...(ext.githubUsername ? { githubUsername: ext.githubUsername } : {}),
        ...(ext.orcid ? { orcid: ext.orcid } : {}),
      })
      nodes.set(personId, {
        uri: identity.id,
        personId,
        name,
        ...(person?.resource_uri
          ? { apiUrl: new URL(person.resource_uri, IETF_API).href }
          : {}),
        ...(person?.photo_thumb ? { logo: person.photo_thumb } : {}),
        ...(ext.githubUsername ? { githubUsername: ext.githubUsername } : {}),
        ...(ext.orcid ? { orcid: ext.orcid } : {}),
        affiliations: [],
      })
    }

    // Affiliations are per document row; collect the distinct values per person.
    const affiliations = new Map<number, Set<string>>()
    for (const entries of rowsByDocument.values()) {
      for (const row of entries) {
        if (!row.affiliation) continue
        const set = affiliations.get(row.personId) ?? new Set<string>()
        set.add(row.affiliation)
        affiliations.set(row.personId, set)
      }
    }
    for (const [personId, set] of affiliations) {
      const node = nodes.get(personId)
      if (node) node.affiliations = [...set].sort((a, b) => a.localeCompare(b))
    }

    // Match index authors to rows for every published spec.
    const edges: AuthorshipEdge[] = []
    const report: AuthorsReport = {
      retrievedAt: new Date().toISOString(),
      counts: {
        specs: specUris.size,
        specsWithAuthors: 0,
        legacyWithoutAuthors: 0,
        persons: nodes.size,
        edges: 0,
        editors: 0,
        skippedAuthors: 0,
        specrefMatched: 0,
        specrefMissed: 0,
      },
      unresolved: [],
      skipped: [],
      specrefMisses: [],
    }

    const specrefIndexes = buildSpecrefIndexes(specref.entries)
    const specrefQuads: Quad[] = []

    for (const number of [...index.keys()].sort((a, b) => a - b)) {
      const entry = index.get(number)!
      const name = `rfc${number}`
      const uri = specUri(name)
      if (!specUris.has(uri)) continue

      const authors: IndexAuthor[] = entry.authors.map((author) => ({
        name: author.name,
        editor: (author.title ?? '').toLowerCase().startsWith('editor'),
      }))
      const docRows = rowsByDocument.get(name)

      // Specref metadata covers every spec, with or without authorship.
      const match = matchSpec(
        { uri, shortlink: uri, shortname: name, title: entry.title },
        specrefIndexes,
      )
      if (match.status === 'matched') {
        report.counts.specrefMatched += 1
        specrefQuads.push(
          ...importableSpecrefQuads(buildSpecrefQuads(uri, match.entry)),
        )
      } else {
        report.counts.specrefMissed += 1
        report.specrefMisses.push(name)
      }

      if (!docRows || docRows.length === 0) {
        report.counts.legacyWithoutAuthors += 1
        report.unresolved.push({
          spec: uri,
          names: authors.map((author) => author.name),
          editors: authors
            .filter((author) => author.editor)
            .map((author) => author.name),
        })
        continue
      }

      const { matched, unmatched } = matchIndexAuthors(
        authors,
        docRows.map((row) => ({
          personId: row.personId,
          personName: nodes.get(row.personId)?.name ?? '',
          order: row.order,
          ...(row.affiliation ? { affiliation: row.affiliation } : {}),
        })),
      )
      if (unmatched.length > 0) {
        report.counts.skippedAuthors += unmatched.length
        report.skipped.push({ spec: uri, names: unmatched })
      }
      if (matched.length === 0) continue

      report.counts.specsWithAuthors += 1
      for (const author of matched) {
        const node = nodes.get(author.personId)
        if (!node) continue
        edges.push({
          specUri: uri,
          personUri: node.uri,
          editor: author.editor,
        })
        if (author.editor) report.counts.editors += 1
      }

    }

    const personUris = new Set([...nodes.values()].map((node) => node.uri))
    validateAuthorship(edges, specUris, personUris)
    report.counts.edges = edges.length

    const usedPeople = new Set(edges.map((edge) => edge.personUri))
    const personQuads = buildAuthorPersonQuads(
      [...nodes.values()].filter((node) => usedPeople.has(node.uri)),
    )
    const quads: Quad[] = [
      ...personQuads,
      ...buildAuthorshipQuads(edges),
      ...specrefQuads,
    ]
    const file = await writeStage('specPeople', quads)
    writeNewIdentities()
    writeAuthorsReport(report)

    if (report.unresolved.length > 0) {
      console.warn(
        `spec-people: ${report.unresolved.length} RFC(s) have no person-linked authors (see ${authorsReportPath()})`,
      )
    }

    return {
      step: 'specPeople',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${edges.length} author/editor links (${report.counts.editors} editors) over ${usedPeople.size} people; ${report.counts.legacyWithoutAuthors} RFCs without authors; Specref ${report.counts.specrefMatched}/${report.counts.specrefMatched + report.counts.specrefMissed}`,
    }
  } catch (error) {
    failStage('specPeople', error)
    throw error
  }
}

/**
 * Normative and informative references of every published RFC (refnorm 50,042
 * rows + refinfo 64,050 + refunk 69). `refunk` ("possible reference") is
 * counted but never turned into an edge, because its nature is unknown.
 */
export async function fetchIetfCitations(): Promise<{
  raw: RawCitation[]
  refunk: number
}> {
  const sweeps: { slug: string; nature?: CitationNature }[] = [
    { slug: 'refnorm', nature: 'normative' },
    { slug: 'refinfo', nature: 'informative' },
    // Not a citation kind we can classify; fetched only to report the count.
    { slug: 'refunk' },
  ]
  const raw: RawCitation[] = []
  let refunk = 0

  for (const sweep of sweeps) {
    const rows = await fetchIetfList<DatatrackerCitationRow>(
      '/doc/relateddocument/',
      { source__type__slug: 'rfc', relationship__slug: sweep.slug },
    )
    if (!sweep.nature) {
      refunk += rows.length
      continue
    }
    for (const row of rows) {
      const source = slugFromUri(row.source)
      const target = slugFromUri(row.target)
      if (!source || !target) continue
      raw.push({ source, target, nature: sweep.nature })
    }
  }
  return { raw, refunk }
}

/** Subseries shortname → node URI and member RFC URIs, read from `series.nq`. */
export function readSeriesMembers(): Map<string, SeriesMembers> {
  const path = stageFile('series')
  if (!existsSync(path)) {
    throw new Error(`series.nq is missing at ${path}; run the series stage first`)
  }
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(
      readFileSync(path, 'utf8'),
    ) as Quad[],
  )
  const byName = new Map<string, SeriesMembers>()
  const shortname = namedNode('http://example.org#shortname')
  for (const q of store.getQuads(
    null,
    namedNode('http://example.org#hasSpecification'),
    null,
    null,
  )) {
    const name = store.getObjects(q.subject, shortname, null)[0]?.value
    if (!name) continue
    const entry = byName.get(name) ?? { uri: q.subject.value, members: [] }
    entry.members.push(q.object.value)
    byName.set(name, entry)
  }
  for (const entry of byName.values()) entry.members.sort()
  return byName
}

export interface CitationsReport {
  retrievedAt: string
  source: string
  counts: {
    specs: number
    sources: number
    edges: number
    normative: number
    informative: number
    seriesExpanded: number
    selfReferences: number
    duplicates: number
    conflicts: number
    outOfCatalogTargets: number
    outOfCatalogRows: number
    missingSource: number
    refunk: number
  }
  documents: {
    spec: string
    shortname: string
    normative: number
    informative: number
  }[]
  /** Most referenced documents that are not in the catalog. */
  outOfCatalog: { target: string; references: number }[]
}

const citationsReportPath = () =>
  process.env.CITATIONS_REPORT_PATH ?? join(stagesDir(), 'citations-report.json')

function writeCitationsReport(report: CitationsReport): string {
  const path = citationsReportPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return path
}

/**
 * Step 6: normative and informative references between published RFCs.
 *
 * Unlike W3C this stage writes no SPARQL and deletes nothing: the stage file is
 * the artifact, so a rerun that deleted `citations.nq` recomputes it from
 * scratch (ietf-plan.md §7.6).
 */
export async function storeIetfCitations(): Promise<IetfStepResult> {
  if (hasStage('citations')) {
    return skippedStep('citations', 'citations.nq already exists')
  }
  try {
    const [{ raw, refunk }, specUris, series] = await Promise.all([
      fetchIetfCitations(),
      Promise.resolve(readSpecSubjects()),
      Promise.resolve(readSeriesMembers()),
    ])

    const resolved = resolveCitations(raw, specUris, series)
    validateCitations(
      resolved.edges,
      specUris,
      new Set([...series.values()].map((entry) => entry.uri)),
    )

    const quads: Quad[] = buildCitationQuads(resolved.edges)
    const file = await writeStage('citations', quads)

    const perSource = new Map<string, { normative: number; informative: number }>()
    for (const edge of resolved.edges) {
      const entry = perSource.get(edge.source) ?? { normative: 0, informative: 0 }
      if (edge.nature === 'normative') entry.normative += 1
      else entry.informative += 1
      perSource.set(edge.source, entry)
    }

    const report: CitationsReport = {
      retrievedAt: new Date().toISOString(),
      source: 'datatracker relateddocument (refnorm/refinfo)',
      counts: { specs: specUris.size, ...resolved.counts, refunk },
      documents: [...perSource.entries()]
        .map(([uri, counts]) => ({
          spec: uri,
          shortname: slugFromUri(uri) ?? '',
          ...counts,
        }))
        .sort((a, b) => a.shortname.localeCompare(b.shortname)),
      outOfCatalog: resolved.outOfCatalog
        .slice(0, 100)
        .map(([target, references]) => ({ target, references })),
    }
    writeCitationsReport(report)

    return {
      step: 'citations',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${resolved.counts.edges} edges from ${resolved.counts.sources} specs (${resolved.counts.normative} normative, ${resolved.counts.informative} informative, ${resolved.counts.seriesExpanded} from subseries fan-out); ${resolved.counts.outOfCatalogTargets} out-of-catalog targets`,
    }
  } catch (error) {
    failStage('citations', error)
    throw error
  }
}

/** The seed graph for later steps: completed stage files in dependency order. */
export interface IetfSeedRef {
  paths: string[]
  source: string
}

export function loadIetfSeed(): IetfSeedRef {
  const paths = stageSeedFiles()
  return paths.length > 0
    ? { paths, source: paths.join(', ') }
    : { paths: [], source: 'empty dataset' }
}
