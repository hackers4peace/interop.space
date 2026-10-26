import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { SoftwareCard } from '../components/SoftwareCard'
import { appActor } from '../store/app'
import { isW3cScope, sdoDisplayName } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { softwareSlice } from '../store/selectors'

const Software: Component = () => {
  const { sdo, href } = useSdoNav()
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
            <Show
              when={softwareSlice().data.length > 0}
              fallback={
                <p class="text-slate-500 dark:text-slate-400">
                  No software entries in the catalog yet.
                </p>
              }
            >
              <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <For each={softwareSlice().data}>
                  {(sw) => <SoftwareCard software={sw} />}
                </For>
              </ul>
            </Show>
          </Match>
        </Switch>
      </Show>
    </section>
  )
}

export default Software
