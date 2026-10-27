import type { Component } from 'solid-js'
import { Search } from 'lucide-solid'

// Shared filter box for the top-level listing pages. The parent owns the
// query signal, so each page can filter its own cards.
export const SearchBar: Component<{
  value: string
  onInput: (value: string) => void
  placeholder: string
  label: string
}> = (props) => (
  <label class="relative block w-full max-w-sm">
    <span class="sr-only">{props.label}</span>
    <Search
      size={16}
      aria-hidden="true"
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
    />
    <input
      type="search"
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
      placeholder={props.placeholder}
      class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
    />
  </label>
)
