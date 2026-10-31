// Temporal activities for the W3C API workflow. Network I/O, seed loading and
// RDF building live here; the workflow stays deterministic and only sequences.
//
// The workflow is stage-file first: every step skips when its .nq already
// exists. A fresh dataset starts with the W3C groups, then their members,
// specifications, spec→people links and finally spec→spec citation edges. A
// failed stage writes a .log and publishes no .nq.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pThrottle from 'p-throttle'
import type { Quad } from 'n3'
import { endpointFor, sanitizeNQuads } from '../software-dependencies/activities.ts'
import {
  buildCitationQuads,
  citationDeleteUpdate,
} from '../citations/build.ts'
import { collectCitations } from '../citations/collect.ts'
import {
  citationTotals,
  summarizeCitations,
  writeCitationReport,
} from '../citations/report.ts'
import type { CitationReport } from '../citations/report.ts'
import type { CatalogSpec } from '../citations/types.ts'
import { buildPersonNameIndex } from '../specref/authors.ts'
import { linkSpecifications } from '../specref/link.ts'
import { specrefMetadataDeleteUpdate } from '../specref/metadata.ts'
import {
  DEFAULT_SPECREF_URL,
  loadSpecrefEntries,
} from '../specref/source.ts'
import {
  buildEditorQuads,
  buildGroupQuads,
  buildParticipantQuads,
  buildSpecificationQuads,
  collectPeople,
  serializeQuads,
  BIBO_EDITOR,
  EDITOR_DRAFT,
  GROUP_CLASS,
  GROUP_TYPE,
  NAME,
  PERSON_TYPE,
  SHORTNAME,
  SILO_ID,
  SPECIFICATION_TYPE,
  W3C_API_URL,
  W3C_LATEST_VERSION_URL,
  W3C_SILO_PREFIX,
} from './analysis.ts'
import type {
  W3cEditor,
  W3cGroupParticipants,
  W3cGroupRef,
  W3cGroupSpecifications,
  W3cParticipant,
  W3cPersonRef,
  W3cSpecification,
  W3cSpecificationEditors,
} from './analysis.ts'
import type {
  W3cApiGroupDetail,
  W3cApiSpecification,
  W3cApiUserDetail,
} from 'node-w3capi'
import { stagesDir, writeNewIdentities } from './identity.ts'
import {
  existingGroupUris,
  failStage,
  hasStage,
  stageSeedFiles,
  writeStage,
} from './stages.ts'

/** Citations report lives next to the W3C stage files. */
export const DEFAULT_CITATIONS_REPORT_PATH = join(
  stagesDir(),
  'citations-report.json',
)

const W3C_API = 'https://api.w3.org'

/** api.w3.org pages at 100 items by default; ask for the maximum instead. */
const ITEMS_PER_PAGE = 1000

/** Stay at the W3C API's 6000 requests / 10 minutes average. */
const W3C_RATE_LIMIT = { limit: 10, interval: 1000 }
const MAX_W3C_ATTEMPTS = 2
const W3C_RATE_LIMIT_WAIT_MS = 12 * 60_000

/**
 * Everything later activities need to reconstruct the seed graph. The dump
 * itself is passed by path, not by value: it grows with every run and would
 * blow past Temporal's payload limits.
 */
export interface SeedRef {
  /** Completed stage files on the worker, in dependency order. */
  paths: string[]
  source: string
}

/** The seed graph: concatenated stage files, or empty for a fresh dataset. */
export async function readSeed(seed: SeedRef): Promise<string> {
  const parts = await Promise.all(
    seed.paths.map((path) => readFile(path, 'utf-8')),
  )
  return parts.join('\n')
}

/** Completed stage files are the resume seed; missing files mean fresh stages. */
export async function loadSeed(): Promise<SeedRef> {
  const paths = stageSeedFiles()
  return paths.length > 0
    ? { paths, source: paths.join(', ') }
    : { paths: [], source: 'empty dataset' }
}

/**
 * One W3C API list page-set. `items=1000` keeps pagination to a minimum (the
 * API defaults to 100), and `embed=true` returns full objects instead of links
 * so no follow-up requests are needed per item.
 */
const throttledW3cFetch = pThrottle(W3C_RATE_LIMIT)((url: URL) =>
  fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  }),
)

