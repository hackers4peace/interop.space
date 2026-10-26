import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { useSdoNav } from '../lib/sdoNav'

// Minimal shape shared by a resolved W3C group and a catalog-only group name.
export type GroupCardData = {
  id?: number
  name: string
  participants?: readonly unknown[]
}

const card =
  'flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-slate-800 dark:bg-slate-900'

const GroupCardContent: Component<{ group: GroupCardData; linked: boolean }> = (
  props,
) => (
  <>
    <span class="space-y-1">
      <span class="block font-semibold">{props.group.name}</span>
      <Show when={props.group.participants}>
        {(participants) => (
          <span class="block text-sm text-slate-500 dark:text-slate-400">
            {participants().length}
            {participants().length === 1 ? ' participant' : ' participants'}
          </span>
        )}
      </Show>
    </span>
    <Show when={props.linked}>
      <span aria-hidden="true" class="text-slate-400 dark:text-slate-500">
        →
      </span>
    </Show>
  </>
)

// Group summary card shared by the person and specification pages: links to
// the group page when the catalog resolves it, otherwise shows the bare name.
export const GroupCard: Component<{ group: GroupCardData }> = (props) => {
  const { href } = useSdoNav()
  return (
    <li>
      <Show
        when={props.group.id}
        fallback={
          <div class={card}>
            <GroupCardContent group={props.group} linked={false} />
          </div>
        }
      >
        {(id) => (
          <A href={href(`/groups/${id()}`)} class={`${card} hover:shadow-md`}>
            <GroupCardContent group={props.group} linked={true} />
          </A>
        )}
      </Show>
    </li>
  )
}
