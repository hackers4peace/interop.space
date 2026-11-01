import { writeFile } from 'node:fs/promises'
import { Client, Connection } from '@temporalio/client'

/** Which SDO workflow to run: `SDO=w3c` (default) or `SDO=ietf`. */
const SDO = (process.env.SDO ?? 'w3c').toLowerCase()

interface StepSummary {
  step: string
  skipped: boolean
  reason?: string
  detail?: string
}

function logSteps(steps: StepSummary[] | undefined): void {
  for (const step of steps ?? []) {
    console.log(
      `${step.step}: ${step.skipped ? 'skipped' : 'stored'}${
        step.reason ? ` (${step.reason})` : step.detail ? ` (${step.detail})` : ''
      }`,
    )
  }
}

async function runIetf(client: Client): Promise<void> {
  const result = (await client.workflow.execute('ietfApiWorkflow', {
    taskQueue: 'ietf',
    workflowId: `ietf-api-${Date.now()}`,
    // Stage-by-stage: each stage is one paginated Datatracker sweep. The
    // citations stage will need its own budget once it lands.
    workflowExecutionTimeout: '1 hour',
  })) as { steps?: StepSummary[] }

  logSteps(result.steps)
  console.log('ietf api workflow result:', JSON.stringify(result))
}

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await Connection.connect({ address })

  const client = new Client({ connection, namespace: 'default' })

  if (SDO === 'ietf') {
    await runIetf(client)
    return
  }
  //   const handle = await client.workflow.execute('greetingWorkflow', {
  //     taskQueue: 'greeting',
  //     args: [ID],
  //     workflowId: `hello-world-${Date.now()}`,
  //   })
  //
  //   const fediverse = await client.workflow.execute('FediverseWorkflow', {
  //     taskQueue: 'fediverse',
  //     args: ['elfpavlik@w3c.social'],
  //     workflowId: `fediverse-${Date.now()}`,
  //   })

  //   const catalog = await client.workflow.execute('catalogDependencyWorkflow', {
  //     taskQueue: 'catalog',
  //     workflowId: `catalog-deps-${Date.now()}`,
  //     workflowExecutionTimeout: '15 minutes',
  //   })

  // The workflow is stage-file first: groups, group members, group
  // specifications, spec→people links, then spec→spec citations. Each stage
  // skips when its .nq already exists; a failed stage leaves a .log.
  const w3c = (await client.workflow.execute('w3cApiWorkflow', {
    taskQueue: 'w3c',
    workflowId: `w3c-api-${Date.now()}`,
    // A W3C API 429 suspends the activity for 12 minutes; the full group
    // crawl can also take several minutes.
    workflowExecutionTimeout: '2 hours',
  })) as {
    steps?: Array<{
      step: string
      skipped: boolean
      reason?: string
      detail?: string
    }>
    citations?: { summary: string; report: unknown }
    [key: string]: unknown
  }

  for (const step of w3c.steps ?? []) {
    console.log(
      `${step.step}: ${step.skipped ? 'skipped' : 'stored'}${
        step.reason ? ` (${step.reason})` : step.detail ? ` (${step.detail})` : ''
      }`,
    )
  }

  if (w3c.citations?.report) {
    const report = w3c.citations.report as { skipped?: boolean }
    if (!report.skipped) {
      const reportPath =
        process.env.CITATIONS_REPORT_PATH ?? '/tmp/citations-report.json'
      await writeFile(
        reportPath,
        `${JSON.stringify(w3c.citations.report, null, 2)}\n`,
        'utf8',
      )
      console.log(`citations report: ${reportPath}`)
    }
    console.log(w3c.citations.summary)
  }

  console.log(
    'w3c api workflow result:',
    JSON.stringify({
      ...w3c,
      citations: w3c.citations ? { summary: w3c.citations.summary } : undefined,
    }),
  )
}

run().catch((err) => {
  console.error('Client failed:', err)
  process.exit(1)
})