/** One JSON response; on 429 suspend for 12 minutes and retry. */
async function fetchW3cJson<T>(url: URL): Promise<T> {
  for (let attempt = 1; attempt <= MAX_W3C_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await throttledW3cFetch(url)
    } catch (error) {
      if (attempt >= MAX_W3C_ATTEMPTS) throw error
      console.warn(
        `W3C API request failed at ${url}; retrying: ${errorMessage(error)}`,
      )
      await sleep(1000 * attempt)
      continue
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '')
      const delay = Math.min(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : W3C_RATE_LIMIT_WAIT_MS,
        W3C_RATE_LIMIT_WAIT_MS,
      )
      console.warn(
        `W3C API rate limit at ${url}; suspending ${Math.round(delay / 1000)}s (attempt ${attempt}/${MAX_W3C_ATTEMPTS})`,
      )
      await sleep(delay)
      continue
    }
    if (!response.ok) {
      throw new Error(
        `W3C API ${url}: HTTP ${response.status} ${response.statusText}`,
      )
    }
    return (await response.json()) as T
  }
  throw new Error(`W3C API rate limit persisted at ${url}`)
}

async function fetchW3cList<T>(path: string, key: string): Promise<T[]> {
  const items: T[] = []
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const url = new URL(path, W3C_API)
    url.searchParams.set('embed', 'true')
    url.searchParams.set('items', String(ITEMS_PER_PAGE))
    url.searchParams.set('page', String(page))
    const body = await fetchW3cJson<{
      pages?: number
      _embedded?: Record<string, T[]>
    }>(url)
    items.push(...(body._embedded?.[key] ?? []))
    pages = body.pages ?? 1
  }
  return items
}

/** Derive the public group page when the W3C API has no homepage link. */
export function fallbackGroupHomepage(
  apiUrl: string,
  shortname: string | undefined,
): string | undefined {
  if (!shortname) return undefined
  const match = /^\/groups\/([^/]+)\//.exec(new URL(apiUrl).pathname)
  if (!match?.[1]) return undefined
  return `https://www.w3.org/groups/${match[1]}/${encodeURIComponent(shortname)}/`
}

