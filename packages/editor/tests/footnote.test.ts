import type { ElementNode, LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $isFootnoteNode, builtinTransformers, INSERT_FOOTNOTE_COMMAND, RichEditor, serializeEditorState } from '../src'
import { isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  identifier?: unknown
  definitions?: Record<string, string>
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const blockTypes = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}
const refs = (editor: LexicalEditor) => find(rootChildren(editor), 'footnote').map(node => node.identifier)
const definitions = (editor: LexicalEditor) => find(rootChildren(editor), 'footnote-section')[0]?.definitions
const texts = (editor: LexicalEditor) => find(rootChildren(editor), 'text')
const documentText = (editor: LexicalEditor) => find(rootChildren(editor), 'text').map(node => node.text).join('')
const dom = (editor: LexicalEditor) => editor.getRootElement()!

function text(value: string) {
  return {
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}
const ref = (identifier: unknown) => ({ type: 'footnote', version: 1, identifier })
const section = (definitions: unknown) => ({ type: 'footnote-section', version: 1, definitions })
function paragraph(...children: unknown[]) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children,
  }
}
function documentWith(...children: unknown[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  } as unknown as SerializedEditorState
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
  return flushPromises()
}
const exportMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

function emptyDocument(editor: LexicalEditor) {
  editor.update(() => {
    const block = $createParagraphNode()
    $getRoot().clear().append(block)
    block.select()
  }, { discrete: true })
}

async function type(editor: LexicalEditor, value: string) {
  for (const char of value) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText(char)
    }, { discrete: true })
    await flushPromises()
  }
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

async function paste(editor: LexicalEditor, entries: Record<string, string>) {
  const data = new DataTransfer()
  for (const [kind, value] of Object.entries(entries))
    data.setData(kind, value)
  editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
  await flushPromises()
}

function inputs(editor: LexicalEditor) {
  return [
    ...dom(editor).querySelectorAll<HTMLInputElement>('.hlx-footnote-input'),
  ]
}
function numbers(editor: LexicalEditor) {
  return [
    ...dom(editor).querySelectorAll('.hlx-footnote-ref'),
  ].map(node => node.textContent)
}

async function edit(input: HTMLInputElement, value: string) {
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('blur'))
  await flushPromises()
}

describe('document model', () => {
  it('round-trips through JSON without being changed', async () => {
    const doc = documentWith(paragraph(text('a'), ref('1'), text('b'), ref('note')), section({ 1: '甲', note: '乙' }))
    const { editor } = mountEditor({ modelValue: doc })
    await flushPromises()
    expect(refs(editor)).toEqual(['1', 'note'])
    expect(definitions(editor)).toEqual({ 1: '甲', note: '乙' })

    const json = editor.getEditorState().toJSON()
    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(reloaded.getEditorState().toJSON()).toEqual(json)
  })

  it.each([
    [
      'an identifier that is not text',
      paragraph(ref(42), text('x')),
      section({ 1: '甲' }),
    ],
    [
      'definitions that are not an object',
      paragraph(ref('1'), text('x')),
      section('nope'),
    ],
    [
      'content that is not text',
      paragraph(ref('1'), text('x')),
      section({ 1: 42 }),
    ],
  ])('loads %s without errors', async (_name, ...blocks) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor({
      modelValue: documentWith(...blocks),
      editable: false,
    })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(documentText(editor)).toBe('x')
    expect(dom(editor).querySelector('[role="doc-noteref"]')).toBeNull()
  })

  it.each(['constructor', '__proto__'])('finds no content for %s', async (identifier) => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(ref(identifier)), section({})),
      editable: false,
    })
    await flushPromises()
    expect(dom(editor).textContent).not.toContain('native code')
    expect(dom(editor).querySelector('[role="doc-noteref"]')).toBeNull()
  })

  it('numbers by first appearance, and renumbers without touching identifiers', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(ref('b'), ref('a'), ref('b')), section({ a: 'A', b: 'B' })),
    })
    await flushPromises()
    expect(numbers(editor)).toEqual(['1', '2', '1'])
    expect(inputs(editor).map(input => input.value)).toEqual(['B', 'A'])

    editor.update(() => {
      for (const node of $getRoot().getChildren()[0].getChildren()) {
        if ($isFootnoteNode(node) && node.getIdentifier() === 'b')
          node.remove()
      }
    }, { discrete: true })
    await flushPromises()
    expect(numbers(editor)).toEqual(['1'])
    expect(refs(editor)).toEqual(['a'])
  })
})

