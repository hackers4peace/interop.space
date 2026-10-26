// Fetch the latest version of each catalog spec, extract its rendered
// references, resolve W3C targets, and return both the citation quads and a
// run report. Network access is injectable so tests stay offline.
//
// The activity runs in two passes: first every W3C API version lookup, then the
// TR HTML crawl. This keeps API requests out of the crawl and lets each host
// have its own rate limit.

import { setTimeout as sleep } from 'node:timers/promises'
import pThrottle from 'p-throttle'
import { buildCitationQuads } from './build.ts'
import { extractDocument } from './extract.ts'
import { buildCatalogIndex, resolveReferences } from './resolve.ts'
import {
  citationTotals,
  type CitationDocumentReport,
  type CitationDocumentStatus,
  type CitationReport,
} from './report.ts'
import type { CatalogSpec, Citation } from './types.ts'
import { cleanUrl } from './urls.ts'

interface W3cVersion {
  uri?: string
  shortlink?: string
  status?: string
  date?: string
}

interface VersionLookup {
  uri?: string
  error?: string
}

/** The subset of fetch used here; tests inject a plain async function. */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface CollectOptions {
  fetchImpl?: FetchLike
  /** Parallel documents during the HTML pass. */
  concurrency?: number
  /** Parallel version lookups during the W3C API pass. */
  apiConcurrency?: number
  /** Rate limit for TR HTML requests. */
  rateLimit?: { limit: number; interval: number }
  /** Rate limit for api.w3.org version lookups. */
  apiRateLimit?: { limit: number; interval: number }
  timeoutMs?: number
  /** Overall budget for the run; remaining documents are reported as failed. */
  maxDurationMs?: number
  userAgent?: string
  source?: string
}

export interface CollectResult {
  citations: Citation[]
  report: CitationReport
}

interface CollectedDocument {
  report: CitationDocumentReport
  citations: Citation[]
}

const DEFAULT_CONCURRENCY = 2
const DEFAULT_API_CONCURRENCY = 4
const DEFAULT_RATE_LIMIT = { limit: 2, interval: 1000 }
const DEFAULT_API_RATE_LIMIT = { limit: 10, interval: 1000 }
const MAX_ATTEMPTS = 4
/** Stop starting new work after this budget; the activity timeout is 30 min. */
const DEFAULT_MAX_DURATION_MS = 20 * 60_000
/** A hostile Retry-After must not stall the whole run. */
const MAX_RETRY_AFTER_MS = 5_000
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_USER_AGENT = 'interop.space citations (+https://interop.space)'
const HTML_ACCEPT = 'text/html,application/xhtml+xml'

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Run `fn` over `items` with at most `limit` promises in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = next
        next += 1
        if (index >= items.length) return
        results[index] = await fn(items[index]!)
      }
    },
  )
  await Promise.all(workers)
  return results
}

function failedDocument(
  spec: CatalogSpec,
  status: CitationDocumentStatus,
  error: string,
  versionUri?: string,
): CollectedDocument {
  return {
    citations: [],
    report: {
      spec: spec.uri,
      ...(spec.shortname ? { shortname: spec.shortname } : {}),
      versionApiUrl: spec.latestVersionUrl ?? '',
      ...(versionUri ? { versionUri } : {}),
      status,
      error,
      normative: 0,
      informative: 0,
      resolved: 0,
      skippedNonW3c: 0,
      skippedOutOfCatalog: [],
      unresolved: [],
      selfReferences: [],
      conflicts: [],
      duplicates: 0,
    },
  }
}

