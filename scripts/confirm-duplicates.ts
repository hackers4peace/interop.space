#!/usr/bin/env bun
// Review queue for W3C accounts that probably belong to one person. Pairs are
// grouped by the evidence api.w3.org returns, not by the display name alone:
//
//   A  shared affiliation, or same city + country division + country
//   B  same work title, or a shared W3C group (needs a human decision)
//   C  display name only (do NOT merge)
//
// Confirm a pair by adding it to DUPLICATE_W3C_IDS in
// typescript/src/w3c-api/person-ids.ts, then run scripts/remap-identities.ts.
//
//   bun run scripts/confirm-duplicates.ts            # A and B
//   bun run scripts/confirm-duplicates.ts --tier=B   # only B
//   bun run scripts/confirm-duplicates.ts --refresh  # ignore the cache
//
// Responses are cached in data/dump/w3c/duplicate-review/ so a rerun is free.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DUPLICATE_W3C_IDS, canonicalW3cId } from '../typescript/src/w3c-api/person-ids.ts'

type Entry = { id: string; name: string; identifiers: string[] }
type User = {
  id: number
  name?: string
  given?: string
  family?: string
  'work-title'?: string
  'country-code'?: string
  'country-division'?: string
  city?: string
  missing?: boolean
  'connected-accounts'?: { service: string; nickname: string }[]
  _links?: { affiliations?: { href: string } }
}

const ROOT = join(import.meta.dir, '..')
const IDENTITIES_PATH = process.env.IDENTITIES_PATH ?? join(ROOT, 'data/identities.json')
const STAGES_DIR = process.env.STAGES_DIR ?? join(ROOT, 'data/dump/w3c')
const CACHE = join(STAGES_DIR, 'duplicate-review')
const API_USER = 'url:https://api.w3.org/users/'

const args = process.argv.slice(2)
const tierFilter = args.find((arg) => arg.startsWith('--tier='))?.slice(7).toUpperCase()
const refresh = args.includes('--refresh')

const readMap = (path: string): Entry[] => {
  if (!existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { people?: Entry[] }
  return parsed.people ?? []
}
const norm = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const cached = async (name: string, url: string): Promise<any | undefined> => {
  mkdirSync(CACHE, { recursive: true })
  const path = join(CACHE, `${name}.json`)
  if (!refresh && existsSync(path)) {
    const body = readFileSync(path, 'utf8')
    return body === 'null' ? undefined : JSON.parse(body)
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (response.status === 404) {
        writeFileSync(path, 'null')
        return undefined
      }
      if (response.ok) {
        const text = await response.text()
        writeFileSync(path, text)
        return JSON.parse(text)
      }
      await sleep(1000 * attempt)
    } catch {
      await sleep(1000 * attempt)
    }
  }
  console.warn(`could not fetch ${url}`)
  return undefined
}

/** Person -> groups, from the stage files that already encode membership. */
const groupMembers = () => {
  const members = new Map<string, Set<string>>()
  const path = join(STAGES_DIR, 'people.nq')
  if (!existsSync(path)) return members
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^<([^>]+)> <http:\/\/example\.org#member> <(urn:uuid:[0-9a-f-]+)>/.exec(line)
    if (!match) continue
    const set = members.get(match[2]) ?? new Set<string>()
    set.add(match[1])
    members.set(match[2], set)
  }
  return members
}

const people = [...readMap(IDENTITIES_PATH), ...readMap(join(STAGES_DIR, 'identities.json'))]
const apiKey = (entry: Entry) =>
  entry.identifiers.find((identifier) => identifier.startsWith(API_USER))?.replace(API_USER, '')

const groups = new Map<string, Entry[]>()
for (const entry of people) {
  const key = norm(entry.name)
  if (!key) continue
  const list = groups.get(key) ?? []
  list.push(entry)
  groups.set(key, list)
}

const members = groupMembers()
const W3C_PERSON_SILO = ['urn:w3c:person:', 'w3c:']
/** urn:w3c:person:<id> (or the pre-migration w3c:<id>). */
const w3cId = (entry: Entry) => {
  for (const prefix of W3C_PERSON_SILO) {
    const identifier = entry.identifiers.find((value) => value.startsWith(prefix))
    if (!identifier) continue
    const id = Number(identifier.slice(prefix.length))
    if (Number.isInteger(id)) return id
  }
  return Number.NaN
}
const github = (user: User) => user['connected-accounts']?.find((a) => a.service === 'github')?.nickname
const affiliationNames = async (user: User | undefined): Promise<string[]> => {
  if (!user?._links?.affiliations) return []
  const body = await cached(
    `aff-${user.id}`,
    `https://api.w3.org/users/${user.id}/affiliations?page=1&items=100`,
  )
  return ((body?._embedded?.affiliations ?? []) as { name?: string }[]).map((a) => a.name ?? '')
}

