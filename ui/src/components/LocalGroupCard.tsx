import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { ArrowUpRight } from 'lucide-solid'
import { OrgLogo } from './OrgLogo'
import { SdoLogo } from './SdoLogo'
import type { LocalGroup } from '../worker/protocol'

// Local-group card used on a location page. The group's own profile is the
// external link; the standards body it belongs to sits on the right.
export const LocalGroupCard: Component<{ group: LocalGroup }> = (props) => (
  <li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-start gap-4">
      <OrgLogo name={props.group.name} logo={props.group.logo} />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Show
          when={props.group.homepage}
          fallback={
            <h2 class="text-lg font-semibold">{props.group.name}</h2>
          }
        >
          {(url) => (
            <a
              href={url()}
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-lg font-semibold hover:underline"
            >
              {props.group.name}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </Show>
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
