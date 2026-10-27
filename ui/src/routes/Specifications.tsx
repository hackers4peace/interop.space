import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { SearchBar } from '../components/SearchBar'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { isW3cScope, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { matchesQuery } from '../lib/search'
import { specificationsSlice } from '../store/selectors'

const Specifications: Component = () => {
  const { sdo } = useSdoNav()
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())
  const [query, setQuery] = createSignal('')

  const filteredSpecifications = () =>
    specificationsSlice().data.filter((spec) =>
      matchesQuery(spec.name, query()),
    )

  onMount(() => {
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Specifications</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {specificationsSlice().data.length} specifications delivered by W3C
            groups.
          </p>
        </Show>
      </div>
      <Show
        when={w3cScope()}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">
            No specifications are available for {scopeName()} in the catalog
            yet.
          </p>
        }
      >
        <SearchBar
          value={query()}
          onInput={setQuery}
          label="Search specifications"
          placeholder="Search specifications…"
        />
        <Switch>
          <Match when={specificationsSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load specifications: {specificationsSlice().error}
            </p>
          </Match>
          <Match when={specificationsSlice().status === 'loading'}>
            <p class="text-slate-500 dark:text-slate-400">
              Loading specifications…
            </p>
          </Match>
          <Match when={specificationsSlice().status === 'ready'}>
            <Show
              when={specificationsSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No specifications found in the catalog.
                </p>
              }
            >
              <Show
                when={filteredSpecifications().length > 0}
                fallback={
                  <p class="text-slate-500 dark:text-slate-400">
                    No specifications match “{query().trim()}”.
                  </p>
                }
              >
                <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <For each={filteredSpecifications()}>
                    {(spec) => (
                      <li>
                        <SpecificationCard spec={spec} showGroups />
                      </li>
                    )}
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

export default Specifications
