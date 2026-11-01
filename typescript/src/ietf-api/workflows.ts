// Temporal workflow for the IETF dataset. Stages run in dependency order and
// each one skips when its stage file already exists, so a rerun only executes
// missing or failed stages.
//
// Stage order: areas → series → groups → specs → spec-people → citations.
// `people` (group roles) is deferred.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { IetfStepResult } from './activities'

const {
  storeIetfAreas,
  storeIetfSeries,
  storeIetfGroups,
  storeIetfSpecs,
  storeIetfSpecPeople,
  storeIetfCitations,
} = proxyActivities<typeof activities>({
  // Citations page through ~114 k related-document rows; specs fetch the
  // 13.7 MB RFC index plus ten Datatracker pages.
  startToCloseTimeout: '1 hour',
})

export interface IetfApiResult {
  steps: IetfStepResult[]
}

export async function ietfApiWorkflow(): Promise<IetfApiResult> {
  const steps: IetfStepResult[] = [
    await storeIetfAreas(),
    await storeIetfSeries(),
    await storeIetfGroups(),
    await storeIetfSpecs(),
    await storeIetfSpecPeople(),
    await storeIetfCitations(),
  ]
  return { steps }
}
