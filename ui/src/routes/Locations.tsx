import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { LocationCard } from '../components/LocationCard'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { createListingSearch } from '../lib/listing'
import { locationsSlice } from '../store/selectors'

const Locations: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('locations', () => sdo())
  const currentSdo = () => sdoById(sdo())

  const total = () => locationsSlice().total ?? locationsSlice().data.length
  const isSearch = () => locationsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Locations</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''}{' '}
          {total() === 1 ? 'location' : 'locations'} with local groups in the
          catalog.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search locations"
        placeholder="Search locations…"
      />
      <Switch>
        <Match when={locationsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load locations: {locationsSlice().error}
          </p>
        </Match>
        <Match
          when={
            locationsSlice().status === 'loading' &&
            locationsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">Loading locations…</p>
        </Match>
        <Match when={locationsSlice().status === 'ready'}>
          <Show
            when={locationsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No locations match “${locationsSlice().query.trim()}”.`
                  : 'No locations in the catalog yet.'}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={locationsSlice().data}>
                {(location) => <LocationCard location={location} />}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={locationsSlice().hasMore}
              loading={locationsSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'locations' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Locations
