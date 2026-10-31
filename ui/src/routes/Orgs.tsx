import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { OrgCard } from '../components/OrgCard'
import { SearchBar } from '../components/SearchBar'
import { appActor } from '../store/app'
import { createListingSearch } from '../lib/listing'
import { orgsSlice } from '../store/selectors'

const Orgs: Component = () => {
  const { query, onInput } = createListingSearch('orgs')
  const total = () => orgsSlice().total ?? orgsSlice().data.length
  const isSearch = () => orgsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Organizations</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''}{' '}
          {total() === 1 ? 'organization' : 'organizations'} with affiliations
          or proposed use cases in the catalog.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search organizations"
        placeholder="Search organizations…"
      />
      <Switch>
        <Match when={orgsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load organizations: {orgsSlice().error}
          </p>
        </Match>
        <Match
          when={
            orgsSlice().status === 'loading' &&
            orgsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">
            Loading organizations…
          </p>
        </Match>
        <Match when={orgsSlice().status === 'ready'}>
          <Show
            when={orgsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No organizations match “${orgsSlice().query.trim()}”.`
                  : 'No organizations in the catalog yet.'}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={orgsSlice().data}>
                {(org) => <OrgCard org={org} />}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={orgsSlice().hasMore}
              loading={orgsSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'orgs' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Orgs
