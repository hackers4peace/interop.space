import rawSdos from '../data/sdos.json'

export type SdoChip = {
  label: string
}

export type SdoCard = {
  name: string
  url: string
  logo: string
}

export type SdoSection =
  | { kind: 'chips'; title: string; items: SdoChip[] }
  | { kind: 'cards'; title: string; items: SdoCard[] }

export type Sdo = {
  id: string
  name: string
  website: string
  logo: string
  sections: SdoSection[]
}

// Local configuration for now; these records will eventually come from the
// catalog dataset. Nothing here is fetched at runtime: the W3C ecosystem list
// and the IETF areas are snapshots kept in sdos.json.
export const sdos = rawSdos as Sdo[]

// Keep old ?sdo=w3c links working while the canonical value is the SDO URL.
const LEGACY_IDS: Record<string, string> = {
  w3c: 'https://www.w3.org/',
  ietf: 'https://www.ietf.org/',
  openid: 'https://openid.net/',
  oasis: 'https://www.oasis-open.org/',
  lf: 'https://www.linuxfoundation.org/',
  apache: 'https://www.apache.org/',
  nlnet: 'https://nlnet.nl/',
  sta: 'https://www.sovereign.tech/',
}

export const normalizeSdoId = (id: string | undefined): string | undefined =>
  id ? (LEGACY_IDS[id] ?? id) : undefined

export const sdoById = (id: string | undefined): Sdo | undefined => {
  const normalized = normalizeSdoId(id)
  return normalized ? sdos.find((sdo) => sdo.id === normalized) : undefined
}

export const sdoDisplayName = (id: string | undefined): string => {
  const known = sdoById(id)
  if (known) return known.name
  if (!id) return 'this standards body'
  try {
    return new URL(id).hostname
  } catch {
    return id
  }
}
