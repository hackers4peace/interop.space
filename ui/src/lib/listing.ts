import { createSignal, onCleanup, onMount } from 'solid-js'
import { appActor } from '../store/app'
import type { ListingKind } from '../worker/protocol'

const SEARCH_DEBOUNCE_MS = 250

// Owns the search box value for a paginated listing. The first page loads on
// mount; typing resets the listing after a short debounce. The worker owns the
// cursor, so this hook only ever sends the query or asks for the next page.
export const createListingSearch = (kind: ListingKind) => {
  const [query, setQuery] = createSignal('')
  let timer: ReturnType<typeof setTimeout> | undefined

  const send = (value: string) =>
    appActor.send({ type: 'search', kind, query: value })

  const onInput = (value: string) => {
    setQuery(value)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => send(value), SEARCH_DEBOUNCE_MS)
  }

  onMount(() => send(''))
  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return { query, onInput }
}
