import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $isImageNode, builtinTransformers, OPEN_IMAGE_DIALOG_COMMAND, RichEditor } from '../src'
import { probeImageSize } from '../src/image/probe'

vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async () => ({ width: 640, height: 480 })),
}))

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  src?: string
  altText?: string
  width?: number
  height?: number
  caption?: string
  displayWidth?: number
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const images = (editor: LexicalEditor) => rootChildren(editor).filter(node => node.type === 'image')

function documentWith(...children: Record<string, unknown>[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  } as unknown as SerializedEditorState
}
function image(extra: Record<string, unknown> = {}) {
  return {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'cat',
    ...extra,
  }
}

function setParagraph(editor: LexicalEditor, ...lines: string[]) {
  editor.update(() => {
    const root = $getRoot().clear()
    for (const line of lines.length
      ? lines
      : ['']) {
      const paragraph = $createParagraphNode()
      if (line)
        paragraph.append($createTextNode(line))
      root.append(paragraph)
    }
    root.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd()
  }, { discrete: true })
}

const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })

function clipboard(files: File[], entries: Record<string, string> = {}) {
  const data = new DataTransfer()
  for (const file of files)
    data.items.add(file)
  for (const [type, value] of Object.entries(entries))
    data.setData(type, value)
  return new ClipboardEvent('paste', { clipboardData: data, cancelable: true })
}

/** An upload the test finishes by hand, by file name. */
function deferredUpload() {
  const pending = new Map<string, { resolve: (value: unknown) => void, reject: (cause: Error) => void }>()
  const upload = vi.fn((file: File) => new Promise((resolve, reject) => {
    pending.set(file.name, { resolve, reject })
  }))
  return { upload, pending }
}

function instantUpload() {
  return vi.fn(async (file: File) => ({
    src: `https://cdn.example.com/${file.name}`,
    width: 100,
    height: 50,
  }))
}

const status = () => document.querySelector('.hlx-image-upload [role="status"]')
const failure = () => document.querySelector('.hlx-image-upload [role="alert"]')

