import type { Component } from 'solid-js'
import { Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ArrowUpRight } from 'lucide-solid'
import { OrgLogo } from '../components/OrgLogo'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const number = (value?: number) =>
  value === undefined ? undefined : new Intl.NumberFormat().format(value)

const Metric: Component<{ label: string; value?: string }> = (props) => (
  <Show when={props.value}>
    {(value) => (
      <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {props.label}
        </dt>
        <dd class="mt-1 font-mono text-sm">{value()}</dd>
      </div>
    )}
  </Show>
)

const DeploymentDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'deployment', id: params.id }),
  )

  const state = () => detailFor('deployment', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'deployment' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/deployments')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All deployments
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load deployment: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading deployment…
          </p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="flex items-center gap-5">
                <Show when={data().server.logo}>
                  {(logo) => (
                    <OrgLogo
                      name={data().server.name}
                      logo={logo()}
                      size="md"
                    />
                  )}
                </Show>
                <div class="min-w-0 space-y-2">
                  <h1 class="text-3xl font-bold tracking-tight">
                    {data().server.name}
                  </h1>
                  <Show when={data().server.domain}>
                    {(domain) => (
                      <p class="font-mono text-sm text-slate-500 dark:text-slate-400">
                        {domain()}
                      </p>
                    )}
                  </Show>
                  <div class="flex flex-wrap gap-3 text-sm">
                    <Show when={data().server.homepage}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          class="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Provider website
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      )}
                    </Show>
                    <Show when={data().server.fedidbUrl}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          class="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          View on FediDB
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      )}
                    </Show>
                  </div>
                </div>
              </div>

              <Show when={data().server.software}>
                {(software) => (
                  <p class="text-sm text-slate-600 dark:text-slate-400">
                    Runs{' '}
                    <A
                      href={href(`/software/${software().id}`)}
                      class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {software().name}
                    </A>
                  </p>
                )}
              </Show>

              <Show when={data().server.description}>
                {(description) => (
                  <p class="max-w-prose text-slate-600 dark:text-slate-400">
                    {description()}
                  </p>
                )}
              </Show>

              <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Metric label="Users" value={number(data().server.users)} />
                <Metric
                  label="Monthly active"
                  value={number(data().server.monthlyActive)}
                />
                <Metric label="Posts" value={number(data().server.posts)} />
                <Metric label="Country" value={data().server.country} />
                <Metric label="Version" value={data().server.version} />
                <Metric
                  label="Open registrations"
                  value={
                    data().server.openRegistrations === undefined
                      ? undefined
                      : data().server.openRegistrations
                        ? 'Yes'
                        : 'No'
                  }
                />
                <Metric label="First seen" value={data().server.firstSeen} />
                <Metric label="Last seen" value={data().server.lastSeen} />
                <Metric label="Operating since" value={data().server.since} />
                <Metric
                  label="Audience"
                  value={
                    data().server.audiences.length > 0
                      ? data().server.audiences.join(', ')
                      : undefined
                  }
                />
              </dl>

              <Show when={data().server.source}>
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                  >
                    Source
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
              </Show>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">
            Deployment not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default DeploymentDetail
