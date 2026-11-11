import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $selectAll,
  DELETE_CHARACTER_COMMAND,
  PASTE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  $isSpoilerNode,
  builtinTransformers,
  RichEditor,
  SET_RUBY_COMMAND,
  TOGGLE_SPOILER_COMMAND,
} from '../src'
import { $deleteCharacterInRuby } from '../src/inline/commands'
import { isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  reading?: unknown
}

// Lexical's format bits.
const BOLD = 1
const UNDERLINE = 1 << 3
const SUBSCRIPT = 1 << 5
const SUPERSCRIPT = 1 << 6

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.getRootElement()!.focus()
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const documentText = (editor: LexicalEditor) => rootChildren(editor).map(textOf).join('\n')
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}
const texts = (editor: LexicalEditor) => find(rootChildren(editor), 'text')
const formatOf = (editor: LexicalEditor, value: string) => texts(editor).find(node => node.text === value)?.format

function importMarkdown(editor: LexicalEditor, markdown: string) {
  return editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}
const exportMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

function documentWith(...children: unknown[]): SerializedEditorState {
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
function inlineElement(type: string, extra: Record<string, unknown>, text: string) {
  return {
    type,
    version: 1,
    format: '',
    indent: 0,
    direction: null,
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
    ...extra,
  }
}
function paragraphOf(...children: unknown[]) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children,
  }
}

function emptyDocument(editor: LexicalEditor) {
  editor.update(() => {
    const paragraph = $createParagraphNode()
    $getRoot().clear().append(paragraph)
    paragraph.select()
  }, { discrete: true })
}

/** One character per update, as typing is: shortcuts run after each. */
async function type(editor: LexicalEditor, value: string) {
  for (const char of value) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText(char)
    }, { discrete: true })
    await flushPromises()
  }
}

async function paste(editor: LexicalEditor, entries: Record<string, string>) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(entries))
    data.setData(type, value)
  editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
  await flushPromises()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('document model', () => {
  it('round-trips spoiler and ruby through JSON, formats included', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '||雷 **粗**|| 和 <ruby>**漢**<rt>hàn</rt></ruby>')
    await flushPromises()

    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(1)
    const [ruby] = find(rootChildren(editor), 'ruby')
    expect(ruby.reading).toBe('hàn')
    expect(formatOf(editor, '粗')).toBe(BOLD)
    expect(formatOf(editor, '漢')).toBe(BOLD)

    const json = editor.getEditorState().toJSON()
    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(reloaded.getEditorState().toJSON()).toEqual(json)
  })

  it.each([
    ['not a string', 42],
    ['missing', undefined],
    ['empty', ''],
  ])('loads a ruby whose reading is %s, keeping its text', async (_name, reading) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor({
      modelValue: documentWith(paragraphOf(inlineElement('ruby', { reading }, '漢'))),
    })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(documentText(editor)).toBe('漢')
    expect(find(rootChildren(editor), 'ruby')[0].reading).toBe('')
    expect(exportMarkdown(editor)).toBe('漢')
  })

  it('keeps the reading out of the editable text', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraphOf(inlineElement('ruby', { reading: 'hàn' }, '漢'))),
    })
    await flushPromises()
    const ruby = editor.getRootElement()!.querySelector<HTMLElement>('ruby.hlx-ruby')!
    expect(ruby.dataset.reading).toBe('hàn')
    expect(ruby.textContent).toBe('漢')
    expect(ruby.querySelector('rt')).toBeNull()
  })
})

describe('spoiler while editing', () => {
  const doc = () => documentWith(paragraphOf(inlineElement('spoiler', {}, '雷')))

  it.each([
    ['end', 1, '雷外'],
    ['start', 0, '外雷'],
  ])('keeps text typed at its %s outside', async (_edge, offset, expected) => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getAllTextNodes()[0].select(offset, offset)
    }, { discrete: true })
    await type(editor, '外')
    expect(documentText(editor)).toBe(expected)
    expect(textOf(find(rootChildren(editor), 'spoiler')[0])).toBe('雷')
  })

  it('takes text typed in the middle', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraphOf(inlineElement('spoiler', {}, '雷雷'))),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getAllTextNodes()[0].select(1, 1)
    }, { discrete: true })
    await type(editor, '內')
    expect(textOf(find(rootChildren(editor), 'spoiler')[0])).toBe('雷內雷')
  })
})

