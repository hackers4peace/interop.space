# Matrix data

Catalog data for **Matrix.org Foundation** and the Matrix ecosystem.

Snapshot: **2026-11-13**.

## Files

| File | Contents |
| --- | --- |
| `organizations.ttl` | Matrix.org Foundation as an `ex:Organization` |
| `specs.ttl` | The Matrix Specification |
| `software.ttl` | Matrix servers, clients and SDKs as `doap:Project` records |
| `events.ttl` | The Matrix Conference 2026 |
| `locations.ttl` | Malmö, Sweden for the conference |
| `deployments.ttl` | Matrix managed-hosting providers as `ex:Server` records |

## Sources

- Foundation: <https://matrix.org/foundation/about/>
- Specification: <https://spec.matrix.org/latest/> (v1.19, published 8 July 2026)
- Servers: <https://matrix.org/ecosystem/servers/>
- Clients: <https://matrix.org/ecosystem/clients/>
- SDKs: <https://matrix.org/ecosystem/sdks/>
- Hosting: <https://matrix.org/ecosystem/hosting/> and the nine provider
  detail pages linked from it
- Conference: <https://conference.matrix.org/>

The ecosystem pages are static HTML. Software cards carry the name, maturity,
author, licence, language, description and repository/homepage links. Client
detail pages were fetched for their source-code and website links. SDK cards
were read from the Client SDKs, Bot SDKs and Bridge SDKs sections; a card that
appears in more than one section keeps all `ex:sdkPurpose` values.

## Counts

- 20 server implementations
- 48 clients
- 37 unique SDKs (68 cards across the three SDK sections)
- 105 unique software records after merging duplicate cards by name
- 9 managed-hosting deployments
- 1 specification and 1 conference

## RDF mapping

### Software

Each unique name is a `doap:Project` with:

- `doap:name`, `doap:shortdesc`;
- `doap:programming-language` and `doap:license` when the card publishes them;
- `doap:homepage` and `doap:repository` when a link is published;
- `doap:implements <https://spec.matrix.org/latest/>`;
- `ex:maturity` (`Stable`, `Beta`, `Alpha` or `Obsolete`);
- `ex:category` (`Server`, `Client` or `SDK`);
- `ex:platform` for client platforms and `ex:sdkPurpose` for SDK sections;
- `ex:source` pointing at the ecosystem page.

Obsolete entries stay in the catalog because the ecosystem page still lists
them. Author strings are not emitted as RDF: there are no matching person
identities in the catalog, and inventing `doap:maintainer` links would be
wrong. Duplicated client/SDK cards are merged by case-insensitive name.

### Specification

`<https://spec.matrix.org/latest/>` is an `ex:Specification` delivered by
`https://matrix.org/`. Its display date is the v1.19 publication date,
8 July 2026.

### Event

The Matrix Conference 2026 runs 20-23 October 2026 in Malmö, Sweden, at
Scandic Triangeln. The conference page also says the 23 October hackathon is
at Aalborg University in Copenhagen; the event is imported once with that
detail in its `ex:location` literal. Dates use the catalog convention
`00:00:00Z … 23:59:59Z` for the first/last day.

### Deployments, not software

The hosting page lists providers of managed Matrix homeservers, not individual
server instances. They are modelled as `ex:Server` records so they share the
Deployments view with the FediDB server exports, instead of being added to
`Software`:

- subject is `https://<website host>/`, matching the FediDB server URL shape;
- `ex:name`, `ex:domain`, `ex:homepage`, `ex:logo`;
- `ex:since` (`xsd:gYear`), `ex:audience` (`Individuals`/`Business`) and a
  short `ex:description`;
- `ex:siloId` with `urn:matrix:hosting:<slug>`;
- `ex:source` for the provider detail page and `dcterms:source` for the
  hosting directory.

The directory does not publish user counts, versions, open-registration state
or a country for these providers, so those FediDB fields are simply absent.
The UI's deployment detail page shows whichever fields exist. Provider logos
are hotlinked from matrix.org, not copied into the repository.

## Logo

`ui/public/logos/matrix.svg` is the official white Matrix wordmark saved
locally, with its fill changed to Matrix green (`#0DBD8B`) so it stays visible
on the catalog's white logo tiles. The shape is unchanged.

## Seeding

`scripts/fuseki.ts` lists the six files in `STATIC_SEED_FILES`, so:

```sh
devbox run seed -- static
```

includes them. To seed only Matrix, pass the files explicitly:

```sh
devbox run seed -- data/matrix/locations.ttl data/matrix/organizations.ttl data/matrix/specs.ttl data/matrix/events.ttl data/matrix/software.ttl data/matrix/deployments.ttl
```
