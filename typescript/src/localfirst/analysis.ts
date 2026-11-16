// Local-First source types and pure RDF builders. Network I/O lives in
// activities.ts so this module can be tested without fetching anything.
//
// Two sources are combined:
//   - the conference page, which publishes the next edition's name, dates and
//     venue;
//   - the local-first landscape, whose generated snapshot is the table data
//     behind https://www.localfirst.fm/landscape.
import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import { DataFactory } from 'n3'
import type { Quad } from 'n3'
import {
  LOCALFIRST_CONFERENCE_URL,
  LOCALFIRST_LANDSCAPE_URL,
  LOCALFIRST_LOGO,
  LOCALFIRST_NAME,
  LOCALFIRST_SDO,
  LOCALFIRST_SNAPSHOT_BLOB_BASE,
  REUSED_LOCATION_URIS,
  SOFTWARE_SILO_PREFIX,
} from './stages.ts'

const { literal, namedNode, quad } = DataFactory

export const EX = 'http://example.org#'
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
export const XSD = 'http://www.w3.org/2001/XMLSchema#'
export const DOAP = 'http://usefulinc.com/ns/doap#'
export const DCTERMS = 'http://purl.org/dc/terms/'

export const ORGANIZATION_CLASS = `${EX}Organization`
export const LOCATION_CLASS = `${EX}Location`
export const EVENT_CLASS = `${EX}Event`
export const MATURITY = `${EX}maturity`
export const PLATFORM = `${EX}platform`
export const DEPLOYMENT = `${EX}deployment`
export const SILO_ID = `${EX}siloId`
export const SOURCE = `${EX}source`
export const SDO = `${EX}sdo`

/** UUIDv5 in the URL namespace, matching the other hand-built catalogs. */
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

export function uuidv5(name: string, namespace = NAMESPACE_URL): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  if (namespaceBytes.length !== 16) {
    throw new Error(`invalid UUID namespace "${namespace}"`)
  }
  const digest = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest()
  digest[6] = (digest[6]! & 0x0f) | 0x50
  digest[8] = (digest[8]! & 0x3f) | 0x80
  const hex = digest.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const urn = (key: string) => `urn:uuid:${uuidv5(key)}`

/** Curated location node reused for this city, when the catalog already has one. */
export const reusedLocationUri = (country: string, city: string) =>
  REUSED_LOCATION_URIS[`${country}:${city}`]

/**
 * Stable subject for a city. Reused curated nodes win; otherwise the node is
 * keyed like the other SDOs so a new conference city gets its own record.
 */
export const locationUri = (country: string, city: string) =>
  reusedLocationUri(country, city) ??
  urn(`localfirst:location:${country}:${city}`)

/** Stable subject for an event, keyed by a slug derived from its name. */
export const eventUri = (name: string) =>
  urn(`localfirst:event:${slugify(name)}`)

/** Stable subject for a technology, keyed by its stable landscape id. */
export const softwareUri = (id: string) => urn(`localfirst:software:${id}`)

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Accept only absolute http(s) URLs; the RDF writer needs valid IRIs. */
function urlValue(value: unknown): string | undefined {
  const candidate = text(value)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return candidate
  } catch {
    return undefined
  }
}

