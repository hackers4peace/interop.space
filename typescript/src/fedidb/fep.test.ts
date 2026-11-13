import { describe, expect, test } from 'bun:test'
import type { Quad } from 'n3'
import {
  buildFepQuads,
  FEP_ARCHIVE_URL,
  FEP_INDEX_URL,
  FEP_REPO,
  fepLabel,
  fepSourceUrl,
  fepUri,
  latestFepDate,
  parseFepDocument,
  parseFepIndex,
  parseImplementationEntry,
  parseTar,
} from './fep.ts'

const EX = 'http://example.org#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

const values = (quads: Quad[], predicate: string) =>
  quads
    .filter((entry) => entry.predicate.value === predicate)
    .map((entry) => entry.object.value)

const first = (quads: Quad[], predicate: string) =>
  quads.find((entry) => entry.predicate.value === predicate)?.object

const firstFor = (quads: Quad[], subject: string, predicate: string) =>
  quads.find(
    (entry) =>
      entry.subject.value === subject && entry.predicate.value === predicate,
  )?.object

const markdown = `---
slug: "8b32"
---
# FEP-8b32: Object Integrity Proofs

## Summary

Integrity proofs are sets of attributes that represent digital signatures.

## Implementations

- [Mastodon](https://github.com/mastodon/mastodon/pull/4687)
- Mitra
- Pleroma ([via MRF](https://example.org/mrf))

## Next section

Ignored.
`

