import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Server as ServerIcon, Users } from 'lucide-solid'
import { useSdoNav } from '../lib/sdoNav'
import type { Server } from '../worker/protocol'

const tag =
  'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'

const number = (value?: number) =>
  value === undefined ? undefined : new Intl.NumberFormat().format(value)

// Deployment summary card shared by the deployments directory. A deployment
// is an ex:Server (FediDB export or Matrix hosting provider), not software.
export const ServerCard: Component<{ server: Server }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 space-y-1">
          <A
            href={href(`/deployments/${props.server.id}`)}
            class="text-lg font-semibold hover:underline"
          >
            {props.server.name}
          </A>
          <Show
            when={
              props.server.domain && props.server.domain !== props.server.name
            }
          >
            {(domain) => (
              <p class="font-mono text-xs text-slate-500 dark:text-slate-400">
                {domain()}
              </p>
            )}
          </Show>
        </div>
        <Show when={props.server.country}>
          {(country) => <span class={tag}>{country()}</span>}
        </Show>
      </div>

      <Show when={props.server.software}>
        {(software) => (
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Runs{' '}
            <A
              href={href(`/software/${software().id}`)}
              class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {software().name}
            </A>
          </p>
        )}
      </Show>

      <Show when={props.server.description}>
        {(description) => (
          <p class="text-sm text-slate-600 dark:text-slate-400">
            {description()}
          </p>
        )}
      </Show>

      <ul class="mt-auto flex flex-wrap gap-2">
        <Show when={props.server.users !== undefined}>
          <li class={`${tag} inline-flex items-center gap-1`}>
            <Users size={12} aria-hidden="true" />
            {number(props.server.users)} users
          </li>
        </Show>
        <Show when={props.server.openRegistrations}>
          <li class={tag}>Open registrations</li>
        </Show>
        <Show when={props.server.since}>
          {(since) => <li class={tag}>Since {since()}</li>}
        </Show>
        <For each={props.server.audiences}>
          {(audience) => <li class={tag}>{audience}</li>}
        </For>
        <Show when={props.server.fedidbUrl}>
          <li class={`${tag} inline-flex items-center gap-1`}>
            <ServerIcon size={12} aria-hidden="true" />
            FediDB
          </li>
        </Show>
      </ul>
    </li>
  )
}
