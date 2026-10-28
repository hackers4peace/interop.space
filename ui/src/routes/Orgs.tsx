import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { OrgCard } from '../components/OrgCard'
import { SearchBar } from '../components/SearchBar'
import { appActor } from '../store/app'
import { matchesQuery } from '../lib/search'
import { orgsSlice, useCasesSlice } from '../store/selectors'

const Orgs: Component = () => {
  const [query, setQuery] = createSignal('')

  const filteredOrgs = () =>
    orgsSlice().data.filter((org) => matchesQuery(org.name, query()))

  onMount(() => {
    if (orgsSlice().status === 'idle') appActor.send({ type: 'loadOrgs' })
    // Org cards resolve their ex:proposed targets to use-case titles.
    if (useCasesSlice().status === 'idle')
      appActor.send({ type: 'loadUseCases' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Organizations</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {orgsSlice().data.length}{' '}
          {orgsSlice().data.length === 1
            ? 'organization'
            : 'organizations'}{' '}
          with affiliations or proposed use cases in the catalog.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={setQuery}
        label="Search organizations"
        placeholder="Search organizations…"
      />
      <Switch>
        <Match when={orgsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load organizations: {orgsSlice().error}
          </p>
        </Match>
        <Match when={orgsSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading organizations…
          </p>
        </Match>
        <Match when={orgsSlice().status === 'ready'}>
          <Show
            when={orgsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                No organizations in the catalog yet.
              </p>
            }
          >
            <Show
              when={filteredOrgs().length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No organizations match “{query().trim()}”.
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={filteredOrgs()}>
                  {(org) => <OrgCard org={org} />}
                </For>
              </ul>
            </Show>
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Orgs
