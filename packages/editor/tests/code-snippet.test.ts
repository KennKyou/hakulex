import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createCodeSnippetNode, $isCodeSnippetNode, builtinTransformers, RichEditor, serializeEditorState } from '../src'

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
const snippet = (files: unknown) => ({ type: 'code-snippet', version: 1, files })

async function mountEditor(value: SerializedEditorState) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const toMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

describe('stored data', () => {
  it('comes out as it went in, with fields it doesn\'t know', async () => {
    const value = doc(snippet([
      {
        filename: 'a.ts',
        code: 'x',
        language: 'ts',
        highlightLines: [1],
        extra: { keep: true },
      },
    ]))
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isCodeSnippetNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it.each([
    [undefined],
    ['x'],
    [
      [
        1,
        null,
        { filename: 1 },
      ],
    ],
  ])('takes files that aren\'t valid, and leaves them as they are: %o', async (files) => {
    const value = doc(snippet(files))
    const { editor, wrapper } = await mountEditor(value)
    expect(read(editor)).toEqual(value.root.children)
    expect(wrapper.find('[role="tab"]').exists()).toBe(false)
  })

  it('keeps a field on the block it doesn\'t know', async () => {
    const value = doc({
      ...snippet([]),
      theme: 'dark',
    })
    const { editor } = await mountEditor(value)
    expect(read(editor)[0].theme).toBe('dark')
  })

  it('shows what the renderer shows', async () => {
    const { wrapper } = await mountEditor(doc(snippet([
      { filename: 'a.ts', code: 'x' },
      { filename: 'b.ts', code: 'y' },
    ])))
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['a.ts', 'b.ts'])
  })

  it('reads as its code, for copying and search', async () => {
    const { editor } = await mountEditor(doc(snippet([
      { filename: 'a.ts', code: '甲' },
      { filename: 'b.ts', code: '乙' },
    ])))
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toContain('甲\n乙')
  })

  it('can be created from code', async () => {
    const { editor } = await mountEditor(doc({
      ...element,
      type: 'paragraph',
      textFormat: 0,
      textStyle: '',
      children: [],
    }))
    editor.update(() => {
      $getRoot().append($createCodeSnippetNode([
        { filename: 'a.ts', code: 'x' },
      ]))
    }, { discrete: true })
    expect(read(editor).at(-1)).toEqual(snippet([
      { filename: 'a.ts', code: 'x' },
    ]))
  })
})

describe('markdown', () => {
  it('exports each file, with a fence longer than what is in the code, and quotes escaped', async () => {
    const { editor } = await mountEditor(doc(snippet([
      { filename: 'a"b.md', code: 'x ``` y', language: 'markdown' },
      { filename: '', code: 'z' },
    ])))
    expect(toMarkdown(editor)).toBe([
      '::: code-snippet',
      '::: file{name="a\\"b.md" lang="markdown"}',
      '````markdown',
      'x ``` y',
      '````',
      ':::',
      '::: file{name="untitled" lang=""}',
      '```',
      'z',
      '```',
      ':::',
      ':::',
    ].join('\n'))
  })

  it('exports nothing it can\'t read as a file', async () => {
    const { editor } = await mountEditor(doc(snippet('x')))
    expect(toMarkdown(editor)).toBe('::: code-snippet\n:::')
  })
})
