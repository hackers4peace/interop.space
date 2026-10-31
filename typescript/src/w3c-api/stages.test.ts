import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataFactory } from 'n3'
import { failStage, hasStage, stageFile, stageLog, writeStage } from './stages.ts'

const dirs: string[] = []
const originalEnv = { ...process.env }
const { namedNode, literal, quad } = DataFactory

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'interop-stages-'))
  dirs.push(dir)
  process.env.STAGES_DIR = join(dir, 'w3c')
  return dir
}

afterEach(() => {
  process.env = { ...originalEnv }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('stage files', () => {
  test('publishes a non-empty stage atomically', async () => {
    setup()
    const quads = [
      quad(
        namedNode('urn:uuid:test'),
        namedNode('http://example.org#name'),
        literal('Test'),
      ),
    ]
    const path = await writeStage('groups', quads)
    expect(path).toBe(stageFile('groups'))
    expect(hasStage('groups')).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('urn:uuid:test')
  })

  test('rejects zero quads and removes the stage file', async () => {
    setup()
    await expect(writeStage('groups', [])).rejects.toThrow('zero quads')
    expect(existsSync(stageFile('groups'))).toBe(false)
  })

  test('writes a log and removes any .nq on failure', () => {
    setup()
    const path = failStage('groups', new Error('duplicate homepage'), {
      groups: ['a', 'b'],
    })
    expect(path).toBe(stageLog('groups'))
    expect(existsSync(stageFile('groups'))).toBe(false)
    const log = readFileSync(path, 'utf8')
    expect(log).toContain('duplicate homepage')
    expect(log).toContain('"groups"')
  })
})