/** All W3C groups, regardless of type (wg, cg, bg, ig, tf, …). */
export async function fetchW3cGroups(): Promise<W3cGroupRef[]> {
  const groups = await fetchW3cList<W3cApiGroupDetail>('/groups', 'groups')
  // Key by API self link, not homepage: duplicate homepages must stay visible
  // so the groups stage can fail with a useful log instead of silently
  // dropping a group.
  const refs = new Map<string, W3cGroupRef>()
  for (const group of groups) {
    const apiUrl = group._links?.self?.href
    if (!apiUrl || !Number.isInteger(group.id) || !group.name) continue
    const homepage =
      group._links?.homepage?.href ??
      fallbackGroupHomepage(apiUrl, group.shortname)
    const uri = homepage ?? apiUrl
    refs.set(apiUrl, {
      uri,
      apiUrl,
      ...(homepage ? { homepage } : {}),
      id: group.id,
      name: group.name,
      ...(group.shortname ? { shortname: group.shortname } : {}),
      ...(group.type ? { type: group.type } : {}),
    })
  }
  return [...refs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Participants of one W3C group, as api.w3.org lists them.
 *
 * `embed` returns each participant's numeric W3C user id, name, self link,
 * photos and connected accounts in the same response, so one request per
 * 1000 participants is enough. The numeric W3C id joins against the seed's
 * "w3c:<id>" siloIds; the GitHub account lets future dumps crawl from them.
 */
export async function fetchW3cParticipants(
  group: W3cGroupRef,
): Promise<W3cParticipant[]> {
  const users = await fetchW3cList<W3cApiUserDetail>(
    `${group.apiUrl}/users`,
    'users',
  )
  const participants: W3cParticipant[] = []
  for (const user of users) {
    const href = user._links?.self?.href
    if (!href || !Number.isInteger(user.id) || !user.name) continue
    const github = user['connected-accounts']?.find(
      (account) => account.service === 'github',
    )
    participants.push({
      id: user.id,
      href,
      name: user.name,
      photo: pickPhoto(user),
      ...(github
        ? { githubId: github.identifier, githubUsername: github.nickname }
        : {}),
    })
  }
  return participants.sort((a, b) => a.name.localeCompare(b.name))
}

/** The API's thumbnail photo for a user, when the account has one. */
function pickPhoto(user: W3cApiUserDetail): string | undefined {
  const photos = user._links?.photos ?? []
  return (photos.find((photo) => photo.name === 'thumbnail') ?? photos[0])?.href
}

/**
 * A run stores ~10k quads, which is more than the nginx proxy accepts in one
 * request (its default body limit is 1 MB; oversized uploads get their socket
 * closed before the 413 is readable). Send small batches instead so every
 * request stays well below any proxy limit and a retry only repeats one batch.
 */
const STORE_BATCH_SIZE = 500

async function postNQuads(what: string, nquads: string): Promise<void> {
  const endpoint = endpointFor('store')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/n-quads' },
    body: nquads,
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    console.error('Failed batch preview:')
    console.error(nquads.split('\n').slice(0, 20).join('\n'))
    throw new Error(
      `Failed to store ${what} at ${endpoint}: HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
    )
  }
}

async function postUpdate(what: string, update: string): Promise<void> {
  const endpoint = endpointFor('update')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: update,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to update ${what} at ${endpoint}: HTTP ${response.status} ${response.statusText}`,
    )
  }
}

interface SparqlBinding {
  value: string
}

interface SparqlResultDocument {
  results: { bindings: Array<Record<string, SparqlBinding>> }
}

/** Run a SELECT and return plain string rows. */
async function queryRows(
  query: string,
): Promise<Array<Record<string, string>>> {
  const endpoint = endpointFor('query')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      Accept: 'application/sparql-results+json',
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to query ${endpoint}: HTTP ${response.status} ${response.statusText}`,
    )
  }
  const data = (await response.json()) as SparqlResultDocument
  return data.results.bindings.map((binding) =>
    Object.fromEntries(
      Object.entries(binding).map(([key, value]) => [key, value.value]),
    ),
  )
}

/** All catalog specs from the live store, with an optional latest version. */
export async function fetchCatalogSpecifications(): Promise<CatalogSpec[]> {
  const rows = await queryRows(`SELECT ?spec ?shortname ?version WHERE {
    ?spec a <${SPECIFICATION_TYPE}> .
    OPTIONAL { ?spec <${SHORTNAME}> ?shortname }
    OPTIONAL { ?spec <${W3C_LATEST_VERSION_URL}> ?version }
  }`)
  const specs: CatalogSpec[] = []
  for (const row of rows) {
    if (!row.spec) continue
    specs.push({
      uri: row.spec,
      ...(row.shortname ? { shortname: row.shortname } : {}),
      ...(row.version ? { latestVersionUrl: row.version } : {}),
    })
  }
  return specs.sort((a, b) => a.uri.localeCompare(b.uri))
}

/** Split N-Quads text into batches. N-Quads is line-oriented (one quad/line). */
function batchNQuads(nquads: string, size: number): string[] {
  const lines = nquads.split('\n').filter((line) => line.trim() !== '')
  const batches: string[] = []
  for (let i = 0; i < lines.length; i += size) {
    batches.push(lines.slice(i, i + size).join('\n') + '\n')
  }
  return batches
}

/** Load the seed graph into the SPARQL store as-is (dump or generated record). */
export async function seedBase(seed: SeedRef): Promise<string> {
  const { quads, dropped } = sanitizeNQuads(await readSeed(seed))
  if (dropped > 0) {
    console.warn(`seedBase: dropped ${dropped} quads with invalid IRIs`)
  }
  for (const batch of batchNQuads(quads, STORE_BATCH_SIZE)) {
    await postNQuads('seed', batch)
  }
  return 'Seed graph loaded successfully'
}

/** The specifications delivered by one W3C group. */
export async function fetchW3cSpecifications(
  group: W3cGroupRef,
): Promise<W3cSpecification[]> {
  const specs = await fetchW3cList<W3cApiSpecification>(
    `${group.apiUrl}/specifications`,
    'specifications',
  )
  const specifications: W3cSpecification[] = []
  for (const spec of specs) {
    const apiUrl = spec._links?.self?.href
    const uri = spec.shortlink
    if (!apiUrl || !uri || !spec.title) continue
    specifications.push({
      uri,
      apiUrl,
      title: spec.title,
      shortname: spec.shortname,
      editorDraft: spec['editor-draft'],
      latestVersionUrl: spec._links?.['latest-version']?.href,
    })
  }
  return specifications.sort((a, b) =>
    (a.shortname ?? a.title).localeCompare(b.shortname ?? b.title),
  )
}

const fetchEditorList = (url: string) =>
  fetchW3cList<W3cApiUserDetail>(url, 'editors')

/**
 * Editors of the latest W3C API version of each specification. The API exposes
 * editors per version; versions are not modeled yet, so the spec node points at
 * the editor and records the latest version URL as provenance.
 */
export async function fetchW3cEditors(
  specifications: W3cSpecification[],
): Promise<W3cSpecificationEditors[]> {
  const unique = new Map<string, W3cSpecification>()
  for (const specification of specifications) {
    unique.set(specification.uri, specification)
  }

  return Promise.all(
    [...unique.values()].map(async (specification) => {
      if (!specification.latestVersionUrl) {
        return { specification, editors: [] }
      }
      try {
        const users = await fetchEditorList(
          `${specification.latestVersionUrl}/editors`,
        )
        const editors: W3cEditor[] = []
        for (const user of users) {
          const href = user._links?.self?.href
          if (!href || !Number.isInteger(user.id) || !user.name) continue
          const github = user['connected-accounts']?.find(
            (account) => account.service === 'github',
          )
          editors.push({
            id: user.id,
            href,
            name: user.name,
            photo: pickPhoto(user),
            ...(github
              ? {
                  githubId: github.identifier,
                  githubUsername: github.nickname,
                }
              : {}),
          })
        }
        return {
          specification,
          editors: editors.sort((a, b) => a.name.localeCompare(b.name)),
        }
      } catch (error) {
        if (isNotFound(error)) {
          return { specification, editors: [] }
        }
        console.warn(
          `Skipping editors for ${specification.uri}: ${errorMessage(error)}`,
        )
        return { specification, editors: [], error: errorMessage(error) }
      }
    }),
  )
}

export type W3cStepName =
  | 'groups'
  | 'people'
  | 'specs'
  | 'specPeople'
  | 'citations'

export interface W3cStepResult {
  step: W3cStepName
  skipped: boolean
  reason?: string
  /** Number of quads written by a step that ran. */
  stored?: number
  detail?: string
  /** Published stage file, when the step ran and completed. */
  file?: string
}

export interface CitationStepResult extends W3cStepResult {
  summary: string
  report: CitationReport
}

function skippedStep(step: W3cStepName, reason: string): W3cStepResult {
  return { step, skipped: true, reason }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A missing sub-resource (e.g. a CG with no /users or /specifications). */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && /HTTP 404/.test(error.message)
}

async function storeQuads(what: string, quads: Quad[]): Promise<void> {
  for (const batch of batchNQuads(serializeQuads(quads), STORE_BATCH_SIZE)) {
    await postNQuads(what, batch)
  }
}

async function fetchCatalogGroups(): Promise<W3cGroupRef[]> {
  const rows = await queryRows(`SELECT ?group ?name ?siloId ?apiUrl ?shortname ?type WHERE {
    ?group a <${GROUP_CLASS}> ; <${NAME}> ?name ; <${SILO_ID}> ?siloId .
    FILTER(STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
    OPTIONAL { ?group <${W3C_API_URL}> ?apiUrl }
    OPTIONAL { ?group <${SHORTNAME}> ?shortname }
    OPTIONAL { ?group <${GROUP_TYPE}> ?type }
  }`)
  const groups: W3cGroupRef[] = []
  for (const row of rows) {
    if (!row.group || !row.name || !row.siloId) continue
    const id = Number(row.siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.push({
      uri: row.group,
      apiUrl: row.apiUrl ?? row.group,
      id,
      name: row.name,
      ...(row.shortname ? { shortname: row.shortname } : {}),
      ...(row.type ? { type: row.type } : {}),
    })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchStoreSpecifications(): Promise<W3cSpecification[]> {
  const rows = await queryRows(`SELECT ?spec ?apiUrl ?name ?shortname ?editorDraft ?latestVersionUrl WHERE {
    ?spec a <${SPECIFICATION_TYPE}> .
    OPTIONAL { ?spec <${W3C_API_URL}> ?apiUrl }
    OPTIONAL { ?spec <${NAME}> ?name }
    OPTIONAL { ?spec <${SHORTNAME}> ?shortname }
    OPTIONAL { ?spec <${EDITOR_DRAFT}> ?editorDraft }
    OPTIONAL { ?spec <${W3C_LATEST_VERSION_URL}> ?latestVersionUrl }
  }`)
  const specs: W3cSpecification[] = []
  for (const row of rows) {
    if (!row.spec) continue
    specs.push({
      uri: row.spec,
      apiUrl: row.apiUrl ?? row.spec,
      title: row.name ?? row.spec,
      ...(row.shortname ? { shortname: row.shortname } : {}),
      ...(row.editorDraft ? { editorDraft: row.editorDraft } : {}),
      ...(row.latestVersionUrl ? { latestVersionUrl: row.latestVersionUrl } : {}),
    })
  }
  return specs.sort((a, b) => a.uri.localeCompare(b.uri))
}

async function fetchStorePeople(): Promise<W3cPersonRef[]> {
  const rows = await queryRows(`SELECT ?person ?name WHERE {
    ?person a <${PERSON_TYPE}> ; <${NAME}> ?name .
  }`)
  const people = new Map<string, string>()
  for (const row of rows) {
    if (row.person && row.name) people.set(row.person, row.name)
  }
  return [...people.entries()]
    .map(([uri, name]) => ({ uri, name }))
    .sort((a, b) => a.uri.localeCompare(b.uri))
}

async function fetchKnownPersonUris(): Promise<Set<string>> {
  const rows = await queryRows(`SELECT DISTINCT ?person WHERE {
    ?person a <${PERSON_TYPE}> .
  }`)
  const uris = new Set<string>()
  for (const row of rows) {
    if (row.person) uris.add(row.person)
  }
  return uris
}

/** Step 1: all W3C groups, regardless of type. */
export async function storeW3cGroups(): Promise<W3cStepResult> {
  if (hasStage('groups')) {
    return skippedStep('groups', 'groups.nq already exists')
  }
  try {
    const groups = await fetchW3cGroups()

    const missingHomepages = groups
      .filter((group) => !group.homepage)
      .map((group) => `${group.name} (${group.apiUrl})`)
    if (missingHomepages.length > 0) {
      throw new Error(
        `groups without ex:w3cApiUrl homepage:\n${missingHomepages.join('\n')}`,
      )
    }

    const byUri = new Map<string, W3cGroupRef[]>()
    for (const group of groups) {
      const entries = byUri.get(group.uri) ?? []
      entries.push(group)
      byUri.set(group.uri, entries)
    }
    const existing = existingGroupUris()
    const crossSdo = groups.filter((group) => existing.has(group.uri))
    if (crossSdo.length > 0) {
      throw new Error(
        `group homepage already used by another SDO:\n${crossSdo
          .map((group) => `${group.name}: ${group.uri}`)
          .join('\n')}`,
      )
    }

    const duplicates = [...byUri.entries()].filter(
      ([, entries]) => entries.length > 1,
    )
    if (duplicates.length > 0) {
      const detail = duplicates
        .map(
          ([uri, entries]) =>
            `${uri}: ${entries.map((group) => `${group.name} (${group.apiUrl})`).join(', ')}`,
        )
        .join('\n')
      throw new Error(`duplicate W3C group homepages:\n${detail}`)
    }

    const quads = buildGroupQuads(groups)
    if (quads.length === 0) throw new Error('groups stage produced zero quads')
    await storeQuads('W3C groups', quads)
    const file = await writeStage('groups', quads)
    return {
      step: 'groups',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${groups.length} groups`,
    }
  } catch (error) {
    failStage('groups', error)
    throw error
  }
}

