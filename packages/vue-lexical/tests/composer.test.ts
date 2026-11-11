import { mount } from '@vue/test-utils'
import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { LexicalEditorKey, useLexicalComposer } from '../src'

describe('useLexicalComposer', () => {
  it('returns the provided editor', () => {
    const editor = createEditor()
    let received: unknown
    const Child = defineComponent({
      setup() {
        received = useLexicalComposer()
        return () => h('div')
      },
    })
    mount(Child, {
      global: {
        provide: { [LexicalEditorKey as symbol]: editor },
      },
    })
    expect(received).toBe(editor)
  })

  it('throws outside a composer', () => {
    const Child = defineComponent({
      setup() {
        useLexicalComposer()
        return () => h('div')
      },
    })
    expect(() => mount(Child)).toThrow(/LexicalComposer/)
  })
})
