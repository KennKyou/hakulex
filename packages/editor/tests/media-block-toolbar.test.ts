import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { KEY_ENTER_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { RichEditor } from '../src'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
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
function doc(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}

/* What each block is, what picks it, what its editing looks like, and its toolbar's name. */
const CASES = {
  'image': {
    doc: () => doc({
      type: 'image',
      version: 1,
      src: 'https://example.com/a.png',
      altText: 'a',
    }, paragraph()),
    target: '.hlx-image-editor',
    editing: '.hlx-block-panel[aria-label="圖片"]',
    label: '圖片',
  },
  'video': {
    doc: () => doc({ type: 'video', version: 1, src: 'https://example.com/a.webm' }, paragraph()),
    target: '.hlx-media-editor',
    editing: '.hlx-block-panel[aria-label="影片"]',
    label: '影片',
  },
  'file': {
    doc: () => doc({
      type: 'file',
      version: 1,
      src: 'https://example.com/a.pdf',
      name: 'a.pdf',
      display: 'block',
    }, paragraph()),
    target: '.hlx-media-editor',
    editing: '.hlx-block-panel[aria-label="檔案"]',
    label: '檔案',
  },
  'mermaid': {
    doc: () => doc({ type: 'mermaid', version: 1, diagram: 'graph TD\n  A --> B' }, paragraph()),
    target: '.hlx-mermaid-editor',
    editing: '.hlx-mermaid-dialog',
    label: 'Mermaid 圖表',
  },
  'block math': {
    doc: () => doc({ type: 'katex-block', version: 1, equation: 'x^2' }, paragraph()),
    target: '.hlx-math-editor',
    editing: '.hlx-math-popover',
    label: '數學式',
  },
  'inline math': {
    doc: () => doc(paragraph({ type: 'katex-inline', version: 1, equation: 'y' })),
    target: '.hlx-math-editor',
    editing: '.hlx-math-popover',
    label: '數學式',
  },
} as const

async function editorWith(name: keyof typeof CASES, editable = true) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: CASES[name].doc(),
      editable,
    } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}
const target = (name: keyof typeof CASES) => document.querySelector<HTMLElement>(CASES[name].target)!
const toolbar = () => document.querySelector<HTMLElement>('.hlx-block-toolbar')
const editing = (name: keyof typeof CASES) => document.querySelector(CASES[name].editing)
async function settle() {
  await flushPromises()
  await flushPromises()
}

describe.each(Object.keys(CASES) as (keyof typeof CASES)[])('a %s', (name) => {
  it('is only picked by a click, and shows a toolbar with 編輯 and no edit button of its own', async () => {
    await editorWith(name)
    target(name).click()
    await settle()
    expect(editing(name)).toBeNull()
    expect(toolbar()!.getAttribute('aria-label')).toBe(CASES[name].label)
    expect(toolbar()!.querySelector('button')!.textContent!.trim()).toBe('編輯')
    expect(document.querySelector('.hlx-image-edit, .hlx-media-edit')).toBeNull()
  })

  it('starts editing from the toolbar', async () => {
    await editorWith(name)
    target(name).click()
    await settle()
    toolbar()!.querySelector('button')!.click()
    await settle()
    expect(editing(name)).not.toBeNull()
  })

  it('starts editing on a double click', async () => {
    await editorWith(name)
    target(name).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await settle()
    expect(editing(name)).not.toBeNull()
  })

  it('starts editing with Enter once picked', async () => {
    const editor = await editorWith(name)
    target(name).click()
    await settle()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await settle()
    expect(editing(name)).not.toBeNull()
  })

  it('has no toolbar and opens nothing when read-only', async () => {
    await editorWith(name, false)
    target(name).click()
    target(name).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await settle()
    expect(toolbar()).toBeNull()
    expect(editing(name)).toBeNull()
  })
})

describe('editing math from its toolbar', () => {
  it('keeps the old equation when the edit is cancelled with Escape', async () => {
    const editor = await editorWith('inline math')
    target('inline math').click()
    await settle()
    toolbar()!.querySelector('button')!.click()
    await settle()
    const input = document.querySelector<HTMLTextAreaElement>('.hlx-math-input')!
    input.value = 'changed'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"equation":"y"')
    expect(document.querySelector('.hlx-math-popover')).toBeNull()
  })
})

describe('a file card, which is a link', () => {
  it('starts editing on a double click on the card itself', async () => {
    await editorWith('file')
    const card = document.querySelector<HTMLElement>('.hlx-media-editor a')!
    expect(card).not.toBeNull()
    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await settle()
    expect(editing('file')).not.toBeNull()
  })
})
