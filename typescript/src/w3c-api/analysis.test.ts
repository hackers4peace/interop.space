import { beforeEach, describe, expect, test } from 'bun:test'
import {
  buildEditorQuads,
  buildGroupQuads,
  buildParticipantQuads,
  buildStartPersonQuads,
  type W3cGroupRef,
  type W3cSpecification,
} from './analysis.ts'
import { resetIdentityCache, resolvePerson } from './identity.ts'

const EX = 'http://example.org#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

const group: W3cGroupRef = {
  uri: 'https://www.w3.org/groups/wg/example/',
  homepage: 'https://www.w3.org/groups/wg/example/',
  apiUrl: 'https://api.w3.org/groups/wg/example',
  id: 1,
  name: 'Example Working Group',
}

const specification: W3cSpecification = {
  uri: 'https://www.w3.org/TR/example/',
  apiUrl: 'https://api.w3.org/specifications/example',
  title: 'Example',
}

beforeEach(() => resetIdentityCache())

describe('buildStartPersonQuads', () => {
  test('uses a local urn:uuid subject and keeps external ids', () => {
    const quads = buildStartPersonQuads({
      name: 'Test Person',
      githubId: '123',
      githubUsername: 'test',
      w3cId: 46577,
      w3cApiUrl: 'https://api.w3.org/users/opaque',
    })
    const subject = quads[0]?.subject.value
    expect(subject).toMatch(/^urn:uuid:/)
    const predicates = new Set(quads.map((item) => item.predicate.value))
    expect(predicates).toContain(`${EX}w3cApiUrl`)
    expect(predicates).toContain(`${EX}siloId`)
    expect(predicates).toContain(`${EX}name`)
    const siloIds = quads
      .filter((item) => item.predicate.value === `${EX}siloId`)
      .map((item) => item.object.value)
    expect(siloIds).toContain('urn:w3c:person:46577')
    expect(siloIds).toContain('github:123')
  })
})

describe('buildGroupQuads', () => {
  test('uses ex:Group and links the W3C SDO', () => {
    const quads = buildGroupQuads([group])
    const subject = group.uri
    expect(
      quads.find(
        (item) =>
          item.subject.value === subject &&
          item.predicate.value === RDF_TYPE,
      )?.object.value,
    ).toBe(`${EX}Group`)
    expect(
      quads.find(
        (item) =>
          item.subject.value === subject && item.predicate.value === `${EX}sdo`,
      )?.object.value,
    ).toBe('https://www.w3.org/')
    expect(
      quads.some(
        (item) =>
          item.subject.value === subject &&
          item.predicate.value === RDF_TYPE &&
          item.object.value === `${EX}Organization`,
      ),
    ).toBe(false)
  })
})

describe('buildParticipantQuads', () => {
  test('links group members to the local person identity', () => {
    const quads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 46577,
              href: 'https://api.w3.org/users/opaque',
              name: 'Test Person',
              githubId: '123',
              githubUsername: 'test',
            },
          ],
        },
      ],
      new Set(),
    )
    const member = quads.find((item) => item.predicate.value === `${EX}member`)
    const personUri = member?.object.value
    expect(personUri).toMatch(/^urn:uuid:/)
    expect(
      quads.find(
        (item) =>
          item.subject.value === personUri &&
          item.predicate.value === RDF_TYPE,
      )?.object.value,
    ).toBe(`${EX}Person`)
    expect(
      quads.find(
        (item) =>
          item.subject.value === personUri &&
          item.predicate.value === `${EX}w3cApiUrl`,
      )?.object.value,
    ).toBe('https://api.w3.org/users/opaque')
  })
})

describe('known seed people', () => {
  test('keep their seed properties while still joining groups', () => {
    const identity = resolvePerson({
      w3cId: 46577,
      name: 'Participant Name',
    })
    const quads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 46577,
              href: 'https://api.w3.org/users/opaque',
              name: 'Participant Name',
            },
          ],
        },
      ],
      new Set([identity.id]),
    )
    expect(
      quads.find((item) => item.predicate.value === `${EX}member`)?.object.value,
    ).toBe(identity.id)
    expect(
      quads.some(
        (item) =>
          item.subject.value === identity.id &&
          item.predicate.value === `${EX}name`,
      ),
    ).toBe(false)
  })
})

describe('buildEditorQuads', () => {
  test('links editors to local identities and creates new people', () => {
    const quads = buildEditorQuads(
      [
        {
          specification,
          editors: [
            {
              id: 123,
              href: 'https://api.w3.org/users/opaque',
              name: 'Editor Person',
              githubId: '456',
              githubUsername: 'editor',
            },
          ],
        },
      ],
      new Set(),
    )
    const editorUri = quads.find(
      (item) =>
        item.predicate.value === 'http://purl.org/ontology/bibo/editor',
    )?.object.value
    expect(editorUri).toMatch(/^urn:uuid:/)
    expect(
      quads.find(
        (item) =>
          item.subject.value === editorUri &&
          item.predicate.value === `${EX}name`,
      )?.object.value,
    ).toBe('Editor Person')
    expect(
      quads.find(
        (item) =>
          item.subject.value === editorUri &&
          item.predicate.value === `${EX}w3cApiUrl`,
      )?.object.value,
    ).toBe('https://api.w3.org/users/opaque')
  })

  test('does not duplicate properties for existing people', () => {
    const identity = resolvePerson({ w3cId: 123, name: 'Editor Person' })
    const quads = buildEditorQuads(
      [
        {
          specification,
          editors: [
            {
              id: 123,
              href: 'https://api.w3.org/users/opaque',
              name: 'Editor Person',
            },
          ],
        },
      ],
      new Set([identity.id]),
    )
    expect(
      quads.some(
        (item) =>
          item.subject.value === identity.id &&
          item.predicate.value === `${EX}name`,
      ),
    ).toBe(false)
    expect(
      quads.some(
        (item) =>
          item.predicate.value === 'http://purl.org/ontology/bibo/editor',
      ),
    ).toBe(true)
  })
})

describe('duplicate W3C ids', () => {
  test('participant and editor references canonicalize to one local identity', () => {
    const participantQuads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 42931,
              href: 'https://api.w3.org/users/duplicate',
              name: 'Pierre-Antoine Champin',
            },
          ],
        },
      ],
      new Set(),
    )
    const participantUri = participantQuads.find(
      (item) => item.predicate.value === `${EX}member`,
    )?.object.value
    expect(participantUri).toMatch(/^urn:uuid:/)
    expect(JSON.stringify(participantQuads.map((item) => item.object.value))).not.toContain('42931')

    const editorQuads = buildEditorQuads(
      [
        {
          specification,
          editors: [
            {
              id: 129656,
              href: 'https://api.w3.org/users/canonical',
              name: 'Pierre-Antoine Champin',
            },
          ],
        },
      ],
      new Set([participantUri!]),
    )
    expect(
      editorQuads.find(
        (item) =>
          item.predicate.value === 'http://purl.org/ontology/bibo/editor',
      )?.object.value,
    ).toBe(participantUri)
  })
})