describe('editing content', () => {
  const doc = () => documentWith(paragraph(text('前'), ref('1'), text('後')), section({ 1: '原本' }))

  it('writes on leaving the input, as one undo step', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    const [input] = inputs(editor)
    input.focus()
    input.value = '修改'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(definitions(editor)).toEqual({ 1: '原本' })

    await edit(input, '修改')
    expect(definitions(editor)).toEqual({ 1: '修改' })

    await undo(editor)
    expect(definitions(editor)).toEqual({ 1: '原本' })
    expect(inputs(editor)[0].value).toBe('原本')
  })

  it('confirms with Enter, cancels with Escape, and returns the caret after the reference', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    const caret = () => editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection))
        return null
      return [
        selection.anchor.getNode().getTextContent(),
        selection.anchor.offset,
      ]
    })

    let [input] = inputs(editor)
    input.focus()
    input.value = '放棄'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(definitions(editor)).toEqual({ 1: '原本' })
    expect(inputs(editor)[0].value).toBe('原本')
    expect(document.activeElement).toBe(dom(editor))
    expect(caret()).toEqual(['後', 0])

    ;[input] = inputs(editor)
    input.focus()
    input.value = '確認'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(definitions(editor)).toEqual({ 1: '確認' })
    expect(document.activeElement).toBe(dom(editor))
    expect(caret()).toEqual(['後', 0])
  })

  it('keeps keys in the input from reaching the editor', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    await edit(inputs(editor)[0], '修改')
    const [input] = inputs(editor)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()
    expect(definitions(editor)).toEqual({ 1: '修改' })
  })

  it('goes to the content when a reference is clicked, leaving the document alone', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    const before = editor.getEditorState().toJSON()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    dom(editor).querySelector('.hlx-footnote-ref a')!.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(inputs(editor)[0])
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })

  it('removes the content and every reference, as one undo step', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(ref('1'), text('x'), ref('2'), ref('1')), section({ 1: '甲', 2: '乙' })),
    })
    await flushPromises()
    dom(editor).querySelector<HTMLButtonElement>('[aria-label="刪除註腳 1"]')!.click()
    await flushPromises()
    expect(refs(editor)).toEqual(['2'])
    expect(definitions(editor)).toEqual({ 2: '乙' })
    expect(numbers(editor)).toEqual(['1'])

    await undo(editor)
    expect(refs(editor)).toEqual(['1', '2', '1'])
    expect(definitions(editor)).toEqual({ 1: '甲', 2: '乙' })
  })

  it('is plain and has no controls while read-only', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
      editable: false,
    })
    await flushPromises()
    const before = editor.getEditorState().toJSON()
    expect(inputs(editor)).toHaveLength(0)
    expect(dom(editor).querySelector('.hlx-footnote button')).toBeNull()
    expect(dom(editor).querySelector('.hlx-footnote-text')!.textContent).toBe('原本')
    expect(dom(editor).querySelector('[role="doc-backlink"]')).not.toBeNull()

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    dom(editor).querySelector('.hlx-footnote-ref a')!.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })
})

