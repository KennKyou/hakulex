import type { LexicalEditor } from 'lexical'
import { $isImageNode, OPEN_IMAGE_DIALOG_COMMAND, RichEditor, serializeEditorState } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $getRoot, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { ImageEditorPlugin } from '../src'
import { exportResult } from '../src/pipeline'

/*
 * With the plugin in the editor, each image in the list can be opened in the edit screen,
 * and what it gives back replaces the row's file.
 */

vi.mock('../../editor/src/image/probe', () => ({
  probeImageSize: vi.fn(async () => ({ width: 640, height: 480 })),
}))
vi.mock('../src/pipeline', async original => ({
  ...(await original<typeof import('../src/pipeline')>()),
  exportResult: vi.fn(async ({ original }: { original: File }) => new File(['edited'], original.name, { type: original.type })),
}))

beforeEach(() => {
  HTMLImageElement.prototype.decode = async () => {}
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

async function settle() {
  for (let i = 0; i < 4; i++)
    await flushPromises()
}

function mountEditor(withPlugin = true) {
  const uploadImage = vi.fn(async (file: File) => ({ src: `https://cdn.example.com/${file.name}`, width: 1, height: 1 }))
  const wrapper = mount(RichEditor, {
    props: { uploadImage },
    slots: {
      default: () => (withPlugin
        ? h(ImageEditorPlugin)
        : null),
    },
    attachTo: document.body,
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => {
    const paragraph = $createParagraphNode()
    $getRoot().clear().append(paragraph)
    paragraph.select()
  }, { discrete: true })
  return { wrapper, editor, uploadImage }
}

const list = () => document.querySelector<HTMLElement>('.hlx-image-dialog')
const screen = () => document.querySelector<HTMLElement>('.hlx-picture-editor')
const row = () => list()!.querySelector<HTMLElement>('[data-image-dialog-row]')!
function button(text: string, within: HTMLElement) {
  return [
    ...within.querySelectorAll<HTMLButtonElement>('button'),
  ]
    .find(item => item.textContent!.trim() === text || item.getAttribute('aria-label') === text)
}

async function listWithFile(editor: LexicalEditor) {
  editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
  await settle()
  const input = list()!.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', {
    value: [
      new File(['x'], 'shot.png', { type: 'image/png' }),
    ],
    configurable: true,
  })
  input.dispatchEvent(new Event('change'))
  await settle()
}

describe('the image editor plugin', () => {
  it('opens a row in the edit screen and puts back what it made', async () => {
    const { editor, uploadImage } = mountEditor()
    await listWithFile(editor)
    button('編輯', row())!.click()
    await settle()
    expect(screen()).not.toBeNull()
    expect(screen()!.querySelector('.hlx-picture-editor-title')!.textContent!.trim()).toBe('編輯圖片')

    button('完成', screen()!)!.click()
    await settle()
    expect(screen()).toBeNull()
    expect(exportResult).toHaveBeenCalledOnce()
    expect(row().textContent).toContain('已編輯')
    expect(button('重新編輯', row())).toBeTruthy()

    list()!.querySelector<HTMLButtonElement>('button[data-primary]')!.click()
    await settle()
    expect(await uploadImage.mock.calls[0][0].text()).toBe('edited')
  })

  it('keeps the row as it was when editing is given up', async () => {
    const { editor } = mountEditor()
    await listWithFile(editor)
    button('編輯', row())!.click()
    await settle()
    button('放棄編輯', screen()!)!.click()
    await settle()
    expect(screen()).toBeNull()
    expect(row().textContent).not.toContain('已編輯')
  })

  it('closes only the edit screen on Escape, then the list', async () => {
    const { editor } = mountEditor()
    await listWithFile(editor)
    button('編輯', row())!.click()
    await settle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(screen()).toBeNull()
    expect(list()).not.toBeNull()

    // The list has a file the author chose, so it asks first.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(list()!.querySelector('[role="alert"]')!.textContent).toContain('要放棄這些圖片嗎？')
  })

  it('offers no editing without the plugin', async () => {
    const { editor } = mountEditor(false)
    await listWithFile(editor)
    expect(button('編輯', row())).toBeUndefined()
  })
})

describe('before uploading', () => {
  type Json = Record<string, any>
  const png = (name: string) => new File(['x'], name, { type: 'image/png' })
  const children = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as unknown as Json[]
  const images = (editor: LexicalEditor) => children(editor).filter(node => node.type === 'image')
  const primary = () => list()!.querySelector<HTMLButtonElement>('button[data-primary]')!

  function paste(editor: LexicalEditor, ...files: File[]) {
    const data = new DataTransfer()
    for (const file of files)
      data.items.add(file)
    editor.update(() => {
      editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data, cancelable: true }))
    }, { discrete: true })
  }

  function mountWith(value: unknown, withPlugin = true) {
    const uploadImage = vi.fn(async (file: File) => ({ src: `https://cdn.example.com/${file.name}`, width: 10, height: 10 }))
    const wrapper = mount(RichEditor, {
      props: { uploadImage, modelValue: value as never },
      slots: {
        default: () => (withPlugin
          ? h(ImageEditorPlugin)
          : null),
      },
      attachTo: document.body,
    })
    return { editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor, uploadImage }
  }

  const element = {
    format: '',
    indent: 0,
    direction: null,
    version: 1,
  }
  const paragraph = (...nodes: unknown[]) => ({
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: nodes,
  })
  const documentWith = (...nodes: unknown[]) => ({
    root: { ...element, type: 'root', children: nodes },
  })

  it('lists pasted images first, and uploads only what is inserted', async () => {
    const { editor, uploadImage } = mountEditor()
    await settle()
    paste(editor, png('one.png'))
    await settle()
    expect(list()).not.toBeNull()
    expect(list()!.querySelector('.hlx-image-dialog-title')!.textContent!.trim()).toBe('插入圖片')
    expect(uploadImage).not.toHaveBeenCalled()
    expect(button('取消', list()!)).toBeTruthy()
    expect(button('加入更多', list()!)).toBeTruthy()

    primary().click()
    await settle()
    expect(list()).toBeNull()
    expect(uploadImage).toHaveBeenCalledOnce()
    expect(images(editor).map(node => node.src)).toEqual(['https://cdn.example.com/one.png'])
  })

  it('inserts nothing when the list is cancelled', async () => {
    const { editor, uploadImage } = mountEditor()
    await settle()
    paste(editor, png('one.png'))
    await settle()
    button('取消', list()!)!.click()
    await settle()
    expect(list()).toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(images(editor)).toEqual([])
  })

  it('lists dropped images too', async () => {
    const { editor, uploadImage } = mountEditor()
    await settle()
    // Lexical's own command for dropped files, found by its name to avoid importing rich-text.
    const drop = [
      ...(editor as unknown as { _commands: Map<{ type?: string }, unknown> })._commands.keys(),
    ]
      .find(command => command.type === 'DRAG_DROP_PASTE_FILE')!
    editor.update(() => {
      editor.dispatchCommand(drop as never, [
        png('a.png'),
        png('b.png'),
      ] as never)
    }, { discrete: true })
    await settle()
    expect(list()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(2)
    primary().click()
    await settle()
    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(images(editor)).toHaveLength(2)
  })

  it('uploads at once without the plugin, as before', async () => {
    const { editor, uploadImage } = mountEditor(false)
    await settle()
    paste(editor, png('one.png'))
    await settle()
    expect(list()).toBeNull()
    expect(uploadImage).toHaveBeenCalledOnce()
  })

  it('replaces a picture through a one-row list, as one undo step', async () => {
    const { editor, uploadImage } = mountWith(documentWith(paragraph(), {
      type: 'image',
      version: 1,
      src: 'https://example.com/a.png',
      altText: 'cat',
    }, paragraph()))
    await settle()
    const key = editor.getEditorState().read(() => $getRoot().getChildren().find($isImageNode)!.getKey())
    editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, { nodeKey: key })
    await settle()
    const input = document.querySelector<HTMLInputElement>('.hlx-block-panel[aria-label="圖片"] input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        png('b.png'),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await settle()

    expect(list()!.querySelector('.hlx-image-dialog-title')!.textContent!.trim()).toBe('替換圖片')
    expect(list()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(1)
    expect(button('加入更多', list()!)).toBeUndefined()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(primary().textContent).toContain('替換')
    primary().click()
    await settle()
    expect(images(editor)[0]).toMatchObject({ src: 'https://cdn.example.com/b.png', altText: 'cat' })

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await settle()
    expect(images(editor)[0].src).toBe('https://example.com/a.png')
  })

  it('adds a gallery\'s uploads after the list', async () => {
    const { editor, uploadImage } = mountWith(documentWith({
      type: 'gallery',
      version: 1,
      images: [
        { src: 'https://example.com/a.png' },
      ],
    }, paragraph()))
    await settle()
    document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await settle()
    const gallery = document.querySelector<HTMLElement>('.hlx-block-dialog')!
    const input = gallery.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        png('b.png'),
        png('c.png'),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    expect(list()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(2)
    expect(uploadImage).not.toHaveBeenCalled()
    primary().click()
    await settle()
    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect([
      ...gallery.querySelectorAll<HTMLInputElement>('[data-field="src"]'),
    ].map(item => item.value))
      .toEqual(['https://example.com/a.png', 'https://cdn.example.com/b.png', 'https://cdn.example.com/c.png'])
    void editor
  })

  it('lists images pasted in nested content too', async () => {
    const { uploadImage } = mountWith(documentWith({
      type: 'nested-doc',
      version: 1,
      content: documentWith(paragraph()),
    }))
    await settle()
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    paste(inner, png('one.png'))
    await settle()
    expect(list()).not.toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(button('編輯', list()!.querySelector('[data-image-dialog-row]')!)).toBeTruthy()
  })
})
