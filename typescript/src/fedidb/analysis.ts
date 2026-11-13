// FediDB dataset types and pure RDF builders. Network I/O lives in
// activities.ts so this module can be tested without fetching anything.
//
// The source is the weekly dump advertised on https://fedidb.com/datasets and
// described by https://api.fedidb.org/v1.1/datasets. FediDB exports CC BY 4.0,
// so every dataset node carries its license and attribution.
import { DataFactory } from 'n3'
import type { Quad } from 'n3'
import { FEDIDB_DATASETS_PAGE, FEDIDB_SDO } from './stages.ts'
import { fepUri } from './fep.ts'

const { literal, namedNode, quad } = DataFactory

export const EX = 'http://example.org#'
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
export const XSD = 'http://www.w3.org/2001/XMLSchema#'
export const DOAP = 'http://usefulinc.com/ns/doap#'
export const DCTERMS = 'http://purl.org/dc/terms/'
export const DCAT = 'http://www.w3.org/ns/dcat#'
export const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/'

/** Software pages on FediDB, also the subject prefix for software records. */
export const FEDIDB_SOFTWARE = `${FEDIDB_SDO}software/`
/** Server pages on FediDB, used for provenance links. */
export const FEDIDB_SERVER = `${FEDIDB_SDO}servers/`

export const SOFTWARE_CLASS = `${EX}Software`
export const SERVER_CLASS = `${EX}Server`
export const SOFTWARE_VERSION_CLASS = `${EX}SoftwareVersion`
export const COUNTRY_STAT_CLASS = `${EX}CountryStat`
export const FEATURE_CLASS = `${EX}Feature`
export const FEATURE_SUPPORT_CLASS = `${EX}FeatureSupport`

export const SILO_ID = `${EX}siloId`
export const SOFTWARE = `${EX}software`
export const SOFTWARE_TYPE = `${EX}softwareType`
export const TAG = `${EX}tag`
export const SERVER_DOMAIN = `${EX}domain`
export const VERSION = `${EX}version`
export const SERVERS = `${EX}servers`
export const USERS = `${EX}users`
export const MONTHLY_ACTIVE = `${EX}monthlyActive`
export const POSTS = `${EX}posts`
export const OPEN_REGISTRATIONS = `${EX}openRegistrations`
export const COUNTRY = `${EX}country`
export const FIRST_SEEN = `${EX}firstSeen`
export const LAST_SEEN = `${EX}lastSeen`
export const FEDIDB_URL = `${EX}fedidbUrl`
export const FEATURE = `${EX}feature`
export const FEATURE_STATUS = `${EX}status`
export const FEATURE_NOTE = `${EX}note`
export const SINCE_VERSION = `${EX}sinceVersion`
export const SOURCE_URL = `${EX}sourceUrl`
export const SLUG = `${EX}slug`
export const CATEGORY = `${EX}category`
export const FEP = `${EX}fep`
export const ROW_COUNT = `${EX}rowCount`
export const PERIOD = `${EX}period`
export const SCHEMA_VERSION = `${EX}schemaVersion`
export const SPLIT_BY = `${EX}splitBy`
export const ATTRIBUTION = `${EX}attribution`

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

export interface FedidbLicense {
  name: string
  url: string
  attribution: string
}

export interface FedidbFile {
  name?: string
  url: string
  bytes?: number
  sha256?: string
  stable_url?: string
}

export interface FedidbColumn {
  name: string
  type: string
  description?: string
}

export interface FedidbSplit {
  key: string
  value: string
  rows: number
  files: Record<string, FedidbFile>
}

export interface FedidbSnapshot {
  period: string
  rows: number
  schema_version: string
  generated_at: string
  checked_at?: string
  files: Record<string, FedidbFile>
  splits?: FedidbSplit[]
}

export interface FedidbDataset {
  slug: string
  title: string
  description: string
  formats: string[]
  schedule?: string
  schema_version: string
  split_by?: string | null
  columns?: FedidbColumn[]
  stable_urls: Record<string, string>
  latest: FedidbSnapshot
}

export interface FedidbCatalog {
  version: number
  generated_at: string
  license: FedidbLicense
  datasets: FedidbDataset[]
}

