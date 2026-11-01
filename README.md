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
| `identities` | Dry-runs the merge of `data/dump/w3c/identities.json` into `data/identities.json` and reports collisions |
| `identities:write` | Same merge, writing `data/identities.json` |
| `identities:remap` | Applies `DUPLICATE_W3C_IDS` to `data/identities.json` (dry run adds `--pair=<dup>=<canonical>`) |
| `identities:verify` | Checks identity-map and stage-graph invariants |
| `identities:duplicates` | Lists same-name W3C account pairs with api.w3.org evidence |
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
  identities.json   # identity entries touched by this crawl (merge below)
```

A stage writes its `.nq` only after every fetch and store write succeeded. A
failure writes `<stage>.log` instead, and the next run retries that stage. To
rerun a completed stage, delete its `.nq` file.

`data/identities.json` is the committed identity map for people and
organizations. It is the only durable copy: `data/dump/` is gitignored, so a
fresh checkout that re-crawls before merging assigns new `urn:uuid:`s and the
`people.nq` / `spec-people.nq` subjects change.

The `urn:uuid:` is the **local identity** and stays the node subject, because
it is the only key that can join a W3C account with a GitHub account or an IETF
person. Silo ids are provenance, stored both as `ex:siloId` literals and as
identity-map identifiers, and since the §9.14 migration they are URNs:

| silo | literal / identifier |
| --- | --- |
| W3C person | `urn:w3c:person:<id>` |
| W3C group | `urn:w3c:group:<id>` |
| W3C affiliation (organization) | `urn:w3c:affiliation:<id>` |
| GitHub account | `github:<numeric>` / `github-user:<login>` |

Creators of the edges keep using the local identity, so membership is
`<group> ex:member <urn:uuid:…>` in `people.nq` and authorship is
`<spec> bibo:editor <urn:uuid:…>` / `dcterms:creator <urn:uuid:…>` in
`spec-people.nq` — those edges are untouched by a silo-id migration. Readers
accept the pre-migration `w3c:<id>` spelling so a crawl resumed from an old dump
still resolves; writers only emit the URN form. The one-off rewrite lives in
git history (commit that introduced `silo-ids.ts`), not in `scripts/`: if a
`data/dump/` predates it, delete the affected stage files and re-crawl rather
than keeping a migration tool around.

The dump writes the entries it touched to `data/dump/w3c/identities.json`;
some of those are copies of committed entries (same `urn:uuid:`), the rest are
new. Merge them by `urn:uuid:`, never by appending:

```sh
devbox run identities          # dry run: counts, collisions, review list
devbox run identities:write     # rewrite data/identities.json
```

The merge keeps committed order, appends new entries sorted by `id`, unions
identifiers of shared `urn:uuid:`s, and refuses to write if one external
identifier would belong to two `urn:uuid:`s (the `assertUnique` rule in
`typescript/src/w3c-api/identity.ts`). It never merges different `urn:uuid:`s
that merely share a name: `data/dump/w3c/identities-report.json` lists those
same-name groups for manual review. After a merge the stage file only holds
the next delta: the worker writes an entry only when it is new or learned a new
identifier, and removes the file when nothing is pending.

### One person with two W3C accounts

`DUPLICATE_W3C_IDS` in `typescript/src/w3c-api/person-ids.ts` maps a duplicate
W3C account to the maintained one. Only pairs whose account data on
api.w3.org agrees belong there (same given/family name plus shared
affiliation, or the same city and country division) — a matching display name
is not enough. `devbox run identities:duplicates` prints the candidate queue
grouped by that evidence and caches the api.w3.org responses under
`data/dump/w3c/duplicate-review/`.

Adding a pair only affects future crawls, so the entries that already exist
must be collapsed too:

```sh
devbox run identities:remap -- --pair=47171=106988   # try a pair first
devbox run identities:remap -- --write --prune-stage # then apply
devbox run identities:verify                         # invariants
```

The script keeps the canonical entry, moves every identifier (including the
duplicate `w3c:` id) onto it, drops the other entry, and lists the files that
embed the dropped `urn:uuid:`. Only two stage files ever do: `people.nq` and
`spec-people.nq` — `groups.nq`, `specs.nq` and `citations.nq` hold no person
subjects. `--patch-stage` rewrites the dropped uuid in those two files so the
dataset stays consistent, but that is a stopgap: the stages must still be
rebuilt to get crawler-produced files. Rebuild just those two, then republish:

```sh
rm data/dump/w3c/people.nq data/dump/w3c/spec-people.nq
devbox run dump:w3c                 # re-seeds groups/specs/citations, reruns the two stages
devbox run identities:write        # merge the delta the rerun produced
devbox run identities:verify
devbox run wipe -- production && devbox run seed -- production
```

The wipe is required: `seed` only inserts, so the dropped `urn:uuid:` nodes
would otherwise stay in the published dataset.

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
