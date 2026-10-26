import type { Person, SpecContributor, W3cParticipant } from '../worker/protocol'

// Tail of a catalog URI, mirroring the worker's `short()` helper, so a group
// participant resolves to the same /people/:id page as the People directory.
export const shortUri = (uri: string) =>
  uri
    .replace(/[/#]+$/, '')
    .replace(/^.*[/#]/, '')
    .replace(/^urn:uuid:/, '')
    .replace(/^urn:w3c:person:/, '')

// Group participants are ex:Person nodes too; the participant view only lists
// the fields needed by PersonCard.
export const personFromParticipant = (
  participant: W3cParticipant,
): Person => ({
  id: shortUri(participant.uri),
  uri: participant.uri,
  name: participant.name,
  avatarUrl: participant.avatarUrl,
  github: participant.github,
  w3cId: participant.w3cId,
})

// Spec contributors resolve to ex:Person nodes too, but literal (unresolved)
// authors/editors have no page to link to.
export const personFromContributor = (
  contributor: SpecContributor,
): Person | undefined => {
  if (!contributor.id || !contributor.uri) return undefined
  return {
    id: contributor.id,
    uri: contributor.uri,
    name: contributor.name,
    avatarUrl: contributor.avatarUrl ?? '',
    github: contributor.github,
  }
}
