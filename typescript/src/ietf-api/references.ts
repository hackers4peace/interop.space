// IETF reference evidence: crawl the Datatracker-rendered HTML of every
// published RFC and record the URLs its references point at.
//
// Datatracker's own `relateddocument` table only knows IETF documents, so this
// pass exists to discover non-IETF targets (W3C specs above all). It is not a
// Temporal stage: a plain container runs it, with a resume checkpoint, because
// ~9.8k documents take ~40 minutes (ietf-plan.md §6.1, D10).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataFactory, Parser, Store } from 'n3'
import type { Quad } from 'n3'
import {
  crawlReferences,
  writeReferencesFile,
  type ReferenceTarget,
  type ReferencesFile,
} from '../catalog/references.ts'
import { EXTRACT } from './references-extract.ts'
import { IETF_SDO, stageFile, stagesDir } from './stages.ts'

const { namedNode } = DataFactory

const DOC_HTML = 'https://datatracker.ietf.org/doc/html'

/** `rfc9110` -> the rendered document Datatracker serves. */
export const renderedUrl = (name: string): string => `${DOC_HTML}/${name}`

/** Published RFCs from `specs.nq`, the documents whose references we crawl. */
export function readSpecTargets(): ReferenceTarget[] {
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
  const shortname = namedNode(`http://example.org#shortname`)
  const targets: ReferenceTarget[] = []
  for (const subject of store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    namedNode('http://example.org#Specification'),
    null,
  )) {
    const name = store.getObjects(subject, shortname, null)[0]?.value
    if (!name) continue
    targets.push({ source: subject.value, url: renderedUrl(name) })
  }
  return targets.sort((a, b) => a.source.localeCompare(b.source))
}

export interface ReferencesBuildResult {
  file: ReferencesFile
  path: string
}

/** Crawl every RFC and write `data/dump/ietf/references.json`. */
export async function buildIetfReferences(
  options: { concurrency?: number; limit?: number; verbose?: boolean } = {},
): Promise<ReferencesBuildResult> {
  const targets = readSpecTargets()
  const limited =
    options.limit === undefined ? targets : targets.slice(0, options.limit)
  const started = Date.now()
  const result = await crawlReferences(limited, EXTRACT, {
    concurrency: options.concurrency ?? Number(process.env.REFERENCES_CONCURRENCY ?? 4),
    rateLimit: {
      limit: Number(process.env.REFERENCES_RATE_LIMIT ?? 4),
      interval: 1000,
    },
    checkpointPath: join(stagesDir(), 'references.jsonl'),
    onProgress: options.verbose
      ? (done, total) => {
          if (done % 250 === 0 || done === total) {
            const elapsed = Math.round((Date.now() - started) / 1000)
            console.error(`  ${done}/${total} documents (${elapsed}s)`)
          }
        }
      : undefined,
  })

  const file: ReferencesFile = {
    retrievedAt: new Date().toISOString(),
    sdo: IETF_SDO,
    source: `${DOC_HTML}/<name>`,
    counts: {
      documents: targets.length,
      ok: result.ok + result.skipped,
      failed: result.failures.length,
      references: result.entries.length,
      withUrl: result.entries.length,
      // Documents that yielded nothing: no references section in the rendering
      // (pre-XML RFCs) or no reference links at all (W3C specs without a
      // references appendix).
      withReferences: new Set(result.entries.map((entry) => entry.source)).size,
    },
    entries: result.entries,
    failures: result.failures,
  }
  const path = writeReferencesFile(
    join(stagesDir(), 'references.json'),
    file,
  )
  return { file, path }
}

if (import.meta.main) {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined
  buildIetfReferences({ limit, verbose: true })
    .then(({ file, path }) => {
      console.log(
        `ietf references: ${file.counts.references} URLs from ${file.counts.ok}/${file.counts.documents} documents (${file.counts.failed} failed) -> ${path}`,
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
