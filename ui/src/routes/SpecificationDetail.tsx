import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { ContributorSection } from '../components/ContributorChips'
import { GroupCard } from '../components/GroupCard'
import { SdoBanner } from '../components/SdoBanner'
import { SoftwareCard } from '../components/SoftwareCard'
import { SpecReferenceSection } from '../components/SpecReferences'
import { UseCaseCard } from '../components/UseCaseCard'
import { appActor } from '../store/app'
import { sdoById } from '../lib/sdos'
import { useSdoNav } from '../lib/sdoNav'
import {
  groupByName,
  groupByUri,
  softwareImplementing,
  softwareSlice,
  specificationById,
  specificationsSlice,
  useCasesOf,
  useCasesSlice,
  w3cGroupsSlice,
} from '../store/selectors'

const metaLink =
  'rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800'

const SpecificationDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  onMount(() => {
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
    // Only needed to turn the "Published by" names into links.
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
    // Software declares the specs it implements, so the join lives there.
    if (softwareSlice().status === 'idle')
      appActor.send({ type: 'loadSoftware' })
    // Use cases link back to their specification with ex:useCaseOf.
    if (useCasesSlice().status === 'idle')
      appActor.send({ type: 'loadUseCases' })
  })

  const spec = () => specificationById(params.id)

  const publishedBy = () => {
    const current = spec()
    if (!current) return []
    if (current.groupUris.length > 0) {
      return current.groupUris.map((uri) => groupByUri(uri) ?? { name: uri })
    }
    return current.groups.map((name) => groupByName(name) ?? { name })
  }

  return (
    <section class="space-y-6">
      <Show when={currentSdo()}>
        {(current) => <SdoBanner sdo={current()} />}
      </Show>
      <A
        href={href('/specifications')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All specifications
      </A>
      <Switch>
        <Match when={specificationsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load specifications: {specificationsSlice().error}
          </p>
        </Match>
        <Match when={!spec() && specificationsSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading specification…
          </p>
        </Match>
        <Match when={spec()}>
          {(s) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">{s().name}</h1>
                <Show when={s().shortname}>
                  <p class="font-mono text-sm text-slate-500 dark:text-slate-400">
                    {s().shortname}
                  </p>
                </Show>
                <Show when={s().landingPage || s().editorDraft}>
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Show when={s().landingPage}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          title="Latest published version (TR)"
                          class={metaLink}
                        >
                          TR
                        </a>
                      )}
                    </Show>
                    <Show when={s().editorDraft}>
                      {(url) => (
                        <a
                          href={url()}
                          target="_blank"
                          rel="noreferrer"
                          title="Editor's draft (ED)"
                          class={metaLink}
                        >
                          ED
                        </a>
                      )}
                    </Show>
                  </div>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Published by
                </h2>
                <Show
                  when={publishedBy().length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No group is linked to this specification in the catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={publishedBy()}>
                      {(group) => <GroupCard group={group} />}
                    </For>
                  </ul>
                </Show>
              </div>

              <ContributorSection
                title="Editors"
                people={s().editors}
                empty="No editors recorded in the catalog."
              />

              <ContributorSection
                title="Authors"
                people={s().authors}
                empty="No authors recorded in the catalog."
              />

              <SpecReferenceSection
                id="references"
                title="References"
                references={s().references}
                empty="No W3C references resolved from the latest version."
              />

              <SpecReferenceSection
                id="referenced-by"
                title="Referenced by"
                references={s().citedBy}
                empty="No catalog specification references this one."
              />

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Implemented by
                </h2>
                <Switch>
                  <Match when={softwareSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load software: {softwareSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      softwareImplementing(s()).length === 0 &&
                      softwareSlice().status !== 'ready'
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading software…
                    </p>
                  </Match>
                  <Match when={softwareImplementing(s()).length === 0}>
                    <p class="text-slate-500 dark:text-slate-400">
                      No software in the catalog declares this specification.
                    </p>
                  </Match>
                  <Match when={true}>
                    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <For each={softwareImplementing(s())}>
                        {(sw) => <SoftwareCard software={sw} />}
                      </For>
                    </ul>
                  </Match>
                </Switch>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Use cases
                </h2>
                <Switch>
                  <Match when={useCasesSlice().status === 'error'}>
                    <p class="text-red-500">
                      Failed to load use cases: {useCasesSlice().error}
                    </p>
                  </Match>
                  <Match
                    when={
                      useCasesOf(s()).length === 0 &&
                      useCasesSlice().status !== 'ready'
                    }
                  >
                    <p class="text-slate-500 dark:text-slate-400">
                      Loading use cases…
                    </p>
                  </Match>
                  <Match when={useCasesOf(s()).length === 0}>
                    <p class="text-slate-500 dark:text-slate-400">
                      No use cases are linked to this specification in the
                      catalog.
                    </p>
                  </Match>
                  <Match when={true}>
                    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <For each={useCasesOf(s())}>
                        {(useCase) => <UseCaseCard useCase={useCase} />}
                      </For>
                    </ul>
                  </Match>
                </Switch>
              </div>
            </>
          )}
        </Match>
        <Match when={!spec()}>
          <p class="text-slate-500 dark:text-slate-400">
            Specification not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default SpecificationDetail
