import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { PersonCard } from '../components/PersonCard'
import { SdoBanner } from '../components/SdoBanner'
import { SpecificationCard } from '../components/SpecificationCard'
import { personFromParticipant } from '../lib/person'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { appActor } from '../store/app'
import {
  groupById,
  specificationsOf,
  specificationsSlice,
  w3cGroupsSlice,
} from '../store/selectors'

const GroupDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  onMount(() => {
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
  })

  const group = () => groupById(Number(params.id))

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoBanner sdo={current()} />}
      </Show>
      <A
        href={href('/groups')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All groups
      </A>
      <Switch>
        <Match when={w3cGroupsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load W3C groups: {w3cGroupsSlice().error}
          </p>
        </Match>
        <Match when={!group() && w3cGroupsSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading group…</p>
        </Match>
        <Match when={group()}>
          {(grp) => (
            <>
              <div class="space-y-1">
                <h1 class="text-3xl font-bold tracking-tight">{grp().name}</h1>
                <p class="text-slate-600 dark:text-slate-400">
                  W3C group {grp().id} · {grp().participants.length}
                  {grp().participants.length === 1
                    ? ' participant'
                    : ' participants'}{' '}
                  in the catalog.
                </p>
              </div>
              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Specifications
                </h2>
                <Switch>
                  <Match when={specificationsSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load specifications:{' '}
                      {specificationsSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      specificationsSlice().status !== 'ready' &&
                      specificationsOf(grp()).length === 0
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading specifications…
                    </p>
                  </Match>
                  <Match when={specificationsSlice().status === 'ready'}>
                    <Show
                      when={specificationsOf(grp()).length > 0}
                      fallback={
                        <p class="text-slate-500 dark:text-slate-400">
                          No specifications delivered by this group in the
                          catalog.
                        </p>
                      }
                    >
                      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <For each={specificationsOf(grp())}>
                          {(spec) => (
                            <li>
                              <SpecificationCard spec={spec} />
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </Match>
                </Switch>
              </div>
              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Participants
                </h2>
                <Show
                  when={grp().participants.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No participants.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={grp().participants}>
                      {(person) => (
                        <PersonCard person={personFromParticipant(person)} />
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!group()}>
          <p class="text-slate-500 dark:text-slate-400">Group not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default GroupDetail
