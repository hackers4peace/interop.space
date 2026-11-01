// W3C silo identifiers, as agreed in ietf-plan.md §9.14 / D6: silo ids are
// URNs, stored as ex:siloId literals and as identity-map identifiers, so the
// graph and the map use one convention.
//
// A node subject stays urn:uuid: — that is the local identity and the only key
// that can join a W3C account with a GitHub account or an IETF person. The silo
// id records where the record came from.
export const W3C_PERSON_SILO = 'urn:w3c:person:'
export const W3C_GROUP_SILO = 'urn:w3c:group:'
export const W3C_AFFILIATION_SILO = 'urn:w3c:affiliation:'

// Pre-migration spellings. Never written, only read, so a crawl resumed from an
// old stage dump still finds the groups and people it already has.
export const LEGACY_W3C_SILO = 'w3c:'
export const LEGACY_W3C_AFFILIATION_SILO = 'w3c-affiliation:'

export type W3cSiloKind = 'person' | 'group' | 'affiliation'

const PREFIXES: Record<W3cSiloKind, string[]> = {
  person: [W3C_PERSON_SILO, LEGACY_W3C_SILO],
  group: [W3C_GROUP_SILO, LEGACY_W3C_SILO],
  affiliation: [W3C_AFFILIATION_SILO, LEGACY_W3C_AFFILIATION_SILO],
}

/** Numeric W3C id from a siloId literal, accepting the legacy spelling. */
export function parseW3cSiloId(
  siloId: string | undefined,
  kind: W3cSiloKind,
): number | undefined {
  if (!siloId) return undefined
  for (const prefix of PREFIXES[kind]) {
    if (!siloId.startsWith(prefix)) continue
    const id = Number(siloId.slice(prefix.length))
    if (Number.isInteger(id)) return id
  }
  return undefined
}

/** SPARQL condition matching either spelling of a siloId family. */
export function w3cSiloPrefixFilter(
  variable: string,
  kind: W3cSiloKind,
): string {
  return PREFIXES[kind]
    .map((prefix) => `STRSTARTS(STR(${variable}), "${prefix}")`)
    .join(' || ')
}
