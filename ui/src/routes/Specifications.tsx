import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { isW3cScope, sdoById, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { createListingSearch } from '../lib/listing'
import { specificationsSlice } from '../store/selectors'

const Specifications: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('specifications')
  const currentSdo = () => sdoById(sdo())
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())

  const total = () =>
    specificationsSlice().total ?? specificationsSlice().data.length
  const isSearch = () => specificationsSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Specifications</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {total()} {isSearch() ? 'matching' : ''} specifications delivered
            by W3C groups.
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
          onInput={onInput}
          label="Search specifications"
          placeholder="Search specifications…"
        />
        <Switch>
          <Match when={specificationsSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load specifications: {specificationsSlice().error}
            </p>
          </Match>
          <Match
            when={
              specificationsSlice().status === 'loading' &&
              specificationsSlice().data.length === 0
            }
          >
            <p class="text-slate-500 dark:text-slate-400">
              Loading specifications…
            </p>
          </Match>
          <Match when={specificationsSlice().status === 'ready'}>
            <Show
              when={specificationsSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  {isSearch()
                    ? `No specifications match “${specificationsSlice().query.trim()}”.`
                    : 'No specifications found in the catalog.'}
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={specificationsSlice().data}>
                  {(spec) => (
                    <li>
                      <SpecificationCard spec={spec} showGroups />
                    </li>
                  )}
                </For>
              </ul>
              <InfiniteScroll
                hasMore={specificationsSlice().hasMore}
                loading={specificationsSlice().loadingMore}
                onLoadMore={() =>
                  appActor.send({ type: 'loadMore', kind: 'specifications' })
                }
              />
            </Show>
          </Match>
        </Switch>
      </Show>
    </section>
  )
}

export default Specifications
