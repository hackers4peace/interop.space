import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ContributorSection } from '../components/ContributorChips'
import { FundingList } from '../components/FundingList'
import { OrgLogo } from '../components/OrgLogo'
import { UseCaseCard } from '../components/UseCaseCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const OrgDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'org', id: params.id }),
  )

  const state = () => detailFor('org', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'org' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/orgs')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All organizations
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load organization: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading organization…
          </p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="flex items-center gap-5">
                <OrgLogo
                  name={data().org.name}
                  logo={data().org.logo}
                  size="md"
                />
                <div class="space-y-2">
                  <h1 class="text-3xl font-bold tracking-tight">
                    {data().org.name}
                  </h1>
                  <Show when={data().org.homepage}>
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
                people={data().org.affiliates}
                empty="No affiliates are recorded in the catalog."
              />

              <Show when={data().org.funds.length > 0}>
                <div class="space-y-3">
                  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Funds
                  </h2>
                  <div class="space-y-5">
                    <For each={data().org.funds}>
                      {(group) => (
                        <div class="space-y-2">
                          <A
                            href={href(`/software/${group.software.id}`)}
                            class="text-sm font-semibold hover:underline"
                          >
                            {group.software.name}
                          </A>
                          <FundingList fundings={group.fundings} />
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Proposed use cases
                </h2>
                <Show
                  when={data().proposed.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No use cases are recorded as proposed by this
                      organization.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().proposed}>
                      {(item) => (
                        <Show
                          when={item.useCase}
                          fallback={
                            <li class="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {item.uri}
                            </li>
                          }
                        >
                          {(useCase) => <UseCaseCard useCase={useCase()} />}
                        </Show>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">
            Organization not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default OrgDetail
