import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { OrgLogo } from '../components/OrgLogo'
import { SdoBanner } from '../components/SdoBanner'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import {
  orgsProposing,
  orgsSlice,
  specificationByUri,
  specificationsSlice,
  useCaseById,
  useCasesSlice,
} from '../store/selectors'

const UseCaseDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  onMount(() => {
    if (useCasesSlice().status === 'idle')
      appActor.send({ type: 'loadUseCases' })
    // The related-specification cards need the catalog's name and TR/ED links.
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
    // Proposing organizations are joined through ex:proposed.
    if (orgsSlice().status === 'idle') appActor.send({ type: 'loadOrgs' })
  })

  const useCase = () => useCaseById(params.id)

  const relatedSpecifications = () =>
    (useCase()?.specificationUris ?? []).map((uri) => ({
      uri,
      spec: specificationByUri(uri),
    }))

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
        <Match when={useCasesSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load use cases: {useCasesSlice().error}
          </p>
        </Match>
        <Match when={!useCase() && useCasesSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading use case…</p>
        </Match>
        <Match when={useCase()}>
          {(uc) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">{uc().name}</h1>
                <Show when={uc().description}>
                  <p class="max-w-prose text-slate-600 dark:text-slate-400">
                    {uc().description}
                  </p>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Proposed by
                </h2>
                <Switch>
                  <Match when={orgsSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load organizations: {orgsSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      orgsProposing(uc()).length === 0 &&
                      orgsSlice().status !== 'ready'
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading organizations…
                    </p>
                  </Match>
                  <Match when={orgsProposing(uc()).length === 0}>
                    <p class="text-slate-500 dark:text-slate-400">
                      No organization is recorded as proposing this use case.
                    </p>
                  </Match>
                  <Match when={true}>
                    <ul class="space-y-2">
                      <For each={orgsProposing(uc())}>
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
                  </Match>
                </Switch>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Related specifications
                </h2>
                <Show
                  when={relatedSpecifications().length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No specifications are linked to this use case in the
                      catalog.
                    </p>
                  }
                >
                  <Switch>
                    <Match when={specificationsSlice().status === 'error'}>
                      <ul class="space-y-2">
                        <For each={relatedSpecifications()}>
                          {(item) => (
                            <li>
                              <a
                                href={item.uri}
                                target="_blank"
                                rel="noreferrer"
                                class="text-indigo-600 hover:underline dark:text-indigo-400"
                              >
                                {item.uri}
                              </a>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Match>
                    <Match when={specificationsSlice().status !== 'ready'}>
                      <p class="text-slate-500 dark:text-slate-400">
                        Loading specifications…
                      </p>
                    </Match>
                    <Match when={true}>
                      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <For each={relatedSpecifications()}>
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
                    </Match>
                  </Switch>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!useCase()}>
          <p class="text-slate-500 dark:text-slate-400">Use case not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default UseCaseDetail
