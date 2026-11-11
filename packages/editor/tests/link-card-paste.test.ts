import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

/*
 * An address a link card source knows, pasted on a blank line, becomes a card; a card can go
 * back to being a link. Each is one undo step.
 */

type Json = Record<string, any>

afterEach(() => {
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

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const children = (editor: LexicalEditor) => (serializeEditorState(editor.getEditorState()) as unknown as { root: { children: Json[] } }).root.children
async function paste(editor: LexicalEditor, value: string) {
  const data = new DataTransfer()
  data.setData('text/plain', value)
  editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
  await flushPromises()
}
async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('pasting an address a source knows', () => {
  it('turns a blank line into a card holding only the address, as one undo step', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await paste(editor, '  https://github.com/KennKyou/hakulex  ')
    const cards = children(editor).filter(node => node.type === 'link-card')
    expect(cards).toEqual([
      { type: 'link-card', version: 1, url: 'https://github.com/KennKyou/hakulex' },
    ])
    await undo(editor)
    expect(children(editor).map(node => node.type)).toEqual(['paragraph', 'paragraph'])
    expect(children(editor)[1]!.children).toEqual([])
  })

  it.each([
    ['a YouTube address, which is an embed', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed'],
    ['an address no source knows', 'https://example.com/page', null],
    ['text around an address', 'see https://github.com/KennKyou/hakulex', null],
  ])('leaves %s to the other pastes', async (_name, value, type) => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await paste(editor, value)
    expect(children(editor).some(node => node.type === 'link-card')).toBe(false)
    if (type)
      expect(children(editor).some(node => node.type === type)).toBe(true)
  })

  it('pastes as usual into a line with text', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('看這個 '))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await paste(editor, 'https://github.com/KennKyou/hakulex')
    expect(children(editor).some(node => node.type === 'link-card')).toBe(false)
    expect(JSON.stringify(children(editor))).toContain('https://github.com/KennKyou/hakulex')
  })

  it('makes a card in nested content too', async () => {
    const { editor } = await mountEditor(documentWith({
      type: 'nested-doc',
      version: 1,
      content: documentWith(paragraph()),
    }))
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    await paste(inner, 'https://github.com/KennKyou/hakulex/pull/1')
    expect(JSON.stringify(children(editor))).toContain('"type":"link-card","version":1,"url":"https://github.com/KennKyou/hakulex/pull/1"')
  })

  it('leaves the address alone when the site turned cards off', async () => {
    const { editor } = await mountEditor(documentWith(paragraph()), {
      linkCards: { enabled: false },
    })
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await paste(editor, 'https://github.com/KennKyou/hakulex')
    expect(children(editor).some(node => node.type === 'link-card')).toBe(false)
  })
})

describe('turning a card back into a link', () => {
  async function selected(card: Json) {
    const result = await mountEditor(documentWith(card, paragraph()))
    document.querySelector<HTMLElement>('.hlx-link-card')!.click()
    await flushPromises()
    return result
  }
  const convert = () => [
    ...document.querySelectorAll<HTMLButtonElement>('.hlx-block-toolbar button'),
  ].find(button => button.textContent!.trim() === '轉成連結')

  it.each([
    [
      'its title',
      { title: 'hakulex' },
      'hakulex',
    ],
    ['its address when it has no title', {}, 'https://github.com/KennKyou/hakulex'],
  ])('makes a line holding only the link, reading %s, as one undo step', async (_name, extra, shown) => {
    const card = {
      type: 'link-card',
      version: 1,
      url: 'https://github.com/KennKyou/hakulex',
      ...extra,
    }
    const { editor } = await selected(card)
    convert()!.click()
    await flushPromises()
    const [line] = children(editor)
    expect(line!.type).toBe('paragraph')
    expect(line!.children).toHaveLength(1)
    expect(line!.children[0]).toMatchObject({ type: 'link', url: 'https://github.com/KennKyou/hakulex' })
    expect(line!.children[0].children[0].text).toBe(shown)
    expect(editor.getEditorState().read(() => {
      const selection = $getSelection()
      return selection && !$isNodeSelection(selection) && selection.isCollapsed() && selection.anchor.offset === shown.length
    })).toBe(true)
    await undo(editor)
    expect(children(editor)[0]).toEqual(card)
  })

  it('is not offered when read-only', async () => {
    await mountEditor(documentWith({ type: 'link-card', version: 1, url: 'https://github.com/KennKyou/hakulex' }), { editable: false })
    document.querySelector<HTMLElement>('.hlx-link-card')!.click()
    await flushPromises()
    expect(convert()).toBeUndefined()
  })
})
