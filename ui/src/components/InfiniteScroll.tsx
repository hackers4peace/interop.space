import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js'
import { Show } from 'solid-js'

// Sentinel + fallback button for the paginated listings. The observer only
// reports visibility; a reactive effect triggers the next page when the
// current one has finished loading and the sentinel is (still) in view.
export const InfiniteScroll: Component<{
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
}> = (props) => {
  const [visible, setVisible] = createSignal(false)
  let sentinel: HTMLDivElement | undefined

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting))
      },
      { rootMargin: '400px' },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    if (visible() && props.hasMore && !props.loading) props.onLoadMore()
  })

  return (
    <div class="flex flex-col items-center gap-3 py-4">
      <Show when={props.hasMore}>
        <Show
          when={props.loading}
          fallback={
            <button
              type="button"
              onClick={() => props.onLoadMore()}
              class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Load more
            </button>
          }
        >
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Loading more…
          </p>
        </Show>
      </Show>
      <div ref={sentinel} aria-hidden="true" class="h-px w-full" />
    </div>
  )
}
