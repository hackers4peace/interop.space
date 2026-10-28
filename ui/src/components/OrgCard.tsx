import type { Component } from 'solid-js'
import { A } from '@solidjs/router'
import { OrgLogo } from './OrgLogo'
import { useSdoNav } from '../lib/sdoNav'
import type { Org } from '../worker/protocol'

// Organization summary card used by the orgs directory. Details live on the
// organization's own page.
export const OrgCard: Component<{ org: Org }> = (props) => {
  const { href } = useSdoNav()

  return (
    <li>
      <A
        href={href(`/orgs/${props.org.id}`)}
        class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <OrgLogo name={props.org.name} logo={props.org.logo} />
        <span class="min-w-0 text-lg font-semibold">{props.org.name}</span>
      </A>
    </li>
  )
}
