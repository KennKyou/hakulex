import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createRangeSelection, $createTextNode, $getRoot, $getSelection, $insertNodes, $isRangeSelection, $setSelection, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createMentionNode, $isMentionNode, builtinTransformers, RichEditor, serializeEditorState } from '../src'
import { isMarkdown } from '../src/paste/detect'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

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
function doc(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}
const octocat = {
  type: 'mention',
  version: 1,
  platform: 'GH',
  handle: 'octocat',
  displayName: 'Octocat',
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]

function update(editor: LexicalEditor, fn: () => void) {
  return new Promise<void>(resolve => editor.update(fn, { discrete: true, onUpdate: resolve }))
}

async function fromMarkdown(markdown: string) {
  const { editor } = await mountEditor(doc(paragraph()))
  await update(editor, () => $convertFromMarkdownString(markdown, builtinTransformers))
  return editor
}

function toMarkdown(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
}

function nodesOf(editor: LexicalEditor) {
  return read(editor)[0].children as Json[]
}

/** Types what's given at the end of the first paragraph, one update per character. */
async function type(editor: LexicalEditor, value: string) {
  for (const char of value) {
    await update(editor, () => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection))
        $getRoot().selectEnd()
      ;($getSelection() as ReturnType<typeof $createRangeSelection>).insertText(char)
    })
    await flushPromises()
  }
}

describe('stored data', () => {
  it('comes out as it went in', async () => {
    const plain = {
      type: 'mention',
      version: 1,
      platform: 'GH',
      handle: 'octocat',
    }
    const other = {
      type: 'mention',
      version: 1,
      platform: 'weibo',
      handle: 'octocat',
      displayName: '名',
    }
    const value = doc(paragraph(octocat, text('字'), plain, other))
    const { editor } = await mountEditor(value)
    expect(read(editor)).toEqual(value.root.children)
    expect('displayName' in nodesOf(editor)[2]).toBe(false)
  })

  it('takes fields that are not text', async () => {
    const { editor, wrapper } = await mountEditor(doc(paragraph({
      type: 'mention',
      version: 1,
      platform: 1,
      handle: null,
      displayName: {},
    })))
    expect(wrapper.find('.hlx-mention').text()).toBe('@')
    expect(nodesOf(editor)[0].type).toBe('mention')
  })

  it('shows the renderer\'s output, escaped', async () => {
    const { wrapper } = await mountEditor(doc(paragraph(
      octocat,
      {
        type: 'mention',
        version: 1,
        platform: 'weibo',
        handle: '<img src=x onerror=alert(1)>',
      },
    )))
    expect(wrapper.find('.hlx-mention a').attributes('href')).toBe('https://github.com/octocat')
    expect(wrapper.find('.hlx-content img').exists()).toBe(false)
  })
})

describe('as part of the text', () => {
  it('is inline and arrow keys don\'t stop on it', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    editor.getEditorState().read(() => {
      const node = $getRoot().getFirstDescendant()!
      expect($isMentionNode(node)).toBe(true)
      expect((node as any).isInline()).toBe(true)
      expect((node as any).isKeyboardSelectable()).toBe(false)
    })
  })

  it('backspace removes it and undo brings it back', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat, text('字'))))
    await update(editor, () => {
      const node = $getRoot().getFirstDescendant()!.getNextSibling() as any
      node.select(0, 0)
    })
    await flushPromises()
    await update(editor, () => ($getSelection() as any).deleteCharacter(true))
    await flushPromises()
    expect(nodesOf(editor).map(node => node.type)).toEqual(['text'])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(nodesOf(editor).map(node => node.type)).toEqual(['mention', 'text'])
  })

  it('delete removes it too', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'), octocat)))
    await update(editor, () => ($getRoot().getFirstDescendant() as any).select(1, 1))
    await flushPromises()
    await update(editor, () => ($getSelection() as any).deleteCharacter(false))
    await flushPromises()
    expect(nodesOf(editor).map(node => node.type)).toEqual(['text'])
  })

  it('copies to plain text as @name', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), octocat, text('後'), { ...octocat, displayName: undefined })))
    await update(editor, () => $getRoot().select(0, $getRoot().getFirstChildOrThrow<any>().getChildrenSize()))
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('前@Octocat後@octocat')
    })
  })
})

