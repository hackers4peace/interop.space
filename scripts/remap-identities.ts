#!/usr/bin/env bun
// Collapses identity entries that belong to the same person through two W3C
// accounts. The mapping lives in typescript/src/w3c-api/person-ids.ts
// (DUPLICATE_W3C_IDS); this script applies it to data/identities.json and
// reports which stage files have to be rebuilt because they embed the dropped
// urn:uuid:.
//
// Usage:
//   bun run scripts/remap-identities.ts                     # dry run
//   bun run scripts/remap-identities.ts --pair=47171=106988 # try a pair first
//   bun run scripts/remap-identities.ts --write             # apply
//   bun run scripts/remap-identities.ts --write --prune-stage
//
// After --write, delete the stage files listed in the output (they embed the
// dropped urn:uuid:) and rerun `devbox run dump:w3c`; then wipe + seed.
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DUPLICATE_W3C_IDS } from '../typescript/src/w3c-api/person-ids.ts'

type Entry = {
  id: string
  name: string
  identifiers: string[]
  reviewed: boolean
}
type Kind = 'people' | 'organizations'
type IdentityMap = Record<Kind, Entry[]>

const ROOT = join(import.meta.dir, '..')
const IDENTITIES_PATH = process.env.IDENTITIES_PATH ?? join(ROOT, 'data/identities.json')
const STAGES_DIR = process.env.STAGES_DIR ?? join(ROOT, 'data/dump/w3c')
const STAGE_IDENTITIES = join(STAGES_DIR, 'identities.json')

const args = process.argv.slice(2)
const write = args.includes('--write')
const pruneStage = args.includes('--prune-stage')
const patchStage = args.includes('--patch-stage')
const pairs = new Map<number, number>(DUPLICATE_W3C_IDS)
for (const arg of args) {
  const match = /^--pair=(\d+)=(\d+)$/.exec(arg)
  if (!match) continue
  pairs.set(Number(match[1]), Number(match[2]))
}

const readMap = (path: string): IdentityMap => {
  if (!existsSync(path)) return { people: [], organizations: [] }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<IdentityMap>
  return { people: parsed.people ?? [], organizations: parsed.organizations ?? [] }
}

/** urn:w3c:person:<id> (or the pre-migration w3c:<id>). */
const W3C_PERSON_SILO = ['urn:w3c:person:', 'w3c:']
const w3cId = (entry: Entry) => {
  for (const prefix of W3C_PERSON_SILO) {
    const identifier = entry.identifiers.find((value) => value.startsWith(prefix))
    if (!identifier) continue
    const id = Number(identifier.slice(prefix.length))
    if (Number.isInteger(id)) return id
  }
  return undefined
}
const personSilo = (id: number) => `${W3C_PERSON_SILO[0]}${id}`

/**
 * How often a urn:uuid: is used in the generated stage files and the curated
 * turtle: that is what a remap invalidates.
 */
function stageUsage(ids: Set<string>) {
  const usage = new Map<string, Map<string, number>>()
  const scan = (path: string, label: string) => {
    if (!existsSync(path)) return
    const text = readFileSync(path, 'utf8')
    for (const id of ids) {
      const count = text.split(id).length - 1
      if (count === 0) continue
      const files = usage.get(label) ?? new Map<string, number>()
      files.set(id, count)
      usage.set(label, files)
    }
  }
  if (existsSync(STAGES_DIR)) {
    for (const name of readdirSync(STAGES_DIR)) {
      if (name.endsWith('.nq')) scan(join(STAGES_DIR, name), `data/dump/w3c/${name}`)
    }
  }
  for (const name of readdirSync(join(ROOT, 'data'))) {
    if (name.endsWith('.ttl')) scan(join(ROOT, 'data', name), `data/${name}`)
  }
  return usage
}

const describe = (entry: Entry) =>
  `${entry.id} "${entry.name}" [${entry.identifiers.join(', ')}]`

const map = readMap(IDENTITIES_PATH)
const stageMap = readMap(STAGE_IDENTITIES)
const byW3c = new Map<number, Entry>()
for (const entry of map.people) {
  const id = w3cId(entry)
  if (id !== undefined) byW3c.set(id, entry)
}

const dropped = new Set<string>()
const winners: Entry[] = []
const rewrites: { entry: Entry; from: string; to: string }[] = []
const unresolved: string[] = []
/** dropped urn:uuid: -> surviving urn:uuid:, used by --patch-stage. */
const remapped = new Map<string, string>()

for (const [duplicate, canonical] of pairs) {
  if (duplicate === canonical) continue
  const loser = byW3c.get(duplicate)
  if (!loser) continue
  const winner = byW3c.get(canonical)

  if (!winner) {
    // Only one account is known: keep the local identity and retarget its W3C
    // identifier, so a later crawl of the canonical account lands on it.
    const from = personSilo(duplicate)
    const to = personSilo(canonical)
    loser.identifiers = loser.identifiers.map((value) => (value === from ? to : value))
    rewrites.push({ entry: loser, from, to })
    byW3c.set(canonical, loser)
    continue
  }

  if (winner.id === loser.id) continue
  // Keep the duplicate w3c id on the survivor: it is provenance, it keeps
  // assertUnique satisfied, and the entry still resolves if the pair is ever
  // removed from DUPLICATE_W3C_IDS.
  const moved = loser.identifiers.filter(
    (value) => !winner.identifiers.includes(value),
  )
  winner.identifiers.push(...moved)
  winners.push(winner)
  dropped.add(loser.id)
  remapped.set(loser.id, winner.id)
  byW3c.delete(duplicate)
  console.log(`\n${personSilo(duplicate)} -> ${personSilo(canonical)}`)
  console.log(`  keep:  ${describe(winner)}`)
  console.log(`  drop:  ${describe(loser)}`)
  console.log(`  move:  ${moved.join(', ') || '(nothing, identifiers already covered)'}`)
}

