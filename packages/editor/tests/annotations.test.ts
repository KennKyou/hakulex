import type { ElementNode, LexicalEditor, SerializedEditorState, TextNode } from 'lexical'
import { tagHue } from '@hakulex/renderer'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createTextNode, $getRoot, $getSelection, $insertNodes, $isRangeSelection, $isTextNode, CONTROLLED_TEXT_INSERTION_COMMAND, KEY_ARROW_RIGHT_COMMAND, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $turnBlocksInto, builtinTransformers, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

function text(value: string, format = 0) {
  return {
    type: 'text',
    version: 1,
    text: value,
    format,
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
// The shapes stored documents have.
function tag(value = '標籤', format = 0) {
  return {
    ...text(value, format),
    type: 'tag',
  }
}
function comment(value = '筆記') {
  return {
    ...text(value),
    type: 'comment',
  }
}
function richQuote(attribution: unknown, ...children: unknown[]) {
  return {
    ...element,
    type: 'rich-quote',
    attribution,
    children,
  }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

async function mountEditor(modelValue: unknown = doc(paragraph())) {
  const updates: SerializedEditorState[] = []
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': clone(modelValue),
      'onUpdate:modelValue': (value: SerializedEditorState | null | undefined) => {
        if (value)
          updates.push(value)
      },
    } as never,
    attachTo: document.body,
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  await flushPromises()
  return { editor, updates }
}

const children = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const dom = (editor: LexicalEditor) => editor.getRootElement()!
function html(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
}
function toMarkdown(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
}
function fromMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}
function fromHtml(editor: LexicalEditor, source: string) {
  editor.update(() => {
    $getRoot().clear()
    const nodes = $generateNodesFromDOM(editor, new DOMParser().parseFromString(source, 'text/html'))
    $getRoot().select()
    $insertNodes(nodes)
  }, { discrete: true })
}
async function edit(editor: LexicalEditor) {
  editor.update(() => {
    $getRoot().getLastChildOrThrow<ElementNode>().append($createTextNode('新'))
  }, { discrete: true })
  await flushPromises()
}
/** One character per update, as typing is: shortcuts run after each. */
async function typeInto(editor: LexicalEditor, value: string, format = 0) {
  editor.update(() => {
    $getRoot().getFirstChildOrThrow<ElementNode>().select()
  }, { discrete: true })
  for (const char of value) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.setFormat(format)
        selection.insertText(char)
      }
    }, { discrete: true })
    await flushPromises()
  }
}
const lineTypes = (editor: LexicalEditor, index = 0) => (children(editor)[index].children as Json[]).map(node => node.type)

describe('tag', () => {
  it('gives back what was stored', async () => {
    const source = tag('標籤', 1)
    const { editor, updates } = await mountEditor(doc(paragraph(text('前'), source, text('後')), paragraph()))
    expect(dom(editor).querySelector('[data-unknown-type]')).toBeNull()
    expect(dom(editor).querySelector('.hlx-tag')!.textContent).toBe('標籤')
    await edit(editor)
    expect((updates.at(-1)!.root.children[0] as Json).children[1]).toEqual(source)
  })

  it('sets the same hue as the renderer, and follows its text', async () => {
    const { editor } = await mountEditor(doc(paragraph(tag('甲'))))
    const hue = () => dom(editor).querySelector<HTMLElement>('.hlx-tag')!.style.getPropertyValue('--hlx-tag-hue')
    expect(hue()).toBe(String(tagHue('甲')))
    editor.update(() => {
      const node = $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChildOrThrow<TextNode>()
      node.setTextContent('乙')
    }, { discrete: true })
    expect(hue()).toBe(String(tagHue('乙')))
  })

  it('sends text at its edges outside, and takes it in the middle', async () => {
    const { editor } = await mountEditor(doc(paragraph(tag('甲乙'))))
    const insert = (offset: number, value: string) => editor.update(() => {
      const node = $getRoot().getFirstChildOrThrow<ElementNode>().getChildren().find(child => child.getType() === 'tag') as TextNode
      node.select(offset, offset)
      ;($getSelection() as any).insertText(value)
    }, { discrete: true })
    insert(1, '中')
    expect((children(editor)[0].children as Json[]).map(node => node.text)).toEqual(['甲中乙'])
    insert(3, '後')
    expect((children(editor)[0].children as Json[]).map(node => [node.type, node.text])).toEqual([
      ['tag', '甲中乙'],
      ['text', '後'],
    ])
    insert(0, '前')
    expect((children(editor)[0].children as Json[]).map(node => [node.type, node.text])).toEqual([
      ['text', '前'],
      ['tag', '甲中乙'],
      ['text', '後'],
    ])
  })

  it('does not merge with the text beside it', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), tag(), text('後'))))
    expect(lineTypes(editor)).toEqual(['text', 'tag', 'text'])
  })

  it.each([
    ['a number', 3],
    ['missing', undefined],
  ])('opens when its text is %s', async (_name, value) => {
    const { editor } = await mountEditor(doc(paragraph({
      ...tag(),
      text: value,
    })))
    expect(lineTypes(editor)).toEqual(['tag'])
    expect(children(editor)[0].children[0].text).toBe('')
  })
})

