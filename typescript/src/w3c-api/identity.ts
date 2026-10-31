// Local identity map: every person and organization gets a stable urn:uuid:
// subject. External identifiers (W3C, GitHub, source URLs) are only used to
// look the local identity up; they never become the subject.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { canonicalW3cId } from './person-ids.ts'

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
  githubId?: string
  githubUsername?: string
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
  dirty.clear()
}

const normalizeGithubUsername = (username: string) => username.toLowerCase()

function personIdentifiers(input: PersonIdentityInput): string[] {
  const identifiers = new Set<string>()
  if (input.w3cId !== undefined) {
    identifiers.add(`w3c:${canonicalW3cId(input.w3cId)}`)
  }
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
    identifiers.add(`w3c-affiliation:${input.w3cAffiliationId}`)
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

/** Entries created or extended during this worker run. */
export function dirtyIdentities(): IdentityMap {
  const current = ensureLoaded()
  const ids = dirty
  return {
    people: current.people.filter((entry) => ids.has(entry.id)),
    organizations: current.organizations.filter((entry) => ids.has(entry.id)),
  }
}

/**
 * Write the new/updated identities next to the stage files. This file is
 * merged into the committed data/identities.json manually. Existing entries in
 * the output file are preserved so later stages can append to it.
 */
export function writeNewIdentities(): string | undefined {
  const additions = dirtyIdentities()
  if (additions.people.length === 0 && additions.organizations.length === 0) {
    return undefined
  }

  const path = newIdentitiesPath()
  const previous = readMap(path)
  const merge = (kind: Kind) => {
    const entries = new Map<string, IdentityEntry>()
    for (const entry of previous[kind]) entries.set(entry.id, entry)
    for (const entry of additions[kind]) entries.set(entry.id, entry)
    return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id))
  }
  const output: IdentityMap = {
    people: merge('people'),
    organizations: merge('organizations'),
  }

  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
  return path
}