describe('pasting image files', () => {
  it('uploads first, shows status, then inserts at the caret, and undoes in one step', async () => {
    const { upload, pending } = deferredUpload()
    const { editor } = mountEditor({ uploadImage: upload })
    setParagraph(editor, 'first', 'last')
    await flushPromises()

    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(images(editor)).toHaveLength(0)
    expect(status()?.textContent).toContain('上傳')

    pending.get('a.png')!.resolve({ src: 'https://cdn.example.com/a.png', width: 100, height: 50 })
    await flushPromises()

    expect(status()).toBeNull()
    expect(rootChildren(editor).map(node => node.type === 'image'
      ? 'image'
      : textOf(node))).toEqual(['first', 'image', 'last'])
    expect(images(editor)[0]).toMatchObject({ src: 'https://cdn.example.com/a.png', width: 100, height: 50 })
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('blob:')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
    expect(rootChildren(editor).map(textOf)).toEqual(['first', 'last'])
  })

  it('reads the size after loading when the upload gives none', async () => {
    const { editor } = mountEditor({
      uploadImage: vi.fn(async () => ({ src: 'https://cdn.example.com/a.png' })),
    })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    expect(images(editor)[0]).toMatchObject({ width: 640, height: 480 })
  })

  it('treats an image copied from a browser, with HTML but no plain text, as a file', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ], { 'text/html': '<img src="https://example.com/x.png">' }))
    await flushPromises()
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(images(editor)).toHaveLength(1)
    expect(images(editor)[0].src).toBe('https://cdn.example.com/a.png')
  })

  it('leaves content with plain text to the normal paste', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ], { 'text/plain': 'from a spreadsheet' }))
    await flushPromises()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(rootChildren(editor).map(textOf).join('')).toContain('from a spreadsheet')
  })

  it('does nothing without uploadImage, and shows no error', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'text')
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
    expect(failure()).toBeNull()
    expect(status()).toBeNull()
  })

  it('reports failures and keeps what succeeded, and the message can be closed', async () => {
    const uploadImage = vi.fn(async (file: File) => {
      if (file.name === 'bad.png')
        throw new Error('nope')
      if (file.name === 'unsafe.png')
        return { src: 'javascript:alert(1)' }
      return { src: `https://cdn.example.com/${file.name}`, width: 1, height: 1 }
    })
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png('good.png'),
      png('bad.png'),
      png('unsafe.png'),
    ])
    await flushPromises()

    expect(images(editor).map(node => node.src)).toEqual(['https://cdn.example.com/good.png'])
    expect(failure()?.textContent).toContain('2')

    document.querySelector<HTMLElement>('.hlx-image-upload button')!.click()
    await flushPromises()
    expect(failure()).toBeNull()
  })

  it('counts a failed size read as a failure', async () => {
    vi.mocked(probeImageSize).mockRejectedValueOnce(new Error('load failed'))
    const { editor } = mountEditor({
      uploadImage: vi.fn(async () => ({ src: 'https://cdn.example.com/a.png' })),
    })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
    expect(failure()?.textContent).toContain('1')
  })

  it('falls back to the end of the document when the paste position is gone, keeping edits', async () => {
    const { upload, pending } = deferredUpload()
    const { editor } = mountEditor({ uploadImage: upload })
    setParagraph(editor, 'gone', 'kept')
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()

    editor.update(() => {
      const [first, last] = $getRoot().getChildren()
      first.remove()
      last.selectEnd()
    }, { discrete: true })
    await flushPromises()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    pending.get('a.png')!.resolve({ src: 'https://cdn.example.com/a.png', width: 1, height: 1 })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()

    const kinds = rootChildren(editor).map(node => node.type === 'image'
      ? 'image'
      : textOf(node))
    expect(kinds[0]).toBe('kept')
    expect(kinds).toContain('image')
  })

  it('keeps the caret where the author moved it during the upload', async () => {
    const { upload, pending } = deferredUpload()
    const { editor } = mountEditor({ uploadImage: upload })
    setParagraph(editor, 'first', 'second')
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()

    editor.update(() => {
      $getRoot().getLastChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd()
    }, { discrete: true })
    pending.get('a.png')!.resolve({ src: 'https://cdn.example.com/a.png', width: 1, height: 1 })
    await flushPromises()

    expect(rootChildren(editor).map(node => node.type === 'image'
      ? 'image'
      : textOf(node))).toEqual(['first', 'image', 'second'])
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('second')
    })
  })

  it('does not insert while read-only, and reports it once editable again', async () => {
    const { upload, pending } = deferredUpload()
    const { editor, wrapper } = mountEditor({ uploadImage: upload })
    setParagraph(editor, 'text')
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    await wrapper.setProps({ editable: false })
    await flushPromises()
    const before = editor.getEditorState().toJSON()

    pending.get('a.png')!.resolve({ src: 'https://cdn.example.com/a.png', width: 1, height: 1 })
    await flushPromises()
    expect(editor.getEditorState().toJSON()).toEqual(before)
    expect(failure()).toBeNull()
    expect(status()).toBeNull()

    await wrapper.setProps({ editable: true })
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
    expect(failure()?.textContent).toContain('1')
    document.querySelector<HTMLElement>('.hlx-image-upload button')!.click()
    await flushPromises()
    expect(failure()).toBeNull()
  })

  it('ignores a result that arrives after unmounting', async () => {
    const { upload, pending } = deferredUpload()
    const { editor, wrapper } = mountEditor({ uploadImage: upload })
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      png(),
    ]))
    await flushPromises()
    wrapper.unmount()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    pending.get('a.png')!.resolve({ src: 'https://cdn.example.com/a.png', width: 1, height: 1 })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    expect(images(editor)).toHaveLength(0)
  })
})

