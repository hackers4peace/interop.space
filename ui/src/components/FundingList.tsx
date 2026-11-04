import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { ArrowUpRight } from 'lucide-solid'
import type { Funding } from '../worker/protocol'

const tag =
  'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'

const period = (funding: Funding) => {
  if (funding.startDate && funding.endDate) {
    return `${funding.startDate} — ${funding.endDate}`
  }
  return funding.startDate ?? funding.endDate
}

// ex:Funding ids are the funder's own project pages, so the catalog has no
// detail route for them: every row links straight out.
export const FundingList: Component<{ fundings: Funding[] }> = (props) => (
  <ul class="space-y-2">
    <For each={props.fundings}>
      {(funding) => (
        <li>
          <a
            href={funding.uri}
            target="_blank"
            rel="noreferrer"
            class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <span class="font-semibold">{funding.name}</span>
            <Show when={funding.fund}>
              {(fund) => <span class={tag}>{fund()}</span>}
            </Show>
            <Show when={period(funding)}>
              {(value) => (
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {value()}
                </span>
              )}
            </Show>
            <ArrowUpRight
              size={14}
              aria-hidden="true"
              class="ml-auto shrink-0 text-slate-400"
            />
          </a>
        </li>
      )}
    </For>
  </ul>
)
