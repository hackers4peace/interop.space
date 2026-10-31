import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A } from '@solidjs/router'
import { Avatar } from '../components/ui/avatar'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { appActor } from '../store/app'
import { projectsSlice } from '../store/selectors'

// W3C groups in the catalog have hundreds of participants; a card only has
// room for a handful of avatars, the rest is summarized as "+N".
const MAX_MEMBER_AVATARS = 8

const Projects: Component = () => {
  onMount(() => appActor.send({ type: 'search', kind: 'projects', query: '' }))

  const total = () => projectsSlice().total ?? projectsSlice().data.length

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
        <p class="text-slate-600 dark:text-slate-400">{total()} projects.</p>
      </div>
      <Switch>
        <Match when={projectsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load projects: {projectsSlice().error}
          </p>
        </Match>
        <Match
          when={
            projectsSlice().status === 'loading' &&
            projectsSlice().data.length === 0
          }
        >
          <p class="text-slate-500 dark:text-slate-400">Loading projects…</p>
        </Match>
        <Match when={projectsSlice().status === 'ready'}>
          <Show
            when={projectsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                No projects found in the catalog.
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={projectsSlice().data}>
                {(project) => (
                  <li>
                    <A
                      href={`/projects/${project.id}`}
                      class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div class="space-y-1">
                        <p class="text-lg font-semibold">{project.name}</p>
                        <p class="text-sm text-slate-500 dark:text-slate-400">
                          {project.description}
                        </p>
                      </div>
                      <Show
                        when={project.members.length > 0}
                        fallback={
                          <p class="text-xs text-slate-400">
                            {project.memberIds.length} members
                          </p>
                        }
                      >
                        <div class="flex items-center">
                          <div class="flex -space-x-3">
                            <For each={project.members.slice(0, MAX_MEMBER_AVATARS)}>
                              {(person) => (
                                <div class="ring-2 ring-white dark:ring-slate-900 rounded-full">
                                  <Avatar
                                    src={person.avatarUrl}
                                    name={person.name}
                                  />
                                </div>
                              )}
                            </For>
                          </div>
                          <Show when={project.members.length > MAX_MEMBER_AVATARS}>
                            <span class="ml-3 text-xs text-slate-400">
                              +{project.members.length - MAX_MEMBER_AVATARS}
                            </span>
                          </Show>
                        </div>
                      </Show>
                    </A>
                  </li>
                )}
              </For>
            </ul>
            <InfiniteScroll
              hasMore={projectsSlice().hasMore}
              loading={projectsSlice().loadingMore}
              onLoadMore={() =>
                appActor.send({ type: 'loadMore', kind: 'projects' })
              }
            />
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Projects
