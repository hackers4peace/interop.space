import { describe, expect, test } from 'bun:test'
import {
  buildCrossQuads,
  ietfTargetFromUrl,
  linkCrossSdo,
  w3cShortnameFromUrl,
  type CrossIndexes,
} from './crossref.ts'
import type { DumpReference } from './catalog/references.ts'

describe('ietf targets from URLs', () => {
  test('recognises every RFC URL shape seen in W3C specs', () => {
    const cases: [string, string][] = [
      ['https://www.rfc-editor.org/info/rfc2119/', 'rfc2119'],
      ['https://www.rfc-editor.org/rfc/rfc8446.html', 'rfc8446'],
      ['https://tools.ietf.org/html/rfc8288', 'rfc8288'],
      ['https://datatracker.ietf.org/doc/html/rfc6455', 'rfc6455'],
      ['https://datatracker.ietf.org/doc/rfc2616/', 'rfc2616'],
      ['https://www.ietf.org/rfc/rfc2396.txt', 'rfc2396'],
      ['https://doi.org/10.17487/RFC7159', 'rfc7159'],
      ['https://httpwg.org/specs/rfc9110.html', 'rfc9110'],
    ]
    for (const [url, name] of cases) {
      expect(ietfTargetFromUrl(url)).toEqual({ kind: 'rfc', name })
    }
  })

  test('recognises subseries and drafts', () => {
    expect(ietfTargetFromUrl('https://www.rfc-editor.org/info/bcp14')).toEqual({
      kind: 'bcp',
      name: 'bcp14',
    })
    expect(ietfTargetFromUrl('https://www.rfc-editor.org/info/std66/')).toEqual({
      kind: 'std',
      name: 'std66',
    })
    expect(
      ietfTargetFromUrl('https://datatracker.ietf.org/doc/draft-ietf-httpbis-x/'),
    ).toEqual({ kind: 'draft', name: 'draft-ietf-httpbis-x' })
  })

  test('ignores unrelated hosts', () => {
    expect(ietfTargetFromUrl('https://www.w3.org/TR/did-core/')).toBeUndefined()
    expect(ietfTargetFromUrl('https://example.org/rfc2119')).toBeUndefined()
    expect(ietfTargetFromUrl('not a url')).toBeUndefined()
  })
})

describe('w3c shortnames from URLs', () => {
  test('maps plain, dated and nested TR paths', () => {
    expect(w3cShortnameFromUrl('https://www.w3.org/TR/did-core/')).toBe('did-core')
    expect(
      w3cShortnameFromUrl('https://www.w3.org/TR/2022/REC-did-core-20220719/'),
    ).toBe('did-core')
    expect(
      w3cShortnameFromUrl('https://www.w3.org/TR/2021/CRD-json-ld11-20210525/'),
    ).toBe('json-ld11')
    expect(
      w3cShortnameFromUrl('http://www.w3.org/TR/xhtml-basic/xhtml-basic10.dtd'),
    ).toBe('xhtml-basic')
  })

  test('ignores TR indexes and other hosts', () => {
    expect(w3cShortnameFromUrl('https://www.w3.org/TR/2012/')).toBeUndefined()
    expect(w3cShortnameFromUrl('https://www.w3.org/Consortium/')).toBeUndefined()
    expect(w3cShortnameFromUrl('https://rfc-editor.org/info/rfc2119')).toBeUndefined()
  })
})

const reference = (
  source: string,
  url: string,
  nature: 'normative' | 'informative' = 'normative',
): DumpReference => ({ source, url, nature })

const indexes: CrossIndexes = {
  ietfByShortname: new Map([
    ['rfc2119', 'https://www.rfc-editor.org/info/rfc2119/'],
    ['rfc8174', 'https://www.rfc-editor.org/info/rfc8174/'],
    ['bcp14', 'https://www.rfc-editor.org/info/bcp14/'],
  ]),
  w3cByShortname: new Map([
    ['did-core', 'https://www.w3.org/TR/did-core/'],
    ['vc-data-model-2.0', 'https://www.w3.org/TR/vc-data-model-2.0/'],
  ]),
}

