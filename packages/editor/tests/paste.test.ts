import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { RichEditor } from '../src'
import { hasRichHtml, isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  url?: string
  src?: string
  code?: string
  language?: string
  tag?: string
  listType?: string
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor() {
  const wrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

/** A single paragraph with the caret at its end, or `selected` chars selected at its end. */
function setParagraph(editor: LexicalEditor, value = '', selected = 0) {
  editor.update(() => {
    const paragraph = $createParagraphNode()
    const text = $createTextNode(value)
    paragraph.append(text)
    $getRoot().clear().append(paragraph)
    if (value)
      text.select(value.length - selected, value.length)
    else
      paragraph.select()
  }, { discrete: true })
}

async function paste(editor: LexicalEditor, entries: Record<string, string>, files: File[] = []) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(entries))
    data.setData(type, value)
  for (const file of files)
    data.items.add(file)
  editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
  await flushPromises()
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const documentText = (editor: LexicalEditor) => rootChildren(editor).map(textOf).join('\n')
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}

describe('isMarkdown', () => {
  it.each([
    ['# Title'],
    ['```ts\nconst a = 1\n```'],
    ['![cat](https://example.com/a.png)'],
    ['see [docs](https://example.com) here'],
    ['- [ ] todo'],
    ['**bold** and `code`'],
    ['- one\n- two\n\n> a quote'],
    ['- one\n- two'],
    ['* one\n* two\n* three'],
    ['+ one\n\n+ two'],
    ['1. one\n2. two'],
  ])('accepts %j', (text) => {
    expect(isMarkdown(text)).toBe(true)
  })

  it.each([
    ['Plain prose without any syntax.'],
    ['First paragraph.\n\nSecond paragraph.'],
    ['a * b * c'],
    ['just `one` code span in a sentence'],
    ['**only bold**'],
    ['- just one item'],
    ['1. just one item'],
    ['- one\nnot an item'],
    ['call arr[i](x) here'],
    ['#hashtag is not a heading'],
    ['https://example.com'],
  ])('rejects %j', (text) => {
    expect(isMarkdown(text)).toBe(false)
  })
})

describe('hasRichHtml', () => {
  it('sees formatting tags but not bare spans or VS Code markup', () => {
    expect(hasRichHtml('<p><strong>a</strong></p>')).toBe(true)
    expect(hasRichHtml('<span>a</span>')).toBe(false)
    expect(hasRichHtml('<div data-vscode-x="1"><b>a</b></div>')).toBe(false)
    expect(hasRichHtml('')).toBe(false)
  })
})

