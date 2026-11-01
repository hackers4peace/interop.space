import { describe, expect, test } from 'bun:test'
import {
  buildAreaQuads,
  groupApiUrl,
  groupUri,
  idFromUri,
  slugFromUri,
  validateAreas,
  type IetfGroupRef,
} from './analysis.ts'

const area = (over: Partial<IetfGroupRef> = {}): IetfGroupRef => ({
  id: 2412,
  acronym: 'wit',
  name: 'Web and Internet Transport',
  type: 'area',
  state: 'active',
  uri: groupUri('wit'),
  apiUrl: groupApiUrl(2412),
  ...over,
})

describe('ietf area quads', () => {
  test('types the node as group and area with provenance', () => {
    const quads = buildAreaQuads([area({ description: 'Transport work' })])
    const byPredicate = new Map(
      quads.map((q) => [`${q.predicate.value}|${q.object.value}`, q]),
    )
    expect(byPredicate.get('http://www.w3.org/1999/02/22-rdf-syntax-ns#type|http://example.org#Group')).toBeDefined()
    expect(byPredicate.get('http://www.w3.org/1999/02/22-rdf-syntax-ns#type|http://example.org#Area')).toBeDefined()
    expect(byPredicate.get('http://example.org#sdo|https://www.ietf.org/')).toBeDefined()
    expect(byPredicate.get('http://example.org#siloId|urn:ietf:group:2412')).toBeDefined()
    expect(byPredicate.get('http://example.org#ietfApiUrl|https://datatracker.ietf.org/api/v1/group/group/2412/')).toBeDefined()
    expect(byPredicate.get('http://example.org#shortname|wit')).toBeDefined()
    expect(byPredicate.get('http://example.org#type|Area')).toBeDefined()
    expect(byPredicate.get('http://example.org#state|active')).toBeDefined()
    expect(byPredicate.get('http://example.org#description|Transport work')).toBeDefined()
  })

  test('uses the public group page as subject', () => {
    const [first] = buildAreaQuads([area()])
    expect(first?.subject.value).toBe('https://datatracker.ietf.org/group/wit/')
  })

  test('omits optional predicates when Datatracker has no value', () => {
    const rows = buildAreaQuads([area()]).map((q) => q.predicate.value)
    expect(rows).not.toContain('http://example.org#description')
    expect(rows).not.toContain('http://example.org#listArchive')
  })
})

describe('ietf area validation', () => {
  test('rejects an empty list', () => {
    expect(() => validateAreas([])).toThrow('zero areas')
  })

  test('rejects duplicate ids and duplicate urls', () => {
    expect(() => validateAreas([area(), area()])).toThrow('duplicate')
    expect(() =>
      validateAreas([area(), area({ id: 1 })]),
    ).toThrow('duplicate group homepages')
  })

  test('rejects a homepage another SDO already published', () => {
    expect(() =>
      validateAreas([area()], new Set([groupUri('wit')])),
    ).toThrow('already used by another SDO')
  })
})

describe('datatracker uri helpers', () => {
  test('slug and id from resource uris', () => {
    expect(slugFromUri('/api/v1/name/grouptypename/area/')).toBe('area')
    expect(idFromUri('/api/v1/group/group/2412/')).toBe(2412)
    expect(idFromUri(null as unknown as string)).toBeUndefined()
    expect(idFromUri('/api/v1/group/group/')).toBeUndefined()
  })
})

// --- groups stage ---------------------------------------------------------

import { buildGroupQuads, validateGroups } from './analysis.ts'

const group = (over: Partial<IetfGroupRef> = {}): IetfGroupRef => ({
  id: 1718,
  acronym: 'httpbis',
  name: 'HTTP',
  type: 'wg',
  state: 'active',
  uri: groupUri('httpbis'),
  apiUrl: groupApiUrl(1718),
  ...over,
})

const objectFor = (quads: ReturnType<typeof buildGroupQuads>, predicate: string) =>
  quads.find((q) => q.predicate.value === `http://example.org#${predicate}`)?.object
    .value

