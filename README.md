# interop.space

W3C / Specref / software catalogs crawled by Temporal workflows (TypeScript and
.NET workers) into an Apache Fuseki dataset, plus a Solid UI that queries it
over SPARQL.

## Requirements

- [devbox](https://www.jetify.com/devbox) — provides `bun`, `dagger`,
  `dotnet`, `xh`, `grpcurl`
- Docker — the Dagger engine runs in a container
- SSH access to the Fuseki VPS (`root@5.75.154.192`) for `seed` / `wipe`

## devbox scripts

Run from the repository root with `devbox run <script>`:

| Script | Description |
| --- | --- |
| `up` | Starts Temporal, both workers and the Temporal UI on :8080 |
| `dump` | Runs the W3C staged crawl (alias for `dump:w3c`) |
| `dump:w3c` | Runs W3C stages; writes `data/dump/w3c/*.nq` and per-stage logs |
| `stages` | Checks completed stage files and prints any stage logs |
| `seed` | Loads `data/dump/*/*.nq` + `data/*.ttl`; defaults to development |
| `wipe` | Clears every graph; defaults to development |
| `tunnel` | Keeps `127.0.0.1:3030` forwarded to the VPS Fuseki (production only) |
| `generate` | Regenerates TypeScript, UI and C# types from `schema/*.json` |
| `build` | `generate` + builds `dotnet/Worker/Worker.csproj` |

`seed` and `wipe` default to the **development** endpoint (the Red Hat
sandbox). Pass production explicitly:

```sh
devbox run seed -- production
devbox run wipe -- production
```

The development Fuseki is read-only unless the sandbox write overlay is
enabled (`make write-enable` in `rhsandbox`). Production writes use the SSH
tunnel and the existing writer credentials.

`dump:w3c` must run before `seed` on a fresh checkout. The stage files live
under `data/dump/` (gitignored) and are the resume seed:

```
data/dump/w3c/
  groups.nq
  people.nq
  specs.nq
  spec-people.nq
  citations.nq
  identities.json   # new/updated local urn:uuid identities, merge manually
```

A stage writes its `.nq` only after every fetch and store write succeeded. A
failure writes `<stage>.log` instead, and the next run retries that stage. To
rerun a completed stage, delete its `.nq` file.

`data/identities.json` is the committed identity map for people and
organizations. The dump writes new entries to `data/dump/w3c/identities.json`;
merge those into `data/identities.json` manually and review any new/uncertain
identities.

## Fuseki

Public, read-only (proxied by Caddy):

- queries: https://sparql.hackers4peace.net/catalog/sparql
- graph store: https://sparql.hackers4peace.net/catalog/data

Writes are not exposed on production. Fuseki listens on the VPS loopback only,
so production `seed` / `wipe` open an SSH tunnel on demand and authenticate as
`writer` against `/catalog/update`. Development uses the sandbox `/ds/update`
directly while its write overlay is enabled. The production password is read
from the VPS age secret; set `FUSEKI_PASSWORD` to use a different one,
`FUSEKI_SSH_HOST` to use another host. The graph store endpoint is read-only,
so seeding converts the RDF files to `INSERT DATA` updates (see
`scripts/fuseki.ts`).

For ad-hoc writes keep the tunnel open in one terminal:

```sh
devbox run tunnel
```

and use it from another:

```sh
curl -u writer -X POST http://127.0.0.1:3030/catalog/update \
  -H 'Content-Type: application/sparql-update' \
  --data 'INSERT DATA { <urn:example:s> <urn:example:p> "hello" }'
```

## UI

```sh
cd ui
bun install
bun run dev     # development endpoint, http://localhost:5173
bun run prod    # production endpoint, http://localhost:5173
bun run build   # Vercel/build default: production
bun run preview
```

The SPARQL endpoint defaults to the public query endpoint above; override it
with `VITE_SPARQL_ENDPOINT`.
