import { describe, expect, test } from 'bun:test'
import type { Quad } from 'n3'
import {
  ATTRIBUTION,
  CC_BY_4,
  COUNTRY_STAT_CLASS,
  FEATURE_CLASS,
  FEATURE_SUPPORT_CLASS,
  FEDIDB_URL,
  OPEN_REGISTRATIONS,
  SERVER_CLASS,
  SERVER_DOMAIN,
  SILO_ID,
  SOFTWARE,
  SOFTWARE_CLASS,
  SOFTWARE_VERSION_CLASS,
  XSD,
  buildCatalogQuads,
  buildCountryQuads,
  buildFeatureQuestionQuads,
  buildFeatureSupportQuads,
  buildServerQuads,
  buildSoftwareQuads,
  buildSoftwareVersionQuads,
  featureUri,
  parseNdjson,
  serverIdentity,
  softwareUri,
  type FedidbCatalog,
} from './analysis.ts'

const EX = 'http://example.org#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

const predicate = (quads: Quad[], name: string) =>
  quads.find((entry) => entry.predicate.value === `${EX}${name}`)

const objects = (quads: Quad[], name: string) =>
  quads
    .filter((entry) => entry.predicate.value === `${EX}${name}`)
    .map((entry) => entry.object.value)

describe('parseNdjson', () => {
  test('parses blank-line-separated objects', () => {
    expect(parseNdjson<{ a: number }>('{"a":1}\n\n{"a":2}\n')).toEqual([
      { a: 1 },
      { a: 2 },
    ])
  })

  test('reports the failing line', () => {
    expect(() => parseNdjson('{"a":1}\nnot json\n')).toThrow('line 2')
  })
})

describe('FediDB software', () => {
  test('maps a software row to a doap:Project and ex:Software', () => {
    const quads = buildSoftwareQuads([
      {
        slug: 'mastodon',
        name: 'Mastodon',
        description: 'Decentralized social network',
        types: ['microblogging', 'social'],
        tags: ['microblogging'],
        license: 'AGPL',
        website: 'https://joinmastodon.org',
        source_code: 'https://github.com/mastodon/mastodon',
        logo_url: 'https://fedidbcdn.com/logo.webp',
        servers: 8651,
        users: 8_746_863,
        monthly_active: 670_273,
        posts: 1_025_574_679,
        fedidb_url: 'https://fedidb.com/software/mastodon',
      },
    ])

    const subject = softwareUri('mastodon')
    expect(subject).toBe('https://fedidb.com/software/mastodon')
    expect(
      quads.filter(
        (entry) =>
          entry.predicate.value === RDF_TYPE &&
          entry.subject.value === subject,
      ).map((entry) => entry.object.value),
    ).toEqual([
      'http://usefulinc.com/ns/doap#Project',
      SOFTWARE_CLASS,
    ])
    expect(predicate(quads, 'siloId')?.object.value).toBe(
      'urn:fedidb:software:mastodon',
    )
    expect(
      quads.find(
        (entry) => entry.predicate.value === 'http://usefulinc.com/ns/doap#name',
      )?.object.value,
    ).toBe('Mastodon')
    expect(objects(quads, 'softwareType')).toEqual([
      'microblogging',
      'social',
    ])
    expect(objects(quads, 'tag')).toEqual(['microblogging'])
    expect(predicate(quads, 'servers')?.object.value).toBe('8651')
    expect(predicate(quads, 'users')?.object.value).toBe('8746863')
    expect(predicate(quads, 'monthlyActive')?.object.value).toBe('670273')
    expect(predicate(quads, 'posts')?.object.value).toBe('1025574679')
    expect(predicate(quads, 'fedidbUrl')?.object.value).toBe(
      'https://fedidb.com/software/mastodon',
    )
    expect(
      quads.find(
        (entry) => entry.predicate.value === 'http://usefulinc.com/ns/doap#homepage',
      )?.object.value,
    ).toBe('https://joinmastodon.org/')
  })

  test('skips rows without a slug and unsafe URLs', () => {
    const quads = buildSoftwareQuads([
      { name: 'No slug' },
      { slug: 'bad-url', website: 'javascript:alert(1)', name: 'Bad URL' },
    ])
    expect(quads.filter((entry) => entry.predicate.value === RDF_TYPE)).toHaveLength(2)
    expect(
      quads.some((entry) =>
        entry.predicate.value === 'http://usefulinc.com/ns/doap#homepage',
      ),
    ).toBe(false)
  })
})

