import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-solid'
import { SdoLogo } from './SdoLogo'
import type { Event } from '../worker/protocol'

// Dates are stored as xsd:dateTime in UTC, so format them in UTC too; the
// calendar date then matches the event's published date.
const dateFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

const dateRange = (event: Event): string | undefined => {
  const { startDate, endDate } = event
  if (!startDate && !endDate) return undefined
  if (!startDate) return formatDate(endDate!)
  if (!endDate || startDate === endDate) return formatDate(startDate)
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

// Event summary card used by the events directory. The title opens the event's
// own page; the catalog only stores the dates, location and owning SDO.
export const EventCard: Component<{ event: Event }> = (props) => (
  <li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-start gap-4">
      <div class="min-w-0 flex-1 space-y-2">
        <Show
          when={props.event.source}
          fallback={
            <h2 class="text-lg font-semibold">{props.event.name}</h2>
          }
        >
          {(url) => (
            <a
              href={url()}
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-lg font-semibold hover:underline"
            >
              {props.event.name}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </Show>
        <div class="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <Show when={dateRange(props.event)}>
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