// ---------------------------------------------------------------------------
// Dataset rows (only the fields the builders read)
// ---------------------------------------------------------------------------

export interface SoftwareRow {
  slug?: string | null
  name?: string | null
  description?: string | null
  types?: string[] | null
  tags?: string[] | null
  license?: string | null
  website?: string | null
  source_code?: string | null
  logo_url?: string | null
  servers?: number | null
  users?: number | null
  monthly_active?: number | null
  posts?: number | null
  fedidb_url?: string | null
}

export interface ServerRow {
  domain?: string | null
  software?: string | null
  version?: string | null
  users?: number | null
  monthly_active?: number | null
  posts?: number | null
  open_registrations?: boolean | null
  country?: string | null
  first_seen?: string | null
  last_seen?: string | null
}

export interface SoftwareVersionRow {
  software?: string | null
  version?: string | null
  servers?: number | null
  users?: number | null
  monthly_active?: number | null
}

export interface CountryRow {
  software?: string | null
  country?: string | null
  servers?: number | null
  users?: number | null
  monthly_active?: number | null
}

export interface FepRow {
  id?: string | null
  label?: string | null
  title?: string | null
  url?: string | null
}

export interface FeatureQuestionRow {
  slug?: string | null
  category?: string | null
  name?: string | null
  description?: string | null
  software_types?: string[] | null
  feps?: FepRow[] | null
}

export interface FeatureSupportRow {
  software?: string | null
  question?: string | null
  status?: string | null
  note?: string | null
  since_version?: string | null
  source_url?: string | null
  updated?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const integer = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return undefined
}

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = text(entry)
    return item ? [item] : []
  })
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function dateLiteral(value: unknown) {
  const date = text(value)
  return date ? literal(date, namedNode(`${XSD}date`)) : undefined
}

function dateTimeLiteral(value: unknown) {
  const date = text(value)
  return date ? literal(date, namedNode(`${XSD}dateTime`)) : undefined
}

/**
 * Percent-encode a value for use inside a URN component or path segment. The
 * generic stage writer rejects IRIs containing spaces/control characters, so
 * escaping here is the first line of defence for external values.
 */
