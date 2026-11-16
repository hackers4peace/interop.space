# Interoperable Europe data

Catalog data for the **Interoperable Europe** SDO and its two sub-bodies:
the SEMIC Support Centre and the Open Source Observatory (OSOR). The directory
is named `data/semic` because SEMIC was the first collection added; it now
holds both sub-bodies' event data.

Snapshot: **2026-11-13**.

## Files

| File | Contents |
| --- | --- |
| `organizations.ttl` | Interoperable Europe and its SEMIC/OSOR sub-bodies |
| `locations.ttl` | City-level locations used by the 2026 events |
| `events.ttl` | 2026 SEMIC and OSOR events |

## Sources

- SDO and sub-bodies:
  - <https://interoperable-europe.ec.europa.eu/>
  - <https://interoperable-europe.ec.europa.eu/collection/semic-support-centre>
  - <https://interoperable-europe.ec.europa.eu/collection/open-source-observatory-osor>

- SEMIC conference:
  - <https://interoperable-europe.ec.europa.eu/collection/semic-conference>
  - The save-the-date and registration posts under
    <https://interoperable-europe.ec.europa.eu/interoperable-europe/events>
    give the date as **30 November 2026**.
  - The collection page gives the venue as the **Royal Dublin Society (RDS)**,
    Merrion Road, Ballsbridge, Dublin 4 D04 AK83, Ireland.

- OSOR events:
  - <https://interoperable-europe.ec.europa.eu/collection/open-source-observatory-osor/osor-events>
  - The page has an **OSOR Events of 2026** section with three OSOR-run
    events, each linking to a takeaway page, and an **Other Events 2026**
    section with seven external events.
  - The takeaway pages give the date of the OSOR-run events; the OSOR page
    gives the dates of the external events. Where the OSOR page did not give
    a city, the official event page was checked.

## 2026 events added

| Date | Event | Location | Organizer |
| --- | --- | --- | --- |
| 28 January 2026 | OSOR Community Meetup: From Brussels and Barcelona to Europe | — | OSOR |
| 16–17 March 2026 | FOSS Backstage 2026 | Berlin, Germany | external |
| 24–25 April 2026 | DORS/CLUC 2026 | Zagreb, Croatia | external |
| 30 June 2026 | OSOR Workshop: Driving Public Value Through Open Source Artificial Intelligence | — | OSOR |
| 30 August–3 September 2026 | EGOV-CeDEM-ePart 2026 | Athens, Greece | external |
| 15–17 September 2026 | ConsulCon 2026 | Munich, Germany | external |
| 24 September 2026 | OSOR Webinar: Public Administrations and the EU Open Source Strategy | Online | OSOR |
| 1–3 October 2026 | Software Freedom Kosova 2026 | — | external |
| 6 October 2026 | Mindtrek 2026 | Finnkino Cine Atlas, Tampere, Finland | external |
| 7–9 October 2026 | Open Source Summit Europe 2026 | Prague, Czechia | external |
| 30 November 2026 | SEMIC 2026 | Royal Dublin Society (RDS), Dublin, Ireland | SEMIC |

Software Freedom Kosova has no location in `events.ttl`: the OSOR page does not
give a city, and the official site returned HTTP 522 when the snapshot was
taken. The OSOR-run community meetup and workshop also have no published venue,
so their events carry no `ex:location`.

## RDF mapping

### Organizations

The parent organization uses <https://interoperable-europe.ec.europa.eu/> as its
subject, the same identifier as `ex:sdo` and the UI's SDO navigation. The two
sub-bodies are `ex:Organization` records with their collection URL as subject
and `ex:parent` pointing at the parent. Their homepage and source are the same
collection URL. The parent carries `ex:logo "/logos/interoperable-europe.svg"`.

### Locations

One `ex:Location` per event city, with `ex:name` as `City, Country`,
`ex:region` as the country, and city-level coordinates. Subjects are UUIDv5
values derived from `interoperable-europe:location:<country>:<city>`.

### Events

Every 2026 event is an `ex:Event` with:

- `ex:sdo <https://interoperable-europe.ec.europa.eu/>`;
- `ex:organizer` for the three OSOR-run events and SEMIC 2026, pointing at the
  matching sub-body;
- the published calendar date(s), using the catalog convention
  `00:00:00Z … 23:59:59Z` for the first/last day (no times are invented);
- `ex:location` and `ex:atLocation` when a city/venue is published;
- `ex:source`, the collection or OSOR takeaway page the event was read from.

Event subjects are UUIDv5 values derived from
`interoperable-europe:event:<slug>`.

## Limits

- The OSOR page is a recap/news page, not an event API. Its 2026 entries are a
  mix of past events, OSOR takeaways and external conferences; all are imported
  as events because that is what the page lists.
- Dates are calendar dates. Start/end times are day boundaries, matching
  `data/events.ttl`; the sources do not publish times for these events.
- Locations are city-level unless the source gives a venue. Online is a literal
  location, not an `ex:Location` node.
- The official event pages may move or expire; `ex:source` points at the stable
  Interoperable Europe page instead of the external conference site.

## Seeding

`scripts/fuseki.ts` lists the three files in `STATIC_SEED_FILES`, so:

```sh
devbox run seed -- static
```

includes them. To seed only this directory, pass the `.ttl` files explicitly
(the directory target selects only `.nq` files):

```sh
devbox run seed -- data/semic/locations.ttl data/semic/organizations.ttl data/semic/events.ttl
```

## Related records

The SDO card and sub-body links live in `ui/src/data/sdos.json`; the logo is
`ui/public/logos/interoperable-europe.svg`. It is the official SVG saved
locally, with its white logo fills recolored to EU blue (`#0E47A1`) so the mark
stays visible on the catalog's white logo tiles; the shape is unchanged.
`semic` and `interoperable-europe` are accepted as legacy `?sdo=` ids.
