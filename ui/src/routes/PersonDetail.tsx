import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { Avatar } from '../components/ui/avatar'
import { GithubHandle } from '../components/GithubHandle'
import { GroupCard } from '../components/GroupCard'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import {
  authoredSpecificationsOf,
  editedSpecificationsOf,
  groupsOfPerson,
  peopleSlice,
  personById,
  specificationsSlice,
  w3cGroupsSlice,
} from '../store/selectors'

const PersonDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  onMount(() => {
    if (peopleSlice().status === 'idle') appActor.send({ type: 'loadPeople' })
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
  })

  const person = () => personById(params.id)
  const groups = () => {
    const p = person()
    return p ? groupsOfPerson(p) : []
  }
  const edited = () => {
    const p = person()
    return p ? editedSpecificationsOf(p) : []
  }
  const authored = () => {
    const p = person()
    return p ? authoredSpecificationsOf(p) : []
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/people')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All people
      </A>
      <Switch>
        <Match when={peopleSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load people: {peopleSlice().error}
          </p>
        </Match>
        <Match when={!person() && peopleSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading person…</p>
        </Match>
        <Match when={person()}>
          {(who) => (
            <>
              <div class="flex items-center gap-5">
                <Avatar src={who().avatarUrl} name={who().name} />
                <div class="space-y-1">
                  <h1 class="text-3xl font-bold tracking-tight">
                    {who().name}
                  </h1>
                  <Show when={who().github}>
                    {(login) => <GithubHandle username={login()} />}
                  </Show>
                  {/* The stable W3C user id belongs on the person page, not on
                      the compact card. */}
                  <Show when={who().w3cId !== undefined}>
                    <p class="font-mono text-sm text-slate-500 dark:text-slate-400">
                      w3c:{who().w3cId}
                    </p>
                  </Show>
                </div>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Specifications
                </h2>
                <Switch>
                  <Match when={specificationsSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load specifications:{' '}
                      {specificationsSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      specificationsSlice().status !== 'ready' &&
                      edited().length === 0 &&
                      authored().length === 0
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading specifications…
                    </p>
                  </Match>
                  <Match when={specificationsSlice().status === 'ready'}>
                    <Show
                      when={edited().length > 0 || authored().length > 0}
                      fallback={
                        <p class="text-slate-500 dark:text-slate-400">
                          Not an author or editor of any specification in the
                          catalog.
                        </p>
                      }
                    >
                      <div class="space-y-6">
                        <Show when={edited().length > 0}>
                          <div class="space-y-3">
                            <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Editor of
                            </h3>
                            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <For each={edited()}>
                                {(spec) => (
                                  <li>
                                    <SpecificationCard spec={spec} />
                                  </li>
                                )}
                              </For>
                            </ul>
                          </div>
                        </Show>
                        <Show when={authored().length > 0}>
                          <div class="space-y-3">
                            <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Author of
                            </h3>
                            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <For each={authored()}>
                                {(spec) => (
                                  <li>
                                    <SpecificationCard spec={spec} />
                                  </li>
                                )}
                              </For>
                            </ul>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </Match>
                </Switch>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Groups
                </h2>
                <Switch>
                  <Match when={w3cGroupsSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load W3C groups: {w3cGroupsSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      w3cGroupsSlice().status !== 'ready' &&
                      groups().length === 0
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading groups…
                    </p>
                  </Match>
                  <Match when={w3cGroupsSlice().status === 'ready'}>
                    <Show
                      when={groups().length > 0}
                      fallback={
                        <p class="text-slate-500 dark:text-slate-400">
                          Not a participant of any W3C group in the catalog.
                        </p>
                      }
                    >
                      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <For each={groups()}>
                          {(group) => <GroupCard group={group} />}
                        </For>
                      </ul>
                    </Show>
                  </Match>
                </Switch>
              </div>
            </>
          )}
        </Match>
        <Match when={!person()}>
          <p class="text-slate-500 dark:text-slate-400">Person not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default PersonDetail
