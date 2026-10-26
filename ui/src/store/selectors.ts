import { appState } from './app'
import type { Person } from '../worker/protocol'
import type { Project } from '../worker/protocol'
import type { Software } from '../worker/protocol'
import type { W3cGroup } from '../worker/protocol'
import type { Specification } from '../worker/protocol'

export const peopleSlice = () => appState.people
export const projectsSlice = () => appState.projects
export const softwareSlice = () => appState.software
export const specificationsSlice = () => appState.specifications
export const w3cGroupsSlice = () => appState.w3cGroups

export const groupById = (id: number): W3cGroup | undefined =>
  appState.w3cGroups.data.groups.find((g) => g.id === id)

export const groupByName = (name: string): W3cGroup | undefined =>
  appState.w3cGroups.data.groups.find((g) => g.name === name)

export const groupByUri = (uri: string): W3cGroup | undefined =>
  appState.w3cGroups.data.groups.find((g) => g.uri === uri)

// Person and group participants are the same ex:Person node, so the join is on
// the full catalog URI.
export const groupsOfPerson = (person: Person): W3cGroup[] =>
  appState.w3cGroups.data.groups.filter((g) =>
    g.participants.some((p) => p.uri === person.uri),
  )

export const specificationById = (id: string): Specification | undefined =>
  appState.specifications.data.find((s) => s.id === id)

export const authoredSpecificationsOf = (person: Person): Specification[] =>
  appState.specifications.data.filter((s) =>
    s.authors.some((author) => author.uri === person.uri),
  )

export const editedSpecificationsOf = (person: Person): Specification[] =>
  appState.specifications.data.filter((s) =>
    s.editors.some((editor) => editor.uri === person.uri),
  )

// Specifications carry their delivering group IRIs (ex:specification on the
// organization), so the join is on the group subject. The name fallback keeps
// older dumps readable while they are being replaced.
export const specificationsOf = (group: W3cGroup): Specification[] =>
  appState.specifications.data.filter(
    (s) =>
      s.groupUris.includes(group.uri) || s.groups.includes(group.name),
  )

export const projectById = (id: string): Project | undefined =>
  appState.projects.data.find((p) => p.id === id)

export const softwareById = (id: string): Software | undefined =>
  appState.software.data.find((s) => s.id === id)

// Software joins to a spec through its own doap:implements targets, so the
// spec page asks with the specification's catalog URI (the TR shortlink).
export const softwareImplementing = (spec: Specification): Software[] =>
  appState.software.data.filter((sw) =>
    sw.implements.some((target) => target.uri === spec.uri),
  )

// doap:maintainer points at the person node, so this join is on the full URI
// (urn:w3c:person:<id> for W3C people).
export const maintainedSoftwareOf = (person: Person): Software[] =>
  appState.software.data.filter((sw) =>
    sw.maintainers.some((maintainer) => maintainer.uri === person.uri),
  )

export const personById = (id: string): Person | undefined =>
  appState.people.data.find((p) => p.id === id)

// people/projects join, reactive over both slices
export const membersOf = (id: string): Person[] => {
  const project = projectById(id)
  if (!project) return []
  const byId = new Map(appState.people.data.map((p) => [p.id, p]))
  return project.memberIds
    .map((pid) => byId.get(pid))
    .filter(Boolean) as Person[]
}