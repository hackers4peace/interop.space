// Standalone FediDB runner (no Temporal). Runs the same metadata fetch and
// per-dataset activities as the workflow, writing data/fedidb/*.nq.
//
// Usage (from typescript/):
//   STAGES_DIR=../data/fedidb bun run src/fedidb/run.ts
//   STAGES_DIR=../data/fedidb bun run src/fedidb/run.ts software servers
//   STAGES_DIR=../data/fedidb bun run src/fedidb/run.ts --force software
import {
  fetchDatasetCatalog,
  ingestDataset,
  ingestFeps,
  storeDatasetCatalog,
} from './activities.ts'
import { DATASET_SLUGS, FEP_SLUG } from './stages.ts'

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const requested = argv.filter((argument) => !argument.startsWith('-'))
const supported = [...DATASET_SLUGS, FEP_SLUG]
const unknown = requested.filter((slug) => !supported.includes(slug))
if (unknown.length > 0) {
  console.error(
    `unknown FediDB dataset(s): ${unknown.join(', ')}; known: ${supported.join(', ')}`,
  )
  process.exit(1)
}

export async function main(): Promise<void> {
  const wanted = requested.length > 0 ? new Set(requested) : undefined
  const catalog = await fetchDatasetCatalog()
  console.log(JSON.stringify(await storeDatasetCatalog(catalog), null, 2))

  for (const dataset of catalog.datasets) {
    if (!DATASET_SLUGS.includes(dataset.slug)) continue
    if (wanted && !wanted.has(dataset.slug)) continue
    console.log(JSON.stringify(await ingestDataset(dataset, force), null, 2))
  }

  if (!wanted || wanted.has(FEP_SLUG)) {
    console.log(JSON.stringify(await ingestFeps(force), null, 2))
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