describe('ietf group quads', () => {
  const labels = new Map([
    ['wg', 'Working Group'],
    ['team', 'Team'],
  ])

  test('emits group, sdo, silo id and the type label', () => {
    const quads = buildGroupQuads([group()], labels)
    expect(objectFor(quads, 'sdo')).toBe('https://www.ietf.org/')
    expect(objectFor(quads, 'siloId')).toBe('urn:ietf:group:1718')
    expect(objectFor(quads, 'ietfApiUrl')).toBe(
      'https://datatracker.ietf.org/api/v1/group/group/1718/',
    )
    expect(objectFor(quads, 'type')).toBe('Working Group')
    expect(objectFor(quads, 'state')).toBe('active')
    expect(quads.filter((q) => q.object.value === 'http://example.org#Area')).toHaveLength(0)
  })

  test('falls back to the type slug when no label is known', () => {
    expect(objectFor(buildGroupQuads([group({ type: 'rag' })]), 'type')).toBe(
      'rag',
    )
  })

  test('emits parent and external links only when resolved', () => {
    const bare = buildGroupQuads([group()], labels)
    expect(objectFor(bare, 'parent')).toBeUndefined()
    expect(objectFor(bare, 'homepage')).toBeUndefined()

    const linked = buildGroupQuads(
      [
        group({
          parentUri: groupUri('wit'),
          homepage: 'https://httpwg.org/',
          githubOrg: 'https://github.com/httpwg/',
          wiki: 'https://wiki.ietf.org/group/httpbis',
          listArchive: 'http://lists.w3.org/Archives/Public/ietf-http-wg/',
        }),
      ],
      labels,
    )
    expect(objectFor(linked, 'parent')).toBe(
      'https://datatracker.ietf.org/group/wit/',
    )
    expect(objectFor(linked, 'homepage')).toBe('https://httpwg.org/')
    expect(objectFor(linked, 'githubOrg')).toBe('https://github.com/httpwg/')
    expect(objectFor(linked, 'wiki')).toBe(
      'https://wiki.ietf.org/group/httpbis',
    )
    expect(objectFor(linked, 'listArchive')).toBe(
      'http://lists.w3.org/Archives/Public/ietf-http-wg/',
    )
  })
})

describe('ietf group validation', () => {
  test('rejects an empty list', () => {
    expect(() => validateGroups([])).toThrow('zero groups')
  })

  test('rejects duplicate ids and public URLs', () => {
    expect(() => validateGroups([group(), group()])).toThrow('duplicate')
  })

  test('rejects a homepage another SDO published', () => {
    expect(() =>
      validateGroups([group()], new Set([groupUri('httpbis')])),
    ).toThrow('already used by another SDO')
  })
})

// --- IRI hygiene ----------------------------------------------------------

import { absoluteUrl } from './activities.ts'

describe('absoluteUrl', () => {
  test('keeps real absolute URLs and mailto links', () => {
    expect(absoluteUrl('https://httpwg.org/')).toBe('https://httpwg.org/')
    expect(absoluteUrl(' mailto:ietf-http-wg@w3.org ')).toBe(
      'mailto:ietf-http-wg@w3.org',
    )
  })

  test('drops prose that only looks like a URL', () => {
    // Datatracker keeps these in list_archive for 8 groups; `new URL()` accepts
    // the opaque mailto: form and the spaces would break the N-Quads file.
    expect(
      absoluteUrl('mailto:snmpconf-request@snmp.com (index snmpconf in body)'),
    ).toBeUndefined()
    expect(
      absoluteUrl('ftp ftp.3com.com (login: ptopo, passwd: ptopo)'),
    ).toBeUndefined()
    expect(absoluteUrl('/pub/chronos @boombox.micro.umn.edu')).toBeUndefined()
  })

  test('drops empty values', () => {
    expect(absoluteUrl('   ')).toBeUndefined()
    expect(absoluteUrl(undefined)).toBeUndefined()
  })
})

// --- series stage ---------------------------------------------------------

import {
  buildSeriesQuads,
  seriesLabel,
  seriesUri,
  specUri,
  validateSeries,
  type IetfSeriesRef,
} from './analysis.ts'

const bcp14 = (over: Partial<IetfSeriesRef> = {}): IetfSeriesRef => ({
  name: 'bcp14',
  label: 'BCP 14',
  kind: 'bcp',
  uri: seriesUri('bcp14'),
  apiUrl: 'https://datatracker.ietf.org/api/v1/doc/document/bcp14/',
  members: ['rfc2119', 'rfc8174'],
  ...over,
})

