// Fediverse Enhancement Proposals (FEPs) from
// https://codeberg.org/fediverse/fep.
//
// The repository publishes `index.json` (frontmatter + title + implementation
// count for every FEP) and one Markdown document per FEP. The documents supply
// the `## Summary` and `## Implementations` sections that the index omits.
//
// FEP identity: https://w3id.org/fep/<slug> is the persistent identifier
// defined by FEP-888d. The raw Codeberg Markdown URL is kept as provenance.
//
// This module is deliberately independent of analysis.ts: analysis.ts imports
// fepUri() for the feature-question links, so a reverse import would cycle.
import { DataFactory } from 'n3'
import type { Quad } from 'n3'

const { literal, namedNode, quad } = DataFactory

export const FEP_REPO = 'https://codeberg.org/fediverse/fep'
export const FEP_INDEX_URL = `${FEP_REPO}/raw/branch/main/index.json`
export const FEP_ARCHIVE_URL = `${FEP_REPO}/archive/main.tar.gz`
export const FEP_RAW_BASE = `${FEP_REPO}/raw/branch/main/fep`
export const FEP_CANONICAL_BASE = 'https://w3id.org/fep/'
export const FEP_SITE = 'https://fediverse.codeberg.page/fep/'
export const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'

const EX = 'http://example.org#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const DCTERMS = 'http://purl.org/dc/terms/'
const DCAT = 'http://www.w3.org/ns/dcat#'

const FEP_CLASS = `${EX}FEP`
const FEP_IMPLEMENTATION_CLASS = `${EX}FEPImplementation`
const FEP_ID = `${EX}fepId`
const FEP_TYPE = `${EX}fepType`
const FEP_STATUS = `${EX}status`
const FEP_IMPLEMENTATIONS = `${EX}implementations`
const FEP_IMPLEMENTATION = `${EX}implementation`
const FEP_TRACKING_ISSUE = `${EX}trackingIssue`
const FEP_DISCUSSIONS_TO = `${EX}discussionsTo`
const FEP_RELATED = `${EX}relatedFep`
const FEP = `${EX}fep`
const FEP_REPLACES = `${EX}replaces`
const FEP_REPLACED_BY = `${EX}replacedBy`
const FEP_AUTHOR = `${EX}author`
const FEP_AUTHOR_NAME = `${EX}authorName`
const FEP_AUTHOR_CONTACT = `${EX}authorContact`
const FEP_SOURCE = `${EX}fepSource`
const FEP_TAG = `${EX}tag`
const FEP_CATEGORY = `${EX}category`
const FEP_PROTOCOL = `${EX}protocol`
const ROW_COUNT = `${EX}rowCount`
const FEP_INDEX = `${EX}fepIndex`

export interface FepIndexRow {
  slug?: string
  authors?: string[]
  status?: string
  type?: string
  category?: string
  categories?: string[]
  protocols?: string[]
  date?: string
  dateReceived?: string
  dateFinalized?: string
  dateWithdrawn?: string
  trackingIssue?: string
  discussionsTo?: string
  title?: string
  implementations?: number
  relatedFeps?: string[]
  replaces?: string[]
  replacedBy?: string
  tags?: string[]
}

export interface FepImplementationEntry {
  label: string
  url?: string
  /** 1-based position in the `## Implementations` list. */
  index: number
}

export interface FepDocument {
  slug: string
  markdown: string
  summary?: string
  implementations: FepImplementationEntry[]
}

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const stringList = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const item = text(value)
    return item ? [item] : []
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = text(entry)
    return item ? [item] : []
  })
}

const integer = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return undefined
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function dateLiteral(value: unknown) {
  const date = text(value)
  return date && DATE.test(date) ? literal(date, namedNode(`${XSD}date`)) : undefined
}

