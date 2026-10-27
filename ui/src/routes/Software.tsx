import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { SearchBar } from '../components/SearchBar'
import { SoftwareCard } from '../components/SoftwareCard'
import { appActor } from '../store/app'
import { isW3cScope, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { matchesQuery } from '../lib/search'
import { softwareSlice } from '../store/selectors'

const Software: Component = () => {
  const { sdo, href } = useSdoNav()
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())
  const [query, setQuery] = createSignal('')

  const filteredSoftware = () =>
    softwareSlice().data.filter((sw) => matchesQuery(sw.name, query()))

  onMount(() => {
    if (softwareSlice().status === 'idle')
      appActor.send({ type: 'loadSoftware' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Software</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {softwareSlice().data.length} software entries in the catalog.
          </p>
        </Show>
      </div>
      <Show
        when={w3cScope()}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">
            No software entries are available for {scopeName()} in the catalog
            yet.
          </p>
        }
      >
        <SearchBar
          value={query()}
          onInput={setQuery}
          label="Search software"
          placeholder="Search software…"
        />
        <Switch>
          <Match when={softwareSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load software: {softwareSlice().error}
            </p>
          </Match>
          <Match when={softwareSlice().status === 'loading'}>
            <p class="text-slate-500 dark:text-slate-400">Loading software…</p>
          </Match>
          <Match when={softwareSlice().status === 'ready'}>
            <Show
              when={softwareSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No software entries in the catalog yet.
                </p>
              }
            >
              <Show
                when={filteredSoftware().length > 0}
                fallback={
                  <p class="text-slate-500 dark:text-slate-400">
                    No software matches “{query().trim()}”.
                  </p>
                }
              >
                <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <For each={filteredSoftware()}>
                    {(sw) => <SoftwareCard software={sw} />}
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

export default Software
