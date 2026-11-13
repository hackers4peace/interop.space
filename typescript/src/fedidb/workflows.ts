// Temporal workflow for the FediDB weekly exports plus the Codeberg FEP
// archive. The metadata document is fetched once, then every supported dataset
// is refreshed in catalog order.
// An activity decides whether a dataset is unchanged, so replaying the workflow
// does not re-download files whose checksum is already in the manifest.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { FedidbStepResult } from './activities'

const {
  fetchDatasetCatalog,
  storeDatasetCatalog,
  ingestDataset,
  ingestFeps,
} = proxyActivities<typeof activities>({
  // The largest file is the 40k-row domain list; the whole export is a few
  // hundred KB compressed. Ten minutes leaves room for CDN retries.
  startToCloseTimeout: '10 minutes',
})

/** FEPs are fetched from Codeberg, not from the FediDB catalog. */
const FEP_DATASET = 'fep'

/** Dataset slugs handled by this workflow. */
export const FEDIDB_DATASETS = [
  'software',
  'server-domains',
  'servers',
  'open-servers',
  'software-versions',
  'countries',
  'feature-questions',
  'feature-support',
] as const

export interface FedidbWorkflowOptions {
  /** Only refresh these dataset slugs; omitted means every supported dataset. */
  datasets?: string[]
  /** Rebuild even when the manifest says the source checksum is unchanged. */
  force?: boolean
}

export interface FedidbResult {
  catalogGeneratedAt: string
  datasets: FedidbStepResult[]
}

export async function fedidbWorkflow(
  options: FedidbWorkflowOptions = {},
): Promise<FedidbResult> {
  const catalog = await fetchDatasetCatalog()
  const steps: FedidbStepResult[] = [await storeDatasetCatalog(catalog)]

  const wanted = options.datasets?.length
    ? new Set(options.datasets)
    : undefined
  const supported = new Set<string>([...FEDIDB_DATASETS, FEP_DATASET])
  if (wanted) {
    const unknown = [...wanted].filter((slug) => !supported.has(slug))
    if (unknown.length > 0) {
      throw new Error(
        `unknown FediDB dataset(s): ${unknown.join(', ')}; known: ${[...supported].join(', ')}`,
      )
    }
  }

  for (const dataset of catalog.datasets) {
    if (!(FEDIDB_DATASETS as readonly string[]).includes(dataset.slug)) continue
    if (wanted && !wanted.has(dataset.slug)) continue
    steps.push(await ingestDataset(dataset, options.force ?? false))
  }

  if (!wanted || wanted.has(FEP_DATASET)) {
    steps.push(await ingestFeps(options.force ?? false))
  }

  return { catalogGeneratedAt: catalog.generated_at, datasets: steps }
}
