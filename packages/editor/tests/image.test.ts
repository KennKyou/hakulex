import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTransformers, ImageNode, RichEditor, serializeEditorState } from '../src'

// happy-dom doesn't load images, so the browser size probe is replaced.
vi.mock('../src/image/probe', () => ({
  probeImageSize: vi.fn(async (src: string) => {
    if (src.includes('missing'))
      throw new Error('load failed')
    return src.includes('other')
      ? { width: 300, height: 200 }
      : { width: 640, height: 480 }
  }),
}))

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  src?: string
  altText?: string
  width?: number
  height?: number
  thumbhash?: string
}

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
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

function paragraph(text: string) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children: [
      {
        type: 'text',
        version: 1,
        text,
        format: 0,
        style: '',
        mode: 'normal',
        detail: 0,
      },
    ],
  }
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

function setParagraph(editor: LexicalEditor, text = '') {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}

const dialog = () => document.querySelector<HTMLElement>('.hlx-image-dialog')
const imagePanel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')
const panelInput = (name: string) => imagePanel()!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
/** Enters an address in the panel, as a browser does on Enter. */
async function enter(input: HTMLInputElement, value: string) {
  fill(input, value)
  input.dispatchEvent(new Event('change'))
  await flushPromises()
  await flushPromises()
}
const key = (name: string) => new KeyboardEvent('keydown', { key: name })

function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

// Lexical adds an invisible <img> anchor next to trailing decorators; it isn't content.
const contentImage = () => document.querySelector('img:not([data-lexical-decorator-boundary])')

afterEach(() => {
  document.body.innerHTML = ''
})

describe('image document model', () => {
  it('round-trips src, altText, width and height through JSON', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ width: 1200, height: 800 })),
    })
    await flushPromises()
    expect(rootChildren(editor)[0]).toMatchObject({
      type: 'image',
      src: 'https://example.com/a.png',
      altText: 'cat',
      width: 1200,
      height: 800,
    })

    const reloaded = mountEditor({
      modelValue: editor.getEditorState().toJSON(),
    })
    await flushPromises()
    expect(blocks(reloaded.editor)[0]).toBe('image:https://example.com/a.png|cat|1200x800')
  })

  it('drops invalid sizes and unknown fields but still shows the image', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ width: -5, height: 1.5, retired: 'old' })),
    })
    await flushPromises()
    const [node] = rootChildren(editor)
    expect(node.width).toBeUndefined()
    expect(node.height).toBeUndefined()
    expect(node.retired).toBeUndefined()
    expect(document.querySelector('img.hlx-image')).not.toBeNull()
  })

  it('does not render an img for an unsafe stored src', async () => {
    mountEditor({
      modelValue: documentWith(image({ src: 'javascript:alert(1)', altText: 'safe text' })),
    })
    await flushPromises()
    expect(contentImage()).toBeNull()
    expect(document.querySelector('.hlx-image-invalid')?.textContent).toBe('safe text')
  })
})

describe('image markdown and HTML', () => {
  it('imports and exports a whole-line image', () => {
    const { editor } = mountEditor()
    const markdown = '![替代文字](https://example.com/a.png)'
    importMarkdown(editor, markdown)
    expect(blocks(editor)).toEqual(['image:https://example.com/a.png|替代文字|?x?'])
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe(markdown)
  })

  it('keeps brackets in alt text across export and import', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '![a \\[b\\]](https://example.com/a.png)')
    expect(blocks(editor)).toEqual(['image:https://example.com/a.png|a [b]|?x?'])
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe('![a \\[b\\]](https://example.com/a.png)')
  })

  it('does not import an unsafe image and keeps its text', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '![evil](javascript:alert(1))')
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(false)
    expect(textOf(rootChildren(editor)[0])).toContain('evil')
    expect(contentImage()).toBeNull()
  })

  it('does not turn an image inside a line of text into a block', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'before ![a](https://example.com/a.png) after')
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(false)
    const text = textOf(rootChildren(editor)[0])
    expect(text).toContain('before')
    expect(text).toContain('after')
  })

  it('exports HTML with src, alt and size', () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image({ width: 10, height: 20 })),
    })
    const element = editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().exportDOM(editor).element) as HTMLImageElement
    expect(element.tagName).toBe('IMG')
    expect(element.getAttribute('src')).toBe('https://example.com/a.png')
    expect(element.getAttribute('alt')).toBe('cat')
    expect(element.getAttribute('width')).toBe('10')
    expect(element.getAttribute('height')).toBe('20')
  })

  it('imports pasted HTML images as top-level nodes and drops unsafe ones', async () => {
    const { editor } = mountEditor()
    setParagraph(editor)
    const data = new DataTransfer()
    data.setData('text/html', '<p>one<img src="https://example.com/a.png" alt="cat" width="10" height="20">two</p><img src="javascript:alert(1)" alt="evil">')
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
    await flushPromises()

    const types = rootChildren(editor).map(node => node.type)
    expect(types).toContain('image')
    expect(types.filter(type => type === 'image')).toHaveLength(1)
    const nested = rootChildren(editor).flatMap(node => node.children ?? []).some(child => child.type === 'image')
    expect(nested).toBe(false)
    expect(blocks(editor).find(block => block.startsWith('image:'))).toBe('image:https://example.com/a.png|cat|10x20')
    expect(document.body.innerHTML).not.toContain('javascript:')
  })
})

