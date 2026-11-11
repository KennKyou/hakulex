import type { LexicalEditor } from 'lexical'
import type { Component } from 'vue'
import type { InitialConfig } from '../src'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { LexicalComposer, useLexicalComposer } from '../src'

/** Mounts `children` inside a composer and hands back the editor. */
export function mountEditor(
  children: () => ReturnType<typeof h>[],
  config: Partial<InitialConfig> = {},
  provide: Record<string, unknown> = {},
) {
  let editor!: LexicalEditor
  const Grab: Component = defineComponent({
    setup() {
      editor = useLexicalComposer()
      return () => null
    },
  })
  const wrapper = mount(
    () => h(LexicalComposer, {
      initialConfig: { namespace: 'test', ...config },
    }, () => [
      h(Grab),
      ...children(),
    ]),
    {
      attachTo: document.body,
      global: { provide },
    },
  )
  return { wrapper, editor }
}
