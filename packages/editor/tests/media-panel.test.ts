import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, KEY_ENTER_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_MEDIA_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>
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
function video(extra: Json = {}) {
  return {
    type: 'video',
    version: 1,
    src: 'https://example.com/a.webm',
    poster: 'https://example.com/p.png',
    width: 640,
    height: 360,
    ...extra,
  }
}
function file(extra: Json = {}) {
  return {
    type: 'file',
    version: 1,
    src: 'https://example.com/a.pdf',
    name: 'a.pdf',
    size: 10,
    mimeType: 'application/pdf',
    ext: 'pdf',
    display: 'block',
    ...extra,
  }
}

let editor: LexicalEditor
async function mountWith(node: Json, props: Json = {}) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: {
        root: {
          ...element,
          type: 'root',
          children: [
            paragraph(),
            node,
            paragraph(),
          ],
        },
      } as unknown as SerializedEditorState,
      ...props,
    } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return wrapper
}
// As saved: a field set to undefined is not in the JSON.
const stored = () => JSON.parse(JSON.stringify(serializeEditorState(editor.getEditorState()))).root.children[1] as Json
const block = () => document.querySelector<HTMLElement>('.hlx-media-editor')!
const panel = (label: string) => document.querySelector<HTMLElement>(`.hlx-block-panel[aria-label="${label}"]`)
const anyPanel = () => document.querySelector<HTMLElement>('.hlx-block-panel')
const field = (name: string) => anyPanel()!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const picker = () => anyPanel()?.querySelector<HTMLInputElement>('input[type="file"]') ?? null
const errorText = () => anyPanel()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null
const statusText = () => anyPanel()?.querySelector('[role="status"]')?.textContent?.trim() ?? null
const toolbarEdit = () => document.querySelector<HTMLButtonElement>('.hlx-block-toolbar button')!