function dateValue(value: unknown): string | undefined {
  const candidate = text(value)
  if (!candidate) return undefined
  const date = new Date(candidate)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Conference page
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

export interface ConferenceInfo {
  /** Conference title as published, e.g. "Local-First Conf 2027". */
  name: string
  city: string
  country: string
  /** Venue name when the page links one, without the "Venue" label. */
  venue?: string
  /** ISO calendar dates, first and last conference day. */
  startDate: string
  endDate: string
}

const DATE_RANGE =
  /(\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s*,?\s*(\d{4})/i

/**
 * Read the next edition from the conference page. The page is a static Webflow
 * site, so this fails loudly (and the stage stays unwritten) when the layout
 * stops exposing the date range or the city/country pair.
 */
export function parseConferencePage(html: string): ConferenceInfo {
  const $ = cheerio.load(html)
  const name =
    collapse($('title').first().text()) ||
    collapse($('meta[property="og:title"]').attr('content') ?? '')
  if (!name) {
    throw new Error('conference page has no title')
  }

  const description = collapse(
    $('meta[name="description"]').attr('content') ?? '',
  )
  const headings = $('h2')
    .toArray()
    .map((element) => collapse($(element).text()))
  const dateLine = headings.find((line) => DATE_RANGE.test(line))
  if (!dateLine) {
    throw new Error(
      'conference page no longer publishes a "25th - 26th may, 2027" date range',
    )
  }

  const range = DATE_RANGE.exec(dateLine)!
  const startDay = Number(range[1])
  const endDay = Number(range[2])
  const month = MONTHS[range[3]!.toLowerCase()]
  const year = Number(range[4])
  if (!month) {
    throw new Error(`conference page has an unknown month "${range[3]}"`)
  }

  const afterRange = dateLine.slice(range.index + range[0].length)
  const city =
    collapse(afterRange.replace(/^.*?\bin\s+/i, '').replace(/\.$/, '')) ||
    collapse(description.match(/\bin\s+([^,]+),\s*[A-Za-z]+\s+\d/)?.[1] ?? '')
  if (!city) {
    throw new Error('conference page no longer publishes the host city')
  }

  const fullText = collapse($.root().text())
  const countryPattern = new RegExp(
    `${escapeRegExp(city)},\\s*([\\p{L}][\\p{L} .'-]*?)(?=\\s*(?:\\d|$|[.,]))`,
    'u',
  )
  const country = text(fullText.match(countryPattern)?.[1])
  if (!country) {
    throw new Error(
      `conference page no longer publishes the country next to "${city}"`,
    )
  }

  const venueAnchor = $('a')
    .toArray()
    .find((element) => /^venue\b/i.test(collapse($(element).text())))
  const venue = venueAnchor
    ? collapse($(venueAnchor).text()).replace(/^venue\s+/i, '')
    : text(
        fullText.match(
          /\bVenue\s+([A-Z][\p{L}\d .&'’-]*?)(?=\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\b)/u,
        )?.[1],
      )

  const start = new Date(Date.UTC(year, month - 1, startDay))
  const end = new Date(Date.UTC(year, month - 1, endDay))
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== startDay ||
    end.getUTCFullYear() !== year ||
    end.getUTCMonth() !== month - 1 ||
    end.getUTCDate() !== endDay ||
    end < start
  ) {
    throw new Error(`conference page has an invalid date range "${dateLine}"`)
  }

  return {
    name,
    city,
    country,
    ...(venue ? { venue } : {}),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Landscape
// ---------------------------------------------------------------------------

/** Raw shape of one `generated/<id>/data.json`, only the fields we read. */
export interface LandscapeTechnology {
  Id?: string
  Name?: string
  Description?: string
  MaturityLevel?: string
  Website?: string
  GitHub?: string
  License?: string
  Deployment?: string[]
  AppTarget?: {
    Platform?: { data?: string | string[] }
    LanguageSDK?: { data?: string | string[] }
  }
  __generated?: { lastUpdated?: string }
}

export interface TechnologyRecord {
  /** Landscape id, stable across refreshes (e.g. `y-sweet`). */
  id: string
  /** Published display name, e.g. "Y-Sweet". */
  name: string
  description?: string
  maturity?: string
  homepage?: string
  repository?: string
  license?: string
  languages: string[]
  platforms: string[]
  deployments: string[]
  /** Upstream `__generated.lastUpdated`, as an ISO date. */
  lastUpdated?: string
}

const stringList = (value: string | string[] | undefined): string[] => {
  const entries = typeof value === 'string' ? [value] : (value ?? [])
  const seen = new Set<string>()
  for (const entry of entries) {
    const item = text(entry)
    if (item) seen.add(item)
  }
  return [...seen]
}

/**
 * `repos.ts` is the authoritative list of technologies in the landscape. It is
 * a plain module with one `id: '…'` per entry, which is enough to locate the
 * generated snapshot file without a GitHub API token.
 */
export function parseTechnologyIds(reposTs: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of reposTs.matchAll(/\bid:\s*'([^']+)'/g)) {
    const id = match[1]!
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`unexpected landscape technology id "${id}"`)
    }
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length === 0) {
    throw new Error('landscape repos.ts has no technology ids')
  }
  return ids
}

/** Validate one data.json and keep the fields the catalog maps to RDF. */
export function parseTechnology(
  id: string,
  data: LandscapeTechnology,
): TechnologyRecord {
  if (data.Id !== undefined && data.Id !== id) {
    throw new Error(`landscape ${id}: data.json declares Id "${data.Id}"`)
  }
  const name = text(data.Name)
  if (!name) {
    throw new Error(`landscape ${id}: data.json has no Name`)
  }
  const license = text(data.License)
  return {
    id,
    name,
    description: text(data.Description),
    maturity: text(data.MaturityLevel),
    homepage: urlValue(data.Website),
    repository: urlValue(data.GitHub),
    ...(license && license.toLowerCase() !== 'none' ? { license } : {}),
    languages: stringList(data.AppTarget?.LanguageSDK?.data),
    platforms: stringList(data.AppTarget?.Platform?.data),
    deployments: stringList(data.Deployment),
    lastUpdated: dateValue(data.__generated?.lastUpdated),
  }
}

// ---------------------------------------------------------------------------
// RDF builders
// ---------------------------------------------------------------------------

export function buildOrganizationQuads(): Quad[] {
  const node = namedNode(LOCALFIRST_SDO)
  return [
    quad(node, namedNode(RDF_TYPE), namedNode(ORGANIZATION_CLASS)),
    quad(node, namedNode(`${EX}name`), literal(LOCALFIRST_NAME)),
    quad(node, namedNode(`${EX}homepage`), namedNode(LOCALFIRST_SDO)),
    quad(node, namedNode(`${EX}logo`), literal(LOCALFIRST_LOGO)),
    quad(node, namedNode(SOURCE), namedNode(LOCALFIRST_SDO)),
  ]
}

/**
 * Reused locations already carry their name, region and coordinates in the
 * curated base catalog; the stage only adds the conference as another source.
 * A future edition in a new city gets a full location record here.
 */
export function buildLocationQuads(info: ConferenceInfo): Quad[] {
  const node = namedNode(locationUri(info.country, info.city))
  if (reusedLocationUri(info.country, info.city)) {
    return [quad(node, namedNode(SOURCE), namedNode(LOCALFIRST_CONFERENCE_URL))]
  }
  // The conference page publishes no coordinates, so a new city node has none.
  return [
    quad(node, namedNode(RDF_TYPE), namedNode(LOCATION_CLASS)),
    quad(node, namedNode(`${EX}name`), literal(`${info.city}, ${info.country}`)),
    quad(node, namedNode(`${EX}region`), literal(info.country)),
    quad(node, namedNode(SOURCE), namedNode(LOCALFIRST_CONFERENCE_URL)),
  ]
}

export function buildEventQuads(info: ConferenceInfo): Quad[] {
  const node = namedNode(eventUri(info.name))
  const venue = info.venue
    ? `${info.venue}, ${info.city}, ${info.country}`
    : `${info.city}, ${info.country}`
  return [
    quad(node, namedNode(RDF_TYPE), namedNode(EVENT_CLASS)),
    quad(node, namedNode(SDO), namedNode(LOCALFIRST_SDO)),
    quad(node, namedNode(`${EX}name`), literal(info.name)),
    quad(
      node,
      namedNode(`${EX}startDate`),
      literal(`${info.startDate}T00:00:00Z`, namedNode(`${XSD}dateTime`)),
    ),
    quad(
      node,
      namedNode(`${EX}endDate`),
      literal(`${info.endDate}T23:59:59Z`, namedNode(`${XSD}dateTime`)),
    ),
    quad(node, namedNode(`${EX}location`), literal(venue)),
    quad(
      node,
      namedNode(`${EX}atLocation`),
      namedNode(locationUri(info.country, info.city)),
    ),
    quad(node, namedNode(SOURCE), namedNode(LOCALFIRST_CONFERENCE_URL)),
  ]
}

export function buildSoftwareQuads(records: readonly TechnologyRecord[]): Quad[] {
  const byId = new Set<string>()
  for (const record of records) {
    if (byId.has(record.id)) {
      throw new Error(`duplicate landscape id "${record.id}"`)
    }
    byId.add(record.id)
  }

  const quads: Quad[] = []
  for (const record of records) {
    const node = namedNode(softwareUri(record.id))
    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(`${DOAP}Project`)),
      quad(node, namedNode(`${DOAP}name`), literal(record.name)),
      quad(
        node,
        namedNode(SILO_ID),
        literal(`${SOFTWARE_SILO_PREFIX}${record.id}`),
      ),
      quad(node, namedNode(SOURCE), namedNode(LOCALFIRST_LANDSCAPE_URL)),
      quad(
        node,
        namedNode(`${DCTERMS}source`),
        namedNode(`${LOCALFIRST_SNAPSHOT_BLOB_BASE}/${record.id}/data.json`),
      ),
    )
    if (record.description) {
      quads.push(
        quad(node, namedNode(`${DOAP}shortdesc`), literal(record.description)),
      )
    }
    if (record.license) {
      quads.push(quad(node, namedNode(`${DOAP}license`), literal(record.license)))
    }
    if (record.homepage) {
      quads.push(
        quad(node, namedNode(`${DOAP}homepage`), namedNode(record.homepage)),
      )
    }
    if (record.repository) {
      quads.push(
        quad(
          node,
          namedNode(`${DOAP}repository`),
          namedNode(record.repository),
        ),
      )
    }
    for (const language of record.languages) {
      quads.push(
        quad(
          node,
          namedNode(`${DOAP}programming-language`),
          literal(language),
        ),
      )
    }
    if (record.maturity) {
      quads.push(quad(node, namedNode(MATURITY), literal(record.maturity)))
    }
    for (const platform of record.platforms) {
      quads.push(quad(node, namedNode(PLATFORM), literal(platform)))
    }
    for (const deployment of record.deployments) {
      quads.push(quad(node, namedNode(DEPLOYMENT), literal(deployment)))
    }
    if (record.lastUpdated) {
      quads.push(
        quad(
          node,
          namedNode(`${DCTERMS}modified`),
          literal(record.lastUpdated, namedNode(`${XSD}date`)),
        ),
      )
    }
  }
  return quads
}
