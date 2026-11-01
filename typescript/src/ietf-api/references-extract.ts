// Re-export the shared HTML reference extractor for the IETF references pass.
// xml2rfc markup (`#name-normative-references`) is handled by the same parser
// the W3C crawl uses, so both SDOs produce identical evidence rows.
export { extractDocument as EXTRACT } from '../citations/extract.ts'
