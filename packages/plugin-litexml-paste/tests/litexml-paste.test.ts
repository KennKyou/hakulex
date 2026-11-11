import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { LiteXmlPastePlugin } from '../src'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  [key: string]: unknown
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function text(value: string) {
  return {
    type: 'text',
    text: value,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}
function paragraph(...children: unknown[]) {
  return {
    type: 'paragraph',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
  }
}
function content(...children: unknown[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

function mountEditor(options: { modelValue?: unknown, nested?: boolean } = {}) {
  const saved: SerializedEditorState[] = []
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': options.modelValue,
      'onUpdate:modelValue': (value: SerializedEditorState) => saved.push(value),
    } as never,
    attachTo: document.body,
    slots: {
      default: () => h(LiteXmlPastePlugin),
      ...(options.nested
        ? {
            nested: () => h(LiteXmlPastePlugin),
          }
        : {}),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor, saved }
}

/** One paragraph, with the caret after `before`. */
function setParagraph(editor: LexicalEditor, before: string, after = '') {
  editor.update(() => {
    const node = $createParagraphNode()
    const textNode = $createTextNode(before + after)
    node.append(textNode)
    $getRoot().clear().append(node)
    textNode.select(before.length, before.length)
  }, { discrete: true })
}

async function paste(editor: LexicalEditor, entries: Record<string, string>, files: File[] = []) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(entries))
    data.setData(type, value)
  for (const file of files)
    data.items.add(file)
  const event = new ClipboardEvent('paste', { clipboardData: data, cancelable: true })
  editor.dispatchCommand(PASTE_COMMAND, event)
  await flushPromises()
  return event
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}

const XML = '<alert type="note"><p>注意</p></alert><codeblock lang="ts">const a = 1</codeblock><p>結尾 <b>粗體</b></p>'

describe('pasting LiteXML', () => {
  it('inserts its blocks at the caret, and undo takes them all out', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '前面', '後面')
    await flushPromises()
    const before = JSON.stringify(editor.getEditorState().toJSON())
    const event = await paste(editor, { 'text/plain': XML })

    expect(event.defaultPrevented).toBe(true)
    const nodes = rootChildren(editor)
    const types = nodes.map(node => node.type)
    expect(types.indexOf('alert-quote')).toBeGreaterThanOrEqual(0)
    expect(types.indexOf('code-block')).toBeGreaterThan(types.indexOf('alert-quote'))
    expect(nodes.find(node => node.type === 'alert-quote')?.alertType).toBe('note')
    expect(textOf(nodes.find(node => node.type === 'alert-quote')!)).toBe('注意')
    expect(nodes.find(node => node.type === 'code-block')).toMatchObject({ language: 'ts', code: 'const a = 1' })
    const all = nodes.map(textOf).join('\n')
    expect(all).toContain('前面')
    expect(all).toContain('後面')
    expect(all).toContain('結尾 粗體')
    expect(find(nodes, 'text').find(node => node.text === '粗體')?.format).toBe(1)
    expect(all.indexOf('前面')).toBeLessThan(all.indexOf('注意'))
    expect(all.indexOf('結尾')).toBeLessThan(all.indexOf('後面'))

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(before)
  })

  it('leaves Lexical\'s own content, images and ordinary text to the other handlers', async () => {
    const { editor } = mountEditor()
    for (const [entries, files] of [
      [
        { 'text/plain': XML, 'application/x-lexical-editor': '{"nodes":[]}' },
        [],
      ],
      [
        { 'text/plain': XML },
        [
          new File(['x'], 'a.png', { type: 'image/png' }),
        ],
      ],
      [
        { 'text/plain': '<div>hi</div>' },
        [],
      ],
      [
        { 'text/plain': 'a < b && c > d' },
        [],
      ],
    ] as [Record<string, string>, File[]][]) {
      setParagraph(editor, 'x')
      await flushPromises()
      await paste(editor, entries, files)
      expect(find(rootChildren(editor), 'alert-quote')).toHaveLength(0)
    }
    setParagraph(editor, '')
    await flushPromises()
    await paste(editor, { 'text/plain': 'a < b && c > d' })
    expect(rootChildren(editor).map(textOf).join('')).toBe('a < b && c > d')
  })

  it('wins over Markdown paste: Markdown inside a code block stays as it is', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '')
    await flushPromises()
    const markdown = '# 標題\n\n```js\nx\n```\n- a\n- b'
    await paste(editor, { 'text/plain': `<codeblock lang="md">${markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</codeblock>` })
    const nodes = rootChildren(editor)
    expect(find(nodes, 'heading')).toHaveLength(0)
    expect(find(nodes, 'list')).toHaveLength(0)
    expect(find(nodes, 'code-block')[0]).toMatchObject({ language: 'md', code: markdown })
  })

  it('pastes the text as it is when reading it fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor()
    setParagraph(editor, '')
    await flushPromises()
    const broken = '<alert type="note"><p>x</p></alert><node type="x" data="{not json" />'
    await paste(editor, { 'text/plain': broken })
    expect(rootChildren(editor).map(textOf).join('')).toContain('<node type="x"')
    expect(error).toHaveBeenCalled()
  })

  it('keeps nodes this editor has no type for, and stores them as they were', async () => {
    const { editor, saved } = mountEditor()
    setParagraph(editor, '')
    await flushPromises()
    await paste(editor, { 'text/plain': '<excalidraw><![CDATA[{"elements":[]}]]></excalidraw><node type="unknown-x" data=\'{"a":1}\' />' })
    await flushPromises()
    const stored = saved.at(-1)!.root.children as Json[]
    expect(stored.find(node => node.type === 'excalidraw')).toEqual({ type: 'excalidraw', snapshot: '{"elements":[]}', version: 1 })
    expect(stored.find(node => node.type === 'unknown-x')).toEqual({ type: 'unknown-x', a: 1, version: 1 })
  })

  it('pastes inside a step when it is in the nested slot too', async () => {
    const { editor } = mountEditor({
      nested: true,
      modelValue: content(paragraph(text('外')), {
        type: 'steps',
        version: 1,
        steps: [
          {
            id: 's_a',
            title: '甲',
            content: content(paragraph()),
          },
        ],
      }),
    })
    await flushPromises()
    const nestedRoot = document.querySelector<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-step-content [data-lexical-editor]')!
    const nested = nestedRoot.__lexicalEditor
    const outerBefore = JSON.stringify(rootChildren(editor).filter(node => node.type !== 'steps'))
    nested.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    await paste(nested, { 'text/plain': '<alert type="tip"><p>步驟裡</p></alert>' })
    expect(find(rootChildren(nested), 'alert-quote')).toHaveLength(1)
    expect(JSON.stringify(rootChildren(editor).filter(node => node.type !== 'steps'))).toBe(outerBefore)

    nested.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(nested), 'alert-quote')).toHaveLength(0)
  })
})