/** Step 2: members of every group already in the store. */
export async function storeW3cGroupPeople(): Promise<W3cStepResult> {
  if (hasStage('people')) {
    return skippedStep('people', 'people.nq already exists')
  }
  try {
    const groups = await fetchCatalogGroups()
    const knownPersonUris = await fetchKnownPersonUris()
    const problems: string[] = []
    const fetched: W3cGroupParticipants[] = await Promise.all(
      groups.map(async (group) => {
        try {
          return {
            group,
            participants: await fetchW3cParticipants(group),
          }
        } catch (error) {
          if (!isNotFound(error)) {
            problems.push(
              `${group.name} (${group.apiUrl}): ${errorMessage(error)}`,
            )
          }
          return { group, participants: [] }
        }
      }),
    )
    if (problems.length > 0) {
      throw new Error(`group participants failed:\n${problems.join('\n')}`)
    }

    const quads = buildParticipantQuads(fetched, knownPersonUris)
    if (quads.length === 0) throw new Error('people stage produced zero quads')
    await storeQuads('W3C people', quads)
    writeNewIdentities()
    const file = await writeStage('people', quads)
    const people = new Set(
      fetched.flatMap((entry) => entry.participants.map((person) => person.id)),
    ).size
    return {
      step: 'people',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${people} people in ${groups.length} groups`,
    }
  } catch (error) {
    failStage('people', error)
    throw error
  }
}

/** Step 3: specifications delivered by every group already in the store. */
export async function storeW3cGroupSpecifications(): Promise<W3cStepResult> {
  if (hasStage('specs')) {
    return skippedStep('specs', 'specs.nq already exists')
  }
  try {
    const groups = await fetchCatalogGroups()
    const problems: string[] = []
    const fetched: W3cGroupSpecifications[] = await Promise.all(
      groups.map(async (group) => {
        try {
          return {
            group,
            specifications: await fetchW3cSpecifications(group),
          }
        } catch (error) {
          if (!isNotFound(error)) {
            problems.push(
              `${group.name} (${group.apiUrl}): ${errorMessage(error)}`,
            )
          }
          return { group, specifications: [] }
        }
      }),
    )
    if (problems.length > 0) {
      throw new Error(`group specifications failed:\n${problems.join('\n')}`)
    }

    const quads = buildSpecificationQuads(fetched)
    if (quads.length === 0) throw new Error('specs stage produced zero quads')
    await storeQuads('W3C specifications', quads)
    const file = await writeStage('specs', quads)
    const specs = new Set(
      fetched.flatMap((entry) =>
        entry.specifications.map((specification) => specification.uri),
      ),
    ).size
    return {
      step: 'specs',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${specs} specifications in ${groups.length} groups`,
    }
  } catch (error) {
    failStage('specs', error)
    throw error
  }
}