describe('dropping image files', () => {
  it('inserts all images in order, skips other files, and undoes in one step', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage })
    setParagraph(editor, 'text')
    await flushPromises()
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png('one.png'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      png('two.png'),
    ])
    await flushPromises()

    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(images(editor).map(node => node.src)).toEqual([
      'https://cdn.example.com/one.png',
      'https://cdn.example.com/two.png',
    ])
    expect(failure()).toBeNull()

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
  })

  function dragEvent(type: string) {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        types: ['Files'],
        files: [
          png(),
        ],
      },
    })
    return event
  }

  it('marks the editor while files are dragged over it', async () => {
    const { editor } = mountEditor({
      uploadImage: instantUpload(),
    })
    await flushPromises()
    const root = editor.getRootElement()!
    root.dispatchEvent(dragEvent('dragenter'))
    expect(root.hasAttribute('data-image-drop')).toBe(true)
    root.dispatchEvent(dragEvent('dragleave'))
    expect(root.hasAttribute('data-image-drop')).toBe(false)
  })

  it.each([
    ['without uploadImage', {}],
    [
      'while read-only',
      {
        editable: false,
        uploadImage: () => Promise.reject(new Error('unused')),
      },
    ],
  ])('keeps the browser from opening a dropped file %s', async (_name, props) => {
    const { editor } = mountEditor(props)
    await flushPromises()
    const root = editor.getRootElement()!
    const over = dragEvent('dragover')
    const drop = dragEvent('drop')
    root.dispatchEvent(dragEvent('dragenter'))
    root.dispatchEvent(over)
    root.dispatchEvent(drop)
    await flushPromises()
    expect(over.defaultPrevented).toBe(true)
    expect(drop.defaultPrevented).toBe(true)
    expect(root.hasAttribute('data-image-drop')).toBe(false)
    expect(images(editor)).toHaveLength(0)
  })

  it('ignores pasted files while read-only', async () => {
    const uploadImage = instantUpload()
    const { editor } = mountEditor({ uploadImage, editable: false })
    await flushPromises()
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png(),
    ])
    await flushPromises()
    expect(uploadImage).not.toHaveBeenCalled()
  })
})

describe('caption and display width in the model', () => {
  it('round-trips through JSON', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({
        width: 800,
        height: 600,
        caption: 'A cat',
        displayWidth: 50,
      })),
    })
    await flushPromises()
    const json = editor.getEditorState().toJSON()
    expect(images(editor)[0]).toMatchObject({ caption: 'A cat', displayWidth: 50, width: 800 })

    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(images(reloaded)[0]).toMatchObject({ caption: 'A cat', displayWidth: 50 })
  })

  it.each([
    [
      'a caption that is not a string',
      { caption: 42 },
    ],
    [
      'a blank caption',
      { caption: '   ' },
    ],
    [
      'a width that is not a number',
      { displayWidth: 'wide' },
    ],
  ])('drops %s', async (_name, extra) => {
    const { editor } = mountEditor({
      modelValue: documentWith(image(extra)),
    })
    await flushPromises()
    expect(images(editor)[0].caption).toBeUndefined()
    expect(images(editor)[0].displayWidth).toBeUndefined()
    expect(document.querySelector('img.hlx-image')).not.toBeNull()
  })

  it('shows the caption and width in the editor', async () => {
    mountEditor({
      modelValue: documentWith(image({ caption: '<b>A cat</b>', displayWidth: 50 })),
    })
    await flushPromises()
    expect(document.querySelector('.hlx-image-block figure figcaption')?.textContent).toContain('<b>A cat</b>')
    expect(document.querySelector<HTMLElement>('img.hlx-image')?.style.width).toBe('50%')
  })
})

