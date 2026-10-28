import type { ParentComponent } from 'solid-js'
import type { RouteDefinition } from '@solidjs/router'
import { A } from '@solidjs/router'
import { Github } from 'lucide-solid'
import Home from './routes/Home'
import People from './routes/People'
import PersonDetail from './routes/PersonDetail'
import Projects from './routes/Projects'
import ProjectDetail from './routes/ProjectDetail'
import Software from './routes/Software'
import SoftwareDetail from './routes/SoftwareDetail'
import Specifications from './routes/Specifications'
import SpecificationDetail from './routes/SpecificationDetail'
import UseCases from './routes/UseCases'
import UseCaseDetail from './routes/UseCaseDetail'
import Orgs from './routes/Orgs'
import OrgDetail from './routes/OrgDetail'
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
  { path: '/software/:id', component: SoftwareDetail },
  { path: '/specifications', component: Specifications },
  { path: '/specifications/:id', component: SpecificationDetail },
  { path: '/use-cases', component: UseCases },
  { path: '/use-cases/:id', component: UseCaseDetail },
  { path: '/orgs', component: Orgs },
  { path: '/orgs/:id', component: OrgDetail },
  { path: '/groups', component: Groups },
  { path: '/groups/:id', component: GroupDetail },
]

const navLink =
  'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'

// Sections that are planned but have no page yet: rendered, but not links.
const inactiveNavLink =
  'cursor-default select-none rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 dark:text-slate-600'

const App: ParentComponent = (props) => {
  const { href } = useSdoNav()
  return (
    <div class="min-h-screen">
      <header class="border-b border-slate-200 dark:border-slate-800">
        <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-4">
          <A href={href('/')} class="mr-auto text-lg font-semibold tracking-tight">
            interop<span class="text-indigo-500">.space</span>
          </A>
          <A href={href('/groups')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Groups
          </A>
          <A href={href('/specifications')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Specs
          </A>
          <A href={href('/software')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Software
          </A>
          <A href={href('/people')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            People
          </A>
          <A href={href('/use-cases')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Use Cases
          </A>
          <span class={inactiveNavLink} aria-disabled="true" title="Not available yet">
            Events
          </span>
          <A href={href('/orgs')} class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Orgs
          </A>
          <span class={inactiveNavLink} aria-disabled="true" title="Not available yet">
            Publications
          </span>
          <ThemeToggle />
          <a
            href="https://github.com/hackers4peace/interop.space"
            target="_blank"
            rel="noreferrer"
            aria-label="interop.space on GitHub"
            title="interop.space on GitHub"
            class="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Github size={18} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main class="mx-auto max-w-6xl px-6 py-10">{props.children}</main>
    </div>
  )
}

export default App
