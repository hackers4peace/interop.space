# IETF aggregation plan

Started 2026-11-01 as a plan; the core pipeline is **implemented and dumped**.
Every count below was measured against the live sources that day and then
verified against the produced dumps.

Scope: aggregate IETF data comparably to the existing W3C aggregation, in a way
that generalises to more SDOs, and keep the cross-SDO parts in a separate,
explicitly ordered step.

---

## 0. Where this stands (2026-11-01)

Implemented and run end to end:

| stage / function | artifact | result |
|---|---|---|
| `areas` | `data/dump/ietf/areas.nq` | 17 areas (7 active, 4 concluded, 6 unknown), 170 quads |
| `series` | `series.nq` | 367 subseries (238 BCP / 93 STD / 36 FYI), 450 member links, 2,652 quads |
| `groups` | `groups.nq` | 1,315 groups (all states, all types except `sdo`/`nomcom`), 1,200 `ex:parent`, 14,349 quads |
| `specs` | `specs.nq` | 9,854 RFCs, all with `ex:specification`, 450 `ex:series`, 8,387 `ex:draft`, 136,976 quads |
| `spec-people` | `spec-people.nq` | 22,324 author/editor edges over 6,120 persons, **0 literals**, Specref 9,854/9,854, 118,506 quads |
| `citations` | `citations.nq` | 128,186 edges (58,674 normative / 69,512 informative), 8,508 sources, 128,186 quads |
| `dumpW3cReferences` | `data/dump/w3c/references.json` | 12,110 URLs from 836/845 specs |
| `dumpIetfReferences` | `data/dump/ietf/references.json` | 30,262 URLs; **1,370** docs of 9,822 fetched have structured references |
| `dumpCross` | `data/dump/cross/refs.nq` | 2,011 cross-SDO edges (1,951 W3C→IETF, 60 IETF→W3C) |

**IETF graph total: 400,839 quads.** Dagger functions: `dump-w-3-c`,
`dump-ietf`, `dump-w-3-c-references`, `dump-ietf-references`, `dump-cross`;
devbox scripts mirror them plus `dump:cross`. Temporal task queue: `ietf`
(stage-by-stage, skips on existing stage files, no SPARQL writes).

Pending / deferred, with pointers:

| item | state |
|---|---|
| `people` (group roles) | deferred — facts and request cost in §7.3 |
| attendance / participation | deferred — §7.3 |
| semi-manual author resolution (1,255 RFCs) | TODO in §7.5 |
| organisations / affiliations | deferred — §5.2 |
| `dumpEmails` (gitignored email dump) | not implemented — §5.4 |
| W3C series/versions, ecosystems stage, spec completeness | deferred — §9.11–9.13 |
| active Internet-Drafts | later — §7.7 |
| UI for IETF data | not started — §11 P8 |
| merge of `data/dump/ietf/identities.json` (6,121 people) | pending, out of band |
| old RFC references (text-derived HTML) | gap found while building `dump:cross` — §6.3 |
| `w3.org/TR/xml` missing from the W3C catalog | catalog gap — §6.3 |

Files added (all under `typescript/src/`):

| file | role |
|---|---|
| `catalog/stages.ts` | shared stage registry (was W3C-only), IRI guard before publishing |
| `catalog/references.ts` | reference-evidence format + resumable crawler (checkpoint, 429 backoff) |
| `crossref.ts` | URL-family derivation both ways, cross-SDO linking, `refs.nq` + report CLI |
| `ietf-api/{stages,silo-ids,analysis,activities,workflows,run}.ts` | the IETF crawl |
| `ietf-api/references.ts`, `ietf-api/references-extract.ts` | IETF reference crawl |
| `w3c-api/references.ts` | W3C reference crawl |
| `w3c-api/stages.ts` | now a thin binding over `catalog/stages.ts` |

Bugs found and fixed on the way, worth remembering:

1. **tastypie's default page order is unstable** — every paged sweep now sends
   `order_by=id` (§10). Citation edges went from 84,133 to 128,186 after the fix.
2. **rfc2html puts `id="name-*-references"` on the `<h3>`**, the list in the next
   sibling `<dl>`; the extractor now handles both shapes (§6.3).
3. **Datatracker `list_archive` values are not always URLs** (8 groups carry
   prose) — `absoluteUrl()` filters them and `catalog/stages.ts` refuses to
   publish a stage with an invalid IRI (§7.2).

---

## 1. Baseline: what `dump:w3c` does today

`devbox run dump:w3c` → `dagger call dump-w-3-c` (`.dagger/src/index.ts`) →
one container with Temporal + Oxigraph + the Bun worker → `w3cApiWorkflow` →
`/stages` exported into `data/dump/w3c`, then `scripts/stage-status.ts w3c`.

Run on 2026-11-01 with a complete stage directory: the Temporal/worker/Oxigraph
graph came up, the workflow ran, **every stage skipped** (`groups.nq`,
`people.nq`, `specs.nq`, `spec-people.nq`, `citations.nq` already existed),
`citations-report.json` was rewritten with `{"skipped": true}`, and the
directory was re-exported unchanged. The `Container.asService ERROR` line in the
Dagger output is Temporal being torn down after the client returned; `client.log`
and `worker.log` show a clean run. Re-crawling requires deleting a stage `.nq`.

Identities are consolidated (separate session, 2026-11-01): `data/identities.json`
now holds 14,235 people + 1 organisation keyed by `urn:w3c:person:<id>` (plus
`github:<id>`, `github-user:<login>`, `url:<…>`, `homepage:<…>`). Each SDO run
still writes unmatched entries to its own gitignored
`data/dump/<sdo>/identities.json` for a later merge.

### 1.1 Stage table (measured from the current `data/dump/w3c/*.nq`)

| stage | source | triples | counts |
|---|---|---|---|
| `groups` | `GET api.w3.org/groups?embed=true&items=1000` | `a ex:Group`, `ex:sdo`, `ex:w3cApiUrl`, `ex:name`, `ex:siloId "w3c:<id>"`, `ex:shortname`, `ex:type` | 324 groups, 2,197 quads (194 CG, 46 WG, 12 IG, 1 BG) |
| `people` | `GET /groups/<id>/users` per group | group `ex:member` → `urn:uuid:` person; `ex:Person`, `ex:name`, `ex:w3cApiUrl`, `ex:siloId`(`w3c:<id>`, optional `github:<id>`), `ex:siloUsername "github:<login>"`, `ex:logo` | 14,238 people, 22,500 member edges, 4,218 with GitHub, 4,971 with logo, 91,795 quads |
| `specs` | `GET /groups/<id>/specifications` | group `ex:specification` → `ex:Specification`; `ex:sdo`, `ex:w3cApiUrl`, `ex:w3cLatestVersionUrl`, `ex:name`, `ex:shortname`, `ex:landingPage`, `ex:editorDraft` | 845 specs, 857 group→spec links, 7,503 quads |
| `spec-people` | `GET <latest-version>/editors` + Specref dump | `bibo:editor` → person; Specref metadata (`ex:specrefId`, `dcterms:title/creator/date/publisher`, `bibo:uri/status/obsoletes/obsoletedBy/isbn/pages`, `specref:edDraft/etAl/rawDate`, `schema:codeRepository`) | 1,942 editor edges, 1,928 creators, 844 `ex:specrefId`, 11,483 quads |
| `citations` | rendered latest TR HTML (Bikeshed/ReSpec references sections) | `ex:normativeRef` / `ex:informativeRef` between catalog specs | 3,337 normative + 1,735 informative, 544 sources, 522 targets, 5,072 quads |

Total **118,025 quads** (counted from the current stage files). Invariants that must be mirrored for IETF: a stage with
zero quads fails; `.nq` is published atomically only after all fetches *and*
store writes succeed, otherwise `<stage>.log` and no `.nq`; duplicate or
cross-SDO colliding public URLs abort the stage; citations delete their previous
edges for successfully crawled documents before insert; results are reported per
stage and per document.

### 1.2 Code map (what is reusable vs W3C-specific)

