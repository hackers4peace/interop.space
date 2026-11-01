/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import {
  fetchDetail,
  fetchGroupMembers,
  fetchListingPage,
  type ListingCursor,
} from './catalog'
import {
  detailKey,
  initialAppState,
  type AppState,
  type Command,
  type DetailKind,
  type DetailView,
  type GroupSelection,
  type GroupSummary,
  type ListingKind,
  type ListingState,
  type SliceUpdate,
  type W3cParticipant,
} from './protocol'

// The actor's authoritative state. Listings hold only the pages fetched so
// far; detail holds exactly one composed page view at a time.
const state: AppState = initialAppState()

const emit = (key: keyof AppState, value: AppState[keyof AppState]) =>
  self.postMessage({ key, value } as SliceUpdate)

// ---------------------------------------------------------------------------
// Listing state
// ---------------------------------------------------------------------------
// The cursor never leaves the worker: the UI only asks for "more" and reads
// hasMore/loadingMore. A new search bumps the token so late responses from the
// previous query cannot land in the current list.
type ListingMeta = {
  cursor: ListingCursor | null
  token: number
  sdo?: string
}

const listingMeta: Record<ListingKind, ListingMeta> = {
  people: { cursor: null, token: 0 },
  projects: { cursor: null, token: 0 },
  software: { cursor: null, token: 0 },
  specifications: { cursor: null, token: 0 },
  useCases: { cursor: null, token: 0 },
  orgs: { cursor: null, token: 0 },
  groups: { cursor: null, token: 0 },
}

const listing = (kind: ListingKind): ListingState<unknown> =>
  state[kind] as ListingState<unknown>

function setListing(kind: ListingKind, value: ListingState<unknown>) {
  // All listing slices share the same shape; the union is keyed by kind.
  ;(state as unknown as Record<ListingKind, ListingState<unknown>>)[kind] = value
  emit(kind, value as AppState[keyof AppState])
}

const itemKey = (item: unknown): string => {
  const value = item as { uri?: string; id?: number | string }
  if (value.uri) return value.uri
  return String(value.id ?? '')
}

async function search(kind: ListingKind, query: string, sdo?: string) {
  const token = ++listingMeta[kind].token
  listingMeta[kind].cursor = null
  listingMeta[kind].sdo = sdo
  setListing(kind, {
    status: 'loading',
    query,
    data: [],
    hasMore: false,
    loadingMore: false,
  })

  try {
    const page = await fetchListingPage(kind, query, null, sdo)
    if (token !== listingMeta[kind].token) return
    listingMeta[kind].cursor = page.cursor
    setListing(kind, {
      status: 'ready',
      query,
      data: page.data,
      hasMore: page.hasMore,
      loadingMore: false,
      total: page.total,
    })
  } catch (error) {
    if (token !== listingMeta[kind].token) return
    listingMeta[kind].cursor = null
    setListing(kind, {
      status: 'error',
      query,
      data: [],
      hasMore: false,
      loadingMore: false,
      error: String(error),
    })
  }
}

async function loadMore(kind: ListingKind) {
  const current = listing(kind)
  const cursor = listingMeta[kind].cursor
  if (
    current.status !== 'ready' ||
    current.loadingMore ||
    !current.hasMore ||
    !cursor
  ) {
    return
  }

  const token = ++listingMeta[kind].token
  setListing(kind, { ...current, loadingMore: true, error: undefined })

  try {
    const page = await fetchListingPage(
      kind,
      current.query,
      cursor,
      listingMeta[kind].sdo,
    )
    if (token !== listingMeta[kind].token) return

    const latest = listing(kind)
    const seen = new Set(latest.data.map(itemKey))
    const appended = page.data.filter((item) => {
      const key = itemKey(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    listingMeta[kind].cursor = page.cursor
    setListing(kind, {
      ...latest,
      data: [...latest.data, ...appended],
      hasMore: page.hasMore,
      loadingMore: false,
      error: undefined,
    })
  } catch (error) {
    if (token !== listingMeta[kind].token) return
    setListing(kind, {
      ...listing(kind),
      loadingMore: false,
      error: String(error),
    })
  }
}

// ---------------------------------------------------------------------------
// Detail pages
// ---------------------------------------------------------------------------
let detailToken = 0

async function loadDetail(kind: DetailKind, id: string, sdo?: string) {
  const token = ++detailToken
  const key = detailKey(kind, id, sdo)
  state.detail = { key, status: 'loading' }
  emit('detail', state.detail)

  try {
    const data = (await fetchDetail(kind, id, sdo)) as DetailView | undefined
    if (token !== detailToken) return
    state.detail = { key, status: 'ready', data }
  } catch (error) {
    if (token !== detailToken) return
    state.detail = { key, status: 'error', error: String(error) }
  }
  emit('detail', state.detail)
}

// ---------------------------------------------------------------------------
// Group comparison
// ---------------------------------------------------------------------------
// The listing only carries participant counts. Rosters are fetched when a
// group is pinned, and the common set is recomputed from the cached rosters.
function computeCommon(
  selected: string[],
  members: Record<string, W3cParticipant[]>,
): W3cParticipant[] {
  if (selected.length < 2) return []
  const lists = selected.map((id) => members[id])
  if (lists.some((list) => !list)) return []
  const [first, ...rest] = lists
  return first
    .filter((person) =>
      rest.every((list) => list.some((other) => other.uri === person.uri)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

function setGroupSelection(value: GroupSelection) {
  state.groupSelection = value
  emit('groupSelection', value)
}

function toggleGroup(group: GroupSummary) {
  const id = group.id
  if (id === undefined) return
  const current = state.groupSelection

  if (current.selected.includes(id)) {
    const selected = current.selected.filter((item) => item !== id)
    const members = { ...current.members }
    delete members[id]
    setGroupSelection({
      selected,
      groups: current.groups.filter((item) => item.id !== id),
      members,
      loading: current.loading.filter((item) => item !== id),
      common: computeCommon(selected, members),
      error: undefined,
    })
    return
  }

  const selected = [...current.selected, id]
  const groups = [
    ...current.groups.filter((item) => item.id !== id),
    group,
  ]
  const members = current.members
  setGroupSelection({
    selected,
    groups,
    members,
    loading: [
      ...current.loading.filter((item) => item !== id),
      ...(members[id] ? [] : [id]),
    ],
    common: computeCommon(selected, members),
  })
  if (!members[id]) void loadGroupRoster(group)
}

async function loadGroupRoster(group: GroupSummary) {
  const id = group.id
  if (id === undefined) return

  try {
    const participants = await fetchGroupMembers(id)
    if (!state.groupSelection.selected.includes(id)) return
    const current = state.groupSelection
    const members = { ...current.members, [id]: participants }
    setGroupSelection({
      selected: current.selected,
      groups: current.groups,
      members,
      loading: current.loading.filter((item) => item !== id),
      common: computeCommon(current.selected, members),
      error: undefined,
    })
  } catch (error) {
    if (!state.groupSelection.selected.includes(id)) return
    const current = state.groupSelection
    setGroupSelection({
      ...current,
      loading: current.loading.filter((item) => item !== id),
      error: String(error),
    })
  }
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------
self.onmessage = (event: MessageEvent<Command>) => {
  const command = event.data
  switch (command.type) {
    case 'search':
      void search(command.kind, command.query, command.sdo)
      break
    case 'loadMore':
      void loadMore(command.kind)
      break
    case 'loadDetail':
      void loadDetail(command.kind, command.id, command.sdo)
      break
    case 'toggleGroup':
      toggleGroup(command.group)
      break
  }
}