describe('subseries labels', () => {
  test('derives display names from Datatracker document names', () => {
    expect(seriesLabel('bcp14')).toBe('BCP 14')
    expect(seriesLabel('std97')).toBe('STD 97')
    expect(seriesLabel('fyi36')).toBe('FYI 36')
    expect(seriesLabel('bcp100')).toBe('BCP 100')
  })

  test('rejects anything that is not a subseries name', () => {
    expect(seriesLabel('rfc9110')).toBeUndefined()
    expect(seriesLabel('bcp')).toBeUndefined()
    expect(seriesLabel('bcp14x')).toBeUndefined()
  })

  test('subjects live in the RFC Editor namespace', () => {
    expect(seriesUri('bcp14')).toBe('https://www.rfc-editor.org/info/bcp14/')
    expect(specUri('rfc2119')).toBe('https://www.rfc-editor.org/info/rfc2119/')
  })
})

describe('ietf series quads', () => {
  test('types the node and links every member RFC', () => {
    const quads = buildSeriesQuads([bcp14()])
    const types = quads
      .filter((q) => q.predicate.value.endsWith('#type'))
      .map((q) => q.object.value)
    expect(types).toEqual(['http://example.org#SpecificationSeries'])

    const members = quads
      .filter((q) => q.predicate.value === 'http://example.org#hasSpecification')
      .map((q) => q.object.value)
    expect(members).toEqual([
      'https://www.rfc-editor.org/info/rfc2119/',
      'https://www.rfc-editor.org/info/rfc8174/',
    ])

    const bySubject = quads[0]?.subject.value
    expect(bySubject).toBe('https://www.rfc-editor.org/info/bcp14/')
    const predicates = quads.map((q) => q.predicate.value.split('#').at(-1))
    expect(predicates).toContain('sdo')
    expect(predicates).toContain('shortname')
    expect(predicates).toContain('landingPage')
    expect(predicates).toContain('ietfApiUrl')
  })

  test('emits the label as ex:name', () => {
    const quads = buildSeriesQuads([bcp14()])
    const name = quads.find((q) => q.predicate.value === 'http://example.org#name')
    expect(name?.object.value).toBe('BCP 14')
  })
})

describe('ietf series validation', () => {
  test('rejects an empty list', () => {
    expect(() => validateSeries([])).toThrow('zero series')
  })

  test('rejects a subseries without members', () => {
    expect(() => validateSeries([bcp14({ members: [] })])).toThrow(
      'no member documents',
    )
  })

  test('rejects an unexpected name and duplicates', () => {
    expect(() => validateSeries([bcp14({ name: 'rfc9110' })])).toThrow(
      'unexpected subseries name',
    )
    expect(() => validateSeries([bcp14(), bcp14()])).toThrow('duplicate')
  })
})

// --- specs stage ----------------------------------------------------------

import {
  buildSpecQuads,
  draftNameFromIndex,
  rawDateFromParts,
  rfcNumberFromDocId,
  validateSpecs,
  type IetfSpecRef,
} from './analysis.ts'
import { buildIetfSpecs } from './activities.ts'

const rfc9110 = (over: Partial<IetfSpecRef> = {}): IetfSpecRef => ({
  name: 'rfc9110',
  number: 9110,
  uri: specUri('rfc9110'),
  apiUrl: 'https://datatracker.ietf.org/api/v1/doc/document/rfc9110/',
  title: 'HTTP Semantics',
  status: 'INTERNET STANDARD',
  stream: 'IETF',
  date: '2022-06',
  pages: '194',
  doi: '10.17487/RFC9110',
  errata: 'https://www.rfc-editor.org/errata/rfc9110',
  draft: 'draft-ietf-httpbis-semantics',
  groupUri: 'https://datatracker.ietf.org/group/httpbis/',
  seriesUri: 'https://www.rfc-editor.org/info/std97/',
  obsoletes: [specUri('rfc7230')],
  obsoletedBy: [],
  updates: [specUri('rfc3864')],
  updatedBy: [],
  ...over,
})

