// Check the exported stage directory after a dump. A failed stage has a .log
// instead of a .nq; a later stage that was never reached has neither.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const STAGES = [
  'groups',
  'people',
  'specs',
  'spec-people',
  'citations',
]

const root = 'data/dump'
const requested = process.argv[2]
const sdos = requested
  ? [requested]
  : existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : []

if (sdos.length === 0) {
  console.error('no SDO stage directories in data/dump')
  process.exit(1)
}

let failed = false
for (const sdo of sdos) {
  const dir = join(root, sdo)
  for (const stage of STAGES) {
    const nq = join(dir, `${stage}.nq`)
    const log = join(dir, `${stage}.log`)
    if (existsSync(nq)) {
      // Dagger export merges into the host directory; drop a stale previous
      // failure log now that the stage file exists.
      rmSync(log, { force: true })
      continue
    }

    failed = true
    if (existsSync(log)) {
      console.error(`\n## ${sdo}/${stage} failed\n${readFileSync(log, 'utf8')}`)
    } else {
      console.error(`\n## ${sdo}/${stage} was not reached (${nq} missing)`)
    }
  }

  const runLog = join(dir, 'run.log')
  if (existsSync(runLog)) {
    console.error(`\n## ${sdo} run log\n${readFileSync(runLog, 'utf8')}`)
  }
}

if (failed) process.exit(1)
for (const sdo of sdos) rmSync(join(root, sdo, 'run.log'), { force: true })
console.log(`${sdos.join(', ')}: all stages completed`)
