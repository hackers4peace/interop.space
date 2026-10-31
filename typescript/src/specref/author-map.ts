import { resolvePerson } from '../w3c-api/identity.ts'
import { normalizePersonName } from './names.ts'

// Manual author resolutions to fill in after reviewing the author report.
//
// Keys are either:
//   "<specref-id>|<normalized author name>"  (preferred; spec-specific)
//   "<normalized author name>"                (global fallback)
// Values are the stable W3C user ids; the local urn:uuid subject comes from the
// identity map at runtime.
//
// These four name resolutions were verified against the W3C API editor links.
// Pierre-Antoine Champin is resolved globally; 42931 is also canonicalized to
// 129656 in person-ids.ts.
const AUTHOR_OVERRIDES = new Map<string, number>([
  ['pierre-antoine champin', 129656],
  // Christopher Webber is the former name of Christine Lemmer-Webber, who is
  // the editor of ActivityPub.
  ['activitypub|christopher webber', 57007],
  ['did-use-cases|ryan grant', 101398],
  ['wot-profile|tomoaki mizushima', 98915],
  ['wot-usecases|tomoaki mizushima', 98915],
])

/** Return a manually verified person for a Specref author, if one exists. */
export function resolveAuthorOverride(
  specrefId: string,
  name: string,
): string | undefined {
  const normalized = normalizePersonName(name)
  const w3cId =
    AUTHOR_OVERRIDES.get(`${specrefId}|${normalized}`) ??
    AUTHOR_OVERRIDES.get(normalized)
  return w3cId === undefined
    ? undefined
    : resolvePerson({ w3cId, name }).id
}
