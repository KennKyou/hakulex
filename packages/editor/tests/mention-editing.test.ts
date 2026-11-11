import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

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
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}
const octocat = {
  type: 'mention',
  version: 1,
  platform: 'GH',
  handle: 'octocat',
  displayName: 'Octocat',
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const nodes = (editor: LexicalEditor) => (serializeEditorState(editor.getEditorState()).root.children as Json[])[0].children as Json[]
const panel = () => document.querySelector<HTMLElement>('.hlx-mention-panel')
const field = (name: string) => panel()!.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!

async function click(target: Element) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await flushPromises()
}

async function openPanel() {
  await click(document.querySelector('.hlx-mention')!)
  expect(panel()).not.toBeNull()
}

async function setField(name: string, value: string) {
  const input = field(name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function press(key: string, init: KeyboardEventInit = {}) {
  field('handle').dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }))
  await flushPromises()
}

describe('the panel', () => {
  it('opens on a click, showing what the node holds', async () => {
    await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    expect(panel()!.querySelector<HTMLSelectElement>('select')!.value).toBe('GH')
    expect(field('handle').value).toBe('octocat')
    expect(field('displayName').value).toBe('Octocat')
  })

  it('doesn\'t follow the link while editing', async () => {
    await mountEditor(doc(paragraph(octocat)))
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('.hlx-mention a')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps an unknown platform as an option, unchanged', async () => {
    const { editor } = await mountEditor(doc(paragraph({ ...octocat, platform: 'weibo' })))
    await openPanel()
    expect(panel()!.querySelector<HTMLSelectElement>('select')!.value).toBe('weibo')
    await setField('displayName', '名')
    await press('Enter')
    expect(nodes(editor)[0].platform).toBe('weibo')
  })

  it('saves on Enter as one undo step, with the caret after the mention', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat, text('後'))))
    await openPanel()
    const select = panel()!.querySelector('select')!
    select.value = 'TG'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await setField('handle', ' @neo ')
    await setField('displayName', ' 尼歐 ')
    await press('Enter')
    expect(panel()).toBeNull()
    expect(nodes(editor)[0]).toEqual({
      ...octocat,
      platform: 'TG',
      handle: 'neo',
      displayName: '尼歐',
    })
    editor.getEditorState().read(() => {
      const anchor = editor.getEditorState()._selection as any
      expect(anchor.anchor.getNode().getTextContent()).toBe('後')
      expect(anchor.anchor.offset).toBe(0)
    })
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(nodes(editor)[0]).toEqual(octocat)
  })

  it('drops the display name when it is cleared', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    await setField('displayName', '  ')
    await press('Enter')
    expect('displayName' in nodes(editor)[0]).toBe(false)
  })

  it('saves when clicking elsewhere, without moving the caret', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), octocat)))
    await openPanel()
    await setField('handle', 'neo')
    const selectionTags: string[][] = []
    const stop = editor.registerUpdateListener(({ tags }) => selectionTags.push([...tags]))
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    stop()
    expect(panel()).toBeNull()
    expect(nodes(editor)[1].handle).toBe('neo')
    expect(selectionTags.some(tags => tags.includes('skip-dom-selection'))).toBe(true)
  })

  it('throws changes away on Esc', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    await setField('handle', 'neo')
    await press('Escape')
    expect(panel()).toBeNull()
    expect(nodes(editor)[0]).toEqual(octocat)
  })

  it('keeps the old handle when it is cleared', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    await setField('handle', '  @ ')
    await press('Enter')
    expect(nodes(editor)[0].handle).toBe('octocat')
  })

  it('leaves the Enter that picks a word alone', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    await setField('handle', 'neo')
    await press('Enter', { isComposing: true })
    expect(panel()).not.toBeNull()
    expect(nodes(editor)[0].handle).toBe('octocat')
  })

  it('makes no undo step when nothing changed', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    let updates = 0
    const stop = editor.registerUpdateListener(({ dirtyLeaves }) => {
      updates += dirtyLeaves.size
    })
    await press('Enter')
    stop()
    expect(updates).toBe(0)
  })

  it('removes the mention, and undo brings it back', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), octocat, text('後'))))
    await openPanel()
    await click(panel()!.querySelector('[data-action="remove"]')!)
    expect(panel()).toBeNull()
    expect(nodes(editor).map(node => node.text)).toEqual(['前後'])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(nodes(editor)[1]).toEqual(octocat)
  })

  it('opens the link in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await mountEditor(doc(paragraph(octocat)))
    await openPanel()
    await click(panel()!.querySelector('[data-action="open"]')!)
    expect(open).toHaveBeenCalledWith('https://github.com/octocat', '_blank', 'noopener,noreferrer')
  })

  it('has no link to open for an unknown platform', async () => {
    await mountEditor(doc(paragraph({ ...octocat, platform: 'weibo' })))
    await openPanel()
    expect(panel()!.querySelector('[data-action="open"]')).toBeNull()
  })
})

describe('read-only', () => {
  it('doesn\'t open the panel, and the link works', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)), { editable: false })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('.hlx-mention a')!.dispatchEvent(event)
    await flushPromises()
    expect(panel()).toBeNull()
    expect(event.defaultPrevented).toBe(false)
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('@Octocat')
  })
})