const usage = stageUsage(dropped)
const map2: IdentityMap = {
  people: map.people.filter((entry) => !dropped.has(entry.id)),
  organizations: map.organizations,
}

// Same rule as assertUnique in typescript/src/w3c-api/identity.ts.
const seen = new Map<string, string>()
let collisions = 0
for (const entry of map2.people) {
  for (const identifier of entry.identifiers) {
    const key = identifier.toLowerCase()
    const previous = seen.get(key)
    if (previous && previous !== entry.id) {
      collisions++
      console.log(`  collision: ${identifier} -> ${previous} | ${entry.id}`)
    } else {
      seen.set(key, entry.id)
    }
  }
}

console.log(`\n## summary`)
console.log(`  mapped pairs:          ${[...pairs].filter(([a, b]) => a !== b).length}`)
console.log(`  entries dropped:       ${dropped.size}`)
console.log(`  identifiers retargeted: ${rewrites.length}`)
for (const rewrite of rewrites) {
  console.log(`    ${rewrite.entry.id} "${rewrite.entry.name}": ${rewrite.from} -> ${rewrite.to}`)
}
console.log(`  identifier collisions: ${collisions}`)
console.log(`  people after remap:    ${map2.people.length}`)
if (usage.size === 0) {
  console.log('  data files with a dropped urn:uuid:: none')
} else {
  console.log('  data files that must be rebuilt or edited:')
  for (const [name, files] of usage) {
    const total = [...files.values()].reduce((sum, count) => sum + count, 0)
    console.log(`    ${name}: ${total} reference(s) to ${files.size} dropped uuid(s)`)
  }
}

if (collisions > 0) {
  console.error('\nrefusing to write: identifiers would belong to two entries')
  process.exit(1)
}

if (!write) {
  console.log('\ndry run only; re-run with --write to apply')
  process.exit(0)
}

const temp = `${IDENTITIES_PATH}.tmp`
writeFileSync(temp, `${JSON.stringify(map2, null, 2)}\n`, 'utf8')
renameSync(temp, IDENTITIES_PATH)
console.log(`\nwrote ${IDENTITIES_PATH}`)

// The stage file is merged over the committed map at load time; leaving a
// dropped entry there reintroduces identifiers that just moved and makes
// assertUnique throw. Exposed as a flag so a sandbox run cannot prune the real
// stage file by accident.
if (pruneStage && existsSync(STAGE_IDENTITIES)) {
  const pruned: IdentityMap = {
    people: stageMap.people.filter((entry) => !dropped.has(entry.id)),
    organizations: stageMap.organizations,
  }
  if (pruned.people.length !== stageMap.people.length) {
    writeFileSync(
      `${STAGE_IDENTITIES}.tmp`,
      `${JSON.stringify(pruned, null, 2)}\n`,
      'utf8',
    )
    renameSync(`${STAGE_IDENTITIES}.tmp`, STAGE_IDENTITIES)
    console.log(
      `pruned ${stageMap.people.length - pruned.people.length} dropped entr(y/ies) from ${STAGE_IDENTITIES}`,
    )
  }
} else if (
  dropped.size > 0 &&
  stageMap.people.some((entry) => dropped.has(entry.id))
) {
  console.log(`\n${STAGE_IDENTITIES} still holds a dropped entry:`)
  console.log('  pass --prune-stage, or delete the file before the next crawl')
}

// Optional: rewrite a dropped urn:uuid: in the generated stage files so the
// dataset stays consistent until those stages are rebuilt. The result is what
// the rerun would emit (the survivor accumulates both accounts' triples);
// exact duplicate lines created by the substitution are removed. Opt-in,
// because the proper fix is rebuilding people.nq and spec-people.nq.
if (patchStage && remapped.size > 0) {
  for (const name of readdirSync(STAGES_DIR)) {
    if (!name.endsWith('.nq')) continue
    const path = join(STAGES_DIR, name)
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
    const out: string[] = []
    const seenLines = new Set<string>()
    let replaced = 0
    let duplicates = 0
    for (const line of lines) {
      let next = line
      for (const [from, to] of remapped) {
        if (!next.includes(from)) continue
        next = next.split(from).join(to)
        replaced++
      }
      if (seenLines.has(next)) {
        duplicates++
        continue
      }
      seenLines.add(next)
      out.push(next)
    }
    if (replaced === 0) continue
    writeFileSync(`${path}.tmp`, `${out.join('\n')}\n`, 'utf8')
    renameSync(`${path}.tmp`, path)
    console.log(
      `patched ${name}: ${replaced} reference(s) rewritten, ${duplicates} duplicate line(s) dropped`,
    )
  }
}

console.log('\nnext: rebuild the files listed above, then')
console.log('  devbox run dump:w3c && devbox run wipe -- production && devbox run seed -- production')
