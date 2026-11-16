// Standalone Local-First runner (no Temporal). Runs the same activities as the
// workflow, writing data/localfirst/*.nq.
//
// Usage (from typescript/):
//   STAGES_DIR=../data/localfirst bun run src/localfirst/run.ts
//   STAGES_DIR=../data/localfirst bun run src/localfirst/run.ts software
//   STAGES_DIR=../data/localfirst bun run src/localfirst/run.ts locations events
import {
  storeLocalfirstEvents,
  storeLocalfirstLocations,
  storeLocalfirstOrganizations,
  storeLocalfirstSoftware,
} from './activities.ts'
import { STAGE_ORDER, type StageName } from './stages.ts'

const runners: Record<StageName, () => Promise<unknown>> = {
  organizations: storeLocalfirstOrganizations,
  locations: storeLocalfirstLocations,
  events: storeLocalfirstEvents,
  software: storeLocalfirstSoftware,
}

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const unknown = requested.filter(
  (stage) => !(STAGE_ORDER as string[]).includes(stage),
)
if (unknown.length > 0) {
  console.error(
    `unknown Local-First stage(s): ${unknown.join(', ')}; known: ${STAGE_ORDER.join(', ')}`,
  )
  process.exit(1)
}

export async function main(): Promise<void> {
  const stages =
    requested.length > 0
      ? (requested as StageName[])
      : (STAGE_ORDER as StageName[])
  for (const stage of stages) {
    console.log(JSON.stringify(await runners[stage](), null, 2))
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