function httpIri(value: unknown): string | undefined {
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

export function fepUri(slug: string): string {
  return `${FEP_CANONICAL_BASE}${encodeURIComponent(slug)}`
}

export function fepSourceUrl(slug: string): string {
  const encoded = encodeURIComponent(slug)
  return `${FEP_RAW_BASE}/${encoded}/fep-${encoded}.md`
}

export function fepLabel(slug: string): string {
  return `FEP-${slug}`
}

function cString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset
  const limit = offset + length
  while (end < limit && bytes[end] !== 0) end++
  return new TextDecoder().decode(bytes.subarray(offset, end))
}

/**
 * Minimal tar reader for the Codeberg repository archive. It only needs the
 * regular-file entries (the FEP index and Markdown documents), but it walks
 * every header so the offsets stay correct. Handles ustar prefixes and GNU
 * long names; the archive has no compressed sparse or base-256 oddities.
 */
export function parseTar(archive: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  let offset = 0
  let longName: string | undefined

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const name = cString(header, 0, 100)
    const sizeText = cString(header, 124, 12).trim()
    const size = Number.parseInt(sizeText === '' ? '0' : sizeText, 8)
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`invalid tar entry size for ${name || '(unnamed)'}`)
    }
    const type = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > archive.length) {
      throw new Error(`truncated tar entry ${name || '(unnamed)'}`)
    }
    const data = archive.subarray(dataStart, dataEnd)
    const prefix = cString(header, 345, 155)
    const fullName = longName ?? (prefix ? `${prefix}/${name}` : name)

    if (type === 'L') {
      longName = new TextDecoder().decode(data).replace(/\0.*$/, '').trim()
    } else if (type === '0' || type === '\0') {
      files.set(fullName, data)
      longName = undefined
    } else if (type !== 'x' && type !== 'g') {
      longName = undefined
    }

    offset = dataStart + Math.ceil(size / 512) * 512
  }

  return files
}

/** Parse the generated FEP `index.json`. */
export function parseFepIndex(body: string): FepIndexRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid FEP index JSON: ${message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('FEP index is not an array')
  }
  const rows = parsed.filter(
    (row): row is FepIndexRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { slug?: unknown }).slug === 'string',
  )
  if (rows.length === 0) throw new Error('FEP index has no proposals')
  return rows
}

/** Body of the first `## <heading>` section, up to the next Markdown heading. */
export function fepSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(
    (line) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(line),
  )
  if (start < 0) return undefined
  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    if (/^#{1,6}\s+/.test(lines[index] ?? '')) {
      end = index
      break
    }
  }
  const body = lines.slice(start + 1, end).join('\n').trim()
  return body === '' ? undefined : body
}

const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g
const REFERENCE_LINK = /^\[([^\]]+)\](?:\[[^\]]*\])?\s*(.*)$/