describe('spoiler while read-only', () => {
  const doc = () => documentWith(paragraphOf(inlineElement('spoiler', {}, '雷')))
  const element = (editor: LexicalEditor) => editor.getRootElement()!.querySelector<HTMLElement>('.hlx-spoiler')!
  const isHidden = (editor: LexicalEditor) => element(editor).classList.contains('hlx-spoiler--hidden')

  it('toggles on click without changing the document', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
      editable: false,
    })
    await flushPromises()
    const before = editor.getEditorState().toJSON()
    expect(isHidden(editor)).toBe(true)
    expect(element(editor).getAttribute('tabindex')).toBe('0')
    expect(element(editor).getAttribute('aria-expanded')).toBe('false')

    element(editor).click()
    expect(isHidden(editor)).toBe(false)
    expect(element(editor).getAttribute('aria-expanded')).toBe('true')
    element(editor).click()
    expect(isHidden(editor)).toBe(true)
    await flushPromises()
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })

  it.each(['Enter', ' '])('toggles with the %j key', async (key) => {
    const { editor } = mountEditor({
      modelValue: doc(),
      editable: false,
    })
    await flushPromises()
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    element(editor).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(isHidden(editor)).toBe(false)
  })

  it('does nothing and takes no tab stop while editable', async () => {
    const { editor } = mountEditor({
      modelValue: doc(),
    })
    await flushPromises()
    expect(element(editor).hasAttribute('tabindex')).toBe(false)
    element(editor).click()
    expect(isHidden(editor)).toBe(true)
  })

  it('follows the editable state, and covers again when going back to read-only', async () => {
    const { wrapper, editor } = mountEditor({
      modelValue: doc(),
      editable: false,
    })
    await flushPromises()
    element(editor).click()
    expect(isHidden(editor)).toBe(false)

    await wrapper.setProps({ editable: true })
    await flushPromises()
    expect(element(editor).hasAttribute('tabindex')).toBe(false)

    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(element(editor).getAttribute('tabindex')).toBe('0')
    expect(isHidden(editor)).toBe(true)
  })
})

