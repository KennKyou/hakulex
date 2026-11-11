import type { LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $findCellNode,
  $findTableNode,
  $isTableNode,
  INSERT_TABLE_COMMAND,
} from '@lexical/table'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTransformers, INSERT_IMAGE_COMMAND, RichEditor } from '../src'
import { isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  url?: string
  headerState?: number
  colSpan?: number
  src?: string
}

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
/** The first table as rows of cell text. */
function grid(editor: LexicalEditor) {
  return find(rootChildren(editor), 'tablerow').map(row => (row.children ?? []).map(textOf))
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}
function exportMarkdown(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
}

/** A rows × columns table with a header row, caret in the cell at `at`. */
function withTable(editor: LexicalEditor, rows = 2, columns = 2, at: [number, number] = [0, 0]) {
  editor.update(() => {
    const table = $createTableNodeWithDimensions(rows, columns, { rows: true, columns: false })
    $getRoot().clear().append(table)
    const [map] = $computeTableMapSkipCellCheck(table, null, null)
    map[at[0]][at[1]].cell.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().select()
  }, { discrete: true })
}
function caretCell(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection))
      return null
    const cell = $findCellNode(selection.anchor.getNode())
    const table = cell && $findTableNode(cell)
    if (!cell || !table)
      return null
    const [, position] = $computeTableMapSkipCellCheck(table, cell, null)
    return position && [position.startRow, position.startColumn]
  })
}
function typeText(editor: LexicalEditor, value: string) {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      selection.insertText(value)
  }, { discrete: true })
}
function press(editor: LexicalEditor, command: typeof KEY_TAB_COMMAND, init: KeyboardEventInit) {
  return editor.dispatchCommand(command, new KeyboardEvent('keydown', init))
}

async function paste(editor: LexicalEditor, entries: Record<string, string>) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(entries))
    data.setData(type, value)
  editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
  await flushPromises()
}

describe('table nodes', () => {
  it('round-trips JSON through a new editor', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '| **Name** | Role |\n| --- | --- |\n| [Ada](https://example.com) | Dev |')
    await flushPromises()
    const json = editor.getEditorState().toJSON()

    expect(rootChildren(editor).map(node => node.type)).toEqual(['table'])
    expect(find(rootChildren(editor), 'tablecell').map(cell => cell.headerState)).toEqual([1, 1, 0, 0])

    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(reloaded.getEditorState().toJSON()).toEqual(json)
  })

  it('renders the scrollable wrapper, header cells and body cells', async () => {
    const { wrapper, editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    expect(wrapper.find('.hlx-table-wrap > table.hlx-table').exists()).toBe(true)
    expect(wrapper.findAll('th.hlx-table-cell.hlx-table-cell-header')).toHaveLength(2)
    expect(wrapper.findAll('td.hlx-table-cell')).toHaveLength(2)
  })

  it('loads spans, widths and bad values without an error', async () => {
    const cell = (extra: Record<string, unknown>) => ({
      type: 'tablecell',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      headerState: 0,
      colSpan: 1,
      rowSpan: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: '',
          children: [],
        },
      ],
      ...extra,
    })
    const value = {
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'table',
            version: 1,
            format: '',
            indent: 0,
            direction: null,
            colWidths: [100, 100],
            children: [
              {
                type: 'tablerow',
                version: 1,
                format: '',
                indent: 0,
                direction: null,
                children: [
                  cell({ colSpan: 2, backgroundColor: 'red' }),
                ],
              },
              {
                type: 'tablerow',
                version: 1,
                format: '',
                indent: 0,
                direction: null,
                children: [
                  cell({ colSpan: -1, rowSpan: 'x' }),
                  cell({}),
                ],
              },
            ],
          },
        ],
      },
    } as unknown as SerializedEditorState
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { wrapper } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('[colspan="2"]').exists()).toBe(true)
  })
})

