import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { CalendarDays, ExternalLink, MapPin } from 'lucide-solid'
import { ContributorChips } from './ContributorChips'
import { useSdoNav } from '../lib/sdoNav'
import type { Publication } from '../worker/protocol'

const metaLink =
  'text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400'

// Publication summary card used by the publications directory.
export const PublicationCard: Component<{ publication: Publication }> = (
  props,
) => {
  const { href } = useSdoNav()

  return (
    <li class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="space-y-1">
        <A
          href={href(`/publications/${props.publication.id}`)}
          class="text-lg font-semibold hover:underline"
        >
          {props.publication.name}
        </A>
        <Show when={props.publication.venue}>
          {(venue) => (
            <p class="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <MapPin size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{venue()}</span>
            </p>
          )}
        </Show>
        <Show when={props.publication.date}>
          {(date) => (
            <p class="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={14} aria-hidden="true" />
              <span>{date()}</span>
            </p>
          )}
        </Show>
      </div>

      <Show when={props.publication.abstract}>
        {(abstract) => (
          <p class="line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
            {abstract()}
          </p>
        )}
      </Show>

      <Show when={props.publication.authors.length > 0}>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Authors
          </p>
          <ContributorChips people={props.publication.authors} />
        </div>
      </Show>

      <Show when={props.publication.url}>
        {(url) => (
          <a
            href={url()}
            target="_blank"
            rel="noreferrer"
            class={`inline-flex items-center gap-1 ${metaLink}`}
          >
            Paper
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </Show>
    </li>
  )
}
