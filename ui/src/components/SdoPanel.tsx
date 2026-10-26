import type { Component } from 'solid-js'
import { For, Match, Switch, createResource } from 'solid-js'
import type { Sdo, SdoCard, SdoChip, SdoSection } from '../lib/sdos'

const chip =
  'rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'

const Chips: Component<{ items: SdoChip[] }> = (props) => (
  <ul class="flex flex-wrap gap-2">
    <For each={props.items}>{(item) => <li class={chip}>{item.label}</li>}</For>
  </ul>
)

const Cards: Component<{ items: SdoCard[] }> = (props) => (
  <ul class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <For each={props.items}>
      {(item) => (
        <li>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            class="flex h-full flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
          >
            <span class="flex h-12 w-full items-center justify-center rounded-md bg-slate-50 p-2 dark:bg-white">
              <img
                src={item.logo}
                alt={`${item.name} logo`}
                loading="lazy"
                class="max-h-8 max-w-full object-contain"
              />
            </span>
            <span class="text-sm font-semibold leading-snug">{item.name}</span>
          </a>
        </li>
      )}
    </For>
  </ul>
)

type EcosystemsResponse = {
  _links?: {
    ecosystems?: { href: string; title: string }[]
  }
}

const fetchEcosystems = async (source: string): Promise<string[]> => {
  const response = await fetch(source, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`W3C API returned ${response.status}`)
  const data = (await response.json()) as EcosystemsResponse
  return (data._links?.ecosystems ?? []).map((ecosystem) => ecosystem.title)
}

const Ecosystems: Component<{ source: string }> = (props) => {
  const [ecosystems] = createResource(() => props.source, fetchEcosystems)
  return (
    <Switch>
      <Match when={ecosystems.error}>
        <p class="text-sm text-red-500">
          Could not load ecosystems from api.w3.org.
        </p>
      </Match>
      <Match when={ecosystems.loading}>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Loading ecosystems…
        </p>
      </Match>
      <Match when={ecosystems()}>
        {(labels) => <Chips items={labels().map((label) => ({ label }))} />}
      </Match>
    </Switch>
  )
}

const Section: Component<{ section: SdoSection }> = (props) => {
  if (props.section.kind === 'cards')
    return <Cards items={props.section.items} />
  if (props.section.kind === 'ecosystems')
    return <Ecosystems source={props.section.source} />
  return <Chips items={props.section.items} />
}

// Compact standards-body summary shown on the groups listing when the page is
// opened with an `sdo` query parameter.
export const SdoPanel: Component<{ sdo: Sdo }> = (props) => (
  <section class="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-center gap-4">
      <div class="flex h-16 w-44 shrink-0 items-center justify-center rounded-lg bg-slate-50 px-2 py-2 dark:bg-white">
        <img
          src={props.sdo.logo}
          alt={`${props.sdo.name} logo`}
          class="h-14 w-full object-contain"
        />
      </div>
      <h2 class="text-xl font-semibold">{props.sdo.name}</h2>
    </div>
    <For each={props.sdo.sections}>
      {(section) => (
        <div class="space-y-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {section.title}
          </h3>
          <Section section={section} />
        </div>
      )}
    </For>
  </section>
)
