// Canonical W3C person identifiers. Some people have more than one W3C API
// account; the duplicate ids are mapped to the maintained account before they
// become identity-map identifiers, so one individual never gets two local
// urn:uuid subjects. scripts/remap-identities.ts collapses the entries that
// already exist for a pair added here.
//
// Every pair below was confirmed against the account data api.w3.org returns
// (given/family name plus city + country division, and the connected GitHub
// account), not just the display name: same-name accounts in different cities
// stay separate on purpose.
export const DUPLICATE_W3C_IDS = new Map<number, number>([
  // Pierre-Antoine Champin: 129656 is the canonical account, 42931 is the
  // older duplicate. All references to 42931 are rewritten to 129656.
  [42931, 129656],
  // Rik Cabanier: 106988 (GitHub cabanier, 4 specs) is canonical, 47171 is the
  // older account without a connected account. Both Seattle/Washington/US.
  [47171, 106988],
  // Doug Schepers: 172926 (GitHub shepazu) is canonical, 38635 has the older
  // 6-editor record. Both Chapel Hill/North Carolina/US.
  [38635, 172926],
  // Scott Beeker: 179833 (GitHub scottbeeker) is canonical, 153569
  // (bayareaunicorn) is the second account. Both San Francisco/California/US.
  [153569, 179833],
  // Wouter Termont: 115604 (GitHub woutermont) is canonical, 148600
  // (termontwouter) is the second account. Both Leuven/Flanders/BE.
  [148600, 115604],
])

export function canonicalW3cId(w3cId: number): number {
  return DUPLICATE_W3C_IDS.get(w3cId) ?? w3cId
}
