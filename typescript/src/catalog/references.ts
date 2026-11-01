// Reference evidence shared by every SDO: what each crawled document cites,
// with the URL exactly as rendered. The per-SDO `*-references` functions write
// one file each; the cross-SDO linker reads them and never re-crawls
// (ietf-plan.md §6.3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type ReferenceNature = 'normative' | 'informative'

export interface DumpReference {
  /** Catalog subject of the citing document. */
  source: string
  /** Snapshot that was read, when it differs from the subject (dated TR). */
  sourceVersion?: string
  /** Reference key as written in the source (`RFC8288`, `HTML5`). */
  key?: string
  nature: ReferenceNature
  /** Target URL exactly as extracted, before normalisation. */
  url: string
}

export interface ReferencesFile {
  retrievedAt: string
  /** SDO whose documents were crawled (`https://www.w3.org/`). */
  sdo: string
  /** Origin of the crawl, e.g. the URL pattern or the dump it came from. */
  source: string
  counts: {
    documents: number
    ok: number
    failed: number
    references: number
    withUrl: number
    /** Documents that produced at least one URL. */
    withReferences?: number
  }
  entries: DumpReference[]
  /** Documents that could not be crawled; a rerun retries them. */
  failures: { source: string; error: string }[]
}

export function readReferencesFile(path: string): ReferencesFile | undefined {
  if (!existsSync(path)) return undefined
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ReferencesFile
  return { ...parsed, entries: parsed.entries ?? [], failures: parsed.failures ?? [] }
}

export function writeReferencesFile(
  path: string,
  file: ReferencesFile,
): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  return path
}

/** One document to crawl. */
export interface ReferenceTarget {
  /** Catalog subject the extracted references belong to. */
  source: string
  /** URL of the rendered document. */
  url: string
  /** Optional snapshot URL recorded on every entry. */
  sourceVersion?: string
}

export interface CrawlOptions {
  /** Documents fetched in parallel. */
  concurrency?: number
  /** Requests per interval, shared by all workers. */
  rateLimit?: { limit: number; interval: number }
  timeoutMs?: number
  /** Attempts per document; 429/5xx are retried with backoff. */
  retries?: number
  /** Append-only checkpoint; a rerun skips sources already listed here. */
  checkpointPath?: string
  /** Progress callback, called after every finished document. */
  onProgress?: (done: number, total: number) => void
  fetchImpl?: typeof fetch
}

export interface CrawlResult {
  entries: DumpReference[]
  failures: { source: string; error: string }[]
  ok: number
  skipped: number
}

const DEFAULT_TIMEOUT_MS = 60_000

/** Simple semaphore, so the shared rate limit and the pool stay independent. */
function limiter(limit: number, interval: number) {
  let windowStart = 0
  let count = 0
  return async (): Promise<void> => {
    const now = Date.now()
    if (now - windowStart >= interval) {
      windowStart = now
      count = 0
    }
    if (count >= limit) {
      await new Promise((resolve) =>
        setTimeout(resolve, windowStart + interval - Date.now()),
      )
      windowStart = Date.now()
      count = 0
    }
    count += 1
  }
}

/**
 * Crawl rendered documents and collect every reference that has a URL.
 *
 * Resumable: completed sources are appended to `checkpointPath` as JSON lines
 * and skipped on the next run, so an interrupted 40-minute sweep does not start
 * over.
 */
export async function crawlReferences(
  targets: ReferenceTarget[],
  extract: (html: string) => {
    references: { key: string; nature: ReferenceNature; targetUrl?: string }[]
  },
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const wait = limiter(
    options.rateLimit?.limit ?? 4,
    options.rateLimit?.interval ?? 1000,
  )

  const checkpoint = new Map<string, DumpReference[]>()
  if (options.checkpointPath && existsSync(options.checkpointPath)) {
    for (const line of readFileSync(options.checkpointPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line) as {
          source: string
          entries: DumpReference[]
        }
        if (row.source) checkpoint.set(row.source, row.entries ?? [])
      } catch {
        // A half-written last line is expected after an interruption.
      }
    }
  }

  const pending = targets.filter((target) => !checkpoint.has(target.source))
  // Captured up front: `pending` is drained by the workers.
  const alreadyDone = targets.length - pending.length
  const entries: DumpReference[] = [...checkpoint.values()].flat()
  const failures: { source: string; error: string }[] = []
  let ok = 0
  let done = 0

  const append = (target: ReferenceTarget, found: DumpReference[]) => {
    if (!options.checkpointPath) return
    mkdirSync(dirname(options.checkpointPath), { recursive: true })
    writeFileSync(
      options.checkpointPath,
      `${JSON.stringify({ source: target.source, entries: found })}\n`,
      { flag: 'a' },
    )
  }

  const worker = async () => {
    while (pending.length > 0) {
      const target = pending.shift()!
      let attempt = 0
      try {
        let html: string | undefined
        while (html === undefined) {
          attempt += 1
          await wait()
          const response = await fetchImpl(target.url, {
            headers: {
              Accept: 'text/html,application/xhtml+xml',
              'User-Agent': 'interop.space references (+https://interop.space)',
            },
            signal: AbortSignal.timeout(timeoutMs),
          })
          if (response.ok) {
            html = await response.text()
            break
          }
          const retryable = response.status === 429 || response.status >= 500
          const detail = `HTTP ${response.status} ${response.statusText}`
          if (!retryable || attempt >= (options.retries ?? 3)) {
            throw new Error(detail)
          }
          const retryAfter = Number(response.headers.get('retry-after') ?? '')
          const delay = Math.min(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 1000 * attempt,
            10_000,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        const extraction = extract(html)
        const found: DumpReference[] = []
        for (const reference of extraction.references) {
          if (!reference.targetUrl) continue
          found.push({
            source: target.source,
            ...(target.sourceVersion
              ? { sourceVersion: target.sourceVersion }
              : {}),
            key: reference.key,
            nature: reference.nature,
            url: reference.targetUrl,
          })
        }
        entries.push(...found)
        append(target, found)
        ok += 1
      } catch (error) {
        failures.push({
          source: target.source,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      done += 1
      options.onProgress?.(done, targets.length)
    }
  }

  const concurrency = Math.max(1, options.concurrency ?? 4)
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  )

  return {
    entries,
    failures,
    ok,
    skipped: alreadyDone,
  }
}
