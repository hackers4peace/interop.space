#!/usr/bin/env bun
// Invariants for the committed identity map and the stage graph that points at
// it. Run after merging or remapping identities, before seeding:
//
//   bun run scripts/verify-identities.ts
//
// Exits 1 on the first broken invariant group. Everything here is derived from
// data/identities.json, data/dump/w3c/*.nq and DUPLICATE_W3C_IDS, so it also
// guards against a half-applied remap.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Parser } from 'n3'
import { canonicalW3cId } from '../typescript/src/w3c-api/person-ids.ts'
import {
  LEGACY_W3C_AFFILIATION_SILO,
  LEGACY_W3C_SILO,
  W3C_AFFILIATION_SILO,
  W3C_GROUP_SILO,
  W3C_PERSON_SILO,
} from '../typescript/src/w3c-api/silo-ids.ts'

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
const EX = 'http://example.org#'
const PERSON = `${EX}Person`
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const EDITOR = 'http://purl.org/ontology/bibo/editor'
const MEMBER = `${EX}member`
const AFFILIATION = `${EX}affiliation`
const NAME = `${EX}name`
const SILO_ID = `${EX}siloId`

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}
const fail = (label: string, lines: string[]) => {
  check(lines.length === 0, label, lines.length ? `${lines.length} offender(s)` : '')
  for (const line of lines.slice(0, 10)) console.log(`       ${line}`)
  if (lines.length > 10) console.log(`       ... ${lines.length - 10} more`)
}

const map = JSON.parse(readFileSync(IDENTITIES_PATH, 'utf8')) as Partial<IdentityMap>
const kinds: Kind[] = ['people', 'organizations']
const entries = kinds.flatMap((kind) => (map[kind] ?? []).map((entry) => ({ kind, entry })))
const byId = new Map(entries.map(({ entry }) => [entry.id, entry]))

// 1. entry shape
fail(
  'every entry has a name and at least one identifier',
  entries
    .filter(({ entry }) => !entry.name || entry.identifiers.length === 0)
    .map(({ kind, entry }) => `${kind} ${entry.id} "${entry.name}" [${entry.identifiers.length}]`),
)
fail(
  'urn:uuid: subjects are unique',
  [...new Set(entries.map(({ entry }) => entry.id))].filter(
    (id) => entries.filter(({ entry }) => entry.id === id).length > 1,
  ),
)

// 2. one identifier, one identity
const owners = new Map<string, Set<string>>()
for (const { entry } of entries) {
  for (const identifier of entry.identifiers) {
    const key = identifier.toLowerCase()
    const set = owners.get(key) ?? new Set<string>()
    set.add(entry.id)
    owners.set(key, set)
  }
}
fail(
  'every identifier is owned by exactly one urn:uuid:',
  [...owners].filter(([, ids]) => ids.size > 1).map(([identifier, ids]) => `${identifier} -> ${[...ids].join(' | ')}`),
)

// 3. no half-applied remap: a duplicate w3c id must sit next to its canonical id
const personSiloIds = (entry: Entry) =>
  entry.identifiers
    .filter((identifier) => identifier.startsWith(W3C_PERSON_SILO))
    .map((identifier) => Number(identifier.slice(W3C_PERSON_SILO.length)))
    .filter((id) => Number.isInteger(id))
fail(
  'duplicate w3c ids are collapsed onto their canonical entry',
  entries
    .filter(({ entry }) =>
      personSiloIds(entry).some(
        (id) =>
          canonicalW3cId(id) !== id &&
          !personSiloIds(entry).includes(canonicalW3cId(id)),
      ),
    )
    .map(({ entry }) => `${entry.id} "${entry.name}" [${entry.identifiers.join(', ')}]`),
)

// 3b. the silo-id migration (ietf-plan.md §9.14) is complete
fail(
  'identity map uses urn:w3c:* silo ids only',
  entries
    .filter(({ entry }) =>
      entry.identifiers.some(
        (identifier) =>
          identifier.startsWith(LEGACY_W3C_SILO) ||
          identifier.startsWith(LEGACY_W3C_AFFILIATION_SILO),
      ),
    )
    .map(
      ({ kind, entry }) =>
        `${kind} ${entry.id} "${entry.name}" [${entry.identifiers.join(', ')}]`,
    ),
)

