# interop.space

W3C / IETF / Specref / software catalogs crawled by Temporal workflows
(TypeScript and .NET workers) into an Apache Fuseki dataset, plus a Solid UI that
queries it over SPARQL.

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
| `dump:ietf` | Runs IETF stages; writes `data/dump/ietf/*.nq` and per-stage logs |
| `dump:w3c-references` | Crawls rendered W3C specs and records every reference URL (`data/dump/w3c/references.json`); resumable |
| `dump:ietf-references` | Same for RFCs via `datatracker.ietf.org/doc/html` (`data/dump/ietf/references.json`); ~25 min, resumable |
| `dump:cross` | Links both reference files into `data/dump/cross/refs.nq` + `cross-report.json`; no network |
| `stages` | Checks completed stage files and prints any stage logs |
| `identities` | Dry-runs the merge of `data/dump/<sdo>/identities.json` into `data/identities.json` and reports collisions (`STAGES_DIR` selects the SDO, default W3C) |
| `identities:write` | Same merge, writing `data/identities.json` |
| `identities:remap` | Applies `DUPLICATE_W3C_IDS` to `data/identities.json` (dry run adds `--pair=<dup>=<canonical>`) |
| `identities:verify` | Checks identity-map and stage-graph invariants |
| `identities:duplicates` | Lists same-name W3C account pairs with api.w3.org evidence |
| `seed` | Loads `data/dump/*/*.nq` + `data/*.ttl`, or only the given files/groups; defaults to development |
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

`seed` also takes targets after the environment, so a single file or a stage
group can be seeded without touching the rest:

```sh
devbox run seed -- production w3c          # only data/dump/w3c/*.nq
devbox run seed -- ietf data/nlnet.ttl     # a stage group plus one curated file
devbox run seed -- data/nlnet.ttl          # one file, development endpoint
devbox run seed -- static                  # every curated data/*.ttl
```

The targets are `all` (default), `static`, a stage group under `data/dump/`
(`w3c`, `ietf`, `cross`, …), or a `.ttl`/`.nq` file or directory path. `seed`
only inserts, so a selective run leaves the other graphs alone; `wipe` still
clears everything.

Devbox passes everything after `--` as positional parameters to the script
file, not to the command inside it. Scripts that take arguments therefore end
with `"$@"` in `devbox.json` (e.g. `bun run scripts/fuseki.ts seed "$@"`);
without it `devbox run seed -- production` silently seeds development. The
same applies to `identities:remap -- --pair=…`.

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

## IETF crawl

`dump:ietf` runs the same stage-file model against the IETF Datatracker, on its
own Temporal task queue (`ietf`). It writes no SPARQL: the stage files are the
product, so a rerun that deleted a `.nq` simply recomputes it.

```
data/dump/ietf/
  areas.nq          # 17 areas, typed ex:Group + ex:Area
  series.nq         # 367 BCP/STD/FYI subseries + 450 member RFCs
  groups.nq         # 1,315 groups (every state, sdo/nomcom excluded), ex:parent
  specs.nq          # 9,854 RFCs, group links, subseries, obsoletes/updates
  spec-people.nq    # authors/editors (person IRIs only) + Specref metadata
  citations.nq      # normative/informative references between RFCs
  citations-report.json   # per-RFC counts + out-of-catalog targets
  authors-report.json     # the 1,255 RFCs without person-linked authors
  identities.json         # pending person identities (merge below)
```

Stage order matters only for the directory it reads back: `areas` → `series` →
`groups` → `specs` → `spec-people` → `citations`. Each stage skips when its file
exists and leaves `<stage>.log` on failure, exactly like W3C.

Notes worth knowing:

- **Authors are never literals.** 1,255 RFCs (mostly pre-1990) have authorship
  only as names in the RFC index, so they get no author edges at all;
  `authors-report.json` lists them for a semi-manual resolution pass.
- **Subseries fan out**: a citation to BCP 14 produces edges to the series node
  *and* to RFC 2119 / RFC 8174.
- **Merge the pending identities** before cross-SDO people joins can happen:

  ```sh
  STAGES_DIR=data/dump/ietf devbox run identities        # dry run
  STAGES_DIR=data/dump/ietf devbox run identities:write   # apply
  ```

- Datatracker paging needs `order_by=id`; without it a 64k-row sweep silently
  loses a third of its rows. This is built into `fetchIetfList`.

## Cross-SDO references

