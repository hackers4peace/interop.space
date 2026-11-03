import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { CalendarDays, MapPin } from 'lucide-solid'
import { SdoLogo } from './SdoLogo'
import { useSdoNav } from '../lib/sdoNav'
import { eventDateRange } from '../lib/event'
import type { Event } from '../worker/protocol'

// Event summary card used by the events directory and location pages. The
// title opens the event page; the external event link lives there.
export const EventCard: Component<{ event: Event }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-start gap-4">
        <div class="min-w-0 flex-1 space-y-2">
          <A
            href={href(`/events/${props.event.id}`)}
            class="text-lg font-semibold hover:underline"
          >
            {props.event.name}
          </A>
          <div class="space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <Show when={eventDateRange(props.event)}>
              {(range) => (
                <p class="flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" />
                  <span title="Dates are in UTC">{range()}</span>
                </p>
              )}
            </Show>
            <Show when={props.event.location}>
              {(location) => (
                <p class="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {location()}
                </p>
              )}
            </Show>
          </div>
        </div>
        <SdoLogo sdo={props.event.sdo} />
      </div>
    </li>
  )
}
