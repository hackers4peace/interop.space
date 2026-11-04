import type { Component } from 'solid-js'
import { Github } from 'lucide-solid'
import { useSdoNav } from '../lib/sdoNav'

const InfoPage: Component = () => {
  const { href } = useSdoNav()

  return (
    <section class="space-y-8">
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">About interop.space</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          A shared catalog of the people, groups, specifications, software,
          events and local communities behind interoperable technology.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Source code
        </h2>
        <a
          href="https://github.com/hackers4peace/interop.space"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Github size={16} aria-hidden="true" />
          github.com/hackers4peace/interop.space
        </a>
      </div>

      <div class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Attributions
        </h2>
        <ul class="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
          <li>
            Data from FediDB (
            <a
              href="https://fedidb.com/datasets"
              target="_blank"
              rel="noreferrer"
              class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              https://fedidb.com/datasets
            </a>
            ), CC BY 4.0
          </li>
        </ul>
      </div>

      <a
        href={href('/')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← Back to interop.space
      </a>
    </section>
  )
}

export default InfoPage
