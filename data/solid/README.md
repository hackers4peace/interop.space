# Solid data

Catalog data for the **Solid Project** SDO and its specifications.

Snapshot: **2026-11-23**.

## Files

| File | Contents |
| --- | --- |
| `groups.ttl` | Adds the Solid scope to the existing Solid Community Group and links its Technical Reports |
| `specs.ttl` | The 26 Technical Reports listed on <https://solidproject.org/TR/> |

## Shared Solid Community Group

The Solid Community Group is a common group of W3C and the Solid Project. The
W3C crawl already supplies the group record at
`<https://www.w3.org/community/solid/>` with its name, shortname, W3C API link
and members. This directory does not duplicate that record; it adds only:

```turtle
<https://www.w3.org/community/solid/> ex:sdo <https://solidproject.org/> .
```

The group therefore appears in both `?sdo=https://www.w3.org/` and
`?sdo=https://solidproject.org/` listings, with one shared roster.

## Specifications

Source: <https://solidproject.org/TR/> (snapshot 2026-11-23).

The W3C API does not publish the Solid Community Group's Technical Reports, so
the work items on the TR page are curated here. The page lists 26 Technical
Reports plus two Test Suites. The test suites are infrastructure, not
specifications, and are excluded. Notification channel types appear both in the
Technical Reports table and in a separate channel-type table; each is recorded
once.

Each record carries:

- `ex:sdo <https://solidproject.org/>`;
- `ex:name`, `ex:shortname`, `dcterms:publisher`;
- `ex:landingPage` for published TRs and `ex:editorDraft` for editor's drafts;
- `dcterms:date` and `bibo:status` from the published page and the TR table;
- `dcterms:source` for the repository and `ex:source` for the TR index.

### Using W3C data

The group record, its members and the editors' person identities come from the
W3C crawl. Editors are linked with `bibo:editor` only when an exact person
exists in `data/identities.json`; names without a W3C identity are omitted
rather than duplicated or invented. Two names need a manual match:

- **elf Pavlik** is recorded by W3C as **Pavlik elf**. The GitHub identity
  `github:876431` in `data/identities.json` confirms it is the same person.
- **Maxime Lecoq-Gaillard** is recorded by W3C as **Maxime Lecoq**. The GitHub
  identity `github:4130370` (`lecoqlibre`) confirms it is the same person.

The following editors have no W3C person record and are left off the
specification: Timea Turdean (Type Indexes), Henry Story (HTTPSig former
editor) and the collective "Solid Editorial Team" (Authorization Use Cases and
Requirements). Shape Trees uses its current GitHub Pages draft; the
`shapetrees.org` link on the TR page now serves unrelated content, so it is not
used as the published URL.

### Published reports and drafts

Published TRs use `ex:landingPage` and keep the editor's draft in
`ex:editorDraft` when the page publishes one. The editor-draft-only work items
(`Solid WebID Profile`, `HTTPSig Authentication for Solid`, `Type Indexes`,
`Shape Trees`, `Solid DID Method`, the notification channels, `Solid-PREP`,
`Solid Chat`, `Solid ERP`, `Solid QA`, `Solid Security Considerations`, the
Authorization Use Cases and Requirements, and the Authorization Use Cases
Survey) use `ex:editorDraft` only.

Solid-PREP's subject carries a `#solid-prep` fragment. Its document path ends
in `/protocol/`, which would otherwise share the UI route key with the Solid
Protocol; `ex:editorDraft` points at the real document URL.

## Publication links

`data/publications.ttl` cites seven Solid specifications: the four formal
bibliography entries (Solid Protocol, Solid-OIDC, Web Access Control and
Access Control Policy) plus Type Indexes, SAI and Shape Trees, which the paper
links in footnotes. The SAI and Shape Trees footnote URLs are mapped to the
existing canonical nodes rather than added as duplicate specifications. After
this directory was added, the two cited editor drafts were updated to their
canonical TR URLs:

- Web Access Control: `https://solidproject.org/TR/wac`
- Access Control Policy: `https://solidproject.org/TR/acp`

Solid Protocol and Solid-OIDC already use their TR URLs. The specification
records now live here, not in the publication file.

## Event

The **Solid Symposium 2027** event in `data/events.ttl` is linked to the Solid
SDO with `ex:sdo <https://solidproject.org/>`. The event is organised by a
committee with the University of St.Gallen; the SDO link describes the
standards scope, not the organiser.

## Logo

`ui/public/logos/solid.svg` is the official Solid logo published at
<https://solidproject.org/TR/solid.svg>, saved locally so the SDO card and
badges do not hotlink the site.

## Seeding

The files are part of `seed -- static` and `seed -- all`. To seed only Solid
data:

```sh
devbox run seed -- data/solid/groups.ttl data/solid/specs.ttl
```

The `publications` target (`devbox run seed:publications`) also seeds these two
files, because the SDS publication cites four of the Solid specifications.
