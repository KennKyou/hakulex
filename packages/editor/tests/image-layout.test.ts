import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { ImageNode } from '../src'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $getRoot, HISTORY_PUSH_TAG, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isImageNode, builtinTransformers, OPEN_IMAGE_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

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
function image(extra: Record<string, unknown> = {}) {
  return {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'a',
    ...extra,
  }
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
function documentWith(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}

async function mountEditor(value: SerializedEditorState) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const stored = (editor: LexicalEditor) => (serializeEditorState(editor.getEditorState()).root.children as unknown as Json[])[0]
const block = () => document.querySelector<HTMLElement>('.hlx-image-block')!
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="圖片"]')!
const layoutSelect = () => panel().querySelector<HTMLSelectElement>('select[name="layout"]')!

/** Opens the panel beside the image, where each change is written as it is made. */
async function openPanel(editor: LexicalEditor) {
  const key = editor.read(() => $getRoot().getChildren().find($isImageNode)!.getKey())
  editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, { nodeKey: key })
  await flushPromises()
}
async function choose(value: string) {
  layoutSelect().value = value
  layoutSelect().dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

describe('image layout in the editor', () => {
  it.each(['float-left', 'float-right'])('marks the block for %s', async (layout) => {
    await mountEditor(documentWith(image({ layout })))
    expect(block().dataset.layout).toBe(layout)
  })

  it('puts the display width on the floating block, not on the picture', async () => {
    await mountEditor(documentWith(image({ layout: 'float-left', displayWidth: 30 })))
    expect(block().style.getPropertyValue('--hlx-image-width')).toBe('30%')
    expect(block().querySelector<HTMLElement>('img.hlx-image')!.style.width).toBe('')
  })

  it.each([
    ['align-left'],
    ['"><x'],
    [42],
  ])('shows %j as the default, and outputs it as it was', async (layout) => {
    const value = documentWith(image({ layout, displayWidth: 30 }))
    const { editor } = await mountEditor(value)
    expect(block().hasAttribute('data-layout')).toBe(false)
    expect(block().querySelector<HTMLElement>('img.hlx-image')!.style.width).toBe('30%')
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
  })

  it('follows a change to the node, and undo', async () => {
    const { editor } = await mountEditor(documentWith(image(), paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.update(() => {
      const node = $getRoot().getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        layout: 'float-right',
        displayWidth: 25,
      })
    }, { discrete: true, tag: HISTORY_PUSH_TAG })
    await flushPromises()
    expect(block().dataset.layout).toBe('float-right')
    expect(block().style.getPropertyValue('--hlx-image-width')).toBe('25%')
    expect(stored(editor)).toMatchObject({ layout: 'float-right' })
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(block().hasAttribute('data-layout')).toBe(false)
    expect(block().style.getPropertyValue('--hlx-image-width')).toBe('')
    expect(stored(editor)).not.toHaveProperty('layout')
  })

  it('follows a resize of a floating image', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'float-left', displayWidth: 30 })))
    editor.update(() => ($getRoot().getFirstChild() as ImageNode).setDisplayWidth(60), { discrete: true })
    await flushPromises()
    expect(block().style.getPropertyValue('--hlx-image-width')).toBe('60%')
  })
})

describe('choosing a layout', () => {
  it.each([
    ['float-left', 'float-left'],
    ['float-right', 'float-right'],
  ])('sets %s from the dialog', async (choice, layout) => {
    const { editor } = await mountEditor(documentWith(image()))
    await openPanel(editor)
    expect(layoutSelect().value).toBe('')
    await choose(choice)
    expect(stored(editor)).toMatchObject({ layout })
  })

  it('removes the layout when set back to the default', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'float-left' })))
    await openPanel(editor)
    expect(layoutSelect().value).toBe('float-left')
    await choose('')
    expect(stored(editor)).not.toHaveProperty('layout')
  })

  it('leaves a layout it can\'t show alone unless one is chosen', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'align-left' })))
    await openPanel(editor)
    expect(layoutSelect().value).toBe('')
    panel().querySelector<HTMLInputElement>('input[name="alt"]')!.value = 'new'
    panel().querySelector<HTMLInputElement>('input[name="alt"]')!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(stored(editor)).toMatchObject({ layout: 'align-left', altText: 'new' })
  })

  it('keeps the layout when the picture changes', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'float-left', thumbhash: 'x' })))
    editor.update(() => {
      const node = $getRoot().getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        src: 'https://example.com/b.png',
      })
    }, { discrete: true })
    expect(stored(editor)).toMatchObject({ layout: 'float-left' })
    expect(stored(editor)).not.toHaveProperty('thumbhash')
  })
})

describe('exporting a layout', () => {
  const html = (editor: LexicalEditor) => editor.read(() => $generateHtmlFromNodes(editor))
  function importHtml(editor: LexicalEditor, source: string) {
    const dom = new DOMParser().parseFromString(source, 'text/html')
    editor.update(() => {
      $getRoot().clear().append(...$generateNodesFromDOM(editor, dom).filter($isImageNode), $createParagraphNode())
    }, { discrete: true })
  }

  it.each([
    ['without a caption', {}],
    [
      'with a caption',
      { caption: 'cap' },
    ],
  ])('survives HTML %s', async (_name, extra) => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'float-left', ...extra })))
    const source = html(editor)
    expect(source).toContain('data-layout="float-left"')
    importHtml(editor, source)
    expect(stored(editor)).toMatchObject({ layout: 'float-left', ...extra })
  })

  it('adds nothing to an image without one', async () => {
    const { editor } = await mountEditor(documentWith(image()))
    const source = html(editor)
    expect(source).not.toContain('data-layout')
    importHtml(editor, source)
    expect(stored(editor)).not.toHaveProperty('layout')
  })

  it('takes only what it can show from HTML', async () => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    importHtml(editor, '<img src="https://example.com/a.png" alt="a" data-layout="align-left;x">')
    expect(stored(editor).type).toBe('image')
    expect(stored(editor)).not.toHaveProperty('layout')
  })

  it('doesn\'t output a layout it can\'t show to HTML', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'align-left' })))
    expect(html(editor)).not.toContain('data-layout')
  })

  it('loses it in markdown, keeping the rest', async () => {
    const { editor } = await mountEditor(documentWith(image({ layout: 'float-left' })))
    const markdown = editor.read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).toContain('![a](https://example.com/a.png)')
    editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
    expect(JSON.stringify(serializeEditorState(editor.getEditorState()))).toContain('https://example.com/a.png')
    expect(JSON.stringify(serializeEditorState(editor.getEditorState()))).not.toContain('float-left')
  })
})
