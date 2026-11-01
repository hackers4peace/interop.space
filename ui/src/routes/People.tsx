import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { PersonCard } from '../components/PersonCard'
import { SearchBar } from '../components/SearchBar'
import { appActor } from '../store/app'
import { createListingSearch } from '../lib/listing'
import { peopleSlice } from '../store/selectors'

const People: Component = () => {
  const { query, onInput } = createListingSearch('people')

  const total = () => peopleSlice().total ?? peopleSlice().data.length
  const isSearch = () => peopleSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">People</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''} people in the directory.
        </p>
      </div>
      <SearchBar
          value={query()}
          onInput={onInput}
          label="Search people"
          placeholder="Search people…"
        />
        <Switch>
          <Match when={peopleSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load people: {peopleSlice().error}
            </p>
          </Match>
          <Match
            when={
              peopleSlice().status === 'loading' &&
              peopleSlice().data.length === 0
            }
          >
            <p class="text-slate-500 dark:text-slate-400">Loading people…</p>
          </Match>
          <Match when={peopleSlice().status === 'ready'}>
            <Show
              when={peopleSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  {isSearch()
                    ? `No people match “${peopleSlice().query.trim()}”.`
                    : 'No people found in the catalog.'}
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={peopleSlice().data}>
                  {(person) => <PersonCard person={person} />}
                </For>
              </ul>
              <InfiniteScroll
                hasMore={peopleSlice().hasMore}
                loading={peopleSlice().loadingMore}
                onLoadMore={() =>
                  appActor.send({ type: 'loadMore', kind: 'people' })
                }
              />
            </Show>
          </Match>
      </Switch>
    </section>
  )
}

export default People