describe('keyboard', () => {
  it('moves between cells with Tab and Shift+Tab, keeping text in place', async () => {
    const { editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    typeText(editor, 'first')
    press(editor, KEY_TAB_COMMAND, { key: 'Tab' })
    await flushPromises()
    expect(caretCell(editor)).toEqual([0, 1])
    typeText(editor, 'second')
    press(editor, KEY_TAB_COMMAND, { key: 'Tab', shiftKey: true })
    await flushPromises()

    expect(caretCell(editor)).toEqual([0, 0])
    expect(grid(editor)).toEqual([
      ['first', 'second'],
      ['', ''],
    ])
  })

  it('keeps the table intact on Tab in the last cell', async () => {
    const { editor } = mountEditor()
    withTable(editor, 2, 2, [1, 1])
    await flushPromises()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    press(editor, KEY_TAB_COMMAND, { key: 'Tab' })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(grid(editor)).toHaveLength(2)
    expect(grid(editor)[0]).toHaveLength(2)
    expect(editor.getEditorState().read(() => $isRangeSelection($getSelection()))).toBe(true)
  })

  it('makes a new paragraph in the same cell on Enter', async () => {
    const { editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    typeText(editor, 'text')
    press(editor, KEY_ENTER_COMMAND, { key: 'Enter' })
    await flushPromises()

    expect(caretCell(editor)).toEqual([0, 0])
    expect(find([find(rootChildren(editor), 'tablecell')[0]], 'paragraph')).toHaveLength(2)
    expect(grid(editor)[0]).toHaveLength(2)
  })

  it('does not merge cells on Backspace at the start of a cell', async () => {
    const { editor } = mountEditor()
    withTable(editor, 2, 2, [0, 1])
    await flushPromises()
    press(editor, KEY_BACKSPACE_COMMAND, { key: 'Backspace' })
    await flushPromises()
    expect(grid(editor)).toHaveLength(2)
    expect(grid(editor)[0]).toHaveLength(2)
    expect(find(rootChildren(editor), 'table')).toHaveLength(1)
  })

  it('does not nest tables', async () => {
    const { editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: '2', columns: '2' })
    await flushPromises()
    expect(find(rootChildren(editor), 'table')).toHaveLength(1)
    expect(grid(editor)).toHaveLength(2)
  })
})

describe('markdown', () => {
  const TABLE = '| **Name** | Note |\n| --- | --- |\n| [Ada](https://example.com) | a \\| b |'

  it('imports inline formats, links and escaped pipes', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, TABLE)
    await flushPromises()

    const cells = find(rootChildren(editor), 'tablecell')
    expect(cells.map(cell => cell.headerState)).toEqual([1, 1, 0, 0])
    expect(find([cells[0]], 'text')[0].format).toBe(1)
    expect(find([cells[2]], 'link')[0].url).toBe('https://example.com')
    expect(grid(editor)).toEqual([
      ['Name', 'Note'],
      ['Ada', 'a | b'],
    ])
  })

  it('exports back to an equivalent table', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, TABLE)
    await flushPromises()
    expect(exportMarkdown(editor)).toBe(TABLE)
  })

  it('pads short rows and drops extra cells', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '| a | b |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 |')
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['1', ''],
      ['1', '2'],
    ])
  })

  it.each([
    ['no divider', '| a | b |\n| 1 | 2 |'],
    ['a bad divider', '| a | b |\n| == | == |'],
    ['a divider with the wrong width', '| a | b |\n| --- |'],
    ['a single row', '| a | b |'],
  ])('leaves %s as text', async (_name, markdown) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()
    expect(find(rootChildren(editor), 'table')).toHaveLength(0)
    const text = rootChildren(editor).map(textOf).join('\n')
    expect(text).toContain('a')
    expect(text).toContain('b')
  })

  it('reads a table in the middle of a document', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, 'before\n\n| a |\n| --- |\n| 1 |\n\nafter')
    await flushPromises()
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph', 'table', 'paragraph'])
  })

  it('exports a first row without header state as the header', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const table = $createTableNodeWithDimensions(2, 1, false)
      $getRoot().clear().append(table)
      const [map] = $computeTableMapSkipCellCheck(table, null, null)
      map[0][0].cell.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().append($createTextNode('one'))
      map[1][0].cell.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().append($createTextNode('two'))
    }, { discrete: true })
    await flushPromises()
    expect(exportMarkdown(editor)).toBe('| one |\n| --- |\n| two |')
  })

  it('joins several paragraphs with <br>, and reads them back', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '| a<br>b |\n| --- |\n| c |')
    await flushPromises()
    const first = find(rootChildren(editor), 'tablecell')[0]
    expect(find([first], 'paragraph').map(textOf)).toEqual(['a', 'b'])
    expect(exportMarkdown(editor)).toBe('| a<br>b |\n| --- |\n| c |')
  })

  it('does not turn typed pipes into a table', async () => {
    const { editor } = mountEditor()
    editor.update(() => {
      const paragraph = $createParagraphNode()
      $getRoot().clear().append(paragraph)
      paragraph.select()
    }, { discrete: true })
    for (const char of '| a | b | ') {
      typeText(editor, char)
      await flushPromises()
    }
    expect(find(rootChildren(editor), 'table')).toHaveLength(0)
    expect(textOf(rootChildren(editor)[0])).toBe('| a | b | ')
  })
})