describe('markdown', () => {
  it('imports and exports every syntax unchanged', async () => {
    const { editor } = mountEditor()
    const markdown = '||雷 **粗**|| ^上^ ~下~ ++底++'
    importMarkdown(editor, markdown)
    await flushPromises()

    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(1)
    expect(formatOf(editor, '粗')).toBe(BOLD)
    expect(formatOf(editor, '上')).toBe(SUPERSCRIPT)
    expect(formatOf(editor, '下')).toBe(SUBSCRIPT)
    expect(formatOf(editor, '底')).toBe(UNDERLINE)
    expect(documentText(editor)).toBe('雷 粗 上 下 底')
    expect(exportMarkdown(editor)).toBe(markdown)
  })

  it.each([
    ['spaces around pipes', 'a || b || c'],
    ['code', 'if (a||b||c)'],
    ['a price range', '約 ~5 到 ~10'],
    ['number ranges', '3~5 和 7~9'],
    ['ranges without spaces', '3~5天，7~9天'],
    ['powers in prose', '2^10 和 3^5'],
    ['powers in a formula', 'x^2+y^2'],
    ['a++ operator', 'i++; j++'],
    ['the language', 'C++ and C++'],
  ])('leaves %s as text', async (_name, markdown) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()
    expect(documentText(editor)).toBe(markdown)
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(texts(editor).every(node => node.format === 0)).toBe(true)
  })

  it('keeps strikethrough as strikethrough', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '~~刪除~~ 和 ~下~')
    await flushPromises()
    expect(formatOf(editor, '刪除')).toBe(1 << 2)
    expect(formatOf(editor, '下')).toBe(SUBSCRIPT)
    expect(exportMarkdown(editor)).toBe('~~刪除~~ 和 ~下~')
  })

  it('accepts subscript and superscript inside words', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'H~2~O 和 2^10^')
    await flushPromises()
    expect(formatOf(editor, '2')).toBe(SUBSCRIPT)
    expect(formatOf(editor, '10')).toBe(SUPERSCRIPT)
    expect(documentText(editor)).toBe('H2O 和 210')
  })

  it('combines with other formats, and keeps spaces and literal markers inside', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const paragraph = $createParagraphNode().append(
        $createTextNode('a b').toggleFormat('subscript'),
        $createTextNode(' '),
        $createTextNode('c^d').toggleFormat('superscript'),
        $createTextNode(' '),
        $createTextNode('粗').toggleFormat('bold').toggleFormat('superscript'),
      )
      $getRoot().clear().append(paragraph)
    }, { discrete: true })
    const before = texts(editor).map(node => [node.text, node.format])
    const markdown = exportMarkdown(editor)

    importMarkdown(editor, markdown)
    await flushPromises()
    expect(texts(editor).map(node => [node.text, node.format])).toEqual(before)
    expect(exportMarkdown(editor)).toBe(markdown)
  })

  it('reads and writes ruby with special characters escaped', async () => {
    const { editor } = mountEditor()
    const markdown = '<ruby>漢<rt>a&quot;b&lt;c&amp;d&gt;</rt></ruby>'
    importMarkdown(editor, markdown)
    await flushPromises()
    const [ruby] = find(rootChildren(editor), 'ruby')
    expect(textOf(ruby)).toBe('漢')
    expect(ruby.reading).toBe('a"b<c&d>')
    expect(exportMarkdown(editor)).toBe(markdown)
  })

  it('accepts rp around the reading', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '<ruby>漢<rp>(</rp><rt>hàn</rt><rp>)</rp></ruby>')
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby')[0].reading).toBe('hàn')
    expect(documentText(editor)).toBe('漢')
  })

  it.each([
    ['another tag', '<ruby><img src=x onerror=alert(1)>漢<rt>hàn</rt></ruby>'],
    ['no rt', '<ruby>漢</ruby>'],
    ['an empty rt', '<ruby>漢<rt></rt></ruby>'],
    ['tags in the reading', '<ruby>漢<rt><b>hàn</b></rt></ruby>'],
  ])('leaves ruby with %s as text', async (_name, markdown) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(0)
    expect(documentText(editor)).toBe(markdown)
    expect(editor.getRootElement()!.querySelector('img')).toBeNull()
  })
})

