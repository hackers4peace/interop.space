import type { Component } from 'solid-js'
import { Show } from 'solid-js'

const initials = (name: string) =>
  name
    .replace(/\([^)]*\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

// Square logo tile shared by the orgs directory and the organization page.
// The white surface keeps brand marks legible in both themes.
export const OrgLogo: Component<{
  name: string
  logo?: string
  size?: 'sm' | 'md'
}> = (props) => {
  const box = () => (props.size === 'md' ? 'h-24 w-24 p-3' : 'h-16 w-16 p-2')

  return (
    <div
      class={`flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 ${box()}`}
    >
      <Show
        when={props.logo}
        fallback={
          <span class="text-sm font-semibold text-slate-500">
            {initials(props.name)}
          </span>
        }
      >
        {(src) => (
          <img
            src={src()}
            alt={`${props.name} logo`}
            loading="lazy"
            class="h-full w-full object-contain"
          />
        )}
      </Show>
    </div>
  )
}
