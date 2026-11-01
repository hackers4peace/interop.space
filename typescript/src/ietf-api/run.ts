// Standalone IETF stage runner (no Temporal). Runs the same ordered steps as
// the workflow; each step skips when its stage file already exists.
//
// Usage (from typescript/):
//   STAGES_DIR=../data/dump/ietf ALL_STAGES_DIR=../data/dump bun run src/ietf-api/run.ts
import {
  storeIetfAreas,
  storeIetfGroups,
  storeIetfSeries,
  storeIetfCitations,
  storeIetfSpecPeople,
  storeIetfSpecs,
} from './activities.ts'

export async function main(): Promise<void> {
  const steps = [
    await storeIetfAreas(),
    await storeIetfSeries(),
    await storeIetfGroups(),
    await storeIetfSpecs(),
    await storeIetfSpecPeople(),
    await storeIetfCitations(),
  ]
  for (const step of steps) console.log(JSON.stringify(step, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
