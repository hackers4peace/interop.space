// Types for normative/informative citation extraction. Citations are attached
// to the catalog specification (series) node: the W3C API latest version is the
// snapshot that is read, but versions are not modeled yet.

export type CitationNature = 'normative' | 'informative'

export type CitationGenerator = 'bikeshed' | 'respec' | 'xml2rfc' | 'unknown'

/** One bibliography entry as it appears in a rendered references section. */
export interface ExtractedReference {
  key: string
  nature: CitationNature
  /** First link in the entry, preferring a W3C TR URL when there are several. */
  targetUrl?: string
}

/** The references sections of one rendered specification. */
export interface DocumentExtraction {
  generator: CitationGenerator
  generatorVersion?: string
  /** The raw generator string when it is not Bikeshed or ReSpec. */
  generatorLabel?: string
  hasNormativeSection: boolean
  hasInformativeSection: boolean
  references: ExtractedReference[]
  /** Keys listed in both sections; the normative entry wins. */
  conflicts: string[]
  /** True when the source is a raw ReSpec document, not rendered HTML. */
  rawRespec: boolean
}

/** The catalog fields citation resolution needs. */
export interface CatalogSpec {
  uri: string
  shortname?: string
  latestVersionUrl?: string
}

export interface Citation {
  source: string
  target: string
  nature: CitationNature
  key: string
}
