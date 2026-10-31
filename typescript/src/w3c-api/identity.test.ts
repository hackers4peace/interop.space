import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resetIdentityCache,
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

  test('canonicalizes duplicate W3C ids to one local identity', () => {
    setup()
    const older = resolvePerson({ w3cId: 42931, name: 'Pierre-Antoine Champin' })
    const canonical = resolvePerson({
      w3cId: 129656,
      name: 'Pierre-Antoine Champin',
    })
    expect(canonical.id).toBe(older.id)
  })
})