export function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Absolute http(s) IRI, or undefined when the upstream value is not a URL. */
export function httpIri(value: unknown): string | undefined {
  const candidate = text(value)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/** Stable subject for a FediDB software slug. */
export function softwareUri(slug: string): string {
  return `${FEDIDB_SOFTWARE}${encodeSegment(slug)}`
}

/** Stable subject for a FediDB feature question. */
export function featureUri(slug: string): string {
  return `urn:fedidb:feature:${encodeSegment(slug)}`
}

/**
 * Normalise a server domain into the server's own base URL. Reject values with
 * a path/query/fragment: those are not domains and would produce bogus IRIs.
 */
export function serverIdentity(
  value: unknown,
): { iri: string; domain: string } | undefined {
  const domain = text(value)
  if (!domain) return undefined
  try {
    const url = new URL(`https://${domain}/`)
    if (
      url.protocol !== 'https:' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.hostname === '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return undefined
    }
    return { iri: url.href, domain: url.host }
  } catch {
    return undefined
  }
}

function sourceNode(dataset: string) {
  return namedNode(`${FEDIDB_DATASETS_PAGE}#${encodeSegment(dataset)}`)
}

function addString(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  predicate: string,
  value: unknown,
) {
  const item = text(value)
  if (item) quads.push(quad(subject, namedNode(predicate), literal(item)))
}

function addIri(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  predicate: string,
  value: unknown,
) {
  const iri = httpIri(value)
  if (iri) quads.push(quad(subject, namedNode(predicate), namedNode(iri)))
}

function addInteger(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  predicate: string,
  value: unknown,
) {
  const number = integer(value)
  if (number !== undefined) {
    quads.push(
      quad(subject, namedNode(predicate), literal(String(number), namedNode(`${XSD}integer`))),
    )
  }
}

function addDatasetSource(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  dataset: string,
) {
  quads.push(quad(subject, namedNode(`${DCTERMS}source`), sourceNode(dataset)))
}

// ---------------------------------------------------------------------------
// NDJSON
// ---------------------------------------------------------------------------

/** Parse one JSON object per line, with the failing line number in the error. */
export function parseNdjson<T = Record<string, unknown>>(body: string): T[] {
  const rows: T[] = []
  const lines = body.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue
    try {
      rows.push(JSON.parse(line) as T)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`invalid NDJSON at line ${index + 1}: ${message}`)
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** `datasets.nq`: catalog + per-dataset licensing/provenance metadata. */
export function buildCatalogQuads(catalog: FedidbCatalog): Quad[] {
  const quads: Quad[] = []
  const catalogNode = namedNode(FEDIDB_DATASETS_PAGE)
  const licenseNode = namedNode(CC_BY_4)

  quads.push(
    quad(catalogNode, namedNode(RDF_TYPE), namedNode(`${DCAT}Catalog`)),
    quad(catalogNode, namedNode(`${DCTERMS}title`), literal('FediDB datasets')),
    quad(
      catalogNode,
      namedNode(`${DCTERMS}description`),
      literal(
        'Weekly exports of the fediverse from FediDB: software, servers, versions, countries and the software feature matrix.',
      ),
    ),
    quad(catalogNode, namedNode(`${DCTERMS}license`), licenseNode),
    quad(catalogNode, namedNode(`${DCTERMS}source`), namedNode(FEDIDB_DATASETS_PAGE)),
    quad(
      catalogNode,
      namedNode(ATTRIBUTION),
      literal(catalog.license.attribution || 'FediDB (fedidb.com)'),
    ),
    quad(licenseNode, namedNode(RDF_TYPE), namedNode(`${DCTERMS}LicenseDocument`)),
    quad(licenseNode, namedNode(`${DCTERMS}title`), literal(catalog.license.name)),
    quad(licenseNode, namedNode(`${DCTERMS}source`), namedNode(catalog.license.url)),
  )

  const modified = dateTimeLiteral(catalog.generated_at)
  if (modified) {
    quads.push(quad(catalogNode, namedNode(`${DCTERMS}modified`), modified))
  }

  for (const dataset of catalog.datasets) {
    const node = namedNode(`${FEDIDB_DATASETS_PAGE}#${encodeSegment(dataset.slug)}`)
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(`${DCAT}Dataset`)),
      quad(node, namedNode(`${DCTERMS}title`), literal(dataset.title)),
      quad(node, namedNode(`${DCTERMS}description`), literal(dataset.description)),
      quad(node, namedNode(`${DCTERMS}license`), licenseNode),
      quad(node, namedNode(`${DCTERMS}isPartOf`), catalogNode),
      quad(node, namedNode(`${DCTERMS}source`), namedNode(FEDIDB_DATASETS_PAGE)),
    )
    addString(quads, node, PERIOD, dataset.latest.period)
    addString(quads, node, SCHEMA_VERSION, dataset.latest.schema_version)
    addString(quads, node, SPLIT_BY, dataset.split_by)
    addInteger(quads, node, ROW_COUNT, dataset.latest.rows)

    const issued = dateLiteral(dataset.latest.period)
    if (issued) quads.push(quad(node, namedNode(`${DCTERMS}issued`), issued))
    const generated = dateTimeLiteral(dataset.latest.generated_at)
    if (generated) {
      quads.push(quad(node, namedNode(`${DCTERMS}modified`), generated))
    }

    const access = httpIri(dataset.stable_urls.ndjson)
    if (access) {
      quads.push(quad(node, namedNode(`${DCAT}accessURL`), namedNode(access)))
    }
    const download = httpIri(dataset.latest.files.ndjson?.url)
    if (download) {
      quads.push(quad(node, namedNode(`${DCAT}downloadURL`), namedNode(download)))
    }
    const bytes = integer(dataset.latest.files.ndjson?.bytes)
    if (bytes !== undefined) {
      quads.push(
        quad(
          node,
          namedNode(`${DCAT}byteSize`),
          literal(String(bytes), namedNode(`${XSD}integer`)),
        ),
      )
    }
  }

  return quads
}