describe('comment', () => {
  it('gives back what was stored, and shows it to the author', async () => {
    const source = comment()
    const { editor, updates } = await mountEditor(doc(paragraph(text('前'), source, text('後')), paragraph()))
    expect(dom(editor).querySelector('.hlx-comment')!.textContent).toBe('筆記')
    await edit(editor)
    expect((updates.at(-1)!.root.children[0] as Json).children[1]).toEqual(source)
  })

  it('sends text typed at its end outside', async () => {
    const { editor } = await mountEditor(doc(paragraph(comment('甲'))))
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChildOrThrow<TextNode>().select(1, 1)
      ;($getSelection() as any).insertText('後')
    }, { discrete: true })
    expect(lineTypes(editor)).toEqual(['comment', 'text'])
  })

  it.each([
    'a-->b',
    '--><img src=x onerror=a()>',
    '<script>bad()</script>-->',
  ])('keeps %s in the comment when exported, and in the JSON as it is', async (value) => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), comment(value), text('後'))))
    const container = document.createElement('div')
    container.innerHTML = html(editor)
    expect(container.querySelector('img,script')).toBeNull()
    expect(container.textContent).toBe('前後')
    expect(children(editor)[0].children[1].text).toBe(value)
  })

  it('stays inside a comment in markdown', async () => {
    const { editor } = await mountEditor(doc(paragraph(comment('a-->b'))))
    expect(toMarkdown(editor)).toBe('<!--a- ->b-->')
  })

  it.each([
    '<!--StartFragment--><b>粗</b><!--EndFragment-->',
    '<p><!--[if gte mso 9]><xml></xml><![endif]-->字</p>',
  ])('ignores comments in pasted HTML: %s', async (source) => {
    const { editor } = await mountEditor()
    fromHtml(editor, source)
    expect(JSON.stringify(children(editor))).not.toContain('"comment"')
  })
})

describe('rich quote', () => {
  it.each([
    [
      'paragraphs',
      [
        paragraph(text('內文')),
      ],
    ],
    [
      'text',
      [
        text('內文'),
      ],
    ],
  ])('gives back what was stored, holding %s', async (_name, inner) => {
    const source = richQuote('魯迅', ...inner)
    const { editor, updates } = await mountEditor(doc(source, paragraph()))
    const quote = dom(editor).querySelector('blockquote')!
    expect(quote.textContent).toContain('內文')
    expect(quote.querySelector('footer')!.textContent).toBe('— 魯迅')
    await edit(editor)
    expect(updates.at(-1)!.root.children[0]).toEqual(source)
  })

  it.each([
    ['padded', '  魯迅 ', '魯迅'],
    ['blank', '  ', null],
    ['empty', '', null],
    ['a number', 3, null],
    ['missing', undefined, null],
  ])('tidies an attribution that is %s', async (_name, value, expected) => {
    const { editor } = await mountEditor(doc(richQuote(value, text('字'))))
    expect(children(editor)[0].attribution).toBe(expected)
    expect(dom(editor).querySelector('footer')!.textContent).toBe(expected
      ? `— ${expected}`
      : '')
  })

  it('shows HTML as text', async () => {
    const { editor } = await mountEditor(doc(richQuote('<img src=x>', text('字'))))
    const footer = dom(editor).querySelector('footer')!
    expect(footer.querySelector('img')).toBeNull()
    expect(footer.textContent).toBe('— <img src=x>')
  })

  it('keeps the caret out of the attribution', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('字'))))
    const footer = dom(editor).querySelector('footer')!
    expect(footer.contentEditable).toBe('false')
    expect(footer.parentElement!.lastElementChild).toBe(footer)
  })

  it('leaves a plain quote plain', async () => {
    const source = {
      ...element,
      type: 'quote',
      children: [
        text('字'),
      ],
    }
    const { editor, updates } = await mountEditor(doc(source, paragraph()))
    await edit(editor)
    expect(updates.at(-1)!.root.children[0]).toEqual(source)
    expect(dom(editor).querySelector('footer')).toBeNull()
  })

  it('loses the attribution with the quote, and undo brings both back', async () => {
    const source = richQuote('魯迅', text('內文'))
    const { editor } = await mountEditor(doc(source))
    const key = editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())
    editor.update(() => {
      $turnBlocksInto([key], 'paragraph')
    }, { discrete: true })
    await flushPromises()
    expect(children(editor)[0].type).toBe('paragraph')
    expect(dom(editor).querySelector('footer')).toBeNull()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(children(editor)[0]).toEqual(source)
    expect(dom(editor).querySelector('footer')!.textContent).toBe('— 魯迅')
  })
})

