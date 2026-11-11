import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $isListNode, INSERT_CHECK_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { $isHeadingNode } from '@lexical/rich-text'
import { mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $selectAll,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { RichEditor, validateUrl } from '../src'

type Wrapper = ReturnType<typeof mountEditor>

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(RichEditor, { props, attachTo: document.body })
}

function editorOf(wrapper: Wrapper): LexicalEditor {
  const editor = (wrapper.vm as unknown as { editor?: LexicalEditor }).editor
  if (!editor)
    throw new Error('editor not ready')
  return editor
}

function setText(editor: LexicalEditor, text: string) {
  editor.update(() => {
    $getRoot().clear().append($createParagraphNode().append($createTextNode(text)))
  }, { discrete: true })
}

/** Types `text` one character at a time at the end of the document, like a user. */
function type(editor: LexicalEditor, text: string) {
  for (const char of text) {
    editor.update(() => {
      const last = $getRoot().getLastDescendant()
      last?.selectEnd()
    }, { discrete: true })
    editor.update(() => {
      const last = $getRoot().getLastDescendant()
      const selection = last?.selectEnd()
      selection?.insertText(char)
    }, { discrete: true })
  }
}

function readText(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $getRoot().getTextContent())
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('richEditor v-model', () => {
  it('loads the initial modelValue', () => {
    const source = mountEditor()
    setText(editorOf(source), 'initial')
    const json = editorOf(source).getEditorState().toJSON()

    const wrapper = mountEditor({ modelValue: json })
    expect(readText(editorOf(wrapper))).toBe('initial')
  })

  it('emits serialized state on edits, not on selection changes', () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    setText(editor, 'hello')
    editor.update(() => $selectAll(), { discrete: true })

    const events = wrapper.emitted('update:modelValue') as [SerializedEditorState][]
    expect(events).toHaveLength(1)
    expect(events[0][0].root.children).toHaveLength(1)
  })

  it('applies external modelValue changes', async () => {
    const other = mountEditor()
    setText(editorOf(other), 'external')
    const json = editorOf(other).getEditorState().toJSON()

    const wrapper = mountEditor()
    await wrapper.setProps({ modelValue: json })
    await Promise.resolve()
    expect(readText(editorOf(wrapper))).toBe('external')
  })

  it('does not re-apply the value it just emitted', async () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    setText(editor, 'mine')
    const emitted = (wrapper.emitted('update:modelValue') as [SerializedEditorState][])[0][0]

    const before = editor.getEditorState()
    await wrapper.setProps({ modelValue: emitted })
    await Promise.resolve()
    expect(editor.getEditorState()).toBe(before)
  })

  it('null clears the document', async () => {
    const wrapper = mountEditor()
    setText(editorOf(wrapper), 'to clear')
    await wrapper.setProps({ modelValue: null })
    await Promise.resolve()
    expect(readText(editorOf(wrapper))).toBe('')
  })
})

describe('richEditor props', () => {
  it('toggles editable', async () => {
    const wrapper = mountEditor()
    await wrapper.setProps({ editable: false })
    expect(editorOf(wrapper).isEditable()).toBe(false)
    expect(wrapper.find('.hlx-content').attributes('contenteditable')).toBe('false')
  })

  it('sets variant and color scheme on the root', () => {
    const wrapper = mountEditor({ variant: 'note', colorScheme: 'dark' })
    const root = wrapper.find('.hlx-root')
    expect(root.attributes('data-variant')).toBe('note')
    expect(root.attributes('data-color-scheme')).toBe('dark')
  })
})

describe('richEditor content', () => {
  it('turns "# " into a heading', () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    type(editor, '# Title')
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isHeadingNode(first) && first.getTag()).toBe('h1')
      expect(first?.getTextContent()).toBe('Title')
    })
  })

  it('turns "[ ] " into a check list', () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    type(editor, '[ ] task')
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isListNode(first) && first.getListType()).toBe('check')
    })
  })

  // dispatchCommand runs listeners inside editor.update(), which commits on the next microtask.
  it('handles list commands', async () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    setText(editor, 'item')
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
    await Promise.resolve()
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isListNode(first) && first.getListType()).toBe('bullet')
    })

    editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
    await Promise.resolve()
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isListNode(first) && first.getListType()).toBe('check')
    })
  })

  it('links the selection only for safe URLs', async () => {
    const wrapper = mountEditor()
    const editor = editorOf(wrapper)
    const hasLink = () => editor.getEditorState().read(() =>
      $getRoot().getAllTextNodes().some(node => $isLinkNode(node.getParent())))

    setText(editor, 'click me')
    editor.update(() => $selectAll(), { discrete: true })
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'javascript:alert(1)')
    await Promise.resolve()
    expect(hasLink()).toBe(false)

    editor.update(() => $selectAll(), { discrete: true })
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://example.com')
    await Promise.resolve()
    expect(hasLink()).toBe(true)
  })
})

describe('validateUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com/a?b=c', true],
    ['mailto:a@b.co', true],
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(validateUrl(url)).toBe(expected)
  })
})

it('re-renders after async props without losing the editor', async () => {
  const wrapper = mountEditor({ placeholder: 'Write' })
  await nextTick()
  expect(wrapper.find('[data-lexical-placeholder]').text()).toBe('Write')
})
