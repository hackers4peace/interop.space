import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { SdoLogo } from './SdoLogo'
import { useSdoNav } from '../lib/sdoNav'
import type { Location } from '../worker/protocol'

// Location summary card used by the locations directory. The place opens its
// detail page; the icons show which standards bodies have a presence there.
export const LocationCard: Component<{ location: Location }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="space-y-2">
        <A
          href={href(`/locations/${props.location.id}`)}
          class="text-lg font-semibold hover:underline"
        >
          {props.location.name}
        </A>
        <Show when={props.location.region}>
          {(region) => (
            <p>
              <span class="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {region()}
              </span>
            </p>
          )}
        </Show>
      </div>
      <Show when={props.location.sdos.length > 0}>
        <ul
          class="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
          aria-label="Standards bodies present"
        >
          <For each={props.location.sdos}>
            {(sdo) => (
              <li>
                <SdoLogo sdo={sdo} size="xs" />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </li>
  )
}
