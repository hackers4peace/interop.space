import { afterEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resetIdentityCache,
  resolveOrganization,
  resolvePerson,
  writeNewIdentities,
} from './identity.ts'

const dirs: string[] = []
const originalEnv = { ...process.env }

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'interop-identities-'))
  dirs.push(dir)
  const identities = join(dir, 'identities.json')
  writeFileSync(
    identities,
    JSON.stringify({ people: [], organizations: [] }),
    'utf8',
  )
  process.env.IDENTITIES_PATH = identities
  process.env.STAGES_DIR = join(dir, 'dump')
  resetIdentityCache()
  return { dir, identities }
}

afterEach(() => {
  process.env = { ...originalEnv }
  resetIdentityCache()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('identity map', () => {
  test('reuses a local uuid across W3C and GitHub ids', () => {
    setup()
    const first = resolvePerson({
      w3cId: 46577,
      githubId: '123',
      githubUsername: 'Test',
      name: 'Test Person',
    })
    const second = resolvePerson({
      w3cId: 46577,
      githubId: '123',
      name: 'Test Person',
    })
    expect(first.id).toMatch(/^urn:uuid:/)
    expect(second.id).toBe(first.id)
  })

  test('writes new identities and reuses them before manual merge', () => {
    const { identities } = setup()
    const first = resolvePerson({ w3cId: 46577, name: 'Test Person' })
    const output = writeNewIdentities()
    expect(output).toBeString()
    const written = JSON.parse(readFileSync(output!, 'utf8'))
    expect(written.people[0].id).toBe(first.id)

    resetIdentityCache()
    const second = resolvePerson({ w3cId: 46577, name: 'Test Person' })
    expect(second.id).toBe(first.id)

    const committed = JSON.parse(readFileSync(identities, 'utf8'))
    expect(committed.people).toEqual([])
  })

  test('stores W3C silo ids as URNs and resolves them again', () => {
    setup()
    const entry = resolvePerson({ w3cId: 46577, name: 'Test Person' })
    expect(entry.identifiers).toContain('urn:w3c:person:46577')
    expect(entry.identifiers.some((id) => id.startsWith('w3c:'))).toBe(false)

    expect(writeNewIdentities()).toBeString()
    resetIdentityCache()
    expect(resolvePerson({ w3cId: 46577 }).id).toBe(entry.id)

    const organization = resolveOrganization({
      w3cAffiliationId: '6383',
      name: 'Example Org',
    })
    expect(organization.identifiers).toContain('urn:w3c:affiliation:6383')
  })

  test('canonicalizes duplicate W3C ids to one local identity', () => {
    setup()
    const older = resolvePerson({ w3cId: 42931, name: 'Pierre-Antoine Champin' })
    const canonical = resolvePerson({
      w3cId: 129656,
      name: 'Pierre-Antoine Champin',
    })
    expect(canonical.id).toBe(older.id)
  })

  const committedPerson = {
    id: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    name: 'Test Person',
    identifiers: ['urn:w3c:person:46577', 'github:123', 'github-user:test'],
    reviewed: false,
  }

  const commit = (identities: string) =>
    writeFileSync(
      identities,
      JSON.stringify({ people: [committedPerson], organizations: [] }),
    )

  test('does not emit committed identities as new', () => {
    const { identities } = setup()
    commit(identities)
    resetIdentityCache()
    const entry = resolvePerson({
      w3cId: 46577,
      githubId: '123',
      githubUsername: 'Test',
      name: 'Test Person',
    })
    expect(entry.id).toBe(committedPerson.id)
    expect(writeNewIdentities()).toBeUndefined()
  })

  test('emits a committed identity only when it learned a new identifier', () => {
    const { identities } = setup()
    commit(identities)
    resetIdentityCache()
    resolvePerson({
      w3cId: 46577,
      githubId: '123',
      githubUsername: 'Test',
      sourceUrl: 'https://api.w3.org/users/x',
      name: 'Test Person',
    })
    const output = writeNewIdentities()
    expect(output).toBeString()
    const written = JSON.parse(readFileSync(output!, 'utf8'))
    expect(written.people).toHaveLength(1)
    expect(written.people[0].id).toBe(committedPerson.id)
    expect(written.people[0].identifiers).toContain(
      'url:https://api.w3.org/users/x',
    )
  })

  test('drops a stale stage file once its entries are committed', () => {
    const { identities } = setup()
    commit(identities)
    const stage = process.env.STAGES_DIR!
    mkdirSync(stage, { recursive: true })
    const stageFile = join(stage, 'identities.json')
    writeFileSync(
      stageFile,
      JSON.stringify({ people: [committedPerson], organizations: [] }),
    )
    resetIdentityCache()
    resolvePerson({ w3cId: 46577, githubId: '123', name: 'Test Person' })
    expect(writeNewIdentities()).toBeUndefined()
    expect(existsSync(stageFile)).toBe(false)
  })
})
