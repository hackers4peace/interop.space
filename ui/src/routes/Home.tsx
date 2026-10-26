import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { A } from '@solidjs/router'
import { sdos } from '../lib/sdos'

const Home: Component = () => {
  return (
    <section class="space-y-8">
      <div class="space-y-3">
        <h1 class="text-4xl font-bold tracking-tight">Welcome to interop.space</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          A shared catalog of the people, groups, specifications, and software
          behind interoperable technology.
        </p>
      </div>

      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <For each={sdos}>
          {(organization) => (
            <li>
              <A
                href={`/groups?sdo=${organization.id}`}
                class="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div class="flex h-28 items-center justify-center bg-slate-50 px-6 py-5 dark:bg-white">
                  <img
                    src={organization.logo}
                    alt={`${organization.name} logo`}
                    loading="lazy"
                    class="h-16 w-full object-contain"
                  />
                </div>
                <p class="p-5 text-center text-lg font-semibold">
                  {organization.name}
                </p>
              </A>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

export default Home
