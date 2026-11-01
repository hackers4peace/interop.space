// Cross-SDO reference linker.
//
// Reads the reference evidence each SDO's crawl wrote (`references.json`), maps
// the recorded URLs onto the other SDO's catalog subjects, and emits
// `ex:normativeRef` / `ex:informativeRef` edges in `data/dump/cross/refs.nq`.
//
// No network access: the evidence files are the contract (ietf-plan.md §6.1).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataFactory, Parser, Store, Writer } from 'n3'
import type { Quad } from 'n3'
import {
  readReferencesFile,
  type DumpReference,
  type ReferenceNature,
} from './catalog/references.ts'

const { namedNode, quad } = DataFactory

const EX = 'http://example.org#'
export const NORMATIVE_REF = `${EX}normativeRef`
export const INFORMATIVE_REF = `${EX}informativeRef`

const ROOT = new URL('../..', import.meta.url).pathname

export type IetfTargetKind = 'rfc' | 'bcp' | 'std' | 'fyi' | 'draft' | 'unknown'

export interface IetfTarget {
  kind: IetfTargetKind
  /** `rfc9110`, `bcp14`, or the draft name. */
  name?: string
}

const RFC_EDITOR = /^rfc(\d+)$/i
const SUBSERIES = /^(bcp|std|fyi)(\d+)$/i
const DRAFT = /^draft-[a-z0-9-]+$/i

/**
 * Derive the IETF document a URL points at. Hosts and path shapes come from the
 * links actually found in W3C specs: `rfc-editor.org/info/rfcN/`,
 * `rfc-editor.org/rfc/rfcN.html`, `tools.ietf.org/html/rfcN`,
 * `datatracker.ietf.org/doc/html/rfcN`, `doi.org/10.17487/RFCN`.
 */
export function ietfTargetFromUrl(url: string): IetfTarget | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, '')
  const segments = path.split('/').filter(Boolean)

  const classify = (value: string | undefined): IetfTarget | undefined => {
    if (!value) return undefined
    const cleaned = value.replace(/\.(html?|txt|xml|pdf)$/i, '')
    if (RFC_EDITOR.test(cleaned)) return { kind: 'rfc', name: cleaned.toLowerCase() }
    const subseries = SUBSERIES.exec(cleaned)
    if (subseries?.[1] && subseries[2]) {
      return {
        kind: subseries[1].toLowerCase() as IetfTargetKind,
        name: `${subseries[1].toLowerCase()}${Number(subseries[2])}`,
      }
    }
    if (DRAFT.test(cleaned)) return { kind: 'draft', name: cleaned.toLowerCase() }
    return undefined
  }

  if (host === 'doi.org') {
    const doi = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
    const rfc = /^10\.17487\/rfc(\d+)$/i.exec(doi)
    if (rfc?.[1]) return { kind: 'rfc', name: `rfc${Number(rfc[1])}` }
    return undefined
  }

  if (host === 'rfc-editor.org') {
    // /info/<doc>[/], /rfc/<doc>.<ext>
    if (segments[0] === 'info' || segments[0] === 'rfc') {
      return classify(segments[1])
    }
    return undefined
  }

  if (host === 'datatracker.ietf.org' || host === 'tools.ietf.org') {
    // /doc/<doc>/, /doc/html/<doc>, /html/<doc>
    if (segments[0] === 'doc' && segments[1] === 'html') {
      return classify(segments[2])
    }
    if (segments[0] === 'doc' || segments[0] === 'html') {
      return classify(segments[1])
    }
    return undefined
  }

  if (host === 'ietf.org') {
    // legacy /rfc/rfcN.txt and the draft archive /archive/id/draft-x-01.html
    if (segments[0] === 'rfc') return classify(segments[1])
    if (segments[0] === 'archive' && segments[1] === 'id') {
      return classify(segments[2])
    }
    return undefined
  }

  if (host === 'httpwg.org') {
    if (segments[0] === 'specs') return classify(segments[1])
    return undefined
  }

  return undefined
}

const TR_DATED = /^\/TR\/\d{4}\/[A-Z]+-(.+)-\d{8}$/
const TR_PLAIN = /^\/TR\/([^/]+)$/
const TR_YEAR_INDEX = /^\/TR\/\d{4}$/

/**
 * Derive the W3C shortname a URL points at: `/TR/<shortname>/` and the dated
 * form `/TR/<YYYY>/<STATUS>-<shortname>-<YYYYMMDD>/`.
 */
