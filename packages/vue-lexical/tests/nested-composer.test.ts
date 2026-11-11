import type { EditorConfig, LexicalEditor, LexicalNode } from 'lexical'
import type { VueDecorator } from '../src'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, DecoratorNode } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { ContentEditable, LexicalComposer, LexicalNestedComposer, RichTextPlugin, useLexicalComposer, useLexicalRegister, vueDecorator } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

const Chip = defineComponent({
  props: {
    nodeKey: { type: String, required: true },
  },
  setup() {
    const owner = useLexicalComposer()
    return () => h('b', { 'class': 'chip', 'data-namespace': owner._config.namespace }, '籤')
  },
})

class ChipNode extends DecoratorNode<VueDecorator> {
  static getType() {
    return 'chip'
  }

  static clone(node: ChipNode) {
    return new ChipNode(node.__key)
  }

  createDOM(_config: EditorConfig) {
    const element = document.createElement('span')
    element.className = 'chip-host'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  decorate() {
    return vueDecorator(Chip, this.__key)
  }
}

function nestedEditor(fill = true) {
  const editor = createEditor({
    namespace: 'nested',
    nodes: [ChipNode],
    onError: (error) => { throw error },
  })
  if (fill) {
    editor.update(() => {
      $getRoot().append($createParagraphNode().append($createTextNode('內'), new ChipNode() as LexicalNode))
    }, { discrete: true })
  }
  return editor
}

function mountBoth(nested: LexicalEditor, slot: () => unknown = () => null, outerConfig: Record<string, unknown> = {}) {
  let outer!: LexicalEditor
  const visible = shallowRef(true)
  const GrabOuter = defineComponent({
    setup() {
      outer = useLexicalComposer()
      return () => null
    },
  })
  const wrapper = mount(() => h(LexicalComposer, {
    initialConfig: { namespace: 'outer', ...outerConfig },
  }, () => [
    h(GrabOuter),
    visible.value
      ? h('div', { class: 'nested' }, h(LexicalNestedComposer, { editor: nested }, () => [
          h(ContentEditable),
          h(RichTextPlugin),
          slot(),
        ]))
      : null,
  ]), { attachTo: document.body })
  return {
    wrapper,
    outer: () => outer,
    visible,
  }
}

describe('lexicalNestedComposer', () => {
  it('gives children its editor, and leaves the outer one to the rest', async () => {
    const nested = nestedEditor()
    let inner: LexicalEditor | undefined
    const Probe = defineComponent({
      setup() {
        inner = useLexicalComposer()
        return () => null
      },
    })
    const { outer } = mountBoth(nested, () => h(Probe))
    await flushPromises()
    expect(inner).toBe(nested)
    expect(outer()).not.toBe(nested)
    expect(outer()._config.namespace).toBe('outer')
    expect(nested._parentEditor).toBe(outer())
  })

  it('mounts the editor\'s decorators on its own nodes', async () => {
    const nested = nestedEditor()
    mountBoth(nested)
    await flushPromises()
    const host = document.querySelector('.nested .chip-host')!
    expect(host.querySelector('.chip')!.getAttribute('data-namespace')).toBe('nested')
  })

  it('renders its content into the nested element', async () => {
    mountBoth(nestedEditor())
    await flushPromises()
    expect(document.querySelector('.nested [contenteditable]')!.textContent).toContain('內')
  })

  it('follows the outer editor being read-only', async () => {
    const nested = nestedEditor()
    const { outer } = mountBoth(nested)
    await flushPromises()
    outer().setEditable(false)
    expect(nested.isEditable()).toBe(false)
    outer().setEditable(true)
    expect(nested.isEditable()).toBe(true)
  })

  it('starts out read-only with a read-only outer editor', async () => {
    const nested = nestedEditor()
    mountBoth(nested, () => null, { editable: false })
    await flushPromises()
    expect(nested.isEditable()).toBe(false)
  })

  it('can be unmounted and mounted again with the same editor', async () => {
    const nested = nestedEditor()
    const cleanup = vi.fn()
    const register = vi.fn(() => cleanup)
    const Plugin = defineComponent({
      setup() {
        useLexicalRegister(register)
        return () => null
      },
    })
    const { visible, outer } = mountBoth(nested, () => h(Plugin))
    await flushPromises()
    expect(register).toHaveBeenCalledTimes(1)

    visible.value = false
    await flushPromises()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(nested.getRootElement()).toBeNull()

    outer().setEditable(false)
    expect(nested.isEditable()).toBe(true)
    outer().setEditable(true)

    visible.value = true
    await flushPromises()
    expect(register).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.nested [contenteditable]')!.textContent).toContain('內')
    expect(document.querySelectorAll('.nested .chip')).toHaveLength(1)
    expect(nested.getEditorState().read(() => $getRoot().getTextContent())).toContain('內')
  })
})
