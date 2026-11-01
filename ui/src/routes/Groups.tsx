import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { A } from '@solidjs/router'
import { ArrowRight, Pin } from 'lucide-solid'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { PersonCard } from '../components/PersonCard'
import { SearchBar } from '../components/SearchBar'
import { SdoLogo } from '../components/SdoLogo'
import { SdoPanel } from '../components/SdoPanel'
import { appActor } from '../store/app'
import { createListingSearch } from '../lib/listing'
import { personFromParticipant } from '../lib/person'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { groupSelectionSlice, groupsSlice } from '../store/selectors'
import type { GroupSummary, W3cParticipant } from '../worker/protocol'

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition'

const idleIcon =
  'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200'

const pinnedOnlyBase =
  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition'

const pinnedOnlyActive =
  'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300'

const pinnedOnlyIdle =
  'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'

// The pin button toggles the group's participation in the comparison; the
// arrow button opens the group's own page. The card itself is not clickable so
// the two actions never fight over the same target.
const GroupCard: Component<{ group: GroupSummary; selected: boolean }> = (
  props,
) => {
  const { href } = useSdoNav()
  const count = () => props.group.participantCount ?? 0
  return (
    <div
      class={`flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition dark:bg-slate-900 ${props.selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:shadow-md dark:border-slate-800'}`}
    >
      <button
        type="button"
        aria-pressed={props.selected}
        aria-label={
          props.selected
            ? `Unpin ${props.group.name}`
            : `Pin ${props.group.name}`
        }
        title={props.selected ? 'Unpin group' : 'Pin group'}
        disabled={props.group.id === undefined}
        onClick={() =>
          appActor.send({
            type: 'toggleGroup',
            // Solid stores are proxies; clone into a plain, worker-safe object.
            group: { ...props.group },
          })
        }
        class={`${iconButton} ${props.selected ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : idleIcon}`}
      >
        <Pin size={18} fill={props.selected ? 'currentColor' : 'none'} />
      </button>
      <SdoLogo sdo={props.group.sdo} />
      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate font-semibold">{props.group.name}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {count()}
          {count() === 1 ? ' participant' : ' participants'}
        </p>
      </div>
      <Show when={props.group.id}>
        {(id) => (
          <A
            href={href(`/groups/${encodeURIComponent(id())}`)}
            aria-label={`Open ${props.group.name}`}
            title={`Open ${props.group.name}`}
            class={`${iconButton} ${idleIcon}`}
          >
            <ArrowRight size={18} />
          </A>
        )}
      </Show>
    </div>
  )
}

const ParticipantList: Component<{
  title: string
  note: string
  people: W3cParticipant[]
}> = (props) => (
  <div class="space-y-3">
    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.title}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">{props.note}</p>
    </div>
    <Show
      when={props.people.length > 0}
      fallback={
        <p class="text-slate-500 dark:text-slate-400">No participants.</p>
      }
    >
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={props.people}>
          {(person) => <PersonCard person={personFromParticipant(person)} />}
        </For>
      </ul>
    </Show>
  </div>
)

const Groups: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('groups', () => sdo())
  const [pinnedOnly, setPinnedOnly] = createSignal(false)

  const currentSdo = () => sdoById(sdo())

  const listing = () => groupsSlice()
  const selection = () => groupSelectionSlice()

  const selectedGroups = () => selection().groups
  const isPinned = (group: GroupSummary) =>
    group.id !== undefined && selection().selected.includes(group.id)
  const searchGroups = () =>
    listing().data.filter((group) => !isPinned(group))
  const isSearch = () => listing().query.trim().length > 0

  const groupsFallback = () => {
    const status = listing().status
    if (status === 'error') return 'Could not load groups from the catalog.'
    if (status === 'ready') {
      return isSearch()
        ? `No groups match “${listing().query.trim()}”.`
        : 'No groups found in the catalog.'
    }
    return 'Loading groups from the catalog…'
  }

  const selectedGroup = () =>
    selectedGroups().length === 1 ? selectedGroups()[0] : undefined

  const rosterOf = (group: GroupSummary) =>
    group.id === undefined ? undefined : selection().members[group.id]

  const isRosterLoading = (group: GroupSummary) =>
    group.id !== undefined && selection().loading.includes(group.id)

  const countNote = () => {
    const chosen = selectedGroups()
    return `${chosen
      .map((group) => `${group.participantCount ?? 0} in ${group.name}`)
      .join(' · ')}; ${selection().common.length} in all of them.`
  }

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>

      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Groups</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Pin the groups you want to compare. With more than one group pinned,
          the list shows who they have in common. Use the arrow to open a
          group's page.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
          <SearchBar
            value={query()}
            onInput={onInput}
            label="Search groups"
            placeholder="Search groups…"
          />
          <button
            type="button"
            aria-pressed={pinnedOnly()}
            title={
              pinnedOnly()
                ? 'Show all groups'
                : 'Hide all unpinned group cards'
            }
            onClick={() => setPinnedOnly((current) => !current)}
            class={`${pinnedOnlyBase} ${pinnedOnly() ? pinnedOnlyActive : pinnedOnlyIdle}`}
          >
            <Pin
              size={16}
              aria-hidden="true"
              fill={pinnedOnly() ? 'currentColor' : 'none'}
            />
            Pinned only
          </button>
        </div>

        <Show when={listing().status === 'error'}>
          <p class="text-red-500">
            Failed to load groups: {listing().error}
          </p>
        </Show>

        <Show when={selectedGroups().length > 0}>
          <div class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pinned groups
            </h2>
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={selectedGroups()}>
                {(group) => (
                  <li>
                    <GroupCard group={group} selected />
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        <Show when={!pinnedOnly()}>
          <Show
            when={listing().status !== 'loading' || listing().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                Loading groups from the catalog…
              </p>
            }
          >
            <Show
              when={searchGroups().length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  {selectedGroups().length > 0 && listing().status === 'ready'
                    ? 'No other groups to show.'
                    : groupsFallback()}
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={searchGroups()}>
                  {(group) => (
                    <li>
                      <GroupCard group={group} selected={isPinned(group)} />
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <InfiniteScroll
              hasMore={listing().hasMore}
              loading={listing().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'groups' })
              }
            />
          </Show>
        </Show>

        <Show when={selection().error}>
          <p class="text-red-500">
            Failed to load participants: {selection().error}
          </p>
        </Show>

        <Show when={selectedGroups().length === 0}>
          <p class="text-slate-500 dark:text-slate-400">
            Pin at least one group above.
          </p>
        </Show>

        <Show when={selectedGroup()}>
          {(group) => (
            <Show
              when={rosterOf(group())}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  {isRosterLoading(group())
                    ? 'Loading participants…'
                    : 'Participants are not available.'}
                </p>
              }
            >
              {(people) => (
                <ParticipantList
                  title={`Participants of ${group().name}`}
                  note={`${people().length} ${people().length === 1 ? 'participant' : 'participants'} in the catalog. Pin another group to see who they have in common.`}
                  people={people()}
                />
              )}
            </Show>
          )}
        </Show>

        <Show when={selectedGroups().length > 1}>
          <Show
            when={selection().loading.length === 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                Loading participants…
              </p>
            }
          >
            <ParticipantList
              title={`Common participants (${selection().common.length})`}
              note={countNote()}
              people={selection().common}
            />
          </Show>
        </Show>
    </section>
  )
}

export default Groups
