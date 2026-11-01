// IETF silo identifiers: silo ids are URNs, stored as ex:siloId literals and as
// identity-map identifiers, so the graph and the map use one convention
// (ietf-plan.md D6). Node subjects stay urn:uuid: for people; groups and
// documents are addressed by their public URL.
export const IETF_GROUP_SILO = 'urn:ietf:group:'
export const IETF_PERSON_SILO = 'urn:ietf:person:'
export const IETF_DOC_SILO = 'urn:ietf:doc:'

const PREFIXES = {
  group: IETF_GROUP_SILO,
  person: IETF_PERSON_SILO,
  doc: IETF_DOC_SILO,
} as const

export type IetfSiloKind = keyof typeof PREFIXES

/** Datatracker numeric ids are integers; document names are slugs. */
export function ietfSiloId(
  kind: IetfSiloKind,
  value: number | string,
): string {
  return `${PREFIXES[kind]}${value}`
}

/** Value part of an IETF siloId literal, when it has the expected prefix. */
export function parseIetfSiloId(
  siloId: string | undefined,
  kind: IetfSiloKind,
): string | undefined {
  if (!siloId?.startsWith(PREFIXES[kind])) return undefined
  const value = siloId.slice(PREFIXES[kind].length)
  return value === '' ? undefined : value
}

/** Numeric Datatracker id from a siloId literal. */
export function parseIetfNumericSiloId(
  siloId: string | undefined,
  kind: 'group' | 'person',
): number | undefined {
  const value = parseIetfSiloId(siloId, kind)
  if (value === undefined) return undefined
  const id = Number(value)
  return Number.isInteger(id) ? id : undefined
}

/** SPARQL condition matching a siloId family. */
export function ietfSiloPrefixFilter(
  variable: string,
  kind: IetfSiloKind,
): string {
  return `STRSTARTS(STR(${variable}), "${PREFIXES[kind]}")`
}
