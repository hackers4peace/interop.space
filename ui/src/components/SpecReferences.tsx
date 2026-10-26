import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { CircleAlert, Info } from 'lucide-solid'
import { useSdoNav } from '../lib/sdoNav'
import type { SpecReference } from '../worker/protocol'

const normativeIcon = 'text-amber-600 dark:text-amber-400'
const informativeIcon = 'text-sky-600 dark:text-sky-400'

const NatureIcons: Component<{ reference: SpecReference }> = (props) => (
  <span class="mt-0.5 flex shrink-0 items-center gap-1">
    <Show when={props.reference.normative}>
      <CircleAlert
        size={16}
        class={normativeIcon}
        aria-label="Normative reference"
        role="img"
      />
    </Show>
    <Show when={props.reference.informative}>
      <Info
        size={16}
        class={informativeIcon}
        aria-label="Informative reference"
        role="img"
      />
    </Show>
  </span>
)

// A spec's outgoing references or incoming citations, with the nature marked by
// an exclamation-point icon (normative) or an info icon (informative).
export const SpecReferenceSection: Component<{
  id?: string
  title: string
  references: SpecReference[]
  empty: string
}> = (props) => {
  const { href } = useSdoNav()
  const normative = () =>
    props.references.filter((reference) => reference.normative).length
  const informative = () =>
    props.references.filter((reference) => reference.informative).length

  return (
    <div id={props.id} class="scroll-mt-24 space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {props.title}
        </h2>
        <p class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span class="flex items-center gap-1">
            <CircleAlert size={14} class={normativeIcon} aria-hidden="true" />
            {normative()} normative
          </span>
          <span class="flex items-center gap-1">
            <Info size={14} class={informativeIcon} aria-hidden="true" />
            {informative()} informative
          </span>
        </p>
      </div>

      <Show
        when={props.references.length > 0}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">{props.empty}</p>
        }
      >
        <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <For each={props.references}>
            {(reference) => (
              <li class="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <NatureIcons reference={reference} />
                <div class="min-w-0">
                  <A
                    href={href(`/specifications/${reference.id}`)}
                    class="break-words font-medium hover:underline"
                  >
                    {reference.name}
                  </A>
                  <Show when={reference.shortname}>
                    {(shortname) => (
                      <p class="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {shortname()}
                      </p>
                    )}
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