describe('FediDB servers', () => {
  test('normalises domains and emits the server subject', () => {
    expect(serverIdentity('Example.COM')).toEqual({
      iri: 'https://example.com/',
      domain: 'example.com',
    })
    expect(serverIdentity('example.com/path')).toBeUndefined()
    expect(serverIdentity('not a domain')).toBeUndefined()
  })

  test('maps server metrics, registration and dates', () => {
    const quads = buildServerQuads(
      [
        {
          domain: 'mastodon.example',
          software: 'mastodon',
          version: '4.3.0',
          users: 10,
          monthly_active: 3,
          posts: 42,
          open_registrations: true,
          country: 'Germany',
          first_seen: '2021-03-21',
          last_seen: '2026-11-07',
        },
      ],
      'servers',
    )
    const node = 'https://mastodon.example/'
    expect(quads[0]?.subject.value).toBe(node)
    expect(quads[0]?.object.value).toBe(SERVER_CLASS)
    expect(predicate(quads, 'domain')?.object.value).toBe('mastodon.example')
    expect(predicate(quads, 'siloId')?.object.value).toBe(
      'urn:fedidb:server:mastodon.example',
    )
    expect(predicate(quads, 'software')?.object.value).toBe(
      'https://fedidb.com/software/mastodon',
    )
    const openRegistrations = predicate(quads, 'openRegistrations')?.object
    expect(
      openRegistrations?.termType === 'Literal'
        ? openRegistrations.datatype.value
        : undefined,
    ).toBe(`${XSD}boolean`)
    const firstSeen = predicate(quads, 'firstSeen')?.object
    expect(
      firstSeen?.termType === 'Literal' ? firstSeen.datatype.value : undefined,
    ).toBe(`${XSD}date`)
    expect(predicate(quads, 'lastSeen')?.object.value).toBe('2026-11-07')
    expect(predicate(quads, 'country')?.object.value).toBe('Germany')
  })

  test('open-servers forces the registration flag', () => {
    const quads = buildServerQuads(
      [{ domain: 'open.example' }],
      'open-servers',
      { openRegistrations: true },
    )
    expect(predicate(quads, 'openRegistrations')?.object.value).toBe('true')
  })
})

describe('FediDB versions and countries', () => {
  test('creates one version node per software/version pair', () => {
    const quads = buildSoftwareVersionQuads([
      {
        software: 'mastodon',
        version: '4.3.0+glitch',
        servers: 4,
        users: 100,
        monthly_active: 20,
      },
    ])
    expect(quads[0]?.subject.value).toBe(
      'urn:fedidb:software-version:mastodon:4.3.0%2Bglitch',
    )
    expect(quads[0]?.object.value).toBe(SOFTWARE_VERSION_CLASS)
    expect(predicate(quads, 'version')?.object.value).toBe('4.3.0+glitch')
    expect(predicate(quads, 'software')?.object.value).toBe(
      softwareUri('mastodon'),
    )
  })

  test('creates aggregate country nodes', () => {
    const quads = buildCountryQuads([
      {
        software: 'mastodon',
        country: 'United States',
        servers: 100,
        users: 1000,
        monthly_active: 200,
      },
    ])
    expect(quads[0]?.subject.value).toBe(
      'urn:fedidb:country-stat:mastodon:United%20States',
    )
    expect(quads[0]?.object.value).toBe(COUNTRY_STAT_CLASS)
    expect(predicate(quads, 'country')?.object.value).toBe('United States')
  })
})