describe('keeping the section in order', () => {
  it('appears with the first reference, and goes away in one undo', async () => {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await flushPromises()
    await type(editor, '[^1]')
    expect(refs(editor)).toEqual(['1'])
    expect(blockTypes(editor)).toEqual(['paragraph', 'footnote-section'])
    expect(definitions(editor)).toEqual({ 1: '' })

    await undo(editor)
    expect(refs(editor)).toEqual([])
    expect(definitions(editor)).toBeUndefined()
  })

  it('keeps content when its reference goes away, and reconnects when it returns', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '內容' })),
    })
    await flushPromises()
    editor.update(() => $getRoot().getChildren()[0].getLastChild()!.remove(), { discrete: true })
    await flushPromises()
    expect(refs(editor)).toEqual([])
    expect(definitions(editor)).toEqual({ 1: '內容' })
    expect(dom(editor).querySelector('.hlx-footnote-orphan')).not.toBeNull()

    editor.update(() => $getRoot().getChildren()[0].selectEnd(), { discrete: true })
    await type(editor, '[^1]')
    expect(definitions(editor)).toEqual({ 1: '內容' })
    expect(dom(editor).querySelector('.hlx-footnote-orphan')).toBeNull()
    expect(inputs(editor)[0].value).toBe('內容')
  })

  it('removes blank content with its last reference, and the empty section too', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '' })),
    })
    await flushPromises()
    editor.update(() => $getRoot().getChildren()[0].getLastChild()!.remove(), { discrete: true })
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph'])
  })

  it('removes content nothing refers to with its button, leaving the text', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前')), section({ 1: '內容' })),
    })
    await flushPromises()
    dom(editor).querySelector<HTMLButtonElement>('.hlx-footnote button')!.click()
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph'])
    expect(documentText(editor)).toBe('前')
  })

  it('merges sections and moves them last once edited, but leaves read-only documents alone', async () => {
    const doc = documentWith(section({ 1: '甲' }), paragraph(ref('1'), ref('2'), text('x')), section({ 1: '覆蓋', 2: '乙' }))

    const readOnly = mountEditor({ modelValue: doc, editable: false }).editor
    await flushPromises()
    expect(blockTypes(readOnly)).toEqual(['footnote-section', 'paragraph', 'footnote-section'])

    const { editor } = mountEditor({ modelValue: doc })
    await flushPromises()
    editor.update(() => $getRoot().getChildren().find($isParagraphNode)!.selectEnd(), { discrete: true })
    await type(editor, 'y')
    expect(blockTypes(editor)).toEqual(['paragraph', 'footnote-section'])
    expect(definitions(editor)).toEqual({ 1: '甲', 2: '乙' })
    expect(documentText(editor)).toBe('xy')
  })

  it('puts a click below the section in a paragraph above it', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '內容' })),
    })
    await flushPromises()
    dom(editor).dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 9999 }))
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
    await type(editor, '新')
    expect(find([rootChildren(editor)[1]], 'text').map(node => node.text)).toEqual(['新'])

    // A second click has no need for another paragraph.
    editor.update(() => $getRoot().getChildren()[1].clear().select(), { discrete: true })
    dom(editor).dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 9999 }))
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
  })

  it('gives an inserted footnote an unused identifier', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '甲', 2: '沒人引用' })),
    })
    await flushPromises()
    editor.update(() => $getRoot().getChildren()[0].selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined)
    await flushPromises()
    expect(refs(editor)).toEqual(['1', '3'])
    expect(definitions(editor)).toEqual({ 1: '甲', 2: '沒人引用', 3: '' })
    expect(document.activeElement).toBe(inputs(editor).find(input => input.closest('li')?.dataset.hlxDefinition === '3'))
  })
})

