import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { OPEN_BLOCK_DIALOG_COMMAND, registerImagePreprocess, RichEditor, serializeEditorState, useImageTools } from '../src'

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
function paragraph(...children: unknown[]) {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children,
  }
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
function content(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  }
}
const doc = (...children: unknown[]) => content(...children) as unknown as SerializedEditorState
function gallery(images: unknown[], extra: Record<string, unknown> = {}) {
  return {
    type: 'gallery',
    version: 1,
    images,
    ...extra,
  }
}
const A = {
  src: 'https://example.com/a.png',
  alt: '甲',
  width: 4,
  height: 3,
  thumbhash: 'abc',
  extra: true,
}
const B = { src: 'https://example.com/b.png' }

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const types = (editor: LexicalEditor) => read(editor).map(node => node.type)
const dialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')
function button(name: string, within: Element = dialog()!) {
  return [
    ...within.querySelectorAll('button'),
  ].find(item => item.textContent!.trim() === name || item.getAttribute('aria-label') === name)!
}
function rows() {
  return [
    ...dialog()!.querySelectorAll<HTMLElement>('.hlx-gallery-row'),
  ]
}
const urlOf = (row: Element) => row.querySelector<HTMLInputElement>('[data-field="src"]')!
const altOf = (row: Element) => row.querySelector<HTMLInputElement>('[data-field="alt"]')!

async function press(name: string, within?: Element) {
  button(name, within).click()
  await flushPromises()
}

async function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function choose(name: string, value: string) {
  const select = dialog()!.querySelector<HTMLSelectElement>(`[data-field="${name}"]`)!
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

async function openFirst() {
  // A double click on the block opens its editing, as its toolbar's 編輯 does.
  document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await flushPromises()
  await flushPromises()
  expect(dialog()).not.toBeNull()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

function selectedType(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0]?.getType()
      : null
  })
}

function pick(files: File[]) {
  const input = dialog()!.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return flushPromises()
}
const png = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('on the page', () => {
  it('a click picks it and shows its toolbar, and Enter opens the dialog', async () => {
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()))
    document.querySelector<HTMLElement>('.hlx-gallery img')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).not.toBeNull()
    expect(selectedType(editor)).toBe('gallery')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(dialog()).not.toBeNull()
    expect(rows().map(row => urlOf(row).value)).toEqual([A.src])
  })

  it('read-only: no way to edit', async () => {
    await mountEditor(doc(gallery([A])), { editable: false })
    document.querySelector<HTMLElement>('.hlx-gallery img')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).toBeNull()
    expect(document.querySelector('.hlx-gallery img')).not.toBeNull()
  })

  it('says so when there is nothing to show', async () => {
    await mountEditor(doc(gallery([])))
    expect(document.querySelector('.hlx-block-empty')).not.toBeNull()
  })

  it('the carousel buttons don\'t pick the block', async () => {
    const { editor } = await mountEditor(doc(gallery([A, B], { layout: 'carousel' }), paragraph()))
    document.querySelector<HTMLElement>('[aria-label="下一張"]')!.click()
    await flushPromises()
    expect(selectedType(editor)).toBeNull()
  })
})

describe('saving', () => {
  it('writes settings and images as one undo step, and picks the block', async () => {
    const stored = gallery([A, B], { other: 1 })
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    await choose('layout', 'masonry')
    await choose('aspect', '1:1')
    await choose('fit', 'contain')
    await fill(dialog()!.querySelector<HTMLInputElement>('[data-field="maxItemHeight"]')!, '240')
    await press('儲存')
    expect(dialog()).toBeNull()
    expect(read(editor)[0]).toEqual({
      ...stored,
      layout: 'masonry',
      aspect: '1:1',
      fit: 'contain',
      maxItemHeight: 240,
    })
    expect(selectedType(editor)).toBe('gallery')
    await undo(editor)
    expect(read(editor)[0]).toEqual(stored)
  })

  it('keeps what it doesn\'t show on an image, unless the address changed', async () => {
    const { editor } = await mountEditor(doc(gallery([
      A,
      { ...A, src: 'https://example.com/c.png' },
    ]), paragraph()))
    await openFirst()
    await fill(altOf(rows()[0]), '新')
    await fill(urlOf(rows()[1]), 'https://example.com/d.png')
    await press('儲存')
    const { images } = read(editor)[0]
    expect(images[0]).toEqual({ ...A, alt: '新' })
    expect(images[1]).toEqual({ src: 'https://example.com/d.png', alt: '甲', extra: true })
  })

  it('adds, moves and removes images', async () => {
    const { editor } = await mountEditor(doc(gallery([A, B]), paragraph()))
    await openFirst()
    await press('新增圖片')
    await fill(urlOf(rows()[2]), '/c.png')
    await press('下移', rows()[0])
    expect(rows().map(row => urlOf(row).value)).toEqual([B.src, A.src, '/c.png'])
    expect(button('上移', rows()[0]).disabled).toBe(true)
    expect(button('下移', rows()[2]).disabled).toBe(true)
    await press('刪除圖片', rows()[0])
    await press('儲存')
    expect(read(editor)[0].images).toEqual([
      A,
      { src: '/c.png' },
    ])
  })

  it('removes the alt when it is cleared', async () => {
    const { editor } = await mountEditor(doc(gallery([
      { src: '/a.png', alt: '甲' },
    ]), paragraph()))
    await openFirst()
    await fill(altOf(rows()[0]), ' ')
    await press('儲存')
    expect(read(editor)[0].images).toEqual([
      { src: '/a.png' },
    ])
  })

  it('makes no change when nothing changed, not even defaults', async () => {
    const stored = gallery([A])
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    await press('儲存')
    expect(read(editor)[0]).toEqual(stored)
  })

  it('removes the height when it is cleared or not valid', async () => {
    const { editor } = await mountEditor(doc(gallery([A], { layout: 'masonry', maxItemHeight: 100 }), paragraph()))
    await openFirst()
    await fill(dialog()!.querySelector<HTMLInputElement>('[data-field="maxItemHeight"]')!, 'abc')
    await press('儲存')
    expect('maxItemHeight' in read(editor)[0]).toBe(false)
  })

  it('skips blank rows', async () => {
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()))
    await openFirst()
    await press('新增圖片')
    await fill(altOf(rows()[1]), '沒有網址')
    await press('儲存')
    expect(read(editor)[0].images).toEqual([A])
  })

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//evil.com/a.png'])('won\'t save %s', async (url) => {
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()))
    await openFirst()
    await fill(urlOf(rows()[0]), url)
    await press('儲存')
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
    expect(urlOf(rows()[0]).getAttribute('aria-invalid')).toBe('true')
    expect(read(editor)[0].images).toEqual([A])
  })
})

