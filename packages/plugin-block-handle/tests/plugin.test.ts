import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_DOWN_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { BlockHandlePlugin, gapAfter } from '../src'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function mountWithPlugin(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props,
    attachTo: document.body,
    slots: {
      default: () => h(BlockHandlePlugin),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const lines = (editor: LexicalEditor) => rootChildren(editor).map(textOf)
const types = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
const dom = (editor: LexicalEditor) => editor.getRootElement()!

async function withParagraphs(editor: LexicalEditor, ...values: string[]) {
  editor.update(() => {
    const root = $getRoot().clear()
    for (const value of values) {
      root.append($createParagraphNode().append(...(value
        ? [
            $createTextNode(value),
          ]
        : [])))
    }
  }, { discrete: true })
  await flushPromises()
}

async function hover(element: Element) {
  element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
  await flushPromises()
}

const grip = () => document.querySelector<HTMLButtonElement>('.hlx-block-grip')
const plus = () => document.querySelector<HTMLButtonElement>('.hlx-block-add')
const line = () => document.querySelector<HTMLElement>('.hlx-block-drop-line')
const menu = () => document.querySelector<HTMLElement>('.hlx-block-menu')
function item(name: string) {
  return [
    ...document.querySelectorAll<HTMLElement>('.hlx-block-menu [role^="menuitem"]'),
  ].find(el => el.textContent?.trim() === name)
}

async function openMenuFor(element: Element) {
  await hover(element)
  grip()!.click()
  await flushPromises()
}

async function choose(name: string) {
  item(name)!.click()
  await flushPromises()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('showing the handle', () => {
  it('appears on hover without touching the document, and goes away after a moment', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    const before = editor.getEditorState().toJSON()
    expect(grip()).toBeNull()

    await hover(dom(editor).children[1])
    expect(grip()).not.toBeNull()
    expect(plus()).not.toBeNull()
    expect(editor.getEditorState().toJSON()).toEqual(before)

    vi.useFakeTimers()
    dom(editor).dispatchEvent(new MouseEvent('mouseleave'))
    document.querySelector('.hlx-block-handle')!.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()
    expect(grip()).not.toBeNull()

    document.querySelector('.hlx-block-handle')!.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()
    expect(grip()).toBeNull()
  })

  it('marks the block it is beside, and only that one, so a heading\'s badge can give way', async () => {
    const { wrapper, editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    const [first, second] = [
      ...dom(editor).children,
    ]
    const marked = () => [
      ...dom(editor).querySelectorAll('[data-hlx-handle]'),
    ]
    const before = editor.getEditorState().toJSON()
    expect(marked()).toEqual([])

    await hover(first)
    expect(marked()).toEqual([first])
    await hover(second)
    expect(marked()).toEqual([second])

    vi.useFakeTimers()
    dom(editor).dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()
    expect(marked()).toEqual([])
    vi.useRealTimers()

    await hover(first)
    expect(marked()).toEqual([first])
    // Only the page shows it: the document is untouched.
    expect(editor.getEditorState().toJSON()).toEqual(before)
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(marked()).toEqual([])
  })

  it('follows the top-level block from inside nested content', async () => {
    const { editor } = mountWithPlugin({
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'alert-quote',
              version: 1,
              format: '',
              indent: 0,
              direction: null,
              alertType: 'note',
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
                      type: 'text',
                      version: 1,
                      text: '提示',
                      format: 0,
                      style: '',
                      mode: 'normal',
                      detail: 0,
                    },
                  ],
                },
              ],
            },
            {
              type: 'paragraph',
              version: 1,
              format: '',
              indent: 0,
              direction: null,
              textFormat: 0,
              textStyle: '',
              children: [],
            },
          ],
        },
      } as unknown as SerializedEditorState,
    })
    await flushPromises()
    await openMenuFor(dom(editor).querySelector('.hlx-callout-body p')!)
    await choose('下移')
    expect(types(editor)).toEqual(['paragraph', 'alert-quote'])
  })

  it('is not there for footnotes', async () => {
    const { editor } = mountWithPlugin({
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'footnote-section',
              version: 1,
              definitions: { 1: '內容' },
            },
          ],
        },
      } as unknown as SerializedEditorState,
    })
    await flushPromises()
    await hover(dom(editor).querySelector('.hlx-footnote-host')!)
    expect(grip()).toBeNull()
  })

  it('is not there while read-only, and goes away on becoming so', async () => {
    const { editor, wrapper } = mountWithPlugin()
    await withParagraphs(editor, '一')
    await hover(dom(editor).children[0])
    expect(grip()).not.toBeNull()

    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(grip()).toBeNull()
    await hover(dom(editor).children[0])
    expect(grip()).toBeNull()
  })
})

