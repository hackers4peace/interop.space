import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { PersonCard } from '../components/PersonCard'
import { appActor } from '../store/app'
import { detailFor } from '../store/selectors'

const ProjectDetail: Component = () => {
  const params = useParams<{ id: string }>()

  // Refetch whenever the :id param changes (navigating between projects reuses
  // this component).
  createEffect(() =>
    appActor.send({ type: 'loadDetail', kind: 'project', id: params.id }),
  )

  const state = () => detailFor('project', params.id)
  const view = () => {
    const data = state()?.data
    return data?.kind === 'project' ? data : undefined
  }

  return (
    <section class="space-y-6">
      <A
        href="/projects"
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All projects
      </A>
      <Switch>
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load project: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading project…</p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-1">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().project.name}
                </h1>
                <p class="text-slate-600 dark:text-slate-400">
                  {data().project.description}
                </p>
              </div>
              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  People in this project
                </h2>
                <Show
                  when={data().project.members.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No people yet.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={data().project.members}>
                      {(person) => <PersonCard person={person} />}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">Project not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default ProjectDetail