describe('markdown', () => {
  it('reads and writes tags and comments', async () => {
    const { editor } = await mountEditor()
    const source = '前<tag>標籤</tag>中<!--筆記-->後'
    fromMarkdown(editor, source)
    expect(lineTypes(editor)).toEqual([
      'text',
      'tag',
      'text',
      'comment',
      'text',
    ])
    expect(toMarkdown(editor)).toBe(source)
  })

  it('does the same inside table cells', async () => {
    const { editor } = await mountEditor()
    fromMarkdown(editor, '| <tag>甲</tag> | <!--乙--> |\n| --- | --- |\n| 丙 | 丁 |')
    const row = children(editor)[0].children[0].children as Json[]
    const inner = (cell: Json) => cell.children[0].children[0].type
    expect(row.map(inner)).toEqual(['tag', 'comment'])
    expect(toMarkdown(editor)).toContain('<tag>甲</tag>')
    expect(toMarkdown(editor)).toContain('<!--乙-->')
  })

  it.each(['a<b', 'a&lt;b', 'a>b', 'a&b'])('keeps the tag text %s', async (value) => {
    const { editor } = await mountEditor(doc(paragraph(tag(value))))
    const markdown = toMarkdown(editor)
    fromMarkdown(editor, markdown)
    expect(lineTypes(editor)).toEqual(['tag'])
    expect(children(editor)[0].children[0].text).toBe(value)
  })

  it('writes a quote with an attribution as a plain one', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('內文'))))
    expect(toMarkdown(editor)).toBe('> 內文')
  })

  it.each([
    ['<tag>字</tag>', 'tag'],
    ['<!--字-->', 'comment'],
  ])('turns %s into a node when typed, with the caret after it', async (value, type) => {
    const { editor } = await mountEditor()
    await typeInto(editor, `前${value}`)
    expect(lineTypes(editor)).toEqual(['text', type])
    expect(children(editor)[0].children[1].text).toBe('字')
    editor.update(() => {
      ($getSelection() as any).insertText('後')
    }, { discrete: true })
    expect(lineTypes(editor)).toEqual(['text', type, 'text'])
  })

  it.each(['<tag>字</tag>', '<!--字-->'])('leaves %s alone in inline code', async (value) => {
    const { editor } = await mountEditor()
    await typeInto(editor, value, 16)
    expect(lineTypes(editor)).toEqual(['text'])
    expect(children(editor)[0].children[0].text).toBe(value)
  })

  it('treats pasted plain text with a tag as markdown', async () => {
    const { editor } = await mountEditor()
    const event = new ClipboardEvent('paste')
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (kind: string) => (kind === 'text/plain'
          ? '<tag>字</tag>'
          : ''),
        types: ['text/plain'],
        files: [],
        items: [],
      },
    })
    editor.update(() => $getRoot().getFirstChildOrThrow<ElementNode>().select(), { discrete: true })
    editor.dispatchCommand(PASTE_COMMAND, event)
    await flushPromises()
    const nodes = children(editor).flatMap(node => node.children as Json[])
    expect(nodes.map(node => node.type)).toContain('tag')
  })
})

