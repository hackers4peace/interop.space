// W3C reference evidence: crawl the rendered HTML of every catalogued
// specification and record the URLs its references point at.
//
// The W3C citations stage already resolves W3C-to-W3C edges but discards the
// URLs it cannot use; this pass keeps them, so the cross-SDO linker can find
// the RFCs a W3C spec cites (ietf-plan.md §9.16, §6.3).
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
import { extractDocument } from '../citations/extract.ts'
import { stagesDir } from './identity.ts'
import { W3C_SDO } from './stages.ts'

const { namedNode } = DataFactory

/** Spec subjects are the undated TR shortlinks, which always serve the latest. */
export function readSpecTargets(): ReferenceTarget[] {
  const path = join(stagesDir(), 'specs.nq')
  if (!existsSync(path)) {
    throw new Error(`specs.nq is missing at ${path}; run the W3C dump first`)
  }
  const store = new Store()
  store.addQuads(
    new Parser({ format: 'N-Quads' }).parse(
      readFileSync(path, 'utf8'),
    ) as Quad[],
  )
  const targets: ReferenceTarget[] = []
  for (const subject of store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    namedNode('http://example.org#Specification'),
    null,
  )) {
    targets.push({ source: subject.value, url: subject.value })
  }
  return targets.sort((a, b) => a.source.localeCompare(b.source))
}

export interface ReferencesBuildResult {
  file: ReferencesFile
  path: string
}

export async function buildW3cReferences(
  options: { concurrency?: number; limit?: number; verbose?: boolean } = {},
): Promise<ReferencesBuildResult> {
  const targets = readSpecTargets()
  const limited =
    options.limit === undefined ? targets : targets.slice(0, options.limit)
  const started = Date.now()
  const result = await crawlReferences(limited, extractDocument, {
    // W3C answers 429 above ~2 requests/s (measured: 121 of 845 failed at 4/s).
    concurrency: options.concurrency ?? Number(process.env.REFERENCES_CONCURRENCY ?? 2),
    rateLimit: {
      limit: Number(process.env.REFERENCES_RATE_LIMIT ?? 2),
      interval: 1000,
    },
    checkpointPath: join(stagesDir(), 'references.jsonl'),
    onProgress: options.verbose
      ? (done, total) => {
          if (done % 100 === 0 || done === total) {
            const elapsed = Math.round((Date.now() - started) / 1000)
            console.error(`  ${done}/${total} documents (${elapsed}s)`)
          }
        }
      : undefined,
  })

  const file: ReferencesFile = {
    retrievedAt: new Date().toISOString(),
    sdo: W3C_SDO,
    source: 'TR shortlinks (latest rendered version)',
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
  const path = writeReferencesFile(join(stagesDir(), 'references.json'), file)
  return { file, path }
}

if (import.meta.main) {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined
  buildW3cReferences({ limit, verbose: true })
    .then(({ file, path }) => {
      console.log(
        `w3c references: ${file.counts.references} URLs from ${file.counts.ok}/${file.counts.documents} documents (${file.counts.failed} failed) -> ${path}`,
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
