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
| `dump` | Runs the crawl; writes `ui/public/dump.nq` and the citations report |
| `seed` | Loads `ui/public/dump.nq` and `data/*.ttl` into the Fuseki dataset |
| `wipe` | Clears every graph in the Fuseki dataset (`CLEAR ALL`) |
| `tunnel` | Keeps `127.0.0.1:3030` forwarded to the VPS Fuseki for manual writes |
| `generate` | Regenerates TypeScript, UI and C# types from `schema/*.json` |
| `build` | `generate` + builds `dotnet/Worker/Worker.csproj` |

`dump` must run before `seed` on a fresh checkout: `ui/public/dump.nq` is
generated and gitignored.

## Fuseki

Public, read-only (proxied by Caddy):

- queries: https://sparql.hackers4peace.net/catalog/sparql
- graph store: https://sparql.hackers4peace.net/catalog/data

Writes are not exposed. Fuseki listens on the VPS loopback only, so
`seed` / `wipe` open an SSH tunnel on demand and authenticate as `writer`
against `/catalog/update`. The password is read from the VPS age secret; set
`FUSEKI_PASSWORD` to use a different one, `FUSEKI_SSH_HOST` to use another
host. The graph store endpoint is read-only, so seeding converts the RDF files
to `INSERT DATA` updates (see `scripts/fuseki.ts`).

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
bun run dev     # http://localhost:5173
bun run build
```

The SPARQL endpoint defaults to the public query endpoint above; override it
with `VITE_SPARQL_ENDPOINT`.
