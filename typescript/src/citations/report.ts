// The citation run report. It lives next to the dump, not in the graph: the
// graph keeps only the two citation predicates.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SkippedReference, UnresolvedReference } from './resolve.ts'
import type { CitationGenerator } from './types.ts'

export type CitationDocumentStatus =
  | 'ok'
  | 'version-failed'
  | 'fetch-failed'
  | 'unsupported'
  | 'parse-failed'

export interface CitationDocumentReport {
  spec: string
  shortname?: string
  versionApiUrl: string
  versionUri?: string
  generator?: CitationGenerator
  generatorVersion?: string
  generatorLabel?: string
  status: CitationDocumentStatus
  error?: string
  normative: number
  informative: number
  resolved: number
  skippedNonW3c: number
  skippedOutOfCatalog: SkippedReference[]
  unresolved: UnresolvedReference[]
  selfReferences: string[]
  conflicts: string[]
  duplicates: number
}

export interface CitationTotals {
  documents: number
  ok: number
  failed: number
  normative: number
  informative: number
  resolved: number
  skippedNonW3c: number
  skippedOutOfCatalog: number
  unresolved: number
  selfReferences: number
  conflicts: number
}

export interface CitationReport {
  retrievedAt: string
  source: string
  /** True when the step was skipped because the dataset already had edges. */
  skipped?: boolean
  reason?: string
  totals: CitationTotals
  documents: CitationDocumentReport[]
}

export function citationTotals(
  documents: CitationDocumentReport[],
): CitationTotals {
  return {
    documents: documents.length,
    ok: documents.filter((document) => document.status === 'ok').length,
    failed: documents.filter((document) => document.status !== 'ok').length,
    normative: documents.reduce((sum, document) => sum + document.normative, 0),
    informative: documents.reduce(
      (sum, document) => sum + document.informative,
      0,
    ),
    resolved: documents.reduce((sum, document) => sum + document.resolved, 0),
    skippedNonW3c: documents.reduce(
      (sum, document) => sum + document.skippedNonW3c,
      0,
    ),
    skippedOutOfCatalog: documents.reduce(
      (sum, document) => sum + document.skippedOutOfCatalog.length,
      0,
    ),
    unresolved: documents.reduce(
      (sum, document) => sum + document.unresolved.length,
      0,
    ),
    selfReferences: documents.reduce(
      (sum, document) => sum + document.selfReferences.length,
      0,
    ),
    conflicts: documents.reduce(
      (sum, document) => sum + document.conflicts.length,
      0,
    ),
  }
}

export function summarizeCitations(report: CitationReport): string {
  if (report.skipped) {
    return `Citations: skipped (${report.reason ?? 'already present'})`
  }
  const totals = report.totals
  return [
    `Citations: ${totals.resolved} edges from ${totals.ok}/${totals.documents} documents`,
    `extracted entries: ${totals.normative} normative / ${totals.informative} informative`,
    `skipped non-W3C: ${totals.skippedNonW3c}, out of catalog: ${totals.skippedOutOfCatalog}`,
    `unresolved: ${totals.unresolved}, self references: ${totals.selfReferences}, conflicts: ${totals.conflicts}`,
  ].join('\n')
}

export async function writeCitationReport(
  path: string,
  report: CitationReport,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
