import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import type { ImageEditorCapability } from '../src'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { OPEN_IMAGE_DIALOG_COMMAND, registerImageEditor, RichEditor, useImageTools } from '../src'

/*
 * Inserting images goes through the two-step dialog: pick where they come from, then a
 * list to check, edit or remove each one before anything is uploaded.
 */

// happy-dom doesn't load images: a picture's size is read here, and a name with "missing" fails.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => {
    if (src.includes('missing'))
      throw new Error('load failed')
    return { width: 640, height: 480 }
  }),
}))

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  src?: string
  altText?: string
  width?: number
  height?: number
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}, plugin?: ImageEditorCapability) {
  const Register = defineComponent({
    setup() {
      if (plugin)
        registerImageEditor(useImageTools(), plugin)
      return () => null
    },
  })
  const wrapper = mount(RichEditor, {
    props,
    slots: {
      default: () => h(Register),
    },
    attachTo: document.body,
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
function blocks(editor: LexicalEditor) {
  return rootChildren(editor).map(node => (node.type === 'image'
    ? `image:${node.src}|${node.altText}|${node.width ?? '?'}x${node.height ?? '?'}`
    : `${node.type}:${textOf(node)}`))
}

function setParagraph(editor: LexicalEditor, text = '') {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
}

async function openDialog(editor: LexicalEditor) {
  editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
  await settle()
}

async function settle() {
  for (let i = 0; i < 4; i++)
    await flushPromises()
}

const dialog = () => document.querySelector<HTMLElement>('.hlx-image-dialog')
const title = () => dialog()!.querySelector('.hlx-image-dialog-title')!.textContent!.trim()
const urlInput = () => dialog()!.querySelector<HTMLInputElement>('input[name="src"]')!
const fileInput = () => dialog()?.querySelector<HTMLInputElement>('input[type="file"]') ?? null
const dropzone = () => dialog()?.querySelector<HTMLElement>('.hlx-image-dropzone') ?? null
function rows() {
  return [
    ...dialog()!.querySelectorAll<HTMLElement>('[data-image-dialog-row]'),
  ]
}
function button(text: string, within: HTMLElement = dialog()!) {
  return [
    ...within.querySelectorAll<HTMLButtonElement>('button'),
  ]
    .find(item => item.textContent!.trim() === text || item.getAttribute('aria-label') === text)
}
const insertButton = () => dialog()!.querySelector<HTMLButtonElement>('button[data-primary]')!
const alertText = () => dialog()?.querySelector('[role="alert"]')?.textContent ?? null
function checkbox(label: string, within: HTMLElement = dialog()!) {
  return [
    ...within.querySelectorAll('label'),
  ]
    .find(item => item.textContent!.includes(label))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null
}

function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

/** Waits out the pause before a typed address is loaded. */
async function typeUrl(value: string) {
  fill(urlInput(), value)
  await new Promise(resolve => setTimeout(resolve, 350))
  await settle()
}

async function chooseFiles(...files: File[]) {
  Object.defineProperty(fileInput()!, 'files', { value: files, configurable: true })
  fileInput()!.dispatchEvent(new Event('change'))
  await settle()
}

function transfer(files: File[]) {
  const data = new DataTransfer()
  for (const file of files)
    data.items.add(file)
  return data
}

async function insert() {
  insertButton().click()
  await settle()
}

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

function png(name = 'a.png') {
  return new File([
    'x'.repeat(2048),
  ], name, { type: 'image/png' })
}
const gif = (name = 'b.gif') => new File(['x'], name, { type: 'image/gif' })

function instantUpload() {
  return vi.fn(async (file: File, _options?: { keepOriginal?: boolean }) => ({
    src: `https://cdn.example.com/${file.name}`,
    width: 100,
    height: 50,
  }))
}

describe('choosing where images come from', () => {
  it('adds a loaded address to the list and inserts it with its size, leaving the caret after it', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await openDialog(editor)
    expect(title()).toBe('插入圖片')
    await typeUrl('https://example.com/pics/cat.png')
    expect(dialog()!.textContent).toContain('640 × 480')
    button('加入')!.click()
    await settle()

    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('cat.png')
    expect(rows()[0].textContent).toContain('640 × 480 · 來自連結')
    await insert()

    expect(dialog()).toBeNull()
    expect(blocks(editor)).toEqual(['image:https://example.com/pics/cat.png||640x480', 'paragraph:'])
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getType()).toBe('paragraph')
    })
  })

  it('adds an address on Enter, even before it has loaded, then inserts on the next Enter', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await openDialog(editor)
    fill(urlInput(), 'https://example.com/a.png')
    await settle()
    urlInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(rows()).toHaveLength(0)
    await new Promise(resolve => setTimeout(resolve, 350))
    await settle()
    expect(rows()).toHaveLength(1)
    expect(document.activeElement).toBe(insertButton())
  })

  it('splits a paragraph with text at the caret', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'text')
    await openDialog(editor)
    await typeUrl('https://example.com/a.png')
    button('加入')!.click()
    await settle()
    await insert()
    expect(blocks(editor)).toEqual(['paragraph:text', 'image:https://example.com/a.png||640x480', 'paragraph:'])
  })

  it.each([
    ['javascript:alert(1)'],
    ['https://example.com/missing.png'],
  ])('shows an error for %j and adds nothing', async (url) => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await openDialog(editor)
    await typeUrl(url)
    expect(alertText()).toBeTruthy()
    expect(button('加入')!.disabled).toBe(true)
    expect(dialog()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(0)
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(false)
  })

  it('offers no files without uploadImage, and ignores dropped ones', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await openDialog(editor)
    expect(fileInput()).toBeNull()
    expect(dropzone()).toBeNull()
    dialog()!.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
      dataTransfer: transfer([
        png(),
      ]),
    }))
    await settle()
    expect(dialog()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(0)
    expect(urlInput()).not.toBeNull()
  })

  it('takes only images, whether chosen, dropped or pasted', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(alertText()).toBe('請選擇圖片檔。')
    expect(dropzone()).not.toBeNull()

    dropzone()!.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
      dataTransfer: transfer([
        png('one.png'),
        new File(['x'], 'b.txt', { type: 'text/plain' }),
        png('two.png'),
      ]),
    }))
    await settle()
    expect(rows().map(row => row.querySelector('.hlx-image-row-name')!.textContent)).toEqual(['one.png', 'two.png'])

    dialog()!.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: transfer([
        png('three.png'),
      ]),
      bubbles: true,
      cancelable: true,
    }))
    await settle()
    expect(rows()).toHaveLength(3)
    expect(uploadImage).not.toHaveBeenCalled()
  })
})