/** Step 4: latest-version editors plus Specref authors and metadata. */
export async function storeW3cSpecPeople(): Promise<W3cStepResult> {
  if (hasStage('specPeople')) {
    return skippedStep('specPeople', 'spec-people.nq already exists')
  }
  try {
    const specs = await fetchStoreSpecifications()
    const knownPersonUris = await fetchKnownPersonUris()
    const seedPeople = await fetchStorePeople()

    const [editorData, specref] = await Promise.all([
      fetchW3cEditors(specs),
      loadSpecrefEntries(
        process.env.SPECREF_PATH,
        process.env.SPECREF_URL ?? DEFAULT_SPECREF_URL,
      ),
    ])
    const problems = editorData
      .filter((entry) => entry.error)
      .map((entry) => `${entry.specification.uri}: ${entry.error}`)
    if (problems.length > 0) {
      throw new Error(`spec editors failed:\n${problems.join('\n')}`)
    }

    const people = collectPeople(seedPeople, [], editorData, knownPersonUris)
    const authorIndex = buildPersonNameIndex(people)
    const linked = linkSpecifications(specs, specref.entries, { authorIndex })

    // Replace stale Specref metadata so author-map changes take effect on a
    // dataset that is being built for the first time.
    const metadataDelete = specrefMetadataDeleteUpdate(
      specs.map((spec) => spec.uri),
    )
    if (metadataDelete) await postUpdate('Specref metadata', metadataDelete)

    const quads = [
      ...buildEditorQuads(editorData, knownPersonUris),
      ...linked.quads,
    ]
    if (quads.length === 0) {
      throw new Error('specPeople stage produced zero quads')
    }
    await storeQuads('W3C spec people', quads)
    writeNewIdentities()
    const file = await writeStage('specPeople', quads)

    if (linked.collisions.length > 0) {
      console.warn(
        `Specref collisions (${linked.collisions.length}): ${JSON.stringify(
          linked.collisions.slice(0, 10),
          null,
          2,
        )}`,
      )
    }
    const authorProblems = linked.authors.filter(
      (author) => author.status === 'unmatched' || author.status === 'ambiguous',
    )
    if (authorProblems.length > 0) {
      console.warn(
        `Specref author problems (${authorProblems.length}): ${JSON.stringify(
          authorProblems.slice(0, 10),
          null,
          2,
        )}`,
      )
    }

    const editorCount = new Set(
      editorData.flatMap((entry) =>
        entry.editors.map((editor) => editor.id),
      ),
    ).size
    const authorCounts = {
      matched: linked.authors.filter((author) => author.status === 'matched')
        .length,
      override: linked.authors.filter((author) => author.status === 'override')
        .length,
      unmatched: linked.authors.filter((author) => author.status === 'unmatched')
        .length,
      ambiguous: linked.authors.filter((author) => author.status === 'ambiguous')
        .length,
    }
    return {
      step: 'specPeople',
      skipped: false,
      stored: quads.length,
      file,
      detail: `${editorCount} editors, ${linked.matches.length}/${specs.length} Specref matches, authors ${authorCounts.matched} matched/${authorCounts.override} override/${authorCounts.unmatched} unmatched/${authorCounts.ambiguous} ambiguous`,
    }
  } catch (error) {
    failStage('specPeople', error)
    throw error
  }
}

