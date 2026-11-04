import type { Component } from 'solid-js'
import { Github } from 'lucide-solid'
import { useSdoNav } from '../lib/sdoNav'

const linkClass =
  'font-medium text-indigo-600 hover:underline dark:text-indigo-400'

const AttributionLink: Component<{ href: string; label?: string }> = (props) => (
  <a
    href={props.href}
    target="_blank"
    rel="noreferrer"
    class={linkClass}
  >
    {props.label ?? props.href}
  </a>
)

const InfoPage: Component = () => {
  const { href } = useSdoNav()

  return (
    <section class="space-y-8">
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">About interop.space</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          A shared catalog of the people, groups, specifications, software,
          events and local communities behind interoperable technology.
        </p>
      </div>

      <div class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Source code
        </h2>
        <a
          href="https://github.com/hackers4peace/interop.space"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Github size={16} aria-hidden="true" />
          github.com/hackers4peace/interop.space
        </a>
      </div>

      <div class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Attributions
        </h2>
        <ul class="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
          <li>
            Data from W3C API (
            <AttributionLink href="https://www.w3.org/api/" />)
          </li>
          <li>
            Data from Specref (
            <AttributionLink href="https://www.specref.org/" />)
          </li>
          <li>
            Data from IETF Datatracker (
            <AttributionLink href="https://datatracker.ietf.org/" />)
          </li>
          <li>
            Data from RFC Editor (
            <AttributionLink href="https://www.rfc-editor.org/" />)
          </li>
          <li>
            Data from W3C Technical Reports (
            <AttributionLink href="https://www.w3.org/TR/" />)
          </li>
          <li>
            Data from Atmosphere Community (
            <AttributionLink href="https://atmosphere.community/" />)
          </li>
          <li>
            Data from Mozilla Community Portal (
            <AttributionLink href="https://community.mozilla.org/" />)
          </li>
          <li>
            Data from IndieWeb wiki (
            <AttributionLink href="https://indieweb.org/" />)
          </li>
          <li>
            Event details from the linked event pages:{' '}
            <AttributionLink
              href="https://www.w3.org/news-events/tpac/2026/"
              label="W3C TPAC"
            />
            ,{' '}
            <AttributionLink
              href="https://www.ietf.org/meeting/127/"
              label="IETF 127"
            />
            ,{' '}
            <AttributionLink
              href="https://internetidentityworkshop.com/upcoming-events/"
              label="IIW"
            />
            , <AttributionLink href="https://fosdem.org/2027/" label="FOSDEM" />
            ,{' '}
            <AttributionLink
              href="https://events.ccc.de/congress/2026/infos/startpage.html"
              label="CCC"
            />
            ,{' '}
            <AttributionLink
              href="https://atmosphereconf.org/"
              label="AtmosphereConf"
            />
          </li>
          <li>
            Data from Touchstone LWS conformance reports (
            <AttributionLink href="https://ebremer.com/lws/conformance" />)
          </li>
          <li>
            Grant and project data from NLnet project pages (
            <AttributionLink href="https://nlnet.nl/project/" />)
          </li>
          <li>
            Project metadata from software repositories and package manifests
            (GitHub, package.json, Cargo.toml, composer.json)
          </li>
          <li>
            Software catalog data from Solid Efforts Core (
            <AttributionLink href="https://github.com/elf-pavlik/solid-efforts-core" />)
          </li>
          <li>
            Data from FediDB (
            <AttributionLink href="https://fedidb.com/datasets" />), CC BY 4.0
          </li>
        </ul>
      </div>

      <a
        href={href('/')}
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← Back to interop.space
      </a>
    </section>
  )
}

export default InfoPage
