import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { ContributorChips } from './ContributorChips'
import { useSdoNav } from '../lib/sdoNav'
import type { Specification } from '../worker/protocol'

type SpecificationCardProps = {
  spec: Specification
  // The Specifications page lists the delivering groups; on a group's own page
  // they would only repeat the heading.
  showGroups?: boolean
}

const metaLink =
  'text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400'

// Shared spec card: the title opens the spec page, the TR/ED links point at the
// published version and the editor's draft.
export const SpecificationCard: Component<SpecificationCardProps> = (props) => {
  const { href } = useSdoNav()

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="space-y-1">
        <A
          href={href(`/specifications/${props.spec.id}`)}
          class="text-lg font-semibold hover:underline"
        >
          {props.spec.name}
        </A>
        <Show when={props.spec.shortname}>
          <p class="font-mono text-xs text-slate-500 dark:text-slate-400">
            {props.spec.shortname}
          </p>
        </Show>
      </div>

      <Show when={props.spec.landingPage || props.spec.editorDraft}>
        <div class="flex flex-wrap items-center gap-4">
          <Show when={props.spec.landingPage}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                title="Latest published version (TR)"
                aria-label={`${props.spec.name} — published version`}
                class={metaLink}
              >
                TR
              </a>
            )}
          </Show>
          <Show when={props.spec.editorDraft}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                title="Editor's draft (ED)"
                aria-label={`${props.spec.name} — editor's draft`}
                class={metaLink}
              >
                ED
              </a>
            )}
          </Show>
        </div>
      </Show>

      <Show when={props.spec.editors.length > 0}>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Editors
          </p>
          <ContributorChips people={props.spec.editors} />
        </div>
      </Show>

      <Show when={props.spec.authors.length > 0}>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Authors
          </p>
          <ContributorChips people={props.spec.authors} />
        </div>
      </Show>

      <Show when={props.showGroups && props.spec.groups.length > 0}>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Delivered by
          </p>
          <ul class="flex flex-wrap gap-2">
            <For each={props.spec.groups}>
              {(group) => (
                <li class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {group}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  )
}
