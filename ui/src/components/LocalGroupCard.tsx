import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { OrgLogo } from './OrgLogo'
import { SdoLogo } from './SdoLogo'
import { useSdoNav } from '../lib/sdoNav'
import type { LocalGroup } from '../worker/protocol'

// Local-group card used on a location page. The title opens the group's
// detail page; the external group profile link lives there.
export const LocalGroupCard: Component<{ group: LocalGroup }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-start gap-4">
        <OrgLogo name={props.group.name} logo={props.group.logo} />
        <div class="min-w-0 flex-1 space-y-1.5">
          <A
            href={href(`/local-groups/${props.group.id}`)}
            class="text-lg font-semibold hover:underline"
          >
            {props.group.name}
          </A>
          <Show when={props.group.description}>
            {(description) => (
              <p class="text-sm text-slate-600 dark:text-slate-400">
                {description()}
              </p>
            )}
          </Show>
        </div>
        <SdoLogo sdo={props.group.sdo} />
      </div>
    </li>
  )
}