describe('uploading', () => {
  it('has no button without somewhere to upload to', async () => {
    await mountEditor(doc(gallery([A]), paragraph()))
    await openFirst()
    expect(dialog()!.querySelector('input[type="file"]')).toBeNull()
  })

  it('adds each file, and waits for them before saving', async () => {
    const finish: ((value: { src: string, width: number, height: number }) => void)[] = []
    const uploadImage = vi.fn((_file: File) => new Promise<{ src: string, width: number, height: number }>(resolve => finish.push(resolve)))
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()), { uploadImage })
    await openFirst()
    await pick([
      png('a.png'),
      png('b.png'),
    ])
    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(button('儲存').disabled).toBe(true)
    finish[0]({ src: '/one.png', width: 10, height: 20 })
    finish[1]({ src: '/two.png', width: 30, height: 40 })
    await flushPromises()
    await flushPromises()
    expect(button('儲存').disabled).toBe(false)
    await press('儲存')
    expect(read(editor)[0].images.slice(1)).toEqual([
      { src: '/one.png', width: 10, height: 20 },
      { src: '/two.png', width: 30, height: 40 },
    ])
  })

  it('says when a file failed, and keeps the others', async () => {
    const uploadImage = vi.fn(async (file: File) => {
      if (file.name === 'bad.png')
        throw new Error('nope')
      return { src: '/good.png', width: 1, height: 1 }
    })
    await mountEditor(doc(gallery([A]), paragraph()), { uploadImage })
    await openFirst()
    await pick([
      png('bad.png'),
      png('good.png'),
    ])
    await flushPromises()
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain('1')
    expect(rows().map(row => urlOf(row).value)).toEqual([A.src, '/good.png'])
  })

  it('skips what isn\'t an image', async () => {
    const uploadImage = vi.fn()
    await mountEditor(doc(gallery([A]), paragraph()), { uploadImage })
    await openFirst()
    await pick([
      new File(['x'], 'a.txt', { type: 'text/plain' }),
    ])
    expect(uploadImage).not.toHaveBeenCalled()
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('ignores an upload that finishes after the dialog closed', async () => {
    let finish!: (value: { src: string, width: number, height: number }) => void
    const uploadImage = vi.fn(() => new Promise<{ src: string, width: number, height: number }>((resolve) => {
      finish = resolve
    }))
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()), { uploadImage })
    await openFirst()
    await pick([
      png('a.png'),
    ])
    await press('取消')
    if (dialog())
      await press('放棄')
    finish({ src: '/late.png', width: 1, height: 1 })
    await flushPromises()
    expect(read(editor)[0].images).toEqual([A])
  })
})

describe('cancelling', () => {
  it('closes straight away with nothing changed', async () => {
    await mountEditor(doc(gallery([A]), paragraph()))
    await openFirst()
    await press('取消')
    expect(dialog()).toBeNull()
  })

  it('asks first with changes', async () => {
    const { editor } = await mountEditor(doc(gallery([A]), paragraph()))
    await openFirst()
    await choose('layout', 'carousel')
    await press('取消')
    expect(dialog()!.querySelector('.hlx-block-dialog-confirm')).not.toBeNull()
    await press('繼續編輯')
    expect(dialog()!.querySelector<HTMLSelectElement>('[data-field="layout"]')!.value).toBe('carousel')
    await press('取消')
    await press('放棄')
    expect(dialog()).toBeNull()
    expect('layout' in read(editor)[0]).toBe(false)
  })
})