export async function collectCitations(
  specs: CatalogSpec[],
  options: CollectOptions = {},
): Promise<CollectResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT
  const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT
  const apiRateLimit = options.apiRateLimit ?? DEFAULT_API_RATE_LIMIT
  const deadline = Date.now() + (options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS)
  const index = buildCatalogIndex(specs)

  const fetchText = async (url: string, accept: string): Promise<string> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('citation run deadline exceeded')
      try {
        const response = await fetchImpl(url, {
          headers: { Accept: accept, 'User-Agent': userAgent },
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        })
        if (!response.ok) {
          const message = `HTTP ${response.status} ${response.statusText}`
          // W3C answers bursts with 429; honor Retry-After and back off.
          if (response.status === 429 && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(
              response.headers.get('retry-after') ?? '',
            )
            const delay = Math.min(
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : 2000 * attempt,
              MAX_RETRY_AFTER_MS,
            )
            if (Date.now() + delay >= deadline) {
              throw new HttpError(response.status, `${message} (deadline)`)
            }
            lastError = new HttpError(response.status, message)
            await sleep(delay)
            continue
          }
          // Retry server errors; other 4xx responses will not improve.
          if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
            const delay = Math.min(1000 * attempt, MAX_RETRY_AFTER_MS)
            if (Date.now() + delay >= deadline) {
              throw new HttpError(response.status, `${message} (deadline)`)
            }
            lastError = new HttpError(response.status, message)
            await sleep(delay)
            continue
          }
          throw new HttpError(response.status, message)
        }
        return await response.text()
      } catch (error) {
        lastError = error
        if (error instanceof HttpError && error.status < 500) throw error
        if (attempt >= MAX_ATTEMPTS) throw error
        const delay = Math.min(1000 * attempt, MAX_RETRY_AFTER_MS)
        if (Date.now() + delay >= deadline) throw error
        await sleep(delay)
      }
    }
    throw lastError
  }

  const apiThrottle = pThrottle(apiRateLimit)(
    (url: string, accept: string) => fetchText(url, accept),
  )
  const htmlThrottle = pThrottle(rateLimit)(
    (url: string, accept: string) => fetchText(url, accept),
  )

  const fetchJson = async <T>(url: string): Promise<T> =>
    JSON.parse(await apiThrottle(url, 'application/json')) as T

  const resolveVersion = async (spec: CatalogSpec): Promise<VersionLookup> => {
    if (Date.now() >= deadline) {
      return { error: 'citation run deadline exceeded' }
    }
    if (!spec.latestVersionUrl) {
      return { error: 'no latest version URL' }
    }
    try {
      const version = await fetchJson<W3cVersion>(spec.latestVersionUrl)
      const uri =
        cleanUrl(version.uri) ??
        cleanUrl(version.shortlink) ??
        cleanUrl(spec.uri)
      return uri ? { uri } : { error: 'version has no URL' }
    } catch (error) {
      return {
        error: `version ${spec.latestVersionUrl}: ${errorMessage(error)}`,
      }
    }
  }

  const collectOne = async (
    spec: CatalogSpec,
    version: VersionLookup,
  ): Promise<CollectedDocument> => {
    if (version.error) {
      return failedDocument(spec, 'version-failed', version.error)
    }
    if (!version.uri) {
      return failedDocument(spec, 'version-failed', 'version has no URL')
    }
    if (Date.now() >= deadline) {
      return failedDocument(
        spec,
        'fetch-failed',
        'citation run deadline exceeded',
        version.uri,
      )
    }

    const versionUri = version.uri
    let html: string
    try {
      html = await htmlThrottle(versionUri, HTML_ACCEPT)
    } catch (error) {
      return failedDocument(
        spec,
        'fetch-failed',
        `${versionUri}: ${errorMessage(error)}`,
        versionUri,
      )
    }

    let extraction: ReturnType<typeof extractDocument>
    try {
      extraction = extractDocument(html)
    } catch (error) {
      return failedDocument(
        spec,
        'parse-failed',
        `${versionUri}: ${errorMessage(error)}`,
        versionUri,
      )
    }

    const base = {
      spec: spec.uri,
      ...(spec.shortname ? { shortname: spec.shortname } : {}),
      versionApiUrl: spec.latestVersionUrl ?? '',
      versionUri,
      generator: extraction.generator,
      ...(extraction.generatorVersion
        ? { generatorVersion: extraction.generatorVersion }
        : {}),
      ...(extraction.generatorLabel
        ? { generatorLabel: extraction.generatorLabel }
        : {}),
    }

    if (!extraction.hasNormativeSection && !extraction.hasInformativeSection) {
      return {
        citations: [],
        report: {
          ...base,
          status: 'unsupported',
          error: extraction.rawRespec
            ? 'raw ReSpec source (not rendered)'
            : 'no references sections',
          normative: 0,
          informative: 0,
          resolved: 0,
          skippedNonW3c: 0,
          skippedOutOfCatalog: [],
          unresolved: [],
          selfReferences: [],
          conflicts: extraction.conflicts,
          duplicates: 0,
        },
      }
    }

    const resolution = resolveReferences(spec, extraction.references, index)
    const normative = extraction.references.filter(
      (reference) => reference.nature === 'normative',
    ).length
    const informative = extraction.references.length - normative

    return {
      citations: resolution.citations,
      report: {
        ...base,
        status: 'ok',
        normative,
        informative,
        resolved: resolution.citations.length,
        skippedNonW3c: resolution.nonW3c.length,
        skippedOutOfCatalog: resolution.outOfCatalog,
        unresolved: resolution.unresolved,
        selfReferences: resolution.selfReferences,
        conflicts: extraction.conflicts,
        duplicates: resolution.duplicates,
      },
    }
  }

  const toFetch = specs.filter((spec) => spec.latestVersionUrl)

  // Pass 1: every W3C API version lookup finishes before any TR crawl starts.
  const versions = new Map<string, VersionLookup>()
  await mapLimit(
    toFetch,
    options.apiConcurrency ?? DEFAULT_API_CONCURRENCY,
    async (spec) => {
      versions.set(spec.uri, await resolveVersion(spec))
    },
  )

  // Pass 2: rendered HTML only, no api.w3.org requests.
  const collected = await mapLimit(
    toFetch,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    (spec) => collectOne(spec, versions.get(spec.uri) ?? {}),
  )
  const documents = collected
    .map((document) => document.report)
    .sort((a, b) => a.spec.localeCompare(b.spec))
  const citations = collected.flatMap((document) => document.citations)

  return {
    citations,
    report: {
      retrievedAt: new Date().toISOString(),
      source: options.source ?? 'W3C API latest versions',
      totals: citationTotals(documents),
      documents,
    },
  }
}
