// Local-First stage files. The two sources are not an SDO API but a public
// conference page and the landscape's generated data snapshot, so the import
// lives in `data/localfirst/` (like FediDB) instead of `data/dump/`.
//
// The generic stage registry still provides the atomic write and failure-log
// contract used by W3C and IETF.
import { createStages } from '../catalog/stages.ts'

/** The umbrella site: podcast, landscape, community and conference links. */
export const LOCALFIRST_SDO = 'https://www.localfirst.fm/'

/** Public conference page; the next edition replaces the current one. */
export const LOCALFIRST_CONFERENCE_URL = 'https://www.localfirstconf.com/'

/** The comparison table whose data drives the software stage. */
export const LOCALFIRST_LANDSCAPE_URL = 'https://www.localfirst.fm/landscape'

/**
 * The landscape publishes the data through a generated snapshot in its own
 * repository. `repos.ts` is the authoritative list of technology ids, and each
 * id has a `data.json` in the snapshot.
 */
export const LOCALFIRST_LANDSCAPE_REPO =
  'https://github.com/localfirstfm/local-first-landscape'
export const LOCALFIRST_REPOS_URL =
  'https://raw.githubusercontent.com/localfirstfm/local-first-landscape/main/landscape-fetch-content/src/repos.ts'
export const LOCALFIRST_SNAPSHOT_BASE =
  'https://raw.githubusercontent.com/localfirstfm/local-first-landscape/main/landscape-content-snapshot/src/generated'
export const LOCALFIRST_SNAPSHOT_BLOB_BASE = `${LOCALFIRST_LANDSCAPE_REPO}/blob/main/landscape-content-snapshot/src/generated`

/** Catalog organization record; also the SDO identifier used by the UI. */
export const LOCALFIRST_NAME = 'Local-First'
export const LOCALFIRST_LOGO = '/logos/localfirst.svg'

/** UUIDv5 key prefixes, mirroring the gaia-x / semic / matrix conventions. */
export const SILO_ID_PREFIX = 'localfirst'
export const SOFTWARE_SILO_PREFIX = 'urn:localfirst:software:'

/**
 * Places the curated catalog already publishes, keyed by `<country>:<city>`.
 * Local-First reuses these nodes instead of creating a parallel city, so its
 * events land on the same location page as the existing groups and events.
 *
 * Berlin is from data/locations.ttl ("Berlin, DE", region "Europe"), the node
 * that carries the Atmosphere, Mozilla and IndieWeb local groups.
 */
export const REUSED_LOCATION_URIS: Record<string, string> = {
  'Germany:Berlin': 'urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360',
}

export const DEFAULT_LOCALFIRST_DIR = new URL(
  '../../../data/localfirst',
  import.meta.url,
).pathname

/** Output file base names. */
export const STAGE_FILES = {
  organizations: 'organizations',
  locations: 'locations',
  events: 'events',
  software: 'software',
} as const

export type StageName = keyof typeof STAGE_FILES

/** Seed order. Locations are referenced by events, so they go first. */
export const STAGE_ORDER: StageName[] = [
  'organizations',
  'locations',
  'events',
  'software',
]

export const stagesDir = () =>
  process.env.STAGES_DIR ?? DEFAULT_LOCALFIRST_DIR

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
