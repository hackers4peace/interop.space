// Local identity map: every person and organization gets a stable urn:uuid:
// subject. External identifiers (W3C, GitHub, source URLs) are only used to
// look the local identity up; they never become the subject.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { canonicalW3cId } from './person-ids.ts'
import { IETF_PERSON_SILO } from '../ietf-api/silo-ids.ts'
import { W3C_AFFILIATION_SILO, W3C_PERSON_SILO } from './silo-ids.ts'

export interface IdentityEntry {
  /** Stable local subject: urn:uuid:… */
  id: string
  name: string
  /** All known external ids for this identity, e.g. w3c:46577, github:1234. */
  identifiers: string[]
  /** False until a human has reviewed/merged the entry. */
  reviewed: boolean
}

export interface IdentityMap {
  people: IdentityEntry[]
  organizations: IdentityEntry[]
}

export const DEFAULT_IDENTITIES_PATH = new URL(
  '../../../data/identities.json',
  import.meta.url,
).pathname

export const DEFAULT_STAGES_DIR = new URL(
  '../../../data/dump/w3c',
  import.meta.url,
).pathname

export interface PersonIdentityInput {
  w3cId?: number
  /** Datatracker numeric person id (`urn:ietf:person:<id>`). */
  ietfPersonId?: number
  githubId?: string
  githubUsername?: string
  /** ORCID identifier, published by Datatracker `personextresource`. */
  orcid?: string
  sourceUrl?: string
  name?: string
}

export interface OrganizationIdentityInput {
  w3cAffiliationId?: string | number
  sourceUrl?: string
  homepage?: string
  name?: string
}

type Kind = 'people' | 'organizations'

const emptyMap = (): IdentityMap => ({ people: [], organizations: [] })

let map: IdentityMap | undefined
let indexes: Record<Kind, Map<string, IdentityEntry>> | undefined
/** Committed entries as read from disk, before the stage file is merged in. */
let committed: Record<Kind, Map<string, IdentityEntry>> | undefined
const dirty = new Set<string>()

const identitiesPath = () =>
  process.env.IDENTITIES_PATH ?? DEFAULT_IDENTITIES_PATH

export const stagesDir = () => process.env.STAGES_DIR ?? DEFAULT_STAGES_DIR

export const newIdentitiesPath = () => join(stagesDir(), 'identities.json')

function readMap(path: string): IdentityMap {
  if (!existsSync(path)) return emptyMap()
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<IdentityMap>
  return {
    people: parsed.people ?? [],
    organizations: parsed.organizations ?? [],
  }
}

function assertUnique(entries: IdentityEntry[], kind: Kind) {
  const ids = new Map<string, string>()
  for (const entry of entries) {
    for (const identifier of entry.identifiers) {
      const previous = ids.get(identifier)
      if (previous && previous !== entry.id) {
        throw new Error(
          `identity map: ${kind} identifier "${identifier}" belongs to both ${previous} and ${entry.id}`,
        )
      }
      ids.set(identifier, entry.id)
    }
  }
}

/** Merge the unmerged stage identities over the committed map. */
function mergeMaps(base: IdentityMap, extra: IdentityMap): IdentityMap {
  const merge = (kind: Kind) => {
    const entries = new Map<string, IdentityEntry>()
    for (const entry of base[kind]) entries.set(entry.id, { ...entry, identifiers: [...entry.identifiers] })
    for (const entry of extra[kind]) {
      const existing = entries.get(entry.id)
      if (!existing) {
        entries.set(entry.id, {
          ...entry,
          identifiers: [...entry.identifiers],
        })
        continue
      }
      for (const identifier of entry.identifiers) {
        if (!existing.identifiers.includes(identifier)) {
          existing.identifiers.push(identifier)
        }
      }
      if (!existing.name) existing.name = entry.name
      existing.reviewed ||= entry.reviewed
    }
    return [...entries.values()]
  }
  return { people: merge('people'), organizations: merge('organizations') }
}

function ensureLoaded(): IdentityMap {
  if (map && indexes) return map
  map = readMap(identitiesPath())
  // Snapshot, not a reference: resolve() appends identifiers in place.
  const snapshot = (entries: IdentityEntry[]) =>
    new Map(
      entries.map((entry) => [
        entry.id,
        { ...entry, identifiers: [...entry.identifiers] },
      ]),
    )
  committed = {
    people: snapshot(map.people),
    organizations: snapshot(map.organizations),
  }
  const unmergedPath = newIdentitiesPath()
  if (unmergedPath !== identitiesPath() && existsSync(unmergedPath)) {
    map = mergeMaps(map, readMap(unmergedPath))
  }
  assertUnique(map.people, 'people')
  assertUnique(map.organizations, 'organizations')
  indexes = {
    people: new Map(
      map.people.flatMap((entry) =>
        entry.identifiers.map((identifier) => [identifier, entry] as const),
      ),
    ),
    organizations: new Map(
      map.organizations.flatMap((entry) =>
        entry.identifiers.map((identifier) => [identifier, entry] as const),
      ),
    ),
  }
  return map
}

