import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { Worker, NativeConnection } from '@temporalio/worker'
import * as activities from './activities'
import * as fediverseActivities from './protocols/fediverse/activities'
import * as catalogActivities from './software-dependencies/activities'
import * as w3cActivities from './w3c-api/activities'
import * as ietfActivities from './ietf-api/activities'
import * as fedidbActivities from './fedidb/activities'
import * as localfirstActivities from './localfirst/activities'

async function connectWithRetry(address: string) {
  while (true) {
    try {
      return await NativeConnection.connect({
        address,
      })
    } catch (err) {
      console.error('Temporal not ready, retrying...', err instanceof Error ? err.message : err)
      await sleep(500)
    }
  }
}

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await connectWithRetry(address)

  try {
    const greetingWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'greeting',
      workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
      activities,
    })

    const catalogWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'catalog',
      workflowsPath: new URL('./software-dependencies/workflows.ts', import.meta.url).pathname,
      activities: catalogActivities,
    })

    const w3cWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'w3c',
      workflowsPath: new URL('./w3c-api/workflows.ts', import.meta.url).pathname,
      activities: w3cActivities,
    })

    // IETF stages run on their own queue so each SDO can be dumped, resumed and
    // debugged independently (see ietf-plan.md §6).
    const ietfWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'ietf',
      workflowsPath: new URL('./ietf-api/workflows.ts', import.meta.url).pathname,
      activities: ietfActivities,
    })

    // FediDB is a weekly download rather than a crawl, but it uses the same
    // stage-file contract and therefore gets its own queue too.
    const fedidbWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'fedidb',
      workflowsPath: new URL('./fedidb/workflows.ts', import.meta.url).pathname,
      activities: fedidbActivities,
    })

    // The Local-First import reads a conference page and the landscape's
    // generated snapshot; its stage files live in data/localfirst.
    const localfirstWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'localfirst',
      workflowsPath: new URL('./localfirst/workflows.ts', import.meta.url).pathname,
      activities: localfirstActivities,
    })

    const readyPath = process.env.WORKER_READY_PATH
    if (readyPath) await writeFile(readyPath, 'ready\n', 'utf8')

    await Promise.all([
      greetingWorker.run(),
      catalogWorker.run(),
      w3cWorker.run(),
      ietfWorker.run(),
      fedidbWorker.run(),
      localfirstWorker.run(),
    ])
  } finally {
    await connection.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})