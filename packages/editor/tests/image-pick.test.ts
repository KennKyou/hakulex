import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import type { PickImages, PickImagesOptions, UploadedImage } from '../src'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $getRoot } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_BLOCK_DIALOG_COMMAND, OPEN_IMAGE_DIALOG_COMMAND, RichEditor, serializeEditorState, toImageData } from '../src'
import ImageDialog from '../src/components/ImageDialog.vue'

/*
 * `pickImages` lets the author choose images the site already has. The image dialog lists
 * them with the rest and inserts them without uploading; the gallery adds them at the end.
 */

// happy-dom doesn't load images: a picture's size is read here, and an address with "missing" fails.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => {
    if (src.includes('missing'))
      throw new Error('load failed')
    return { width: 640, height: 480 }
  }),
}))

type Json = SerializedLexicalNode & Record<string, any>

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
function doc(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
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
const gallery = (images: unknown[]) => ({ type: 'gallery', version: 1, images })

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props: props as never, attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}

/** Promises, and the timer a choice waits out before the dialog takes Esc again. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve))
    await flushPromises()
  }
}

/** A `pickImages` that waits until the test says what the author chose. */
function deferredPick() {
  const calls: { options: PickImagesOptions, resolve: (images: UploadedImage[]) => void, reject: (error: unknown) => void }[] = []
  const pickImages = vi.fn<PickImages>(options => new Promise((resolve, reject) => {
    calls.push({ options, resolve, reject })
  }))
  return { pickImages, calls }
}

const rootChildren = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const imageDialog = () => document.querySelector<HTMLElement>('.hlx-image-dialog')
const blockDialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')
function button(text: string, within: HTMLElement) {
  return [
    ...within.querySelectorAll<HTMLButtonElement>('button'),
  ].find(item => item.textContent!.trim() === text) ?? null
}
function rows() {
  return [
    ...imageDialog()!.querySelectorAll<HTMLElement>('[data-image-dialog-row]'),
  ]
}
const rowNames = () => rows().map(row => row.querySelector('.hlx-image-row-name')!.textContent)
const insertButton = () => imageDialog()!.querySelector<HTMLButtonElement>('.hlx-image-dialog-foot button[data-primary]')!
function alerts(within: HTMLElement) {
  return [
    ...within.querySelectorAll('[role="alert"]'),
  ].map(item => item.textContent!.trim())
}
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

async function openImageDialog(editor: LexicalEditor) {
  editor.update(() => {
    $getRoot().clear().append($createParagraphNode())
    $getRoot().selectEnd()
  }, { discrete: true })
  editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
  await settle()
}

async function openGallery(editor: LexicalEditor) {
  editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'gallery' })
  await settle()
}

const A = {
  src: 'https://cdn.example.com/a.png',
  width: 100,
  height: 50,
  fileId: 'f-a',
  altText: '甲',
}
const B = {
  src: 'https://cdn.example.com/b.png',
  width: 30,
  height: 20,
  fileId: 'f-b',
}

describe('without pickImages', () => {
  it('shows no button to choose images, in the image dialog or the gallery', async () => {
    const { editor } = mountEditor({
      uploadImage: vi.fn(),
    })
    await openImageDialog(editor)
    expect(imageDialog()!.querySelector('[data-pick]')).toBeNull()
    expect(button('選擇圖片', imageDialog()!)).toBeNull()
    expect(imageDialog()!.querySelector('.hlx-image-dialog-divider')!.textContent!.trim()).toBe('或從網址')
    imageDialog()!.querySelector<HTMLButtonElement>('.hlx-image-dialog-close')!.click()
    await settle()

    await openGallery(editor)
    expect(blockDialog()!.querySelector('[data-pick]')).toBeNull()
    expect(button('選擇圖片', blockDialog()!)).toBeNull()
  })
})