async function pick() {
  block().click()
  await flushPromises()
}
async function openPanel() {
  await pick()
  toolbarEdit().click()
  await flushPromises()
}
async function type(name: string, value: string) {
  const target = field(name)
  target.focus()
  target.value = value
  target.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function enter(name: string, value: string) {
  await type(name, value)
  field(name).dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  await flushPromises()
}
async function undo() {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function escape() {
  // Vue drops an event stamped in the same millisecond its listener was attached; a person is never that quick.
  await new Promise(resolve => setTimeout(resolve, 5))
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
}
async function choose(chosen: File) {
  Object.defineProperty(picker()!, 'files', {
    value: [chosen],
    configurable: true,
  })
  picker()!.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

describe('the video panel', () => {
  it('opens beside the video from the toolbar or Enter, filled in, with no dialog', async () => {
    await mountWith(video())
    await openPanel()
    expect(panel('影片')).not.toBeNull()
    expect(document.querySelector('.hlx-media-dialog')).toBeNull()
    expect(field('src').value).toBe('https://example.com/a.webm')
    expect(field('poster').value).toBe('https://example.com/p.png')
    // The pick button would cover the video while it is being edited.
    expect(document.querySelector('.hlx-media-pick')).toBeNull()
    toolbarEdit().click()
    await flushPromises()
    expect(anyPanel()).toBeNull()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(panel('影片')).not.toBeNull()
  })

  it('takes a new address only once entered, dropping the size it no longer describes', async () => {
    await mountWith(video())
    await openPanel()
    await type('src', 'https://example.com/b.we')
    expect(stored().src).toBe('https://example.com/a.webm')
    await enter('src', 'https://example.com/b.webm')
    expect(stored()).toMatchObject({ src: 'https://example.com/b.webm', poster: 'https://example.com/p.png' })
    expect(stored()).not.toHaveProperty('width')
    await undo()
    expect(stored()).toMatchObject({ src: 'https://example.com/a.webm', width: 640 })
  })

  it('refuses an unsafe address or poster, and removes a cleared poster', async () => {
    await mountWith(video())
    await openPanel()
    await enter('src', 'javascript:alert(1)')
    expect(errorText()).toBe('這個網址無法使用。')
    expect(stored().src).toBe('https://example.com/a.webm')
    await enter('poster', 'javascript:alert(1)')
    expect(errorText()).toBe('這個封面網址無法使用。')
    expect(stored().poster).toBe('https://example.com/p.png')
    await enter('poster', '')
    expect(errorText()).toBeNull()
    expect(stored()).not.toHaveProperty('poster')
  })

  it('replaces the video with an uploaded one, keeping its poster', async () => {
    const uploadVideo = vi.fn(async (chosen: File) => ({ src: `/uploads/${chosen.name}`, width: 320, height: 180 }))
    await mountWith(video(), { uploadVideo })
    await openPanel()
    await choose(new File(['abc'], 'clip.webm', { type: 'video/webm' }))
    await flushPromises()
    expect(stored()).toMatchObject({
      src: '/uploads/clip.webm',
      width: 320,
      height: 180,
      poster: 'https://example.com/p.png',
    })
    await undo()
    expect(stored().src).toBe('https://example.com/a.webm')
  })

  it('refuses a file that is not a video', async () => {
    const uploadVideo = vi.fn()
    await mountWith(video(), { uploadVideo })
    await openPanel()
    await choose(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(errorText()).toBe('請選擇影片檔。')
    expect(uploadVideo).not.toHaveBeenCalled()
  })
})

describe('the file panel', () => {
  it('writes the name as it is typed, as one step, with its extension', async () => {
    await mountWith(file())
    await openPanel()
    expect(panel('檔案')).not.toBeNull()
    expect(field('name').value).toBe('a.pdf')
    await type('name', 'b.zi')
    await type('name', 'b.zip')
    expect(stored()).toMatchObject({ name: 'b.zip', ext: 'zip', size: 10 })
    await undo()
    expect(stored()).toMatchObject({ name: 'a.pdf', ext: 'pdf' })
  })

  it('takes a new address once entered, keeping the name and dropping what it no longer knows', async () => {
    await mountWith(file())
    await openPanel()
    await enter('src', '/other.zip')
    expect(stored()).toMatchObject({ src: '/other.zip', name: 'a.pdf', display: 'block' })
    expect(stored()).not.toHaveProperty('size')
    expect(stored()).not.toHaveProperty('mimeType')
    await enter('src', 'javascript:alert(1)')
    expect(errorText()).toBe('這個網址無法使用。')
    expect(stored().src).toBe('/other.zip')
  })

  it('replaces the file with an uploaded one, shown while it uploads, in one step', async () => {
    let finish!: (value: unknown) => void
    const uploadFile = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    await mountWith(file(), { uploadFile })
    await openPanel()
    await choose(new File(['abcd'], 'new.pdf', { type: 'application/pdf' }))
    expect(statusText()).toBe('上傳中…')
    expect(stored().src).toBe('https://example.com/a.pdf')
    finish({ src: '/uploads/new.pdf' })
    await flushPromises()
    await flushPromises()
    expect(stored()).toMatchObject({
      src: '/uploads/new.pdf',
      name: 'new.pdf',
      size: 4,
      display: 'block',
    })
    await undo()
    expect(stored()).toMatchObject({ src: 'https://example.com/a.pdf', name: 'a.pdf', size: 10 })
  })

  it('drops an upload that finishes after the panel closed', async () => {
    let finish!: (value: unknown) => void
    const uploadFile = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    await mountWith(file(), { uploadFile })
    await openPanel()
    await choose(new File(['abcd'], 'new.pdf', { type: 'application/pdf' }))
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(anyPanel()).toBeNull()
    finish({ src: '/uploads/new.pdf' })
    await flushPromises()
    expect(stored().src).toBe('https://example.com/a.pdf')
  })

  it('puts everything back on Esc', async () => {
    await mountWith(file())
    await openPanel()
    await type('name', 'b.zip')
    await enter('src', '/other.zip')
    await escape()
    expect(anyPanel()).toBeNull()
    expect(stored()).toEqual(file())
  })
})

describe('adding and reading', () => {
  it('still adds through the dialog, with no panel', async () => {
    await mountWith(file())
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(OPEN_MEDIA_DIALOG_COMMAND, { kind: 'video' })
    await flushPromises()
    expect(document.querySelector('.hlx-media-dialog')!.textContent).toContain('插入影片')
    expect(anyPanel()).toBeNull()
  })

  it('has no panel while read-only', async () => {
    await mountWith(video(), { editable: false })
    block().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(anyPanel()).toBeNull()
  })
})
