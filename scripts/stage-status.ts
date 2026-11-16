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
  // Local-First imports live outside data/dump/ too.
  localfirst: ['organizations', 'locations', 'events', 'software'],
}

const DUMP_ROOT = 'data/dump'

/** SDOs whose stage files live outside data/dump/. */
const EXPORT_ROOTS: Record<string, string> = {
  fedidb: 'data/fedidb',
  localfirst: 'data/localfirst',
}

const hasStages = (dir: string) =>
  existsSync(dir) &&
  readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isFile() && entry.name.endsWith('.nq'),
  )

/** FediDB and Local-First have their own directories; the rest live under data/dump. */
const sdoDir = (sdo: string) => EXPORT_ROOTS[sdo] ?? join(DUMP_ROOT, sdo)

const requested = process.argv[2]
const sdos = requested
  ? [requested]
  : [
      ...(existsSync(DUMP_ROOT)
        ? readdirSync(DUMP_ROOT, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : []),
      ...Object.entries(EXPORT_ROOTS)
        .filter(([, dir]) => hasStages(dir))
        .map(([sdo]) => sdo),
    ].sort()

if (sdos.length === 0) {
  console.error(
    `no SDO stage directories in data/dump or ${Object.values(EXPORT_ROOTS).join(', ')}`,
  )
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