/**
 * Extract normative/informative references from the latest rendered version of
 * every catalog spec. Only W3C TR targets already in the catalog become edges;
 * out-of-catalog and non-W3C references are recorded in the report.
 */
export async function storeW3cCitations(): Promise<CitationStepResult> {
  const reportPath =
    process.env.CITATIONS_REPORT_PATH ?? DEFAULT_CITATIONS_REPORT_PATH
  if (hasStage('citations')) {
    const report: CitationReport = {
      retrievedAt: new Date().toISOString(),
      source: 'W3C API latest versions',
      skipped: true,
      reason: 'citations.nq already exists',
      totals: citationTotals([]),
      documents: [],
    }
    // Do not overwrite the detailed report from the completed citations run.
    const summary = summarizeCitations(report)
    console.error(summary)
    return {
      step: 'citations',
      skipped: true,
      reason: report.reason,
      summary,
      report,
    }
  }

  try {
    const specs = await fetchCatalogSpecifications()
    const { citations, report } = await collectCitations(specs)
    await writeCitationReport(reportPath, report)

    // Individual TR pages legitimately fail (429, unsupported markup, old
    // documents). Those are recorded in citations-report.json; only a run
    // that produces no citation edges at all is a stage failure.
    const quads = buildCitationQuads(citations)
    if (quads.length === 0) {
      throw new Error('citations stage produced zero quads')
    }

    const successful = report.documents
      .filter((document) => document.status === 'ok')
      .map((document) => document.spec)
    const update = citationDeleteUpdate(successful)
    if (update) await postUpdate('citations', update)

    await storeQuads('citations', quads)
    const file = await writeStage('citations', quads)

    const problems = report.documents.filter(
      (document) =>
        document.status !== 'ok' || document.unresolved.length > 0,
    )
    if (problems.length > 0) {
      console.error('Citation problems:')
      for (const document of problems) {
        if (document.status !== 'ok') {
          console.error(
            `  ${document.status} ${document.spec}: ${document.error ?? ''}`,
          )
        }
        for (const unresolved of document.unresolved) {
          console.error(
            `  unresolved ${document.spec} ${unresolved.key}: ${unresolved.reason}`,
          )
        }
      }
    }
    const summary = summarizeCitations(report)
    console.error(summary)
    return {
      step: 'citations',
      skipped: false,
      stored: quads.length,
      file,
      summary,
      report,
    }
  } catch (error) {
    failStage('citations', error)
    throw error
  }
}
