# FediDB exports

Generated from the weekly datasets at <https://fedidb.com/datasets> and the
FEP repository at <https://codeberg.org/fediverse/fep>. Do not edit the `.nq`
files by hand: run

```sh
devbox run dump:fedidb
```

For FediDB the workflow reads the catalog and checksums from
<https://api.fedidb.org/v1.1/datasets> and downloads the latest NDJSON export
for each dataset. For FEPs it downloads one repository archive
(`archive/main.tar.gz`) and reads `index.json` plus each `fep/<slug>/fep-<slug>.md`
from it; fetching 154 individual files hits Codeberg's rate limiter. One
N-Quads file is published per source:

| File | Source dataset |
| --- | --- |
| `datasets.nq` | FediDB catalog, periods, checksums, CC BY 4.0 attribution |
| `fep.nq` | Codeberg FEP `index.json` + per-FEP Markdown, CC0 |
| `software.nq` | `software` |
| `server-domains.nq` | `server-domains` |
| `servers.nq` | `servers` |
| `open-servers.nq` | `open-servers` |
| `software-versions.nq` | `software-versions` |
| `countries.nq` | `countries` |
| `feature-questions.nq` | `feature-questions` |
| `feature-support.nq` | `feature-support` |

`manifest.json` records the source period and SHA-256 of each file; for FEPs
the checksum is the repository archive. A rerun skips a source whose checksum
has not changed; delete the manifest (or run
`cd typescript && bun run src/fedidb/run.ts --force`) to rebuild.

Mapping: software becomes a `doap:Project` + `ex:Software` with FediDB network
totals; servers use their own base URL as the subject and are typed
`ex:Server`; versions, country aggregates, feature questions and feature
answers get stable `urn:fedidb:*` nodes. Every record points back to its
dataset with `dcterms:source`.

FediDB's software export has no protocol or conformance column. Its rows
include servers, bridges, relays, bots and optional plugins, so the import
does **not** assert that all FediDB software implements ActivityPub and emits
no `doap:implements` for these records. Explicit implementation claims come
only from the curated `data/software.ttl`.

FEPs use the persistent `https://w3id.org/fep/<slug>` identifier (FEP-888d)
as their subject. `fep.nq` records title, status, type, authors, dates,
tracking/discussion links, related FEPs, tags and the Markdown summary, plus
one `ex:FEPImplementation` node for each implementation bullet. The raw
Codeberg Markdown URL is retained as `ex:fepSource`. FediDB feature questions
link to the same canonical FEP identifiers.

Data from FediDB is licensed CC BY 4.0. Attribution: **Data from FediDB
(https://fedidb.com/datasets), CC BY 4.0**. The `datasets.nq` file carries the
same attribution in RDF. FEP data is published under CC0 1.0; `fep.nq` carries
the license and the repository link.

Seed just this directory with:

```sh
devbox run seed -- fedidb
```
