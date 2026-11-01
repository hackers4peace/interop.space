import { describe, expect, test } from 'bun:test'
import {
  W3C_AFFILIATION_SILO,
  W3C_GROUP_SILO,
  W3C_PERSON_SILO,
  parseW3cSiloId,
  w3cSiloPrefixFilter,
} from './silo-ids.ts'

describe('W3C silo ids', () => {
  test('are URNs (ietf-plan.md §9.14)', () => {
    expect(W3C_PERSON_SILO).toBe('urn:w3c:person:')
    expect(W3C_GROUP_SILO).toBe('urn:w3c:group:')
    expect(W3C_AFFILIATION_SILO).toBe('urn:w3c:affiliation:')
  })

  test('parses the URN spelling', () => {
    expect(parseW3cSiloId('urn:w3c:person:66644', 'person')).toBe(66644)
    expect(parseW3cSiloId('urn:w3c:group:1234', 'group')).toBe(1234)
    expect(parseW3cSiloId('urn:w3c:affiliation:6383', 'affiliation')).toBe(6383)
  })

  test('still parses the pre-migration spelling for a resumed crawl', () => {
    expect(parseW3cSiloId('w3c:66644', 'person')).toBe(66644)
    expect(parseW3cSiloId('w3c:1234', 'group')).toBe(1234)
    expect(parseW3cSiloId('w3c-affiliation:6383', 'affiliation')).toBe(6383)
  })

  test('rejects other families and non-numeric ids', () => {
    expect(parseW3cSiloId('urn:w3c:group:1234', 'person')).toBeUndefined()
    expect(parseW3cSiloId('urn:w3c:person:1234', 'group')).toBeUndefined()
    expect(parseW3cSiloId('github:123', 'person')).toBeUndefined()
    expect(parseW3cSiloId('urn:w3c:person:abc', 'person')).toBeUndefined()
    expect(parseW3cSiloId(undefined, 'person')).toBeUndefined()
  })

  test('filters accept both spellings so a mixed store is readable', () => {
    expect(w3cSiloPrefixFilter('?siloId', 'group')).toBe(
      'STRSTARTS(STR(?siloId), "urn:w3c:group:") || STRSTARTS(STR(?siloId), "w3c:")',
    )
    expect(w3cSiloPrefixFilter('?siloId', 'affiliation')).toBe(
      'STRSTARTS(STR(?siloId), "urn:w3c:affiliation:") || STRSTARTS(STR(?siloId), "w3c-affiliation:")',
    )
  })
})
