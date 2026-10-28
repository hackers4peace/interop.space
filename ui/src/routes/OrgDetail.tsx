import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ContributorSection } from '../components/ContributorChips'
import { OrgLogo } from '../components/OrgLogo'
import { UseCaseCard } from '../components/UseCaseCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import {
  orgById,
  orgsSlice,
  useCaseByUri,
  useCasesSlice,
} from '../store/selectors'

const OrgDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  onMount(() => {
    if (orgsSlice().status === 'idle') appActor.send({ type: 'loadOrgs' })
    if (useCasesSlice().status === 'idle')
      appActor.send({ type: 'loadUseCases' })
  })

  const org = () => orgById(params.id)

  const proposedUseCases = () =>
    (org()?.proposedUseCaseUris ?? []).map((uri) => ({
      uri,
      useCase: useCaseByUri(uri),
    }))

  return (
    <section class="space-y-6">
      <A
        href={href('/orgs')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All organizations
      </A>
      <Switch>
        <Match when={orgsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load organizations: {orgsSlice().error}
          </p>
        </Match>
        <Match when={!org() && orgsSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading organization…
          </p>
        </Match>
        <Match when={org()}>
          {(o) => (
            <>
              <div class="flex items-center gap-5">
                <OrgLogo
                  name={o().name}
                  logo={o().logo}
                  size="md"
                />
                <div class="space-y-2">
                  <h1 class="text-3xl font-bold tracking-tight">{o().name}</h1>
                  <Show when={o().homepage}>
                    {(url) => (
                      <a
                        href={url()}
                        target="_blank"
                        rel="noreferrer"
                        class="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Homepage
                      </a>
                    )}
                  </Show>
                </div>
              </div>

              <ContributorSection
                title="Affiliates"
                people={o().affiliates}
                empty="No affiliates are recorded in the catalog."
              />

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Proposed use cases
                </h2>
                <Show
                  when={proposedUseCases().length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No use cases are recorded as proposed by this
                      organization.
                    </p>
                  }
                >
                  <Switch>
                    <Match when={useCasesSlice().status === 'error'}>
                      <ul class="space-y-1">
                        <For each={proposedUseCases()}>
                          {(item) => (
                            <li class="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {item.uri}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Match>
                    <Match when={useCasesSlice().status !== 'ready'}>
                      <p class="text-slate-500 dark:text-slate-400">
                        Loading use cases…
                      </p>
                    </Match>
                    <Match when={true}>
                      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <For each={proposedUseCases()}>
                          {(item) => (
                            <Show
                              when={item.useCase}
                              fallback={
                                <li class="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {item.uri}
                                </li>
                              }
                            >
                              {(useCase) => (
                                <UseCaseCard useCase={useCase()} />
                              )}
                            </Show>
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
        <Match when={!org()}>
          <p class="text-slate-500 dark:text-slate-400">
            Organization not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default OrgDetail
