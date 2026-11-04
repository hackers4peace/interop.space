// Read/write helper for the catalog datasets.
//
// Environments:
//   development (default) — the Red Hat sandbox Fuseki. It is read-only unless
//     the rhsandbox write overlay is enabled (`make write-enable` there).
//   production — the hackers4peace VPS. Writes use an SSH tunnel and the
//     writer credentials; the public endpoints stay read-only.
//
// Query endpoints:
//   development  https://fuseki-elf-pavlik-dev.apps.rm1.0a51.p1.openshiftapps.com/ds
//   production   https://sparql.hackers4peace.net/catalog/sparql
//
// Usage:
//   bun scripts/fuseki.ts seed [development|production] [target ...]
//   bun scripts/fuseki.ts wipe [development|production]
//   bun scripts/fuseki.ts tunnel [production]
//
// The devbox scripts default to development; pass production explicitly:
//   devbox run seed -- production
//
// `seed` takes targets after the environment. Without a target it seeds the
// whole catalog; with targets it only seeds those files:
//   devbox run seed -- development w3c
//   devbox run seed -- data/nlnet.ttl
//   devbox run seed -- production ietf data/nlnet.ttl
//   devbox run seed -- static
//
// Environment overrides:
//   FUSEKI_UPDATE_URL   override the update endpoint (both environments)
//   FUSEKI_SSH_HOST     production SSH host, default root@5.75.154.192
//   FUSEKI_USER         production user, default writer
//   FUSEKI_PASSWORD     production password override
//   FUSEKI_PASSWD_FILE  production password file on the VPS

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser, Writer, type Quad } from 'n3'

type Environment = 'development' | 'production'

/** A bad command line, reported without a stack trace. */
class UsageError extends Error {}

const DEVELOPMENT_UPDATE =
  'https://fuseki-elf-pavlik-dev.apps.rm1.0a51.p1.openshiftapps.com/ds/update'
const PRODUCTION_UPDATE = 'http://127.0.0.1:3030/catalog/update'

const ENVIRONMENTS = ['development', 'production']

const argv = process.argv.slice(2)
const command = argv[0]
const args = argv.slice(1)
const environmentArgs = args.filter((arg) => ENVIRONMENTS.includes(arg))
if (environmentArgs.length > 1) {
  console.error(
    `expected at most one environment, got "${environmentArgs.join(' ')}"`,
  )
  process.exit(1)
}
const requestedEnvironment = environmentArgs[0] as Environment | undefined
const selectors = args.filter((arg) => !ENVIRONMENTS.includes(arg))

const environment: Environment =
  command === 'tunnel' || requestedEnvironment === 'production'
    ? 'production'
    : 'development'

const SSH_HOST =
  process.env.FUSEKI_SSH_HOST ?? 'root@5.75.154.192'
const UPDATE_URL =
  process.env.FUSEKI_UPDATE_URL ??
  (environment === 'production' ? PRODUCTION_UPDATE : DEVELOPMENT_UPDATE)
const USER = process.env.FUSEKI_USER ?? 'writer'
const VPS_PASSWD_FILE =
  process.env.FUSEKI_PASSWD_FILE ?? '/run/agenix/fuseki-passwd'

// Curated files are seeded after the generated stage dumps.
const STATIC_SEED_FILES = [
  'data/software.ttl',
  'data/use-cases.ttl',
  'data/specs.ttl',
  'data/organizations.ttl',
  'data/events.ttl',
  'data/locations.ttl',
  'data/nlnet.ttl',
]

const usage = `usage:
  bun scripts/fuseki.ts seed [development|production] [target ...]
  bun scripts/fuseki.ts wipe [development|production]
  bun scripts/fuseki.ts tunnel [production]

seed targets (default: all):
  all      every stage file in data/dump plus every curated data/*.ttl
  static   only the curated data/*.ttl files
  <group>  one stage group under data/dump (w3c, ietf, cross, ...)
  <path>   one .ttl/.nq file, or a directory of .nq files`

/** Every completed stage file, in a deterministic SDO/stage order. */
function stageDumpFiles(group?: string): string[] {
  const root = join(ROOT, 'data/dump')
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const sdo of readdirSync(root, { withFileTypes: true })) {
    if (!sdo.isDirectory()) continue
    if (group !== undefined && sdo.name !== group) continue
    const dir = join(root, sdo.name)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.nq')) {
        files.push(join('data/dump', sdo.name, entry.name))
      }
    }
  }
  return files.sort()
}