describe('FEP index and documents', () => {
  test('parses index rows and rejects an empty document', () => {
    const rows = parseFepIndex(
      JSON.stringify([
        { slug: '8b32', title: 'Object Integrity Proofs', status: 'DRAFT' },
        { title: 'no slug' },
      ]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.slug).toBe('8b32')
    expect(() => parseFepIndex('[]')).toThrow('no proposals')
    expect(() => parseFepIndex('not json')).toThrow('invalid FEP index')
  })

  test('extracts summary and implementation entries', () => {
    const document = parseFepDocument('8b32', markdown)
    expect(document.summary).toBe(
      'Integrity proofs are sets of attributes that represent digital signatures.',
    )
    expect(document.implementations).toEqual([
      {
        label: 'Mastodon',
        url: 'https://github.com/mastodon/mastodon/pull/4687',
        index: 1,
      },
      { label: 'Mitra', url: undefined, index: 2 },
      {
        label: 'Pleroma (via MRF)',
        url: 'https://example.org/mrf',
        index: 3,
      },
    ])
  })

  test('parses one implementation bullet', () => {
    expect(parseImplementationEntry('- [Friendica](https://example.org/f) ', 4)).toEqual({
      label: 'Friendica',
      url: 'https://example.org/f',
      index: 4,
    })
    expect(
      parseImplementationEntry(
        '- [**FIRM ActivityPub Server**][FIRM] implements semantic routing.',
        1,
      ),
    ).toEqual({
      label: 'FIRM ActivityPub Server',
      url: undefined,
      index: 1,
    })
    expect(
      parseImplementationEntry(
        '- [flohmarkt]( https://codeberg.org/flohmarkt/flohmarkt )',
        2,
      ),
    ).toEqual({
      label: 'flohmarkt',
      url: 'https://codeberg.org/flohmarkt/flohmarkt',
      index: 2,
    })
  })

  test('builds canonical FEP and source identifiers', () => {
    expect(fepUri('7628')).toBe('https://w3id.org/fep/7628')
    expect(fepLabel('7628')).toBe('FEP-7628')
    expect(fepSourceUrl('7628')).toBe(
      'https://codeberg.org/fediverse/fep/raw/branch/main/fep/7628/fep-7628.md',
    )
  })
})

describe('FEP archive', () => {
  test('reads regular tar entries', () => {
    const encoder = new TextEncoder()
    const entry = (name: string, body: string) => {
      const header = new Uint8Array(512)
      header.set(encoder.encode(name), 0)
      header.set(
        encoder.encode(body.length.toString(8).padStart(11, '0') + '\0'),
        124,
      )
      header[156] = '0'.charCodeAt(0)
      const data = encoder.encode(body)
      const padded = new Uint8Array(Math.ceil(data.length / 512) * 512)
      padded.set(data)
      return [...header, ...padded]
    }
    const archive = new Uint8Array([
      ...entry('fep/index.json', '[{"slug":"7628"}]'),
      ...entry('fep/fep/7628/fep-7628.md', '# FEP-7628'),
      ...new Uint8Array(1024),
    ])
    const files = parseTar(archive)
    expect([...files.keys()]).toEqual([
      'fep/index.json',
      'fep/fep/7628/fep-7628.md',
    ])
    expect(new TextDecoder().decode(files.get('fep/index.json'))).toBe(
      '[{"slug":"7628"}]',
    )
  })
})

describe('FEP quads', () => {
  test('emits metadata, summary, links and implementations', () => {
    const row = {
      slug: '8b32',
      authors: ['silverpill <@silverpill@mitra.social>'],
      type: 'implementation',
      status: 'DRAFT',
      dateReceived: '2022-11-12',
      trackingIssue: 'https://codeberg.org/fediverse/fep/issues/29',
      discussionsTo: 'https://socialhub.activitypub.rocks/t/fep-8b32/2725',
      title: 'Object Integrity Proofs',
      implementations: 3,
      relatedFeps: ['FEP-7628'],
      tags: ['security'],
    }
    const document = parseFepDocument('8b32', markdown)
    const quads = buildFepQuads([row], new Map([['8b32', document]]))
    const node = fepUri('8b32')

    expect(
      quads.filter(
        (entry) =>
          entry.subject.value === node && entry.predicate.value === RDF_TYPE,
      ).map((entry) => entry.object.value),
    ).toEqual([`${EX}FEP`])
    expect(firstFor(quads, node, `${EX}fepId`)?.value).toBe('8b32')
    expect(firstFor(quads, node, `${EX}name`)?.value).toBe('FEP-8b32')
    expect(firstFor(quads, node, `${EX}title`)?.value).toBe(
      'Object Integrity Proofs',
    )
    expect(firstFor(quads, node, `${EX}status`)?.value).toBe('DRAFT')
    expect(firstFor(quads, node, `${EX}fepType`)?.value).toBe('implementation')
    expect(
      firstFor(quads, node, 'http://purl.org/dc/terms/description')?.value,
    ).toBe(
      'Integrity proofs are sets of attributes that represent digital signatures.',
    )
    expect(firstFor(quads, node, `${EX}author`)?.value).toBe(
      'silverpill <@silverpill@mitra.social>',
    )
    expect(firstFor(quads, node, `${EX}authorName`)?.value).toBe('silverpill')
    expect(firstFor(quads, node, `${EX}authorContact`)?.value).toBe(
      '@silverpill@mitra.social',
    )
    expect(values(quads, `${EX}relatedFep`)).toContain(
      'https://w3id.org/fep/7628',
    )
    expect(firstFor(quads, node, `${EX}fepSource`)?.value).toBe(
      fepSourceUrl('8b32'),
    )
    expect(
      firstFor(quads, node, 'http://purl.org/dc/terms/source')?.value,
    ).toBe(FEP_REPO)
    expect(
      firstFor(quads, node, 'http://purl.org/dc/terms/license')?.value,
    ).toBe('https://creativecommons.org/publicdomain/zero/1.0/')
    expect(firstFor(quads, node, `${EX}implementations`)?.value).toBe('3')
    expect(values(quads, `${EX}implementation`)).toHaveLength(3)
    expect(
      quads.some(
        (entry) =>
          entry.subject.value === 'urn:fedidb:fep-implementation:8b32:1' &&
          entry.predicate.value === `${EX}name` &&
          entry.object.value === 'Mastodon',
      ),
    ).toBe(true)
  })

  test('adds the source dataset, license and row count', () => {
    const rows = [
      { slug: 'a4ed', status: 'FINAL', dateReceived: '2020-10-16' },
      { slug: '7628', status: 'FINAL', dateFinalized: '2026-08-26' },
    ]
    const quads = buildFepQuads(rows)
    expect(
      quads.filter(
        (entry) =>
          entry.subject.value === FEP_REPO &&
          entry.predicate.value === RDF_TYPE,
      ).map((entry) => entry.object.value),
    ).toEqual(['http://www.w3.org/ns/dcat#Dataset'])
    expect(firstFor(quads, FEP_REPO, `${EX}rowCount`)?.value).toBe('2')
    expect(
      quads.find(
        (entry) =>
          entry.subject.value === FEP_REPO &&
          entry.predicate.value === 'http://purl.org/dc/terms/modified',
      )?.object.value,
    ).toBe('2026-08-26')
    expect(
      quads.some(
        (entry) =>
          entry.subject.value === FEP_REPO &&
          entry.predicate.value === 'http://www.w3.org/ns/dcat#downloadURL' &&
          entry.object.value === FEP_ARCHIVE_URL,
      ),
    ).toBe(true)
    expect(
      quads.some(
        (entry) =>
          entry.subject.value === FEP_REPO &&
          entry.predicate.value === `${EX}fepIndex` &&
          entry.object.value === FEP_INDEX_URL,
      ),
    ).toBe(true)
    expect(latestFepDate(rows)).toBe('2026-08-26')
  })

  test('infers informational type and tolerates missing optional fields', () => {
    const quads = buildFepQuads([{ slug: 'a4ed', category: 'informational' }])
    expect(
      firstFor(quads, fepUri('a4ed'), `${EX}fepType`)?.value,
    ).toBe('informational')
    expect(
      firstFor(quads, fepUri('a4ed'), `${EX}implementations`),
    ).toBeUndefined()
    expect(values(quads, `${EX}implementation`)).toHaveLength(0)
  })
})
