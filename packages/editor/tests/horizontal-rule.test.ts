import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  KEY_BACKSPACE_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND, RichEditor } from '../src'

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

/** Top-level block types, `hr` for rules. */
function blocks(editor: LexicalEditor) {
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().map(node => ($isHorizontalRuleNode(node)
      ? 'hr'
      : `${node.getType()}:${node.getTextContent()}`)))
}

function setParagraph(editor: LexicalEditor, text: string, caret: number) {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.select(caret, caret)
  }, { discrete: true })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('horizontal rule', () => {
  it('replaces an empty line, keeping a paragraph below for the caret', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '', 0)
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    await flushPromises()
    expect(blocks(editor)).toEqual(['hr', 'paragraph:'])
  })

  it('splits a paragraph at the caret', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'beforeafter', 6)
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    await flushPromises()
    expect(blocks(editor)).toEqual(['paragraph:before', 'hr', 'paragraph:after'])
  })

  it('turns "--- " into a rule', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '--', 2)
    editor.update(() => {
      $getRoot().getFirstDescendant()!.selectEnd().insertText('-')
    }, { discrete: true })
    editor.update(() => {
      $getRoot().getFirstDescendant()!.selectEnd().insertText(' ')
    }, { discrete: true })
    await flushPromises()
    expect(blocks(editor)).toEqual(['hr', 'paragraph:'])
  })

  it('renders the Vue component and round-trips through JSON', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '', 0)
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    await flushPromises()
    expect(document.querySelectorAll('.hlx-hr-block > hr.hlx-hr')).toHaveLength(1)

    const json: SerializedEditorState = editor.getEditorState().toJSON()
    expect(json.root.children[0]).toMatchObject({ type: 'horizontalrule', version: 1 })

    document.body.innerHTML = ''
    const reloaded = mountEditor({ modelValue: json })
    await flushPromises()
    expect(blocks(reloaded.editor)).toEqual(['hr', 'paragraph:'])
    expect(document.querySelectorAll('hr.hlx-hr')).toHaveLength(1)
  })

  it('is selected by click and removed with Backspace', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '', 0)
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    await flushPromises()

    const hr = document.querySelector<HTMLElement>('hr.hlx-hr')!
    hr.click()
    await flushPromises()
    expect(hr.hasAttribute('data-selected')).toBe(true)

    editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(blocks(editor)).toEqual(['paragraph:'])
  })

  it('ignores clicks while read-only', async () => {
    const { wrapper, editor } = mountEditor()
    setParagraph(editor, '', 0)
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    await flushPromises()
    await wrapper.setProps({ editable: false })
    editor.update(() => $setSelection($createNodeSelection()), { discrete: true })

    const hr = document.querySelector<HTMLElement>('hr.hlx-hr')!
    hr.click()
    await flushPromises()
    expect(hr.hasAttribute('data-selected')).toBe(false)
  })
})