describe('caption and display width in markdown and HTML', () => {
  const LINE = '![alt](https://example.com/a.png "A \\"cat\\" here")'

  it('reads and writes a markdown title as the caption', async () => {
    const { editor } = mountEditor()
    editor.update(() => $convertFromMarkdownString(LINE, builtinTransformers), { discrete: true })
    await flushPromises()
    expect(images(editor)[0]).toMatchObject({ src: 'https://example.com/a.png', altText: 'alt', caption: 'A "cat" here' })
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe(LINE)
  })

  it('leaves the width out of markdown', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ displayWidth: 50 })),
    })
    await flushPromises()
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe('![cat](https://example.com/a.png)')
  })

  it('imports a figure with its caption and width', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([], {
      'text/html': '<figure><img src="https://example.com/a.png" alt="cat" width="10" height="20" style="width: 50%"><figcaption>A cat</figcaption></figure>',
    }))
    await flushPromises()

    expect(images(editor)).toHaveLength(1)
    expect(images(editor)[0]).toMatchObject({ caption: 'A cat', displayWidth: 50, width: 10 })
    expect(rootChildren(editor).map(textOf).join('')).not.toContain('A cat')
  })

  it('keeps a figure caption as text when its image is unsafe', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    await flushPromises()
    editor.dispatchCommand(PASTE_COMMAND, clipboard([], {
      'text/html': '<figure><img src="javascript:alert(1)"><figcaption>A cat</figcaption></figure>',
    }))
    await flushPromises()
    expect(images(editor)).toHaveLength(0)
    expect(rootChildren(editor).map(textOf).join('')).toContain('A cat')
  })

  it('exports a figure with a caption, and a plain img without', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ caption: 'A cat', displayWidth: 50, width: 10 }), image()),
    })
    await flushPromises()
    editor.read(() => {
      const [withCaption, plain] = $getRoot().getChildren()
      if (!$isImageNode(withCaption) || !$isImageNode(plain))
        throw new Error('expected images')
      const figure = withCaption.exportDOM().element as HTMLElement
      expect(figure.tagName).toBe('FIGURE')
      expect(figure.querySelector('figcaption')?.textContent).toBe('A cat')
      const img = figure.querySelector('img')!
      expect(img.getAttribute('width')).toBe('10')
      expect(img.style.width).toBe('50%')
      expect((plain.exportDOM().element as HTMLElement).tagName).toBe('IMG')
    })
  })
})

describe('caption and display width in the dialog', () => {
  function fill(field: HTMLInputElement, value: string) {
    field.value = value
    field.dispatchEvent(new Event('input'))
  }
  async function openFor(editor: LexicalEditor) {
    const key = editor.getEditorState().read(() => $getRoot().getChildren().find($isImageNode)!.getKey())
    editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, { nodeKey: key })
    await flushPromises()
  }

  const panelInput = (name: string) => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
  const panelError = () => document.querySelector('.hlx-block-panel [role="alert"]')?.textContent ?? null

  it('prefills, updates and clears in the panel, and each change undoes', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({
        width: 10,
        height: 20,
        caption: 'Old',
        displayWidth: 40,
      })),
    })
    await flushPromises()
    await openFor(editor)
    expect(panelInput('caption').value).toBe('Old')
    expect(panelInput('displayWidth').value).toBe('40')

    fill(panelInput('caption'), 'New')
    await flushPromises()
    expect(images(editor)[0].caption).toBe('New')
    expect(images(editor)[0].width).toBe(10)
    panelInput('caption').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))

    fill(panelInput('caption'), '')
    await flushPromises()
    panelInput('caption').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    fill(panelInput('displayWidth'), '')
    await flushPromises()
    expect(images(editor)[0].caption).toBeUndefined()
    expect(images(editor)[0].displayWidth).toBeUndefined()

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(images(editor)[0].caption).toBe('New')
  })

  it.each(['5', '101', 'wide'])('rejects a width of %j and changes nothing', async (value) => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ displayWidth: 40 })),
    })
    await flushPromises()
    await openFor(editor)
    fill(panelInput('displayWidth'), value)
    await flushPromises()
    expect(panelError()).toContain('10 到 100')
    expect(images(editor)[0].displayWidth).toBe(40)
  })
})