/**
 * `software.nq`: doap:Project + ex:Software with FediDB network totals.
 *
 * FediDB does not publish a protocol or conformance column, and its "software"
 * set includes servers, bridges, relays, bots and optional plugins. Presence
 * here is not evidence that a project implements ActivityPub, so this builder
 * deliberately emits no doap:implements. Explicit implementation claims live
 * only in the curated data/software.ttl.
 */
export function buildSoftwareQuads(rows: readonly SoftwareRow[]): Quad[] {
  const quads: Quad[] = []
  for (const row of rows) {
    const slug = text(row.slug)
    if (!slug) continue
    const node = namedNode(softwareUri(slug))

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(`${DOAP}Project`)),
      quad(node, namedNode(RDF_TYPE), namedNode(SOFTWARE_CLASS)),
      quad(node, namedNode(SILO_ID), literal(`urn:fedidb:software:${encodeSegment(slug)}`)),
      quad(node, namedNode(`${DOAP}name`), literal(text(row.name) ?? slug)),
    )

    addString(quads, node, `${DOAP}shortdesc`, row.description)
    addString(quads, node, `${DOAP}license`, row.license)
    addIri(quads, node, `${DOAP}homepage`, row.website)
    addIri(quads, node, `${DOAP}repository`, row.source_code)
    addIri(quads, node, `${DOAP}logo`, row.logo_url)
    for (const type of stringList(row.types)) {
      quads.push(quad(node, namedNode(SOFTWARE_TYPE), literal(type)))
    }
    for (const tag of stringList(row.tags)) {
      quads.push(quad(node, namedNode(TAG), literal(tag)))
    }
    addInteger(quads, node, SERVERS, row.servers)
    addInteger(quads, node, USERS, row.users)
    addInteger(quads, node, MONTHLY_ACTIVE, row.monthly_active)
    addInteger(quads, node, POSTS, row.posts)
    addIri(quads, node, FEDIDB_URL, row.fedidb_url)
    addDatasetSource(quads, node, 'software')
  }
  return quads
}

/**
 * Server quads shared by `server-domains`, `servers` and `open-servers`.
 * `openRegistrations` forces the true value for the open-servers export, whose
 * rows are already filtered by that predicate.
 */
export function buildServerQuads(
  rows: readonly ServerRow[],
  dataset: string,
  options: { openRegistrations?: boolean } = {},
): Quad[] {
  const quads: Quad[] = []
  for (const row of rows) {
    const identity = serverIdentity(row.domain)
    if (!identity) continue
    const node = namedNode(identity.iri)

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(SERVER_CLASS)),
      quad(node, namedNode(SILO_ID), literal(`urn:fedidb:server:${encodeSegment(identity.domain)}`)),
      quad(node, namedNode(SERVER_DOMAIN), literal(identity.domain)),
      quad(
        node,
        namedNode(FEDIDB_URL),
        namedNode(`${FEDIDB_SERVER}${encodeSegment(identity.domain)}`),
      ),
    )

    const software = text(row.software)
    if (software) {
      quads.push(quad(node, namedNode(SOFTWARE), namedNode(softwareUri(software))))
    }
    addString(quads, node, VERSION, row.version)
    addInteger(quads, node, USERS, row.users)
    addInteger(quads, node, MONTHLY_ACTIVE, row.monthly_active)
    addInteger(quads, node, POSTS, row.posts)
    addString(quads, node, COUNTRY, row.country)

    const open = options.openRegistrations ?? row.open_registrations
    if (typeof open === 'boolean') {
      quads.push(
        quad(
          node,
          namedNode(OPEN_REGISTRATIONS),
          literal(String(open), namedNode(`${XSD}boolean`)),
        ),
      )
    }

    const firstSeen = dateLiteral(row.first_seen)
    if (firstSeen) quads.push(quad(node, namedNode(FIRST_SEEN), firstSeen))
    const lastSeen = dateLiteral(row.last_seen)
    if (lastSeen) quads.push(quad(node, namedNode(LAST_SEEN), lastSeen))

    addDatasetSource(quads, node, dataset)
  }
  return quads
}

