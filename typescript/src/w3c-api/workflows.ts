// Temporal workflow that builds the W3C dataset in dependency order. Every step
// skips when its stage file already exists; completed stage files are loaded as
// the seed, so a rerun only executes missing/failed stages.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type {
  CitationStepResult,
  W3cStepResult,
} from './activities'

const {
  loadSeed,
  seedBase,
  storeW3cGroups,
  storeW3cGroupPeople,
  storeW3cGroupSpecifications,
  storeW3cSpecPeople,
  storeW3cCitations,
} = proxyActivities<typeof activities>({
  // A 429 suspends for 12 minutes inside the activity; the crawl itself can
  // take several minutes for the full group list.
  startToCloseTimeout: '30 minutes',
})

export interface W3cApiResult {
  seed: string
  steps: W3cStepResult[]
  citations: CitationStepResult
}

export async function w3cApiWorkflow(): Promise<W3cApiResult> {
  const seed = await loadSeed()
  await seedBase(seed)

  const steps: W3cStepResult[] = [
    await storeW3cGroups(),
    await storeW3cGroupPeople(),
    await storeW3cGroupSpecifications(),
    await storeW3cSpecPeople(),
  ]
  const citations = await storeW3cCitations()

  return { seed: seed.source, steps, citations }
}
