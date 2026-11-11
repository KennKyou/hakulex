import type { LexicalEditor, NodeKey } from 'lexical'
import type { VueDecorator } from '../src'
import { flushPromises } from '@vue/test-utils'
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  DecoratorNode,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, onUnmounted } from 'vue'
import { ContentEditable, RichTextPlugin, useLexicalNodeSelection, vueDecorator } from '../src'
import { mountEditor } from './helpers'

const unmounted = vi.fn()

const Badge = defineComponent({
  props: {
    nodeKey: { type: String, required: true },
    label: { type: String, required: true },
  },
  setup(props) {
    const theme = inject('theme', 'none')
    const { isSelected, setSelected } = useLexicalNodeSelection(props.nodeKey)
    onUnmounted(() => unmounted(props.label))
    return () => h('span', {
      'class': 'badge',
      'data-selected': isSelected.value,
      'onClick': () => setSelected(true),
    }, `${props.label}:${theme}`)
  },
})

const Broken = defineComponent({
  setup() {
    throw new Error('boom')
  },
})

class BadgeNode extends DecoratorNode<VueDecorator> {
  __label: string
  __broken: boolean

  static getType() {
    return 'badge'
  }

  static clone(node: BadgeNode) {
    return new BadgeNode(node.__label, node.__broken, node.__key)
  }

  constructor(label = '', broken = false, key?: NodeKey) {
    super(key)
    this.__label = label
    this.__broken = broken
  }

  setLabel(label: string) {
    this.getWritable().__label = label
  }

  createDOM() {
    return document.createElement('div')
  }

  updateDOM() {
    return false
  }

  decorate(): VueDecorator {
    return vueDecorator(this.__broken ? Broken : Badge, this.__key, { label: this.__label })
  }
}

/** Replaces the document with one badge per spec (label, or [label, broken]). */
function insertBadges(editor: LexicalEditor, ...specs: (string | [string, boolean])[]) {
  const keys: string[] = []
  editor.update(() => {
    const root = $getRoot().clear()
    for (const spec of specs) {
      const [label, broken] = typeof spec === 'string'
        ? [spec, false]
        : spec
      const badge = new BadgeNode(label, broken)
      root.append(badge)
      keys.push(badge.getKey())
    }
    root.append($createParagraphNode())
  }, { discrete: true })
  return keys
}

function setup() {
  const { wrapper, editor } = mountEditor(
    () => [
      h(ContentEditable),
      h(RichTextPlugin),
    ],
    {
      nodes: [BadgeNode],
    },
  )
  return { wrapper, editor }
}

function badgeTexts() {
  return [
    ...document.querySelectorAll('.badge'),
  ].map(el => el.textContent)
}

afterEach(() => {
  document.body.innerHTML = ''
  unmounted.mockClear()
})

describe('lexicalDecorators', () => {
  it('mounts the component inside the node element', async () => {
    const { editor } = setup()
    const [key] = insertBadges(editor, 'a')
    await flushPromises()

    const host = editor.getElementByKey(key)!
    expect(host.querySelector('.badge')?.textContent).toBe('a:none')
    expect(host.getAttribute('contenteditable')).toBe('false')
  })

  it('updates props when the node changes and unmounts when it is removed', async () => {
    const { editor } = setup()
    const [key] = insertBadges(editor, 'a')
    await flushPromises()

    editor.update(() => ($getNodeByKey(key) as BadgeNode).setLabel('b'), { discrete: true })
    await flushPromises()
    expect(badgeTexts()).toEqual(['b:none'])

    editor.update(() => $getNodeByKey(key)!.remove(), { discrete: true })
    await flushPromises()
    expect(badgeTexts()).toEqual([])
    expect(unmounted).toHaveBeenCalledWith('b')
  })

  it('isolates a failing decorator', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = setup()
    insertBadges(editor, 'ok', ['bad', true])
    await flushPromises()

    expect(badgeTexts()).toEqual(['ok:none'])
    expect(document.querySelector('[data-lexical-decorator-error]')).not.toBeNull()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('useLexicalNodeSelection', () => {
  it('reflects the NodeSelection and selects through setSelected', async () => {
    const { editor } = setup()
    const [key] = insertBadges(editor, 'a')
    await flushPromises()
    const badge = () => document.querySelector<HTMLElement>('.badge')!
    expect(badge().dataset.selected).toBe('false')

    editor.update(() => {
      const selection = $createNodeSelection()
      selection.add(key)
      $setSelection(selection)
    }, { discrete: true })
    await flushPromises()
    expect(badge().dataset.selected).toBe('true')

    editor.update(() => $setSelection(null), { discrete: true })
    await flushPromises()
    expect(badge().dataset.selected).toBe('false')

    badge().click()
    await flushPromises()
    expect(badge().dataset.selected).toBe('true')
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isNodeSelection(selection) && selection.getNodes().map(n => n.getKey())).toEqual([key])
    })
  })

  it('lets decorators inject values provided above the composer', async () => {
    const { editor } = mountEditor(
      () => [
        h(ContentEditable),
        h(RichTextPlugin),
      ],
      {
        nodes: [BadgeNode],
      },
      { theme: 'dark' },
    )
    insertBadges(editor, 'a')
    await flushPromises()
    expect(badgeTexts()).toEqual(['a:dark'])
  })
})
