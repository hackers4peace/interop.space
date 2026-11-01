// IETF stage files. Same registry shape as the W3C stages so `stage-status`,
// the seed order and the Dagger wiring behave identically.
import { createStages } from '../catalog/stages.ts'

export const IETF_SDO = 'https://www.ietf.org/'

/** Public group page. Datatracker 302-redirects it to `…/about/`; both work. */
export const IETF_GROUP_URL = 'https://datatracker.ietf.org/group'

/** REST base for `ex:ietfApiUrl` provenance. */
export const IETF_API = 'https://datatracker.ietf.org/api/v1'

export const DEFAULT_IETF_STAGES_DIR = new URL(
  '../../../data/dump/ietf',
  import.meta.url,
).pathname

export const STAGE_FILES = {
  areas: 'areas',
  series: 'series',
  groups: 'groups',
  people: 'people',
  specs: 'specs',
  specPeople: 'spec-people',
  citations: 'citations',
} as const

export type StageName = keyof typeof STAGE_FILES

/** Seed order: later stages can depend on earlier stage files. */
export const STAGE_ORDER: StageName[] = [
  'areas',
  'series',
  'groups',
  'people',
  'specs',
  'specPeople',
  'citations',
]

export const stagesDir = () =>
  process.env.STAGES_DIR ?? DEFAULT_IETF_STAGES_DIR

const stages = createStages({
  files: STAGE_FILES,
  order: STAGE_ORDER,
  dir: stagesDir,
})

export const stageFile = (name: StageName) => stages.stageFile(name)
export const stageLog = (name: StageName) => stages.stageLog(name)
export const hasStage = (name: StageName) => stages.hasStage(name)
export const stageSeedFiles = () => stages.seedFiles()
export const writeStage = (name: StageName, quads: Parameters<typeof stages.writeStage>[1]) =>
  stages.writeStage(name, quads)
export const failStage = (name: StageName, error: unknown, details?: unknown) =>
  stages.failStage(name, error, details)
