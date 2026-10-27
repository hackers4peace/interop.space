import { createActorStore } from '../lib/actor'
import type { AppState, Command } from '../worker/protocol'
import StateWorker from '../worker/state.worker?worker'

const worker = new StateWorker()

// Module-level singleton (mirrors the theme signal in lib/theme.ts). Pages
// request slices on mount via `appActor.send(...)`.
const [appState, appActor] = createActorStore<AppState, Command>(worker, {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
  software: { status: 'idle', data: [] },
  useCases: { status: 'idle', data: [] },
  specifications: { status: 'idle', data: [] },
  w3cGroups: {
    status: 'idle',
    data: { groups: [], selected: [], common: [] },
  },
})

export { appState, appActor }
