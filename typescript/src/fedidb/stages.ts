// FediDB stage files. FediDB is a weekly export, not a crawl, so it gets its
// own directory (`data/fedidb/`) instead of a `data/dump/<sdo>/` subdirectory.
// The generic stage registry still provides the atomic write and failure-log
// contract used by W3C and IETF.
import { createStages } from '../catalog/stages.ts'

export const FEDIDB_SDO = 'https://fedidb.com/'
export const FEDIDB_DATASETS_PAGE = `${FEDIDB_SDO}datasets`
export const FEDIDB_METADATA_URL = 'https://api.fedidb.org/v1.1/datasets'

export const DEFAULT_FEDIDB_DIR = new URL(
  '../../../data/fedidb',
  import.meta.url,
).pathname

/** Output file base names, matching the FediDB dataset slugs. */
export const STAGE_FILES = {
  catalog: 'datasets',
  fep: 'fep',
  software: 'software',
  serverDomains: 'server-domains',
  servers: 'servers',
  openServers: 'open-servers',
  softwareVersions: 'software-versions',
  countries: 'countries',
  featureQuestions: 'feature-questions',
  featureSupport: 'feature-support',
} as const

export type StageName = keyof typeof STAGE_FILES

/** Seed order. The files are independent, but a stable order keeps logs sane. */
export const STAGE_ORDER: StageName[] = [
  'catalog',
  'fep',
  'software',
  'featureQuestions',
  'servers',
  'openServers',
  'serverDomains',
  'softwareVersions',
  'countries',
  'featureSupport',
]

/** FediDB dataset slug -> stage name. Unknown slugs are ignored by the workflow. */
export const DATASET_STAGES: Record<string, StageName> = {
  software: 'software',
  'server-domains': 'serverDomains',
  servers: 'servers',
  'open-servers': 'openServers',
  'software-versions': 'softwareVersions',
  countries: 'countries',
  'feature-questions': 'featureQuestions',
  'feature-support': 'featureSupport',
}

export const DATASET_SLUGS = Object.keys(DATASET_STAGES)

/** FEPs come from Codeberg, not a FediDB dataset, but share the stage set. */
export const FEP_STAGE: StageName = 'fep'
export const FEP_SLUG = FEP_STAGE

export const stagesDir = () =>
  process.env.STAGES_DIR ?? DEFAULT_FEDIDB_DIR

const stages = createStages({
  files: STAGE_FILES,
  order: STAGE_ORDER,
  dir: stagesDir,
})

export const stageFile = (name: StageName) => stages.stageFile(name)
export const stageLog = (name: StageName) => stages.stageLog(name)
export const hasStage = (name: StageName) => stages.hasStage(name)
export const stageSeedFiles = () => stages.seedFiles()
export const writeStage = (
  name: StageName,
  quads: Parameters<typeof stages.writeStage>[1],
) => stages.writeStage(name, quads)
export const failStage = (
  name: StageName,
  error: unknown,
  details?: unknown,
) => stages.failStage(name, error, details)

/** Stage for a FediDB dataset slug, or undefined for an unsupported dataset. */
export function stageForDataset(slug: string): StageName | undefined {
  return DATASET_STAGES[slug]
}