const specPredicates = (quads: ReturnType<typeof buildSpecQuads>) =>
  quads.map((q) => q.predicate.value.replace('http://example.org#', 'ex:'))

describe('rfc index helpers', () => {
  test('builds raw dates', () => {
    expect(rawDateFromParts('June', '2022')).toBe('2022-06')
    expect(rawDateFromParts('January', '1997', '15')).toBe('1997-01-15')
    expect(rawDateFromParts('', '2022')).toBeUndefined()
    expect(rawDateFromParts('June', 'n/a')).toBeUndefined()
  })

  test('parses rfc numbers from doc ids', () => {
    expect(rfcNumberFromDocId('RFC9110')).toBe(9110)
    expect(rfcNumberFromDocId('RFC0911')).toBe(911)
    expect(rfcNumberFromDocId('BCP14')).toBeUndefined()
    expect(rfcNumberFromDocId(undefined)).toBeUndefined()
  })

  test('strips the revision from a draft name', () => {
    expect(draftNameFromIndex('draft-ietf-httpbis-semantics-19')).toBe(
      'draft-ietf-httpbis-semantics',
    )
    expect(draftNameFromIndex('')).toBeUndefined()
  })
})

describe('ietf spec quads', () => {
  test('emits the specification node with provenance', () => {
    const quads = buildSpecQuads([rfc9110()])
    const predicates = specPredicates(quads)
    for (const expected of [
      'ex:sdo',
      'ex:name',
      'ex:shortname',
      'ex:landingPage',
      'ex:ietfApiUrl',
      'ex:status',
      'ex:stream',
      'ex:doi',
      'ex:errata',
      'ex:draft',
      'ex:series',
    ]) {
      expect(predicates).toContain(expected)
    }
    const draft = quads.find((q) => q.predicate.value.endsWith('#draft'))
    expect(draft?.object.value).toBe(
      'https://datatracker.ietf.org/doc/draft-ietf-httpbis-semantics/',
    )
  })

  test('links the owning group to the spec', () => {
    const quads = buildSpecQuads([rfc9110()])
    const edge = quads.find((q) => q.predicate.value.endsWith('#specification'))
    expect(edge?.subject.value).toBe(
      'https://datatracker.ietf.org/group/httpbis/',
    )
    expect(edge?.object.value).toBe(specUri('rfc9110'))
  })

  test('emits obsoletes and updates as spec IRIs', () => {
    const quads = buildSpecQuads([rfc9110()])
    const targets = (predicate: string) =>
      quads
        .filter((q) => q.predicate.value.endsWith(`#${predicate}`))
        .map((q) => q.object.value)
    expect(targets('obsoletes')).toEqual([specUri('rfc7230')])
    expect(targets('updates')).toEqual([specUri('rfc3864')])
  })

  test('omits optional predicates when the index has no value', () => {
    const predicates = specPredicates(
      buildSpecQuads([
        rfc9110({
          status: undefined,
          stream: undefined,
          date: undefined,
          pages: undefined,
          doi: undefined,
          errata: undefined,
          draft: undefined,
          seriesUri: undefined,
          groupUri: undefined,
        }),
      ]),
    )
    for (const absent of [
      'ex:status',
      'ex:stream',
      'ex:doi',
      'ex:errata',
      'ex:draft',
      'ex:series',
      'ex:specification',
    ]) {
      expect(predicates).not.toContain(absent)
    }
  })
})