describe('pasting markdown', () => {
  const MARKDOWN = '# Title\n\n- one\n- two\n\nSome **bold** text'

  it('converts it into nodes without leaving markdown syntax', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': MARKDOWN })

    const nodes = rootChildren(editor)
    expect(nodes.map(node => node.type)).toEqual(['heading', 'list', 'paragraph'])
    expect(find(nodes, 'listitem')).toHaveLength(2)
    expect(find(nodes, 'text').find(node => node.text === 'bold')?.format).toBe(1)
    expect(documentText(editor)).not.toMatch(/[#*]/)
  })

  it('undoes in one step', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'before')
    await flushPromises()
    await paste(editor, { 'text/plain': MARKDOWN })
    expect(rootChildren(editor).length).toBeGreaterThan(1)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(rootChildren(editor).map(textOf)).toEqual(['before'])
  })

  it.each([
    ['bullet', '- one\n- two', 'bullet'],
    ['numbered', '1. one\n2. two', 'number'],
  ])('converts a plain %s list', async (_name, markdown, listType) => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': markdown })
    const [list] = find(rootChildren(editor), 'list')
    expect(list.listType).toBe(listType)
    expect(find([list], 'listitem').map(textOf)).toEqual(['one', 'two'])
  })

  it('keeps relative links', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': '# Title\n\n[docs](/docs)' })
    expect(find(rootChildren(editor), 'link')[0]?.url).toBe('/docs')
  })

  it('accepts Windows line endings', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': '# Title\r\n\r\nBody' })
    expect(rootChildren(editor).map(node => node.type)).toEqual(['heading', 'paragraph'])
  })

  it('leaves plain text to the default paste', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    const prose = 'Plain prose with a * b and `one` code span.'
    await paste(editor, { 'text/plain': prose })
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph'])
    expect(documentText(editor)).toBe(prose)
  })

  it('keeps out of Lexical clipboard data', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, {
      'text/plain': MARKDOWN,
      'application/x-lexical-editor': JSON.stringify({ namespace: 'other', nodes: [] }),
    })
    expect(find(rootChildren(editor), 'heading')).toHaveLength(0)
  })

  it('keeps out of rich HTML', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, {
      'text/plain': MARKDOWN,
      'text/html': '<p><strong>from a web page</strong></p>',
    })
    expect(documentText(editor)).toContain('from a web page')
    expect(find(rootChildren(editor), 'heading')).toHaveLength(0)
  })

  it('keeps out of image files', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': MARKDOWN }, [
      new File(['x'], 'a.png', { type: 'image/png' }),
    ])
    expect(find(rootChildren(editor), 'heading')).toHaveLength(0)
    expect(find(rootChildren(editor), 'image')).toHaveLength(0)
  })

  it('never produces unsafe links or images, and keeps the text', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': '# Title\n\n[evil](javascript:alert(1))\n\n![bad](javascript:alert(2))' })
    await flushPromises()

    const nodes = rootChildren(editor)
    expect(find(nodes, 'image')).toHaveLength(0)
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
    expect(document.querySelector('img[src^="javascript"]')).toBeNull()
    expect(documentText(editor)).toContain('evil')
    expect(find(nodes, 'link')).toHaveLength(0)
    expect(documentText(editor)).toContain('[evil](javascript:alert(1))')
    expect(documentText(editor)).toContain('![bad](javascript:alert(2))')
  })
})

describe('pasting from VS Code', () => {
  const VSCODE = JSON.stringify({ mode: 'typescript' })
  const CODE = '# not a heading\nconst a = 1'

  it('inserts a code block with the language and exact text', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': CODE, 'vscode-editor-data': VSCODE })

    const [block] = find(rootChildren(editor), 'code-block')
    // Code blocks store the normalized id of the language.
    expect(block.language).toBe('ts')
    expect(block.code).toBe(CODE)
    expect(find(rootChildren(editor), 'heading')).toHaveLength(0)
  })

  it('undoes in one step', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'before')
    await flushPromises()
    await paste(editor, { 'text/plain': CODE, 'vscode-editor-data': VSCODE })
    expect(find(rootChildren(editor), 'code-block')).toHaveLength(1)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'code-block')).toHaveLength(0)
    expect(rootChildren(editor).map(textOf)).toEqual(['before'])
  })

  it('falls back to the default paste on malformed data', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await paste(editor, { 'text/plain': 'plain', 'vscode-editor-data': '{oops' })
    expect(find(rootChildren(editor), 'code-block')).toHaveLength(0)
    expect(documentText(editor)).toBe('plain')
  })
})

describe('pasting a URL over a selection', () => {
  it('turns the selected text into a link, and undo removes it', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'read docs', 4)
    await flushPromises()
    await paste(editor, { 'text/plain': 'https://example.com' })

    const [link] = find(rootChildren(editor), 'link')
    expect(link.url).toBe('https://example.com')
    expect(textOf(link)).toBe('docs')
    expect(documentText(editor)).toBe('read docs')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'link')).toHaveLength(0)
    expect(documentText(editor)).toBe('read docs')
  })

  it('does not link to an unsafe URL', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'read docs', 4)
    await paste(editor, { 'text/plain': 'javascript:alert(1)' })
    expect(find(rootChildren(editor), 'link')).toHaveLength(0)
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })
})
