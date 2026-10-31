// Canonical W3C person identifiers. Some people have more than one W3C API
// account; the duplicate ids are mapped to the maintained account before they
// become identity-map identifiers, so one individual never gets two local
// urn:uuid subjects.
const DUPLICATE_W3C_IDS = new Map<number, number>([
  // Pierre-Antoine Champin: 129656 is the canonical account, 42931 is the
  // older duplicate. All references to 42931 are rewritten to 129656.
  [42931, 129656],
])

export function canonicalW3cId(w3cId: number): number {
  return DUPLICATE_W3C_IDS.get(w3cId) ?? w3cId
}
