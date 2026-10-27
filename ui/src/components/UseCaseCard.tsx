import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { useSdoNav } from '../lib/sdoNav'
import type { UseCase } from '../worker/protocol'

// Shared use-case card: the title opens the use-case page, which lists the
// specifications the use case is linked to.
export const UseCaseCard: Component<{ useCase: UseCase }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <A
        href={href(`/use-cases/${props.useCase.id}`)}
        class="text-lg font-semibold hover:underline"
      >
        {props.useCase.name}
      </A>
      <Show when={props.useCase.description}>
        <p class="text-sm text-slate-600 dark:text-slate-400">
          {props.useCase.description}
        </p>
      </Show>
    </li>
  )
}
