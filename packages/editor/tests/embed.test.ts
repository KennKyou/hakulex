import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createEmbedNode, $isEmbedNode, RichEditor, serializeEditorState } from '../src'

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
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}
function embed(url: unknown, source: unknown) {
  return {
    type: 'embed',
    version: 1,
    url,
    source,
  }
}

async function mountEditor(value: SerializedEditorState) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]

describe('stored data', () => {
  it.each([
    ['youtube'],
    [null],
    ['thinking'],
    ['made-up'],
  ])('comes out as it went in with source %s', async (source) => {
    const value = doc(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', source))
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isEmbedNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it('treats a URL that isn\'t text as empty', async () => {
    const { editor } = await mountEditor(doc(embed(7, null)))
    expect(read(editor)[0]).toEqual(embed('', null))
  })

  it('never puts third-party content on the page', async () => {
    await mountEditor(doc(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube')))
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('works out the source when created from code', async () => {
    const { editor } = await mountEditor(doc())
    editor.update(() => {
      $getRoot().append($createEmbedNode('https://youtu.be/dQw4w9WgXcQ'))
    }, { discrete: true })
    expect(read(editor).at(-1)).toEqual(embed('https://youtu.be/dQw4w9WgXcQ', 'youtube'))
  })
})
