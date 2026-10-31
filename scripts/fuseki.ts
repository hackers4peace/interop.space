// Read/write helper for the catalog dataset on the hackers4peace VPS.
//
// Public, read-only (proxied by Caddy, no credentials):
//   https://sparql.hackers4peace.net/catalog/sparql   SPARQL query
//   https://sparql.hackers4peace.net/catalog/data     Graph Store (read)
//
// Writes are not exposed publicly: Fuseki binds to 127.0.0.1:3030 on the VPS
// and only `/catalog/sparql` + `/catalog/data` are proxied. This script opens
// an SSH tunnel for writes and authenticates as `writer` against
// `/catalog/update`. The dataset's Graph Store endpoint is read-only
// (`fuseki:gsp_r`), so seeding converts the RDF files to `INSERT DATA`
// payloads instead of POSTing them to /catalog/data.
//
// Usage:
//   bun scripts/fuseki.ts seed     # ui/public/dump.nq + data/*.ttl
//   bun scripts/fuseki.ts wipe     # CLEAR ALL
//   bun scripts/fuseki.ts tunnel   # keep the write endpoint forwarded
//
// Environment overrides:
//   FUSEKI_SSH_HOST     default root@5.75.154.192
//   FUSEKI_UPDATE_URL   default http://127.0.0.1:3030/catalog/update
//   FUSEKI_USER         default writer
//   FUSEKI_PASSWORD     default: read the writer entry from the VPS age secret
//   FUSEKI_PASSWD_FILE  default /run/agenix/fuseki-passwd

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser, Writer, type Quad } from 'n3'

const SSH_HOST = process.env.FUSEKI_SSH_HOST ?? 'root@5.75.154.192'
const UPDATE_URL =
  process.env.FUSEKI_UPDATE_URL ?? 'http://127.0.0.1:3030/catalog/update'
const USER = process.env.FUSEKI_USER ?? 'writer'
const VPS_PASSWD_FILE =
  process.env.FUSEKI_PASSWD_FILE ?? '/run/agenix/fuseki-passwd'

// Same files (and order) as the old Graph Store seeding.
const SEED_FILES = [
  'ui/public/dump.nq',
  'data/software.ttl',
  'data/use-cases.ttl',
  'data/specs.ttl',
  'data/organizations.ttl',
]

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

/** Reuse a tunnel opened by `devbox run tunnel`, otherwise start one. */
async function ensureTunnel(): Promise<{
  close: () => void
  child?: ChildProcess
}> {
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
  const token = Buffer.from(`${USER}:${password()}`).toString('base64')
  const response = await fetch(UPDATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-update',
      Authorization: `Basic ${token}`,
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(
      `${label}: ${response.status} ${response.statusText}\n${await response.text()}`,
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

async function seed(): Promise<void> {
  for (const relative of SEED_FILES) {
    const path = join(ROOT, relative)
    if (!existsSync(path)) {
      throw new Error(
        `missing ${relative}; run \`devbox run dump\` first to generate ui/public/dump.nq`,
      )
    }

    const quads = parseQuads(path)
    if (quads.length === 0) {
      console.error(`${relative}: no triples, skipped`)
      continue
    }

    const updates = await updatesFor(path, quads)
    for (const [batch, query] of updates.entries()) {
      await update(query, `${relative} (batch ${batch + 1}/${updates.length})`)
    }
    console.error(`${relative}: ${quads.length} quads seeded`)
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const command = process.argv[2]
const usage = 'usage: bun scripts/fuseki.ts <seed|wipe|tunnel>'

if (command !== 'seed' && command !== 'wipe' && command !== 'tunnel') {
  console.error(usage)
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
    await seed()
  }
} finally {
  close()
}