describe('markdown', () => {
  it.each([
    [
      '{GH@octocat}',
      { platform: 'GH', handle: 'octocat' },
    ],
    [
      '[Octocat]{GH@octocat}',
      { platform: 'GH', handle: 'octocat', displayName: 'Octocat' },
    ],
    [
      '{weibo@a.b-c}',
      { platform: 'weibo', handle: 'a.b-c' },
    ],
  ])('imports and exports %s', async (markdown, data) => {
    const editor = await fromMarkdown(markdown)
    expect(nodesOf(editor)[0]).toEqual({ type: 'mention', version: 1, ...data })
    expect(toMarkdown(editor)).toBe(markdown)
  })

  it('counts as Markdown when pasted for every platform offered, and only those', async () => {
    const { isMarkdown } = await import('../src/paste/detect')
    for (const platform of [
      'GH',
      'TW',
      'TG',
      'DC',
      'YT',
      'TH',
      'IG',
      'BL',
      'RD',
    ])
      expect(isMarkdown(`見 {${platform}@octocat} 和 **粗體**`), platform).toBe(true)
    expect(isMarkdown('見 {ZH@octocat} 和這段')).toBe(false)
  })

  it('keeps the text around it', async () => {
    const editor = await fromMarkdown('前 {GH@a} 後')
    expect(nodesOf(editor).map(node => node.type)).toEqual(['text', 'mention', 'text'])
  })

  it('leaves code alone', async () => {
    const editor = await fromMarkdown('`{GH@a}`\n\n```\n{GH@b}\n```')
    expect(read(editor)[0].children[0].type).toBe('text')
    expect(read(editor)[0].children[0].text).toBe('{GH@a}')
    expect(read(editor)[1].code).toBe('{GH@b}')
  })

  it('converts when typing the closing brace, with the caret after it', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('看'))))
    await update(editor, () => $getRoot().selectEnd())
    await flushPromises()
    await type(editor, '{GH@octocat}')
    await flushPromises()
    expect(nodesOf(editor).map(node => node.type)).toEqual(['text', 'mention'])
    await type(editor, '後')
    expect(nodesOf(editor).at(-1)).toMatchObject({ type: 'text', text: '後' })
  })

  it('counts as markdown when pasted', () => {
    expect(isMarkdown('請問 {GH@octocat}')).toBe(true)
    expect(isMarkdown('請問 [Octocat]{TG@octocat}')).toBe(true)
    expect(isMarkdown('function f() { a@b }')).toBe(false)
  })
})

describe('html', () => {
  function exported(editor: LexicalEditor) {
    return editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
  }

  async function reimported(html: string) {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => {
      const dom = new DOMParser().parseFromString(html, 'text/html')
      $getRoot().clear()
      $getRoot().append($createParagraphNode())
      $getRoot().selectStart()
      $insertNodes($generateNodesFromDOM(editor, dom))
    })
    return nodesOf(editor)
  }

  it('exports a plain link that carries the data, and imports it back', async () => {
    const { editor } = await mountEditor(doc(paragraph(octocat)))
    const html = exported(editor)
    const link = new DOMParser().parseFromString(html, 'text/html').querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://github.com/octocat')
    expect(link.hasAttribute('data-hlx-mention')).toBe(true)
    expect(link.textContent).toBe('Octocat')
    expect(await reimported(html)).toEqual([octocat])
  })

  it('keeps an unknown platform without a link', async () => {
    const other = {
      type: 'mention',
      version: 1,
      platform: 'weibo',
      handle: 'a',
    }
    const { editor } = await mountEditor(doc(paragraph(other)))
    const html = exported(editor)
    expect(new DOMParser().parseFromString(html, 'text/html').querySelector('a')).toBeNull()
    expect(await reimported(html)).toEqual([other])
  })

  it('ignores the href it is given', async () => {
    const nodes = await reimported('<a href="javascript:alert(1)" data-hlx-mention data-platform="GH" data-handle="a">x</a>')
    expect(nodes).toEqual([
      {
        type: 'mention',
        version: 1,
        platform: 'GH',
        handle: 'a',
      },
    ])
  })

  it('leaves an ordinary link as a link', async () => {
    const nodes = await reimported('<a href="https://example.com">x</a>')
    expect(nodes[0].type).toBe('link')
  })
})

it('can be created from code', async () => {
  const { editor } = await mountEditor(doc(paragraph()))
  await update(editor, () => {
    const selection = $createRangeSelection()
    $setSelection(selection)
    $getRoot().selectEnd()
    $insertNodes([
      $createMentionNode('GH', 'a'),
      $createTextNode(' '),
    ])
  })
  expect(nodesOf(editor)[0]).toEqual({
    type: 'mention',
    version: 1,
    platform: 'GH',
    handle: 'a',
  })
})
