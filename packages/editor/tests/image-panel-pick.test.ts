import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { PickImages, PickImagesOptions, UploadedImage } from '../src'
import { flushPromises, mount } from '@vue/test-utils'
import { UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

/*
 * The panel beside an image already in the document: `pickImages` replaces its picture with
 * one of the site's, and `allowImageUrl: false` leaves its address only to be read.
 */

// happy-dom doesn't load images: a picture's size is read here, and an address with "missing" fails.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => {
    if (src.includes('missing'))
      throw new Error('load failed')
    return { width: 640, height: 480 }
  }),
}))

type Json = Record<string, any>
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
function paragraph() {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}
const ORIGINAL = {
  type: 'image',
  version: 1,
  src: 'https://example.com/a.png',
  altText: 'cat',
  width: 10,
  height: 20,
  caption: '圖說',
  displayWidth: 50,
  layout: 'float-left',
  fileId: 'f-old',
}

let editor: LexicalEditor
async function mountImage(props: Json = {}) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: {
        root: {
          ...element,
          type: 'root',
          children: [
            paragraph(),
            ORIGINAL,
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

/** Promises, and the timer a choice waits out before the panel takes Esc again. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
}

/** A `pickImages` that waits until the test says what the author chose. */
function deferredPick() {
  const calls: { options: PickImagesOptions, resolve: (images: UploadedImage[]) => void, reject: (error: unknown) => void }[] = []
  const pickImages = vi.fn<PickImages>(options => new Promise((resolve, reject) => {
    calls.push({
      options,
      resolve,
      reject,
    })
  }))
  return { pickImages, calls }
}

const stored = () => (serializeEditorState(editor.getEditorState()).root.children as unknown as Json[])[1]
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')
const field = (name: string) => panel()!.querySelector<HTMLInputElement>(`[name="${name}"]`)!
const pickButton = () => panel()?.querySelector<HTMLButtonElement>('[data-pick]') ?? null
const fileInput = () => panel()?.querySelector<HTMLInputElement>('input[type="file"]') ?? null
const errorText = () => panel()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null
const statusText = () => panel()?.querySelector('[role="status"]')?.textContent?.trim() ?? null
const toolbarEdit = () => document.querySelector<HTMLButtonElement>('[role="toolbar"][aria-label="圖片"] button')!

async function openPanel() {
  document.querySelector<HTMLElement>('.hlx-image-editor')!.click()
  await flushPromises()
  toolbarEdit().click()
  await flushPromises()
}
async function escapeOn(target: Element) {
  // Vue drops an event stamped in the same millisecond its listener was attached.
  await new Promise(resolve => setTimeout(resolve, 5))
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
}
async function undo() {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

const PICKED = {
  src: 'https://cdn.example.com/b.png',
  width: 800,
  height: 600,
  fileId: 'f-new',
  altText: '狗',
}

describe('choosing an image to replace this one', () => {
  it('offers nothing without pickImages', async () => {
    await mountImage()
    await openPanel()
    expect(pickButton()).toBeNull()
    expect(field('src').readOnly).toBe(false)
  })

  it('replaces the picture, keeping the alt text, caption, width and layout, as one undo step', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    expect(pickButton()!.textContent!.trim()).toBe('選擇圖片')
    pickButton()!.click()
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0].options).toMatchObject({ purpose: 'replace', multiple: false })
    expect(statusText()).toBe('選擇圖片中…')
    expect(pickButton()!.disabled).toBe(true)

    calls[0].resolve([
      PICKED,
      { src: 'https://cdn.example.com/c.png', fileId: 'f-c' },
    ])
    await settle()
    expect(stored()).toMatchObject({
      src: PICKED.src,
      width: 800,
      height: 600,
      fileId: 'f-new',
      altText: 'cat',
      caption: '圖說',
      displayWidth: 50,
      layout: 'float-left',
    })
    expect(field('src').value).toBe(PICKED.src)
    expect(statusText()).toBeNull()
    // Back from the site's dialog, on the button that went there.
    expect(document.activeElement).toBe(pickButton())

    await undo()
    expect(stored()).toMatchObject({ src: ORIGINAL.src, fileId: 'f-old' })
  })

  it('takes the picked image\'s alt text when this one has none, and drops the old file id for one without', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    field('alt').value = ''
    field('alt').dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    pickButton()!.click()
    await settle()
    calls[0].resolve([
      { src: 'https://cdn.example.com/d.png', altText: '狗' },
    ])
    await settle()
    expect(stored()).toMatchObject({
      src: 'https://cdn.example.com/d.png',
      width: 640,
      height: 480,
      altText: '狗',
    })
    expect(stored()).not.toHaveProperty('fileId')
  })

  it('stays open, and keeps what it wrote, on Esc or a press outside while choosing', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    field('caption').focus()
    field('caption').value = '新'
    field('caption').dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    pickButton()!.click()
    await settle()

    // In the site's dialog: neither the press nor its Esc is the panel's.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await escapeOn(panel()!)
    await settle()
    expect(panel()).not.toBeNull()
    expect(stored().caption).toBe('新')
    expect(calls[0].options.signal.aborted).toBe(false)

    calls[0].resolve([])
    await settle()
    // Afterwards both are the panel's again.
    await escapeOn(document.activeElement!)
    expect(panel()).toBeNull()
    expect(stored().caption).toBe('圖說')
  })

  it('changes nothing when none was chosen', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    const before = JSON.stringify(stored())
    pickButton()!.click()
    await settle()
    calls[0].resolve([])
    await settle()
    expect(JSON.stringify(stored())).toBe(before)
    expect(errorText()).toBeNull()
    expect(statusText()).toBeNull()
  })

  it('shows why, and changes nothing, when the site fails or its image can\'t be used', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    const before = JSON.stringify(stored())

    pickButton()!.click()
    await settle()
    calls[0].reject(new Error('沒有權限'))
    await settle()
    expect(errorText()).toBe('選擇失敗：沒有權限')

    pickButton()!.click()
    await settle()
    calls[1].resolve([
      { src: 'javascript:alert(1)' },
    ])
    await settle()
    expect(errorText()).toBe('有圖片的網址無法使用。')

    pickButton()!.click()
    await settle()
    calls[2].resolve([
      { src: 'https://cdn.example.com/missing.png' },
    ])
    await settle()
    expect(errorText()).toBe('無法載入這張圖片。')
    expect(JSON.stringify(stored())).toBe(before)
  })

  it('aborts when the panel closes, and ignores what comes back afterwards', async () => {
    const { pickImages, calls } = deferredPick()
    await mountImage({ pickImages })
    await openPanel()
    pickButton()!.click()
    await settle()
    toolbarEdit().click()
    await settle()
    expect(panel()).toBeNull()
    expect(calls[0].options.signal.aborted).toBe(true)
    calls[0].resolve([PICKED])
    await settle()
    expect(stored()).toMatchObject({ src: ORIGINAL.src, fileId: 'f-old' })

    // Opened again, a press outside closes it as before.
    await openPanel()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()
  })

  it('aborts when the editor unmounts', async () => {
    const { pickImages, calls } = deferredPick()
    const wrapper = await mountImage({ pickImages })
    await openPanel()
    pickButton()!.click()
    await settle()
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(calls[0].options.signal.aborted).toBe(true)
  })

  it('uses the label it is given, and still replaces with an uploaded file', async () => {
    const { pickImages } = deferredPick()
    const uploadImage = vi.fn(async () => ({
      src: 'https://cdn.example.com/up.png',
      width: 1,
      height: 2,
      fileId: 'f-up',
    }))
    await mountImage({ pickImages, uploadImage, pickImagesLabel: '從媒體庫選擇' })
    await openPanel()
    expect(pickButton()!.textContent!.trim()).toBe('從媒體庫選擇')
    Object.defineProperty(fileInput()!, 'files', {
      value: [
        new File(['x'], 'up.png', { type: 'image/png' }),
      ],
      configurable: true,
    })
    fileInput()!.dispatchEvent(new Event('change'))
    await settle()
    expect(stored()).toMatchObject({ src: 'https://cdn.example.com/up.png', fileId: 'f-up', caption: '圖說' })
    expect(pickImages).not.toHaveBeenCalled()
  })
})

describe('allowImageUrl: false', () => {
  it('shows the address without letting it be changed, and still offers files', async () => {
    await mountImage({
      allowImageUrl: false,
      uploadImage: vi.fn(),
    })
    await openPanel()
    const src = field('src')
    expect(src.readOnly).toBe(true)
    expect(src.value).toBe(ORIGINAL.src)
    // The first field there's something to type in takes the keyboard.
    expect(document.activeElement).toBe(field('alt'))

    src.value = 'https://example.com/other.png'
    src.dispatchEvent(new Event('input', { bubbles: true }))
    src.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    expect(stored()).toMatchObject({ src: ORIGINAL.src, fileId: 'f-old' })
    expect(fileInput()).not.toBeNull()
  })
})
