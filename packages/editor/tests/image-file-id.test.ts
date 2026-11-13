import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $getRoot, PASTE_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { ImageNode, OPEN_IMAGE_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'
import { uploadToImage } from '../src/image/upload'

// happy-dom doesn't load images, so the browser size probe is replaced.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => (src.includes('other')
    ? { width: 300, height: 200 }
    : { width: 640, height: 480 })),
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
function documentWith(...children: Json[]): SerializedEditorState {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}

async function settle() {
  for (let i = 0; i < 4; i++)
    await flushPromises()
}

async function mountEditor(props: Json = {}) {
  const wrapper = mount(RichEditor, { props: props as never, attachTo: document.body })
  mounted.push(wrapper)
  await settle()
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}

const nodes = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as unknown as Json[]
const images = (editor: LexicalEditor) => nodes(editor).filter(node => node.type === 'image')
function png(name = 'a.png') {
  return new File([
    'x'.repeat(2048),
  ], name, { type: 'image/png' })
}

/** Uploads that answer with a file id taken from the file name. */
function uploadWithIds(ids: Record<string, unknown>) {
  return vi.fn(async (file: File) => ({
    src: `https://cdn.example.com/${file.name}`,
    width: 100,
    height: 50,
    fileId: ids[file.name],
  }))
}

function placeCaret(editor: LexicalEditor) {
  editor.update(() => {
    const root = $getRoot().clear()
    const line = $createParagraphNode()
    root.append(line)
    line.selectEnd()
  }, { discrete: true })
}

describe('a file id from uploadImage', () => {
  it('is stored on an image inserted through the dialog', async () => {
    const uploadImage = uploadWithIds({ 'a.png': 'f-1' })
    const editor = await mountEditor({ uploadImage })
    placeCaret(editor)
    editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
    await settle()
    const input = document.querySelector<HTMLInputElement>('.hlx-image-dialog input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        png(),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await settle()
    document.querySelector<HTMLButtonElement>('.hlx-image-dialog button[data-primary]')!.click()
    await settle()

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(images(editor)).toHaveLength(1)
    expect(images(editor)[0]).toMatchObject({ src: 'https://cdn.example.com/a.png', fileId: 'f-1' })
  })

  it('is stored on images pasted or dropped as files', async () => {
    const uploadImage = uploadWithIds({ 'one.png': 'f-1', 'two.png': 'f-2' })
    const editor = await mountEditor({ uploadImage })
    placeCaret(editor)
    const data = new DataTransfer()
    data.items.add(png('one.png'))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data, cancelable: true }))
    await settle()
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png('two.png'),
    ])
    await settle()

    expect(images(editor).map(node => node.fileId).sort()).toEqual(['f-1', 'f-2'])
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
  ])('is left out when it is %s', async (_label, fileId) => {
    const uploadImage = uploadWithIds({ 'a.png': fileId })
    const editor = await mountEditor({ uploadImage })
    placeCaret(editor)
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png(),
    ])
    await settle()

    expect(images(editor)).toHaveLength(1)
    expect(images(editor)[0]).not.toHaveProperty('fileId')
  })

  it('comes back from uploadToImage only as a non-empty string', async () => {
    const run = (fileId: unknown) => uploadToImage(png(), async () => ({
      src: 'https://cdn.example.com/a.png',
      width: 1,
      height: 1,
      fileId,
    } as never))
    expect(await run('f-1')).toMatchObject({ fileId: 'f-1' })
    expect(await run('')).not.toHaveProperty('fileId')
    expect(await run(7)).not.toHaveProperty('fileId')
  })
})

describe('a stored file id', () => {
  it('is output unchanged when nothing is edited', async () => {
    const value = documentWith(image({ fileId: 'f-1' }))
    const editor = await mountEditor({ modelValue: value })
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
  })

  it('survives a copy and edits of the alt text, caption, display width and layout', async () => {
    const editor = await mountEditor({
      modelValue: documentWith(image({ fileId: 'f-1' })),
    })
    editor.update(() => {
      const node = $getRoot().getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        altText: 'new',
        caption: 'note',
        displayWidth: 50,
        layout: 'float-left',
      })
    }, { discrete: true })
    expect(images(editor)[0]).toMatchObject({
      fileId: 'f-1',
      altText: 'new',
      caption: 'note',
      displayWidth: 50,
      layout: 'float-left',
    })

    const copy = editor.read(() => ($getRoot().getFirstChild() as ImageNode).exportJSON())
    editor.update(() => {
      $getRoot().append(ImageNode.importJSON(copy))
    }, { discrete: true })
    expect(images(editor)[1]).toMatchObject({ fileId: 'f-1' })
  })

  it('does not change what the editor or the renderer shows', async () => {
    const withId = await mountEditor({
      modelValue: documentWith(image({ fileId: 'f-1' })),
    })
    const editorWithId = document.querySelector('.hlx-image-block')!.outerHTML
    withId.setRootElement(null)
    document.body.innerHTML = ''
    await mountEditor({
      modelValue: documentWith(image()),
    })
    expect(editorWithId).toBe(document.querySelector('.hlx-image-block')!.outerHTML)

    const ssr = (value: SerializedEditorState) => renderToString(createSSRApp({
      render: () => h(RichRenderer, { value }),
    }))
    expect(await ssr(documentWith(image({ fileId: 'f-1' })))).toBe(await ssr(documentWith(image())))
  })
})

describe('replacing the picture in the panel', () => {
  async function openPanel() {
    document.querySelector<HTMLElement>('.hlx-image-editor')!.click()
    await settle()
    document.querySelector<HTMLButtonElement>('[role="toolbar"][aria-label="圖片"] button')!.click()
    await settle()
  }
  const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')!
  const stored = (editor: LexicalEditor) => nodes(editor)[1]

  it('drops the file id when the address is changed by hand', async () => {
    const editor = await mountEditor({
      modelValue: documentWith(paragraph(), image({ fileId: 'f-1' }), paragraph()),
    })
    await openPanel()
    const src = panel().querySelector<HTMLInputElement>('[name="src"]')!
    src.focus()
    src.value = 'https://example.com/other.png'
    src.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    src.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()

    expect(stored(editor)).toMatchObject({ src: 'https://example.com/other.png' })
    expect(stored(editor)).not.toHaveProperty('fileId')
  })

  it('takes the new file id when the picture is replaced by an upload', async () => {
    const uploadImage = uploadWithIds({ 'b.png': 'f-2' })
    const editor = await mountEditor({
      modelValue: documentWith(paragraph(), image({ fileId: 'f-1' }), paragraph()),
      uploadImage,
    })
    await openPanel()
    const input = panel().querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        png('b.png'),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await settle()

    expect(stored(editor)).toMatchObject({ src: 'https://cdn.example.com/b.png', fileId: 'f-2' })
  })

  it('drops the file id when an upload without one replaces the picture', async () => {
    const uploadImage = uploadWithIds({})
    const editor = await mountEditor({
      modelValue: documentWith(paragraph(), image({ fileId: 'f-1' }), paragraph()),
      uploadImage,
    })
    await openPanel()
    const input = panel().querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        png('b.png'),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await settle()

    expect(stored(editor)).toMatchObject({ src: 'https://cdn.example.com/b.png' })
    expect(stored(editor)).not.toHaveProperty('fileId')
  })
})
