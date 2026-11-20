# Eclipse data

Catalog records for the Eclipse Foundation's dataspace standardization work.

Snapshot: **2026-11-19**.

## Files

| File | Contents |
| --- | --- |
| `organizations.ttl` | International Data Spaces Association (IDSA) |
| `groups.ttl` | Eclipse Dataspace Working Group as an `ex:Group` |
| `specs.ttl` | Dataspace Protocol 2025-1 as an `ex:Specification`, linked to the group |
| `events.ttl` | Data Spaces Symposium 2027, organised by IDSA |

The Eclipse Foundation organization is not duplicated here. The Gaia-X member
record in `data/gaia-x/organizations.ttl` already uses
`<https://eclipse.org/>`, so the group and specification use that same URI as
their `ex:sdo`. The Eclipse entry in `ui/src/data/sdos.json` supplies the
catalog's standards-body name, website and logo (`ui/public/logos/eclipse.svg`).

## IDSA

Source: <https://internationaldataspaces.org/>

`<https://internationaldataspaces.org/>` is the `ex:Organization` record for
IDSA (legal name **INTERNATIONAL DATA SPACES e.V.**, `ex:shortname "IDSA"`).
IDSA developed the Dataspace Protocol up to version 2024-1 and contributed that
release to the Eclipse project. The record was moved here from
`data/gaia-x/organizations.ttl` because of that handover; it keeps the Gaia-X
membership fields and Brussels location, and its `ex:parent` is not Eclipse.

## Event

Source:
<https://internationaldataspaces.org/events/data-spaces-symposium-2027-value-at-scale-trust-by-design/>

The **Data Spaces Symposium 2027 | Value at Scale, Trust by Design** runs
9-10 March 2027 at The EGG in Brussels. IDSA is both the event's `ex:sdo` and
its `ex:organizer`; `ex:atLocation` reuses the existing Brussels city node from
`data/locations.ttl`.

## Working group

Source: <https://dataspace.eclipse.org/>

`<https://dataspace.eclipse.org/>` is an `ex:Group` with
`ex:sdo <https://eclipse.org/>`, named **Eclipse Dataspace Working Group**. It
is the group that develops the Dataspace Protocol.

## Dataspace Protocol

Sources:

- <https://github.com/eclipse-dataspace-protocol-base/DataspaceProtocol>
- <https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/>

The specification subject is the project's current web rendering:

```text
https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/
```

It carries `ex:landingPage` to that rendering, `dcterms:publisher` to the
Eclipse Dataspace Working Group and the latest release date (2025-1-err2,
published 11 September 2026). The group is linked back to the specification
with `ex:specification`, so the group page and specification card show the
relationship in both directions.

Versions up to and including 2024-1 were developed under the International Data
Spaces Association (IDSA); 2024-1 is the initial contribution to the Eclipse
Dataspace Protocol project.

The SDS 2026 publication `data/publications.ttl` also cites this specification.

The files are part of `seed -- static` and `seed -- all`.
