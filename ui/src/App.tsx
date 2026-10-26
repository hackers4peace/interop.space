import type { ParentComponent } from 'solid-js'
import type { RouteDefinition } from '@solidjs/router'
import { A } from '@solidjs/router'
import Home from './routes/Home'
import People from './routes/People'
import PersonDetail from './routes/PersonDetail'
import Projects from './routes/Projects'
import ProjectDetail from './routes/ProjectDetail'
import Software from './routes/Software'
import Specifications from './routes/Specifications'
import SpecificationDetail from './routes/SpecificationDetail'
import Groups from './routes/Groups'
import GroupDetail from './routes/GroupDetail'
import { ThemeToggle } from './components/ThemeToggle'
import { useSdoNav } from './lib/sdoNav'

export const routes: RouteDefinition[] = [
  { path: '/', component: Home },
  { path: '/people', component: People },
  { path: '/people/:id', component: PersonDetail },
  { path: '/projects', component: Projects },
  { path: '/projects/:id', component: ProjectDetail },
  { path: '/software', component: Software },
  { path: '/specifications', component: Specifications },
  { path: '/specifications/:id', component: SpecificationDetail },
  { path: '/groups', component: Groups },
  { path: '/groups/:id', component: GroupDetail },
]

const navLink =
  'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'

const App: ParentComponent = (props) => {
  const { href } = useSdoNav()
  return (
    <div class="min-h-screen">
      <header class="border-b border-slate-200 dark:border-slate-800">
        <nav class="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-6 py-4">
          <A href={href('/')} class="mr-auto text-lg font-semibold tracking-tight">
            interop<span class="text-indigo-500">.space</span>
          </A>
          <A href={href('/')} end class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Home
          </A>
          <A href={href('/groups')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Groups
          </A>
          <A href={href('/specifications')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Specifications
          </A>
          <A href={href('/software')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Software
          </A>
          <A href={href('/people')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            People
          </A>
          <ThemeToggle />
        </nav>
      </header>
      <main class="mx-auto max-w-4xl px-6 py-10">{props.children}</main>
    </div>
  )
}

export default App
