import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { PersonCard } from '../components/PersonCard'
import { SearchBar } from '../components/SearchBar'
import { appActor } from '../store/app'
import { isW3cScope, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { matchesQuery } from '../lib/search'
import { peopleSlice } from '../store/selectors'

const People: Component = () => {
  const { sdo } = useSdoNav()
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())
  const [query, setQuery] = createSignal('')

  const filteredPeople = () =>
    peopleSlice().data.filter((person) =>
      matchesQuery(person.name, query()),
    )

  onMount(() => {
    if (peopleSlice().status === 'idle') appActor.send({ type: 'loadPeople' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">People</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {peopleSlice().data.length} people in the directory.
          </p>
        </Show>
      </div>
      <Show
        when={w3cScope()}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">
            No people are available for {scopeName()} in the catalog yet.
          </p>
        }
      >
        <SearchBar
          value={query()}
          onInput={setQuery}
          label="Search people"
          placeholder="Search people…"
        />
        <Switch>
          <Match when={peopleSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load people: {peopleSlice().error}
            </p>
          </Match>
          <Match when={peopleSlice().status === 'loading'}>
            <p class="text-slate-500 dark:text-slate-400">Loading people…</p>
          </Match>
          <Match when={peopleSlice().status === 'ready'}>
            <Show
              when={peopleSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No people found in the catalog.
                </p>
              }
            >
              <Show
                when={filteredPeople().length > 0}
                fallback={
                  <p class="text-slate-500 dark:text-slate-400">
                    No people match “{query().trim()}”.
                  </p>
                }
              >
                <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={filteredPeople()}>
                    {(person) => <PersonCard person={person} />}
                  </For>
                </ul>
              </Show>
            </Show>
          </Match>
        </Switch>
      </Show>
    </section>
  )
}

export default People
