# Gaia-X data

Catalog records for Gaia-X: the association, its member organizations, their
city-level locations, and the events on its public calendar.

Snapshot: **2026-11-13**. The files are curated from the public pages below;
the exact endpoint and method are recorded here so a later refresh can follow
the same rules.

## Files

| File | Contents |
| --- | --- |
| `locations.ttl` | One `ex:Location` per member city, with country, coordinates and source |
| `organizations.ttl` | The Gaia-X organization plus every member organization, linked to its location |
| `events.ttl` | Upcoming Gaia-X events, linked to Gaia-X and to the matching location |

## Events

Source page: <https://gaia-x.eu/events/>

The page embeds The Events Calendar; its public iCal feed is:

```
https://gaia-x.eu/events-cal/?ical=1
```

The feed contained two upcoming events at the snapshot:

- Gaia‑X Summit 2026, 19–20 November 2026, Vienna, Austria
- The Data Summit Luxembourg, 2 December 2026, Luxembourg City, Luxembourg

`DTSTART` and `DTEND` are published in `Europe/Brussels`; they were converted
to UTC for `ex:startDate` / `ex:endDate`. The calendar does not publish a street
venue, so `ex:location` is the city and `ex:atLocation` points at the matching
city in `locations.ttl`. The feed only contains upcoming events; past events
are not fetched.

## Members

Source page: <https://gaia-x.eu/community/members-directory/#/members-directory>

The page is an iframe. Its loader is
<https://map.membersplatform.gaia-x.eu/memberDirectory.js>, and the app calls a
public, unauthenticated endpoint for the map data:

```
https://membersplatform.gaia-x.eu/api/public/hs_categories/map
```

The companion endpoint
<https://membersplatform.gaia-x.eu/api/public/hs_categories/flags> reported
**232 member organizations** in **37 countries**. After normalising city names
(trimming whitespace and expanding `Luxembourg` to `Luxembourg City`) the
members fall into **146 cities**.

The directory's authenticated `hs_companies` endpoint was not used. The map
endpoint already returns the public fields needed here: name, website, domain,
logo URL, city, country, latitude, longitude, membership category and GXDCH
status.

## RDF mapping

### Organizations

Each member is an `ex:Organization`:

- **Subject** is the organization website host as `https://<host>/`, with a
  leading `www.` removed. The host is taken from the published website, so a
  website with a path (for example `https://www.uni.lu/snt-en/`) still yields
  the stable subject `https://uni.lu/`. When the website field is not a URL
  (one record contains the company name instead), the domain field is used.
- `ex:name` is the directory name verbatim.
- `ex:homepage` is the published website (a missing scheme is filled with
  `https://`).
- `ex:logo` is the published Gaia-X S3 logo URL, not a local copy.
- `ex:location` points at the matching city node when the member publishes a
  city and country.
- `ex:gaiaXMemberCategory` preserves `Members` or `Founding Members`.
- `ex:gxdch` is `true` or `false` when the directory answers; 45 records omit
  the field, so they carry no statement rather than a guessed value.
- `ex:source` points at the members directory.

The Gaia-X organization itself uses <https://gaia-x.eu/> as its subject, which
is the same identifier used by `ex:sdo` and by the UI's SDO navigation. Its
`ex:location` is the Brussels city node; the imprint at
<https://gaia-x.eu/imprint/> gives Avenue des Arts 6-9, 1210 Brussels, but the
catalog stays at city level for consistency with the member records.

### Locations

One `ex:Location` per normalised city/country. `ex:name` is `City, Country`,
`ex:region` is the country, and `ex:latitude` / `ex:longitude` come from the
first member listed for that city. These are city-level coordinates, not a
venue or street address. Subject UUIDs are UUIDv5 values derived from
`gaia-x:location:<country>:<city>`, so a refresh keeps the same node.

### Events

Event subjects are UUIDv5 values derived from the iCal `UID`. Events carry
`ex:sdo <https://gaia-x.eu/>`, the iCal summary as `ex:name`, UTC start/end
dates, the city-level location, and the event page URL as `ex:source`.

## Refreshing

Fetch fresh snapshots from the same public endpoints:

```sh
curl -sL 'https://gaia-x.eu/events-cal/?ical=1' > /tmp/gaia-x-events.ics
curl -sL 'https://membersplatform.gaia-x.eu/api/public/hs_categories/map' > /tmp/gaia-x-members.json
```

Then rebuild the three TTL files with the subject rules above. Keep the
UUIDv5 keys stable and update the snapshot date in the file headers. There is
no committed crawler: the files are small enough to review as data, and the
directory's API is the only external dependency.

Seed them with the other curated files:

```sh
devbox run seed -- static
```

`scripts/fuseki.ts` lists these files in `STATIC_SEED_FILES`, so `seed -- all`
also picks them up. Seeding the directory `data/gaia-x` on its own only selects
`.nq` files; pass the three `.ttl` paths explicitly if you need a subset.

## Limits

- Names, websites and logos are reproduced from the directory. Organizations
  are deduplicated only by website host; the directory has no separate stable
  organization id.
- City coordinates are approximate and come from the first member listed in
  that city. They are not geocoded independently.
- The public map endpoint is undocumented and may change. If it disappears,
  the member records and the README snapshot stay as the last known state.
- The directory page does not state a data license. Logos are hotlinked from
  the Gaia-X S3 bucket rather than copied into this repository, and every
  record links back to the public directory.

## Related records

The Gaia-X SDO card and logo live in `ui/src/data/sdos.json` and
`ui/public/logos/gaia-x.svg`. The UI reads `ex:location` on organizations and
`ex:atLocation` on events, so organization cards show the city and location
pages list their member organizations. The ODRL specs and the UPM software from
the Gaia-X TechX26 talk are general catalog records, not Gaia-X member data, so
they remain in `data/specs.ttl` and `data/software.ttl`.
