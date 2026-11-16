import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { SearchBar } from '../components/SearchBar'
import { ServerCard } from '../components/ServerCard'
import { appActor } from '../store/app'
import { createListingSearch } from '../lib/listing'
import { deploymentsSlice } from '../store/selectors'

const Deployments: Component = () => {
  const { query, onInput } = createListingSearch('deployments')

  const total = () => deploymentsSlice().total ?? deploymentsSlice().data.length
  const isSearch = () => deploymentsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Deployments</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''}{' '}
          {total() === 1 ? 'deployment' : 'deployments'} from the FediDB server
          exports and the Matrix hosting directory.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search deployments"
        placeholder="Search deployments…"
      />
      <Switch>
        <Match when={deploymentsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load deployments: {deploymentsSlice().error}
          </p>
        </Match>
        <Match
          when={
            deploymentsSlice().status === 'loading' &&
            deploymentsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">
            Loading deployments…
          </p>
        </Match>
        <Match when={deploymentsSlice().status === 'ready'}>
          <Show
            when={deploymentsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No deployments match “${deploymentsSlice().query.trim()}”.`
                  : 'No deployments in the catalog yet.'}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={deploymentsSlice().data}>
                {(server) => <ServerCard server={server} />}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={deploymentsSlice().hasMore}
              loading={deploymentsSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'deployments' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Deployments