describe('html', () => {
  it('keeps tags and attributions through export and import', async () => {
    const { editor } = await mountEditor(doc(paragraph(tag('甲')), richQuote('魯迅', text('內文'))))
    const source = html(editor)
    expect(source).toContain('hlx-tag')
    expect(source).toContain('— 魯迅')
    fromHtml(editor, source)
    const nodes = children(editor)
    const found = JSON.stringify(nodes)
    expect(found).toContain('"type":"tag"')
    const quote = nodes.find(node => node.type === 'rich-quote')!
    expect(quote.attribution).toBe('魯迅')
    expect(JSON.stringify(quote.children)).not.toContain('魯迅')
    expect(JSON.stringify(quote.children)).toContain('內文')
  })

  it('reads a blockquote with no footer as a plain quote', async () => {
    const { editor } = await mountEditor()
    fromHtml(editor, '<blockquote>字</blockquote>')
    expect(children(editor).map(node => node.type)).toContain('quote')
    expect(children(editor).map(node => node.type)).not.toContain('rich-quote')
  })

  it('only reads a footer that belongs to the quote', async () => {
    const { editor } = await mountEditor()
    fromHtml(editor, '<blockquote>字<div><footer>內層</footer></div></blockquote>')
    expect(children(editor).map(node => node.type)).toContain('quote')
  })

  it('counts a pasted tag as rich', async () => {
    const { hasRichHtml } = await import('../src/paste/detect')
    expect(hasRichHtml('<span class="hlx-tag">甲</span>')).toBe(true)
  })
})

it('has every text node reachable as text', async () => {
  const { editor } = await mountEditor(doc(paragraph(tag(), comment())))
  editor.getEditorState().read(() => {
    expect($getRoot().getFirstChildOrThrow<ElementNode>().getChildren().every($isTextNode)).toBe(true)
  })
})

describe('typing over selected text', () => {
  const select = (editor: LexicalEditor, from: number, to: number) => editor.update(() => {
    $getRoot().getFirstChildOrThrow<ElementNode>().getLastChildOrThrow<TextNode>().select(from, to)
  }, { discrete: true })
  const insert = async (editor: LexicalEditor, value: string) => {
    editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, value)
    await flushPromises()
  }
  const shown = (editor: LexicalEditor) => (children(editor)[0].children as Json[]).map(node => [node.type, node.text])

  it.each([
    [
      'tag',
      tag('甲乙丙'),
    ],
    [
      'comment',
      comment('甲乙丙'),
    ],
  ])('keeps what follows inside a %s until the caret leaves', async (type, source) => {
    const { editor } = await mountEditor(doc(paragraph(source)))
    select(editor, 0, 3)
    await insert(editor, '新')
    editor.update(() => {
      ($getSelection() as any).insertText('字')
    }, { discrete: true })
    await flushPromises()
    expect(shown(editor)).toEqual([
      [type, '新字'],
    ])
    editor.dispatchCommand(KEY_ARROW_RIGHT_COMMAND, new KeyboardEvent('keydown'))
    editor.update(() => {
      ($getSelection() as any).insertText('外')
    }, { discrete: true })
    expect(shown(editor)).toEqual([
      [type, '新字'],
      ['text', '外'],
    ])
  })

  it('replaces only what is selected', async () => {
    const { editor } = await mountEditor(doc(paragraph(tag('甲乙丙'))))
    select(editor, 1, 2)
    await insert(editor, '中')
    expect(shown(editor)).toEqual([
      ['tag', '甲中丙'],
    ])
    select(editor, 0, 1)
    await insert(editor, '前')
    expect(shown(editor)).toEqual([
      ['tag', '前中丙'],
    ])
  })

  it('stops once the caret moves into the node', async () => {
    const { editor } = await mountEditor(doc(paragraph(tag('甲乙'))))
    select(editor, 0, 2)
    await insert(editor, '新')
    select(editor, 0, 0)
    await flushPromises()
    select(editor, 1, 1)
    await flushPromises()
    editor.update(() => {
      ($getSelection() as any).insertText('外')
    }, { discrete: true })
    expect(shown(editor)).toEqual([
      ['tag', '新'],
      ['text', '外'],
    ])
  })

  it('leaves selections across nodes to Lexical', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), tag('甲'))))
    editor.update(() => {
      const [first, last] = $getRoot().getFirstChildOrThrow<ElementNode>().getChildren<TextNode>()
      first.select(0, 0)
      ;($getSelection() as any).focus.set(last.getKey(), 1, 'text')
    }, { discrete: true })
    await insert(editor, '新')
    expect(shown(editor).map(([, value]) => value).join('')).toBe('新')
  })
})