describe('the list', () => {
  it('lists each file, uploads nothing until inserting, then inserts them in order as one undo step', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor, 'keep')
    await openDialog(editor)
    await chooseFiles(png('one.png'), png('two.png'))

    expect(title()).toBe('插入 2 張圖片')
    expect(insertButton().textContent).toContain('插入 2 張圖片')
    expect(rows()[0].querySelector('img')).not.toBeNull()
    expect(rows()[0].textContent).toContain('one.png')
    expect(rows()[0].textContent).toContain('640 × 480 · 2 KB · PNG')
    expect(dialog()!.textContent).toContain('按插入之前不會上傳')
    expect(uploadImage).not.toHaveBeenCalled()

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await settle()
    expect(dialog()).toBeNull()
    expect(uploadImage.mock.calls.map(call => call[0].name)).toEqual(['one.png', 'two.png'])
    expect(blocks(editor)).toEqual([
      'paragraph:keep',
      'image:https://cdn.example.com/one.png||100x50',
      'image:https://cdn.example.com/two.png||100x50',
      'paragraph:',
    ])
    expect(JSON.stringify(rootChildren(editor))).not.toContain('blob:')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await settle()
    expect(blocks(editor)).toEqual(['paragraph:keep'])
  })

  it('inserts what uploaded and reports what failed, as pasting does', async () => {
    const uploadImage = vi.fn(async (file: File) => {
      if (file.name === 'bad.png')
        throw new Error('disk full')
      return { src: `https://cdn.example.com/${file.name}`, width: 1, height: 1 }
    })
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('good.png'), png('bad.png'))
    await insert()
    expect(blocks(editor).filter(line => line.startsWith('image:'))).toEqual(['image:https://cdn.example.com/good.png||1x1'])
    expect(document.querySelector('.hlx-image-upload [role="alert"]')!.textContent).toContain('1')
  })

  it('removes rows, renames itself, and goes back to the start when empty', async () => {
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'), png('two.png'))
    button('移除 one.png')!.click()
    await settle()
    expect(rows()).toHaveLength(1)
    expect(title()).toBe('插入圖片')
    expect(insertButton().textContent).toContain('插入圖片')

    button('移除 two.png')!.click()
    await settle()
    expect(dialog()!.querySelectorAll('[data-image-dialog-row]')).toHaveLength(0)
    expect(dropzone()).not.toBeNull()
  })

  it('adds more files after the ones there', async () => {
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'))
    expect(button('加入更多')).toBeTruthy()
    await chooseFiles(png('two.png'))
    expect(rows().map(row => row.querySelector('.hlx-image-row-name')!.textContent)).toEqual(['one.png', 'two.png'])
  })

  it('closes at once when empty, and asks first when there is something to lose', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor, 'keep')
    await openDialog(editor)
    pressEscape()
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(editor.getRootElement())

    await openDialog(editor)
    await chooseFiles(png())
    pressEscape()
    await settle()
    expect(dialog()).not.toBeNull()
    expect(alertText()).toContain('要放棄這些圖片嗎？')
    button('繼續編輯')!.click()
    await settle()
    expect(rows()).toHaveLength(1)

    button('關閉')!.click()
    await settle()
    button('放棄')!.click()
    await settle()
    expect(dialog()).toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(blocks(editor)).toEqual(['paragraph:keep'])
  })
})