describe('resizing', () => {
  const handle = (side: string) => document.querySelector<HTMLElement>(`.hlx-image-resize[data-side="${side}"]`)
  function pointer(type: string, clientX: number) {
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      button: 0,
    })
  }

  /** Selected image rendered 400px wide in an 800px wide block. */
  async function mountSelected(extra: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const width = this.tagName === 'IMG'
        ? 400
        : 800
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 300,
        width,
        height: 300,
        toJSON: () => ({}),
      } as DOMRect
    })
    const setup = mountEditor({
      modelValue: documentWith(image({ width: 800, height: 600, ...extra })),
      ...props,
    })
    await flushPromises()
    document.querySelector<HTMLElement>('.hlx-image-editor')!.click()
    await flushPromises()
    return setup
  }
  const shownWidth = () => document.querySelector<HTMLElement>('img.hlx-image')?.style.width

  it('previews while dragging, commits once on release, and undoes in one step', async () => {
    const { editor } = await mountSelected({ displayWidth: 50 })
    handle('right')!.dispatchEvent(pointer('pointerdown', 600))
    window.dispatchEvent(pointer('pointermove', 680))
    await flushPromises()

    // 80px outward grows a centered image by 160px: (400 + 160) / 800 = 70%.
    expect(shownWidth()).toBe('70%')
    expect(images(editor)[0].displayWidth).toBe(50)

    window.dispatchEvent(pointer('pointerup', 680))
    await flushPromises()
    expect(images(editor)[0].displayWidth).toBe(70)
    expect(shownWidth()).toBe('70%')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(images(editor)[0].displayWidth).toBe(50)
  })

  it('mirrors the left handle', async () => {
    const { editor } = await mountSelected()
    handle('left')!.dispatchEvent(pointer('pointerdown', 200))
    window.dispatchEvent(pointer('pointermove', 240))
    window.dispatchEvent(pointer('pointerup', 240))
    await flushPromises()
    // 40px inward shrinks it by 80px: (400 - 80) / 800 = 40%.
    expect(images(editor)[0].displayWidth).toBe(40)
  })

  it.each([
    ['small', -2000, 10],
    ['large', 4000, 100],
  ])('clamps a drag that goes too %s', async (_name, x, expected) => {
    const { editor } = await mountSelected()
    handle('right')!.dispatchEvent(pointer('pointerdown', 600))
    window.dispatchEvent(pointer('pointermove', x))
    window.dispatchEvent(pointer('pointerup', x))
    await flushPromises()
    expect(images(editor)[0].displayWidth).toBe(expected)
  })

  it('cancels with Esc', async () => {
    const { editor } = await mountSelected({ displayWidth: 50 })
    handle('right')!.dispatchEvent(pointer('pointerdown', 600))
    window.dispatchEvent(pointer('pointermove', 680))
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(shownWidth()).toBe('50%')

    window.dispatchEvent(pointer('pointerup', 680))
    await flushPromises()
    expect(images(editor)[0].displayWidth).toBe(50)
  })

  it('does not commit a click on the handle', async () => {
    const { editor } = await mountSelected()
    handle('right')!.dispatchEvent(pointer('pointerdown', 600))
    window.dispatchEvent(pointer('pointerup', 600))
    await flushPromises()
    expect(images(editor)[0].displayWidth).toBeUndefined()
  })

  it('has handles only on a selected, editable image', async () => {
    mountEditor({
      modelValue: documentWith(image()),
    })
    await flushPromises()
    expect(handle('right')).toBeNull()
    document.body.innerHTML = ''

    await mountSelected({}, { editable: false })
    expect(handle('right')).toBeNull()
  })
})
