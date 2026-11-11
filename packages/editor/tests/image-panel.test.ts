import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $getRoot, $getSelection, $isNodeSelection, KEY_ENTER_COMMAND, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { $isImageNode, OPEN_IMAGE_DIALOG_COMMAND, registerImagePreprocess, RichEditor, serializeEditorState, useImageTools } from '../src'

// happy-dom doesn't load images, so the browser size probe is replaced.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => {
    if (src.includes('missing'))
      throw new Error('load failed')
    if (src.includes('slow'))
      await new Promise(resolve => setTimeout(resolve, 20))
    return src.includes('other')
      ? { width: 300, height: 200 }
      : { width: 640, height: 480 }
  }),
}))

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
function image(extra: Json = {}) {
  return {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'cat',
    width: 10,
    height: 20,
    ...extra,
  }
}

let editor: LexicalEditor
async function mountImage(extra: Json = {}, props: Json = {}) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: {
        root: {
          ...element,
          type: 'root',
          children: [
            paragraph(),
            image(extra),
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
  return editor
}
const stored = () => (serializeEditorState(editor.getEditorState()).root.children as unknown as Json[])[1]
const figure = () => document.querySelector<HTMLElement>('.hlx-image-editor')!
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => panel()!.querySelector<T>(`[name="${name}"]`)!
const fileInput = () => panel()?.querySelector<HTMLInputElement>('input[type="file"]') ?? null
const errorText = () => panel()?.querySelector('[role="alert"]')?.textContent ?? null
const statusText = () => panel()?.querySelector('[role="status"]')?.textContent ?? null
const toolbarEdit = () => document.querySelector<HTMLButtonElement>('[role="toolbar"][aria-label="圖片"] button')!

async function pick() {
  figure().click()
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
/** As a browser does on Enter or on leaving the field. */
async function commit(name: string) {
  field(name).dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  await flushPromises()
}
async function leave(name: string) {
  field(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flushPromises()
}
async function choose(name: string, value: string) {
  const target = field<HTMLSelectElement>(name)
  target.value = value
  target.dispatchEvent(new Event('change', { bubbles: true }))
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
function chooseFile(file: File) {
  Object.defineProperty(fileInput()!, 'files', {
    value: [file],
    configurable: true,
  })
  fileInput()!.dispatchEvent(new Event('change'))
}

describe('the image panel', () => {
  it('opens beside the image from the toolbar, Enter or a double click, with the values filled in', async () => {
    await mountImage({ caption: 'Cap', displayWidth: 40, layout: 'float-left' })
    await openPanel()
    expect(panel()).not.toBeNull()
    expect(document.querySelector('.hlx-image-dialog')).toBeNull()
    expect(field('src').value).toBe('https://example.com/a.png')
    expect(field('alt').value).toBe('cat')
    expect(field('caption').value).toBe('Cap')
    expect(field('displayWidth').value).toBe('40')
    expect(field<HTMLSelectElement>('layout').value).toBe('float-left')
    expect(document.activeElement).toBe(field('src'))

    toolbarEdit().click()
    await flushPromises()
    expect(panel()).toBeNull()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    toolbarEdit().click()
    await flushPromises()
    figure().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
  })

  it('writes the alt text as it is typed, as one step', async () => {
    await mountImage()
    await openPanel()
    await type('alt', 'd')
    await type('alt', 'do')
    await type('alt', 'dog')
    expect(stored()).toMatchObject({ altText: 'dog', width: 10, height: 20 })
    await undo()
    expect(stored().altText).toBe('cat')
  })

  it('loads a new address only when it is entered, then writes it with its size', async () => {
    await mountImage({ thumbhash: 'abc=', accent: '#123456', layout: 'float-left' })
    await openPanel()
    await type('src', 'https://example.com/oth')
    expect(stored().src).toBe('https://example.com/a.png')
    await type('src', 'https://example.com/other.png')
    await commit('src')
    expect(stored()).toMatchObject({
      src: 'https://example.com/other.png',
      width: 300,
      height: 200,
      layout: 'float-left',
    })
    expect(stored()).not.toHaveProperty('thumbhash')
    expect(stored()).not.toHaveProperty('accent')
    await undo()
    expect(stored()).toMatchObject({ src: 'https://example.com/a.png', thumbhash: 'abc=' })
  })

  it.each([
    ['javascript:alert(1)', '這個網址無法使用。'],
    ['https://example.com/missing.png', '無法載入這張圖片。'],
  ])('refuses %s with an error, leaving the image as it is', async (src, message) => {
    await mountImage()
    await openPanel()
    await type('src', src)
    await commit('src')
    expect(errorText()).toBe(message)
    expect(stored().src).toBe('https://example.com/a.png')
    expect(field('src').getAttribute('aria-invalid')).toBe('true')
  })

  it('writes and clears the caption, each change a step of its own', async () => {
    await mountImage()
    await openPanel()
    await type('caption', 'A cat')
    expect(stored().caption).toBe('A cat')
    await leave('caption')
    await type('caption', '')
    expect(stored()).not.toHaveProperty('caption')
    await undo()
    expect(stored().caption).toBe('A cat')
  })

  it('writes a width of 50, refuses one out of range, and removes it when cleared', async () => {
    await mountImage({ displayWidth: 40 })
    await openPanel()
    await type('displayWidth', '50')
    expect(stored().displayWidth).toBe(50)
    await type('displayWidth', '101')
    expect(errorText()).toContain('10 到 100')
    expect(stored().displayWidth).toBe(50)
    await type('displayWidth', '')
    expect(errorText()).toBeNull()
    expect(stored()).not.toHaveProperty('displayWidth')
  })

  it('sets a layout and back to the default, and keeps one it can\'t show unless another is chosen', async () => {
    await mountImage()
    await openPanel()
    await choose('layout', 'float-right')
    expect(stored().layout).toBe('float-right')
    await choose('layout', '')
    expect(stored()).not.toHaveProperty('layout')
    await undo()
    expect(stored().layout).toBe('float-right')

    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    await mountImage({ layout: 'align-left' })
    await openPanel()
    expect(field<HTMLSelectElement>('layout').value).toBe('')
    await type('alt', 'new')
    expect(stored()).toMatchObject({ layout: 'align-left', altText: 'new' })
  })

  it('puts everything back on Esc, and leaves the image picked', async () => {
    await mountImage()
    await openPanel()
    await type('alt', 'dog')
    await leave('alt')
    await type('caption', 'Cap')
    await escape()
    expect(panel()).toBeNull()
    expect(stored()).toMatchObject({ altText: 'cat' })
    expect(stored()).not.toHaveProperty('caption')
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
  })

  it('replaces the picture with an uploaded file, once the upload is done', async () => {
    let finish!: (value: unknown) => void
    const uploadImage = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    await mountImage({}, { uploadImage })
    await openPanel()
    chooseFile(new File(['x'], 'b.png', { type: 'image/png' }))
    await flushPromises()
    expect(statusText()).toBe('上傳中…')
    expect(stored().src).toBe('https://example.com/a.png')
    finish({ src: 'https://cdn.example.com/b.png', width: 800, height: 600 })
    await flushPromises()
    await flushPromises()
    expect(stored()).toMatchObject({
      src: 'https://cdn.example.com/b.png',
      width: 800,
      height: 600,
      altText: 'cat',
    })
    expect(statusText()).toBeNull()
    await undo()
    expect(stored().src).toBe('https://example.com/a.png')
  })

  it('drops an upload or a size check that finishes after the panel closed', async () => {
    let finish!: (value: unknown) => void
    const uploadImage = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    await mountImage({}, { uploadImage })
    await openPanel()
    chooseFile(new File(['x'], 'b.png', { type: 'image/png' }))
    await flushPromises()
    await escape()
    expect(panel()).toBeNull()
    finish({ src: 'https://cdn.example.com/b.png', width: 800, height: 600 })
    await flushPromises()
    expect(stored().src).toBe('https://example.com/a.png')

    await openPanel()
    await type('src', 'https://example.com/slow-other.png')
    await commit('src')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 40))
    await flushPromises()
    expect(stored().src).toBe('https://example.com/a.png')
  })

  it('refuses a file that is not an image without uploading it, and offers no file without uploadImage', async () => {
    const uploadImage = vi.fn()
    await mountImage({}, { uploadImage })
    await openPanel()
    chooseFile(new File(['x'], 'a.txt', { type: 'text/plain' }))
    await flushPromises()
    expect(errorText()).toBe('請選擇圖片檔。')
    expect(uploadImage).not.toHaveBeenCalled()

    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    await mountImage()
    await openPanel()
    expect(fileInput()).toBeNull()
  })

  it('still inserts a new image through the dialog, with no panel', async () => {
    await mountImage()
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
    await flushPromises()
    const dialog = document.querySelector<HTMLElement>('.hlx-image-dialog')!
    expect(dialog.textContent).toContain('插入圖片')
    expect(panel()).toBeNull()
    expect(editor.read(() => $getRoot().getChildren().filter($isImageNode).length)).toBe(1)
  })

  it('has no panel while read-only', async () => {
    await mountImage({}, { editable: false })
    figure().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).toBeNull()
  })
})

/*
 * A plugin's step before uploads, such as the list of images to insert: pasting, dropping and
 * replacing go through it, and a failing one uploads the originals.
 */
describe('a step before uploading', () => {
  type Step = (files: File[], meta: { source: string }) => Promise<File[] | null>
  const png = (name: string) => new File(['x'], name, { type: 'image/png' })
  const instantUpload = () => vi.fn(async (file: File) => ({ src: `https://cdn.example.com/${file.name}`, width: 10, height: 10 }))

  function withStep(step: Step, props: Json, value?: Json) {
    const Register = defineComponent({
      setup() {
        registerImagePreprocess(useImageTools(), step)
        return () => null
      },
    })
    const wrapper = mount(RichEditor, {
      props: {
        ...props,
        ...(value
          ? { modelValue: value }
          : {}),
      } as never,
      slots: {
        default: () => h(Register),
      },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    return editor
  }

  function paste(target: LexicalEditor, ...files: File[]) {
    const data = new DataTransfer()
    for (const file of files)
      data.items.add(file)
    target.update(() => {
      target.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data, cancelable: true }))
    }, { discrete: true })
  }
  const images = (target: LexicalEditor) => (serializeEditorState(target.getEditorState()).root.children as unknown as Json[]).filter(node => node.type === 'image')
  async function settle() {
    for (let i = 0; i < 4; i++)
      await flushPromises()
  }
  function blank(target: LexicalEditor) {
    target.update(() => {
      const paragraph = $createParagraphNode()
      $getRoot().clear().append(paragraph)
      paragraph.select()
    }, { discrete: true })
  }

  it('gets pasted files first, and uploads what it gives back', async () => {
    const uploadImage = instantUpload()
    const step = vi.fn<Step>(async files => [
      new File(['y'], `edited-${files[0].name}`, { type: 'image/png' }),
    ])
    const target = withStep(step, { uploadImage })
    blank(target)
    paste(target, png('a.png'))
    await settle()
    expect(step).toHaveBeenCalledWith([
      expect.any(File),
    ], { source: 'paste' })
    expect(uploadImage.mock.calls.map(call => call[0].name)).toEqual(['edited-a.png'])
    expect(images(target).map(node => node.src)).toEqual(['https://cdn.example.com/edited-a.png'])
  })

  it('gets dropped files too', async () => {
    const step = vi.fn<Step>(async files => files)
    const target = withStep(step, {
      uploadImage: instantUpload(),
    })
    blank(target)
    const drop = [
      ...(target as unknown as { _commands: Map<{ type?: string }, unknown> })._commands.keys(),
    ]
      .find(command => command.type === 'DRAG_DROP_PASTE_FILE')!
    target.update(() => {
      target.dispatchCommand(drop as never, [
        png('a.png'),
        png('b.png'),
      ] as never)
    }, { discrete: true })
    await settle()
    expect(step).toHaveBeenCalledWith([
      expect.any(File),
      expect.any(File),
    ], { source: 'drop' })
    expect(images(target)).toHaveLength(2)
  })

  it('uploads nothing when it cancels', async () => {
    const uploadImage = instantUpload()
    const target = withStep(async () => null, { uploadImage })
    blank(target)
    paste(target, png('a.png'))
    await settle()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(images(target)).toEqual([])
  })

  it('uploads the originals when it fails, so no file is lost', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const uploadImage = instantUpload()
    const target = withStep(async () => {
      throw new Error('broken')
    }, { uploadImage })
    blank(target)
    paste(target, png('a.png'))
    await settle()
    expect(uploadImage.mock.calls.map(call => call[0].name)).toEqual(['a.png'])
    expect(error).toHaveBeenCalled()
  })

  it('gets a replacing file, and the picture changes as one undo step', async () => {
    const uploadImage = instantUpload()
    const step = vi.fn<Step>(async files => [
      new File(['y'], `edited-${files[0].name}`, { type: 'image/png' }),
    ])
    withStep(step, { uploadImage }, {
      root: {
        ...element,
        type: 'root',
        children: [
          paragraph(),
          image(),
          paragraph(),
        ],
      },
    })
    await settle()
    await openPanel()
    chooseFile(png('b.png'))
    await settle()
    expect(step).toHaveBeenCalledWith([
      expect.any(File),
    ], { source: 'replace' })
    expect(stored()).toMatchObject({ src: 'https://cdn.example.com/edited-b.png', altText: 'cat' })
    await undo()
    expect(stored().src).toBe('https://example.com/a.png')
  })

  it('keeps the picture when it cancels a replacement', async () => {
    const uploadImage = instantUpload()
    withStep(async () => null, { uploadImage }, {
      root: {
        ...element,
        type: 'root',
        children: [
          paragraph(),
          image(),
          paragraph(),
        ],
      },
    })
    await settle()
    await openPanel()
    chooseFile(png('b.png'))
    await settle()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(stored().src).toBe('https://example.com/a.png')
    expect(statusText()).toBeNull()
  })

  it('reaches files pasted in nested content, through the outer editor\'s step', async () => {
    const step = vi.fn<Step>(async files => files)
    const uploadImage = instantUpload()
    withStep(step, { uploadImage }, {
      root: {
        ...element,
        type: 'root',
        children: [
          {
            type: 'nested-doc',
            version: 1,
            content: {
              root: {
                ...element,
                type: 'root',
                children: [
                  paragraph(),
                ],
              },
            },
          },
        ],
      },
    })
    await settle()
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    paste(inner, png('a.png'))
    await settle()
    expect(step).toHaveBeenCalledOnce()
    expect(uploadImage).toHaveBeenCalledOnce()
    expect(images(inner)).toHaveLength(1)
  })
})
