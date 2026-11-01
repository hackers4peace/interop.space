import { appState } from './app'
import { detailKey, type DetailKind, type DetailState } from '../worker/protocol'

export const peopleSlice = () => appState.people
export const projectsSlice = () => appState.projects
export const softwareSlice = () => appState.software
export const useCasesSlice = () => appState.useCases
export const orgsSlice = () => appState.orgs
export const specificationsSlice = () => appState.specifications
export const groupsSlice = () => appState.groups
export const groupSelectionSlice = () => appState.groupSelection

export const detailSlice = () => appState.detail

// The detail slice only holds one page at a time. A route ignores it while it
// belongs to a different key, so navigating between detail pages shows the
// loading state instead of the previous record.
export const detailFor = (
  kind: DetailKind,
  id: string,
  sdo?: string,
): DetailState | undefined => {
  const detail = appState.detail
  return detail.key === detailKey(kind, id, sdo) ? detail : undefined
}