describe('merging documents with the index', () => {
  const document = (over: Record<string, unknown> = {}) => ({
    name: 'rfc9110',
    title: 'HTTP (datatracker title)',
    group: '/api/v1/group/group/1718/',
    rfc_number: 9110,
    resource_uri: '/api/v1/doc/document/rfc9110/',
    ...over,
  })
  const indexEntry = (over: Record<string, unknown> = {}) => ({
    number: 9110,
    title: 'HTTP Semantics',
    status: 'INTERNET STANDARD',
    stream: 'IETF',
    date: '2022-06',
    pages: '194',
    doi: '10.17487/RFC9110',
    errata: 'https://www.rfc-editor.org/errata/rfc9110',
    draft: 'draft-ietf-httpbis-semantics',
    obsoletes: ['rfc7230', 'rfc9110'],
    obsoletedBy: [],
    updates: [],
    updatedBy: [],
    authors: [],
    ...over,
  })

  test('prefers index metadata and drops self references', () => {
    const { specs, stats } = buildIetfSpecs(
      [document()],
      new Map([[9110, indexEntry()]]),
      new Map([[1718, 'https://datatracker.ietf.org/group/httpbis/']]),
      new Map([[specUri('rfc9110'), 'https://www.rfc-editor.org/info/std97/']]),
    )
    expect(specs).toHaveLength(1)
    const spec = specs[0]!
    expect(spec.title).toBe('HTTP Semantics')
    expect(spec.obsoletes).toEqual([specUri('rfc7230')])
    expect(spec.seriesUri).toBe('https://www.rfc-editor.org/info/std97/')
    expect(stats).toMatchObject({
      documents: 1,
      withSeries: 1,
      missingIndex: [],
      withoutGroup: [],
    })
  })

  test('reports documents without index entry or group', () => {
    const { specs, stats } = buildIetfSpecs(
      [document({ rfc_number: 8446, name: 'rfc8446', group: null })],
      new Map(),
      new Map(),
      new Map(),
    )
    expect(specs[0]?.title).toBe('HTTP (datatracker title)')
    expect(specs[0]?.groupUri).toBeUndefined()
    expect(stats.missingIndex).toEqual(['rfc8446'])
    expect(stats.withoutGroup).toEqual(['rfc8446'])
    expect(stats.withSeries).toBe(0)
  })
})

describe('ietf spec validation', () => {
  test('rejects an empty list and missing titles', () => {
    expect(() => validateSpecs([])).toThrow('zero specifications')
    expect(() => validateSpecs([rfc9110({ title: '  ' })])).toThrow(
      'without a title',
    )
  })

  test('rejects duplicate names, uris and cross-source collisions', () => {
    expect(() => validateSpecs([rfc9110(), rfc9110()])).toThrow('duplicate')
    expect(() =>
      validateSpecs([rfc9110()], new Set([specUri('rfc9110')])),
    ).toThrow('already used by another source')
  })
})

// --- spec-people stage ----------------------------------------------------

import {
  buildAuthorPersonQuads,
  buildAuthorshipQuads,
  importableSpecrefQuads,
  matchIndexAuthors,
  validateAuthorship,
  type AuthorRow,
  type IetfPersonNode,
  type IndexAuthor,
} from './analysis.ts'
import { buildSpecrefQuads } from '../specref/metadata.ts'

const indexAuthor = (name: string, editor = false): IndexAuthor => ({ name, editor })
const authorRow = (personId: number, personName: string, order = 0): AuthorRow => ({
  personId,
  personName,
  order,
})

describe('author matching', () => {
  test('matches by position when the counts agree', () => {
    const { matched, unmatched } = matchIndexAuthors(
      [indexAuthor('R. Fielding', true), indexAuthor('M. Nottingham', true)],
      [authorRow(16400, 'Roy T. Fielding', 1), authorRow(103881, 'Mark Nottingham', 2)],
    )
    expect(unmatched).toEqual([])
    expect(matched.map((author) => author.personId)).toEqual([16400, 103881])
    expect(matched.every((author) => author.editor)).toBe(true)
  })

  test('falls back to surname + initial when the counts differ', () => {
    const { matched, unmatched } = matchIndexAuthors(
      [indexAuthor('R.M. Hinden'), indexAuthor('M. Muuss'), indexAuthor('J.K. Reynolds')],
      [authorRow(2804, 'Joyce K. Reynolds', 3), authorRow(2793, 'Bob Hinden', 1)],
    )
    expect(matched.map((author) => author.indexName)).toEqual([
      'R.M. Hinden',
      'J.K. Reynolds',
    ])
    expect(unmatched).toEqual(['M. Muuss'])
  })

  test('ignores honorifics and suffixes when comparing names', () => {
    const { matched } = matchIndexAuthors(
      [indexAuthor('J. Postel')],
      [authorRow(419, 'Dr. Jon Postel')],
    )
    expect(matched.map((author) => author.personId)).toEqual([419])
  })

  test('does not guess between several people with the same surname', () => {
    const { matched, unmatched } = matchIndexAuthors(
      [indexAuthor('X. Crocker')],
      [authorRow(1, 'Dave Crocker'), authorRow(2, 'Steve Crocker')],
    )
    expect(matched).toEqual([])
    expect(unmatched).toEqual(['X. Crocker'])
  })
})