describe('the menu', () => {
  it('moves, and undoes in one step', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二', '三')
    await openMenuFor(dom(editor).children[1])
    expect(menu()).not.toBeNull()

    await choose('上移')
    expect(lines(editor)).toEqual(['二', '一', '三'])
    expect(menu()).toBeNull()
    await undo(editor)
    expect(lines(editor)).toEqual(['一', '二', '三'])
  })

  it('duplicates and deletes the block it opened on', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    await openMenuFor(dom(editor).children[0])
    await hover(dom(editor).children[1])
    await choose('複製')
    expect(lines(editor)).toEqual(['一', '一', '二'])

    await openMenuFor(dom(editor).children[2])
    await choose('刪除')
    expect(lines(editor)).toEqual(['一', '一'])
  })

  it('disables moves that can not happen', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    await openMenuFor(dom(editor).children[0])
    expect(item('上移')!.hasAttribute('data-disabled')).toBe(true)
    expect(item('下移')!.hasAttribute('data-disabled')).toBe(false)
  })

  it('offers types for a paragraph, marking the current one, and not for an image', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一')
    await openMenuFor(dom(editor).children[0])
    expect(item('段落')!.getAttribute('aria-checked')).toBe('true')
    await choose('標題 2')
    expect(types(editor)).toEqual(['heading'])

    const other = mountWithPlugin({
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'image',
              version: 1,
              src: 'https://example.com/a.png',
              altText: '',
            },
          ],
        },
      } as unknown as SerializedEditorState,
    }).editor
    await flushPromises()
    await openMenuFor(dom(other).querySelector('.hlx-image-block')!)
    expect(item('段落')).toBeUndefined()
    expect(item('複製')).not.toBeUndefined()
  })
})

describe('adding a line', () => {
  it('adds a paragraph below, with the caret in it, in one undo step', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    await hover(dom(editor).children[0])
    plus()!.click()
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '', '二'])
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('新')
    }, { discrete: true })
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '新', '二'])
  })

  it.each([
    [
      'below',
      ['一', '', '二'],
      0,
    ],
    [
      'itself',
      ['一', '', '二'],
      1,
    ],
  ])('reuses an empty line %s', async (_name, values, index) => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, ...values)
    await hover(dom(editor).children[index])
    plus()!.click()
    await flushPromises()
    expect(lines(editor)).toEqual(values)
    expect(editor.getEditorState().read(() => $getSelection()?.getNodes()[0].getKey())).toBe(editor.getEditorState().read(() => $getRoot().getChildAtIndex(1)!.getKey()))
  })
})

