// Temporal workflow for the Local-First catalog. Stages run in dependency
// order and each one skips when its stage file already exists, so a rerun only
// executes missing or failed stages.
//
// Stage order: organizations → locations → events → software.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { LocalfirstStepResult } from './activities'

const {
  storeLocalfirstOrganizations,
  storeLocalfirstLocations,
  storeLocalfirstEvents,
  storeLocalfirstSoftware,
} = proxyActivities<typeof activities>({
  // The software stage fetches repos.ts plus one small JSON per technology;
  // the conference page is a single static document.
  startToCloseTimeout: '15 minutes',
  // A changed page layout is deterministic; retrying it forever only delays
  // the failure log. Transient network errors already retry inside the fetch.
  retry: { maximumAttempts: 3 },
})

export interface LocalfirstResult {
  steps: LocalfirstStepResult[]
}

export async function localfirstWorkflow(): Promise<LocalfirstResult> {
  const steps: LocalfirstStepResult[] = [
    await storeLocalfirstOrganizations(),
    await storeLocalfirstLocations(),
    await storeLocalfirstEvents(),
    await storeLocalfirstSoftware(),
  ]
  return { steps }
}