const person = (over: Partial<IetfPersonNode> = {}): IetfPersonNode => ({
  uri: 'urn:uuid:11111111-1111-1111-1111-111111111111',
  personId: 3,
  name: 'Dr. Vinton G. Cerf',
  apiUrl: 'https://datatracker.ietf.org/api/v1/person/person/3/',
  affiliations: [],
  ...over,
})

describe('author person quads', () => {
  test('emits the person with its silo id and provenance', () => {
    const quads = buildAuthorPersonQuads([
      person({
        affiliations: ['Google', 'Internet Society'],
        githubUsername: 'vgcerf',
        orcid: '0000-0001-2345-6789',
        logo: 'https://example.org/photo.jpg',
      }),
    ])
    const objects = (predicate: string) =>
      quads
        .filter((q) => q.predicate.value.endsWith(`#${predicate}`))
        .map((q) => q.object.value)
    expect(objects('siloId')).toEqual([
      'urn:ietf:person:3',
      'orcid:0000-0001-2345-6789',
    ])
    expect(objects('siloUsername')).toEqual(['github:vgcerf'])
    expect(objects('affiliationName')).toEqual(['Google', 'Internet Society'])
    expect(objects('ietfApiUrl')).toEqual([
      'https://datatracker.ietf.org/api/v1/person/person/3/',
    ])
    expect(objects('logo')).toEqual(['https://example.org/photo.jpg'])
  })
})

describe('authorship edges', () => {
  const edges = [
    { specUri: specUri('rfc9110'), personUri: person().uri, editor: true },
    { specUri: specUri('rfc9110'), personUri: 'urn:uuid:22222222-2222-2222-2222-222222222222', editor: false },
  ]

  test('uses bibo:editor for editors and dcterms:creator otherwise', () => {
    const quads = buildAuthorshipQuads(edges)
    expect(quads.map((q) => q.predicate.value)).toEqual([
      'http://purl.org/ontology/bibo/editor',
      'http://purl.org/dc/terms/creator',
    ])
    expect(quads.every((q) => q.object.termType === 'NamedNode')).toBe(true)
  })

  test('rejects unknown specs, unknown people and empty input', () => {
    const specs = new Set([specUri('rfc9110')])
    const people = new Set([person().uri, 'urn:uuid:22222222-2222-2222-2222-222222222222'])
    expect(() => validateAuthorship([], specs, people)).toThrow('zero authorship')
    expect(() =>
      validateAuthorship(edges, new Set([specUri('rfc1')]), people),
    ).toThrow('unpublished spec')
    expect(() =>
      validateAuthorship(edges, specs, new Set([person().uri])),
    ).toThrow('unknown person')
    expect(() => validateAuthorship(edges, specs, people)).not.toThrow()
  })

  test('strips Specref author quads before importing metadata', () => {
    const raw = buildSpecrefQuads(specUri('rfc9110'), {
      id: 'rfc9110',
      title: 'HTTP Semantics',
      authors: ['R. Fielding', 'M. Nottingham'],
      href: 'https://www.rfc-editor.org/info/rfc9110/',
      status: 'Internet Standard',
    })
    const imported = importableSpecrefQuads(raw)
    const predicates = imported.map((q) => q.predicate.value)
    expect(predicates).toContain('http://example.org#specrefId')
    expect(predicates).toContain('http://purl.org/ontology/bibo/status')
    expect(predicates).not.toContain('http://purl.org/dc/terms/creator')
    expect(predicates).not.toContain('https://w3id.org/specref/etAl')
  })
})

// --- citations stage ------------------------------------------------------

import {
  buildCitationQuads,
  resolveCitations,
  validateCitations,
  type RawCitation,
  type SeriesMembers,
} from './analysis.ts'

