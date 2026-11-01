// Extract normative and informative references from rendered Bikeshed or
// ReSpec HTML. Bikeshed omits </dd> (the end tag is optional in HTML), so this
// uses a real HTML parser rather than regular expressions.

import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import type {
  CitationGenerator,
  CitationNature,
  DocumentExtraction,
  ExtractedReference,
} from './types.ts'
import { cleanUrl, isTrUrl } from './urls.ts'

const BIKESHED_GENERATOR = /^Bikeshed(?:\s+version)?\s+([^\s,]+)/i
const RESPEC_GENERATOR = /^ReSpec\s+([^\s]+)/i

interface GeneratorInfo {
  generator: CitationGenerator
  generatorVersion?: string
  generatorLabel?: string
}

function detectGenerator($: CheerioAPI): GeneratorInfo {
  const content = $('meta[name="generator"]').first().attr('content')?.trim()
  if (content) {
    const bikeshed = content.match(BIKESHED_GENERATOR)
    if (bikeshed?.[1]) {
      return { generator: 'bikeshed', generatorVersion: bikeshed[1] }
    }
    const respec = content.match(RESPEC_GENERATOR)
    if (respec?.[1]) {
      return { generator: 'respec', generatorVersion: respec[1] }
    }
    return { generator: 'unknown', generatorLabel: content }
  }
  return { generator: 'unknown' }
}

/** xml2rfc output has no generator meta but named reference sections. */
function isXml2rfc($: CheerioAPI): boolean {
  return (
    $('#name-normative-references').length > 0 ||
    $('#name-informative-references').length > 0
  )
}

function hasRawRespec($: CheerioAPI): boolean {
  return $('script[src]').toArray().some((element) => {
    const src = $(element).attr('src') ?? ''
    return /respec/i.test(src)
  })
}

/** The bibliography list for one nature, or undefined when absent. */
function referenceList(
  $: CheerioAPI,
  nature: CitationNature,
): Cheerio<Element> | undefined {
  const respecSection = $(
    nature === 'normative' ? '#normative-references' : '#informative-references',
  ).first()
  if (respecSection.length > 0) {
    const list = respecSection.find('dl.bibliography').first()
    return list.length > 0 ? list : respecSection.find('dl').first()
  }

  const bikeshedHeading = $(
    nature === 'normative' ? '#normative' : '#informative',
  ).first()
  if (bikeshedHeading.length > 0) {
    return bikeshedHeading.nextAll('dl').first()
  }

  // xml2rfc (rfc2html / draft rendering): <section id="name-*-references">
  // holding a <dl class="references">; both the normative and the informative
  // block are named, and URI references live in `name-uri-references`.
  const xml2rfc = $(
    nature === 'normative'
      ? '#name-normative-references'
      : '#name-informative-references',
  ).first()
  if (xml2rfc.length > 0) {
    // rfc2html puts the id on the <h3> and the list in the next sibling <dl>;
    // some renderers put it on the <section> that contains the <dl>.
    const inside = xml2rfc.find('dl').first()
    if (inside.length > 0) return inside
    const sibling = xml2rfc.nextAll('dl').first()
    if (sibling.length > 0) return sibling
  }

  return undefined
}

/** The visible [KEY] text wins; the id is only a fallback. */
function keyFromEntry($dt: Cheerio<Element>): string | undefined {
  const text = $dt.text().replace(/\s+/g, ' ').trim()
  const bracketed = text.match(/^\[([^\]]+)\]/)
  if (bracketed?.[1]) return bracketed[1].trim()

  const id = $dt.attr('id')
  if (id) {
    const fromId = id.replace(/^(?:biblio|bib)-/i, '').trim()
    if (fromId) return fromId
  }

  return text || undefined
}

/**
 * Prefer a W3C TR link in the entry. A non-TR link is kept so the resolver can
 * report the reference as out of scope instead of silently dropping it.
 */
function targetFromEntry($dd: Cheerio<Element>): string | undefined {
  const urls = $dd
    .find('a[href]')
    .toArray()
    .map((element) => cleanUrl(element.attribs.href))
    .filter((url): url is string => Boolean(url))
  return urls.find(isTrUrl) ?? urls[0]
}

function parseList(
  $: CheerioAPI,
  list: Cheerio<Element>,
  nature: CitationNature,
): ExtractedReference[] {
  const references = new Map<string, ExtractedReference>()
  list.find('dt').each((_, element) => {
    const $dt = $(element)
    const key = keyFromEntry($dt)
    if (!key || references.has(key)) return
    const $dd = $dt.nextAll('dd').first()
    const targetUrl = targetFromEntry($dd)
    references.set(key, {
      key,
      nature,
      ...(targetUrl ? { targetUrl } : {}),
    })
  })
  return [...references.values()]
}

/**
 * Parse one rendered document. A document with neither references section is
 * reported as unsupported by the caller, which then keeps any previous
 * citations instead of deleting them.
 */
export function extractDocument(html: string): DocumentExtraction {
  const $ = load(html)
  const generator = detectGenerator($)
  const normativeList = referenceList($, 'normative')
  const informativeList = referenceList($, 'informative')
  const normative = normativeList ? parseList($, normativeList, 'normative') : []
  const informative = informativeList
    ? parseList($, informativeList, 'informative')
    : []

  // Both generators drop an informative entry that is also normative; enforce
  // the same rule if a document lists the key twice.
  const normativeKeys = new Set(normative.map((reference) => reference.key))
  const conflicts: string[] = []
  const informativeOnly = informative.filter((reference) => {
    if (!normativeKeys.has(reference.key)) return true
    conflicts.push(reference.key)
    return false
  })

  const resolvedGenerator =
    generator.generator === 'unknown' && isXml2rfc($)
      ? { generator: 'xml2rfc' as const }
      : generator

  return {
    ...resolvedGenerator,
    hasNormativeSection: Boolean(normativeList),
    hasInformativeSection: Boolean(informativeList),
    references: [...normative, ...informativeOnly],
    conflicts,
    rawRespec: !normativeList && !informativeList && hasRawRespec($),
  }
}
