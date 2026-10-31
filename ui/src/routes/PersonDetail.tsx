import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { Avatar } from '../components/ui/avatar'
import { GithubHandle } from '../components/GithubHandle'
import { GroupCard } from '../components/GroupCard'
import { SoftwareCard } from '../components/SoftwareCard'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const sectionTitle =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

const PersonDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  // Refetch whenever the :id param changes (navigating between people reuses
  // this component).
  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'person', id: params.id }),
  )

  const state = () => detailFor('person', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'person' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/people')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All people
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load person: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading person…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="flex items-center gap-5">
                <Avatar
                  src={data().person.avatarUrl}
                  name={data().person.name}
                />
                <div class="space-y-1">
                  <h1 class="text-3xl font-bold tracking-tight">
                    {data().person.name}
                  </h1>
                  <Show when={data().person.github}>
                    {(login) => <GithubHandle username={login()} />}
                  </Show>
                </div>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Specifications</h2>
                <Show
                  when={
                    data().edited.length > 0 || data().authored.length > 0
                  }
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      Not an author or editor of any specification in the
                      catalog.
                    </p>
                  }
                >
                  <div class="space-y-6">
                    <Show when={data().edited.length > 0}>
                      <div class="space-y-3">
                        <h3 class={sectionTitle}>Editor of</h3>
                        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <For each={data().edited}>
                            {(spec) => (
                              <li>
                                <SpecificationCard spec={spec} />
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>
                    <Show when={data().authored.length > 0}>
                      <div class="space-y-3">
                        <h3 class={sectionTitle}>Author of</h3>
                        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <For each={data().authored}>
                            {(spec) => (
                              <li>
                                <SpecificationCard spec={spec} />
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Software</h2>
                <Show
                  when={data().software.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      Not a maintainer of any software in the catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().software}>
                      {(sw) => <SoftwareCard software={sw} />}
                    </For>
                  </ul>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Groups</h2>
                <Show
                  when={data().groups.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      Not a participant of any W3C group in the catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().groups}>
                      {(group) => <GroupCard group={group} />}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">Person not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default PersonDetail