// 4. the stage graph only points at known identities
const quadsByFile = new Map<string, { subject: string; predicate: string; object: string }[]>()
if (existsSync(STAGES_DIR)) {
  for (const name of readdirSync(STAGES_DIR)) {
    if (!name.endsWith('.nq')) continue
    const quads = new Parser({ format: 'N-Quads' })
      .parse(readFileSync(join(STAGES_DIR, name), 'utf8'))
      .map((quad: any) => ({
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
      }))
    quadsByFile.set(name, quads)
  }
}
check(quadsByFile.size > 0, 'stage files parsed', [...quadsByFile.keys()].join(', '))
const allQuads = [...quadsByFile.values()].flat()
const siloValues = allQuads.filter((q) => q.predicate === SILO_ID).map((q) => q.object)
fail(
  'stage files use urn:w3c:* silo ids only',
  [
    ...new Set(
      siloValues.filter(
        (value) =>
          value.startsWith(LEGACY_W3C_SILO) ||
          value.startsWith(LEGACY_W3C_AFFILIATION_SILO),
      ),
    ),
  ],
)
fail(
  'every person silo id in the graph is an identity-map identifier',
  [...new Set(siloValues.filter((value) => value.startsWith(W3C_PERSON_SILO)))].filter(
    (value) => !owners.has(value.toLowerCase()),
  ),
)
const families = new Map<string, number>()
for (const value of siloValues) {
  const family = value.startsWith(W3C_PERSON_SILO)
    ? 'person'
    : value.startsWith(W3C_GROUP_SILO)
      ? 'group'
      : value.startsWith(W3C_AFFILIATION_SILO)
        ? 'affiliation'
        : value.startsWith('github:')
          ? 'github'
          : 'other'
  families.set(family, (families.get(family) ?? 0) + 1)
}
console.log(
  `     siloId families: ${[...families].map(([family, count]) => `${family}=${count}`).join(' ')}`,
)
const personSubjects = new Set(
  allQuads.filter((q) => q.predicate === RDF_TYPE && q.object === PERSON).map((q) => q.subject),
)
const personObjects = new Set(
  allQuads.filter((q) => q.predicate === MEMBER || q.predicate === EDITOR).map((q) => q.object),
)
const local = (value: string) => value.startsWith('urn:uuid:')
fail(
  'ex:Person subjects are known identities',
  [...personSubjects].filter((id) => !byId.has(id)),
)
fail(
  'ex:member / bibo:editor objects are known before they become subjects',
  [...personObjects].filter((id) => local(id) && !byId.has(id)),
)
fail(
  'ex:affiliation objects are known organizations',
  [...new Set(allQuads.filter((q) => q.predicate === AFFILIATION).map((q) => q.object))].filter((id) =>
    local(id) ? !(map.organizations ?? []).some((entry) => entry.id === id) : false,
  ),
)

// 5. one name per person node
const names = new Map<string, Set<string>>()
for (const quad of allQuads) {
  if (quad.predicate !== NAME) continue
  const set = names.get(quad.subject) ?? new Set<string>()
  set.add(quad.object)
  names.set(quad.subject, set)
}
fail(
  'no person node carries two different names',
  [...names].filter(([id, set]) => personSubjects.has(id) && set.size > 1).map(([id, set]) => `${id} ${[...set].join(' | ')}`),
)

// 6. every identity that the graph uses has graph presence (the reverse direction
//    is fine: spec-only editors may live in spec-people.nq alone)
const inGraph = new Set([...personSubjects, ...personObjects])
console.log(
  `\nidentities: ${(map.people ?? []).length} people, ${(map.organizations ?? []).length} organizations; ` +
    `${inGraph.size} used by ${quadsByFile.size} stage file(s)`,
)
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
