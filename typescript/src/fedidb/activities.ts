// Temporal activities for the FediDB weekly exports. Network I/O and NDJSON
// parsing live here; the workflow only sequences the datasets.
//
// FediDB publishes a stable metadata document that names the latest immutable
// NDJSON file (and its SHA-256) for every dataset. A dataset is refreshed when
// that checksum changes; a matching manifest entry + stage file lets a rerun
// skip it. The manifest lives next to the .nq files so Dagger can copy it into
// the next run as a resume seed.
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { gunzipSync } from 'node:zlib'
import type { Quad } from 'n3'
import {
  buildCatalogQuads,
  buildCountryQuads,
  buildFeatureQuestionQuads,
  buildFeatureSupportQuads,
  buildServerQuads,
  buildSoftwareQuads,
  buildSoftwareVersionQuads,
  parseNdjson,
  type CountryRow,
  type FeatureQuestionRow,
  type FeatureSupportRow,
  type FedidbCatalog,
  type FedidbDataset,
  type ServerRow,
  type SoftwareRow,
  type SoftwareVersionRow,
} from './analysis.ts'
import {
  buildFepQuads,
  FEP_ARCHIVE_URL,
  FEP_REPO,
  latestFepDate,
  parseFepDocument,
  parseFepIndex,
  parseTar,
  type FepDocument,
  type FepIndexRow,
} from './fep.ts'
import {
  FEDIDB_METADATA_URL,
  FEP_STAGE,
  failStage,
  stageFile,
  stageForDataset,
  stagesDir,
  writeStage,
  type StageName,
} from './stages.ts'

const USER_AGENT = 'interop.space fedidb import (+https://interop.space)'
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 120_000
/** Bump when builder output changes, so unchanged source files are rebuilt. */
const BUILDER_VERSION = 2

interface ManifestEntry {
  period: string
  source?: string
  schema_version: string
  sha256?: string
  url: string
  rows: number
  quads: number
  stage: string
  file: string
  builder: number
  fetched_at: string
}

interface Manifest {
  source: string
  api: string
  catalog_generated_at: string
  updated_at: string
  datasets: Record<string, ManifestEntry>
}

export interface FedidbStepResult {
  dataset: string
  stage: StageName
  skipped: boolean
  reason?: string
  rows?: number
  quads?: number
  file?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One HTTP response, retrying 429/5xx and transient network failures. */
async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, application/gzip, */*',
          'User-Agent': USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '')
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 60_000)
          : 1000 * attempt
        lastError = new Error(`${label}: HTTP ${response.status}`)
        if (attempt < MAX_ATTEMPTS) {
          await sleep(delay)
          continue
        }
      }
      if (!response.ok) {
        throw new Error(
          `${label}: HTTP ${response.status} ${response.statusText}`,
        )
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt)
        continue
      }
    }
  }
  throw new Error(`${label}: ${errorMessage(lastError)}`)
}

/** The FediDB dataset catalog: latest period, files, checksums and license. */
export async function fetchDatasetCatalog(): Promise<FedidbCatalog> {
  const response = await fetchWithRetry(FEDIDB_METADATA_URL, 'FediDB catalog')
  const catalog = (await response.json()) as FedidbCatalog
  if (!Array.isArray(catalog.datasets) || catalog.datasets.length === 0) {
    throw new Error('FediDB catalog has no datasets')
  }
  if (!catalog.license?.url || !catalog.license?.name) {
    throw new Error('FediDB catalog has no license metadata')
  }
  return catalog
}

function manifestPath(): string {
  return join(stagesDir(), 'manifest.json')
}

function readManifest(): Manifest {
  const empty: Manifest = {
    source: 'https://fedidb.com/datasets',
    api: FEDIDB_METADATA_URL,
    catalog_generated_at: '',
    updated_at: '',
    datasets: {},
  }
  const path = manifestPath()
  if (!existsSync(path)) return empty
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Manifest>
    return {
      ...empty,
      ...parsed,
      datasets: parsed.datasets ?? {},
    }
  } catch (error) {
    console.warn(`ignoring unreadable FediDB manifest ${path}: ${errorMessage(error)}`)
    return empty
  }
}

