import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Avatar } from './ui/avatar'
import { GithubHandle } from './GithubHandle'
import { useSdoNav } from '../lib/sdoNav'
import type { Person } from '../worker/protocol'

export const PersonCard: Component<{ person: Person }> = (props) => {
  const { href } = useSdoNav()
  return (
    <li>
      <A
        href={href(`/people/${props.person.id}`)}
        class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <Avatar src={props.person.avatarUrl} name={props.person.name} />
        <div class="min-w-0">
          <p class="truncate font-semibold">{props.person.name}</p>
          <Show when={props.person.github}>
            {(login) => <GithubHandle username={login()} />}
          </Show>
        </div>
      </A>
    </li>
  )
}