describe('dragging', () => {
  it('finds the gap nearest the pointer', () => {
    const blocks = [
      { key: 'a', top: 0, bottom: 20 },
      { key: 'b', top: 20, bottom: 40 },
      { key: 'c', top: 40, bottom: 60 },
    ]
    expect(gapAfter(blocks, -5)).toEqual({ after: null, y: 0 })
    expect(gapAfter(blocks, 5)).toEqual({ after: null, y: 0 })
    expect(gapAfter(blocks, 15)).toEqual({ after: 'a', y: 20 })
    expect(gapAfter(blocks, 35)).toEqual({ after: 'b', y: 40 })
    expect(gapAfter(blocks, 100)).toEqual({ after: 'c', y: 60 })
  })

  function dragEvent(type: string, clientY: number, bubbles = true) {
    const event = new Event(type, { bubbles, cancelable: true }) as DragEvent
    Object.defineProperties(event, {
      clientY: { value: clientY },
      clientX: { value: 10 },
      dataTransfer: {
        value: {
          setData: () => {},
          setDragImage: () => {},
          types: ['text/plain'],
          effectAllowed: '',
          dropEffect: '',
        },
      },
    })
    return event
  }

  /** happy-dom has no layout, so each block gets a place by hand. */
  function layOut(editor: LexicalEditor) {
    const root = dom(editor)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 60,
      left: 0,
      right: 100,
      width: 100,
      height: 60,
    } as DOMRect)
    ;[...root.children].forEach((child, index) => {
      vi.spyOn(child, 'getBoundingClientRect').mockReturnValue({
        top: index * 20,
        bottom: index * 20 + 20,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
      } as DOMRect)
    })
  }

  it('shows a line and moves on drop, in one undo step', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二', '三')
    layOut(editor)
    await hover(dom(editor).children[0])
    grip()!.dispatchEvent(dragEvent('dragstart', 5))
    await flushPromises()

    dom(editor).dispatchEvent(dragEvent('dragover', 55))
    await flushPromises()
    expect(line()).not.toBeNull()

    dom(editor).dispatchEvent(dragEvent('drop', 55))
    await flushPromises()
    expect(lines(editor)).toEqual(['二', '三', '一'])
    expect(line()).toBeNull()

    await undo(editor)
    expect(lines(editor)).toEqual(['一', '二', '三'])
  })

  it('does nothing for a drop in place, or when cancelled, or outside', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    layOut(editor)
    const before = editor.getEditorState().toJSON()

    await hover(dom(editor).children[0])
    grip()!.dispatchEvent(dragEvent('dragstart', 5))
    dom(editor).dispatchEvent(dragEvent('dragover', 15))
    await flushPromises()
    dom(editor).dispatchEvent(dragEvent('drop', 15))
    await flushPromises()
    expect(editor.getEditorState().toJSON()).toEqual(before)

    await hover(dom(editor).children[0])
    grip()!.dispatchEvent(dragEvent('dragstart', 5))
    dom(editor).dispatchEvent(dragEvent('dragover', 35))
    await flushPromises()
    grip()!.dispatchEvent(dragEvent('dragend', 35))
    await flushPromises()
    expect(line()).toBeNull()
    expect(editor.getEditorState().toJSON()).toEqual(before)

    await hover(dom(editor).children[0])
    grip()!.dispatchEvent(dragEvent('dragstart', 5))
    document.body.dispatchEvent(dragEvent('dragover', 500))
    await flushPromises()
    expect(line()).toBeNull()
    document.body.dispatchEvent(dragEvent('drop', 500))
    await flushPromises()
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })

  it('leaves other drags alone', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    layOut(editor)
    const over = dragEvent('dragover', 15)
    dom(editor).dispatchEvent(over)
    await flushPromises()
    expect(line()).toBeNull()
    expect(over.defaultPrevented).toBe(false)
  })
})

describe('shortcuts', () => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  function press(editor: LexicalEditor, key: string, shift = false, target?: Element) {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey: shift,
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    })
    if (target)
      target.dispatchEvent(event)
    else
      dom(editor).dispatchEvent(event)
    return event
  }

  function selectAcross(editor: LexicalEditor, from: number, to: number) {
    editor.update(() => {
      const texts = $getRoot().getAllTextNodes()
      const focus = texts[to]
      focus.select(1, 1).anchor.set(texts[from].getKey(), 0, 'text')
    }, { discrete: true })
  }

  it('moves and duplicates the selected blocks, keeping the selection, stopping the browser', async () => {
    const { editor } = mountWithPlugin()
    await withParagraphs(editor, '一', '二', '三', '四')
    dom(editor).focus()
    selectAcross(editor, 1, 2)
    await flushPromises()

    let event = press(editor, 'ArrowUp', true)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(lines(editor)).toEqual(['二', '三', '一', '四'])
    expect(editor.getEditorState().read(() => $getSelection()?.getTextContent())).toContain('二')

    press(editor, 'ArrowDown', true)
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '二', '三', '四'])

    event = press(editor, 'd')
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(lines(editor)).toEqual(['一', '二', '三', '二', '三', '四'])
  })

  it('leaves arrows without shift, and everything while read-only, alone', async () => {
    const { editor, wrapper } = mountWithPlugin()
    await withParagraphs(editor, '一', '二')
    dom(editor).focus()
    selectAcross(editor, 1, 1)
    await flushPromises()
    expect(press(editor, 'ArrowUp').defaultPrevented).toBe(false)
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '二'])

    await wrapper.setProps({ editable: false })
    await flushPromises()
    editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'd', metaKey: isMac, ctrlKey: !isMac }))
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '二'])
  })

  it('ignores keys meant for an input inside a block', async () => {
    const { editor } = mountWithPlugin({
      modelValue: {
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
                  type: 'text',
                  version: 1,
                  text: '甲',
                  format: 0,
                  style: '',
                  mode: 'normal',
                  detail: 0,
                },
                { type: 'footnote', version: 1, identifier: '1' },
              ],
            },
            {
              type: 'footnote-section',
              version: 1,
              definitions: { 1: '內容' },
            },
          ],
        },
      } as unknown as SerializedEditorState,
    })
    await flushPromises()
    const before = editor.getEditorState().toJSON()
    const input = dom(editor).querySelector('.hlx-footnote-input')!
    press(editor, 'd', false, input)
    await flushPromises()
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })
})