describe('markdown', () => {
  it('imports and exports references and definitions, whatever is in between', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '甲[^1]乙[^note]\n\n[^1]: 內容 **粗**\n\n中間\n\n[^note]: 另一段')
    expect(refs(editor)).toEqual(['1', 'note'])
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
    expect(definitions(editor)).toEqual({ 1: '內容 **粗**', note: '另一段' })

    const exported = exportMarkdown(editor)
    expect(exported).toBe('甲[^1]乙[^note]\n\n中間\n\n[^1]: 內容 **粗**\n[^note]: 另一段')
    await importMarkdown(editor, exported)
    expect(exportMarkdown(editor)).toBe(exported)
    expect(definitions(editor)).toEqual({ 1: '內容 **粗**', note: '另一段' })
  })

  it.each([
    ['a character class', '[^a-z]'],
    ['a definition without content', '[^1]:'],
  ])('leaves %s as text', async (_name, markdown) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, markdown)
    expect(refs(editor)).toEqual([])
    expect(definitions(editor)).toBeUndefined()
    expect(documentText(editor)).toBe(markdown)
  })

  it('leaves inline code alone', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '`[^1]`')
    expect(refs(editor)).toEqual([])
    expect(documentText(editor)).toBe('[^1]')
  })

  it('keeps plain text that looks like a reference through export', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      $getRoot().clear().append($createParagraphNode().append($createTextNode('[^1]')))
    }, { discrete: true })
    await flushPromises()
    const exported = exportMarkdown(editor)
    await importMarkdown(editor, exported)
    expect(refs(editor)).toEqual([])
    expect(documentText(editor)).toBe('[^1]')
  })

  it.each([
    ['a heading', '# 標[^1]', 'heading'],
    ['a list', '- 項[^1]', 'listitem'],
    ['an alert', '> [!NOTE]\n> 提示[^1]', 'alert-quote'],
    ['a table cell', '| 格[^1] |\n| --- |', 'tablecell'],
  ])('works in %s, numbered in document order', async (_name, markdown, container) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, `前[^0]\n\n${markdown}\n\n[^0]: 零\n\n[^1]: 一`)
    const [block] = find(rootChildren(editor), container)
    expect(find([block], 'footnote').map(node => node.identifier)).toEqual(['1'])
    expect(numbers(editor)).toEqual(['1', '2'])

    const json = editor.getEditorState().toJSON()
    const exported = exportMarkdown(editor)
    await importMarkdown(editor, exported)
    expect(refs(editor)).toEqual(['0', '1'])
    expect(definitions(editor)).toEqual({ 0: '零', 1: '一' })

    const rendered = mount(RichRenderer, {
      props: { value: json },
    })
    expect(rendered.findAll('[role="doc-noteref"]').map(link => link.text())).toEqual(['1', '2'])
  })

  it('counts a reference inside a spoiler', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '||雷[^1]||\n\n[^1]: 一')
    expect(find(find(rootChildren(editor), 'spoiler'), 'footnote')).toHaveLength(1)
    expect(exportMarkdown(editor)).toBe('||雷[^1]||\n\n[^1]: 一')
  })

  it.each([
    ['an alert', '> [!NOTE]\n> [^1]: 內容'],
    ['a table cell', '| [^1]: 內容 |\n| --- |'],
  ])('reads no definition from %s', async (_name, markdown) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, markdown)
    expect(definitions(editor)).toBeUndefined()
    expect(documentText(editor)).toContain('內容')
  })
})

describe('typing', () => {
  async function typed(value: string) {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await flushPromises()
    await type(editor, value)
    return editor
  }

  it('turns a number into a reference, and continues in text', async () => {
    const editor = await typed('前[^1]後')
    expect(refs(editor)).toEqual(['1'])
    expect(documentText(editor)).toBe('前後')
  })

  it('leaves other identifiers as text', async () => {
    const editor = await typed('[^abc]')
    expect(refs(editor)).toEqual([])
    expect(documentText(editor)).toBe('[^abc]')
  })

  it('makes no definition from a typed line, keeping the text', async () => {
    const editor = await typed('[^1]: 內容')
    expect(refs(editor)).toEqual(['1'])
    expect(definitions(editor)).toEqual({ 1: '' })
    expect(documentText(editor)).toBe(': 內容')
  })

  it('leaves inline code alone', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const code = $createTextNode('xy').toggleFormat('code')
      $getRoot().clear().append($createParagraphNode().append(code))
      // A real caret takes the format of the text it lands in; a scripted one doesn't.
      code.select(1, 1).setFormat(code.getFormat())
    }, { discrete: true })
    await flushPromises()
    await type(editor, '[^1]')
    expect(refs(editor)).toEqual([])
    expect(documentText(editor)).toBe('x[^1]y')
    expect(texts(editor).every(node => node.format === 16)).toBe(true)
  })
})

