// Check the exported stage directory after a dump. A failed stage has a .log
// instead of a .nq; a later stage that was never reached has neither.
//
// Each SDO has its own expected stage list, which grows as stages land.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const STAGES_BY_SDO: Record<string, string[]> = {
  // ietf-plan.md §7: areas → series → groups → people → specs → spec-people →
  // citations. Only implemented stages are listed here.
  ietf: ['areas', 'series', 'groups', 'specs', 'spec-people', 'citations'],
  // Written by `dump:cross` from both reference files; no Temporal stages.
  cross: ['refs'],
  w3c: ['groups', 'people', 'specs', 'spec-people', 'citations'],
  // FediDB weekly exports live outside data/dump/.
  fedidb: [
    'datasets',
    'fep',
    'software',
    'feature-questions',
    'servers',
    'open-servers',
    'server-domains',
    'software-versions',
    'countries',
    'feature-support',
  ],
}

const DUMP_ROOT = 'data/dump'
const FEDIDB_ROOT = 'data/fedidb'
const hasFedidbStages = () =>
  existsSync(FEDIDB_ROOT) &&
  readdirSync(FEDIDB_ROOT, { withFileTypes: true }).some(
    (entry) => entry.isFile() && entry.name.endsWith('.nq'),
  )

/** FediDB has its own export directory; every other SDO lives under data/dump. */
const sdoDir = (sdo: string) =>
  sdo === 'fedidb' ? FEDIDB_ROOT : join(DUMP_ROOT, sdo)

const requested = process.argv[2]
const sdos = requested
  ? [requested]
  : [
      ...(existsSync(DUMP_ROOT)
        ? readdirSync(DUMP_ROOT, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : []),
      ...(hasFedidbStages() ? ['fedidb'] : []),
    ].sort()

if (sdos.length === 0) {
  console.error('no SDO stage directories in data/dump or data/fedidb')
  process.exit(1)
}

let failed = false
for (const sdo of sdos) {
  const dir = sdoDir(sdo)
  const stages = STAGES_BY_SDO[sdo]
  if (!stages) {
    console.error(
      `\n## ${sdo}: no expected stage list (known: ${Object.keys(STAGES_BY_SDO).join(', ')})`,
    )
  }
  for (const stage of stages ?? []) {
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
for (const sdo of sdos) rmSync(join(sdoDir(sdo), 'run.log'), { force: true })
console.log(`${sdos.join(', ')}: all stages completed`)
