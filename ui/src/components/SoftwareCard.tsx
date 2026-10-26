import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { useSdoNav } from '../lib/sdoNav'
import type { Software } from '../worker/protocol'

const tag =
  'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'

// Software summary card shared by the software directory and the
// specifications that software implements.
export const SoftwareCard: Component<{ software: Software }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="space-y-1">
        <A
          href={href(`/software/${props.software.id}`)}
          class="text-lg font-semibold hover:underline"
        >
          {props.software.name}
        </A>
        <Show when={props.software.description}>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            {props.software.description}
          </p>
        </Show>
      </div>
      <Show when={props.software.programmingLanguages.length > 0}>
        <ul class="flex flex-wrap gap-2">
          <For each={props.software.programmingLanguages}>
            {(language) => <li class={tag}>{language}</li>}
          </For>
        </ul>
      </Show>
    </li>
  )
}
