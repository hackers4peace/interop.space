#!/usr/bin/env bun
// Merges the stage identity file written by the W3C crawl
// (data/dump/w3c/identities.json) into the committed map
// (data/identities.json).
//
// The stage file is keyed by the local urn:uuid: and may contain
//   - entries the crawl created (new people/organizations),
//   - copies of committed entries the crawl touched (same urn:uuid:),
// so the merge is by `id`, never a plain append.
//
// Usage:
//   bun run scripts/merge-identities.ts            # dry run, report only
//   bun run scripts/merge-identities.ts --write    # rewrite data/identities.json
//   bun run scripts/merge-identities.ts --write --prune
//                                                  # ... and empty the stage file
//
// Exit code 1 means the merge would produce an invalid map (one external
// identifier claimed by two urn:uuid:s), matching assertUnique() in
// typescript/src/w3c-api/identity.ts.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Entry = {
  id: string
  name: string
  identifiers: string[]
  reviewed: boolean
}
type Kind = 'people' | 'organizations'
type IdentityMap = Record<Kind, Entry[]>

const ROOT = join(import.meta.dir, '..')
// Same env overrides as typescript/src/w3c-api/identity.ts, mainly for tests.
const MAIN_PATH = process.env.IDENTITIES_PATH ?? join(ROOT, 'data/identities.json')
const STAGE_PATH = process.env.STAGES_DIR
  ? join(process.env.STAGES_DIR, 'identities.json')
  : join(ROOT, 'data/dump/w3c/identities.json')
const REPORT_PATH = join(STAGE_PATH, '..', 'identities-report.json')
const KINDS: Kind[] = ['people', 'organizations']

const args = new Set(process.argv.slice(2))
const write = args.has('--write')
const prune = args.has('--prune')

const readMap = (path: string): IdentityMap => {
  if (!existsSync(path)) return { people: [], organizations: [] }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<IdentityMap>
  return { people: parsed.people ?? [], organizations: parsed.organizations ?? [] }
}

const normalizeName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Stable order: committed entries keep their position, new ones are appended by id. */
function mergeKind(base: Entry[], extra: Entry[]) {
  const merged = new Map<string, Entry>()
  const order: string[] = []
  for (const entry of base) {
    merged.set(entry.id, {
      ...entry,
      identifiers: [...entry.identifiers],
    })
    order.push(entry.id)
  }

  const added: string[] = []
  const extended: string[] = []
  const unchanged: string[] = []
  const learned: string[] = []

  for (const entry of extra) {
    const existing = merged.get(entry.id)
    if (!existing) {
      merged.set(entry.id, {
        ...entry,
        identifiers: [...entry.identifiers],
      })
      added.push(entry.id)
      continue
    }
    let changed = false
    for (const identifier of entry.identifiers) {
      // Same urn:uuid: in both files: union identifiers so a later crawl that
      // learned an extra GitHub account or URL is not lost.
      if (!existing.identifiers.includes(identifier)) {
        existing.identifiers.push(identifier)
        learned.push(`${entry.id} ${identifier}`)
        changed = true
      }
    }
    if (!existing.name && entry.name) {
      existing.name = entry.name
      changed = true
    }
    existing.reviewed ||= entry.reviewed
    ;(changed ? extended : unchanged).push(entry.id)
  }

  for (const id of added.slice().sort((a, b) => a.localeCompare(b))) order.push(id)

  return {
    entries: order.map((id) => merged.get(id)!),
    added,
    extended,
    unchanged,
    learned,
  }
}

/** One identifier must never point at two urn:uuid:s (see assertUnique). */
function findCollisions(kind: Kind, entries: Entry[]) {
  const owner = new Map<string, string>()
  const collisions: { identifier: string; ids: string[] }[] = []
  for (const entry of entries) {
    for (const identifier of entry.identifiers) {
      const key = identifier.toLowerCase()
      const previous = owner.get(key)
      if (previous && previous !== entry.id) {
        collisions.push({ identifier, ids: [previous, entry.id] })
      } else {
        owner.set(key, entry.id)
      }
    }
  }
  return collisions
}

/** Same normalized name under different urn:uuid:s: report only, never auto-merge. */
function nameGroups(entries: Entry[]) {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = normalizeName(entry.name)
    if (!key) continue
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  return [...groups.entries()].filter(
    ([, group]) => new Set(group.map((entry) => entry.id)).size > 1,
  )
}

const base = readMap(MAIN_PATH)
const extra = readMap(STAGE_PATH)
if (!write && !existsSync(STAGE_PATH)) {
  console.error(`no stage identities at ${STAGE_PATH}; run devbox run dump:w3c first`)
  process.exit(1)
}

const merged: IdentityMap = { people: [], organizations: [] }
const report: Record<string, unknown> = {}
let failed = false

for (const kind of KINDS) {
  const before = base[kind]
  const result = mergeKind(before, extra[kind])
  merged[kind] = result.entries

  const collisions = findCollisions(kind, result.entries)
  const groups = nameGroups(result.entries)

  console.log(`\n## ${kind}`)
  console.log(`  committed:            ${before.length}`)
  console.log(`  stage entries:        ${extra[kind].length}`)
  console.log(`  duplicates collapsed: ${result.unchanged.length + result.extended.length} (same urn:uuid: in both files)`)
  console.log(`    extended:           ${result.extended.length}`)
  console.log(`    identical:          ${result.unchanged.length}`)
  console.log(`  new identities:       ${result.added.length}`)
  console.log(`  merged total:         ${result.entries.length}`)
  console.log(`  identifier collisions: ${collisions.length}`)
  for (const collision of collisions.slice(0, 20)) {
    console.log(`    ${collision.identifier} -> ${collision.ids.join(' | ')}`)
  }
  if (collisions.length) failed = true
  console.log(`  same-name groups (review candidates, not merged): ${groups.length}`)
  if (result.learned.length) {
    console.log(`  identifiers learned for existing entries: ${result.learned.length}`)
    for (const line of result.learned.slice(0, 10)) console.log(`    ${line}`)
  }

  report[kind] = {
    committed: before.length,
    stage: extra[kind].length,
    collapsed: result.unchanged.length + result.extended.length,
    extended: result.extended,
    learned: result.learned,
    identical: result.unchanged,
    added: result.added,
    merged: result.entries.length,
    collisions,
    nameGroups: groups.map(([name, group]) => ({
      name,
      ids: group.map((entry) => entry.id),
    })),
  }
}

if (failed) {
  console.error('\nrefusing to merge: identifier collisions above would make the map invalid')
  process.exit(1)
}

if (!write) {
  console.log('\ndry run only; re-run with --write to update data/identities.json')
  process.exit(0)
}

const serialized = `${JSON.stringify(merged, null, 2)}\n`
const temp = `${MAIN_PATH}.tmp`
writeFileSync(temp, serialized, 'utf8')
renameSync(temp, MAIN_PATH)
console.log(`\nwrote ${MAIN_PATH} (${(serialized.length / 1024 / 1024).toFixed(2)} MiB)`)

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`wrote ${REPORT_PATH}`)

if (prune) {
  renameSync(STAGE_PATH, `${STAGE_PATH}.merged`)
  console.log(`moved stage file to ${STAGE_PATH}.merged`)
}
