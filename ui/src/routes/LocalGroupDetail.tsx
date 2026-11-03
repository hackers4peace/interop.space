import type { Component } from 'solid-js'
import { Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ArrowUpRight, MapPin } from 'lucide-solid'
import { OrgLogo } from '../components/OrgLogo'
import { SdoLogo } from '../components/SdoLogo'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const LocalGroupDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'localGroup', id: params.id }),
  )

  const state = () => detailFor('localGroup', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'localGroup' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/locations')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All locations
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load local group: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading local group…
          </p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-5">
                  <OrgLogo
                    name={data().group.name}
                    logo={data().group.logo}
                    size="md"
                  />
                  <div class="min-w-0 space-y-2">
                    <h1 class="text-3xl font-bold tracking-tight">
                      {data().group.name}
                    </h1>
                    <Show when={data().group.description}>
                      {(description) => (
                        <p class="max-w-prose text-slate-600 dark:text-slate-400">
                          {description()}
                        </p>
                      )}
                    </Show>
                    <Show when={data().location}>
                      {(location) => (
                        <A
                          href={href(`/locations/${location().id}`)}
                          class="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          <MapPin size={16} aria-hidden="true" />
                          {location().name}
                        </A>
                      )}
                    </Show>
                  </div>
                </div>
                <SdoLogo sdo={data().group.sdo} />
              </div>

              <Show when={data().group.homepage}>
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                  >
                    Official group page
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </section>
  )
}

export default LocalGroupDetail
