import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { sdoById } from '../lib/sdos'
import { OrgLogo } from './OrgLogo'

// Standards-body logo for spec, group and use-case cards. The tile matches the
// person avatar size; unknown or missing SDOs simply render nothing.
export const SdoLogo: Component<{ sdo?: string }> = (props) => {
  const sdo = () => sdoById(props.sdo)

  return (
    <Show when={sdo()}>
      {(entry) => <OrgLogo name={entry().name} logo={entry().logo} />}
    </Show>
  )
}
