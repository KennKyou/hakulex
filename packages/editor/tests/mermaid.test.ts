import type { LexicalEditor } from 'lexical'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createTextNode, $getRoot, KEY_ENTER_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isCodeBlockNode, $isMermaidNode, builtinTransformers, INSERT_MERMAID_COMMAND, RichEditor } from '../src'

function mountEditor() {
  const wrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

function blocks(editor: LexicalEditor) {
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) => {
      if ($isMermaidNode(node))
        return `mermaid:${node.getDiagram()}`
      if ($isCodeBlockNode(node))
        return `code:${node.getLanguage()}`
      return `${node.getType()}:${node.getTextContent()}`
    }))
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}

function setParagraph(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
}

const dialog = () => document.querySelector<HTMLElement>('.hlx-mermaid-dialog')
const source = () => dialog()!.querySelector<HTMLTextAreaElement>('textarea')!

function typeSource(value: string) {
  source().value = value
  source().dispatchEvent(new Event('input'))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('mermaid markdown', () => {
  it('imports ```mermaid fences as diagrams, other fences as code', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '```mermaid\nflowchart LR\n  A --> B\n```\n\n```ts\nx\n```')
    expect(blocks(editor)).toEqual(['mermaid:flowchart LR\n  A --> B', 'code:ts'])
  })

  it('exports diagrams back as ```mermaid fences', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '```mermaid\npie\n  "a": 1\n```')
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers)))
      .toBe('```mermaid\npie\n  "a": 1\n```')
  })

  it('serializes as `mermaid` with the source in `diagram`', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '```mermaid\ngraph TD\n```')
    expect(editor.getEditorState().toJSON().root.children[0]).toMatchObject({ type: 'mermaid', diagram: 'graph TD' })
  })
})

describe('mermaid editing', () => {
  it('"```mermaid" + Enter makes a diagram, not a code block, and opens the dialog', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '```mermaid')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(blocks(editor)).toEqual(['mermaid:', 'paragraph:'])
    expect(dialog()).not.toBeNull()
  })

  it('saves the dialog source with Cmd+Enter', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '')
    editor.dispatchCommand(INSERT_MERMAID_COMMAND, undefined)
    await flushPromises()

    typeSource('flowchart LR\n  A --> B')
    source().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    await flushPromises()

    expect(dialog()).toBeNull()
    expect(blocks(editor)).toEqual(['mermaid:flowchart LR\n  A --> B', 'paragraph:'])
  })

  it('fills the source from a template', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '')
    editor.dispatchCommand(INSERT_MERMAID_COMMAND, undefined)
    await flushPromises()
    const chip = [
      ...dialog()!.querySelectorAll<HTMLButtonElement>('.hlx-mermaid-chip'),
    ].find(b => b.textContent?.includes('序列圖'))!
    chip.click()
    await flushPromises()
    expect(source().value.startsWith('sequenceDiagram')).toBe(true)
  })

  it('removes a new, empty diagram on Escape', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '')
    editor.dispatchCommand(INSERT_MERMAID_COMMAND, undefined)
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(blocks(editor)).toEqual(['paragraph:'])
  })

  it('keeps the existing diagram when an edit is cancelled', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '```mermaid\ngraph TD\n  A --> B\n```')
    await flushPromises()
    // A double click opens it, as its toolbar's 編輯 does.
    document.querySelector<HTMLElement>('.hlx-mermaid-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushPromises()
    typeSource('changed')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(blocks(editor)[0]).toBe('mermaid:graph TD\n  A --> B')
  })
})