describe('the image dialog', () => {
  it('lists the chosen images and inserts them as they came, without uploading', async () => {
    const uploadImage = vi.fn()
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ uploadImage, pickImages })
    await openImageDialog(editor)

    const pick = button('選擇圖片', imageDialog()!)!
    pick.click()
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0].options).toMatchObject({ purpose: 'insert', multiple: true })
    expect(calls[0].options.signal.aborted).toBe(false)
    expect(imageDialog()!.textContent).toContain('選擇圖片中…')

    calls[0].resolve([A, B])
    await settle()
    expect(rowNames()).toEqual(['a.png', 'b.png'])
    expect(imageDialog()!.textContent).not.toContain('選擇圖片中…')
    // The image editor only takes files.
    expect(imageDialog()!.querySelector('.hlx-image-row-edit')).toBeNull()

    insertButton().click()
    await settle()
    expect(imageDialog()).toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(rootChildren(editor).filter(node => node.type === 'image')).toEqual([
      expect.objectContaining({
        src: A.src,
        width: 100,
        height: 50,
        fileId: 'f-a',
        altText: '甲',
      }),
      expect.objectContaining({
        src: B.src,
        width: 30,
        height: 20,
        fileId: 'f-b',
        altText: '',
      }),
    ])
  })

  it('adds to what is already listed, with any number of images', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[0].resolve([A])
    await settle()

    // The list offers to choose more, next to adding files.
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    expect(calls).toHaveLength(2)
    const many = Array.from({ length: 30 }, (_, index) => ({ src: `https://cdn.example.com/${index}.png` }))
    calls[1].resolve(many)
    await settle()
    expect(rows()).toHaveLength(31)
    expect(insertButton().textContent).toContain('插入 31 張圖片')
  })

  it('disables inserting while choosing', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[0].resolve([A])
    await settle()

    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    expect(insertButton().disabled).toBe(true)
    imageDialog()!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await settle()
    expect(imageDialog()).not.toBeNull()

    calls[1].resolve([])
    await settle()
    expect(insertButton().disabled).toBe(false)
  })

  it('leaves out what can\'t be used, says why, and adds the rest', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[0].resolve([
      { src: 'javascript:alert(1)' },
      A,
      { src: 'https://cdn.example.com/missing.png' },
    ])
    await settle()
    expect(rowNames()).toEqual(['a.png'])
    const shown = alerts(imageDialog()!).join(' ')
    expect(shown).toContain('有圖片的網址無法使用')
    expect(shown).toContain('無法載入這張圖片')
  })

  it('shows an error from the site and keeps the list as it was', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[0].resolve([A])
    await settle()

    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[1].reject(new Error('沒有權限'))
    await settle()
    expect(alerts(imageDialog()!)).toContain('選擇失敗：沒有權限')
    expect(rowNames()).toEqual(['a.png'])
  })

  it('changes nothing when none were chosen', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({
      pickImages,
      uploadImage: vi.fn(),
    })
    await openImageDialog(editor)
    const before = imageDialog()!.querySelector('.hlx-image-dialog-body')!.innerHTML
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    calls[0].resolve([])
    await settle()
    expect(imageDialog()!.querySelector('.hlx-image-dropzone')).not.toBeNull()
    expect(rows()).toHaveLength(0)
    expect(alerts(imageDialog()!)).toEqual([])
    expect(imageDialog()!.querySelector('.hlx-image-dialog-body')!.innerHTML).toBe(before)
    // Focus goes back to the button, now that the site's dialog is gone.
    expect(document.activeElement).toBe(button('選擇圖片', imageDialog()!))
  })

  it('stays open on Esc while choosing, and aborts when it closes', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()

    // The Esc that closes the site's dialog isn't this one's.
    pressEscape()
    await settle()
    expect(imageDialog()).not.toBeNull()
    expect(calls[0].options.signal.aborted).toBe(false)

    imageDialog()!.querySelector<HTMLButtonElement>('.hlx-image-dialog-close')!.click()
    await settle()
    expect(imageDialog()).toBeNull()
    expect(calls[0].options.signal.aborted).toBe(true)

    // What comes back afterwards is ignored.
    calls[0].resolve([A])
    await settle()
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(false)
    editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
    await settle()
    expect(rows()).toHaveLength(0)
  })

  it('aborts when the editor unmounts', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor, wrapper } = mountEditor({ pickImages })
    await openImageDialog(editor)
    button('選擇圖片', imageDialog()!)!.click()
    await settle()
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(calls[0].options.signal.aborted).toBe(true)
  })

  it('uses the label it is given', async () => {
    const { pickImages } = deferredPick()
    const { editor } = mountEditor({ pickImages, pickImagesLabel: '從媒體庫選擇' })
    await openImageDialog(editor)
    expect(button('從媒體庫選擇', imageDialog()!)).not.toBeNull()
  })

  describe('replacing', () => {
    it('asks for one image, and takes only the first of several', async () => {
      const { pickImages, calls } = deferredPick()
      const wrapper = mount(ImageDialog, {
        props: { mode: 'replace', pickImages } as never,
        attachTo: document.body,
      })
      mounted.push(wrapper)
      await settle()
      button('選擇圖片', imageDialog()!)!.click()
      await settle()
      expect(calls[0].options).toMatchObject({ purpose: 'replace', multiple: false })

      calls[0].resolve([A, B])
      await settle()
      expect(rowNames()).toEqual(['a.png'])
      insertButton().click()
      await settle()
      expect(wrapper.emitted('submit')![0][0]).toEqual([
        {
          kind: 'picked',
          image: {
            src: A.src,
            altText: '甲',
            width: 100,
            height: 50,
            fileId: 'f-a',
          },
        },
      ])
    })
  })
})