| module | reusable for IETF? |
|---|---|
| `w3c-api/activities.ts` (`postNQuads`, `postUpdate`, `queryRows`, `batchNQuads`, `seedBase`, `sanitizeNQuads` use) | **yes** — move to `src/catalog/store.ts` |
| `w3c-api/stages.ts` (stage file, atomic write, `.log`, `existingGroupUris`) | **yes** — parameterise SDO + stage list |
| `w3c-api/identity.ts` (`urn:uuid` map, `resolvePerson`/`resolveOrganization`, merge + review) | **yes** — needs new identifier families |
| `w3c-api/person-ids.ts` (duplicate W3C id canonicalisation) | pattern yes, mapping W3C-only |
| `specref/matching.ts`, `link.ts`, `metadata.ts`, `authors.ts`, `exceptions.ts`, `author-map.ts` | **yes** — Specref is already SDO-neutral, matching keys need IETF URL families |
| `citations/extract.ts` (Bikeshed/ReSpec) | no (W3C generators) — but the `generator` switch is the right seam for `rfc2html`/xml2rfc |
| `citations/resolve.ts`, `citations/urls.ts` | **no** — `isTrUrl` / `trKey` / `shortlinkFromDatedTrUrl` hardcode `w3.org/TR` |
| `citations/report.ts` | **yes** — same report shape for both SDOs |
| `w3c-api/activities.ts` `fetchStoreSpecifications`, `fetchCatalogSpecifications` | **no as-is** — both select `?spec a ex:Specification` with no SDO filter |
| `ui/src/worker/catalog.ts` | mostly SDO-neutral (`?sdo=` filter on groups/specs/useCases); `ex:w3cApiUrl`, `W3cGroup`, `W3cParticipant`, `parseW3cId` are W3C-named |
| `schema/*.schema.json` + `gen.ts` | only generates *payload* types (TS/UI/C#); the RDF vocabulary is not schema-driven (it lives as string constants in `analysis.ts`) |

Two blockers for a second SDO in the same store:

1. `fetchStoreSpecifications()` and `fetchCatalogSpecifications()` are unscoped —
   an IETF `spec-people`/`citations` stage would pull W3C specs and fetch W3C
   URLs. Both must filter by `ex:sdo` (or by silo-id prefix).
2. Citation target resolution only accepts `www.w3.org/TR/...`; every IETF
   target is counted as `skippedNonW3c` and the URLs are not even recorded
   (`skippedNonW3c` is a count, `skippedOutOfCatalog` keeps `{key, url}`).

---

## 2. Verified IETF source facts (2026-11-01)

### 2.1 Datatracker REST API (`https://datatracker.ietf.org/api/v1/`, tastypie)

Pagination: `?format=json&limit=1000&offset=N`, response `meta.{limit,offset,total_count,next}`.
`limit=1000` works (groups page ≈ 924 KB, links page ≈ 254 KB). Filters are
django-style: `type__slug=rfc`, `group__id=1718`, `source__name=rfc9110`,
`source__type__slug=rfc`, `relationship__slug=refnorm`.

| resource | total | notes |
|---|---|---|
| `group/group/` | 1,614 | wg 1,128, rg 40, area 17, team 54, program 14, review 15, dir 11, ag 14; `parent` gives the area (httpbis 1718 → `wit` 2412), `type`, `state`, `list_archive`, `charter`, `description` |
| `group/groupextresource/` | 1,153 | `webpage`, `wiki`, `mailing_list`, `mailing_list_archive`, `github_org`, `github_repo`, `jabber_log`, `zulip`, `tracker`, … → group homepage/GitHub |
| `group/role/` | 4,477 | `person`, `name` slug (`chair`, `ad`, `secr`, `techadv`, `member`, `liaiman`, `editor`, …), `email` |
| `person/person/` | 57,365 | `id` (stable), `name`, `ascii`, `photo`, `biography` |
| `person/email/` | 69,537 | `address` (unique key), `person`, `primary`, `active`, `origin` |
| `person/alias/` | 144,780 | alternate `name` per person → helps name matching |
| `person/personextresource/` | 1,345 | `github_username`, `github_org`, `gitlab_username`, **`orcid`**, `webpage` → cross-SDO join keys |
| `doc/document/` | 161,426 | draft 44,269, rfc 9,854, charter 884; stream ietf 21,432 |
| `doc/documentauthor/` | 141,611 | of type rfc **22,331**, of type draft 106,555; always has `person` (0 null); `order`, `affiliation` (free text), `email` |
| `doc/relateddocument/` | 590,240 | `source`, `target`, `relationship`; from RFC sources **117,922** (refnorm 50,042, refinfo 64,050), refnorm from drafts alone 199,546; **`contains` 450** = subseries → member RFC |
| `doc/dochistory/` | 456,918 | per-revision metadata (draft `-00`…`-NN`) → the IETF "versions" layer |
| `doc/docevent/` | — | `published_rfc`, `new_revision`, name changes |
| `name/docrelationshipname/` | 17 | `refnorm`, `refinfo`, `refunk`, `obs`, `updates`, `replaces`, `possibly-replaces`, `contains`, `tobcp`, `toexp`, `tohist`, `toinf`, `tois`, `tops`, `became_rfc`, `conflrev`, `downref-approval` |
| `doc/document?type__slug=bcp\|std\|fyi` | 242 / 94 / 37 | subseries documents (`bcp14`, `std97`, `fyi36`) → `ex:SpecificationSeries` nodes |

Request budget for the RFC-scoped crawl: groups 2, ext resources 2, roles 5,
documents 10, documentauthors 22, relateddocuments 116, person aliases 145
(optional) ≈ **~200 requests / ~60 MB / a few minutes**. No published rate
limit; there is an explicit warning against per-object N+1 crawling
(`ietfdata` README: "The IETF will block your access if you make many queries").

### 2.2 RFC index (`https://www.rfc-editor.org/rfc-index.xml`, 13.7 MB)

- 9,854 `rfc-entry`; 247 `bcp-entry`, 93 `std-entry`, 36 `fyi-entry`.
- formats: TXT 9,847, HTML 9,847, PDF 1,522, PS 55, **XML 1,390 (14 %)**.
- per entry: `doc-id`, `title`, `author`(+optional `<title>Editor</title>`),
  `date`(month/year), `format`, `page-count`, `keywords`, `abstract`,
  `current-status` (PROPOSED STANDARD 4,434 / INFORMATIONAL 3,013 /
  UNKNOWN 887 / EXPERIMENTAL 559 / HISTORIC 353 / BCP 337 / DRAFT STANDARD 138 /
  INTERNET STANDARD 133), `stream` (IETF 7,261 / Legacy 1,893 / INDEPENDENT 435 /
  IAB 134 / IRTF 128 / Editorial 3), `<draft>` (`draft-ietf-httpbis-semantics-19`),
  `is-also` (BCP/STD/FYI membership), `obsoletes`, `obsoleted-by`, `updates`,
  `updated-by`, `errata-url`, `doi`.
- Specref's IETF source is exactly this file (`refs/ietf.json`), so RFC metadata
  can come from Specref instead of parsing the XML again.

### 2.3 Rendered references

- `https://datatracker.ietf.org/doc/html/rfc9110` — modern xml2rfc HTML with
  stable ids: `id="name-normative-references"`, `name-informative-references`,
  `name-uri-references`.
- `https://www.rfc-editor.org/rfc/rfc9110.html` — text-derived HTML, **no ids**
  (only the literal heading "Normative References"). Do not parse this.
- Drafts: `https://www.ietf.org/archive/id/draft-<name>-<rev>.html` — same
  modern markup with `name-*-references`.
- Consequence: `references.md` (specref repo) option F ("IETF RFC XML, ~9.8k
  RFCs") is wrong on coverage — only 1,390 RFCs have XML. XML is the best
  source for those; Datatracker `relateddocument` covers all RFCs; HTML is
  needed only for non-IETF (e.g. W3C) targets.
- Cross-SDO references are real, e.g.
  `draft-ietf-oauth-selective-disclosure-jwt-14` →
  `target="https://www.w3.org/TR/vc-data-model-2.0/"`.

### 2.4 Bulk options (evaluated, not required)

| option | facts | verdict |
|---|---|---|
| `ghcr.io/ietf-tools/datatracker-db:latest` (nightly Postgres dump) | 1.63 GB, 15 layers (per datatracker README) | good for full history + drafts; a whole Dagger function of its own |
| `ietfdata` `DTBackendArchive` | builds a ~2 GB sqlite, "around 24 hours" for the initial download | not viable per run |
| `ietfdata` `DTBackendLive` | per-object REST calls | explicitly discouraged by the library for bulk use |
| `ietfdata` 0.9.2 deps | pydantic, beautifulsoup4, pandas, requests-cache, imapclient, psycopg; **psycopg is declared but unused in `datatracker.py`; there is no Postgres backend** | useful as a model/parser library, not as an access layer |

---

## 3. Series / specification / version model

The user asked to look at W3C **series and versions**, which we never modelled.
They exist and are a real gap in the current dump.

### 3.1 What the W3C API actually offers

| level | endpoint | total | fields |
|---|---|---|---|
| series | `/specification-series` | **1,495** | `shortname`, `name`, links: `specifications`, `current-specification` |
| specification (level) | `/specifications` | **1,721** | `shortlink`, `shortname`, `title`, `description`, `editor-draft`, `series-version`, links: `series`, `version-history`, `first-version`, `latest-version` |
| version | `/specifications/<s>/versions` | e.g. `did-1.0` has **83** | `uri` (dated snapshot), `shortlink`, `status`, `date`, `informative`, `rec-track`, `editor-draft`, `errata`, `process-rules`, links: `editors`, `deliverers`, `predecessor-version`, `translations`, `specification` |

Measured against our dump:

- our `specs` stage contains **845 of the 1,721** API specifications → **886
  missing**, because `/groups/<id>/specifications` only returns *current*
  deliverables of *existing* groups (retired/legacy specs such as
  `https://www.w3.org/TR/NOTE-AS` never appear);
- **1,267** of the 1,721 specs have more than one version;
- **every** spec links to a series → **1,472 distinct series**, so **23 of the
  1,495 series have no specification at all**;
- specs per series: 1,312 series have exactly one spec, 110 have two, 34 have
  three, the long tail reaches `css` 14 and `html` 12;
- only **702** of 1,721 specs carry `series-version` → leveled series are a
  minority (41 %), so level must stay an *optional* spec property;
- API self URLs are **not stable across renames**: `/specifications/did-core`
  301-redirects to `/specifications/did-1.0`, while the *shortlink*
  (`https://www.w3.org/TR/did-core/`) is unchanged. So `ex:w3cApiUrl` is
  provenance, and the public shortlink must remain the identity.

### 3.2 IETF analogue

There is no isomorphic hierarchy; the closest mapping is:

| concept | W3C | IETF |
|---|---|---|
| work item / grouping | series `did` | subseries `BCP 14`, `STD 97`, `FYI 36` (`is-also`); most RFCs belong to none |
| named document | specification `did-1.0` (`https://www.w3.org/TR/did-core/`) | RFC `https://www.rfc-editor.org/info/rfc9110/` **or** draft `https://datatracker.ietf.org/doc/draft-ietf-httpbis-semantics/` |
| dated/immutable snapshot | version `https://www.w3.org/TR/2022/REC-did-core-20220719/` | draft revision `https://www.ietf.org/archive/id/draft-ietf-httpbis-semantics-19.html` |
| provenance between levels | `predecessor-version`, level in series | `rfc-index` `<draft>` element, `relateddocument` `became_rfc`, `document.rfc_number` |

Deviations to accept:

- an RFC has **no versions** — it is already an immutable document;
- a draft's revisions are versions, and the draft series normally ends in an
  RFC, which is a *sibling* document, not a version of the draft;
- W3C series have no public URL (only `https://api.w3.org/specification-series/did`),
  while IETF subseries have real URLs (`https://www.rfc-editor.org/info/bcp14/`).

Verified on both sides (2026-11-01), because this decides whether one schema
can carry both:

| | W3C | IETF |
|---|---|---|
| series count | 1,495 (23 empty) | 376 (9 empty) |
| members | 1,721 specs, 1,472 series used | 450 member RFCs |
| max members | `css` 14 | `BCP 9` 8 |
| spec in >1 series | no (every spec has exactly one) | no (0 documents) |
| leveled? | 702/1,721 specs have `series-version` | never (BCP/STD/FYI are not leveled) |
| source | `GET /specification-series` (2 pages) | `relateddocument?relationship__slug=contains` (**450 rows, one request**) |

So: one `ex:SpecificationSeries` type with `ex:hasSpecification` / `ex:series`
works for both, `ex:seriesVersion` is optional and spec-side, and empty series
must be tolerated. The IETF citation fan-out (series edge **and** member edges)
is a resolution policy, not a schema difference — W3C targets never need it.

### 3.3 Proposed SDO-neutral model (verified for both SDOs)

```turtle
# series (optional for plain RFCs)
<https://api.w3.org/specification-series/did> a ex:SpecificationSeries ;
  ex:sdo <https://www.w3.org/> ;
  ex:shortname "did" ; ex:name "Decentralized Identifiers (DIDs)" ;
  ex:hasSpecification <https://www.w3.org/TR/did-core/> , <https://www.w3.org/TR/did-1.1/> ;
  ex:currentSpecification <https://www.w3.org/TR/did-1.1/> ;
  ex:apiUrl <https://api.w3.org/specification-series/did> .

# specification (named document, the level we model today)
<https://www.w3.org/TR/did-core/> a ex:Specification ;
  ex:series <https://api.w3.org/specification-series/did> ;
  ex:seriesVersion "1.0" ;            # serialisation of series-version
  ex:latestVersion <https://www.w3.org/TR/2022/REC-did-core-20220719/> ;
  ex:apiUrl <https://api.w3.org/specifications/did-1.0> .

# version (immutable snapshot)
<https://www.w3.org/TR/2022/REC-did-core-20220719/> a ex:SpecificationVersion ;
  ex:specification <https://www.w3.org/TR/did-core/> ;
  ex:landingPage <https://www.w3.org/TR/2022/REC-did-core-20220719/> ;
  ex:date "2022-07-19" ; ex:status "Recommendation" ;
  ex:informative false ; ex:predecessor <.../versions/20210803> .
```

IETF instances:

```turtle
<https://www.rfc-editor.org/info/bcp14/> a ex:SpecificationSeries ;
  ex:sdo <https://www.ietf.org/> ;
  ex:shortname "bcp14" ; ex:name "BCP 14" ;
  ex:hasSpecification <https://www.rfc-editor.org/info/rfc2119/> , <https://www.rfc-editor.org/info/rfc8174/> .

<https://www.rfc-editor.org/info/rfc9110/> a ex:Specification ;
  ex:sdo <https://www.ietf.org/> ; ex:shortname "rfc9110" ;
  ex:name "HTTP Semantics" ; ex:status "Internet Standard" ;
  ex:landingPage <https://www.rfc-editor.org/info/rfc9110/> ;
  ex:ietfApiUrl <https://datatracker.ietf.org/api/v1/doc/document/rfc9110/> ;
  ex:draft <https://datatracker.ietf.org/doc/draft-ietf-httpbis-semantics/> ;
  ex:doi "10.17487/RFC9110" ; ex:errata <https://www.rfc-editor.org/errata/rfc9110> .

<https://datatracker.ietf.org/doc/draft-ietf-httpbis-semantics/> a ex:Specification ;
  ex:publishedAs <https://www.rfc-editor.org/info/rfc9110/> .

<https://www.ietf.org/archive/id/draft-ietf-httpbis-semantics-19.html> a ex:SpecificationVersion ;
  ex:specification <https://datatracker.ietf.org/doc/draft-ietf-httpbis-semantics/> ;
  ex:revision "19" ; ex:date "2018-04-03" .
```

Notes:

- **Scope in v1**: only the IETF **series** level is implemented now. W3C series
  and *all* version nodes (`ex:SpecificationVersion`) are designed but deferred
  (§9) — the schema below is the target, not a v1 deliverable.
- **Subject for versions is a real retrievable URL**, not an API URI, so the
  graph stays dereferenceable (W3C dated TR URL, IETF archive revision URL).
- `ex:apiUrl` is the generic provenance predicate; keep `ex:w3cApiUrl` for
  existing data and add **`ex:ietfApiUrl`** (user decision). UI reads whichever
  is present.
- Citations stay attached to the **specification** node (latest known version),
  which preserves today's W3C semantics and matches Datatracker's per-document
  references. The version node is recorded and linked; per-version citations
  are a later migration.
- Specref already models exactly this as `versions` / `versionOf`; the RDF names
  are chosen to line up with it.

### 3.4 Schema adjustments

Two different things are called "schema" in this repo:

1. **RDF vocabulary** — string constants in `typescript/src/{w3c-api/analysis,
   software-dependencies/analysis}.ts`. No generator. Needs the new terms above
   (`ex:SpecificationSeries`, `ex:SpecificationVersion`, `ex:series`,
   `ex:seriesVersion`, `ex:latestVersion`, `ex:apiUrl`, `ex:ietfApiUrl`,
   `ex:subseries`, `ex:publishedAs`, `ex:draft`, `ex:revision`, `ex:parent`,
   `ex:role`, `ex:affiliation`, `ex:stream`, `ex:doi`, `ex:errata`,
   `ex:listArchive`, `ex:email`, `ex:specrefId` (exists)).
2. **Cross-language payload schemas** — `schema/*.schema.json` → `gen.ts` →
   `typescript/src/gen`, `ui/src/gen`, `dotnet/Gen/gen` via quicktype. Today
   only `profile.schema.json` (fediverse). Proposed additions so that a future
   Python worker, the Bun worker and the .NET worker agree:
   - `schema/citation-report.schema.json` (the report currently typed only in TS),
   - `schema/stage-result.schema.json` (`{step, skipped, reason, stored?, file?, detail?}`),
   - `schema/spec-reference.schema.json` (the `{source, sourceVersion, key, nature, url}`
     evidence rows needed by the cross-SDO step, see §6).

### 3.5 `series` stage (IETF in v1; W3C deferred)

Same shape for both, but **only the IETF stage is in scope now** — its citation
fan-out needs it. The W3C stage is designed and deferred (§9). It runs before
`specs` so `ex:series` always resolves:

| | W3C `data/dump/w3c/series.nq` | IETF `data/dump/ietf/series.nq` |
|---|---|---|
| source | `GET /specification-series?embed=true&items=1000` (2 pages, 1,495 rows) | `relateddocument?relationship__slug=contains` (1 page, 450 rows) |
| subject | `https://api.w3.org/specification-series/<shortname>` | `https://www.rfc-editor.org/info/<bcp\|std\|fyi><n>/` |
| emits | `a ex:SpecificationSeries`, `ex:sdo`, `ex:shortname`, `ex:name`, `ex:apiUrl`, `ex:currentSpecification`, `ex:hasSpecification` | `a ex:SpecificationSeries`, `ex:sdo`, `ex:shortname`, `ex:name`, `ex:landingPage`, `ex:ietfApiUrl`, `ex:hasSpecification` |
| empty series | emitted, no members (23) | not reachable: `contains` has no row for the 9 empty BCPs |

**IETF stage implemented** (2,652 quads): **367 series — 238 BCP, 93 STD, 36 FYI —
and 450 member links**. Three findings that shaped it:

- Datatracker *does* have the subseries documents (`bcp14`, `std97`, `fyi36`), but
  their `title` is **empty**, so the 3 requests it would take to read them are
  useless. The display name is derived instead: `bcp14` → `BCP 14`
  (`ex:name`), which is also how RFC Editor labels them.
- `contains` covers 367 of the 376 rfc-index subseries; **9 BCPs are empty**
  (`is-also` with no members) and **6 subseries documents have no `contains`
  members** (`bcp83`, `bcp12`, `bcp113`, `bcp66`, `std1`, `fyi17`) — they are
  simply absent from the graph, and a citation to them would report
  out-of-catalog.
- All 450 targets are RFCs (no nesting), so `ex:hasSpecification` always points
  into the RFC Editor namespace, which the `specs` stage then describes.

The `specs` stage then adds `spec ex:series series` (+ `ex:seriesVersion` for
W3C when present) and does **not** repeat the series node.

---

## 4. Stable spec URLs and Specref as the interlingua

Local Specref checkout: `/home/elf-pavlik/code/interop/specref/` (JS server +
`lib/bibref.js` merge, `refs/*.json` sources, `schemas/reference.json` and
`schemas/linkml/specref.yaml`).

### 4.1 What Specref already gives us

- one id space across SDOs: W3C shortnames (`did-core`), RFCs (`rfc9110`),
  WHATWG/WICG/browser-specs ids, ISO/OGC/ETSI, curated `refs/biblio.json`
  (1,011 entries);
- `href` = canonical public URL: W3C `https://www.w3.org/TR/did-core/`,
  IETF `https://www.rfc-editor.org/info/rfc9110/` (with a curated
  `httpwg.org/specs/…html` override list inside `scripts/ietf.js`);
- `edDraft`, `versions` (8-digit keys, e.g. 83 for `did-core`, each with its own
  dated `href`), `versionOf`, `aliasOf` (`rfc0911` → `rfc911`, zero padding),
  `obsoletes`/`obsoletedBy`, `status`, `publisher`, `deliveredBy`, `rawDate`,
  `repository`;
- a URL→entry table: `prepareReverseLookup()` in `lib/bibref.js` indexes
  **normalized `href` and `edDraft`** (version entries folded to `versionOf`),
  exposed as `GET /reverse-lookup?urls=a,b`, plus `/bibrefs?refs=` and
  `/search-refs?q=`;
- `normalizeUrl()`: drop protocol, drop `www.`, drop trailing slash, lowercase.

Our TS port (`specref/matching.ts`) already implements `byHref`, `byEdDraft`,
`byId`, `byTitle` and a `normalizeUrl` that keeps path case. It matched
**844/845** W3C specs.

### 4.2 Strategy: canonical URL + alias set + URL families

1. **Identity = the canonical public document URL**, not the API URL.
2. Per spec, build an **alias set** from every source:
   - SDO API: shortlink / spec URL, dated version URIs, `editor-draft`,
     datatracker document URL;
   - Specref: `href`, `edDraft`, every `versions[*].href`;
   - observed citation targets (recorded in reports).
   Every alias maps to the same `ex:Specification` subject.
3. **Match order** (unchanged): normalized `href` → `edDraft` → Specref `id`
   (shortname / `rfcNNNN`) → title. First non-empty key is authoritative;
   multiple candidates = collision, reported, not silently resolved.
4. **URL families** (`specref/url-families.ts`, tested, following the existing
   "manual exception module" pattern) normalise SDO-specific URL shapes to one
   key:
   - W3C: `www.w3.org/TR/<short>/` ≡ `www.w3.org/TR/<YYYY>/<STATUS>-<short>-<YYYYMMDD>/`
     (dated → spec level) ≡ no-trailing-slash;
   - IETF RFC: `rfc-editor.org/rfc/rfc<N>(.html|.txt|.xml)` ≡
     `rfc-editor.org/info/rfc<N>` ≡ `datatracker.ietf.org/doc/rfc<N>` ≡
     `datatracker.ietf.org/doc/html/rfc<N>` ≡ `httpwg.org/specs/rfc<N>.html` ≡
     `doi:10.17487/RFC<N>` ≡ legacy `ietf.org/rfc/rfc<N>.txt`; zero padding
     normalised (`rfc0911` ≡ `rfc911`);
   - IETF draft: `ietf.org/archive/id/draft-X-NN.{html,txt,xml}` ≡
     `datatracker.ietf.org/doc/draft-X/NN/` ≡
     `datatracker.ietf.org/doc/html/draft-X-NN` → spec
     `https://datatracker.ietf.org/doc/draft-X/` + version node for `-NN`;
   - later: WHATWG/WICG/ISO/OGC families from `refs/*.json`.
8. **IETF-specific Specref caveats** (measured):
   - **46 RFCs** carry a curated `httpwg.org/specs/rfc<N>.html` href in
     `refs/ietf.json` instead of `rfc-editor.org/info/rfc<N>/`, so `href`
     matching misses them — the match must fall back to the Specref **id**
     (`rfc9110`), which equals our `ex:shortname`;
   - ids are lowercase (`rfc9110`) with **934 zero-padded aliases**
     (`rfc0001` → `rfc1`), so `ex:shortname` must be compared lowercase;
   - **subseries are not in Specref** (1 of 247 BCPs exists, a curated
     `bcp0072` leftover), so series nodes get no `ex:specrefId` and the derived
     `BCP 14` label stays the only name.
5. **`ex:specrefId` is the SDO-neutral spec key.** Also copy Specref
   `versions`/`versionOf`/`aliasOf` into the graph once versions exist
   (currently deliberately skipped).
6. Never invent a Specref id. Unmatched specs stay without `ex:specrefId` and
   are reported (today: 1/845 unmatched, 3 shared-shortlink exceptions in
   `specref/exceptions.ts`).
7. Determinism: implement the reverse-lookup locally from the downloaded
   Specref dump; do not call `api.specref.org` from inside Dagger stages.

### 4.3 Known caveats

- Specref lags its upstreams (its W3C source is `api.w3.org/specifications/…`,
  its IETF source is `rfc-index.xml`); our crawl is primary, Specref is the
  join layer.
- Specref has essentially **no Internet-Drafts** (IETF source is the RFC index),
  so draft specs will have no `ex:specrefId` until a draft source is added.
- Specref `href` for HTTP RFCs may be `httpwg.org/…` (curated override), while
  citations point at `rfc-editor.org/…` → the URL families table must map both.
- `www.rfc-editor.org` vs `www.ietf.org/rfc/…` legacy paths still resolve; both
  must normalise to the same key.

---

## 5. People and organisations

### 5.1 IETF answers the "stable ids" question — yes

- `person.id` (numeric, stable per record) — every `documentauthor` and
  `group/role` row points at one (`documentauthor.person` is never null).
- `person/email.address` (unique key, `primary`/`active` flags) — the only
  SDO-neutral person key that W3C hides.
- `person/alias` (144,780 names) — alternate spellings for the same person.
- `person/personextresource` (1,345) — `github_username`, `gitlab_username`,
  **`orcid`**, `webpage` → real cross-SDO join keys.
- Caveat: Datatracker has **duplicate person records** for the same human
  (historically created per submission); merges are manual and leave no alias
  row. Dedupe evidence = email + `person/alias` + name, plus our review map.

### 5.2 Identity-map changes (`w3c-api/identity.ts` → `catalog/identity.ts`)

Silo ids are **URNs**: `urn:ietf:group:<id>`, `urn:ietf:person:<id>`,
`urn:ietf:doc:<name>` (e.g. `urn:ietf:doc:rfc9110`,
`urn:ietf:doc:draft-ietf-httpbis-semantics`). The identity map uses the same
URN strings, so graph and map share one convention. `ex:siloId` stays a
**literal** (no SPARQL `STR()` / UI churn). W3C already uses
`urn:w3c:person:<id>` in the committed map, so only the IETF side is new.

| identifier | used by | notes |
|---|---|---|
| `urn:ietf:group:<id>` | IETF group | new (RDF only; groups are not identity-map entries) |
| `urn:ietf:person:<id>` | IETF person | new |
| `urn:ietf:doc:<name>` | IETF document | new (RDF only) |
| `urn:w3c:person:<id>` | W3C person | **current** in `data/identities.json` |
| `github:<numeric id>` | W3C person (`connected-accounts`) | current |
| `github-user:<login>` | W3C + IETF (`personextresource`) | **the only automatic cross-SDO person join** |
| `orcid:<id>` | IETF `personextresource` | strong, SDO-neutral |
| `urn:ietf:person-uuid:<uuid>` | `person/personuuid` (57,392 rows, primary UUID per person) | **candidate** cross-SDO/person key: opaque, non-PII, published by Datatracker — preferable to storing emails |
| `url:<url>` | both | current (provenance, e.g. API self link) |
| `homepage:<url>` | organisations | present in the map; curation deferred (see below) |

No plaintext email is ever stored here — matching by email happens in memory
during a run and in the gitignored emails dump (§5.4).

Organisations — **deferred** (user decision; nothing in `dump-ietf` v1 depends
on it):

- W3C: `resolveOrganization({ w3cAffiliationId, sourceUrl, homepage, name })`
  exists but is only used by the hand-curated `data/organizations.ttl`.
- IETF: `documentauthor.affiliation` is **free text per document** ("Adobe",
  "Fastly", "greenbytes GmbH"), and Datatracker has no organisation entity.
  Measured: 20,603 of 22,331 authorship rows carry an affiliation, with
  **3,536 distinct strings** (1,764 appear once; ≥10 occurrences = 347 strings =
  67 % of rows).
- v1 therefore emits `person ex:affiliationName "Adobe"` (literal) and writes a
  distinct-value report; no `ex:Organization` from free text.
- When picked up later: curated map (data file, not code) with
  `{name, homepage, aliases[]}`, resolving to `homepage:<url>` identities so the
  same organisation joins across SDOs. Do not auto-create organisations.

### 5.3 Cross-SDO person matching

Automatic: `github-user`/`github:`, then `orcid`. Manual: the existing
`author-map.ts` + identity review for everything else, with ambiguous/unmatched
reported per stage (same shape as today's author report).

### 5.4 Emails and person correlation (verified)

| source | has emails? | evidence |
|---|---|---|
| W3C API | **no** | user object = `id`, `name`, `given`, `family`, `connected-accounts`, `discr`, links (`affiliations`, `groups`, `specifications`, `participations`, `chair_of_groups`, `team_contact_of_groups`); no email field, no email sub-resource |
| Datatracker | yes, structured | `person/email` 69,537 (`address`, `primary`, `active`, `origin`), `documentauthor.email`, `group/role.email` |
| W3C list archives | yes, but unstructured | `lists.w3.org/Archives/Public/` is a static browser: per-list/month mbox + HTML; **no API**, `w3c-public-lists.xml` only indexes lists. Correlating `From:` headers to people is name/address heuristics over mbox files — follow-up, not v1 |
| GitHub API | conditionally | `GET /users/{login}` → `email: null` unless the profile email is public (verified: `mnot` → null). Commit objects do expose `commit.author.email` + `author.login` (verified: `mnot@mnot.net`), so a repo/commit pass is a viable bridge — follow-up |
| IETF `personextresource` | IDs, not emails | 1,345 rows: `github_username`, `github_org`, `gitlab_username`, **`orcid`**, `webpage` |

Design:

- `dump-ietf` fetches `person/email` and uses addresses **in memory only** for
  matching (e.g. resolving `documentauthor.email` to a `urn:ietf:person:<id>`);
- a separate Dagger function `dump-emails` reads `data/identities.json`, resolves
  `urn:ietf:person:<id>` → emails and writes `data/dump/emails.json` (gitignored
  via `data/dump/`), for manual review and future correlation;
- nothing in `data/identities.json` (committed) ever contains an address or a
  reversible hash;
- follow-ups: GitHub commit-email bridge for the 4,218 W3C people that already
  have a connected GitHub account; W3C mbox correlation only if needed.

---

## 6. Pipeline decomposition: one Dagger function per SDO + one cross step

### 6.1 Functions

```
dump-w-3-c        (exists)  -> data/dump/w3c
dump-ietf         (new)     -> data/dump/ietf
dump-ietf-references (new)  -> data/dump/ietf (references.json only)
dump-w3c-references  (new)  -> data/dump/w3c  (references.json only)
dump-emails       (new)     -> data/dump/emails.json
dump-cross        (new)     -> data/dump/cross
```

| function | inputs mounted | network | writes |
|---|---|---|---|
| `dumpW3c` | `data/dump/w3c` (seed), `data/dump` (read-only, cross-SDO group check), `data/identities.json` | api.w3.org, www.w3.org/TR, api.specref.org | `data/dump/w3c/*.nq`, `.log`, `citations-report.json`, `identities.json` |
| `dumpIetf` | `data/dump/ietf` (seed), `data/dump` (read-only), `data/identities.json` | datatracker.ietf.org, www.rfc-editor.org, api.specref.org | `data/dump/ietf/*.nq`, `.log`, `citations-report.json`, `authors-report.json`, `identities.json` |
| `dumpIetfReferences` | `data/dump/ietf` | datatracker.ietf.org/doc/html (4 req/s) | `data/dump/ietf/references.json` + checkpoint |
| `dumpW3cReferences` | `data/dump/w3c` | www.w3.org/TR (2 req/s, 429-aware) | `data/dump/w3c/references.json` + checkpoint |
| `dumpEmails` | `data/identities.json` | datatracker.ietf.org | `data/dump/emails.json` (gitignored) |
| `dumpCross` | `data/dump/w3c`, `data/dump/ietf`, `data/identities.json` | **none** | `data/dump/cross/refs.nq`, `cross-report.json` |

Rules that keep this clean:

- an SDO function resolves only **intra-SDO** citations; external targets are
  collected by that SDO's `*-references` function (one artifact, URL + nature +
  key) and left to `dumpCross`;
- `dumpCross` never fetches anything: it maps recorded reference URLs onto the
  other SDO's spec aliases (URL families + Specref id) and emits the edges;
- `devbox run seed` already globs `data/dump/<sdo>/*.nq`, so `cross` is picked
  up with no change; `scripts/stage-status.ts` needs per-SDO stage lists
  (`w3c`: 7 stages, `ietf`: 6 stages, `cross`: `refs`; `references.json` and the
  emails dump are optional and do not gate "all stages completed").

### 6.2 Order (must be documented in README and enforced by scripts)

Implemented order (mirrored in the README):

```
devbox run dump:w3c              # 1. W3C catalog stages        (Temporal)
devbox run dump:ietf             # 2. IETF catalog stages       (Temporal)
#     merge new identities from data/dump/<sdo>/identities.json into
#     data/identities.json  <- required before cross-SDO person joins appear
devbox run dump:w3c-references   # 3. optional, reference URLs  (plain, resumable)
devbox run dump:ietf-references  # 3b. optional, ~25 min       (plain, resumable)
devbox run dump:cross            # 4. needs both reference files, no network
devbox run seed [development|production]
```

`devbox run dump` stays an alias of `dump:w3c` (back-compat). `dumpCross` and
the `*-references` functions are deliberately **not** Temporal workflows: no
throttling contract, no retry semantics, and the references crawl needs its own
budget plus a resume checkpoint (`references.jsonl` in the stage dir), not
activity retries. `dumpEmails` is designed but not implemented (§5.4); there is
no `dump:all` — the four scripts are cheap to chain by hand and the references
crawls are optional.

### 6.3 `references.json` (new artifact, both SDOs)

```json
[{ "source": "https://www.w3.org/TR/did-core/",
   "sourceVersion": "https://www.w3.org/TR/2022/REC-did-core-20220719/",
   "key": "RFC7515", "nature": "normative",
   "url": "https://www.rfc-editor.org/rfc/rfc7515.html" }]
```

Written by the `*-references` functions (§6.1) — they record **every** extracted
entry that has a URL, for any SDO, so `dumpCross` never re-crawls and future
matching (e.g. RFC → later draft) reuses the same evidence. Schema:
`schema/spec-reference.schema.json` (§3.4).

**Implemented** (`typescript/src/catalog/references.ts` + the two crawlers):

- resumable: every finished document appends one JSON line to
  `references.jsonl`, so an interrupted sweep continues where it stopped and a
  rerun automatically retries only the failures;
- 429/5xx retried with backoff (honouring `Retry-After`, capped at 10 s);
  W3C answers 429 above ~2 req/s — measured 121/845 failures at 4 req/s, 0 at
  2 req/s plus retries;
- W3C: **836/845 documents, 12,110 URLs** (9 specs stayed 429 even at 1 req/s);
- IETF: 9,822/9,854 documents fetched, but only **1,370 documents yielded URLs**
  (30,262 URLs): structured `<references>` sections exist only for XML-derived
  RFCs — `rfc1`, `rfc2616`, `rfc2854` render text-derived HTML with no
  `name-*-references` anchors, so 8,452 old RFCs contribute nothing yet. Of the
  30,262 URLs, 189 point at `w3.org/TR/`.

**Cross-SDO result** (`data/dump/cross/refs.nq`, 240 KB):

| metric | value |
|---|---|
| edges | **2,011** — 1,951 W3C→IETF (from 602 W3C specs) + 60 IETF→W3C (from 1,370 RFCs) |
| nature | 1,522 normative + 489 informative |
| duplicates collapsed / conflicts | 8 / 0 |
| IETF unmatched | drafts (`draft-bhutton-json-schema` 8, `draft-irtf-cfrg-bbs-signatures-05` 3, SD-JWT 3) — drafts are out of v1 scope |
| W3C unmatched | exactly one shortname: **`/TR/xml` (38 references)** — XML 1.0 is missing from the W3C catalog because the per-group crawl misses 886 specs (§9.13) |
| non-W3C hosts in W3C docs | doi.org 981, iana.org 552, IEEE 268, itu.int 207, github 139, eprint.iacr.org 132, NIST 127 |

So the high-yield direction is W3C→IETF, and the IETF→W3C side is limited by how
many RFCs have structured references — improving that (text-derived RFCs, RFC
XML) is the follow-up with the biggest payoff.

---

## 7. IETF stages (mirroring the W3C stage names)

Stage order: `areas` → `series` → `groups` → `people` → `specs` →
`spec-people` → `citations`. `series` is described in §3.5 and is **IETF-only
for now** (the W3C one is deferred); the rest mirror the W3C stage names so
`stage-status.ts`, the seed order and the UI behave identically.

### 7.0 Fetch budget and stage order (one fetch per endpoint)

The ordering goal is that **no Datatracker endpoint is read twice** and each
read is narrowed to what the catalog keeps. What the group payload does *not*
contain drove most of it:

- a `group/group/` object has no members. It carries `used_roles` (role *names*
  only), `list_archive`, `list_email`, `list_subscribe`, `parent`, `type`,
  `state`. Members come from `group/role/`, one row per role assignment.
- a `group/role/` row has `person` (URI) + `email` + role name, **no person
  name**, so person records need a second read.
- `person/person/` is 57,365 rows (58 pages) but the catalog needs 6,280 people,
  so person reads are batched with `?id__in=` (~200 ids per request).

| stage | endpoint(s) | rows | requests |
|---|---|---|---|
| areas | `group/group/?type__slug=area` | 17 | 1 |
| series | `relateddocument?relationship__slug=contains` | 450 | 1 |
| groups | `group/group/`, `group/groupextresource/`, `name/grouptypename/` | 1,614 / 1,153 / 26 | 2 + 2 + 1 |
| people | `group/role/?group__state__slug=active` + `person/person/?id__in=…` (role holders) | 1,699 / 591 | 2 + 3 |
| specs | `doc/document?type__slug=rfc` + `rfc-index.xml` | 9,854 / 9,854 | 10 + 1 |
| spec-people | `doc/documentauthor?document__type__slug=rfc`, `person/person/?id__in=…` (authors), `person/personextresource/` (all), Specref dump; RFC index is memoised from `specs` | 22,331 / 6,121 / 1,345 | 22 + 31 + 2 + 1 |
| citations | `doc/relateddocument?source__type__slug=rfc` (refnorm/refinfo, plus refunk for the count) | 114,092 + 69 | 51 + 65 + 1 |
| **total** | | | **≈ 195** |

What this costs and what it avoids:

- `person/person` is the only endpoint two stages need. Roles touch 591 people,
  authorship 6,121, **432 are in both**, so the overlap costs ~3 batched
  requests instead of 58 paginated pages or a shared persons stage.
- `rfc-index.xml` is fetched once, by `specs`, and also supplies the `<draft>`
  provenance (draft → RFC), so `relateddocument?relationship__slug=became_rfc`
  (8,387 rows / 9 pages) is not fetched.
- `contains` for `series` is a 450-row slice of the same table `citations` pages
  through, with a different filter — no row is read twice.
- No reorder beyond the natural dependency chain is needed: authors are attached
  to specs by document *name* (`rfc9110` → `…/info/rfc9110/`), so `people` /
  `spec-people` do not have to wait for `specs` to be complete.

### 7.1 `areas.nq` → `data/dump/ietf/areas.nq`

First IETF stage (user decision), so `ex:parent` in `groups.nq` always resolves
and the UI has its chip list without querying group types.

Source: `group/group/?type__slug=area` (**17** rows, one request, one page).
Implemented; the stage currently publishes **170 quads** for 17 areas.

| predicate | value |
|---|---|
| `rdf:type` | `ex:Group` **and** `ex:Area` (one node, not two) |
| `ex:sdo` | `https://www.ietf.org/` |
| `ex:name`, `ex:shortname` | `name`, `acronym` (`art`, `gen`, `int`, `ops`, `rtg`, `sec`, `wit`, …) |
| `ex:siloId` | `"urn:ietf:group:<id>"` |
| `ex:ietfApiUrl` | `https://datatracker.ietf.org/api/v1/group/group/<id>/` |
| `ex:type` | literal `"Area"` (the filter already implies it) |
| `ex:state` | `groupstatename` slug: **7 active, 4 concluded, 6 unknown** (pre-1990 areas) |
| `ex:description` | full `description` when present |
| `ex:listArchive` | `list_archive` when set |

Subject is the public group page `https://datatracker.ietf.org/group/<acronym>/`.
Datatracker 302-redirects it to `…/about/`; the redirect target is a UI detail,
so the entry point stays the subject and `ex:ietfApiUrl` carries provenance.

Concluded and `unknown`-state areas are **kept**: they are the parents of
historic working groups (that is where most of the 9,854 RFCs come from), and
the UI can filter on `ex:state`.

`groups.nq` then emits `wg ex:parent area` and does **not** repeat the area
node. Areas still appear in group listing queries because they are typed
`ex:Group`; the UI can filter `ex:Area` for chips.

### 7.2 `groups.nq` → `data/dump/ietf/groups.nq`

Sources: `group/group/` (2 pages), `group/groupextresource/` (2 pages).

**Scope** (measured 2026-11-01): **every state** (active, concluded, BOF,
replaced, abandoned, proposed) and every type except the ones excluded below.
The only filter is client-side on `type`;
`?state__slug=active` is deliberately **not** used.

| type | total | states | in scope? |
|---|---|---|---|
| `area` | 17 | 7 active / 4 concluded / 6 unknown | stage 1 (`areas.nq`) |
| `wg` | 1,128 | 137 active / 991 inactive | yes |
| `team` | 54 | 21 active | yes (`tools`, `hackathon`, `ombudsteam`, …) |
| `rg` | 40 | 17 active | yes (parent `irtf`) |
| `review` | 15 | 14 active | yes (`secdir`, `artart`, …) |
| `ag` | 14 | 7 active | yes |
| `iabasg` | 10 | 5 active | yes (IAB ASGs) |
| `ietf` | 4 | all active (`ietf`, `secretariat`, `iesg`, `iab`) | yes |
| `adm` | 6 | 4 active | yes (LLC, IETF Trust) |
| `dir` | 11 | 4 active | yes (directorates) |
| `isoc`, `rfcedtyp` | 3 + 3 | all active | yes |
| `irtf`, `rag` | 2 + 2 | all active | yes |
| `program` | 14 | 1 active | yes (IAB programs) |
| `ise`, `edwg`, `iana`, `individ`, `edappr` | 1 each | all active | yes |
| **`sdo`** | **247** | | **no** — external liaison bodies (W3C, IEEE, ISO, ITU, 3GPP, OASIS…), not IETF groups |
| **`nomcom`** | **35** | | **no** — historical nominating committees |

→ **1,315 groups** in `groups.nq` (**14,349 quads**), plus the 17 areas from
stage 1: 1,332 group nodes and 14,519 quads in the two stage files.

State mix of the 1,315: **775 concluded, 236 active, 271 BOF-concluded, 19
replaced, 18 abandoned, 5 BOF, 2 proposed, 6 unknown**. Verified: no included
group has a parent outside {`areas.nq` ∪ `groups.nq`} — **1,200 get
`ex:parent`, 1,092 of them pointing at an area, 0 unresolved**.

**Why inactive groups matter:** RFCs are owned through `document.group`, and
the corpus is mostly historic. Measured over all 9,854 RFCs: 3,732 concluded
WGs, 2,615 active WGs, 2,232 `individ`, 609 active areas, 394 concluded areas,
138 `ietf`, 67 active RG, 49 concluded RG, 9 AG, 5 BOF groups, 3 edwg, 1 rag →
with every state included **all 9,854 RFCs can be linked to an owning group**;
an active-only filter would have left 4,180 unlinked.

**IRI hygiene (found here):** 8 groups carry prose in `list_archive`
(`mailto:snmpconf-request@snmp.com (index snmpconf in body)`,
`ftp ftp.3com.com (login: ptopo, passwd: ptopo)`, …). `new URL()` accepts the
opaque `mailto:` form, and the spaces made the published N-Quads unparseable.
`absoluteUrl()` now rejects any value with whitespace or `<>"{}|\^\``, and
`catalog/stages.ts` refuses to publish a stage containing an invalid IRI (a
net that also protects the W3C stages). Result: `ex:listArchive` on 758 groups,
no invalid IRIs.

| predicate | value |
|---|---|
| `rdf:type` | `ex:Group` |
| `ex:sdo` | `https://www.ietf.org/` |
| `ex:name`, `ex:shortname` | `name`, `acronym` |
| `ex:type` | `verbose_name` from `name/grouptypename` (`Working Group`, `Review Team`, `Area Group`, `An Individual`, …) |
| `ex:state` | `groupstatename` slug |
| `ex:siloId` | `"urn:ietf:group:<id>"` |
| `ex:parent` | parent URI, only when the parent is in `areas.nq` or this stage |
| `ex:homepage` | `webpage` ext resource (161 groups) |
| `ex:githubOrg` | `github_org` ext resource (80 groups, e.g. `https://github.com/httpwg/`) |
| `ex:wiki` | `wiki` ext resource (315 groups) |
| `ex:listArchive` | `list_archive` when it is a valid IRI (758 groups) |
| `ex:ietfApiUrl` | `https://datatracker.ietf.org/api/v1/group/group/<id>/` |

Invariants: one public homepage per group (duplicate → fail), no homepage
already used by another SDO (reuse `existingGroupUris()`), `ex:parent` must
resolve to an area node published by `areas.nq` (previous stage). Expected:
1,597 groups, ~18 k quads.

### 7.3 `people.nq` → `data/dump/ietf/people.nq`

Sources: `group/role/` (5 pages) and `person/person/` for the role holders.

| statement | from |
|---|---|
| `group ex:member person` | every `group/role` row (all role slugs) |
| `group ex:role literal` | role slug, next to the membership edge |
| `person ex:name` | `person.name` |
| `person ex:siloId "urn:ietf:person:<id>"` | `person.id` |
| `person ex:siloUsername "github:<login>"` / identifier `orcid:<id>` | `person/personextresource` |
| `person ex:logo` | `photo_thumb` when set |
| `person ex:ietfApiUrl` | person resource URI |

**Roles are the only person↔group relation Datatracker has.** Verified
2026-11-01: a `group/group/` object carries `used_roles` (role *names*) but no
members, and the `group` app exposes no membership resource (`role,
rolehistory, grouphistory, groupextresource, groupfeatures, groupurl,
groupmilestone*, groupstatetransitions, appeal*`). Across all groups and
states: **4,477 role assignments, 1,251 unique persons** —

```
chair 2,099 · ad 758 · reviewer 509 · member 490 · techadv 122 · secr 114
liaiman 93 · delegate 80 · liaison 75 · lead 33 · editor 20 · auth 16 · advisor 15
wikiadmin 11 · matman 10 · leadmaintainer 6 · recman 6 · liaison_coordinator 4
yc_operator 4 · exofficio 3 · ceo 2 · robot 2 · yc_admin 2 · comdir 1 · coord 1 · execdir 1
```

The `member` slug (490) belongs to bodies that record their roster as roles
(IAB/IESG/teams/nomcom-style), **not to working groups**: a WG has 1–3 chairs
and maybe an AD or secretary. So IETF `ex:member` means "role holder" while
W3C's means "participant" — a real semantic asymmetry for the UI. Document
authorship is created by the `spec-people` stage (§7.5), exactly like W3C
editors are.

#### Participation signals that exist (deferred, not implemented)

If we ever want something closer to W3C participants, these are the only
options, and they are *proxies*, not membership:

| source | rows | gives | cost |
|---|---|---|---|
| `meeting/attended` | 191,265 | person ↔ session; sessions carry `group` (15,528 sessions) → "people who attended this group's sessions" | ~208 requests (192 + 16 pages) |
| `meeting/registration` | 75,424 | per-meeting attendance with `affiliation`, `email`, `country_code`, in-person/remote ticket | ~76 requests |
| mailing lists | — | no subscriber API (Mailman admin only); archives are messages, not membership | n/a |

Both attendance tables cost more than the entire rest of the crawl (~199
requests), so they would be their own optional stage (`attendance`) after the
core pipeline works. `meeting/registration.affiliation` is also the most
structured affiliation source available, relevant to the deferred organisation
work (§5.2).

No email is ever emitted as RDF (§5.4).

Expected: 4,477 role edges over 1,251 persons, ~15–20 k quads.

### 7.4 `specs.nq` → `data/dump/ietf/specs.nq`

v1 scope (user decision): **RFCs only**, no active drafts.

Sources: `doc/document?type__slug=rfc` (10 pages) for `ex:ietfApiUrl`, `group`,
`stream`, `std_level`, `rfc_number`, `pages`, `keywords`; `rfc-index.xml`
(or Specref, which is generated from it) for authoritative published metadata —
`title`, `current-status`, `stream`, `date`, `obsoletes`/`obsoletedBy`,
`updates`/`updatedBy`, `is-also`, `errata-url`, `doi`, `<draft>`; plus the
`bcp-entry`/`std-entry`/`fyi-entry` subseries.

| subject | predicate | value |
|---|---|---|
| `https://www.rfc-editor.org/info/rfc<N>/` | `rdf:type` | `ex:Specification` |
| | `ex:sdo` | `https://www.ietf.org/` (single value per D2) |
| | `ex:name` | index `title` |
| | `ex:shortname` | `rfc<N>` |
| | `ex:landingPage` | `https://www.rfc-editor.org/info/rfc<N>/` (same as Specref `href`) |
| | `ex:status` | index `current-status` (`INTERNET STANDARD`, `PROPOSED STANDARD`, …); `bibo:status` is added by the Specref import |
| | `ex:stream` | index `stream`: IETF 7,261 · Legacy 1,893 · INDEPENDENT 435 · IAB 134 · IRTF 128 · Editorial 3 |
| | `dcterms:date` | `YYYY-MM` (or `YYYY-MM-DD`) from the index date |
| | `bibo:pages` | index `page-count` (same predicate the W3C Specref import uses) |
| | `ex:doi`, `ex:errata` | `10.17487/RFC<N>` literal, errata URL |
| | `ex:ietfApiUrl` | `https://datatracker.ietf.org/api/v1/doc/document/rfc<N>/` |
| | `ex:draft` | `https://datatracker.ietf.org/doc/<draft-name>/`, revision stripped (`…-semantics-19` → `…-semantics`) |
| | `ex:obsoletes` / `ex:obsoletedBy` / `ex:updates` / `ex:updatedBy` | spec IRIs (not literals, unlike the current Specref import) |
| group | `ex:specification` → spec | from `document.group`, resolved against `areas.nq` + `groups.nq` |
| spec | `ex:series` → series | read from `series.nq` (reverse of `ex:hasSpecification`), no second `contains` call |

**Implemented** (136,976 quads, `specs.nq` 14.7 MB): 9,854 RFCs, **9,854
group→spec links (none missing)**, 450 series links, 8,387 `ex:draft` (the
other 1,467 predate `<draft>` provenance), 1,543 `ex:obsoletes` / 1,543
`ex:obsoletedBy` and 2,163 `ex:updates` / 2,163 `ex:updatedBy` (symmetric, so
the joins are sound). Status/stream/date on every spec; 0 RFCs missing from the
index.

Implementation notes:

- the 13.7 MB index is parsed with **cheerio in `xmlMode`** (already a
dependency, ~256 ms, ~180 MB heap) — no XML parser dependency added;
- documents are joined to the index by **RFC number**, not by name, so `RFC0911`
  / `rfc911` padding differences cannot split a record;
- group ids resolve against the published stage files (`areas.nq`, `groups.nq`),
  so no extra API call and no dangling `ex:specification`;
- 574 of the 1,332 group nodes own at least one RFC; the `individ` pseudo-group
  (`…/group/none/`) carries 2,232 RFCs.

This is the completeness advantage over the W3C path: IETF documents carry their
owning group, so every RFC ever produced is attached, while the W3C crawl gets
deliverables from a per-group endpoint that only lists current items (886 of
1,721 specs missed).

### 7.5 `spec-people.nq` → `data/dump/ietf/spec-people.nq`

Sources: `doc/documentauthor` for RFC docs (22 pages), `rfc-index` `<author>`
(which marks `<title>Editor</title>`), the Specref dump, existing identity map.

- ordered authorship rows → `bibo:editor` when the RFC index marks that author
  as Editor, otherwise `dcterms:creator` (keeps W3C's two-predicate split:
  version editors vs bibliography authors);
- the author person records are created here (the `people` stage only covers
  role holders), with `ex:name`, `urn:ietf:person:<id>`, `ex:ietfApiUrl`,
  `github:`/`orcid:` identifiers and `ex:affiliationName` literals
  (organisations deferred, §5.2);
- Specref linking reuses `specref/link.ts` unchanged (`shortlink`→`href`,
  `edDraft`, `id`→`rfc9110`, title) and imports the same predicate set;
- `ex:specrefId` becomes the cross-SDO spec key.

#### Editors: what exists and where (measured 2026-11-01)

There is **no editor flag in Datatracker**. The two sources split the job:

| source | gives | coverage |
|---|---|---|
| `doc/documentauthor` (22,331 rows) | ordered `person` URIs + `affiliation` + `email`; **no editor flag, no names** | 8,599 RFCs |
| `rfc-index.xml` `<author>` (24,317 entries) | ordered **names** + `<title>Editor</title>`; no person ids | all 9,854 RFCs |
| `submit/submission.authors` (168,792 rows) | draft-submission `{name, email}` | no editor flag; adds nothing over the two above |

Numbers: **2,124 editor-flagged author entries across 1,486 RFCs** (15 %); the
other 22,193 author entries are plain authors. 8,530 RFCs have identical author
counts in Datatracker and the index, **69 differ** (authors added/removed at
publication), and **1,255 RFCs have no `documentauthor` rows at all** (pre-
Datatracker RFCs) — those exist only as names in the index.

**Specref (the local checkout) also carries the editor flag**: `refs/ietf.json`
keeps the index title as a suffix, `"R. Fielding, Ed."` — **1,484 entries** with
an `, Ed.` author, matching the index's 1,486 RFCs. It is generated *from* the
same index (`scripts/ietf.js`), so it adds no information, but it means:
- if `specs` ever drops the 13.7 MB index fetch, editor flags survive in Specref
  (already downloaded for `ex:specrefId`);
- **RFC 8446 is not flagged in either source** (`E. Rescorla`, no `Ed.`), i.e.
  missing editor flags are upstream data, not a parsing bug — 85 % of RFCs
  simply have no editor marker;
- Specref carries **no person ids**, so it cannot replace `documentauthor` for
  linking people, and its W3C entries have authors but no editor distinction
  (W3C editors come from the API `versions/<date>/editors`).

Resolution strategy (**no literals**, user decision 2026-11-01):

1. position-match index authors to `documentauthor.person` when the counts are
   equal (8,530 RFCs, no name lookup needed);
2. otherwise match by surname + first initial (69 RFCs) and report the pairing;
   an author that cannot be matched confidently is **skipped**, never written as
   a literal;
3. the **1,255 RFCs without `documentauthor` rows get no author/editor edges at
   all** (1,892 name strings, 694 distinct, 47 editor-flagged) and are listed in
   `authors-report.json` for the semi-manual pass below;
4. the editor flag from the index decides `bibo:editor` vs `dcterms:creator`;
   `documentauthor.person` decides the subject whenever it exists.

Consequences:

- every `bibo:editor` / `dcterms:creator` object in the IETF graph is a person
  IRI, so no query has to check `isLiteral`;
- **13 % of RFCs (1,255) show no authors/editors** until the semi-manual pass
  lands — mostly pre-1990 documents;
- the IETF stage must **not** reuse `specref/link.ts`'s author quads: Specref
  authors are name strings, and importing them would reintroduce literals. Only
  the non-author Specref metadata (`ex:specrefId`, `bibo:status`, `bibo:uri`,
  `dcterms:date`, `bibo:obsoletes`/`obsoletedBy`, `schema:codeRepository`) is
  imported for IETF. This is a deliberate asymmetry with W3C, which keeps
  literal authors for its few unmatched Specref authors (0 in the current dump).

`person/ad`, `person/shepherd` links on the document are role enrichment, not
authorship, and are not part of this stage.

**Implemented** (`spec-people.nq`, 118,506 quads):

| metric | value |
|---|---|
| author/editor edges | **22,324** = 20,252 `dcterms:creator` + 2,072 `bibo:editor` |
| non-IRI edge objects | **0** |
| person nodes | 6,120 (125 with a GitHub account, 18 with ORCID, `ex:affiliationName` literals) |
| RFCs with persons | 8,598 |
| RFCs without persons (reported) | 1,255 |
| index authors skipped (absent from Datatracker) | 101 |
| `ex:specrefId` / `bibo:status` | 9,854 / 9,854 — **100 %**, the 46 httpwg `href`s resolve through the Specref id |

The 101 skipped names are a Datatracker data gap, not a matcher problem:
RFC 898 has 3 `documentauthor` rows but 4 index authors (`M. Muuss` was never
linked), likewise RFC 823/908/1240. They land in `authors-report.json`
alongside the 1,255 legacy RFCs.

`spec-people` writes `data/dump/ietf/identities.json` (6,121 pending people);
merge it with `STAGES_DIR=data/dump/ietf devbox run identities` — the merge
script already honours `STAGES_DIR`.

#### TODO: semi-manual author resolution (1,255 RFCs)

Goal: give the remaining 1,892 author-name strings a URL/IRI. Sketch of the
process, to be scheduled after `citations`:

1. `spec-people` writes `data/dump/ietf/authors-report.json` (gitignored):
   per-RFC unresolved names, editor flags and the RFC number.
2. `scripts/resolve-authors.ts` (new, patterned on
   `scripts/confirm-duplicates.ts`) groups the 694 distinct names by surname
   (**625 surnames**) and queries Datatracker per surname:
   - `person/person/?name__icontains=<surname>` — works, returns full names
     (verified: `Postel` → `Dr. Jon Postel`);
   - `person/alias/?name__icontains=<surname>` — alternate spellings such as
     `ZZ. Stephen D. Crocker` / `Jon Postel`; the alias table holds some initials
     variants the index uses, but an exact `?name=S. Crocker` returns **0 rows**,
     so there is no fully automatic path;
   - output `data/dump/ietf/author-review.json`: per unresolved name the
     candidate persons (id, current name, aliases, RFC count, sample titles)
     for a human decision.
3. Decisions are committed as **`data/ietf-author-map.json`** (curated data,
   reviewed like `data/identities.json`):
   `{ "<rfc>": { "<index name>": "urn:ietf:person:<id>" } }`, plus an optional
   name-level fallback for names that are unambiguous across RFCs.
4. `spec-people` reads the map and emits the missing edges on a rerun; coverage
   is reported as `resolved / 1,892` names and `resolved / 47` editors.
5. Fallbacks when Datatracker has no record: ORCID search API, Wikidata, or RFC
   Editor author pages. Those would need minted person identities — decide then.

This mirrors the established `specref/author-map.ts` + `data/identities.json`
review workflow, so no new tooling concept is introduced.

### 7.6 `citations.nq` → `data/dump/ietf/citations.nq`

Primary source: `doc/relateddocument?source__type__slug=rfc` with
`relationship__slug=refnorm|refinfo` (~51 + 65 pages).

- `source` → spec (RFC), `target` → spec (RFC / subseries / draft);
- `refnorm` → `ex:normativeRef`, `refinfo` → `ex:informativeRef`;
- targets that are subseries (BCP/STD/FYI) resolve to the **series node and**
  fan out to its member RFCs (D4) — both edge sets are emitted;
- targets outside the catalog (expired drafts, etc.) are reported as
  out-of-catalog, no edge;
- self-references skipped; duplicates removed (the table keeps one row per
  reference instance, so the same pair repeats many times: **10,505 rows
  collapsed**); a target present in both relationships stays normative;
- **no SPARQL writes and no delete/insert**: unlike W3C this stage only writes
  the stage file, so idempotency comes from the stage-file model — delete
  `citations.nq` to recompute from scratch. `refunk` (69 rows, "possible
  reference", nature unknown) is counted in the report but never becomes an
  edge.

External (cross-SDO) references are **not** parsed here — they come from
`dumpIetfReferences` (§6.1, plain container, resumable), which reads
`https://datatracker.ietf.org/doc/html/<name>` and writes
`data/dump/ietf/references.json`, including `refunk` as `nature: "unknown"`.
Reason (measured on RFC 9110 with the fixed extractor): the rendered references
sections hold **83 entries, 81 of them with a URL — 73 rfc-editor.org and 8
external** (DOI, IEEE, arXiv, OWASP, WHATWG); Datatracker `relateddocument` has
71 targets for the same document. So both sources are near-complete for IETF
targets and Datatracker stays authoritative for the *nature* (it is curated,
not scraped); the HTML pass adds the external URLs Datatracker cannot represent.
An earlier note in this plan claimed "41 of 83 entries carry a link" — that was
a `dt`/`dd` pairing bug in the analysis script, not the data. RFC XML
(`rfcNNNN.xml`, 1,390 docs) stays an optional cross-check.

**Implemented** (`citations.nq`, 128,186 quads, 15.7 MB):

| metric | value |
|---|---|
| edges | **128,186** = 58,674 `ex:normativeRef` + 69,512 `ex:informativeRef` |
| source specs | 8,508 (out of 9,854) |
| distinct targets | 8,007 = 7,715 RFCs + 292 subseries nodes |
| subseries fan-out | 22,853 member edges |
| duplicates collapsed | 10,505 · self references 52 · conflicts 0 |
| out-of-catalog | 1,899 targets / 3,032 rows (e.g. `bcp66` 49, `std1` 28, `draft-ietf-pce-pcep-yang` 28) |

Per-document counts and the out-of-catalog list live in `citations-report.json`
(1.2 MB, gitignored).

### 7.7 Later: active drafts

Out of scope for v1, designed for: `doc/document?type__slug=draft` filtered by
active I-D state (44,269 drafts total; only active ones), revisions from
`dochistory`, `ex:publishedAs` links to RFCs. Would add a `drafts` stage file
and roughly 10× the citations rows (`refnorm` from drafts alone is 199,546).

---

## 8. Worker language: TypeScript now, Python where it pays

The user's question: we can mix SDKs, should we use the Python `ietfdata`
client?

| criterion | Bun/TS worker | Python worker (`ietfdata` + Temporal Python SDK) |
|---|---|---|
| request volume needed | ~200 paged requests, a few minutes | same, but `ietfdata` is optimised for *local archives*, not paging |
| access layer | our own fetch + `meta.next` pagination | `DTBackendLive` (discouraged for bulk), `DTBackendArchive` (~2 GB, ~24 h), no Postgres backend (psycopg declared, unused) |
| RDF/report code | reuses `n3`, `sanitizeNQuads`, store helpers, stages, identity, Specref, citation report | would duplicate or shell out |
| typed Datatracker models | hand-written (small) | pydantic models for every resource (real value) |
| RFC XML / xml2rfc parsing | needs an XML parser | `ietfdata` already models RFC XML |
| mailing lists / IMAP | no | yes (`imapclient`) |
| tooling | already in devbox/Dagger | adds `uv`/python toolchain + a second container |

Recommendation:

1. **Crawl in TypeScript** (`typescript/src/ietf-api/`), same pattern as
   `w3c-api/`, own task queue `ietf` registered in `worker.ts`. The volume is
   small and 90 % of the supporting code already exists.
2. **Keep the door open for a Python worker** on a *separate task queue*
   (`ietf-xml`) for: RFC XML `<references>`/`<referencegroup>` extraction
   (1,390 docs), mailing-list archive ingestion, and bulk analysis from the
   nightly `datatracker-db` image. Concrete composition, all already supported
   by Temporal:
   - Python worker image: `python:3.13-slim` + `uv sync --frozen`
     (`ietfdata`, `temporalio`), entry `python -m ietf.worker`,
     `TEMPORAL_ADDRESS=temporal:7233`, task queue `ietf-xml`;
   - `client.ts` stays TypeScript: `client.workflow.execute('<pythonWorkflowName>', { taskQueue: 'ietf-xml' })`
     works across SDKs because both sides use the default JSON data converter;
   - the Dagger `dumpIetf` function binds the extra worker only for the stage
     that needs it.
3. **Language-neutral contract** so either worker can produce a stage:
   stage file names, `ex:` vocabulary, `citations-report.json`,
   `references.json` and `identities.json` are all plain files whose schemas
   move into `schema/*.schema.json` (§3.4).

---

## 9. W3C changes required (prerequisites + symmetry)

Small individually, but they gate a second SDO and they are what makes the two
pipelines comparable:

1. `catalog/store.ts` (move `postNQuads`, `postUpdate`, `queryRows`,
   `batchNQuads`, `seedBase`, `sanitizeNQuads` usage out of `w3c-api/activities.ts`).
2. `catalog/stages.ts` (stage registry parameterised by SDO + stage list;
   `existingGroupUris()` unchanged).
3. `catalog/identity.ts` (identifier families of §5.2; W3C-specific
   `canonicalW3cId` stays in its own module).
4. SDO-scope every spec query: `fetchStoreSpecifications`,
   `fetchCatalogSpecifications` → add `?spec ex:sdo <sdo>`.
5. `citations/urls.ts` → `citations/targets.ts` with a per-SDO matcher registry
   (`w3c` TR, `ietf` RFC/draft); `CatalogSpec.latestVersionUrl` becomes optional
   and SDO-agnostic (`latestVersionUrl?`).
6. Record **all** skipped reference URLs in the run report (not just a count);
   the reusable `references.json` evidence comes from `dumpW3cReferences`
   (§9.16).
7. `ui/src/worker/catalog.ts`: read `ex:apiUrl`/`ex:ietfApiUrl`/`ex:w3cApiUrl`;
   rename `W3cGroup`/`W3cParticipant` → `Group`/`Participant`; `parseW3cId`
   becomes `parseSiloId(prefix)`.
8. `scripts/stage-status.ts`: per-SDO stage lists; `data/dump/cross/refs.nq`.
9. README: run order, new artifacts, new devbox scripts.
10. Identities are **done**: `data/identities.json` already carries
    `urn:w3c:person:<id>` identifiers (14,235 people + 1 org). Each SDO function
    dumps only entries that matched nothing; document that a merge between SDO
    runs is what makes cross-SDO person/org joins appear.

W3C-side symmetry work — **all deferred** (none of it is needed for
`dump-ietf`; revisit before or when the W3C dump is next rebuilt):

11. `ecosystems` stage, first W3C stage (mirror of IETF `areas`). `GET /ecosystems`
    returns exactly the 9 chips currently hardcoded in `sdos.json`; each has
    `groups`, `evangelists`, `member-organizations` (verified for `advertising`:
    5 groups, 1 evangelist, 53 organisations). Emit `ex:Ecosystem` + `ex:group`
    + `ex:evangelist` + `ex:memberOrganization`.
12. `series` stage (§3.5). `GET /specification-series` → 1,495
    `ex:SpecificationSeries`; `specs` adds `ex:series` (1,721) and
    `ex:seriesVersion` (702). Same stage name and shape as the IETF one.
13. Spec completeness: crawl `/specifications` (1,721) instead of only
    `/groups/<id>/specifications` (845). The global list has no group→spec link,
    so keep the per-group crawl for `ex:specification` edges and union it with
    the global list (886 specs are currently missing).
14. Affiliations, participations and roles: W3C exposes per-user `affiliations`,
    `participations`, `chair-of-groups`, `team-contact-of-groups` and
    `/affiliations` (18,002, each with `name`, `discr`, `is-member`, `homepage`).
    Emit `person ex:affiliation org` + `ex:role` — same shape as the deferred
    IETF organisation work (§5.2).
15. External references: `dumpW3cReferences` recording non-TR targets (today they
    are only counted as `skippedNonW3c`), feeding `dumpCross`.
16. `sdos.json` `sections` removal: W3C ecosystems and IETF areas come from the
    graph; the Linux Foundation "Foundations" cards have no dump source
    (curated TTL or drop).

---

## 10. Risks

| risk | mitigation |
|---|---|
| Datatracker API changes (tastypie is legacy) | pin shapes in fixtures + tests; the nightly DB image is the fallback |
| **tastypie's default page order is unstable** | every paged sweep sends `order_by=id`. Measured on `refinfo`: 64,050 rows swept without it gave only **42,002 distinct ids** (22,048 duplicated, 22,048 silently missed) — citations went from 84,133 to 128,186 edges after the fix. Name tables reject `order_by=id` and are single-page. |
| 114 k citation rows per run | page at `limit=1000`, sequential, UA identifying the project; ~60 MB |
| 1,255 RFCs (13 %) have no person-linked authors; 101 more authors are missing from Datatracker | no literals: those ship without edges, listed in `authors-report.json`; semi-manual map in the §7.5 TODO |
| duplicate IETF person records | identity review + `person/alias` + `personuuid`; report duplicates by normalised name |
| free-text affiliations | literals in v1, curated organisations only; 3,536 distinct strings (≥10 occurrences = 347 strings = 67 % of authorship rows) when the curation lands |
| draft renames | not exposed as aliases by the API; RFC is the stable anchor, draft URLs are recorded as-is |
| IETF spec count (9.9 k) vs W3C (845) skews UI listings | `?sdo=` filter already scopes listings; verify pagination/perf on specs, people and citations |
| citations on spec vs version | keep spec-level (latest) for both SDOs now; version nodes exist for the later migration |
| two SDO stages querying one store | scope all spec queries by `ex:sdo` (§9.4) |
| cross-SDO joins need a merge between runs | document the order (§6.2); pin a reminder in `stage-status`/README, not in code |
| external-reference crawls are slow (~40 min, 2.5 GB for IETF) | they are separate plain-container functions with a resume checkpoint, never part of `dump:ietf` |
| external URLs from Datatracker are not always URLs | `absoluteUrl()` rejects whitespace/`<>"{}|\^\``; `catalog/stages.ts` refuses to publish a stage with an invalid IRI (8 `list_archive` values are prose) |

---

## 11. Task breakdown

| # | task | acceptance |
|---|---|---|
| P0 | `catalog/{store,stages,identity}.ts` extraction; SDO-scoped spec queries; citation URL-family registry; `references.json`; per-SDO `stage-status` | existing `dump:w3c` output unchanged (118,025 quads, same file set); `bun test` green |
| P1 | extend identifier families (`urn:ietf:*`) in `catalog/identity.ts` | IETF people resolve to `urn:ietf:person:<id>`; existing `urn:w3c:*` / `github*` entries untouched; `assertUnique` passes |
| P2a | `areas` stage + `ietf` Temporal queue + `dump-ietf`/`dump:ietf` wiring — **done** | 17 areas, 170 quads; rerun skips (`areas.nq already exists`); a failed fetch leaves `areas.log` and no `.nq` |
| P2b | `groups` stage — **done** | 1,315 groups (every state, every type except `sdo`/`nomcom`), 14,349 quads, 1,200 `ex:parent` edges (0 unresolved), `ex:type`/`ex:state`, homepage/GitHub/wiki/listArchive ext resources; rerun skips |
| P3a | `series` stage — **done** | `series.nq`: 367 series (238 BCP / 93 STD / 36 FYI), 450 member links, 2,652 quads; labels derived from document names; rerun skips |
| P3b | `specs` stage — **done** | 9,854 RFCs, 9,854 `ex:specification` links (0 missing groups), 450 `ex:series`, 8,387 `ex:draft`, symmetric `ex:obsoletes`/`ex:updates` joins, 136,976 quads |
| P3c | `spec-people` stage — **done** | 22,324 edges, 0 literal objects, 6,120 persons, Specref 9,854/9,854, `authors-report.json` lists 1,255 RFCs without persons + 101 authors missing upstream |
| P4 | `citations` stage — **done** | 128,186 edges (58,674 normative / 69,512 informative), 22,853 subseries fan-out edges, 1,899 out-of-catalog targets reported, `order_by=id` on every paged sweep, idempotent via stage file |
| P4b | `dumpIetfReferences` + `dumpW3cReferences` — **done** | resumable checkpoint, 429-aware retries, 12,110 W3C URLs / 30,262 IETF URLs; `dumpEmails` still pending |
| P5 | `dumpCross` Dagger function + `cross/refs.nq` + report — **done** | 2,011 cross edges (1,951 W3C→IETF, 60 IETF→W3C), no network, runs in ~2.5 s inside the container |
| P6 | Dagger + devbox wiring — **done** | `dump:ietf`, `dump:w3c-references`, `dump:ietf-references`, `dump:cross` all run; README documents the order; `seed` picks up `data/dump/*/*.nq` including `cross` |
| P7 | **deferred**: W3C series/version layer, W3C ecosystems stage, affiliations (§9.11–9.14) | not required for `dump-ietf`; revisit before the next W3C rebuild |
| P8 | UI: SDO-neutral provenance/type rendering; verify IETF listings/detail — **not started** | `?sdo=https://www.ietf.org/` shows groups (with area parent), RFCs, people, references; `ex:ietfApiUrl` read alongside `ex:w3cApiUrl` |

---

## 12. Decisions

Decided (2026-11-01, this session):

| # | decision |
|---|---|
| D1 | v1 scope = RFCs only; active drafts are a later stage |
| D2 | one `ex:sdo` value per SDO — `https://www.ietf.org/` for all Datatracker content; `ex:stream` keeps IRTF/IAB/ISE distinguishable |
| D3 | RFC subject = `https://www.rfc-editor.org/info/rfc<N>/` (trailing slash; without it → 301) |
| D4 | one `ex:SpecificationSeries` schema for both SDOs (§3.2); `ex:seriesVersion` optional and spec-side; IETF fan-out to member RFCs is a citation *resolution policy*, not a schema difference |
| D5 | `areas` is the **first** IETF stage; the symmetric W3C `ecosystems` and `series` stages are designed but **deferred** (§9.11–9.12) |
| D6 | silo ids are URNs: `urn:ietf:group:<id>`, `urn:ietf:person:<id>`, `urn:ietf:doc:<name>`, kept as literals; W3C already uses `urn:w3c:person:<id>` |
| D7 | `ex:ietfApiUrl` alongside `ex:w3cApiUrl` |
| D8 | only `data/identities.json` is shared; each SDO function dumps only identities that matched nothing; a merge between runs is what enables cross-SDO joins |
| D9 | emails are never committed: in-memory matching during a run + gitignored `data/dump/emails.json` via `dump-emails` |
| D10 | external references are their own plain-container Dagger function(s), not a Temporal activity |
| D11 | affiliations are **deferred**: v1 emits `ex:affiliationName` literals + a distinct-value report; organisation nodes via `homepage:<url>` come later |
| D12 | `refunk` ("Possible Reference", 69 rows) gets no edge — recorded as `nature: "unknown"` in `references.json` |
| D13 | IETF group scope = **every state** (active, concluded, BOF, replaced, abandoned, proposed), every type except `sdo` (247 external liaison bodies) and `nomcom` (35 historical committees) → 1,315 groups; areas are their own first stage. All states are required so that RFCs from concluded WGs keep their `ex:specification` link |

Blocking for `dump-ietf`:

1. ~~Group scope~~ — decided (D13): 1,315 groups, all types except `sdo` and
   `nomcom`.

Deferred with the W3C work (§9.11–9.16) — must not block `dump-ietf`:

2. W3C series node subject: `https://api.w3.org/specification-series/<s>`
   (dereferenceable, proposed) or `urn:w3c:series:<s>`.
3. Affiliation curation file (format/location) and whether W3C
   affiliations/participations/roles are crawled in the same pass.
4. LF "Foundations" cards: curated TTL or drop.

Non-blocking, decide during implementation:

5. Citations granularity: spec-level edges (proposed) vs version-level later.
6. Python worker: adopt the `ietf-xml` queue now or when a stage needs it.