describe('html and paste', () => {
  it('keeps references and content through export and paste', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '<b>內容</b>' })),
    })
    await flushPromises()
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))

    const target = mountEditor().editor
    emptyDocument(target)
    await paste(target, { 'text/html': html, 'text/plain': 'ignored' })
    expect(refs(target)).toEqual(['1'])
    expect(definitions(target)).toEqual({ 1: '<b>內容</b>' })
    expect(find(rootChildren(target), 'footnote-section')).toHaveLength(1)
    expect(documentText(target)).not.toContain('ignored')
  })

  it('reads what the renderer outputs', async () => {
    const rendered = mount(RichRenderer, {
      props: {
        value: documentWith(paragraph(text('前'), ref('1')), section({ 1: '見 https://example.com 。' })),
      },
    })
    const target = mountEditor().editor
    emptyDocument(target)
    await paste(target, {
      'text/html': rendered.html(),
    })
    expect(refs(target)).toEqual(['1'])
    expect(definitions(target)).toEqual({ 1: '見 https://example.com 。' })
    expect(documentText(target)).not.toContain('↩')
  })

  it('converts a pasted definition, in one undo step', async () => {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await flushPromises()
    await type(editor, '前')
    await paste(editor, { 'text/plain': '說明[^1]\n\n[^1]: 內容' })
    expect(refs(editor)).toEqual(['1'])
    expect(definitions(editor)).toEqual({ 1: '內容' })

    await undo(editor)
    expect(refs(editor)).toEqual([])
    expect(definitions(editor)).toBeUndefined()
    expect(documentText(editor)).toBe('前')
  })

  it.each([
    ['[^1]', false],
    ['見[^1]和[^2]', false],
    ['[^a-z]+ 和 **粗**', false],
    ['[^1]: 內容', true],
    ['見[^1] 和 **粗**', true],
  ])('isMarkdown(%j) is %j', (value, expected) => {
    expect(isMarkdown(value)).toBe(expected)
  })
})

describe('where a stored section stays', () => {
  const stored = () => documentWith(paragraph(text('前'), ref('1')), section({ 1: '內容' }), paragraph(text('後')))
  const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState())

  it('leaves a section in the middle alone when nothing is edited', async () => {
    const value = stored()
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('leaves it alone when something else updates the document on mount', async () => {
    const image = {
      type: 'image',
      version: 1,
      src: 'https://example.com/a.png',
      altText: '',
    }
    const value = documentWith(paragraph(text('前'), ref('1')), section({ 1: '內容' }), image, paragraph(text('後')))
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('leaves it alone when the document is replaced', async () => {
    const { editor, wrapper } = mountEditor({
      modelValue: documentWith(paragraph(text('a'))),
    })
    await flushPromises()
    const value = stored()
    await wrapper.setProps({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('keeps it in place through edits, and adds new notes to it', async () => {
    const { editor } = mountEditor({
      modelValue: stored(),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ElementNode>().selectEnd().insertText('字'), { discrete: true })
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'footnote-section', 'paragraph'])
    editor.update(() => $getRoot().getLastChildOrThrow<ElementNode>().selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined)
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'footnote-section', 'paragraph'])
    expect(Object.keys(definitions(editor))).toEqual(['1', '2'])
  })

  it('keeps a last section last when something is added after it', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前'), ref('1')), section({ 1: '內容' })),
    })
    await flushPromises()
    editor.update(() => $getRoot().append($createParagraphNode()), { discrete: true })
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
  })

  it('still puts imported definitions last', async () => {
    const { editor } = mountEditor()
    await flushPromises()
    importMarkdown(editor, '有[^1]\n\n[^1]: 內容\n\n後面')
    await flushPromises()
    expect(blockTypes(editor).at(-1)).toBe('footnote-section')
  })
})
