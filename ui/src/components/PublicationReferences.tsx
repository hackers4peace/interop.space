import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { CalendarDays, MapPin } from 'lucide-solid'
import { useSdoNav } from '../lib/sdoNav'
import type { PublicationRef } from '../worker/protocol'

// Reverse citations: publications that reference the current specification.
export const PublicationReferenceSection: Component<{
  id?: string
  title: string
  publications: PublicationRef[]
  empty: string
}> = (props) => {
  const { href } = useSdoNav()

  return (
    <div id={props.id} class="scroll-mt-24 space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.title}
      </h2>
      <Show
        when={props.publications.length > 0}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">{props.empty}</p>
        }
      >
        <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <For each={props.publications}>
            {(publication) => (
              <li class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <A
                  href={href(`/publications/${publication.id}`)}
                  class="break-words font-medium hover:underline"
                >
                  {publication.name}
                </A>
                <Show when={publication.venue}>
                  {(venue) => (
                    <p class="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin
                        size={12}
                        class="mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{venue()}</span>
                    </p>
                  )}
                </Show>
                <Show when={publication.date}>
                  {(date) => (
                    <p class="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <CalendarDays size={12} aria-hidden="true" />
                      <span>{date()}</span>
                    </p>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
