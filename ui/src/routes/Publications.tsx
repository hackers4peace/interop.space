import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { PublicationCard } from '../components/PublicationCard'
import { SearchBar } from '../components/SearchBar'
import { appActor } from '../store/app'
import { createListingSearch } from '../lib/listing'
import { publicationsSlice } from '../store/selectors'

const Publications: Component = () => {
  const { query, onInput } = createListingSearch('publications')

  const total = () => publicationsSlice().total ?? publicationsSlice().data.length
  const isSearch = () => publicationsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Publications</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''}{' '}
          {total() === 1 ? 'publication' : 'publications'} citing records in the
          catalog.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search publications"
        placeholder="Search publications…"
      />
      <Switch>
        <Match when={publicationsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load publications: {publicationsSlice().error}
          </p>
        </Match>
        <Match
          when={
            publicationsSlice().status === 'loading' &&
            publicationsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">
            Loading publications…
          </p>
        </Match>
        <Match when={publicationsSlice().status === 'ready'}>
          <Show
            when={publicationsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No publications match “${publicationsSlice().query.trim()}”.`
                  : 'No publications in the catalog yet.'}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={publicationsSlice().data}>
                {(publication) => (
                  <PublicationCard publication={publication} />
                )}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={publicationsSlice().hasMore}
              loading={publicationsSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'publications' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Publications
