// Generic stage-file registry, shared by every SDO crawl.
//
// A stage publishes `<stage>.nq` only after every fetch and store write
// succeeded; a failure leaves `<stage>.log` and no `.nq`, so the next run
// retries the whole stage. Completed files are the resume seed, read in
// dependency order.
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

export interface StagesConfig {
  /** Stage name -> file base name (dashed, e.g. `spec-people`). */
  files: Record<string, string>
  /** Dependency order; seed files are read in this order. */
  order: string[]
  /** Directory that holds this SDO's stage files. */
  dir: () => string
}

export interface Stages {
  readonly files: Record<string, string>
  readonly order: string[]
  stageFile(name: string): string
  stageLog(name: string): string
  hasStage(name: string): boolean
  /** Existing stage files, in dependency order. */
  seedFiles(): string[]
  writeStage(name: string, quads: Quad[]): Promise<string>
  failStage(name: string, error: unknown, details?: unknown): string
}

const serialize = (quads: Quad[]) =>
  new Promise<string>((resolve, reject) => {
    const writer = new Writer({ format: 'N-Quads' })
    writer.addQuads(quads)
    writer.end((error, result) => (error ? reject(error) : resolve(result)))
  })

/**
 * Characters that may not appear in an IRI. The N-Quads writer emits them
 * verbatim, which makes the published file unparseable — fail before writing.
 * Upstream values must be filtered where they are read; this is the net.
 */
const ILLEGAL_IRI_CHAR = /[\u0000-\u0020<>"{}|\\^`]/

function assertValidIris(name: string, quads: Quad[]): void {
  for (const quad of quads) {
    for (const term of [quad.subject, quad.predicate, quad.object]) {
      if (term.termType !== 'NamedNode') continue
      if (ILLEGAL_IRI_CHAR.test(term.value)) {
        throw new Error(
          `${name} stage produced an invalid IRI: ${term.value}`,
        )
      }
    }
  }
}

/**
 * Build the stage helpers for one SDO. An unknown stage name is a programming
 * error, not a runtime condition: it would otherwise write an unexpected file.
 */
export function createStages(config: StagesConfig): Stages {
  const fileFor = (name: string): string => {
    const file = config.files[name]
    if (!file) {
      throw new Error(
        `unknown stage "${name}"; known: ${Object.keys(config.files).join(', ')}`,
      )
    }
    return file
  }

  const stageFile = (name: string) => join(config.dir(), `${fileFor(name)}.nq`)
  const stageLog = (name: string) => join(config.dir(), `${fileFor(name)}.log`)

  return {
    files: config.files,
    order: config.order,
    stageFile,
    stageLog,
    hasStage: (name) => existsSync(stageFile(name)),
    seedFiles: () =>
      config.order.map(stageFile).filter((path) => existsSync(path)),

    /**
     * Publish a completed stage atomically. Zero quads is a failure: it usually
     * means an upstream fetch returned nothing we understand.
     */
    async writeStage(name, quads) {
      if (quads.length === 0) {
        throw new Error(`${name} stage produced zero quads`)
      }
      assertValidIris(name, quads)
      const path = stageFile(name)
      mkdirSync(config.dir(), { recursive: true })
      const body = await serialize(quads)
      const temp = `${path}.tmp`
      writeFileSync(temp, body, 'utf8')
      renameSync(temp, path)
      rmSync(stageLog(name), { force: true })
      return path
    },

    /** Record a failed stage. The .nq must not be publishable afterwards. */
    failStage(name, error, details) {
      const path = stageFile(name)
      rmSync(path, { force: true })
      rmSync(`${path}.tmp`, { force: true })

      const logPath = stageLog(name)
      mkdirSync(config.dir(), { recursive: true })
      const message =
        error instanceof Error ? error.stack ?? error.message : String(error)
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
    },
  }
}

/**
 * Group subjects already published by any SDO stage. Used to keep full group
 * URLs unique across the whole catalog, not just within one SDO. In Dagger the
 * whole data/dump tree is mounted read-only at ALL_STAGES_DIR.
 */
export function existingGroupUris(
  root: string,
  groupsFile = 'groups',
): Set<string> {
  const groups = new Set<string>()
  if (!existsSync(root)) return groups
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name, `${groupsFile}.nq`)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^<([^>]+)>/.exec(line)
      if (match?.[1]) groups.add(match[1])
    }
  }
  return groups
}
