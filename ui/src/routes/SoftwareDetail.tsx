import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ArrowRight, Pin } from 'lucide-solid'
import { ContributorSection } from '../components/ContributorChips'
import { appActor } from '../store/app'
import { useSdoNav } from '../lib/sdoNav'
import {
  softwareById,
  softwareSlice,
  specificationById,
  specificationsSlice,
} from '../store/selectors'
import type {
  SoftwareRef,
  SoftwareSpec,
  SpecReference,
  Specification,
} from '../worker/protocol'

const metaLink =
  'rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800'

const tag =
  'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'

const sectionTitle =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

// Same pin/arrow affordances as the groups page: the pin selects a
// specification for the dependency check, the arrow opens its own page.
const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition'

const idleIcon =
  'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200'

const activeIcon =
  'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'

const SoftwareDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { href } = useSdoNav()

  // One pinned specification at a time; its normative references are what the
  // dependency list is matched against.
  const [pinned, setPinned] = createSignal<string>()

  onMount(() => {
    if (softwareSlice().status === 'idle')
      appActor.send({ type: 'loadSoftware' })
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
  })

  const software = () => softwareById(params.id)

  const pinnedSpec = (): SoftwareSpec | undefined => {
    const uri = pinned()
    if (!uri) return undefined
    return software()?.implements.find((spec) => spec.uri === uri)
  }

  const pinnedSpecification = (): Specification | undefined => {
    const spec = pinnedSpec()
    return spec ? specificationById(spec.id) : undefined
  }

  // Normative references of the pinned specification that a dependency
  // declares implementing (doap:implements on the dependency).
  const referenceMatches = (dep: SoftwareRef): SpecReference[] => {
    const spec = pinnedSpecification()
    if (!spec) return []
    const dependency = softwareById(dep.id)
    if (!dependency) return []
    return spec.references.filter(
      (ref) =>
        ref.normative &&
        dependency.implements.some((target) => target.uri === ref.uri),
    )
  }

  const togglePin = (spec: SoftwareSpec) =>
    setPinned((current) => (current === spec.uri ? undefined : spec.uri))

  // While a specification is pinned, dependencies that implement one of its
  // normative references come first; the rest keep the catalog (name) order.
  // Unpinning restores that order exactly.
  const orderedDependencies = (): SoftwareRef[] => {
    const dependencies = software()?.dependencies ?? []
    if (!pinnedSpec()) return dependencies
    const matched = dependencies.filter(
      (dep) => referenceMatches(dep).length > 0,
    )
    const unmatched = dependencies.filter(
      (dep) => referenceMatches(dep).length === 0,
    )
    return [...matched, ...unmatched]
  }

  return (
    <section class="space-y-6">
      <A
        href={href('/software')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All software
      </A>
      <Switch>
        <Match when={softwareSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load software: {softwareSlice().error}
          </p>
        </Match>
        <Match when={!software() && softwareSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">Loading software…</p>
        </Match>
        <Match when={software()}>
          {(sw) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">{sw().name}</h1>
                <Show when={sw().description}>
                  <p class="text-slate-600 dark:text-slate-400">
                    {sw().description}
                  </p>
                </Show>
                <Show when={sw().homepage || sw().repository || sw().documentation}>
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Show when={sw().homepage}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          title="Project homepage"
                          class={metaLink}
                        >
                          Homepage
                        </a>
                      )}
                    </Show>
                    <Show when={sw().repository}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          title="Source repository"
                          class={metaLink}
                        >
                          Repository
                        </a>
                      )}
                    </Show>
                    <Show when={sw().documentation}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          title="Documentation"
                          class={metaLink}
                        >
                          Docs
                        </a>
                      )}
                    </Show>
                  </div>
                </Show>
                <Show when={sw().license}>
                  <p class="text-sm text-slate-500 dark:text-slate-400">
                    License:{' '}
                    <span class="font-mono text-slate-600 dark:text-slate-300">
                      {sw().license}
                    </span>
                  </p>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Programming languages</h2>
                <Show
                  when={sw().programmingLanguages.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No programming language recorded.
                    </p>
                  }
                >
                  <ul class="flex flex-wrap gap-2">
                    <For each={sw().programmingLanguages}>
                      {(language) => <li class={tag}>{language}</li>}
                    </For>
                  </ul>
                </Show>
              </div>

              <ContributorSection
                title="Maintainers"
                people={sw().maintainers}
                empty="No maintainer recorded."
              />

              <div class="space-y-3">
                <h2 class={sectionTitle}>Implements</h2>
                <Show
                  when={sw().implements.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No implemented specification recorded.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={sw().implements}>
                      {(spec) => {
                        const isPinned = () => pinned() === spec.uri
                        return (
                          <li
                            class={`flex items-center gap-2 rounded-xl border bg-white p-4 shadow-sm transition dark:bg-slate-900 ${
                              isPinned()
                                ? 'border-indigo-500 ring-1 ring-indigo-500'
                                : 'border-slate-200 hover:shadow-md dark:border-slate-800'
                            }`}
                          >
                            <button
                              type="button"
                              aria-pressed={isPinned()}
                              aria-label={
                                isPinned()
                                  ? `Unpin ${spec.name}`
                                  : `Pin ${spec.name}`
                              }
                              title={
                                isPinned()
                                  ? 'Unpin specification'
                                  : 'Pin specification'
                              }
                              onClick={() => togglePin(spec)}
                              class={`${iconButton} ${isPinned() ? activeIcon : idleIcon}`}
                            >
                              <Pin
                                size={18}
                                fill={isPinned() ? 'currentColor' : 'none'}
                              />
                            </button>
                            <div class="min-w-0 flex-1 space-y-1">
                              <p class="truncate font-semibold">
                                {spec.name}
                              </p>
                              <Show when={spec.shortname}>
                                <p class="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {spec.shortname}
                                </p>
                              </Show>
                            </div>
                            <A
                              href={href(`/specifications/${spec.id}`)}
                              aria-label={`Open ${spec.name}`}
                              title={`Open ${spec.name}`}
                              class={`${iconButton} ${idleIcon}`}
                            >
                              <ArrowRight size={18} />
                            </A>
                          </li>
                        )
                      }}
                    </For>
                  </ul>
                </Show>
              </div>

              <Show when={sw().dependencies.length > 0}>
                <div class="space-y-3">
                  <h2 class={sectionTitle}>Depends on</h2>
                  <Show
                    when={pinnedSpec()}
                    fallback={
                      <p class="text-sm text-slate-500 dark:text-slate-400">
                        Pin a specification above to see which of its normative
                        references each dependency implements.
                      </p>
                    }
                  >
                    <Show
                      when={pinnedSpecification()}
                      fallback={
                        <p class="text-sm text-slate-500 dark:text-slate-400">
                          No normative references of {pinnedSpec()?.name} are in
                          the catalog.
                        </p>
                      }
                    >
                      {(spec) => (
                        <p class="text-sm text-slate-500 dark:text-slate-400">
                          Normative references of {spec().name} that each
                          dependency implements.
                        </p>
                      )}
                    </Show>
                  </Show>
                  <ul class="space-y-2">
                    <For each={orderedDependencies()}>
                      {(dep) => (
                        /* Both cards share min-h-14 (3.5rem) and the same
                           vertical padding, so a row is the same height pinned
                           or unpinned: py-2 (1rem) + name leading-5 (1.25rem)
                           + shortname leading-4 (1rem) = 3.25rem, centred in
                           the 3.5rem box. */
                        <li class="flex flex-wrap items-stretch gap-2">
                          <A
                            href={href(`/software/${dep.id}`)}
                            class={`flex min-h-14 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm leading-5 font-semibold shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${pinnedSpec() && referenceMatches(dep).length === 0 ? 'text-slate-400 dark:text-slate-500' : ''}`}
                          >
                            {dep.name}
                          </A>
                          <For each={referenceMatches(dep)}>
                            {(ref) => (
                              <A
                                href={href(`/specifications/${ref.id}`)}
                                class="flex min-h-14 flex-col justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                              >
                                <span class="text-sm leading-5 font-semibold">
                                  {ref.name}
                                </span>
                                <Show when={ref.shortname}>
                                  <span class="font-mono text-xs leading-4 text-slate-500 dark:text-slate-400">
                                    {ref.shortname}
                                  </span>
                                </Show>
                              </A>
                            )}
                          </For>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={sw().dependents.length > 0}>
                <div class="space-y-3">
                  <h2 class={sectionTitle}>Dependency of</h2>
                  <ul class="space-y-2">
                    <For each={sw().dependents}>
                      {(dependent) => (
                        <li>
                          <A
                            href={href(`/software/${dependent.id}`)}
                            class="text-sm font-medium hover:underline"
                          >
                            {dependent.name}
                          </A>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>
            </>
          )}
        </Match>
        <Match when={!software()}>
          <p class="text-slate-500 dark:text-slate-400">Software not found.</p>
        </Match>
      </Switch>
    </section>
  )
}

export default SoftwareDetail