export function w3cShortnameFromUrl(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'w3.org') return undefined
  const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, '')
  if (!path.startsWith('/TR/')) return undefined
  if (TR_YEAR_INDEX.test(path)) return undefined

  const dated = TR_DATED.exec(path)
  if (dated?.[1]) return dated[1].toLowerCase()

  const plain = TR_PLAIN.exec(path)
  if (plain?.[1]) return plain[1].toLowerCase()

  // Nested TR paths (`/TR/xhtml-basic/xhtml-basic10.dtd`) resolve to the first
  // segment, which is the shortname.
  const nested = /^\/TR\/([^/]+)\//.exec(path)
  return nested?.[1]?.toLowerCase()
}

export interface CrossIndexes {
  /** IETF `ex:shortname` (`rfc9110`, `bcp14`) → catalog subject. */
  ietfByShortname: ReadonlyMap<string, string>
  /** W3C TR shortname (`did-core`) → catalog subject. */
  w3cByShortname: ReadonlyMap<string, string>
}

export interface CrossEdge {
  source: string
  target: string
  nature: ReferenceNature
  origin: 'w3c→ietf' | 'ietf→w3c'
}

export interface CrossrefResult {
  edges: CrossEdge[]
  counts: {
    w3cSources: number
    ietfSources: number
    edges: number
    w3cToIetf: number
    ietfToW3c: number
    normative: number
    informative: number
    duplicates: number
    conflicts: number
  }
  /** IETF URLs found in W3C documents that are not in the catalog. */
  ietfUnmatched: [string, number][]
  /** Hosts of W3C URLs found in IETF documents that are not W3C catalog specs. */
  w3cUnmatchedHosts: [string, number][]
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return '(invalid)'
  }
}

/**
 * Join two evidence sets through the catalog indexes.
 *
 * A URL that resolves into the other SDO's catalog becomes an edge; everything
 * else is aggregated in the report so future SDOs can be prioritised.
 */
