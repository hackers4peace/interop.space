// Per-stage dump files for the W3C crawl. The registry itself lives in
// catalog/stages.ts so every SDO shares one implementation; this module only
// names the W3C stages and points at the W3C stage directory.
import { join } from 'node:path'
import { createStages, existingGroupUris as existingGroupUrisIn } from '../catalog/stages.ts'
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

const stages = createStages({
  files: STAGE_FILES,
  order: STAGE_ORDER,
  dir: stagesDir,
})

export const stageFile = (name: StageName) => stages.stageFile(name)
export const stageLog = (name: StageName) => stages.stageLog(name)
export const hasStage = (name: StageName) => stages.hasStage(name)

/** Existing stage files, in dependency order. */
export const stageSeedFiles = () => stages.seedFiles()

export const writeStage = (name: StageName, quads: Parameters<typeof stages.writeStage>[1]) =>
  stages.writeStage(name, quads)

/** Record a failed stage. The .nq must not be publishable afterwards. */
export const failStage = (
  name: StageName,
  error: unknown,
  details?: unknown,
) => stages.failStage(name, error, details)

/**
 * Group subjects already published by any SDO stage. Used to keep full group
 * URLs unique across the whole catalog, not just within one SDO. In Dagger the
 * whole data/dump tree is mounted read-only at ALL_STAGES_DIR.
 */
export function existingGroupUris(): Set<string> {
  const root = process.env.ALL_STAGES_DIR ?? join(stagesDir(), '..')
  return existingGroupUrisIn(root, STAGE_FILES.groups)
}