describe('pasting tables', () => {
  function caretInParagraph(editor: LexicalEditor, value = '') {
    editor.update(() => {
      const paragraph = $createParagraphNode()
      if (value)
        paragraph.append($createTextNode(value))
      $getRoot().clear().append(paragraph)
      paragraph.selectEnd()
    }, { discrete: true })
  }

  it('detects a markdown table but not stray pipes', () => {
    expect(isMarkdown('| a | b |\n| --- | :-: |\n| 1 | 2 |')).toBe(true)
    expect(isMarkdown('a | b | c')).toBe(false)
    expect(isMarkdown('| a | b |')).toBe(false)
  })

  it('pastes a markdown table in one undo step', async () => {
    const { editor } = mountEditor()
    caretInParagraph(editor, 'before')
    await flushPromises()
    await paste(editor, { 'text/plain': '| a | b |\n| --- | --- |\n| 1 | 2 |' })

    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(rootChildren(editor).map(textOf).join('')).not.toContain('|')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'table')).toHaveLength(0)
    expect(rootChildren(editor).map(textOf)).toEqual(['before'])
  })

  it('pastes an HTML table and neutralizes unsafe links', async () => {
    const { editor } = mountEditor()
    caretInParagraph(editor)
    await flushPromises()
    await paste(editor, {
      'text/plain': 'a b',
      'text/html': '<table><tr><th>a</th><td><a href="javascript:alert(1)">evil</a></td></tr></table>',
    })
    await flushPromises()

    expect(find(rootChildren(editor), 'table')).toHaveLength(1)
    expect(grid(editor)[0].join(' ')).toContain('evil')
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })
})

describe('around tables', () => {
  it('adds a paragraph when clicking below a trailing table', async () => {
    const { editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    editor.getRootElement()!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 100 }))
    await flushPromises()

    expect(rootChildren(editor).map(node => node.type)).toEqual(['table', 'paragraph'])
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getType()).toBe('paragraph')
      expect($isRangeSelection(selection) && !$isTableNode(selection.anchor.getNode().getParent())).toBe(true)
    })
  })

  it('keeps an image inserted in a cell inside that cell', async () => {
    const { editor } = mountEditor()
    withTable(editor)
    await flushPromises()
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: 'https://example.com/a.png', altText: 'cat' })
    await flushPromises()

    expect(rootChildren(editor).map(node => node.type)).toEqual(['table'])
    const cells = find(rootChildren(editor), 'tablecell')
    expect(cells).toHaveLength(4)
    expect(find([cells[0]], 'image')[0].src).toBe('https://example.com/a.png')
  })
})