describe('the gallery', () => {
  const images = (editor: LexicalEditor) => rootChildren(editor).find(node => node.type === 'gallery')!.images as Json[]

  it('adds the chosen images at the end, keeping their file ids', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({
      pickImages,
      modelValue: doc(gallery([
        { src: 'https://example.com/x.png', fileId: 'f-x' },
      ]), paragraph()),
    })
    await settle()
    document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await settle()

    button('選擇圖片', blockDialog()!)!.click()
    await settle()
    expect(calls[0].options).toMatchObject({ purpose: 'gallery', multiple: true })
    expect(blockDialog()!.textContent).toContain('選擇圖片中…')
    expect(button('儲存', blockDialog()!)!.disabled).toBe(true)
    // The Esc that closes the site's dialog isn't this one's.
    pressEscape()
    await settle()
    expect(blockDialog()).not.toBeNull()

    calls[0].resolve([A, B])
    await settle()
    button('儲存', blockDialog()!)!.click()
    await settle()
    expect(images(editor)).toEqual([
      { src: 'https://example.com/x.png', fileId: 'f-x' },
      {
        src: A.src,
        alt: '甲',
        width: 100,
        height: 50,
        fileId: 'f-a',
      },
      {
        src: B.src,
        width: 30,
        height: 20,
        fileId: 'f-b',
      },
    ])
  })

  it('fills a new gallery\'s blank row', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({
      pickImages,
      modelValue: doc(paragraph()),
    })
    await settle()
    await openGallery(editor)
    button('選擇圖片', blockDialog()!)!.click()
    await settle()
    calls[0].resolve([A])
    await settle()
    expect(blockDialog()!.querySelectorAll('.hlx-gallery-row')).toHaveLength(1)
  })

  it('leaves out what can\'t be used and shows errors, adding the rest', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({
      pickImages,
      modelValue: doc(paragraph()),
    })
    await settle()
    await openGallery(editor)
    button('選擇圖片', blockDialog()!)!.click()
    await settle()
    calls[0].resolve([
      { src: '//evil.example.com/a.png' },
      B,
      { src: 'https://cdn.example.com/missing.png' },
    ])
    await settle()
    const srcs = [
      ...blockDialog()!.querySelectorAll<HTMLInputElement>('[data-field="src"]'),
    ].map(input => input.value)
    expect(srcs).toEqual([B.src])
    const shown = alerts(blockDialog()!).join(' ')
    expect(shown).toContain('有圖片的網址無法使用')
    expect(shown).toContain('無法載入這張圖片')

    button('選擇圖片', blockDialog()!)!.click()
    await settle()
    calls[1].reject(new Error('沒有權限'))
    await settle()
    expect(alerts(blockDialog()!)).toContain('選擇失敗：沒有權限')
    expect(blockDialog()!.querySelectorAll('.hlx-gallery-row')).toHaveLength(1)
  })

  it('aborts when it closes, and ignores what comes back afterwards', async () => {
    const { pickImages, calls } = deferredPick()
    const { editor } = mountEditor({
      pickImages,
      modelValue: doc(paragraph()),
    })
    await settle()
    await openGallery(editor)
    button('選擇圖片', blockDialog()!)!.click()
    await settle()
    button('取消', blockDialog()!)!.click()
    await settle()
    expect(blockDialog()).toBeNull()
    expect(calls[0].options.signal.aborted).toBe(true)
    calls[0].resolve([A])
    await settle()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph'])
  })
})