const specs = new Set([
  specUri('rfc9110'),
  specUri('rfc2223'),
  specUri('rfc2119'),
  specUri('rfc8174'),
])
const series: SeriesMembers = {
  uri: 'https://www.rfc-editor.org/info/bcp14/',
  members: [specUri('rfc2119'), specUri('rfc8174')],
}
const seriesByName = new Map([['bcp14', series]])
const cite = (
  source: string,
  target: string,
  nature: 'normative' | 'informative' = 'normative',
): RawCitation => ({ source, target, nature })

describe('citation resolution', () => {
  test('links a published spec target directly', () => {
    const { edges, counts } = resolveCitations(
      [cite('rfc9110', 'rfc2119')],
      specs,
      seriesByName,
    )
    expect(edges).toEqual([
      {
        source: specUri('rfc9110'),
        target: specUri('rfc2119'),
        nature: 'normative',
      },
    ])
    expect(counts.edges).toBe(1)
    expect(counts.sources).toBe(1)
  })

  test('fans a subseries target out to the series and its members', () => {
    const { edges, counts } = resolveCitations(
      [cite('rfc2223', 'bcp14', 'informative')],
      specs,
      seriesByName,
    )
    expect(edges.map((edge) => edge.target)).toEqual([
      'https://www.rfc-editor.org/info/bcp14/',
      specUri('rfc2119'),
      specUri('rfc8174'),
    ])
    expect(counts.seriesExpanded).toBe(2)
    expect(counts.informative).toBe(3)
  })

  test('drops self references, duplicates and keeps normative on conflict', () => {
    const { edges, counts } = resolveCitations(
      [
        cite('rfc9110', 'rfc9110'),
        cite('rfc9110', 'rfc2119', 'informative'),
        cite('rfc9110', 'rfc2119', 'informative'),
        cite('rfc9110', 'rfc2119'),
      ],
      specs,
      seriesByName,
    )
    expect(counts.selfReferences).toBe(1)
    expect(counts.duplicates).toBe(1)
    expect(counts.conflicts).toBe(1)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.nature).toBe('normative')
  })

  test('reports targets that are not in the catalog', () => {
    const { edges, counts, outOfCatalog } = resolveCitations(
      [
        cite('rfc9110', 'draft-ietf-tls-esni'),
        cite('rfc2223', 'draft-ietf-tls-esni'),
        cite('rfc9110', 'bcp66'),
      ],
      specs,
      seriesByName,
    )
    expect(edges).toEqual([])
    expect(counts.outOfCatalogTargets).toBe(2)
    expect(counts.outOfCatalogRows).toBe(3)
    expect(outOfCatalog).toEqual([
      ['draft-ietf-tls-esni', 2],
      ['bcp66', 1],
    ])
  })

  test('counts sources that are not published specs', () => {
    const { counts } = resolveCitations(
      [cite('rfc99999', 'rfc2119')],
      specs,
      seriesByName,
    )
    expect(counts.missingSource).toBe(1)
    expect(counts.edges).toBe(0)
  })
})

describe('citation quads', () => {
  test('uses the shared normative/informative predicates', () => {
    const quads = buildCitationQuads([
      { source: specUri('rfc9110'), target: specUri('rfc2119'), nature: 'normative' },
      { source: specUri('rfc9110'), target: specUri('rfc8174'), nature: 'informative' },
    ])
    expect(quads.map((q) => q.predicate.value)).toEqual([
      'http://example.org#normativeRef',
      'http://example.org#informativeRef',
    ])
    expect(quads.every((q) => q.object.termType === 'NamedNode')).toBe(true)
  })

  test('rejects edges outside the catalog and empty input', () => {
    const edge = {
      source: specUri('rfc9110'),
      target: specUri('rfc2119'),
      nature: 'normative' as const,
    }
    expect(() => validateCitations([], specs)).toThrow('zero citation edges')
    expect(() =>
      validateCitations([{ ...edge, source: specUri('rfc99999') }], specs),
    ).toThrow('outside the catalog')
    expect(() =>
      validateCitations([{ ...edge, target: specUri('rfc99999') }], specs),
    ).toThrow('outside the catalog')
    expect(() =>
      validateCitations([{ ...edge, target: series.uri }], specs, new Set([series.uri])),
    ).not.toThrow()
  })
})