type Row = { name: string; a: Entry; b: Entry; ua: User; ub: User; tier: 'A' | 'B' | 'C'; why: string }
const rows: Row[] = []
for (const [name, list] of groups) {
  const unique = [...new Map(list.map((entry) => [entry.id, entry])).values()]
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i]
      const b = unique[j]
      const [ka, kb] = [apiKey(a), apiKey(b)]
      if (!ka || !kb) continue
      const ua = (await cached(ka, `https://api.w3.org/users/${ka}`)) as User | undefined
      const ub = (await cached(kb, `https://api.w3.org/users/${kb}`)) as User | undefined
      if (!ua || !ub || ua.missing || ub.missing) continue
      const [affA, affB] = [await affiliationNames(ua), await affiliationNames(ub)]
      const sharedAff = affA.filter((name) => affB.includes(name))
      const sameLoc =
        !!ua.city &&
        ua.city === ub.city &&
        ua['country-code'] === ub['country-code'] &&
        ua['country-division'] === ub['country-division']
      const sameWork = !!ua['work-title'] && ua['work-title'] === ub['work-title']
      const apiSameName =
        norm(ua.given ?? '') === norm(ub.given ?? '') &&
        norm(ua.family ?? '') === norm(ub.family ?? '') &&
        norm(ua.name ?? '') === name &&
        norm(ub.name ?? '') === name
      const ga = members.get(a.id) ?? new Set<string>()
      const gb = members.get(b.id) ?? new Set<string>()
      const sharedGroups = [...ga].filter((group) => gb.has(group)).length

      let tier: Row['tier'] = 'C'
      let why = 'display name only'
      if (!apiSameName) why = 'api names differ — skip'
      else if (sharedAff.length) [tier, why] = ['A', `affiliation: ${sharedAff.join(', ')}`]
      else if (sameLoc) [tier, why] = ['A', `city: ${ua.city}/${ua['country-division']}/${ua['country-code']}`]
      else if (sameWork) [tier, why] = ['B', `work-title: ${ua['work-title']}`]
      else if (sharedGroups) [tier, why] = ['B', `same group x${sharedGroups}`]
      rows.push({ name, a, b, ua, ub, tier, why })
    }
  }
}

const mapped = (a: Entry, b: Entry) =>
  canonicalW3cId(w3cId(a)) === canonicalW3cId(w3cId(b)) || DUPLICATE_W3C_IDS.has(w3cId(a)) || DUPLICATE_W3C_IDS.has(w3cId(b))

const show = (tier: 'A' | 'B') => {
  const subset = rows.filter((row) => row.tier === tier).sort((x, y) => x.name.localeCompare(y.name))
  console.log(`\n=== tier ${tier}: ${subset.length} pair(s) ===`)
  for (const row of subset) {
    const line = (entry: Entry, user: User) =>
      `${W3C_PERSON_SILO[0]}${w3cId(entry)}${github(user) ? `/${github(user)}` : ''}`
    console.log(
      `  ${row.name.padEnd(24)} ${line(row.a, row.ua).padEnd(28)} ${line(row.b, row.ub).padEnd(28)} ` +
        `${mapped(row.a, row.b) ? '[mapped] ' : ''}${row.why}`,
    )
  }
}

/** Pairs that are already collapsed into a single identity. */
const showMapped = () => {
  const byIdentifier = new Map<string, Entry>()
  for (const entry of people) {
    for (const identifier of entry.identifiers) byIdentifier.set(identifier.toLowerCase(), entry)
  }
  console.log(`\n=== already mapped: ${DUPLICATE_W3C_IDS.size} pair(s) ===`)
  for (const [duplicate, canonical] of DUPLICATE_W3C_IDS) {
    const winner =
      byIdentifier.get(`${W3C_PERSON_SILO[0]}${canonical}`) ??
      byIdentifier.get(`w3c:${canonical}`)
    const alias =
      byIdentifier.get(`${W3C_PERSON_SILO[0]}${duplicate}`) ??
      byIdentifier.get(`w3c:${duplicate}`)
    // main and stage copies of the same entry are different objects
    const state =
      winner && alias?.id === winner.id
        ? 'one identity'
        : winner
          ? 'canonical only (alias id never stored)'
          : 'not in map yet'
    console.log(
      `  ${(winner?.name ?? '?').padEnd(24)} ${W3C_PERSON_SILO[0]}${duplicate} -> ${W3C_PERSON_SILO[0]}${canonical}  ` +
        `${winner?.id ?? '-'}  (${state})`,
    )
  }
}

if (!tierFilter || tierFilter === 'A') show('A')
if (!tierFilter || tierFilter === 'B') show('B')
if (!tierFilter) showMapped()
console.log(
  `\n${rows.length} same-name pairs checked; ` +
    `A=${rows.filter((r) => r.tier === 'A').length} ` +
    `B=${rows.filter((r) => r.tier === 'B').length} ` +
    `C=${rows.filter((r) => r.tier === 'C').length} (C is never merged)`,
)
console.log('confirm a pair by adding it to DUPLICATE_W3C_IDS, then run scripts/remap-identities.ts')