describe('FediDB feature matrix', () => {
  test('links questions to canonical FEP identifiers', () => {
    const fep = {
      id: '7628',
      label: 'FEP-7628',
      title: 'Move actor',
      url: 'https://codeberg.org/fediverse/fep/src/branch/main/fep/7628/fep-7628.md',
    }
    const quads = buildFeatureQuestionQuads([
      { slug: 'account-migration', name: 'Move accounts', feps: [fep] },
      { slug: 'account-aliases', name: 'Aliases', feps: [fep] },
    ])
    expect(quads.filter((entry) => entry.subject.value === featureUri('account-migration')).length).toBeGreaterThan(0)
    expect(predicate(quads, 'fep')?.object.value).toBe(
      'https://w3id.org/fep/7628',
    )
    // The FEP stage owns this metadata; feature questions only link to it.
    expect(
      quads.some(
        (entry) =>
          entry.predicate.value === RDF_TYPE &&
          entry.object.value === `${EX}FEP`,
      ),
    ).toBe(false)
  })

  test('maps support answers to software and feature references', () => {
    const quads = buildFeatureSupportQuads([
      {
        software: 'mastodon',
        question: 'account-migration',
        status: 'yes',
        note: 'Since 4.2',
        since_version: '4.2',
        source_url: 'https://docs.joinmastodon.org/user/moving/',
        updated: '2026-10-20',
      },
    ])
    expect(quads[0]?.object.value).toBe(FEATURE_SUPPORT_CLASS)
    expect(predicate(quads, 'software')?.object.value).toBe(
      softwareUri('mastodon'),
    )
    expect(predicate(quads, 'feature')?.object.value).toBe(
      featureUri('account-migration'),
    )
    expect(predicate(quads, 'status')?.object.value).toBe('yes')
    expect(predicate(quads, 'sinceVersion')?.object.value).toBe('4.2')
    expect(predicate(quads, 'sourceUrl')?.object.value).toBe(
      'https://docs.joinmastodon.org/user/moving/',
    )
    expect(
      quads.find(
        (entry) =>
          entry.predicate.value === 'http://purl.org/dc/terms/modified',
      )?.object.value,
    ).toBe('2026-10-20')
  })
})

describe('FediDB catalog metadata', () => {
  test('records the license, periods, checksums and dataset links', () => {
    const catalog: FedidbCatalog = {
      version: 1,
      generated_at: '2026-11-08T19:10:03Z',
      license: {
        name: 'CC BY 4.0',
        url: CC_BY_4,
        attribution: 'FediDB (fedidb.com)',
      },
      datasets: [
        {
          slug: 'software',
          title: 'Software',
          description: 'Every fediverse software',
          formats: ['json', 'ndjson', 'csv'],
          schema_version: '67f02a02',
          stable_urls: {
            ndjson: 'https://api.fedidb.org/datasets/software.ndjson.gz',
          },
          latest: {
            period: '2026-11-08',
            rows: 460,
            schema_version: '67f02a02',
            generated_at: '2026-11-08T01:10:03Z',
            files: {
              ndjson: {
                name: 'software-2026-11-08.ndjson.gz',
                url: 'https://fedidbcdn.com/datasets/software/2026-11-08/software.ndjson.gz',
                bytes: 22479,
                sha256: 'abc',
              },
            },
          },
        },
      ],
    }
    const quads = buildCatalogQuads(catalog)
    expect(
      quads.find(
        (entry) =>
          entry.predicate.value === `${EX}attribution` &&
          entry.subject.value === 'https://fedidb.com/datasets',
      )?.object.value,
    ).toBe('FediDB (fedidb.com)')
    expect(
      quads.some(
        (entry) =>
          entry.predicate.value === 'http://purl.org/dc/terms/license' &&
          entry.object.value === CC_BY_4,
      ),
    ).toBe(true)
    expect(
      quads.find(
        (entry) =>
          entry.subject.value === 'https://fedidb.com/datasets#software' &&
          entry.predicate.value === `${EX}period`,
      )?.object.value,
    ).toBe('2026-11-08')
    expect(
      quads.find(
        (entry) =>
          entry.subject.value === 'https://fedidb.com/datasets#software' &&
          entry.predicate.value === `${EX}rowCount`,
      )?.object.value,
    ).toBe('460')
    expect(
      quads.find(
        (entry) =>
          entry.subject.value === 'https://fedidb.com/datasets#software' &&
          entry.predicate.value === 'http://www.w3.org/ns/dcat#downloadURL',
      )?.object.value,
    ).toBe(
      'https://fedidbcdn.com/datasets/software/2026-11-08/software.ndjson.gz',
    )
  })
})

test('exports the dataset subject helpers', () => {
  expect(FEDIDB_URL).toBe(`${EX}fedidbUrl`)
  expect(SERVER_DOMAIN).toBe(`${EX}domain`)
  expect(SILO_ID).toBe(`${EX}siloId`)
  expect(FEATURE_CLASS).toBe(`${EX}Feature`)
  expect(SOFTWARE).toBe(`${EX}software`)
  expect(OPEN_REGISTRATIONS).toBe(`${EX}openRegistrations`)
  expect(ATTRIBUTION).toBe(`${EX}attribution`)
})