describe('typing', () => {
  async function typed(value: string) {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await type(editor, value)
    return editor
  }

  it('turns a spoiler into a node when it closes', async () => {
    const editor = await typed('前 ||雷||')
    expect(textOf(find(rootChildren(editor), 'spoiler')[0])).toBe('雷')
    expect(documentText(editor)).toBe('前 雷')
  })

  it('keeps formats typed inside a spoiler', async () => {
    const editor = await typed('||雷 **粗**||')
    const [spoiler] = find(rootChildren(editor), 'spoiler')
    expect(textOf(spoiler)).toBe('雷 粗')
    expect(formatOf(editor, '粗')).toBe(BOLD)
    expect(documentText(editor)).toBe('雷 粗')
  })

  it('continues outside after a spoiler', async () => {
    const editor = await typed('||雷||外')
    expect(textOf(find(rootChildren(editor), 'spoiler')[0])).toBe('雷')
    expect(documentText(editor)).toBe('雷外')
  })

  it.each([
    ['spaces around pipes', 'a || b || c'],
    ['code', 'if (a||b||c)'],
    ['nothing inside', '||||'],
  ])('leaves %s as text', async (_name, value) => {
    const editor = await typed(value)
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(documentText(editor)).toBe(value)
  })

  it.each(['||a||', '^a^', '~a~', '++a++'])('leaves %s typed inside inline code as it is', async (value) => {
    const { editor } = mountEditor()
    editor.update(() => {
      // Not a letter before the marker: that alone would keep `||` from opening a spoiler.
      const code = $createTextNode('-y').toggleFormat('code')
      $getRoot().clear().append($createParagraphNode().append(code))
      // A real caret takes the format of the text it lands in; a scripted one doesn't.
      code.select(1, 1).setFormat(code.getFormat())
    }, { discrete: true })
    await flushPromises()
    await type(editor, value)
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(texts(editor).map(node => [node.text, node.format])).toEqual([
      [`-${value}y`, 16],
    ])
  })

  it('takes no opening marker from inline code', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const paragraph = $createParagraphNode().append($createTextNode('||a').toggleFormat('code'))
      $getRoot().clear().append(paragraph)
      paragraph.select()
    }, { discrete: true })
    await flushPromises()
    await type(editor, ' b||')
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(documentText(editor)).toBe('||a b||')
  })

  it('does not nest spoilers', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraphOf(inlineElement('spoiler', {}, '雷雷'))),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getAllTextNodes()[0].select(1, 1)
    }, { discrete: true })
    await type(editor, '||a||')
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(1)
    expect(documentText(editor)).toBe('雷||a||雷')
  })

  it.each([
    ['^上^', '上', SUPERSCRIPT],
    ['~下~', '下', SUBSCRIPT],
    ['++底++', '底', UNDERLINE],
  ])('turns %s into a format, and what follows is plain', async (value, inner, format) => {
    const editor = await typed(`${value}外`)
    expect(formatOf(editor, inner)).toBe(format)
    expect(formatOf(editor, '外')).toBe(0)
    expect(documentText(editor)).toBe(`${inner}外`)
  })

  it('types water', async () => {
    const editor = await typed('H~2~O')
    expect(documentText(editor)).toBe('H2O')
    expect(formatOf(editor, '2')).toBe(SUBSCRIPT)
    expect(formatOf(editor, 'O')).toBe(0)
  })

  it.each([
    '約 ~5 到 ~10',
    '3~5 和 7~9',
    '3~5天，7~9天',
  ])('leaves %s alone', async (value) => {
    const editor = await typed(value)
    expect(documentText(editor)).toBe(value)
    expect(texts(editor).every(node => node.format === 0)).toBe(true)
  })

  it('leaves strikethrough alone', async () => {
    const strike = await typed('~~刪除~~')
    expect(formatOf(strike, '刪除')).toBe(1 << 2)
  })

  it('does not convert ruby typed as HTML', async () => {
    const editor = await typed('<ruby>漢<rt>hàn</rt></ruby>')
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(0)
    expect(documentText(editor)).toBe('<ruby>漢<rt>hàn</rt></ruby>')
  })
})

