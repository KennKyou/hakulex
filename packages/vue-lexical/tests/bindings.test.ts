import type { EditorState } from 'lexical'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { ContentEditable, HistoryPlugin, OnChangePlugin, RichTextPlugin } from '../src'
import { mountEditor } from './helpers'

function setText(editor: ReturnType<typeof mountEditor>['editor'], text: string) {
  editor.update(() => {
    const paragraph = $createParagraphNode().append($createTextNode(text))
    $getRoot().clear().append(paragraph)
  }, { discrete: true })
}

const readText = (state: EditorState) => state.read(() => $getRoot().getTextContent())

afterEach(() => {
  document.body.innerHTML = ''
})

describe('lexicalComposer', () => {
  it('creates an empty paragraph by default', () => {
    const { editor } = mountEditor(() => [])
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1)
      expect($getRoot().getFirstChild()?.getType()).toBe('paragraph')
    })
  })

  it('loads a serialized editor state', () => {
    const source = mountEditor(() => [])
    setText(source.editor, 'hello')
    const json = JSON.stringify(source.editor.getEditorState().toJSON())

    const { editor } = mountEditor(() => [], { editorState: json })
    expect(readText(editor.getEditorState())).toBe('hello')
  })

  it('builds content from a function', () => {
    const { editor } = mountEditor(() => [], {
      editorState: () => {
        $getRoot().append($createParagraphNode().append($createTextNode('from fn')))
      },
    })
    expect(readText(editor.getEditorState())).toBe('from fn')
  })
})

describe('contentEditable', () => {
  it('attaches the root element and renders editor content', () => {
    const { wrapper, editor } = mountEditor(() => [
      h(ContentEditable, { class: 'surface' }),
    ])
    const root = wrapper.find('.surface').element as HTMLElement
    expect(editor.getRootElement()).toBe(root)
    expect(root.getAttribute('contenteditable')).toBe('true')

    setText(editor, 'typed')
    expect(root.textContent).toBe('typed')
  })

  it('follows editor.setEditable', async () => {
    const { wrapper, editor } = mountEditor(() => [
      h(ContentEditable, { class: 'surface' }),
    ])
    editor.setEditable(false)
    await nextTick()
    const root = wrapper.find('.surface')
    expect(root.attributes('contenteditable')).toBe('false')
    expect(root.attributes('aria-readonly')).toBe('true')
  })

  it('shows the placeholder only while empty', async () => {
    const { wrapper, editor } = mountEditor(() => [
      h(ContentEditable, { placeholder: 'Write…' }),
    ])
    expect(wrapper.find('[data-lexical-placeholder]').text()).toBe('Write…')

    setText(editor, 'x')
    await nextTick()
    expect(wrapper.find('[data-lexical-placeholder]').exists()).toBe(false)
  })

  it('detaches the root element on unmount', () => {
    const { wrapper, editor } = mountEditor(() => [
      h(ContentEditable),
    ])
    wrapper.unmount()
    expect(editor.getRootElement()).toBeNull()
  })
})

describe('plugins', () => {
  it('onChangePlugin emits for real changes but not the initial state', () => {
    const changes: string[] = []
    const { editor } = mountEditor(() => [
      h(ContentEditable),
      h(OnChangePlugin, {
        onChange: (state: EditorState) => changes.push(readText(state)),
      }),
    ])
    expect(changes).toEqual([])

    setText(editor, 'a')
    setText(editor, 'ab')
    expect(changes).toEqual(['a', 'ab'])
  })

  it('historyPlugin undoes and redoes', async () => {
    const { editor } = mountEditor(() => [
      h(ContentEditable),
      h(RichTextPlugin),
      h(HistoryPlugin, { delay: 0 }),
    ])
    setText(editor, 'first')
    setText(editor, 'second')

    // Undo/redo restore state via setEditorState, which commits on the next microtask.
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()
    expect(readText(editor.getEditorState())).toBe('first')
    editor.dispatchCommand(REDO_COMMAND, undefined)
    await Promise.resolve()
    expect(readText(editor.getEditorState())).toBe('second')
  })

  it('unregisters listeners on unmount', () => {
    const changes: string[] = []
    const { wrapper, editor } = mountEditor(() => [
      h(OnChangePlugin, {
        onChange: (state: EditorState) => changes.push(readText(state)),
      }),
    ])
    wrapper.unmount()
    setText(editor, 'after unmount')
    expect(changes).toEqual([])
  })
})
