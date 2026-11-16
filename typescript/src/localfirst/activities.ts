// Temporal activities for the Local-First import. Network I/O and page parsing
// live here; the workflow only sequences the stages.
//
// Stage-file first: every step skips when its `.nq` exists, and a failed stage
// writes a `.log` instead of publishing. Delete a stage file to refresh it.
import { setTimeout as sleep } from 'node:timers/promises'
import {
  buildEventQuads,
  buildLocationQuads,
  buildOrganizationQuads,
  buildSoftwareQuads,
  parseConferencePage,
  parseTechnology,
  parseTechnologyIds,
  reusedLocationUri,
  type ConferenceInfo,
  type LandscapeTechnology,
  type TechnologyRecord,
} from './analysis.ts'
import {
  LOCALFIRST_CONFERENCE_URL,
  LOCALFIRST_REPOS_URL,
  LOCALFIRST_SNAPSHOT_BASE,
  failStage,
  hasStage,
  writeStage,
  type StageName,
} from './stages.ts'

const USER_AGENT = 'interop.space localfirst import (+https://interop.space)'
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 60_000

export interface LocalfirstStepResult {
  step: StageName
  skipped: boolean
  reason?: string
  /** Number of quads written by a step that ran. */
  stored?: number
  detail?: string
  /** Published stage file, when the step ran and completed. */
  file?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function skippedStep(step: StageName, reason: string): LocalfirstStepResult {
  return { step, skipped: true, reason }
}

/** One HTTP response, retrying 429/5xx and transient network failures. */
async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html, application/json, text/plain, */*',
          'User-Agent': USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '')
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
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

async function fetchText(url: string, label: string): Promise<string> {
  const response = await fetchWithRetry(url, label)
  return response.text()
}

async function fetchConference(): Promise<ConferenceInfo> {
  const html = await fetchText(
    LOCALFIRST_CONFERENCE_URL,
    'local-first conference page',
  )
  return parseConferencePage(html)
}

/**
 * Step 1: the Local-First organization record. Its subject is the SDO id, so
 * no network fetch is needed; the stage still goes through the same contract.
 */
export async function storeLocalfirstOrganizations(): Promise<LocalfirstStepResult> {
  if (hasStage('organizations')) {
    return skippedStep('organizations', 'organizations.nq already exists')
  }
  try {
    const quads = buildOrganizationQuads()
    const file = await writeStage('organizations', quads)
    return {
      step: 'organizations',
      skipped: false,
      stored: quads.length,
      file,
    }
  } catch (error) {
    failStage('organizations', error)
    throw error
  }
}

/**
 * Step 2: the conference city. Berlin reuses the curated data/locations.ttl
 * node, so this stage only adds the conference page as another source; a
 * future edition in a new city gets its own location record.
 */
export async function storeLocalfirstLocations(): Promise<LocalfirstStepResult> {
  if (hasStage('locations')) {
    return skippedStep('locations', 'locations.nq already exists')
  }
  try {
    const info = await fetchConference()
    const quads = buildLocationQuads(info)
    const file = await writeStage('locations', quads)
    const reused = reusedLocationUri(info.country, info.city)
    return {
      step: 'locations',
      skipped: false,
      stored: quads.length,
      detail: reused
        ? `${info.city}, ${info.country} (reuses ${reused})`
        : `${info.city}, ${info.country}`,
      file,
    }
  } catch (error) {
    failStage('locations', error)
    throw error
  }
}

/** Step 3: the next Local-First Conf edition from the conference page. */
export async function storeLocalfirstEvents(): Promise<LocalfirstStepResult> {
  if (hasStage('events')) {
    return skippedStep('events', 'events.nq already exists')
  }
  try {
    const info = await fetchConference()
    const quads = buildEventQuads(info)
    const file = await writeStage('events', quads)
    return {
      step: 'events',
      skipped: false,
      stored: quads.length,
      detail: `${info.name}: ${info.startDate}..${info.endDate}, ${info.city}, ${info.country}`,
      file,
    }
  } catch (error) {
    failStage('events', error)
    throw error
  }
}

/**
 * Step 4: the local-first landscape. `repos.ts` names every technology and the
 * generated snapshot holds one data.json per technology. One missing or
 * malformed file fails the stage instead of publishing a partial catalog.
 */
export async function storeLocalfirstSoftware(): Promise<LocalfirstStepResult> {
  if (hasStage('software')) {
    return skippedStep('software', 'software.nq already exists')
  }
  try {
    const reposTs = await fetchText(LOCALFIRST_REPOS_URL, 'landscape repos.ts')
    const ids = parseTechnologyIds(reposTs)

    const records: TechnologyRecord[] = []
    const failures: string[] = []
    for (const id of ids) {
      const url = `${LOCALFIRST_SNAPSHOT_BASE}/${id}/data.json`
      try {
        const body = await fetchText(url, `landscape ${id}`)
        records.push(
          parseTechnology(id, JSON.parse(body) as LandscapeTechnology),
        )
      } catch (error) {
        failures.push(`${id}: ${errorMessage(error)}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `landscape snapshot incomplete (${failures.length}/${ids.length}): ${failures.join('; ')}`,
      )
    }

    records.sort((a, b) => a.name.localeCompare(b.name))
    const quads = buildSoftwareQuads(records)
    const file = await writeStage('software', quads)
    return {
      step: 'software',
      skipped: false,
      stored: quads.length,
      detail: `${records.length} technologies`,
      file,
    }
  } catch (error) {
    failStage('software', error)
    throw error
  }
}