function writeManifest(manifest: Manifest): void {
  const path = manifestPath()
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

/** `datasets.nq`: metadata and CC BY 4.0 attribution for the source itself. */
export async function storeDatasetCatalog(
  catalog: FedidbCatalog,
): Promise<FedidbStepResult> {
  try {
    const quads = buildCatalogQuads(catalog)
    const file = await writeStage('catalog', quads)
    const manifest = readManifest()
    manifest.catalog_generated_at = catalog.generated_at
    manifest.updated_at = new Date().toISOString()
    writeManifest(manifest)
    return {
      dataset: 'catalog',
      stage: 'catalog',
      skipped: false,
      rows: catalog.datasets.length,
      quads: quads.length,
      file,
    }
  } catch (error) {
    const log = failStage('catalog', error)
    throw new Error(`FediDB catalog failed; see ${log}: ${errorMessage(error)}`)
  }
}

function buildQuads(slug: string, body: string): Quad[] {
  switch (slug) {
    case 'software':
      return buildSoftwareQuads(parseNdjson<SoftwareRow>(body))
    case 'server-domains':
      return buildServerQuads(parseNdjson<ServerRow>(body), 'server-domains')
    case 'servers':
      return buildServerQuads(parseNdjson<ServerRow>(body), 'servers')
    case 'open-servers':
      return buildServerQuads(parseNdjson<ServerRow>(body), 'open-servers', {
        openRegistrations: true,
      })
    case 'software-versions':
      return buildSoftwareVersionQuads(
        parseNdjson<SoftwareVersionRow>(body),
      )
    case 'countries':
      return buildCountryQuads(parseNdjson<CountryRow>(body))
    case 'feature-questions':
      return buildFeatureQuestionQuads(
        parseNdjson<FeatureQuestionRow>(body),
      )
    case 'feature-support':
      return buildFeatureSupportQuads(parseNdjson<FeatureSupportRow>(body))
    default:
      throw new Error(`unsupported FediDB dataset "${slug}"`)
  }
}

/** Download one immutable NDJSON export and verify its advertised checksum. */
async function downloadDataset(dataset: FedidbDataset): Promise<string> {
  const file = dataset.latest.files.ndjson
  if (!file?.url) {
    throw new Error(`${dataset.slug}: no NDJSON file in the latest export`)
  }
  const response = await fetchWithRetry(file.url, dataset.slug)
  const compressed = Buffer.from(await response.arrayBuffer())
  if (file.sha256) {
    const digest = createHash('sha256').update(compressed).digest('hex')
    if (digest !== file.sha256) {
      throw new Error(
        `${dataset.slug}: sha256 mismatch (expected ${file.sha256}, got ${digest})`,
      )
    }
  }
  return gunzipSync(compressed).toString('utf8')
}

/**
 * Refresh one FediDB stage. The source file is immutable and checksummed, so a
 * matching manifest entry means there is nothing to do unless `force` is set.
 */
export async function ingestDataset(
  dataset: FedidbDataset,
  force = false,
): Promise<FedidbStepResult> {
  const stage = stageForDataset(dataset.slug)
  if (!stage) {
    throw new Error(`unsupported FediDB dataset "${dataset.slug}"`)
  }
  const file = dataset.latest.files.ndjson
  if (!file?.url) {
    throw new Error(`${dataset.slug}: no NDJSON file in the latest export`)
  }

  const manifest = readManifest()
  const previous = manifest.datasets[dataset.slug]
  const current =
    !force &&
    previous?.sha256 === file.sha256 &&
    previous?.period === dataset.latest.period &&
    previous?.builder === BUILDER_VERSION &&
    existsSync(stageFile(stage))
  if (current) {
    return {
      dataset: dataset.slug,
      stage,
      skipped: true,
      reason: 'unchanged',
      rows: previous.rows,
      quads: previous.quads,
      file: previous.file,
    }
  }

  try {
    const body = await downloadDataset(dataset)
    const quads = buildQuads(dataset.slug, body)
    const path = await writeStage(stage, quads)
    const rows = body === '' ? 0 : body.split(/\r?\n/).filter((line) => line.trim() !== '').length
    manifest.datasets[dataset.slug] = {
      period: dataset.latest.period,
      schema_version: dataset.latest.schema_version,
      sha256: file.sha256,
      url: file.url,
      rows,
      quads: quads.length,
      stage,
      file: path,
      builder: BUILDER_VERSION,
      fetched_at: new Date().toISOString(),
    }
    manifest.updated_at = new Date().toISOString()
    writeManifest(manifest)
    return {
      dataset: dataset.slug,
      stage,
      skipped: false,
      rows,
      quads: quads.length,
      file: path,
    }
  } catch (error) {
    const log = failStage(stage, error, {
      dataset: dataset.slug,
      period: dataset.latest.period,
      url: file.url,
    })
    throw new Error(
      `FediDB ${dataset.slug} failed; see ${log}: ${errorMessage(error)}`,
    )
  }
}

interface FepArchive {
  rows: FepIndexRow[]
  documents: Map<string, FepDocument>
}

/** Extract the index and every FEP document from the repository tarball. */
export function readFepArchive(archive: Uint8Array): FepArchive {
  const files = parseTar(archive)
  // The archive root is `fep/` today, but accept any single top-level prefix.
  const indexKey = [...files.keys()].find((path) =>
    /^(?:[^/]+\/)?index\.json$/.test(path),
  )
  if (!indexKey) throw new Error('FEP archive has no index.json')
  const prefix = indexKey.slice(0, -'index.json'.length)
  const indexBody = Buffer.from(files.get(indexKey)!).toString('utf8')
  const rows = parseFepIndex(indexBody)
  const documents = new Map<string, FepDocument>()
  const missing: string[] = []

  for (const row of rows) {
    const slug = row.slug?.trim()
    if (!slug) continue
    const key = `${prefix}fep/${slug}/fep-${slug}.md`
    const bytes = files.get(key)
    if (!bytes) {
      missing.push(slug)
      continue
    }
    documents.set(slug, parseFepDocument(slug, Buffer.from(bytes).toString('utf8')))
  }

  if (missing.length > 0) {
    throw new Error(
      `FEP archive is missing ${missing.length} document(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
    )
  }
  return { rows, documents }
}

/**
 * Refresh `fep.nq` from the Codeberg FEP repository. This is not a FediDB
 * dataset. The single `main.tar.gz` archive supplies both index.json and every
 * Markdown document, so the stage makes one request instead of 154 (Codeberg's
 * rate limiter rejects the per-file approach). Its SHA-256 is the resume key.
 */
export async function ingestFeps(force = false): Promise<FedidbStepResult> {
  let archiveBytes: Buffer
  try {
    const response = await fetchWithRetry(FEP_ARCHIVE_URL, 'FEP archive')
    archiveBytes = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    const log = failStage(FEP_STAGE, error, { url: FEP_ARCHIVE_URL })
    throw new Error(
      `FediDB ${FEP_STAGE} failed; see ${log}: ${errorMessage(error)}`,
    )
  }

  const sha256 = createHash('sha256').update(archiveBytes).digest('hex')
  const manifest = readManifest()
  const previous = manifest.datasets[FEP_STAGE]
  const current =
    !force &&
    previous?.sha256 === sha256 &&
    previous?.builder === BUILDER_VERSION &&
    existsSync(stageFile(FEP_STAGE))
  if (current) {
    return {
      dataset: FEP_STAGE,
      stage: FEP_STAGE,
      skipped: true,
      reason: 'unchanged',
      rows: previous.rows,
      quads: previous.quads,
      file: previous.file,
    }
  }

  let archive: FepArchive
  try {
    archive = readFepArchive(gunzipSync(archiveBytes))
  } catch (error) {
    const log = failStage(FEP_STAGE, error, { url: FEP_ARCHIVE_URL })
    throw new Error(
      `FediDB ${FEP_STAGE} failed; see ${log}: ${errorMessage(error)}`,
    )
  }

  const rows = archive.rows

  try {
    const quads = buildFepQuads(rows, archive.documents)
    const path = await writeStage(FEP_STAGE, quads)
    manifest.datasets[FEP_STAGE] = {
      source: FEP_REPO,
      period: latestFepDate(rows) ?? '',
      schema_version: 'fep-index-v1',
      sha256,
      url: FEP_ARCHIVE_URL,
      rows: rows.length,
      quads: quads.length,
      stage: FEP_STAGE,
      file: path,
      builder: BUILDER_VERSION,
      fetched_at: new Date().toISOString(),
    }
    manifest.updated_at = new Date().toISOString()
    writeManifest(manifest)
    return {
      dataset: FEP_STAGE,
      stage: FEP_STAGE,
      skipped: false,
      rows: rows.length,
      quads: quads.length,
      file: path,
    }
  } catch (error) {
    const log = failStage(FEP_STAGE, error, {
      source: FEP_REPO,
      url: FEP_ARCHIVE_URL,
    })
    throw new Error(
      `FediDB ${FEP_STAGE} failed; see ${log}: ${errorMessage(error)}`,
    )
  }
}
