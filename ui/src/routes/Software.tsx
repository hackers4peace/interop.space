import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { appActor } from '../store/app'
import { isW3cScope, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { softwareSlice } from '../store/selectors'

const Software: Component = () => {
  const { sdo } = useSdoNav()
  const w3cScope = () => isW3cScope(sdo())
  const scopeName = () => sdoDisplayName(sdo())

  onMount(() => {
    if (softwareSlice().status === 'idle')
      appActor.send({ type: 'loadSoftware' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Software</h1>
        <Show when={w3cScope()}>
          <p class="text-slate-600 dark:text-slate-400">
            {softwareSlice().data.length} software entries in the catalog.
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
        <Switch>
          <Match when={softwareSlice().status === 'error'}>
            <p class="text-red-500">
              Failed to load software: {softwareSlice().error}
            </p>
          </Match>
          <Match when={softwareSlice().status === 'loading'}>
            <p class="text-slate-500 dark:text-slate-400">Loading software…</p>
          </Match>
          <Match when={softwareSlice().status === 'ready'}>
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={softwareSlice().data}>
                {(sw) => (
                  <li class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p class="text-lg font-semibold">{sw.name}</p>
                    <Show
                      when={sw.dependencies.length > 0}
                      fallback={
                        <p class="text-sm text-slate-400">No dependencies.</p>
                      }
                    >
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Dependencies
                      </p>
                      <ul class="list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
                        <For each={sw.dependencies}>
                          {(dep) => <li>{dep}</li>}
                        </For>
                      </ul>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>
      </Show>
    </section>
  )
}

export default Software