describe('allowImageUrl: false', () => {
  it('offers no address field in the image dialog', async () => {
    const { pickImages } = deferredPick()
    const { editor } = mountEditor({ pickImages, allowImageUrl: false })
    await openImageDialog(editor)
    expect(imageDialog()!.querySelector('input[name="src"]')).toBeNull()
    expect(imageDialog()!.textContent).not.toContain('或從網址')
    // The one way in is first.
    expect(document.activeElement).toBe(button('選擇圖片', imageDialog()!))
  })

  it('offers no address field in the gallery', async () => {
    const { editor } = mountEditor({
      uploadImage: vi.fn(),
      allowImageUrl: false,
      modelValue: doc(gallery([
        { src: 'https://example.com/x.png', fileId: 'f-x' },
      ]), paragraph()),
    })
    await settle()
    document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await settle()
    const src = blockDialog()!.querySelector<HTMLInputElement>('[data-field="src"]')!
    expect(src.readOnly).toBe(true)
    expect(button('新增圖片', blockDialog()!)).toBeNull()
    expect(blockDialog()!.querySelector('.hlx-gallery-upload')).not.toBeNull()
    button('取消', blockDialog()!)!.click()
    await settle()

    // A new one has no blank row to type in.
    await openGallery(editor)
    expect(blockDialog()!.querySelectorAll('.hlx-gallery-row')).toHaveLength(0)
  })

  it('still offers addresses by default', async () => {
    const { editor } = mountEditor()
    await openImageDialog(editor)
    expect(imageDialog()!.querySelector('input[name="src"]')).not.toBeNull()
  })
})

describe('toImageData', () => {
  it('checks the address, reads a missing size and keeps only a real file id', async () => {
    await expect(toImageData({ src: 'https://cdn.example.com/a.png', fileId: '' })).resolves.toEqual({
      src: 'https://cdn.example.com/a.png',
      altText: '',
      width: 640,
      height: 480,
    })
    await expect(toImageData({
      src: '/a.png',
      width: 3,
      height: 4,
      fileId: 'f',
      altText: 'x',
    })).resolves.toEqual({
      src: '/a.png',
      altText: 'x',
      width: 3,
      height: 4,
      fileId: 'f',
    })
    await expect(toImageData({ src: 'javascript:alert(1)' })).rejects.toThrow('圖片的網址無法使用。')
    await expect(toImageData({ src: 'https://cdn.example.com/missing.png' })).rejects.toThrow('無法載入這張圖片。')
  })
})
