import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { CalendarDays, MapPin } from 'lucide-solid'
import { ContributorSection } from '../components/ContributorChips'
import { SoftwareCard } from '../components/SoftwareCard'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import { detailFor } from '../store/selectors'

const metaLink =
  'rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800'

const sectionTitle =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

const PublicationDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  createEffect(() =>
    appActor.send({
      type: 'loadDetail',
      kind: 'publication',
      id: params.id,
    }),
  )

  const state = () => detailFor('publication', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'publication' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/publications')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All publications
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load publication: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading publication…
          </p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-3">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().publication.name}
                </h1>
                <div class="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <Show when={data().publication.venue}>
                    {(venue) => (
                      <p class="flex items-start gap-1.5">
                        <MapPin
                          size={14}
                          class="mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{venue()}</span>
                      </p>
                    )}
                  </Show>
                  <Show when={data().publication.date}>
                    {(date) => (
                      <p class="flex items-center gap-1.5">
                        <CalendarDays size={14} aria-hidden="true" />
                        <span>{date()}</span>
                      </p>
                    )}
                  </Show>
                </div>
                <Show when={data().publication.url}>
                  {(url) => (
                    <div class="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={url()}
                        target="_blank"
                        rel="noreferrer"
                        title="Published document"
                        class={metaLink}
                      >
                        Paper
                      </a>
                    </div>
                  )}
                </Show>
                <Show when={data().publication.abstract}>
                  {(abstract) => (
                    <p class="max-w-prose text-slate-600 dark:text-slate-400">
                      {abstract()}
                    </p>
                  )}
                </Show>
              </div>

              <ContributorSection
                title="Authors"
                people={data().publication.authors}
                empty="No authors recorded for this publication."
              />

              <div class="space-y-3">
                <h2 class={sectionTitle}>Referenced specifications</h2>
                <Show
                  when={data().specifications.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No catalog specifications are referenced by this
                      publication.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().specifications}>
                      {(spec) => (
                        <li>
                          <SpecificationCard spec={spec} showGroups />
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Referenced software</h2>
                <Show
                  when={data().software.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No catalog software is referenced by this publication.
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
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">
            Publication not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default PublicationDetail
