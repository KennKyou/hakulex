import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_DELETE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $isChartNode, builtinTransformers, OPEN_BLOCK_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
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
function paragraph(...children: unknown[]) {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children,
  }
}
function documentWith(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}
// Stored compactly and with keys in an odd order: unedited, it must come back exactly so.
const stored = `{"x":"part","type":"bar","version":1,"title":"Commits","series":[{"key":"before","label":"Before"},{"key":"after"}],"data":[{"part":"Editor","before":48,"after":12},{"part":"A|B","before":36,"after":null}]}`
function chart(value: unknown = stored, extra: Record<string, unknown> = {}) {
  return {
    type: 'chart',
    version: 1,
    spec: value,
    ...extra,
  }
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()) as unknown as { root: { children: Json[] } }
const charts = (editor: LexicalEditor) => output(editor).root.children.filter(node => node.type === 'chart')
describe('stored charts', () => {
  it('outputs the spec string exactly as stored', async () => {
    const value = documentWith(chart(stored, {
      $: { blockId: 'abc' },
      extra: 1,
    }))
    const { editor, wrapper } = await mountEditor(value)
    expect(output(editor)).toEqual(value)
    expect(wrapper.findAll('.hlx-chart-svg')).toHaveLength(2)
  })

  it.each([
    ['not JSON', '{ nope'],
    ['an invalid spec', '{"type":"radar"}'],
    ['not a string', 42],
    ['missing', undefined],
  ])('shows an error card for %s, and keeps it', async (_name, value) => {
    const document_ = documentWith(value === undefined
      ? { type: 'chart', version: 1 }
      : chart(value))
    const { editor, wrapper } = await mountEditor(document_)
    expect(wrapper.find('.hlx-chart-error').exists()).toBe(true)
    expect(JSON.parse(JSON.stringify(output(editor)))).toEqual(JSON.parse(JSON.stringify(document_)))
  })

  it('has no edit button or toolbar when read-only', async () => {
    const { wrapper } = await mountEditor(documentWith(chart()), { editable: false })
    expect(wrapper.find('.hlx-chart').exists()).toBe(true)
    expect(wrapper.find('.hlx-block-edit').exists()).toBe(false)
    expect(document.querySelector('.hlx-chart-toolbar')).toBeNull()
  })
})

describe('inserting a chart', () => {
  it('puts an example chart in straight away, picked, with its panel open, as one undo step', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'chart' })
    await flushPromises()
    expect(document.querySelector('.hlx-block-dialog')).toBeNull()
    const [node] = charts(editor)
    expect(JSON.parse(node.spec)).toMatchObject({ version: 1, type: 'bar' })
    expect(node.spec).toBe(JSON.stringify(JSON.parse(node.spec), null, 2))
    expect(editor.read(() => {
      const selection = $getSelection()
      return $isNodeSelection(selection) && $isChartNode(selection.getNodes()[0])
    })).toBe(true)
    expect(document.querySelector('.hlx-chart-panel')).not.toBeNull()
    // Placed by the chart, and put away by a press elsewhere, though it was open from the start.
    expect(document.querySelector<HTMLElement>('.hlx-chart-popover')!.style.top).not.toBe('')
    expect(document.querySelector<HTMLElement>('.hlx-chart-toolbar')!.style.top).not.toBe('')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.hlx-chart-panel')).toBeNull()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(charts(editor)).toHaveLength(0)
  })
})

describe('charts as blocks', () => {
  it('can be selected by keyboard, deleted and restored', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), chart(), paragraph(text('後'))))
    editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
    editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }))
    await flushPromises()
    expect(charts(editor)).toHaveLength(0)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(charts(editor)).toHaveLength(1)
  })

  it('can be inserted in nested content', async () => {
    const value = documentWith({
      type: 'nested-doc',
      version: 1,
      content: documentWith(paragraph()),
    })
    const { editor } = await mountEditor(value)
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    inner.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'chart' })
    await flushPromises()
    expect(JSON.stringify(output(editor))).toContain('"chart"')
  })
})

describe('exporting a chart', () => {
  const markdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

  it('goes to markdown as a table, and an invalid one as JSON', async () => {
    const { editor } = await mountEditor(documentWith(chart(), chart('{ nope')))
    expect(markdown(editor)).toBe([
      '| part | Before | after |',
      '| --- | --- | --- |',
      '| Editor | 48 | 12 |',
      '| A\\|B | 36 |  |',
      '',
      '```json',
      '{ nope',
      '```',
    ].join('\n'))
  })

  it('goes to HTML as a titled table', async () => {
    const { editor } = await mountEditor(documentWith(chart()))
    const html = editor.read(() => $generateHtmlFromNodes(editor))
    expect(html).toContain('<table')
    expect(html).toContain('<caption>Commits</caption>')
    expect(html).toContain('<th>Before</th>')
    expect(html).toContain('<td>48</td>')
  })
})
