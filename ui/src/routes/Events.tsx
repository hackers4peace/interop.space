import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { EventCard } from '../components/EventCard'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { createListingSearch } from '../lib/listing'
import { eventsSlice } from '../store/selectors'

const Events: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('events', () => sdo())
  const currentSdo = () => sdoById(sdo())

  const total = () => eventsSlice().total ?? eventsSlice().data.length
  const isSearch = () => eventsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Events</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {total()} {isSearch() ? 'matching' : ''}{' '}
          {total() === 1 ? 'event' : 'events'} from the standards bodies in the
          catalog.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search events"
        placeholder="Search events…"
      />
      <Switch>
        <Match when={eventsSlice().status === 'error'}>
          <p class="text-red-500">Failed to load events: {eventsSlice().error}</p>
        </Match>
        <Match
          when={
            eventsSlice().status === 'loading' &&
            eventsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">Loading events…</p>
        </Match>
        <Match when={eventsSlice().status === 'ready'}>
          <Show
            when={eventsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No events match “${eventsSlice().query.trim()}”.`
                  : 'No events in the catalog yet.'}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={eventsSlice().data}>
                {(event) => <EventCard event={event} />}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={eventsSlice().hasMore}
              loading={eventsSlice().loadingMore}
              onLoadMore={() => appActor.send({ type: 'loadMore', kind: 'events' })}
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Events
