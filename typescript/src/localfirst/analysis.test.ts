import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Parser } from 'n3'
import type { Quad } from 'n3'
import {
  DOAP,
  EX,
  buildEventQuads,
  buildLocationQuads,
  buildOrganizationQuads,
  buildSoftwareQuads,
  eventUri,
  locationUri,
  parseConferencePage,
  parseTechnology,
  parseTechnologyIds,
  softwareUri,
  slugify,
  uuidv5,
  type TechnologyRecord,
} from './analysis.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const DCTERMS = 'http://purl.org/dc/terms/'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

const objects = (quads: Quad[], predicate: string) =>
  quads
    .filter((entry) => entry.predicate.value === predicate)
    .map((entry) => entry.object.value)

const predicates = (quads: Quad[], predicate: string) =>
  quads.filter((entry) => entry.predicate.value === predicate)

const datatype = (quads: Quad[], predicate: string) => {
  const object = predicates(quads, predicate)[0]?.object
  return object?.termType === 'Literal' ? object.datatype.value : undefined
}

const CONFERENCE_HTML = `<!DOCTYPE html>
<html><head>
  <title>Local-First Conf 2027</title>
  <meta name="description" content="Save the date for Local-First Conf 2027 in Berlin, May 25-26. Two days of talks, workshops, and community." />
</head><body>
  <div class="display-none">Berlin, Germany<br/>25-26th may 2027</div>
  <section>
    <h2 class="h2-2026">25th - 26th may,<br/>2027 in Berlin.</h2>
    <a href="https://festsaal-kreuzberg.de/en" target="_blank"><div class="text-block">Venue Festsaal Kreuzberg </div></a>
  </section>
  <section>
    <h2 class="h2-2026">two days Packed with talks, workshops, community and chat.</h2>
  </section>
  <footer><div class="label">Berlin, Germany<br/>25th-26th May 2027</div></footer>
</body></html>`

describe('uuidv5', () => {
  test('matches the URL-namespace convention used by the curated catalogs', () => {
    // Subject of Berlin, Germany in data/semic/locations.ttl.
    expect(uuidv5('interoperable-europe:location:Germany:Berlin')).toBe(
      '5f70ff33-2acc-537f-96e4-b95741bb498c',
    )
  })

  test('derives stable Local-First subjects', () => {
    expect(locationUri('Germany', 'Berlin')).toBe(
      'urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360',
    )
    expect(eventUri('Local-First Conf 2027')).toBe(
      'urn:uuid:60142f92-a0fd-571e-908c-d2a741569c27',
    )
    expect(softwareUri('automerge')).toBe(
      'urn:uuid:b919423b-8296-5f58-82ad-11b94912b84a',
    )
  })

  test('slugifies names for event keys', () => {
    expect(slugify('Local-First Conf 2027')).toBe('local-first-conf-2027')
    expect(slugify('  Café  Society!  ')).toBe('cafe-society')
  })
})

describe('parseConferencePage', () => {
  test('reads the next edition from the date heading and footer', () => {
    expect(parseConferencePage(CONFERENCE_HTML)).toEqual({
      name: 'Local-First Conf 2027',
      city: 'Berlin',
      country: 'Germany',
      venue: 'Festsaal Kreuzberg',
      startDate: '2027-05-25',
      endDate: '2027-05-26',
    })
  })

  test('fails when the date range is gone', () => {
    expect(() =>
      parseConferencePage('<html><title>Local-First</title></html>'),
    ).toThrow('date range')
  })

  test('fails when the country is gone', () => {
    expect(() =>
      parseConferencePage(
        CONFERENCE_HTML.replace(/Berlin, Germany/g, 'Berlin'),
      ),
    ).toThrow('country')
  })
})

describe('parseTechnologyIds', () => {
  test('reads one id per repos.ts entry, in order, without duplicates', () => {
    const repos = `
      export const repos = Schema.decodeSync(Schema.Array(RepoInfo))([
        { id: 'nextgraph', owner: 'nextgraph-org', repo: 'landscape-data' },
        { id: 'yjs', owner: 'yjs', repo: 'local-first-landscape-data', basePath: 'yjs' },
        { id: 'yjs', owner: 'yjs', repo: 'local-first-landscape-data' },
      ])
    `
    expect(parseTechnologyIds(repos)).toEqual(['nextgraph', 'yjs'])
  })

  test('fails when there is no id', () => {
    expect(() => parseTechnologyIds('export const repos = []')).toThrow(
      'no technology ids',
    )
  })
})

describe('parseTechnology', () => {
  test('keeps the catalog fields and drops a "None" license', () => {
    expect(
      parseTechnology('livestore', {
        Id: 'livestore',
        Name: 'LiveStore',
        Description: 'A local-first data layer',
        MaturityLevel: 'Beta',
        Website: 'https://livestore.dev/',
        GitHub: 'https://github.com/livestorejs/livestore',
        License: 'None',
        Deployment: ['Self-hosted'],
        AppTarget: {
          Platform: { data: ['Browser', 'Node'] },
          LanguageSDK: { data: ['TypeScript'] },
        },
        __generated: { lastUpdated: '2025-04-29T14:51:46.000Z' },
      }),
    ).toEqual({
      id: 'livestore',
      name: 'LiveStore',
      description: 'A local-first data layer',
      maturity: 'Beta',
      homepage: 'https://livestore.dev/',
      repository: 'https://github.com/livestorejs/livestore',
      languages: ['TypeScript'],
      platforms: ['Browser', 'Node'],
      deployments: ['Self-hosted'],
      lastUpdated: '2025-04-29',
    })
  })

  test('drops website and repository values that are not http(s) URLs', () => {
    const record = parseTechnology('example', {
      Name: 'Example',
      Website: 'ftp://example.org/',
      GitHub: 'not a url',
    })
    expect(record.homepage).toBeUndefined()
    expect(record.repository).toBeUndefined()
  })

  test('rejects a mismatched id', () => {
    expect(() =>
      parseTechnology('automerge', { Id: 'yjs', Name: 'Automerge' }),
    ).toThrow('declares Id')
  })
})

