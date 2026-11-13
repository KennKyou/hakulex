import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

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
function paragraph() {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}
function doc(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}
function gallery(images: unknown[]) {
  return { type: 'gallery', version: 1, images }
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}

async function settle() {
  for (let i = 0; i < 4; i++)
    await flushPromises()
}

const imagesOf = (editor: LexicalEditor) => (serializeEditorState(editor.getEditorState()).root.children as Json[])[0].images as Json[]
const dialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')!
function rows() {
  return [
    ...dialog().querySelectorAll<HTMLElement>('.hlx-gallery-row'),
  ]
}
const field = (row: Element, name: string) => row.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!

async function open() {
  document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await settle()
}
async function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function save() {
  [
    ...dialog().querySelectorAll('button'),
  ].find(item => item.textContent!.trim() === '儲存')!.click()
  await settle()
}
async function pick(files: File[]) {
  const input = dialog().querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
}
const png = (name: string) => new File(['x'], name, { type: 'image/png' })

const A = { src: 'https://example.com/a.png', alt: '甲', fileId: 'f-1' }
const B = { src: 'https://example.com/b.png', alt: '乙', fileId: 'f-2' }

describe('file ids on gallery images', () => {
  it('stores the id each upload gives, in order', async () => {
    const ids: Record<string, string> = { 'one.png': 'f-1', 'two.png': 'f-2' }
    const uploadImage = vi.fn(async (file: File) => ({
      src: `/${file.name}`,
      width: 10,
      height: 20,
      fileId: ids[file.name],
    }))
    const editor = await mountEditor(doc(gallery([
      { src: 'https://example.com/x.png' },
    ]), paragraph()), { uploadImage })
    await open()
    await pick([
      png('one.png'),
      png('two.png'),
    ])
    await save()

    expect(imagesOf(editor).slice(1)).toEqual([
      {
        src: '/one.png',
        width: 10,
        height: 20,
        fileId: 'f-1',
      },
      {
        src: '/two.png',
        width: 10,
        height: 20,
        fileId: 'f-2',
      },
    ])
  })

  it('leaves out an id that is empty or not a string', async () => {
    const uploadImage = vi.fn(async (file: File) => ({
      src: `/${file.name}`,
      width: 10,
      height: 20,
      fileId: file.name === 'one.png'
        ? ''
        : 7,
    }))
    const editor = await mountEditor(doc(gallery([
      { src: 'https://example.com/x.png' },
    ]), paragraph()), { uploadImage })
    await open()
    await pick([
      png('one.png'),
      png('two.png'),
    ])
    await save()

    for (const image of imagesOf(editor).slice(1))
      expect(image).not.toHaveProperty('fileId')
  })

  it('drops only the id of the image whose address changed', async () => {
    const editor = await mountEditor(doc(gallery([A, B]), paragraph()))
    await open()
    await fill(field(rows()[0], 'src'), 'https://example.com/c.png')
    await save()

    const [first, second] = imagesOf(editor)
    expect(first).toMatchObject({ src: 'https://example.com/c.png' })
    expect(first).not.toHaveProperty('fileId')
    expect(second).toEqual(B)
  })

  it('keeps every id when only an alt text changes', async () => {
    const editor = await mountEditor(doc(gallery([A, B]), paragraph()))
    await open()
    await fill(field(rows()[0], 'alt'), '新')
    await save()

    expect(imagesOf(editor)).toEqual([
      { ...A, alt: '新' },
      B,
    ])
  })
})
