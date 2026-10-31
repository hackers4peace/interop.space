import { createActorStore } from '../lib/actor'
import { initialAppState, type AppState, type Command } from '../worker/protocol'
import StateWorker from '../worker/state.worker?worker'

const worker = new StateWorker()

// Module-level singleton (mirrors the theme signal in lib/theme.ts). Listing
// pages request their first page on mount; detail pages request one composed
// view. Nothing is prefetched.
const [appState, appActor] = createActorStore<AppState, Command>(
  worker,
  initialAppState(),
)

export { appState, appActor }
