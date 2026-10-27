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

export const sdoById = (id: string | undefined): Sdo | undefined =>
  id ? sdos.find((sdo) => sdo.id === id) : undefined

// Only W3C records exist in the catalog for now. No filter means all records,
// which are also W3C-based.
export const isW3cScope = (id: string | undefined): boolean =>
  !id || id === 'w3c'

export const sdoDisplayName = (id: string | undefined): string =>
  sdoById(id)?.name ?? id ?? 'this standards body'