// Inserting through the dialog is in image-dialog.test.ts.

describe('editing an image in the document', () => {
  const twoParagraphs = () => documentWith(paragraph('above'), image({ width: 10, height: 20 }), paragraph('below'))
  const figure = () => document.querySelector<HTMLElement>('.hlx-image-editor')!

  it('selects on click, deletes with Backspace and restores with undo', async () => {
    const { editor } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    figure().click()
    await flushPromises()
    expect(figure().hasAttribute('data-selected')).toBe(true)

    editor.dispatchCommand(KEY_BACKSPACE_COMMAND, key('Backspace'))
    await flushPromises()
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(false)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(rootChildren(editor).some(node => node.type === 'image')).toBe(true)
  })

  it('edits the same node in the panel from the toolbar, and the change can be undone', async () => {
    const { editor } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    figure().click()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.hlx-block-toolbar button')!.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(panelInput('src').value).toBe('https://example.com/a.png')
    expect(panelInput('alt').value).toBe('cat')

    fill(panelInput('alt'), 'dog')
    await flushPromises()
    expect(blocks(editor)).toEqual(['paragraph:above', 'image:https://example.com/a.png|dog|10x20', 'paragraph:below'])

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(blocks(editor)[1]).toBe('image:https://example.com/a.png|cat|10x20')
  })

  it('opens with Enter and refreshes the size when the URL changes', async () => {
    const { editor } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    figure().click()
    await flushPromises()
    editor.dispatchCommand(KEY_ENTER_COMMAND, key('Enter'))
    await flushPromises()
    await enter(panelInput('src'), 'https://example.com/other.png')
    expect(blocks(editor)).toEqual(['paragraph:above', 'image:https://example.com/other.png|cat|300x200', 'paragraph:below'])
  })

  it('refuses an unsafe URL when editing', async () => {
    const { editor } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    figure().click()
    await flushPromises()
    editor.dispatchCommand(KEY_ENTER_COMMAND, key('Enter'))
    await flushPromises()
    await enter(panelInput('src'), 'javascript:alert(1)')
    expect(imagePanel()!.querySelector('[role="alert"]')?.textContent).toBeTruthy()
    expect(blocks(editor)[1]).toBe('image:https://example.com/a.png|cat|10x20')
  })

  it('reaches the image with arrow keys and leaves on the other side', async () => {
    const { editor } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })

    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, key('ArrowDown'))
    await flushPromises()
    editor.getEditorState().read(() => {
      expect($isNodeSelection($getSelection())).toBe(true)
    })
    expect(figure().hasAttribute('data-selected')).toBe(true)

    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, key('ArrowDown'))
    await flushPromises()
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('below')
    })

    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, key('ArrowUp'))
    await flushPromises()
    editor.getEditorState().read(() => {
      expect($isNodeSelection($getSelection())).toBe(true)
    })

    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, key('ArrowUp'))
    await flushPromises()
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('above')
    })
  })

  it('does nothing on click while read-only', async () => {
    const { wrapper } = mountEditor({
      modelValue: twoParagraphs(),
    })
    await flushPromises()
    await wrapper.setProps({ editable: false })
    figure().click()
    await flushPromises()
    expect(figure().hasAttribute('data-selected')).toBe(false)
    expect(figure().querySelector('.hlx-image-edit')).toBeNull()
    expect(document.querySelector('img.hlx-image')).not.toBeNull()
  })
})

describe('fields kept from stored documents', () => {
  const kept = { thumbhash: 'abc=', accent: '#123456', layout: 'float-left' }
  const stored = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children[0]

  it('outputs them unchanged, without thumbhash and accent changing how the image looks', async () => {
    const value = documentWith(image({ thumbhash: kept.thumbhash, accent: kept.accent }))
    const { editor, wrapper } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
    const plain = mountEditor({
      modelValue: documentWith(image()),
    })
    await flushPromises()
    expect(wrapper.find('.hlx-image-block').html()).toBe(plain.wrapper.find('.hlx-image-block').html())
  })

  it('keeps them through a copy and an edit of other fields', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image(kept)),
    })
    await flushPromises()
    editor.update(() => {
      const node = $getRoot().getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        altText: 'new',
      })
    }, { discrete: true })
    expect(stored(editor)).toMatchObject({ ...kept, altText: 'new' })
    const copy = editor.read(() => ($getRoot().getFirstChild() as ImageNode).exportJSON())
    editor.update(() => {
      $getRoot().append(ImageNode.importJSON(copy))
    }, { discrete: true })
    expect(serializeEditorState(editor.getEditorState()).root.children[1]).toMatchObject(kept)
  })

  it('drops the ones describing the old picture when the source changes', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(image(kept)),
    })
    await flushPromises()
    editor.update(() => {
      const node = $getRoot().getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        src: 'https://example.com/other.png',
      })
    }, { discrete: true })
    const output = stored(editor)
    expect(output).not.toHaveProperty('thumbhash')
    expect(output).not.toHaveProperty('accent')
    expect(output).toMatchObject({ layout: 'float-left' })
  })

  it('outputs values of the wrong type as they were', async () => {
    const value = documentWith(image({
      thumbhash: 1,
      accent: null,
      layout: { a: 1 },
    }))
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
  })
})