describe('Local-First RDF', () => {
  const info = parseConferencePage(CONFERENCE_HTML)

  test('organization uses the SDO id as its own subject', () => {
    const quads = buildOrganizationQuads()
    expect(quads[0]?.subject.value).toBe('https://www.localfirst.fm/')
    expect(objects(quads, `${EX}name`)).toEqual(['Local-First'])
    expect(objects(quads, `${EX}logo`)).toEqual(['/logos/localfirst.svg'])
  })

  test('reuses the curated Berlin node instead of adding a fourth Berlin', () => {
    const quads = buildLocationQuads(info)
    expect(quads).toHaveLength(1)
    expect(quads[0]?.subject.value).toBe(
      'urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360',
    )
    // The curated node already carries name, region and coordinates.
    expect(objects(quads, `${EX}name`)).toEqual([])
    expect(objects(quads, `${EX}region`)).toEqual([])
    expect(objects(quads, `${EX}source`)).toEqual([
      'https://www.localfirstconf.com/',
    ])
  })

  test('the reused Berlin subject exists in the base location catalog', () => {
    const base = new Parser().parse(
      readFileSync(
        new URL('../../../data/locations.ttl', import.meta.url),
        'utf8',
      ),
    )
    const names = base
      .filter(
        (entry) =>
          entry.predicate.value === `${EX}name` &&
          entry.object.value.startsWith('Berlin,'),
      )
      .map((entry) => entry.subject.value)
    expect(names).toContain('urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360')
  })

  test('a new conference city still gets its own location record', () => {
    const quads = buildLocationQuads({
      ...info,
      city: 'Lisbon',
      country: 'Portugal',
    })
    expect(objects(quads, `${EX}name`)).toEqual(['Lisbon, Portugal'])
    expect(objects(quads, `${EX}region`)).toEqual(['Portugal'])
    expect(quads[0]?.subject.value).not.toBe(
      'urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360',
    )
  })

  test('event is linked to the SDO, the location and the conference page', () => {
    const quads = buildEventQuads(info)
    expect(objects(quads, RDF_TYPE)).toEqual([`${EX}Event`])
    expect(objects(quads, `${EX}sdo`)).toEqual(['https://www.localfirst.fm/'])
    expect(objects(quads, `${EX}name`)).toEqual(['Local-First Conf 2027'])
    expect(objects(quads, `${EX}startDate`)).toEqual([
      '2027-05-25T00:00:00Z',
    ])
    expect(objects(quads, `${EX}endDate`)).toEqual(['2027-05-26T23:59:59Z'])
    expect(objects(quads, `${EX}location`)).toEqual([
      'Festsaal Kreuzberg, Berlin, Germany',
    ])
    expect(objects(quads, `${EX}atLocation`)).toEqual([
      'urn:uuid:ec0f30fc-cea2-4f7d-b80b-50be521fa360',
    ])
    expect(objects(quads, `${EX}source`)).toEqual([
      'https://www.localfirstconf.com/',
    ])
  })

  test('software maps landscape fields to DOAP', () => {
    const records: TechnologyRecord[] = [
      {
        id: 'automerge',
        name: 'Automerge',
        description: 'Generic version control for JSON documents',
        maturity: 'Production-Ready',
        homepage: 'https://automerge.org',
        repository: 'https://github.com/automerge/automerge',
        license: 'MIT',
        languages: ['TypeScript', 'Rust'],
        platforms: ['Browser', 'Node'],
        deployments: ['Self-hosted'],
        lastUpdated: '2025-04-29',
      },
    ]
    const quads = buildSoftwareQuads(records)
    expect(quads[0]?.subject.value).toBe(
      'urn:uuid:b919423b-8296-5f58-82ad-11b94912b84a',
    )
    expect(objects(quads, RDF_TYPE)).toEqual([`${DOAP}Project`])
    expect(objects(quads, `${DOAP}name`)).toEqual(['Automerge'])
    expect(objects(quads, `${DOAP}license`)).toEqual(['MIT'])
    expect(objects(quads, `${DOAP}programming-language`)).toEqual([
      'TypeScript',
      'Rust',
    ])
    expect(objects(quads, `${EX}maturity`)).toEqual(['Production-Ready'])
    expect(objects(quads, `${EX}platform`)).toEqual(['Browser', 'Node'])
    expect(objects(quads, `${EX}deployment`)).toEqual(['Self-hosted'])
    expect(objects(quads, `${EX}siloId`)).toEqual([
      'urn:localfirst:software:automerge',
    ])
    expect(objects(quads, `${EX}source`)).toEqual([
      'https://www.localfirst.fm/landscape',
    ])
    expect(
      objects(quads, `${DCTERMS}source`),
    ).toEqual([
      'https://github.com/localfirstfm/local-first-landscape/blob/main/landscape-content-snapshot/src/generated/automerge/data.json',
    ])
    expect(datatype(quads, `${DCTERMS}modified`)).toBe(`${XSD}date`)
  })

  test('software rejects duplicate ids because the subject would collide', () => {
    const record: TechnologyRecord = {
      id: 'same-id',
      name: 'First Name',
      languages: [],
      platforms: [],
      deployments: [],
    }
    expect(() =>
      buildSoftwareQuads([record, { ...record, name: 'Second Name' }]),
    ).toThrow('duplicate landscape id')
  })
})