describe('the dialog opened from a removed trigger', () => {
  // The slash menu deletes its "/query" text and opens the dialog in one update, so
  // the selection saved at that moment points at a text node that is then removed.
  async function openAfterRemovingText(editor: LexicalEditor) {
    setParagraph(editor, '/image')
    editor.update(() => {
      const text = $getRoot().getFirstDescendant()
      if ($isTextNode(text))
        text.spliceText(0, text.getTextContentSize(), '', true)
      editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined)
    }, { discrete: true })
    await settle()
  }

  it('cancels without a selection error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor()
    await openAfterRemovingText(editor)
    expect(dialog()).not.toBeNull()
    pressEscape()
    await settle()
    const logged = error.mock.calls.flat().map(String).join('\n')
    error.mockRestore()
    expect(logged).not.toContain('Point.getNode')
    expect(dialog()).toBeNull()
    expect(blocks(editor)).toEqual(['paragraph:'])
  })

  it('still inserts after the trigger is gone', async () => {
    const { editor } = mountEditor()
    await openAfterRemovingText(editor)
    await typeUrl('https://example.com/a.png')
    button('加入')!.click()
    await settle()
    await insert()
    expect(blocks(editor)).toEqual(['image:https://example.com/a.png||640x480', 'paragraph:'])
  })
})

