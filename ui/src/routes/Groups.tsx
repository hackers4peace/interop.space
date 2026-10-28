import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, onMount } from 'solid-js'
import { A } from '@solidjs/router'
import { ArrowRight, Pin } from 'lucide-solid'
import { PersonCard } from '../components/PersonCard'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { appActor } from '../store/app'
import { personFromParticipant } from '../lib/person'
import { isW3cScope, sdoById, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { matchesQuery } from '../lib/search'
import { w3cGroupsSlice } from '../store/selectors'
import type { W3cGroup, W3cParticipant } from '../worker/protocol'

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
const GroupCard: Component<{ group: W3cGroup; selected: boolean }> = (
  props,
) => {
  const { href } = useSdoNav()
  return (
    <div
      class={`flex items-center gap-2 rounded-xl border bg-white p-4 shadow-sm transition dark:bg-slate-900 ${props.selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:shadow-md dark:border-slate-800'}`}
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
        onClick={() =>
          appActor.send({ type: 'toggleW3cGroup', id: props.group.id })
        }
        class={`${iconButton} ${props.selected ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : idleIcon}`}
      >
        <Pin size={18} fill={props.selected ? 'currentColor' : 'none'} />
      </button>
      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate font-semibold">{props.group.name}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {props.group.participants.length}
          {props.group.participants.length === 1 ? ' participant' : ' participants'}
        </p>
      </div>
      <A
        href={href(`/groups/${props.group.id}`)}
        aria-label={`Open ${props.group.name}`}
        title={`Open ${props.group.name}`}
        class={`${iconButton} ${idleIcon}`}
      >
        <ArrowRight size={18} />
      </A>
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
  const [query, setQuery] = createSignal('')
  const [pinnedOnly, setPinnedOnly] = createSignal(false)
  // Snapshot of the pinned ids as they were when the listing was last
  // refreshed. Pinning does not reorder the cards under the pointer; the next
  // search or toggle moves pinned groups to the top.
  const [pinnedOrder, setPinnedOrder] = createSignal<number[]>([])

  // Unpinning drops the group from the order snapshot without adding newly
  // pinned groups, so a pin click never reorders the list.
  createEffect(() => {
    const selected = w3cGroupsSlice().data.selected
    setPinnedOrder((current) => {
      const next = current.filter((id) => selected.includes(id))
      return next.length === current.length ? current : next
    })
  })

  onMount(() => {
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
  })

  const currentSdo = () => sdoById(sdo())
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())
  const groups = () => w3cGroupsSlice().data.groups
  const isPinned = (id: number) => w3cGroupsSlice().data.selected.includes(id)
  const snapshotPinnedOrder = () =>
    setPinnedOrder(
      groups()
        .filter((group) => isPinned(group.id))
        .map((group) => group.id),
    )
  const handleQuery = (value: string) => {
    setQuery(value)
    snapshotPinnedOrder()
  }
  const togglePinnedOnly = () => {
    setPinnedOnly((current) => !current)
    snapshotPinnedOrder()
  }
  const visibleGroups = () =>
    groups().filter(
      (group) =>
        isPinned(group.id) ||
        (!pinnedOnly() && matchesQuery(group.name, query())),
    )
  const orderedGroups = () => {
    const order = pinnedOrder()
    const rank = (id: number) =>
      isPinned(id) ? order.indexOf(id) : -1
    return [...visibleGroups()].sort((a, b) => {
      const aRank = rank(a.id)
      const bRank = rank(b.id)
      if (aRank === -1 && bRank === -1) return 0
      if (aRank === -1) return 1
      if (bRank === -1) return -1
      return aRank - bRank
    })
  }
  const selectedGroups = () =>
    groups().filter((g) => w3cGroupsSlice().data.selected.includes(g.id))
  const singleGroup = () =>
    selectedGroups().length === 1 ? selectedGroups()[0] : undefined
  const groupsFallback = () => {
    const status = w3cGroupsSlice().status
    if (status === 'error') return 'Could not load groups from the catalog.'
    if (status === 'ready') return 'No W3C groups found in the catalog.'
    return 'Loading groups from the catalog…'
  }
  const countNote = () => {
    const chosen = selectedGroups()
    if (chosen.length < 2) return ''
    return `${chosen.map((g) => `${g.participants.length} in ${g.name}`).join(' · ')}; ${w3cGroupsSlice().data.common.length} in all of them.`
  }

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>

      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">
          {w3cScope() ? 'W3C Groups' : 'Groups'}
        </h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            Pin the groups you want to compare. Participants are synced from
            the W3C API into the catalog; with more than one group pinned, the
            list shows who they have in common. Use the arrow to open a group's
            page.
          </p>
        </Show>
      </div>

      <Show
        when={w3cScope()}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">
            No groups are available for {scopeName()} in the catalog yet.
          </p>
        }
      >
        <div class="flex flex-wrap items-center gap-3">
          <SearchBar
            value={query()}
            onInput={handleQuery}
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
            onClick={togglePinnedOnly}
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
        <Show when={w3cGroupsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load W3C groups: {w3cGroupsSlice().error}
          </p>
        </Show>

        <Show
          when={groups().length > 0}
          fallback={
            <p class="text-slate-500 dark:text-slate-400">
              {groupsFallback()}
            </p>
          }
        >
          <Show
            when={visibleGroups().length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {pinnedOnly()
                  ? 'No groups are pinned yet.'
                  : `No groups match “${query().trim()}”.`}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={orderedGroups()}>
                {(group) => (
                  <li>
                    <GroupCard
                      group={group}
                      selected={w3cGroupsSlice().data.selected.includes(
                        group.id,
                      )}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <Show when={w3cGroupsSlice().status === 'loading'}>
            <p class="text-slate-500 dark:text-slate-400">
              Loading groups and participants from the catalog…
            </p>
          </Show>

          <Show when={selectedGroups().length === 0}>
            <p class="text-slate-500 dark:text-slate-400">
              Pin at least one group above.
            </p>
          </Show>

          <Show when={singleGroup()}>
            {(group) => (
              <ParticipantList
                title={`Participants of ${group().name}`}
                note={`${group().participants.length} ${group().participants.length === 1 ? 'participant' : 'participants'} in the catalog. Pin another group to see who they have in common.`}
                people={group().participants}
              />
            )}
          </Show>

          <Show when={selectedGroups().length > 1}>
            <ParticipantList
              title={`Common participants (${w3cGroupsSlice().data.common.length})`}
              note={countNote()}
              people={w3cGroupsSlice().data.common}
            />
          </Show>
        </Show>
      </Show>
    </section>
  )
}

export default Groups
