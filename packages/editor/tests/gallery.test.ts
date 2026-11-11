import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isGalleryNode, builtinTransformers, RichEditor, serializeEditorState } from '../src'

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
function doc(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}
function gallery(images: unknown, extra: Record<string, unknown> = {}) {
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

async function mountEditor(value: SerializedEditorState) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]

describe('stored data', () => {
  it('comes out as it went in, with no defaults added', async () => {
    const value = doc(gallery([A]))
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isGalleryNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
    expect('layout' in read(editor)[0]).toBe(false)
  })

  it.each([
    [
      'all fields',
      gallery([A], {
        layout: 'masonry',
        aspect: '1:1',
        fit: 'contain',
        maxItemHeight: 200,
        other: 1,
      }),
    ],
    [
      'bad images',
      gallery([
        1,
        null,
        { src: 'javascript:alert(1)' },
      ]),
    ],
    [
      'bad settings',
      gallery([A], {
        layout: 'x',
        aspect: 1,
        fit: null,
        maxItemHeight: 'y',
      }),
    ],
    [
      'no images',
      gallery('x'),
    ],
  ])('leaves %s as they are', async (_name, node) => {
    const value = doc(node)
    const { editor } = await mountEditor(value)
    expect(read(editor)).toEqual(value.root.children)
  })

  it('shows what the renderer shows, and nothing unsafe', async () => {
    const { wrapper } = await mountEditor(doc(gallery([
      A,
      { src: 'javascript:alert(1)' },
    ])))
    expect(wrapper.findAll('.hlx-gallery img').map(img => img.attributes('src'))).toEqual([A.src])
  })
})

describe('exporting', () => {
  it('goes to markdown as images, leaving out unsafe ones', async () => {
    const { editor } = await mountEditor(doc(gallery([
      A,
      { src: 'javascript:alert(1)', alt: 'x' },
      { src: '/b.png' },
    ])))
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe(`![甲](${A.src})\n![](/b.png)`)
  })

  it('goes to HTML as images', async () => {
    const { editor } = await mountEditor(doc(gallery([
      A,
      { src: 'javascript:alert(1)' },
    ])))
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
    const dom = new DOMParser().parseFromString(html, 'text/html')
    expect([
      ...dom.querySelectorAll('img'),
    ].map(img => img.getAttribute('src'))).toEqual([A.src])
    expect(dom.querySelector('img')!.getAttribute('alt')).toBe('甲')
  })
})