describe('cross-SDO linking', () => {
  test('links both directions and keeps the nature', () => {
    const { edges, counts } = linkCrossSdo(
      [
        reference('https://www.w3.org/TR/did-core/', 'https://www.rfc-editor.org/info/rfc2119/'),
        reference('https://www.w3.org/TR/vc-data-model-2.0/', 'https://www.rfc-editor.org/info/bcp14', 'informative'),
      ],
      [
        reference('https://www.rfc-editor.org/info/rfc8174/', 'https://www.w3.org/TR/did-core/'),
      ],
      indexes,
    )
    expect(edges).toEqual([
      {
        source: 'https://www.rfc-editor.org/info/rfc8174/',
        target: 'https://www.w3.org/TR/did-core/',
        nature: 'normative',
        origin: 'ietf→w3c',
      },
      {
        source: 'https://www.w3.org/TR/did-core/',
        target: 'https://www.rfc-editor.org/info/rfc2119/',
        nature: 'normative',
        origin: 'w3c→ietf',
      },
      {
        source: 'https://www.w3.org/TR/vc-data-model-2.0/',
        target: 'https://www.rfc-editor.org/info/bcp14/',
        nature: 'informative',
        origin: 'w3c→ietf',
      },
    ])
    expect(counts).toMatchObject({
      edges: 3,
      w3cToIetf: 2,
      ietfToW3c: 1,
      normative: 2,
      informative: 1,
    })
  })

  test('dedupes, keeps normative and drops self references', () => {
    const { edges, counts } = linkCrossSdo(
      [
        reference('https://www.w3.org/TR/did-core/', 'https://www.rfc-editor.org/info/rfc2119/', 'informative'),
        reference('https://www.w3.org/TR/did-core/', 'https://www.rfc-editor.org/info/rfc2119/', 'informative'),
        reference('https://www.w3.org/TR/did-core/', 'https://www.rfc-editor.org/info/rfc2119/', 'normative'),
        reference('https://www.rfc-editor.org/info/rfc2119/', 'https://www.rfc-editor.org/info/rfc8174/'),
      ],
      [],
      indexes,
    )
    expect(edges).toHaveLength(1)
    expect(edges[0]?.nature).toBe('normative')
    expect(counts.duplicates).toBe(1)
    expect(counts.conflicts).toBe(1)
  })

  test('reports targets that are not in either catalog', () => {
    const { result } = { result: linkCrossSdo(
      [reference('https://www.w3.org/TR/did-core/', 'https://www.ietf.org/archive/id/draft-ietf-x-01.html')],
      [
        reference('https://www.rfc-editor.org/info/rfc2119/', 'https://mimesniff.spec.whatwg.org/'),
        reference('https://www.rfc-editor.org/info/rfc2119/', 'https://www.w3.org/TR/unknown-spec/'),
      ],
      indexes,
    ) }
    expect(result.edges).toEqual([])
    expect(result.ietfUnmatched).toEqual([['draft-ietf-x-01', 1]])
    expect(result.w3cUnmatchedHosts).toContainEqual(['mimesniff.spec.whatwg.org', 1])
    expect(result.w3cUnmatchedHosts).toContainEqual(['w3.org/TR/unknown-spec', 1])
  })

  test('emits the shared reference predicates', () => {
    const quads = buildCrossQuads([
      {
        source: 'https://www.w3.org/TR/did-core/',
        target: 'https://www.rfc-editor.org/info/rfc2119/',
        nature: 'normative',
        origin: 'w3c→ietf',
      },
      {
        source: 'https://www.w3.org/TR/did-core/',
        target: 'https://www.rfc-editor.org/info/rfc8174/',
        nature: 'informative',
        origin: 'w3c→ietf',
      },
    ])
    expect(quads.map((q) => q.predicate.value)).toEqual([
      'http://example.org#normativeRef',
      'http://example.org#informativeRef',
    ])
  })
})