describe('inserting', () => {
  const open = (editor: LexicalEditor) => {
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'gallery' })
    return flushPromises()
  }

  it('inserts on saving with images, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await open(editor)
    expect(types(editor)).toEqual(['paragraph'])
    await fill(urlOf(rows()[0]), '/a.png')
    await press('儲存')
    expect(types(editor)).toEqual(['paragraph', 'gallery', 'paragraph'])
    expect(read(editor)[1].images).toEqual([
      { src: '/a.png' },
    ])
    await undo(editor)
    expect(types(editor)).toEqual(['paragraph'])
  })

  it('won\'t insert without an image', async () => {
    const { editor } = await mountEditor(doc(paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await open(editor)
    await press('儲存')
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
    expect(types(editor)).toEqual(['paragraph'])
  })

  it('leaves the document alone on cancel, with the caret back', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const before = read(editor)
    await open(editor)
    await press('取消')
    expect(read(editor)).toEqual(before)
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('字')
    })
  })
})

describe('as a block', () => {
  it('arrow keys reach it, Delete removes it, undo brings it back', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), gallery([A])))
    editor.update(() => $getRoot().getFirstChildOrThrow<any>().selectEnd(), { discrete: true })
    await flushPromises()
    editor.update(() => editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(selectedType(editor)).toBe('gallery')
    editor.update(() => editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(types(editor)).not.toContain('gallery')
    await undo(editor)
    expect(types(editor)).toContain('gallery')
  })

  it('works inside a step', async () => {
    const { editor } = await mountEditor(doc({
      type: 'steps',
      version: 1,
      steps: [
        {
          id: 'a',
          title: '甲',
          content: content(gallery([A]), paragraph()),
        },
      ],
    }))
    await openFirst()
    await choose('layout', 'grid')
    await choose('fit', 'contain')
    await press('儲存')
    expect(read(editor)[0].steps[0].content.root.children[0].fit).toBe('contain')
    await undo(editor)
    expect('fit' in read(editor)[0].steps[0].content.root.children[0]).toBe(false)
  })
})

describe('a step before uploading', () => {
  function withStep(step: (files: File[], meta: { source: string }) => Promise<File[] | null>, props: Record<string, unknown>) {
    const Register = defineComponent({
      setup() {
        registerImagePreprocess(useImageTools(), step)
        return () => null
      },
    })
    mount(RichEditor, {
      props: {
        modelValue: doc(gallery([A]), paragraph()),
        ...props,
      } as never,
      slots: {
        default: () => h(Register),
      },
      attachTo: document.body,
    })
  }

  it('gets the chosen files first, and adds what it gives back', async () => {
    const uploadImage = vi.fn(async (file: File) => ({ src: `/${file.name}`, width: 1, height: 1 }))
    const step = vi.fn(async (files: File[]) => files.slice(1))
    withStep(step, { uploadImage })
    await flushPromises()
    await openFirst()
    await pick([
      png('a.png'),
      png('b.png'),
    ])
    await flushPromises()
    await flushPromises()
    expect(step).toHaveBeenCalledWith([
      expect.any(File),
      expect.any(File),
    ], { source: 'gallery' })
    expect(uploadImage.mock.calls.map(call => call[0].name)).toEqual(['b.png'])
    expect(rows().map(row => urlOf(row).value)).toEqual([A.src, '/b.png'])
  })

  it('adds nothing when it cancels', async () => {
    const uploadImage = vi.fn()
    withStep(async () => null, { uploadImage })
    await flushPromises()
    await openFirst()
    await pick([
      png('a.png'),
    ])
    await flushPromises()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(1)
  })
})

describe('how many a carousel shows', () => {
  const perView = () => dialog()!.querySelector<HTMLSelectElement>('[data-field="perView"]')!

  it('offers the listed counts, and writes all but one', async () => {
    // Saving writes every setting, so the stored one has them all.
    const stored = gallery([A, B], { layout: 'carousel', aspect: 'auto', fit: 'cover' })
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    expect([
      ...perView().options,
    ].map(option => option.value)).toEqual(['1', '1.2', '1.5', '2', '2.5', '3'])
    expect(perView().disabled).toBe(false)
    await choose('perView', '1.2')
    await press('儲存')
    expect(read(editor)[0]).toEqual({ ...stored, perView: 1.2 })

    await openFirst()
    expect(perView().value).toBe('1.2')
    await choose('perView', '1')
    await press('儲存')
    expect(read(editor)[0]).toEqual(stored)
  })

  it('is only for a carousel, and keeps its value for one', async () => {
    const stored = gallery([A, B], {
      layout: 'carousel',
      aspect: 'auto',
      fit: 'cover',
      perView: 2,
    })
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    await choose('layout', 'grid')
    expect(perView().disabled).toBe(true)
    await press('儲存')
    expect(read(editor)[0]).toEqual({ ...stored, layout: 'grid' })
  })
})