/** Stage groups that currently have a dump directory. */
function stageGroups(): string[] {
  const root = join(ROOT, 'data/dump')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * Turn seed targets into repo-relative files, in the order the caller asked
 * for. No target means the whole catalog, as before the selection existed.
 */
function resolveTargets(targets: string[]): string[] {
  const all = () => [...stageDumpFiles(), ...STATIC_SEED_FILES]

  if (targets.length === 0) {
    if (stageDumpFiles().length === 0) {
      throw new UsageError(
        'no stage files in data/dump; run `devbox run dump:w3c` first',
      )
    }
    return all()
  }

  const groups = new Set(stageGroups())
  const selected: string[] = []
  const add = (file: string) => {
    if (!selected.includes(file)) selected.push(file)
  }

  for (const target of targets) {
    if (target === 'all') {
      if (stageDumpFiles().length === 0) {
        throw new UsageError(
          'no stage files in data/dump; run `devbox run dump:w3c` first',
        )
      }
      all().forEach(add)
    } else if (target === 'static' || target === 'curated') {
      STATIC_SEED_FILES.forEach(add)
    } else if (groups.has(target)) {
      const files = stageDumpFiles(target)
      if (files.length === 0) {
        throw new UsageError(
          `no stage files in data/dump/${target}; run \`devbox run dump:${target}\` first`,
        )
      }
      files.forEach(add)
    } else {
      const path = isAbsolute(target) ? target : join(ROOT, target)
      if (!existsSync(path)) {
        const known = [...groups, 'static', 'all'].join(', ')
        throw new UsageError(
          `unknown seed target "${target}"; use ${known}, a stage group or a data/*.ttl / data/dump/*/*.nq path (environments are development and production)`,
        )
      }
      if (statSync(path).isDirectory()) {
        const files = readdirSync(path)
          .filter((entry) => entry.endsWith('.nq'))
          .sort()
          .map((entry) => relative(ROOT, join(path, entry)))
        if (files.length === 0) {
          throw new UsageError(`no .nq files in ${target}`)
        }
        files.forEach(add)
      } else {
        if (!/\.(ttl|nq)$/.test(target)) {
          throw new UsageError(`${target} is not a .ttl or .nq file`)
        }
        const label = relative(ROOT, path)
        if (label.startsWith('..')) {
          throw new UsageError(`${target} is outside the repository`)
        }
        add(label)
      }
    }
  }

  for (const file of selected) {
    if (file.startsWith('..')) {
      throw new UsageError(`${file} is outside the repository`)
    }
  }
  return selected
}

// INSERT DATA transactions are cheap on TDB2, but each one pays a commit.
// 5k quads per request keeps the number of transactions (and requests) small
// without building multi-megabyte update bodies.
const CHUNK_QUADS = 5000

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// ---------------------------------------------------------------------------
// SSH tunnel
// ---------------------------------------------------------------------------

function isOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    let settled = false
    const done = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(500, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** Reuse a production tunnel opened by `devbox run tunnel`, otherwise start one. */
async function ensureTunnel(): Promise<{
  close: () => void
  child?: ChildProcess
}> {
  if (environment === 'development') return { close: () => {} }
  const url = new URL(UPDATE_URL)
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (!local) return { close: () => {} }

  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  if (await isOpen(port)) {
    console.error(`reusing existing tunnel on 127.0.0.1:${port}`)
    return { close: () => {} }
  }

  console.error(`opening SSH tunnel 127.0.0.1:${port} -> ${SSH_HOST}:3030`)
  const child = spawn(
    'ssh',
    [
      '-N',
      // The uplink to the VPS is the bottleneck; SSH compression cuts the
      // seed payload by roughly a third.
      '-C',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ServerAliveInterval=15',
      '-L',
      `${port}:127.0.0.1:3030`,
      SSH_HOST,
    ],
    { stdio: ['ignore', 'inherit', 'pipe'] },
  )

  let stderr = ''
  child.stderr?.on('data', (data) => {
    stderr += data
  })

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await isOpen(port)) {
      return { close: () => child.kill(), child }
    }
    if (child.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  child.kill()
  throw new Error(
    `could not open an SSH tunnel to ${SSH_HOST}:\n${stderr.trim()}`,
  )
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

let cachedPassword: string | undefined

function password(): string {
  if (cachedPassword) return cachedPassword
  if (process.env.FUSEKI_PASSWORD) {
    cachedPassword = process.env.FUSEKI_PASSWORD
    return cachedPassword
  }

  console.error(`reading ${USER} password from ${SSH_HOST}:${VPS_PASSWD_FILE}`)
  const result = spawnSync('ssh', [SSH_HOST, `cat ${VPS_PASSWD_FILE}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status !== 0) {
    throw new Error(
      `could not read ${VPS_PASSWD_FILE} from ${SSH_HOST}; set FUSEKI_PASSWORD instead`,
    )
  }

  const line = result.stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${USER}:`))
  if (!line) {
    throw new Error(`no "${USER}:" entry in ${VPS_PASSWD_FILE}`)
  }

  cachedPassword = line.slice(USER.length + 1).trim()
  return cachedPassword
}

// ---------------------------------------------------------------------------
// SPARQL Update
// ---------------------------------------------------------------------------

async function update(query: string, label: string): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/sparql-update',
  }
  if (environment === 'production') {
    const token = Buffer.from(`${USER}:${password()}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }
  const response = await fetch(UPDATE_URL, {
    method: 'POST',
    headers,
    body: query,
  })
  if (!response.ok) {
    const hint =
      environment === 'development' && response.status === 405
        ? '\n(development is read-only: run `make write-enable` in rhsandbox first)'
        : ''
    throw new Error(
      `${label}: ${response.status} ${response.statusText}\n${await response.text()}${hint}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function parseQuads(path: string): Quad[] {
  const format = path.endsWith('.nq') ? 'application/n-quads' : 'text/turtle'
  return new Parser({ format }).parse(readFileSync(path, 'utf8'))
}

function toNTriples(quads: Quad[]): Promise<string> {
  const writer = new Writer({ format: 'N-Triples' })
  for (const quad of quads) {
    writer.addQuad(quad.subject, quad.predicate, quad.object)
  }
  return new Promise((resolve, reject) => {
    writer.end((error, result) => (error ? reject(error) : resolve(result)))
  })
}

function groupByGraph(quads: Quad[]): Map<string, Quad[]> {
  const groups = new Map<string, Quad[]>()
  for (const quad of quads) {
    const graph = quad.graph.termType === 'DefaultGraph' ? '' : quad.graph.value
    const group = groups.get(graph) ?? []
    group.push(quad)
    groups.set(graph, group)
  }
  return groups
}

function chunks(quads: Quad[], size: number): Quad[][] {
  const result: Quad[][] = []
  for (let i = 0; i < quads.length; i += size) {
    result.push(quads.slice(i, i + size))
  }
  return result
}

/**
 * INSERT DATA cannot span transactions when blank nodes are shared between
 * triples, so files containing blank nodes go in a single update.
 */
async function updatesFor(path: string, quads: Quad[]): Promise<string[]> {
  if (quads.length === 0) return []
  const hasBlankNodes = readFileSync(path, 'utf8').includes('_:')
  const result: string[] = []

  for (const [graph, group] of groupByGraph(quads)) {
    const batches = hasBlankNodes ? [group] : chunks(group, CHUNK_QUADS)
    for (const batch of batches) {
      const triples = await toNTriples(batch)
      result.push(
        graph
          ? `INSERT DATA {\nGRAPH <${graph}> {\n${triples}}\n}`
          : `INSERT DATA {\n${triples}}`,
      )
    }
  }

  return result
}

async function seed(targets: string[]): Promise<void> {
  const files = resolveTargets(targets)
  let seeded = 0
  for (const relativePath of files) {
    const path = join(ROOT, relativePath)
    if (!existsSync(path)) {
      throw new Error(`missing ${relativePath}`)
    }

    const quads = parseQuads(path)
    if (quads.length === 0) {
      console.error(`${relativePath}: no triples, skipped`)
      continue
    }

    const updates = await updatesFor(path, quads)
    for (const [batch, query] of updates.entries()) {
      await update(
        query,
        `${relativePath} (batch ${batch + 1}/${updates.length})`,
      )
    }
    seeded += 1
    console.error(`${relativePath}: ${quads.length} quads seeded`)
  }
  console.error(
    `${seeded} file${seeded === 1 ? '' : 's'} seeded into ${environment}`,
  )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (command !== 'seed' && command !== 'wipe' && command !== 'tunnel') {
  console.error(usage)
  process.exit(1)
}

if (command !== 'seed' && selectors.length > 0) {
  console.error(`${command} does not take seed targets\n${usage}`)
  process.exit(1)
}

if (command === 'tunnel' && requestedEnvironment === 'development') {
  console.error(
    'the development environment does not use an SSH tunnel; enable the rhsandbox write overlay with `make write-enable`',
  )
  process.exit(1)
}

if (command === 'tunnel') {
  const { child } = await ensureTunnel()
  if (!child) {
    console.error('write endpoint is already reachable; tunnel not needed')
    process.exit(0)
  }
  console.error('tunnel open; press Ctrl+C to close it')
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    process.once('SIGINT', () => {
      child.kill()
      resolve()
    })
  })
  process.exit(0)
}

const { close } = await ensureTunnel()
const shutdown = () => {
  close()
  process.exit(130)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  if (command === 'wipe') {
    await update('CLEAR ALL', 'wipe')
    console.error('wiped all graphs in the catalog dataset')
  } else {
    await seed(selectors)
  }
} catch (error) {
  close()
  if (error instanceof UsageError) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  throw error
} finally {
  close()
}
