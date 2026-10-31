// Per-stage dump files. A stage publishes its .nq only after every fetch and
// store write succeeded; a failure leaves a .log and no .nq, so the next run
// retries the whole stage.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { Writer, type Quad } from 'n3'
import { stagesDir } from './identity.ts'

export const W3C_SDO = 'https://www.w3.org/'

export const STAGE_FILES = {
  groups: 'groups',
  people: 'people',
  specs: 'specs',
  specPeople: 'spec-people',
  citations: 'citations',
} as const

export type StageName = keyof typeof STAGE_FILES

/** Seed order: later stages can depend on earlier stage files. */
export const STAGE_ORDER: StageName[] = [
  'groups',
  'people',
  'specs',
  'specPeople',
  'citations',
]

export const stageFile = (name: StageName) =>
  join(stagesDir(), `${STAGE_FILES[name]}.nq`)

export const stageLog = (name: StageName) =>
  join(stagesDir(), `${STAGE_FILES[name]}.log`)

export const hasStage = (name: StageName) => existsSync(stageFile(name))

/** Existing stage files, in dependency order. */
export const stageSeedFiles = () =>
  STAGE_ORDER.map(stageFile).filter((path) => existsSync(path))

/**
 * Group subjects already published by any SDO stage. Used to keep full group
 * URLs unique across the whole catalog, not just within one SDO. In Dagger the
 * whole data/dump tree is mounted read-only at ALL_STAGES_DIR.
 */
export function existingGroupUris(): Set<string> {
  const root = process.env.ALL_STAGES_DIR ?? join(stagesDir(), '..')
  const groups = new Set<string>()
  if (!existsSync(root)) return groups
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name, `${STAGE_FILES.groups}.nq`)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^<([^>]+)>/.exec(line)
      if (match?.[1]) groups.add(match[1])
    }
  }
  return groups
}

const serialize = (quads: Quad[]) =>
  new Promise<string>((resolve, reject) => {
    const writer = new Writer({ format: 'N-Quads' })
    writer.addQuads(quads)
    writer.end((error, result) => (error ? reject(error) : resolve(result)))
  })

/**
 * Publish a completed stage atomically. Zero quads is a failure: it usually
 * means an upstream fetch returned nothing we understand.
 */
export async function writeStage(
  name: StageName,
  quads: Quad[],
): Promise<string> {
  if (quads.length === 0) {
    throw new Error(`${name} stage produced zero quads`)
  }
  const path = stageFile(name)
  mkdirSync(stagesDir(), { recursive: true })
  const body = await serialize(quads)
  const temp = `${path}.tmp`
  writeFileSync(temp, body, 'utf8')
  renameSync(temp, path)
  rmSync(stageLog(name), { force: true })
  return path
}

/** Record a failed stage. The .nq must not be publishable afterwards. */
export function failStage(
  name: StageName,
  error: unknown,
  details?: unknown,
): string {
  const path = stageFile(name)
  rmSync(path, { force: true })
  rmSync(`${path}.tmp`, { force: true })

  const logPath = stageLog(name)
  mkdirSync(stagesDir(), { recursive: true })
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  const lines = [
    `stage: ${name}`,
    `time: ${new Date().toISOString()}`,
    `error: ${message}`,
  ]
  if (details !== undefined) {
    lines.push(`details: ${JSON.stringify(details, null, 2)}`)
  }
  writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8')
  return logPath
}
