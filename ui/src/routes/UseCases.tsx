import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { SearchBar } from '../components/SearchBar'
import { UseCaseCard } from '../components/UseCaseCard'
import { appActor } from '../store/app'
import { matchesQuery } from '../lib/search'
import { useCasesSlice } from '../store/selectors'

const UseCases: Component = () => {
  const [query, setQuery] = createSignal('')

  const filteredUseCases = () =>
    useCasesSlice().data.filter((useCase) =>
      matchesQuery(useCase.name, query()),
    )

  onMount(() => {
    if (useCasesSlice().status === 'idle')
      appActor.send({ type: 'loadUseCases' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Use cases</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          Portability use cases shared by the Fediverse migration stories in
          FEP-73cd and the W3C Linked Web Storage use cases.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={setQuery}
        label="Search use cases"
        placeholder="Search use cases…"
      />
      <Switch>
        <Match when={useCasesSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load use cases: {useCasesSlice().error}
          </p>
        </Match>
        <Match when={useCasesSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">Loading use cases…</p>
        </Match>
        <Match when={useCasesSlice().status === 'ready'}>
          <Show
            when={useCasesSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                No use cases found in the catalog.
              </p>
            }
          >
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {useCasesSlice().data.length} use cases linked to specifications
              in the catalog.
            </p>
            <Show
              when={filteredUseCases().length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No use cases match “{query().trim()}”.
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={filteredUseCases()}>
                  {(useCase) => <UseCaseCard useCase={useCase} />}
                </For>
              </ul>
            </Show>
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default UseCases