export function linkCrossSdo(
  w3cReferences: DumpReference[],
  ietfReferences: DumpReference[],
  indexes: CrossIndexes,
): CrossrefResult {
  const seen = new Map<string, CrossEdge>()
  const ietfUnmatched = new Map<string, number>()
  const w3cUnmatchedHosts = new Map<string, number>()
  let duplicates = 0
  let conflicts = 0

  const add = (edge: CrossEdge): boolean => {
    const key = `${edge.source}\u0000${edge.target}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, edge)
      return true
    }
    if (existing.nature === edge.nature) {
      duplicates += 1
      return false
    }
    if (edge.nature === 'normative') {
      existing.nature = 'normative'
      conflicts += 1
      return false
    }
    duplicates += 1
    return false
  }

  const w3cSubjects = new Set(indexes.w3cByShortname.values())
  const ietfSubjects = new Set(indexes.ietfByShortname.values())

  const w3cSources = new Set<string>()
  for (const reference of w3cReferences) {
    // Only documents of this SDO can be the citing side.
    if (!w3cSubjects.has(reference.source)) continue
    w3cSources.add(reference.source)
    // Intra-SDO references are owned by the SDO's own citations stage.
    if (w3cShortnameFromUrl(reference.url)) continue
    const target = ietfTargetFromUrl(reference.url)
    if (!target) continue
    if (target.kind === 'draft' || target.kind === 'unknown' || !target.name) {
      ietfUnmatched.set(target.name ?? reference.url, (ietfUnmatched.get(target.name ?? reference.url) ?? 0) + 1)
      continue
    }
    const subject = indexes.ietfByShortname.get(target.name)
    if (!subject) {
      ietfUnmatched.set(target.name, (ietfUnmatched.get(target.name) ?? 0) + 1)
      continue
    }
    if (subject === reference.source) continue
    add({
      source: reference.source,
      target: subject,
      nature: reference.nature,
      origin: 'w3c→ietf',
    })
  }

  const ietfSources = new Set<string>()
  for (const reference of ietfReferences) {
    if (!ietfSubjects.has(reference.source)) continue
    ietfSources.add(reference.source)
    // Intra-SDO references are owned by the citations stage.
    if (ietfTargetFromUrl(reference.url)) continue
    const shortname = w3cShortnameFromUrl(reference.url)
    if (!shortname) {
      const host = hostOf(reference.url)
      w3cUnmatchedHosts.set(host, (w3cUnmatchedHosts.get(host) ?? 0) + 1)
      continue
    }
    const subject = indexes.w3cByShortname.get(shortname)
    if (!subject) {
      w3cUnmatchedHosts.set(
        `w3.org/TR/${shortname}`,
        (w3cUnmatchedHosts.get(`w3.org/TR/${shortname}`) ?? 0) + 1,
      )
      continue
    }
    if (subject === reference.source) continue
    add({
      source: reference.source,
      target: subject,
      nature: reference.nature,
      origin: 'ietf→w3c',
    })
  }

  const edges = [...seen.values()].sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  )
  const normative = edges.filter((edge) => edge.nature === 'normative').length

  const top = (map: Map<string, number>, limit = 50) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)

  return {
    edges,
    counts: {
      w3cSources: w3cSources.size,
      ietfSources: ietfSources.size,
      edges: edges.length,
      w3cToIetf: edges.filter((edge) => edge.origin === 'w3c→ietf').length,
      ietfToW3c: edges.filter((edge) => edge.origin === 'ietf→w3c').length,
      normative,
      informative: edges.length - normative,
      duplicates,
      conflicts,
    },
    ietfUnmatched: top(ietfUnmatched),
    w3cUnmatchedHosts: top(w3cUnmatchedHosts),
  }
}

/** RDF for the cross-SDO edges, using the same predicates as the SDO stages. */
export function buildCrossQuads(edges: CrossEdge[]): Quad[] {
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

// --- CLI ------------------------------------------------------------------

function readSpecIndex(path: string, kind: 'ietf' | 'w3c'): Map<string, string> {
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(readFileSync(path, 'utf8')) as Quad[],
  )
  const rdfType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
  const index = new Map<string, string>()
  const shortname = namedNode(`${EX}shortname`)
  const classes =
    kind === 'ietf'
      ? ['Specification', 'SpecificationSeries']
      : ['Specification']
  for (const className of classes) {
    for (const subject of store.getSubjects(rdfType, namedNode(`${EX}${className}`), null)) {
      if (kind === 'ietf') {
        const name = store.getObjects(subject, shortname, null)[0]?.value
        if (name) index.set(name.toLowerCase(), subject.value)
        continue
      }
      // W3C: the TR shortname from the subject path, plus the API shortname.
      const segment = /\/TR\/([^/]+)\/?$/.exec(subject.value)?.[1]
      if (segment) index.set(segment.toLowerCase(), subject.value)
      const apiName = store.getObjects(subject, shortname, null)[0]?.value
      if (apiName && !index.has(apiName.toLowerCase())) {
        index.set(apiName.toLowerCase(), subject.value)
      }
    }
  }
  return index
}

export interface CrossrefOptions {
  root?: string
  write?: boolean
}

export function runCrossref(options: CrossrefOptions = {}): {
  result: CrossrefResult
  quads: Quad[]
  reportPath?: string
  quadsPath?: string
} {
  const root =
    options.root ?? process.env.CROSS_DUMP_ROOT ?? join(ROOT, 'data/dump')
  const w3cReferences = readReferencesFile(join(root, 'w3c', 'references.json'))
  const ietfReferences = readReferencesFile(join(root, 'ietf', 'references.json'))
  if (!w3cReferences) {
    throw new Error(`missing ${join(root, 'w3c', 'references.json')}`)
  }
  if (!ietfReferences) {
    throw new Error(`missing ${join(root, 'ietf', 'references.json')}`)
  }

  // Series live in their own stage file for IETF; merge them into one index.
  const ietfByShortname = readSpecIndex(join(root, 'ietf', 'specs.nq'), 'ietf')
  for (const [name, uri] of readSpecIndex(
    join(root, 'ietf', 'series.nq'),
    'ietf',
  )) {
    if (!ietfByShortname.has(name)) ietfByShortname.set(name, uri)
  }
  const indexes: CrossIndexes = {
    ietfByShortname,
    w3cByShortname: readSpecIndex(join(root, 'w3c', 'specs.nq'), 'w3c'),
  }

  const result = linkCrossSdo(
    w3cReferences.entries,
    ietfReferences.entries,
    indexes,
  )
  const quads = buildCrossQuads(result.edges)

  let reportPath: string | undefined
  let quadsPath: string | undefined
  if (options.write !== false) {
    const out = join(root, 'cross')
    mkdirSync(out, { recursive: true })
    quadsPath = join(out, 'refs.nq')
    writeFileSync(
      quadsPath,
      new Writer({ format: 'N-Quads' }).quadsToString(quads),
      'utf8',
    )
    reportPath = join(out, 'cross-report.json')
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          inputs: {
            w3c: { path: join(root, 'w3c', 'references.json'), ...w3cReferences.counts },
            ietf: { path: join(root, 'ietf', 'references.json'), ...ietfReferences.counts },
          },
          counts: result.counts,
          ietfUnmatched: result.ietfUnmatched,
          w3cUnmatchedHosts: result.w3cUnmatchedHosts,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
  return { result, quads, ...(reportPath ? { reportPath } : {}), ...(quadsPath ? { quadsPath } : {}) }
}

if (import.meta.main) {
  try {
    const { result, reportPath, quadsPath } = runCrossref()
    console.log(
      `cross references: ${result.counts.edges} edges (${result.counts.w3cToIetf} w3c→ietf, ${result.counts.ietfToW3c} ietf→w3c; ${result.counts.normative} normative, ${result.counts.informative} informative)`,
    )
    console.log(`  written: ${quadsPath}`)
    console.log(`  report:  ${reportPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
