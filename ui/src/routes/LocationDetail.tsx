import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { LocalGroupCard } from '../components/LocalGroupCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const LocationDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'location', id: params.id }),
  )

  const state = () => detailFor('location', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'location' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/locations')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All locations
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load location: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading location…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().location.name}
                </h1>
                <Show when={data().location.region}>
                  {(region) => (
                    <p>
                      <span class="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {region()}
                      </span>
                    </p>
                  )}
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Local groups
                </h2>
                <Show
                  when={data().groups.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No local groups are recorded for this location yet.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().groups}>
                      {(group) => <LocalGroupCard group={group} />}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
      </Switch>
    </section>
  )
}

export default LocationDetail