describe('location and keeping the original', () => {
  function privacy(options: { failStrip?: boolean } = {}) {
    return {
      detectGps: vi.fn(async (file: File) => (file.name.startsWith('gps')
        ? { latitude: 25, longitude: 121 }
        : null)),
      stripGps: vi.fn(async (file: File) => {
        if (options.failStrip)
          throw new Error('cannot')
        return new File(['clean'], file.name, { type: file.type })
      }),
    }
  }

  it('offers to remove the location of photos that have one, and uploads the cleaned file', async () => {
    const uploadImage = instantUpload()
    const imagePrivacy = privacy()
    const { editor } = mountEditor({ uploadImage, imagePrivacy })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('gps.png'), png('plain.png'))
    const remove = checkbox('上傳前移除 GPS', rows()[0])!
    expect(remove.checked).toBe(true)
    expect(checkbox('上傳前移除 GPS', rows()[1])).toBeNull()
    await insert()
    expect(imagePrivacy.stripGps).toHaveBeenCalledOnce()
    const uploaded = uploadImage.mock.calls.map(call => call[0])
    expect(uploaded[0].size).toBe(5)
    expect(uploaded[1].name).toBe('plain.png')
  })

  it('uploads the original when the author keeps the location', async () => {
    const uploadImage = instantUpload()
    const original = png('gps.png')
    const { editor } = mountEditor({
      uploadImage,
      imagePrivacy: privacy(),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(original)
    const remove = checkbox('上傳前移除 GPS')!
    remove.checked = false
    remove.dispatchEvent(new Event('change'))
    await settle()
    await insert()
    expect(uploadImage.mock.calls[0][0]).toBe(original)
  })

  it('stops when the location can\'t be removed, until the author keeps it or removes the photo', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({
      uploadImage,
      imagePrivacy: privacy({ failStrip: true }),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('gps.png'))
    await insert()
    expect(dialog()).not.toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(rows()[0].textContent).toContain('無法移除這張圖片的位置')
    expect(dialog()!.textContent).toContain('保留位置或移除標出的圖片才能繼續')
    expect(insertButton().disabled).toBe(true)

    const remove = checkbox('上傳前移除 GPS')!
    remove.checked = false
    remove.dispatchEvent(new Event('change'))
    await settle()
    expect(insertButton().disabled).toBe(false)
    await insert()
    expect(uploadImage).toHaveBeenCalledOnce()
  })

  it('passes keepOriginal to the upload only when the author asks', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage, allowKeepOriginal: true })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'))
    const keep = checkbox('保留原圖（不壓縮）')!
    keep.checked = true
    keep.dispatchEvent(new Event('change'))
    await settle()
    await insert()
    expect(uploadImage.mock.calls[0]).toEqual([
      expect.any(File),
      { keepOriginal: true },
    ])

    await openDialog(editor)
    await chooseFiles(png('two.png'))
    await insert()
    expect(uploadImage.mock.calls[1]).toHaveLength(1)
  })

  it('has no keep-original choice unless the site allows it', async () => {
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png())
    expect(checkbox('保留原圖')).toBeNull()
  })
})

describe('editing from the list', () => {
  it('offers editing only when an editor is registered, and not for animated or vector images', async () => {
    const edit = vi.fn(async (file: File) => ({
      file: new File(['edited'], file.name, { type: file.type }),
      summary: '已裁切',
    }))
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    }, { edit })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'), gif('two.gif'))
    expect(button('編輯', rows()[0])).toBeTruthy()
    expect(button('編輯', rows()[1])).toBeUndefined()
    expect(rows()[1].textContent).toContain('動畫或向量圖，編輯後會變成靜態圖')
  })

  it('has no edit button without an editor', async () => {
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png())
    expect(button('編輯', rows()[0])).toBeUndefined()
  })

  it('shows what was edited and uploads the edited file', async () => {
    const uploadImage = instantUpload()
    const edited = new File(['edited'], 'one.png', { type: 'image/png' })
    const edit = vi.fn(async () => ({ file: edited, summary: '已裁切' }))
    const { editor } = mountEditor({
      uploadImage,
      imagePrivacy: {
        detectGps: async () => ({ latitude: 1, longitude: 1 }),
        stripGps: async (file: File) => file,
      },
    }, { edit })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'))
    button('編輯', rows()[0])!.click()
    await settle()
    expect(edit).toHaveBeenCalledOnce()
    expect(rows()[0].textContent).toContain('已編輯')
    expect(rows()[0].textContent).toContain('已裁切')
    expect(button('重新編輯', rows()[0])).toBeTruthy()
    expect(checkbox('上傳前移除 GPS', rows()[0])).toBeNull()
    await insert()
    expect(uploadImage.mock.calls[0][0]).toBe(edited)
  })

  it('keeps the row as it was when editing is cancelled', async () => {
    const edit = vi.fn(async () => null)
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    }, { edit })
    setParagraph(editor)
    await openDialog(editor)
    await chooseFiles(png('one.png'))
    button('編輯', rows()[0])!.click()
    await settle()
    expect(rows()[0].textContent).not.toContain('已編輯')
  })
})
