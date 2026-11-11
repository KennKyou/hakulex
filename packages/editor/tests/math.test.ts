import type { ElementNode, LexicalEditor } from 'lexical'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isKaTeXBlockNode, $isKaTeXInlineNode, builtinTransformers, INSERT_MATH_COMMAND, RichEditor, serializeEditorState } from '../src'

function mountEditor() {
  const wrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

/** Paragraph contents as text, with equations as `[inline:x]` / blocks as `math:x`. */
function blocks(editor: LexicalEditor) {
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) => {
      if ($isKaTeXBlockNode(node))
        return `math:${node.getEquation()}`
      const children = 'getChildren' in node
        ? (node.getChildren as () => never[])()
        : []
      return children.map(child => ($isKaTeXInlineNode(child)
        ? `[inline:${child.getEquation()}]`
        : (child as { getTextContent: () => string }).getTextContent())).join('')
    }))
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}

function exportMarkdown(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
}

function setParagraph(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
}

const popover = () => document.querySelector<HTMLElement>('.hlx-math-popover')
const input = () => popover()!.querySelector<HTMLTextAreaElement>('textarea')!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('math markdown', () => {
  it('imports inline and block equations', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'Energy $E=mc^2$ is famous.\n\n$$\n\\int_0^1 x\n= \\frac12\n$$\n\n$$ a+b $$')
    expect(blocks(editor)).toEqual([
      'Energy [inline:E=mc^2] is famous.',
      'math:\\int_0^1 x\n= \\frac12',
      'math:a+b',
    ])
  })

  it.each([
    ['It costs $5 and $10.', 'It costs $5 and $10.'],
    // Markdown unescapes \$ to a literal dollar; it must not start an equation.
    ['Escaped \\$x$ stays text', 'Escaped $x$ stays text'],
    ['$ x $ needs no padding', '$ x $ needs no padding'],
  ])('leaves %j as text', (markdown, expected) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    expect(blocks(editor)).toEqual([expected])
  })

  it('exports back to markdown', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'A $x^2$ b\n\n$$\ny\n$$')
    expect(exportMarkdown(editor)).toBe('A $x^2$ b\n\n$$\ny\n$$')
  })

  it('converts "$x$" while typing, on the closing dollar', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'see $x')
    editor.update(() => {
      $getRoot().getFirstDescendant()!.selectEnd().insertText('$')
    }, { discrete: true })
    await flushPromises()
    expect(blocks(editor)).toEqual(['see [inline:x]'])
  })

  it('serializes as katex-inline / katex-block', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'a $x$\n\n$$y$$')
    const children = editor.getEditorState().toJSON().root.children as { type: string, children?: { type: string }[] }[]
    expect(children[0].children?.[1]).toMatchObject({ type: 'katex-inline', equation: 'x' })
    expect(children[1]).toMatchObject({ type: 'katex-block', equation: 'y' })
  })
})

describe('math editing', () => {
  it('"$$" + Enter makes a block equation and opens its editor', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '$$')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(blocks(editor)).toEqual(['math:', ''])
    expect(popover()).not.toBeNull()
  })

  it('applies the popover input with Enter (inline)', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'value ')
    editor.dispatchCommand(INSERT_MATH_COMMAND, { display: false })
    await flushPromises()

    input().value = 'a^2'
    input().dispatchEvent(new Event('input'))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(blocks(editor)).toEqual(['value [inline:a^2]'])
  })

  it('removes a new, empty equation on Escape', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'value ')
    editor.dispatchCommand(INSERT_MATH_COMMAND, { display: false })
    await flushPromises()
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(blocks(editor)).toEqual(['value '])
  })

  it('keeps the old equation when an edit is cancelled', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'see $x$')
    await flushPromises()
    // A double click opens it, as its toolbar's 編輯 does: a click, then the double click.
    document.querySelector<HTMLElement>('.hlx-math-editor')!.click()
    await flushPromises()
    document.querySelector<HTMLElement>('.hlx-math-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushPromises()
    input().value = 'changed'
    input().dispatchEvent(new Event('input'))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(blocks(editor)).toEqual(['see [inline:x]'])
  })
})

describe('stored color of inline math', () => {
  const doc = (extra: Record<string, unknown>) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: '',
          children: [
            {
              type: 'katex-inline',
              version: 1,
              equation: 'x',
              ...extra,
            },
          ],
        },
      ],
    },
  })

  it.each([
    [null],
    ['#ff0000'],
  ])('outputs %j as it was stored, also after an edit', async (color) => {
    const value = doc({ color })
    const wrapper = mount(RichEditor, {
      props: { modelValue: value } as never,
      attachTo: document.body,
    })
    await flushPromises()
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
    editor.update(() => {
      const node = $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChild()
      if ($isKaTeXInlineNode(node))
        node.setEquation('y')
    }, { discrete: true })
    expect(serializeEditorState(editor.getEditorState()).root.children[0]).toMatchObject({
      children: [
        { equation: 'y', color },
      ],
    })
    wrapper.unmount()
  })

  it('adds no color to math without one', async () => {
    const value = doc({})
    const wrapper = mount(RichEditor, {
      props: { modelValue: value } as never,
      attachTo: document.body,
    })
    await flushPromises()
    expect(serializeEditorState((wrapper.vm as unknown as { editor: LexicalEditor }).editor.getEditorState())).toEqual(value)
    wrapper.unmount()
  })
})
