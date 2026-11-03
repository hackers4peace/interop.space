import type { Component } from 'solid-js'
import { Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-solid'
import { SdoLogo } from '../components/SdoLogo'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { eventDateRange } from '../lib/event'
import { detailFor } from '../store/selectors'

const EventDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'event', id: params.id }),
  )

  const state = () => detailFor('event', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'event' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/events')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All events
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">Failed to load event: {state()?.error}</p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading event…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 space-y-2">
                  <h1 class="text-3xl font-bold tracking-tight">
                    {data().event.name}
                  </h1>
                  <Show when={eventDateRange(data().event)}>
                    {(range) => (
                      <p class="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <CalendarDays size={16} aria-hidden="true" />
                        <span title="Dates are in UTC">{range()}</span>
                      </p>
                    )}
                  </Show>
                  <Show when={data().event.location}>
                    {(location) => (
                      <p class="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <MapPin size={16} aria-hidden="true" />
                        {location()}
                      </p>
                    )}
                  </Show>
                  <Show when={data().location}>
                    {(location) => (
                      <A
                        href={href(`/locations/${location().id}`)}
                        class="inline-flex text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        View {location().name} location
                      </A>
                    )}
                  </Show>
                </div>
                <SdoLogo sdo={data().event.sdo} />
              </div>

              <Show when={data().event.source}>
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                  >
                    Official event page
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

export default EventDetail
