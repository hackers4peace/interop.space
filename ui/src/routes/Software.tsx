import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { SoftwareCard } from '../components/SoftwareCard'
import { appActor } from '../store/app'
import { isW3cScope, sdoById, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { createListingSearch } from '../lib/listing'
import { softwareSlice } from '../store/selectors'

const Software: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('software')
  const currentSdo = () => sdoById(sdo())
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())

  const total = () => softwareSlice().total ?? softwareSlice().data.length
  const isSearch = () => softwareSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Software</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {total()} {isSearch() ? 'matching' : ''} software entries in the
            catalog.
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
          onInput={onInput}
          label="Search software"
          placeholder="Search software…"
        />
        <Switch>
          <Match when={softwareSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load software: {softwareSlice().error}
            </p>
          </Match>
          <Match
            when={
              softwareSlice().status === 'loading' &&
              softwareSlice().data.length === 0
            }
          >
            <p class="text-slate-500 dark:text-slate-400">Loading software…</p>
          </Match>
          <Match when={softwareSlice().status === 'ready'}>
            <Show
              when={softwareSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  {isSearch()
                    ? `No software matches “${softwareSlice().query.trim()}”.`
                    : 'No software entries in the catalog yet.'}
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={softwareSlice().data}>
                  {(sw) => <SoftwareCard software={sw} />}
                </For>
              </ul>
              <InfiniteScroll
                hasMore={softwareSlice().hasMore}
                loading={softwareSlice().loadingMore}
                onLoadMore={() =>
                  appActor.send({ type: 'loadMore', kind: 'software' })
                }
              />
            </Show>
          </Match>
        </Switch>
      </Show>
    </section>
  )
}

export default Software
