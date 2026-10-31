import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { PersonCard } from '../components/PersonCard'
import { SdoBanner } from '../components/SdoBanner'
import { SpecificationCard } from '../components/SpecificationCard'
import { personFromParticipant } from '../lib/person'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { appActor } from '../store/app'
import { detailFor } from '../store/selectors'

const GroupDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'group', id: params.id }),
  )

  const state = () => detailFor('group', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'group' ? data : undefined
  }

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
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load group: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading group…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-1">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().group.name}
                </h1>
                <p class="text-slate-600 dark:text-slate-400">
                  W3C group {data().group.id} ·{' '}
                  {data().group.participants.length}
                  {data().group.participants.length === 1
                    ? ' participant'
                    : ' participants'}{' '}
                  in the catalog.
                </p>
              </div>
              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Specifications
                </h2>
                <Show
                  when={data().specifications.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No specifications delivered by this group in the catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().specifications}>
                      {(spec) => (
                        <li>
                          <SpecificationCard spec={spec} />
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Participants
                </h2>
                <Show
                  when={data().group.participants.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No participants.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={data().group.participants}>
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
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">Group not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default GroupDetail
