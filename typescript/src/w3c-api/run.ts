// Standalone W3C crawl runner (no Temporal). Loads the dump into a live SPARQL
// store and runs the same ordered steps as the workflow. Each step skips when
// the store already has its output.
//
// Usage:
//   SPARQL_ENDPOINT=http://localhost:7878 DUMP_PATH=../ui/public/dump.nq \
//     bun run src/w3c-api/run.ts
import {
  loadSeed,
  seedBase,
  storeW3cCitations,
  storeW3cGroupPeople,
  storeW3cGroupSpecifications,
  storeW3cGroups,
  storeW3cSpecPeople,
} from './activities.ts'

export async function main(): Promise<void> {
  const seed = await loadSeed()
  console.error(`seed: ${seed.source}`)
  console.log(await seedBase(seed))

  const steps = [
    storeW3cGroups,
    storeW3cGroupPeople,
    storeW3cGroupSpecifications,
    storeW3cSpecPeople,
    storeW3cCitations,
  ]
  for (const step of steps) {
    console.log(JSON.stringify(await step(), null, 2))
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
