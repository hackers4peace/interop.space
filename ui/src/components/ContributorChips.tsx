import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { GithubHandle } from './GithubHandle'
import { PersonCard } from './PersonCard'
import { personFromContributor } from '../lib/person'
import { useSdoNav } from '../lib/sdoNav'
import type { SpecContributor } from '../worker/protocol'

const base =
  'rounded-full bg-slate-100 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'
const link =
  'transition hover:bg-slate-200 dark:hover:bg-slate-700'

export const ContributorChips: Component<{
  people: SpecContributor[]
  size?: 'sm' | 'md'
  class?: string
}> = (props) => {
  const { href } = useSdoNav()
  const sizeClass = () =>
    props.size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <ul class={`flex flex-wrap gap-2 ${props.class ?? ''}`}>
      <For each={props.people}>
        {(person) => (
          <li>
            <Show
              when={person.id}
              fallback={
                <span class={`${base} ${sizeClass()}`}>{person.name}</span>
              }
            >
              {(id) => (
                <A
                  href={href(`/people/${id()}`)}
                  class={`${base} ${sizeClass()} ${link}`}
                >
                  {person.name}
                </A>
              )}
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

// Linked contributors use the same card as the people directory; a literal
// name from the catalog still gets the card shell, just without a link.
const ContributorCard: Component<{ contributor: SpecContributor }> = (
  props,
) => {
  const person = () => personFromContributor(props.contributor)
  return (
    <Show
      when={person()}
      fallback={
        <li class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="min-w-0">
            <p class="truncate font-semibold">{props.contributor.name}</p>
            <Show when={props.contributor.github}>
              {(login) => <GithubHandle username={login()} />}
            </Show>
          </div>
        </li>
      }
    >
      {(linked) => <PersonCard person={linked()} />}
    </Show>
  )
}

export const ContributorSection: Component<{
  title: string
  people: SpecContributor[]
  empty: string
}> = (props) => (
  <div class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {props.title}
    </h2>
    <Show
      when={props.people.length > 0}
      fallback={
        <p class="text-slate-500 dark:text-slate-400">{props.empty}</p>
      }
    >
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={props.people}>
          {(person) => <ContributorCard contributor={person} />}
        </For>
      </ul>
    </Show>
  </div>
)
