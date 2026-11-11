import type { ElementNode, LexicalEditor, SerializedLexicalNode, TextFormatType, TextNode } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_SPACE_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createHorizontalRuleNode, RichEditor } from '../src'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  url?: string
  isUnlinked?: boolean
}

const IS_CODE = 16

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}

function emptyParagraph(editor: LexicalEditor) {
  editor.update(() => {
    const paragraph = $createParagraphNode()
    $getRoot().clear().append(paragraph)
    paragraph.select()
  }, { discrete: true })
}

/** Types into the current selection, one character at a time, like the keyboard does. */
function type(editor: LexicalEditor, value: string) {
  for (const char of value) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText(char)
    }, { discrete: true })
  }
}

describe('autolink', () => {
  it('links a typed URL', async () => {
    const { editor } = mountEditor()
    emptyParagraph(editor)
    type(editor, 'https://example.com ')
    await flushPromises()

    const [link] = find(rootChildren(editor), 'autolink')
    expect(link.url).toBe('https://example.com')
    expect(textOf(link)).toBe('https://example.com')
  })

  it('links a typed email with mailto:', async () => {
    const { editor } = mountEditor()
    emptyParagraph(editor)
    type(editor, 'me@example.com ')
    await flushPromises()

    const [link] = find(rootChildren(editor), 'autolink')
    expect(link.url).toBe('mailto:me@example.com')
  })

  it('removes the link when the text stops being a URL', async () => {
    const { editor } = mountEditor()
    emptyParagraph(editor)
    type(editor, 'https://example.com ')
    await flushPromises()
    expect(find(rootChildren(editor), 'autolink')).toHaveLength(1)

    editor.update(() => {
      const link = $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChildOrThrow<ElementNode>()
      link.getFirstChildOrThrow<TextNode>().setTextContent('not a url')
    }, { discrete: true })
    await flushPromises()

    expect(find(rootChildren(editor), 'autolink').filter(node => !node.isUnlinked)).toHaveLength(0)
    expect(textOf(rootChildren(editor)[0])).toContain('not a url')
  })

  it('does not link inside inline code', async () => {
    const { editor } = mountEditor()
    emptyParagraph(editor)
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.formatText('code' satisfies TextFormatType)
    }, { discrete: true })
    type(editor, 'https://example.com ')
    await flushPromises()

    expect(find(rootChildren(editor), 'autolink').filter(node => !node.isUnlinked)).toHaveLength(0)
    expect(document.querySelector('.hlx-content a')).toBeNull()
    expect(textOf(rootChildren(editor)[0])).toBe('https://example.com ')
  })

  it('shows URLs in a loaded document as links without reporting a change', async () => {
    const value = {
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
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
                text: 'https://example.com',
                format: 0,
                mode: 'normal',
                style: '',
                detail: 0,
              },
            ],
          },
        ],
      },
    }
    const { editor, wrapper } = mountEditor({ modelValue: value })
    await flushPromises()
    // Lexical runs node transforms while parsing, so loading already links the URL.
    expect(find(rootChildren(editor), 'autolink')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('clicking below the document', () => {
  function endWithRule(editor: LexicalEditor) {
    editor.update(() => {
      $getRoot().clear().append($createHorizontalRuleNode())
    }, { discrete: true })
  }
  function clickRoot(editor: LexicalEditor) {
    editor.getRootElement()!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 100 }))
  }

  it('adds a paragraph after a trailing decorator and puts the caret in it', async () => {
    const { editor } = mountEditor()
    endWithRule(editor)
    await flushPromises()
    clickRoot(editor)
    await flushPromises()

    expect(rootChildren(editor).map(node => node.type)).toEqual(['horizontalrule', 'paragraph'])
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getType()).toBe('paragraph')
    })
  })

  it('does nothing after a trailing paragraph', async () => {
    const { editor } = mountEditor()
    emptyParagraph(editor)
    await flushPromises()
    clickRoot(editor)
    await flushPromises()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph'])
  })

  it('does nothing when the click is on the decorator', async () => {
    const { editor } = mountEditor()
    endWithRule(editor)
    await flushPromises()
    const rule = editor.getRootElement()!.querySelector('[data-lexical-decorator="true"], .hlx-hr-block') as HTMLElement
    rule.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 100 }))
    await flushPromises()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['horizontalrule'])
  })

  it('does nothing when read-only', async () => {
    const { editor, wrapper } = mountEditor()
    endWithRule(editor)
    await flushPromises()
    await wrapper.setProps({ editable: false })
    await flushPromises()
    clickRoot(editor)
    await flushPromises()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['horizontalrule'])
  })
})

describe('leaving inline code', () => {
  /** "plain " + code(`code`) + optional trailing text, caret at `offset` of the code. */
  function withCode(editor: LexicalEditor, offset = 4, trailing = '') {
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const code = $createTextNode('code').toggleFormat('code')
      paragraph.append($createTextNode('plain '), code)
      if (trailing)
        paragraph.append($createTextNode(trailing))
      $getRoot().clear().append(paragraph)
      // The browser syncs the selection format from the DOM; here it has to be set by hand.
      code.select(offset, offset).setFormat(IS_CODE)
    }, { discrete: true })
  }
  const press = (editor: LexicalEditor, key: 'ArrowRight' | ' ') => {
    const event = new KeyboardEvent('keydown', { key })
    return editor.dispatchCommand(key === ' '
      ? KEY_SPACE_COMMAND
      : KEY_ARROW_RIGHT_COMMAND, event)
  }
  const texts = (editor: LexicalEditor) => find(rootChildren(editor), 'text').map(node => [node.text, node.format])

  it.each(['ArrowRight', ' '] as const)('%j at the end of a line stops code formatting', async (key) => {
    const { editor } = mountEditor()
    withCode(editor)
    editor.update(() => press(editor, key), { discrete: true })
    await flushPromises()
    type(editor, 'x')
    await flushPromises()

    expect(texts(editor)).toEqual([
      ['plain ', 0],
      ['code', IS_CODE],
      ['x', 0],
    ])
  })

  it('arrow right leaves no extra characters or nodes behind', async () => {
    const { editor } = mountEditor()
    withCode(editor)
    editor.update(() => press(editor, 'ArrowRight'), { discrete: true })
    await flushPromises()

    expect(texts(editor)).toEqual([
      ['plain ', 0],
      ['code', IS_CODE],
    ])
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('​')
  })

  it('a second arrow right falls through to normal caret movement', async () => {
    const { editor } = mountEditor()
    withCode(editor)
    let first = false
    let second = true
    editor.update(() => {
      first = press(editor, 'ArrowRight')
    }, { discrete: true })
    editor.update(() => {
      second = press(editor, 'ArrowRight')
    }, { discrete: true })
    await flushPromises()
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it.each([
    ['in the middle of the code', 2, ''],
    ['with text after the code', 4, ' after'],
  ])('keeps formatting %s', async (_name, offset, trailing) => {
    const { editor } = mountEditor()
    withCode(editor, offset, trailing)
    let handled = true
    editor.update(() => {
      handled = press(editor, 'ArrowRight')
    }, { discrete: true })
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.hasFormat('code')).toBe(true)
    })
    expect(handled).toBe(false)
  })
})
