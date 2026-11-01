import type { Component } from 'solid-js'
import { For, Match, Show, Switch, createEffect } from 'solid-js'
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
import { detailFor } from '../store/selectors'

const metaLink =
  'rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800'

const sectionTitle =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

const SpecificationDetail: Component = () => {
  const params = useParams<{ id: string }>()
  const { sdo, href } = useSdoNav()
  const currentSdo = () => sdoById(sdo())

  createEffect(() =>
    appActor.send({
      type: 'loadDetail',
      kind: 'specification',
      id: params.id,
      sdo: sdo(),
    }),
  )

  const state = () => detailFor('specification', params.id, sdo())
  const view = () => {
    const data = state()?.data
    return data?.kind === 'specification' ? data : undefined
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
        <Match when={state()?.status === 'error'}>
          <p class="text-red-500">
            Failed to load specification: {state()?.error}
          </p>
        </Match>
        <Match when={!view() && state()?.status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading specification…
          </p>
        </Match>
        <Match when={view()}>
          {(data) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">
                  {data().spec.name}
                </h1>
                <Show when={data().spec.shortname}>
                  <p class="font-mono text-sm text-slate-500 dark:text-slate-400">
                    {data().spec.shortname}
                  </p>
                </Show>
                <Show
                  when={data().spec.landingPage || data().spec.editorDraft}
                >
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Show when={data().spec.landingPage}>
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
                    <Show when={data().spec.editorDraft}>
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
                <h2 class={sectionTitle}>Published by</h2>
                <Show
                  when={data().groups.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No group is linked to this specification in the catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().groups}>
                      {(group) => <GroupCard group={group} />}
                    </For>
                  </ul>
                </Show>
              </div>

              <ContributorSection
                title="Editors"
                people={data().spec.editors}
                empty="No editors recorded in the catalog."
              />

              <ContributorSection
                title="Authors"
                people={data().spec.authors}
                empty="No authors recorded in the catalog."
              />

              <SpecReferenceSection
                id="references"
                title="References"
                references={data().spec.references}
                empty="No W3C references resolved from the latest version."
              />

              <SpecReferenceSection
                id="referenced-by"
                title="Referenced by"
                references={data().spec.citedBy}
                empty="No catalog specification references this one."
              />

              <div class="space-y-3">
                <h2 class={sectionTitle}>Implemented by</h2>
                <Show
                  when={data().software.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No software in the catalog declares this specification.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().software}>
                      {(sw) => <SoftwareCard software={sw} />}
                    </For>
                  </ul>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class={sectionTitle}>Use cases</h2>
                <Show
                  when={data().useCases.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No use cases are linked to this specification in the
                      catalog.
                    </p>
                  }
                >
                  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <For each={data().useCases}>
                      {(useCase) => <UseCaseCard useCase={useCase} />}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!view()}>
          <p class="text-slate-500 dark:text-slate-400">
            Specification not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default SpecificationDetail
