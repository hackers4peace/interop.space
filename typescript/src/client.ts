import { writeFile } from 'node:fs/promises'
import { Client, Connection } from '@temporalio/client'

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await Connection.connect({ address })

  const client = new Client({ connection, namespace: 'default' })

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

  // The workflow is data-first: groups, group members, group specifications,
  // spec→people links, then spec→spec citations. Each step checks the live
  // store and skips when its output is already present, so a run on an
  // existing dump is a no-op.
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
    const reportPath =
      process.env.CITATIONS_REPORT_PATH ?? '/tmp/citations-report.json'
    await writeFile(
      reportPath,
      `${JSON.stringify(w3c.citations.report, null, 2)}\n`,
      'utf8',
    )
    console.log(w3c.citations.summary)
    console.log(`citations report: ${reportPath}`)
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