describe('commands', () => {
  function withParagraphs(editor: LexicalEditor, ...values: string[]) {
    editor.update(() => {
      $getRoot().clear().append(...values.map(value => $createParagraphNode().append($createTextNode(value))))
      $selectAll()
    }, { discrete: true })
  }

  it('wraps each block on its own, and unwraps with the same command', async () => {
    const { editor } = mountEditor()
    withParagraphs(editor, 'one', 'two')
    editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
    await flushPromises()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph', 'paragraph'])
    expect(find(rootChildren(editor), 'spoiler').map(textOf)).toEqual(['one', 'two'])

    editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(documentText(editor)).toBe('one\ntwo')
  })

  it('wraps only the selected part of a paragraph', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const text = $createTextNode('abcd')
      $getRoot().clear().append($createParagraphNode().append(text))
      text.select(1, 3)
    }, { discrete: true })
    editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'spoiler').map(textOf)).toEqual(['bc'])
    expect(documentText(editor)).toBe('abcd')
    expect(editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isRangeSelection(selection) && selection.getTextContent()
    })).toBe('bc')
  })

  it('merges into one spoiler when the selection already has one', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraphOf(
        {
          type: 'text',
          version: 1,
          text: 'a',
          format: 0,
          style: '',
          mode: 'normal',
          detail: 0,
        },
        inlineElement('spoiler', {}, 'b'),
        {
          type: 'text',
          version: 1,
          text: 'c',
          format: 0,
          style: '',
          mode: 'normal',
          detail: 0,
        },
      )),
    })
    await flushPromises()
    editor.update(() => $selectAll(), { discrete: true })
    editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
    await flushPromises()
    const spoilers = find(rootChildren(editor), 'spoiler')
    expect(spoilers.map(textOf)).toEqual(['abc'])
    expect(find(spoilers[0].children!, 'spoiler')).toHaveLength(0)
  })

  it('does nothing for a collapsed selection', async () => {
    const { editor } = mountEditor()
    withParagraphs(editor, 'one')
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
  })

  it('sets, changes and clears a reading, each one undo step', async () => {
    const { editor } = mountEditor()
    withParagraphs(editor, '漢')
    await flushPromises()
    const reading = () => find(rootChildren(editor), 'ruby')[0]?.reading

    editor.dispatchCommand(SET_RUBY_COMMAND, 'hàn')
    await flushPromises()
    expect(reading()).toBe('hàn')

    editor.dispatchCommand(SET_RUBY_COMMAND, 'kan')
    await flushPromises()
    expect(reading()).toBe('kan')
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(1)

    editor.dispatchCommand(SET_RUBY_COMMAND, '  ')
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(0)
    expect(documentText(editor)).toBe('漢')

    await undo(editor)
    expect(reading()).toBe('kan')
    await undo(editor)
    expect(reading()).toBe('hàn')
    await undo(editor)
    expect(reading()).toBeUndefined()
    expect(documentText(editor)).toBe('漢')
  })

  it('ignores a selection edge that holds no characters of the next block', async () => {
    const { editor } = mountEditor()
    withParagraphs(editor, '漢', 'two')
    // What a triple click leaves: the focus at the very start of the next paragraph.
    editor.update(() => {
      const [first, second] = $getRoot().getAllTextNodes()
      first.select(0, 0).focus.set(second.getKey(), 0, 'text')
    }, { discrete: true })
    editor.dispatchCommand(SET_RUBY_COMMAND, 'hàn')
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby').map(textOf)).toEqual(['漢'])
    expect(documentText(editor)).toBe('漢\ntwo')

    // The ruby is what is selected now, so the same gesture edits it rather than nesting.
    editor.update(() => {
      const [first, second] = $getRoot().getAllTextNodes()
      first.select(0, 0).focus.set(second.getKey(), 0, 'text')
    }, { discrete: true })
    editor.dispatchCommand(SET_RUBY_COMMAND, 'kan')
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby').map(node => node.reading)).toEqual(['kan'])
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(1)
  })

  describe('caret at the edge of a wrapper', () => {
    function caret(editor: LexicalEditor) {
      return editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection))
          return null
        return [
          selection.anchor.type,
          selection.anchor.type === 'text'
            ? selection.anchor.getNode().getTextContent()
            : selection.anchor.getNode().getType(),
          selection.anchor.offset,
        ]
      })
    }
    function place(editor: LexicalEditor, value: string, offset: number) {
      editor.update(() => {
        $getRoot().getAllTextNodes().find(node => node.getTextContent() === value)!.select(offset, offset)
      }, { discrete: true })
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined)
      return flushPromises()
    }

    it.each([
      ['ruby', '甲<ruby>漢字<rt>x</rt></ruby>乙'],
      ['spoiler', '甲 ||漢字|| 乙'],
    ])('moves out of a %s at either end, and stays inside elsewhere', async (_name, markdown) => {
      const { editor } = mountEditor()
      importMarkdown(editor, markdown)
      await flushPromises()
      const before = documentText(editor).split('漢字')[0]
      const after = documentText(editor).split('漢字')[1]

      await place(editor, '漢字', 2)
      expect(caret(editor)).toEqual(['text', after, 0])
      await place(editor, '漢字', 0)
      expect(caret(editor)).toEqual(['text', before, before.length])
      await place(editor, '漢字', 1)
      expect(caret(editor)).toEqual(['text', '漢字', 1])
    })

    it('goes to the paragraph when nothing is next to it', async () => {
      const { editor } = mountEditor()
      importMarkdown(editor, '<ruby>漢<rt>x</rt></ruby>')
      await flushPromises()
      await place(editor, '漢', 1)
      expect(caret(editor)).toEqual(['element', 'paragraph', 1])
      await place(editor, '漢', 0)
      expect(caret(editor)).toEqual(['element', 'paragraph', 0])
    })

    it('leaves a selection alone, and read-only documents', async () => {
      const { editor } = mountEditor()
      importMarkdown(editor, '甲<ruby>漢字<rt>x</rt></ruby>乙')
      await flushPromises()
      editor.update(() => {
        $getRoot().getAllTextNodes().find(node => node.getTextContent() === '漢字')!.select(0, 2)
      }, { discrete: true })
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined)
      await flushPromises()
      expect(editor.getEditorState().read(() => $getSelection()?.getTextContent())).toBe('漢字')

      editor.setEditable(false)
      await place(editor, '漢字', 2)
      expect(caret(editor)?.[1]).toBe('漢字')
    })
  })

  describe('deleting in a ruby', () => {
    async function withRuby(editor: LexicalEditor, base = '漢字') {
      importMarkdown(editor, `甲<ruby>${base}<rt>hàn</rt></ruby>乙`)
      await flushPromises()
    }
    const selectIn = (editor: LexicalEditor, value: string, offset: number) => editor.update(() => {
      $getRoot().getAllTextNodes().find(node => node.getTextContent() === value)!.select(offset, offset)
    }, { discrete: true })
    const press = (editor: LexicalEditor, backward: boolean) => {
      editor.dispatchCommand(DELETE_CHARACTER_COMMAND, backward)
      return flushPromises()
    }

    it('takes a character backward and forward, in one undo step each', async () => {
      const { editor } = mountEditor()
      await withRuby(editor)
      selectIn(editor, '漢字', 2)
      await press(editor, true)
      expect(documentText(editor)).toBe('甲漢乙')
      await undo(editor)
      expect(documentText(editor)).toBe('甲漢字乙')

      selectIn(editor, '漢字', 0)
      await press(editor, false)
      expect(documentText(editor)).toBe('甲字乙')
      expect(find(rootChildren(editor), 'ruby')[0].reading).toBe('hàn')
    })

    it('reaches into the ruby from just after it', async () => {
      const { editor } = mountEditor()
      await withRuby(editor)
      selectIn(editor, '乙', 0)
      await press(editor, true)
      expect(documentText(editor)).toBe('甲漢乙')
    })

    it('removes the ruby with its last character, leaving the caret in the text', async () => {
      const { editor } = mountEditor()
      await withRuby(editor, '漢')
      selectIn(editor, '漢', 1)
      await press(editor, true)
      expect(find(rootChildren(editor), 'ruby')).toHaveLength(0)
      expect(documentText(editor)).toBe('甲乙')
      await type(editor, 'X')
      expect(documentText(editor)).toBe('甲X乙')
    })

    it('takes a whole emoji, not half of it', async () => {
      const { editor } = mountEditor()
      await withRuby(editor, '漢😀')
      selectIn(editor, '漢😀', 3)
      await press(editor, true)
      expect(documentText(editor)).toBe('甲漢乙')
    })

    it('leaves text outside a ruby to the usual handling', async () => {
      const { editor } = mountEditor()
      await withRuby(editor)
      selectIn(editor, '乙', 1)
      editor.update(() => {
        const selection = $getSelection()
        expect($isRangeSelection(selection) && $deleteCharacterInRuby(selection, true)).toBe(false)
      }, { discrete: true })
    })
  })

  it('refuses a ruby across blocks', async () => {
    const { editor } = mountEditor()
    withParagraphs(editor, 'one', 'two')
    editor.dispatchCommand(SET_RUBY_COMMAND, 'x')
    await flushPromises()
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(0)
  })

  it('exposes the node guard', () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '||雷||')
    expect(editor.getEditorState().read(() => $getRoot().getAllTextNodes().some(node => $isSpoilerNode(node.getParent())))).toBe(true)
  })
})