/** Turn one `## Implementations` bullet into a label and its first link. */
function cleanImplementationLabel(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseImplementationEntry(
  line: string,
  index: number,
): FepImplementationEntry | undefined {
  const raw = line.replace(/^\s*[-*]\s+/, '').trim()
  if (raw === '') return undefined

  const links = [...raw.matchAll(MARKDOWN_LINK)]
  const url = links.length > 0 ? httpIri(links[0]?.[2]) : undefined
  // Reference-style bullets such as `[Mastodon] implements ...` name the
  // implementation in the link label; keep only that label, not the prose.
  const reference = REFERENCE_LINK.exec(raw)
  const label = cleanImplementationLabel(
    reference?.[1] ?? raw.replace(MARKDOWN_LINK, '$1'),
  )
  return { label: label === '' ? raw : label, url, index }
}

export function parseFepDocument(slug: string, markdown: string): FepDocument {
  const implementationBody = fepSection(markdown, 'Implementations')
  const implementations = implementationBody
    ? implementationBody
        .split(/\r?\n/)
        .filter((line) => /^\s*[-*]\s+/.test(line))
        .flatMap((line, index) => {
          const entry = parseImplementationEntry(line, index + 1)
          return entry ? [entry] : []
        })
    : []
  return {
    slug,
    markdown,
    summary: fepSection(markdown, 'Summary'),
    implementations,
  }
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

function addString(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  predicate: string,
  value: unknown,
) {
  const item = text(value)
  if (item) quads.push(quad(subject, namedNode(predicate), literal(item)))
}

function addDate(
  quads: Quad[],
  subject: ReturnType<typeof namedNode>,
  predicate: string,
  value: unknown,
) {
  const date = dateLiteral(value)
  if (date) quads.push(quad(subject, namedNode(predicate), date))
}

function relatedFepSlug(value: string): string | undefined {
  const match = /FEP-([0-9a-z]+)/i.exec(value)
  return match?.[1] ?? text(value)
}

/** Most recent date in the index, used as a human-readable manifest period. */
export function latestFepDate(rows: readonly FepIndexRow[]): string | undefined {
  let latest: string | undefined
  for (const row of rows) {
    for (const value of [
      row.dateFinalized,
      row.dateWithdrawn,
      row.dateReceived,
      row.date,
    ]) {
      const date = text(value)
      if (!date || !DATE.test(date)) continue
      if (!latest || date > latest) latest = date
    }
  }
  return latest
}

/**
 * `fep.nq`: one node per FEP (154 currently), plus the source dataset and the
 * CC0 license document. Summaries and implementation lists come from the
 * individual Markdown files; everything else is from index.json.
 */
export function buildFepQuads(
  rows: readonly FepIndexRow[],
  documents: ReadonlyMap<string, FepDocument> = new Map(),
): Quad[] {
  const quads: Quad[] = []
  const repoNode = namedNode(FEP_REPO)
  const licenseNode = namedNode(CC0)

  quads.push(
    quad(repoNode, namedNode(RDF_TYPE), namedNode(`${DCAT}Dataset`)),
    quad(repoNode, namedNode(`${DCTERMS}title`), literal('Fediverse Enhancement Proposals')),
    quad(
      repoNode,
      namedNode(`${DCTERMS}description`),
      literal(
        'Fediverse Enhancement Proposals (FEPs), the community process for documenting Fediverse interoperability proposals.',
      ),
    ),
    quad(repoNode, namedNode(`${DCTERMS}license`), licenseNode),
    quad(repoNode, namedNode(`${DCTERMS}source`), repoNode),
    quad(repoNode, namedNode(`${DCAT}accessURL`), namedNode(FEP_SITE)),
    quad(repoNode, namedNode(`${DCAT}downloadURL`), namedNode(FEP_ARCHIVE_URL)),
    quad(repoNode, namedNode(FEP_INDEX), namedNode(FEP_INDEX_URL)),
    quad(
      repoNode,
      namedNode(ROW_COUNT),
      literal(String(rows.length), namedNode(`${XSD}integer`)),
    ),
    quad(licenseNode, namedNode(RDF_TYPE), namedNode(`${DCTERMS}LicenseDocument`)),
    quad(
      licenseNode,
      namedNode(`${DCTERMS}title`),
      literal('CC0 1.0 Universal'),
    ),
    quad(licenseNode, namedNode(`${DCTERMS}source`), licenseNode),
  )

  const latest = latestFepDate(rows)
  const modified = dateLiteral(latest)
  if (modified) quads.push(quad(repoNode, namedNode(`${DCTERMS}modified`), modified))

  for (const row of rows) {
    const slug = text(row.slug)
    if (!slug) continue
    const node = namedNode(fepUri(slug))
    const doc = documents.get(slug)

    quads.push(
      quad(node, namedNode(RDF_TYPE), namedNode(FEP_CLASS)),
      quad(node, namedNode(FEP_ID), literal(slug)),
      quad(node, namedNode(`${EX}name`), literal(fepLabel(slug))),
      quad(node, namedNode(FEP_SOURCE), namedNode(fepSourceUrl(slug))),
      quad(node, namedNode(`${DCTERMS}source`), repoNode),
      quad(node, namedNode(`${DCTERMS}license`), licenseNode),
    )
    addString(quads, node, `${EX}title`, row.title)
    addString(quads, node, FEP_STATUS, row.status)
    addString(quads, node, FEP_TYPE, row.type ?? row.category ?? 'informational')
    addString(quads, node, `${DCTERMS}description`, doc?.summary)
    addInteger(quads, node, FEP_IMPLEMENTATIONS, row.implementations)
    addIri(quads, node, FEP_TRACKING_ISSUE, row.trackingIssue)
    addIri(quads, node, FEP_DISCUSSIONS_TO, row.discussionsTo)

    addDate(quads, node, `${DCTERMS}created`, row.dateReceived)
    addDate(quads, node, `${EX}dateFinalized`, row.dateFinalized)
    addDate(quads, node, `${EX}dateWithdrawn`, row.dateWithdrawn)
    addDate(
      quads,
      node,
      `${DCTERMS}modified`,
      row.dateFinalized ?? row.dateWithdrawn ?? row.date,
    )

    for (const author of stringList(row.authors)) {
      quads.push(quad(node, namedNode(FEP_AUTHOR), literal(author)))
      const match = /^(.*?)\s*<([^>]+)>\s*(.*)$/.exec(author)
      if (!match) continue
      const name = [match[1]?.trim(), match[3]?.trim()].filter(Boolean).join(' ')
      addString(quads, node, FEP_AUTHOR_NAME, name)
      addString(quads, node, FEP_AUTHOR_CONTACT, match[2])
    }

    for (const value of stringList(row.tags)) {
      quads.push(quad(node, namedNode(FEP_TAG), literal(value)))
    }
    for (const value of stringList(row.categories)) {
      quads.push(quad(node, namedNode(FEP_CATEGORY), literal(value)))
    }
    for (const value of stringList(row.protocols)) {
      quads.push(quad(node, namedNode(FEP_PROTOCOL), literal(value)))
    }
    for (const value of stringList(row.relatedFeps)) {
      const related = relatedFepSlug(value)
      if (related) {
        quads.push(quad(node, namedNode(FEP_RELATED), namedNode(fepUri(related))))
      }
    }
    for (const value of stringList(row.replaces)) {
      const replaced = relatedFepSlug(value)
      if (replaced) {
        quads.push(quad(node, namedNode(FEP_REPLACES), namedNode(fepUri(replaced))))
      }
    }
    if (row.replacedBy) {
      const replacement = relatedFepSlug(row.replacedBy)
      if (replacement) {
        quads.push(
          quad(node, namedNode(FEP_REPLACED_BY), namedNode(fepUri(replacement))),
        )
      }
    }

    if ((row.implementations ?? 0) <= 0) continue
    for (const implementation of doc?.implementations ?? []) {
      const implementationNode = namedNode(
        `urn:fedidb:fep-implementation:${encodeURIComponent(slug)}:${implementation.index}`,
      )
      quads.push(
        quad(node, namedNode(FEP_IMPLEMENTATION), implementationNode),
        quad(
          implementationNode,
          namedNode(RDF_TYPE),
          namedNode(FEP_IMPLEMENTATION_CLASS),
        ),
        quad(implementationNode, namedNode(FEP), node),
        quad(
          implementationNode,
          namedNode(`${EX}name`),
          literal(implementation.label),
        ),
      )
      if (implementation.url) {
        quads.push(
          quad(
            implementationNode,
            namedNode(`${EX}url`),
            namedNode(implementation.url),
          ),
        )
      }
    }
  }

  return quads
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
      quad(
        subject,
        namedNode(predicate),
        literal(String(number), namedNode(`${XSD}integer`)),
      ),
    )
  }
}
