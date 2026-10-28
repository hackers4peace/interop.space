import type { Component } from 'solid-js'
import type { Sdo } from '../lib/sdos'

// Compact standards-body banner for detail pages: logo and name only.
export const SdoBanner: Component<{ sdo: Sdo }> = (props) => (
  <section class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex h-12 w-36 shrink-0 items-center justify-center rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white">
      <img
        src={props.sdo.logo}
        alt={`${props.sdo.name} logo`}
        class="h-9 w-full object-contain"
      />
    </div>
    <h2 class="text-lg font-semibold">{props.sdo.name}</h2>
  </section>
)