/** Test seam: forget the loaded file between cases. */
export function resetIdentityCache(): void {
  map = undefined
  indexes = undefined
  committed = undefined
  dirty.clear()
}

const normalizeGithubUsername = (username: string) => username.toLowerCase()

function personIdentifiers(input: PersonIdentityInput): string[] {
  const identifiers = new Set<string>()
  if (input.w3cId !== undefined) {
    identifiers.add(`${W3C_PERSON_SILO}${canonicalW3cId(input.w3cId)}`)
  }
  if (input.ietfPersonId !== undefined) {
    identifiers.add(`${IETF_PERSON_SILO}${input.ietfPersonId}`)
  }
  if (input.orcid) identifiers.add(`orcid:${input.orcid}`)
  if (input.githubId) identifiers.add(`github:${input.githubId}`)
  if (input.githubUsername) {
    identifiers.add(`github-user:${normalizeGithubUsername(input.githubUsername)}`)
  }
  if (input.sourceUrl) identifiers.add(`url:${input.sourceUrl}`)
  return [...identifiers]
}

function organizationIdentifiers(
  input: OrganizationIdentityInput,
): string[] {
  const identifiers = new Set<string>()
  if (input.w3cAffiliationId !== undefined) {
    identifiers.add(`${W3C_AFFILIATION_SILO}${input.w3cAffiliationId}`)
  }
  if (input.sourceUrl) identifiers.add(`url:${input.sourceUrl}`)
  if (input.homepage) identifiers.add(`homepage:${input.homepage}`)
  return [...identifiers]
}

function find(index: Map<string, IdentityEntry>, identifiers: string[]) {
  for (const identifier of identifiers) {
    const entry = index.get(identifier)
    if (entry) return { entry, matched: identifier }
  }
  return undefined
}

function resolve(
  kind: Kind,
  identifiers: string[],
  name: string | undefined,
): IdentityEntry {
  const current = ensureLoaded()
  const index = indexes![kind]
  const existing = find(index, identifiers)
  if (existing) {
    let changed = false
    for (const identifier of identifiers) {
      if (!existing.entry.identifiers.includes(identifier)) {
        existing.entry.identifiers.push(identifier)
        index.set(identifier, existing.entry)
        changed = true
      }
    }
    if (!existing.entry.name && name) {
      existing.entry.name = name
      changed = true
    }
    if (changed) dirty.add(existing.entry.id)
    return existing.entry
  }

  const entry: IdentityEntry = {
    id: `urn:uuid:${crypto.randomUUID()}`,
    name: name ?? 'Unnamed',
    identifiers,
    reviewed: false,
  }
  current[kind].push(entry)
  for (const identifier of identifiers) index.set(identifier, entry)
  dirty.add(entry.id)
  return entry
}

/** Resolve or create a local person identity. */
export function resolvePerson(input: PersonIdentityInput): IdentityEntry {
  return resolve('people', personIdentifiers(input), input.name)
}

/** Resolve or create a local organization identity. */
export function resolveOrganization(
  input: OrganizationIdentityInput,
): IdentityEntry {
  return resolve(
    'organizations',
    organizationIdentifiers(input),
    input.name,
  )
}

/**
 * True when the entry is absent from the committed map or learned external
 * identifiers after it was committed. Entries the crawl merely re-resolved
 * against committed data are not a delta.
 */
function isDelta(kind: Kind, entry: IdentityEntry): boolean {
  const base = committed?.[kind].get(entry.id)
  if (!base) return true
  return entry.identifiers.some(
    (identifier) => !base.identifiers.includes(identifier),
  )
}

/**
 * Entries created or extended during this worker run. Entries that already
 * match the committed map are left out: they are not a merge candidate.
 */
export function dirtyIdentities(): IdentityMap {
  const current = ensureLoaded()
  const pick = (kind: Kind) =>
    current[kind].filter((entry) => dirty.has(entry.id) && isDelta(kind, entry))
  return { people: pick('people'), organizations: pick('organizations') }
}

/**
 * Write the new/extended identities next to the stage files. This file is
 * merged into the committed data/identities.json with
 * scripts/merge-identities.ts. Entries already present in both files are
 * dropped, so the file only holds the pending delta; an empty delta removes
 * the file instead of leaving a stale copy behind.
 */
export function writeNewIdentities(): string | undefined {
  const path = newIdentitiesPath()
  const additions = dirtyIdentities()
  const previous = readMap(path)
  const merge = (kind: Kind) => {
    const entries = new Map<string, IdentityEntry>()
    for (const entry of previous[kind]) entries.set(entry.id, entry)
    for (const entry of additions[kind]) entries.set(entry.id, entry)
    return [...entries.values()]
      .filter((entry) => isDelta(kind, entry))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  const output: IdentityMap = {
    people: merge('people'),
    organizations: merge('organizations'),
  }

  if (output.people.length === 0 && output.organizations.length === 0) {
    rmSync(path, { force: true })
    return undefined
  }

  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
  return path
}