describe('html', () => {
  it('keeps nodes, reading and formats through export and paste', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '||雷|| <ruby>漢<rt>hàn</rt></ruby> ^上^ ~下~ ++底++')
    await flushPromises()
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))

    const target = mountEditor().editor
    emptyDocument(target)
    await paste(target, { 'text/html': html, 'text/plain': 'ignored' })

    expect(find(rootChildren(target), 'spoiler').map(textOf)).toEqual(['雷'])
    const [ruby] = find(rootChildren(target), 'ruby')
    expect(textOf(ruby)).toBe('漢')
    expect(ruby.reading).toBe('hàn')
    expect(formatOf(target, '上')).toBe(SUPERSCRIPT)
    expect(formatOf(target, '下')).toBe(SUBSCRIPT)
    expect(formatOf(target, '底')).toBe(UNDERLINE)
    expect(documentText(target)).not.toContain('ignored')
  })

  it('writes the reading after the base text', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '<ruby>漢<rt>hàn</rt></ruby>')
    await flushPromises()
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
    expect(html).toMatch(/<ruby[^>]*>[^\n\r\u2028\u2029\u6F22]*\u6F22.*<rt[^>]*>hàn<\/rt><\/ruby>/)
  })

  it('reads ruby from other sources, without a reading it keeps the text', async () => {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await paste(editor, {
      'text/html': '<p><ruby>漢<rp>(</rp><rt>hàn</rt><rp>)</rp>字<rt>zì</rt></ruby> <ruby>無</ruby></p>',
    })
    const [ruby] = find(rootChildren(editor), 'ruby')
    expect(textOf(ruby)).toBe('漢字')
    expect(ruby.reading).toBe('hàn zì')
    expect(find(rootChildren(editor), 'ruby')).toHaveLength(1)
    expect(documentText(editor)).toBe('漢字 無')
  })
})

