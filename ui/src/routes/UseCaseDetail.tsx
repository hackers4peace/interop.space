import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { OrgLogo } from '../components/OrgLogo'
import { SdoBanner } from '../components/SdoBanner'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const UseCaseDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'useCase', id: params.id }),
  )

  const state = () => detailFor('useCase', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'useCase' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoBanner sdo={current()} />}
      </Show>
      <A
        href={href('/use-cases')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All use cases
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load use case: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading use case…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().useCase.name}
                </h1>
                <Show when={data().useCase.description}>
                  <p class="max-w-prose text-slate-600 dark:text-slate-400">
                    {data().useCase.description}
                  </p>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Proposed by
                </h2>
                <Show
                  when={data().orgs.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No organization is recorded as proposing this use case.
                    </p>
                  }
                >
                  <ul class="space-y-2">
                    <For each={data().orgs}>
                      {(org) => (
                        <li>
                          <A
                            href={href(`/orgs/${org.id}`)}
                            class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                          >
                            <OrgLogo name={org.name} logo={org.logo} />
                            <span class="font-medium">{org.name}</span>
                          </A>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Related specifications
                </h2>
                <Show
                  when={data().specifications.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No specifications are linked to this use case in the
                      catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().specifications}>
                      {(item) => (
                        <li>
                          <Show
                            when={item.spec}
                            fallback={
                              <a
                                href={item.uri}
                                target="_blank"
                                rel="noreferrer"
                                class="text-indigo-600 hover:underline dark:text-indigo-400"
                              >
                                {item.uri}
                              </a>
                            }
                          >
                            {(spec) => (
                              <SpecificationCard spec={spec()} showGroups />
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">Use case not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default UseCaseDetail