`dump:w3c-references` and `dump:ietf-references` crawl the rendered documents and
record every reference URL the documents point at (they are separate from the
citation stages because they are slow and resumable). `dump:cross` then joins
both files through the catalog:

```sh
devbox run dump:w3c              # catalog
devbox run dump:ietf             # catalog
devbox run dump:w3c-references   # ~5 min, W3C answers 429 above ~2 req/s
devbox run dump:ietf-references  # ~25 min, 9.8k RFC renderings
devbox run dump:cross            # ~3 s, no network
```

```
data/dump/w3c/references.json      # 12,110 URLs
data/dump/ietf/references.json     # 30,262 URLs
data/dump/cross/refs.nq            # 2,011 ex:normativeRef/ex:informativeRef edges
data/dump/cross/cross-report.json  # per-direction counts, unmatched targets
```

Both crawls keep a `references.jsonl` checkpoint in their stage directory: an
interrupted run resumes, and a rerun only retries the documents that failed
(429s are retried with backoff; `REFERENCES_RATE_LIMIT` and
`REFERENCES_CONCURRENCY` override the defaults).

Limits, both recorded in `cross-report.json`: only 1,370 of 9,854 RFCs have
structured reference sections (XML-derived renderings), so IETF→W3C is sparse
(60 edges); and `w3.org/TR/xml` is not in the W3C catalog, so 38 references to
it stay unmatched.

`seed` picks `data/dump/*/*.nq` up automatically, so `cross` needs no extra
step:

```sh
devbox run seed -- production
```

## NLnet funding

`data/nlnet.ttl` records NLnet Foundation grants for ActivityPub work. The
NLnet project page is the grant id (`ex:Funding`), `ex:funder` points at
`https://nlnet.nl/` and `ex:recipient` at the software record in
`data/software.ttl`; `ex:fund`, `ex:startDate` and `ex:endDate` qualify the
grant. That is the qualified-relation pattern
(<https://patterns.dataincubator.org/book/qualified-relation.html>), so a
project funded several times keeps one `ex:Funding` per grant. The binary
shortcut `<https://nlnet.nl/> ex:funds <software>` is stated once per
funder/software pair, for consumers that do not want to traverse the relation
node.

The software side is a `doap:Project` with
`doap:implements <https://www.w3.org/TR/activitypub/>`. The ActivityPub
Recommendation itself comes from the W3C dump, so the UI joins the two without
a local copy.

The UI reads the relation in both directions: a software page has a Funding
section grouped by funder, and the funder's organization page
(`/orgs/nlnet.nl`) has a Funds section grouped by funded software. Each grant
links to its NLnet project page; grants have no catalog detail pages. NLnet is
an `ex:Organization`, not an SDO.

The grants were collected from <https://nlnet.nl/project/> with the page's own
ActivityPub keyword filter. Four results have no single codebase to point at
(community stewardship, trust and safety services, the ForgeFed protocol, and a
not-yet-summarised Solid/ActivityPub bridge); they are listed at the end of the
file instead of getting an invented recipient.

The funding file only holds the grants, so seed it together with the software
records it points at (`devbox run seed -- static`, or
`devbox run seed -- data/software.ttl data/nlnet.ttl`). Seeding
`data/nlnet.ttl` alone leaves `ex:recipient` pointing at records that are not
in the dataset yet.

## Identities

`data/identities.json` is the committed identity map for people and
organizations. It is the only durable copy: `data/dump/` is gitignored, so a
fresh checkout that re-crawls before merging assigns new `urn:uuid:`s and the
`people.nq` / `spec-people.nq` subjects change.

The `urn:uuid:` is the **local identity** and stays the node subject, because
it is the only key that can join a W3C account with a GitHub account or an IETF
person. Silo ids are provenance, stored both as `ex:siloId` literals and as
identity-map identifiers, and since the identity rework they are URNs:

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

Each dump writes the entries it touched to `data/dump/<sdo>/identities.json`;
some of those are copies of committed entries (same `urn:uuid:`), the rest are
new. Merge them by `urn:uuid:`, never by appending, for whichever SDO you just
dumped:

```sh
devbox run identities                       # W3C dry run: counts, collisions, review
devbox run identities:write                 # W3C: rewrite data/identities.json
STAGES_DIR=data/dump/ietf devbox run identities        # IETF dry run
STAGES_DIR=data/dump/ietf devbox run identities:write  # IETF: apply
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
