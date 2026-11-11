import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { KEY_ENTER_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichEditor } from '../src'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function paragraph() {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}
function doc(node: unknown) {
  return ({
    root: {
      ...element,
      type: 'root',
      children: [
        node,
        paragraph(),
      ],
    },
  }) as unknown as SerializedEditorState
}

const BLOCKS = {
  'code-snippet': {
    type: 'code-snippet',
    version: 1,
    files: [
      { filename: 'a.ts', code: 'x' },
    ],
  },
  'gallery': {
    type: 'gallery',
    version: 1,
    layout: 'grid',
    images: [
      { src: 'https://example.com/a.png' },
    ],
  },
  'chat': {
    type: 'chat',
    version: 1,
    messages: [
      { role: 'user', content: '嗨' },
    ],
  },
  'link-card': {
    type: 'link-card',
    version: 1,
    url: 'https://example.com/post',
    title: '文章',
  },
  'poll': {
    type: 'poll',
    version: 1,
    pollId: 'p1',
    question: '午餐？',
    options: [
      { id: 'a', label: '飯' },
      { id: 'b', label: '麵' },
    ],
    mode: 'single',
  },
} as const
const TITLES: Record<keyof typeof BLOCKS, string> = {
  'code-snippet': '程式碼片段',
  'gallery': '圖庫',
  'chat': '對話',
  'link-card': '連結卡片',
  'poll': '投票',
}

async function editorWith(type: keyof typeof BLOCKS, editable = true) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: doc(BLOCKS[type]),
      editable,
    } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}
const block = () => document.querySelector<HTMLElement>('.hlx-block-editor')!
const toolbar = () => document.querySelector<HTMLElement>('.hlx-block-toolbar')
const dialog = () => document.querySelector('.hlx-block-dialog')
// Where each block is edited: a dialog, or a panel beside it.
const EDITING: Record<keyof typeof BLOCKS, string> = {
  'code-snippet': '.hlx-block-dialog',
  'gallery': '.hlx-block-dialog',
  'chat': '.hlx-block-dialog',
  'link-card': '.hlx-block-panel[aria-label="連結卡片"]',
  'poll': '.hlx-block-panel[aria-label="投票"]',
}
const editing = (type: keyof typeof BLOCKS) => document.querySelector(EDITING[type])
function inside() {
  // A part of the block that is no button or link: what a press on the block hits.
  return [
    ...block().querySelectorAll<HTMLElement>('*'),
  ].find(item => !item.closest('button, a, input')) ?? block()
}
async function pick() {
  inside().click()
  await flushPromises()
}

describe.each(Object.keys(BLOCKS) as (keyof typeof BLOCKS)[])('a %s block', (type) => {
  it('shows a toolbar with 編輯 once picked, and no edit button of its own', async () => {
    await editorWith(type)
    expect(toolbar()).toBeNull()
    expect(block().querySelector('.hlx-block-edit--floating, .hlx-snippet-edit')).toBeNull()
    await pick()
    expect(toolbar()!.getAttribute('aria-label')).toBe(TITLES[type])
    expect(toolbar()!.querySelector('button')!.textContent!.trim()).toBe('編輯')
    expect(editing(type)).toBeNull()
  })

  it('starts editing from the toolbar', async () => {
    await editorWith(type)
    await pick()
    toolbar()!.querySelector('button')!.click()
    await flushPromises()
    await flushPromises()
    expect(editing(type)).not.toBeNull()
  })

  it('starts editing on a double click, and with Enter once picked', async () => {
    const editor = await editorWith(type)
    inside().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushPromises()
    await flushPromises()
    expect(editing(type)).not.toBeNull()
    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    document.body.innerHTML = ''
    const again = await editorWith(type)
    await pick()
    again.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    await flushPromises()
    expect(editing(type)).not.toBeNull()
    expect(editor).toBeDefined()
  })

  it('has no toolbar and opens nothing when read-only', async () => {
    await editorWith(type, false)
    await pick()
    inside().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushPromises()
    expect(toolbar()).toBeNull()
    expect(editing(type)).toBeNull()
  })
})

describe('a link card\'s toolbar', () => {
  it('opens the link in a new tab, leaving the document as it is', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await editorWith('link-card')
    await pick()
    const button = [
      ...toolbar()!.querySelectorAll('button'),
    ].find(item => item.textContent!.trim() === '開啟連結')!
    button.click()
    expect(open).toHaveBeenCalledWith('https://example.com/post', '_blank', 'noopener,noreferrer')
    expect(dialog()).toBeNull()
  })
})