describe('paste', () => {
  it('converts plain text with two kinds of signal, in one undo step', async () => {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await type(editor, '前')
    const before = documentText(editor)

    await paste(editor, { 'text/plain': '||雷|| 和 **粗**' })
    expect(find(rootChildren(editor), 'spoiler').map(textOf)).toEqual(['雷'])
    expect(formatOf(editor, '粗')).toBe(BOLD)

    await undo(editor)
    expect(documentText(editor)).toBe(before)
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
  })

  it('keeps a lone marker as text rather than taking it for typing', async () => {
    const { editor } = mountEditor()
    emptyDocument(editor)
    await paste(editor, { 'text/plain': '||x||' })
    expect(find(rootChildren(editor), 'spoiler')).toHaveLength(0)
    expect(documentText(editor)).toBe('||x||')
  })

  it.each([
    ['^x^', false],
    ['||x||', false],
    ['~x~', false],
    ['++x++', false],
    ['約 ~5 到 ~10，x^2', false],
    ['a || b || **c**', false],
    ['||雷|| 和 ^上^', true],
    ['H~2~O 和 **粗**', true],
    ['<ruby>漢<rt>hàn</rt></ruby>', true],
  ])('isMarkdown(%j) is %j', (text, expected) => {
    expect(isMarkdown(text)).toBe(expected)
  })
})

describe('inside other blocks', () => {
  it.each([
    ['a heading', '# ||雷|| <ruby>漢<rt>hàn</rt></ruby>', 'heading'],
    ['a list', '- ||雷|| <ruby>漢<rt>hàn</rt></ruby>', 'listitem'],
    ['an alert', '> [!NOTE]\n> ||雷|| <ruby>漢<rt>hàn</rt></ruby>', 'alert-quote'],
    ['a table cell', '| \\|\\|雷\\|\\| <ruby>漢<rt>hàn</rt></ruby> |\n| --- |', 'tablecell'],
  ])('works in %s', async (_name, markdown, container) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()

    const [block] = find(rootChildren(editor), container)
    expect(find([block], 'spoiler').map(textOf)).toEqual(['雷'])
    expect(find([block], 'ruby')[0].reading).toBe('hàn')

    const exported = exportMarkdown(editor)
    const json = editor.getEditorState().toJSON()
    importMarkdown(editor, exported)
    await flushPromises()
    expect(find(rootChildren(editor), 'spoiler').map(textOf)).toEqual(['雷'])
    expect(rootChildren(editor).map(node => node.type)).toEqual((json.root.children as Json[]).map(node => node.type))

    const rendered = mount(RichRenderer, {
      props: { value: json },
    })
    expect(rendered.find('.hlx-spoiler').text()).toBe('雷')
    expect(rendered.find('ruby rt').text()).toBe('hàn')
  })
})