/** `software-versions.nq`: one node per software/version pair. */
export function buildSoftwareVersionQuads(
  rows: readonly SoftwareVersionRow[],
): Quad[] {
  const quads: Quad[] = []
  for (const row of rows) {
    const software = text(row.software)
    const version = text(row.version)
    if (!software || !version) continue
    const node = namedNode(
      `urn:fedidb:software-version:${encodeSegment(software)}:${encodeSegment(version)}`,
    )

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(SOFTWARE_VERSION_CLASS)),
      quad(node, namedNode(SOFTWARE), namedNode(softwareUri(software))),
      quad(node, namedNode(VERSION), literal(version)),
    )
    addInteger(quads, node, SERVERS, row.servers)
    addInteger(quads, node, USERS, row.users)
    addInteger(quads, node, MONTHLY_ACTIVE, row.monthly_active)
    addDatasetSource(quads, node, 'software-versions')
  }
  return quads
}

/** `countries.nq`: one aggregate node per software/country pair. */
export function buildCountryQuads(rows: readonly CountryRow[]): Quad[] {
  const quads: Quad[] = []
  for (const row of rows) {
    const software = text(row.software)
    const country = text(row.country)
    if (!software || !country) continue
    const node = namedNode(
      `urn:fedidb:country-stat:${encodeSegment(software)}:${encodeSegment(country)}`,
    )

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(COUNTRY_STAT_CLASS)),
      quad(node, namedNode(SOFTWARE), namedNode(softwareUri(software))),
      quad(node, namedNode(COUNTRY), literal(country)),
    )
    addInteger(quads, node, SERVERS, row.servers)
    addInteger(quads, node, USERS, row.users)
    addInteger(quads, node, MONTHLY_ACTIVE, row.monthly_active)
    addDatasetSource(quads, node, 'countries')
  }
  return quads
}

/** `feature-questions.nq`: questions plus the FEP resources they follow. */
export function buildFeatureQuestionQuads(
  rows: readonly FeatureQuestionRow[],
): Quad[] {
  const quads: Quad[] = []

  for (const row of rows) {
    const slug = text(row.slug)
    if (!slug) continue
    const node = namedNode(featureUri(slug))

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(FEATURE_CLASS)),
      quad(node, namedNode(SLUG), literal(slug)),
      quad(node, namedNode(`${EX}name`), literal(text(row.name) ?? slug)),
    )
    addString(quads, node, CATEGORY, row.category)
    addString(quads, node, `${EX}description`, row.description)
    for (const type of stringList(row.software_types)) {
      quads.push(quad(node, namedNode(SOFTWARE_TYPE), literal(type)))
    }

    for (const fep of row.feps ?? []) {
      const slug = text(fep.id)
      const url = httpIri(fep.url)
      if (slug) {
        quads.push(quad(node, namedNode(FEP), namedNode(fepUri(slug))))
      } else if (url) {
        // Fallback for a future FediDB row without the FEP id.
        quads.push(quad(node, namedNode(FEP), namedNode(url)))
      }
    }

    addDatasetSource(quads, node, 'feature-questions')
  }
  return quads
}

/** `feature-support.nq`: one answer node per software/question pair. */
export function buildFeatureSupportQuads(
  rows: readonly FeatureSupportRow[],
): Quad[] {
  const quads: Quad[] = []
  for (const row of rows) {
    const software = text(row.software)
    const question = text(row.question)
    const status = text(row.status)
    if (!software || !question || !status) continue
    const node = namedNode(
      `urn:fedidb:feature-support:${encodeSegment(software)}:${encodeSegment(question)}`,
    )

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(FEATURE_SUPPORT_CLASS)),
      quad(node, namedNode(SOFTWARE), namedNode(softwareUri(software))),
      quad(node, namedNode(FEATURE), namedNode(featureUri(question))),
      quad(node, namedNode(FEATURE_STATUS), literal(status)),
    )
    addString(quads, node, FEATURE_NOTE, row.note)
    addString(quads, node, SINCE_VERSION, row.since_version)
    addIri(quads, node, SOURCE_URL, row.source_url)
    const updated = dateLiteral(row.updated)
    if (updated) {
      quads.push(quad(node, namedNode(`${DCTERMS}modified`), updated))
    }
    addDatasetSource(quads, node, 'feature-support')
  }
  return quads
}
