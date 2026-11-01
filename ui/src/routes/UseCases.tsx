import type { Component } from 'solid-js'
import { For, Match, Show, Switch } from 'solid-js'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { SearchBar } from '../components/SearchBar'
import { SdoPanel } from '../components/SdoPanel'
import { UseCaseCard } from '../components/UseCaseCard'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { createListingSearch } from '../lib/listing'
import { useCasesSlice } from '../store/selectors'

const UseCases: Component = () => {
  const { sdo, clearSdo } = useSdoNav()
  const { query, onInput } = createListingSearch('useCases', () => sdo())
  const currentSdo = () => sdoById(sdo())

  const total = () => useCasesSlice().total ?? useCasesSlice().data.length
  const isSearch = () => useCasesSlice().query.trim().length > 0

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoPanel sdo={current()} onUnpin={clearSdo} />}
      </Show>
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Use cases</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          Portability use cases shared by the Fediverse migration stories in
          FEP-73cd and the W3C Linked Web Storage use cases.
        </p>
      </div>
      <SearchBar
        value={query()}
        onInput={onInput}
        label="Search use cases"
        placeholder="Search use cases…"
      />
      <Switch>
        <Match when={useCasesSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load use cases: {useCasesSlice().error}
          </p>
        </Match>
        <Match
          when={
            useCasesSlice().status === 'loading' &&
            useCasesSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">Loading use cases…</p>
        </Match>
        <Match when={useCasesSlice().status === 'ready'}>
          <Show
            when={useCasesSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                {isSearch()
                  ? `No use cases match “${useCasesSlice().query.trim()}”.`
                  : 'No use cases found in the catalog.'}
              </p>
            }
          >
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {total()} {isSearch() ? 'matching' : ''} use cases linked to
              specifications in the catalog.
            </p>
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={useCasesSlice().data}>
                {(useCase) => <UseCaseCard useCase={useCase} />}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={useCasesSlice().hasMore}
              loading={useCasesSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'useCases' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default UseCases
