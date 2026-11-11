import type { LexicalEditor } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, PASTE_COMMAND, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isGridNode, builtinTransformers, INSERT_GRID_COMMAND } from '../src'
import { content, doc, mountEditor, paragraph, read, text, textOf, typeInto } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

const cell = (value: string) => content(paragraph(text(value)))
function grid(cells: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: 'grid-container',
    version: 1,
    cols: 2,
    gap: '16px',
    cells,
    ...extra,
  }
}
function four() {
  return doc(paragraph(text('前')), grid([
    cell('一'),
    cell('二'),
    cell('三'),
    cell('四'),
  ]), paragraph(text('後')))
}
function editors() {
  return [
    ...document.querySelectorAll<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-grid-cell [data-lexical-editor]'),
  ].map(root => root.__lexicalEditor)
}
const stored = (editor: LexicalEditor) => read(editor).find(node => node.type === 'grid-container')!
const cellTexts = (editor: LexicalEditor) => stored(editor).cells.map((item: any) => item.root.children.map((block: any) => (block.children ?? []).map((child: any) => child.text).join('')).join('\n'))
function button(name: string) {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('.hlx-grid-toolbar button'),
  ].find(item => item.getAttribute('aria-label') === name)!
}

async function press(name: string) {
  button(name).click()
  await flushPromises()
}
async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function caretAt(editor: LexicalEditor, where: 'start' | 'end') {
  editor.update(() => (where === 'start'
    ? $getRoot().selectStart()
    : $getRoot().selectEnd()), { discrete: true })
  editor.getRootElement()?.focus()
  await flushPromises()
}
function caretText(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isRangeSelection(selection)
      ? selection.anchor.getNode().getTextContent()
      : null
  })
}
function selectedType(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0]?.getType()
      : null
  })
}

describe('stored data', () => {
  it.each([
    [
      'cells',
      grid([
        {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  { type: 'text', text: '少' },
                ],
              },
            ],
          },
        },
        cell('多'),
      ], { other: 1 }),
    ],
    [
      'the old form',
      {
        type: 'grid-container',
        version: 1,
        cols: 2,
        children: [
          paragraph(text('舊')),
        ],
      },
    ],
    [
      'a number for the gap',
      grid([
        cell('一'),
      ], { gap: 8 }),
    ],
    [
      'no gap',
      {
        type: 'grid-container',
        version: 1,
        cols: 3,
        cells: [
          cell('一'),
        ],
      },
    ],
    [
      'bad values',
      grid([
        cell('一'),
        'x',
        { root: 'x' },
      ], { cols: '2;color:red', gap: '1px;background:url(x)' }),
    ],
    [
      'bad cells',
      grid('x'),
    ],
    [
      'no cells',
      grid([]),
    ],
  ])('leaves %s as they are', async (_name, node) => {
    const value = doc(node, paragraph())
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isGridNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it('uses defaults for bad values, and doesn\'t let them become styles', async () => {
    await mountEditor(doc(grid([
      cell('一'),
      'x',
    ], { cols: '2;color:red', gap: '1px;background:url(x)' }), paragraph()))
    const element = document.querySelector<HTMLElement>('.hlx-grid')!
    expect(element.style.getPropertyValue('--hlx-grid-cols')).toBe('2')
    expect(element.style.gap).toBe('16px')
    expect(editors().map(textOf)).toEqual(['一', ''])
  })

  it('shows the old form as a cell for each child, and writes cells once edited', async () => {
    const { editor } = await mountEditor(doc({
      type: 'grid-container',
      version: 1,
      cols: 2,
      children: [
        paragraph(text('甲')),
        paragraph(text('乙')),
      ],
    }, paragraph()))
    expect(editors().map(textOf)).toEqual(['甲', '乙'])
    await typeInto(editors()[0], '字')
    const output = stored(editor)
    expect('children' in output).toBe(false)
    expect(cellTexts(editor)).toEqual(['甲字', '乙'])
  })

  it('only changes the cell that was edited, with the outer state as it was', async () => {
    const second = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: '少' },
            ],
          },
        ],
      },
    }
    const { wrapper, editor } = await mountEditor(doc(grid([
      cell('一'),
      second,
    ], { other: 1 }), paragraph()))
    const state = editor.getEditorState()
    await typeInto(editors()[0], '字')
    expect(editor.getEditorState()).toBe(state)
    expect(stored(editor).cells[1]).toEqual(second)
    expect(stored(editor).other).toBe(1)
    const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    expect(emitted.root.children[0].cells[0].root.children[0].children[0].text).toBe('一字')
  })

  it('keeps what can\'t be nested as a placeholder, unchanged', async () => {
    const steps = { type: 'steps', version: 1, steps: [] }
    const { editor } = await mountEditor(doc(grid([
      content(steps, paragraph(text('文'))),
    ]), paragraph()))
    expect(document.querySelectorAll('.hlx-grid-cell [data-unknown-type]')).toHaveLength(1)
    await typeInto(editors()[0], '字')
    expect(stored(editor).cells[0].root.children[0]).toEqual(steps)
  })

  it('reads as its cells, for copying and search', async () => {
    const { editor } = await mountEditor(doc(grid([
      cell('一'),
      cell('二'),
    ])))
    expect(textOf(editor)).toBe('一\n二')
  })
})

describe('history', () => {
  it('goes through edits in order across cells, and back', async () => {
    const { editor } = await mountEditor(four())
    const [first, second] = editors()
    await typeInto(first, 'A')
    await typeInto(editor, 'B')
    await typeInto(second, 'C')
    await undo(editor)
    expect(textOf(second)).toBe('二')
    await undo(editor)
    expect(textOf(editor)).not.toContain('B')
    await undo(editor)
    expect(textOf(first)).toBe('一')
    editor.dispatchCommand(REDO_COMMAND, undefined)
    await flushPromises()
    expect(textOf(first)).toBe('一A')
  })

  it('brings back a deleted block with its content, and edits still reach it', async () => {
    const { editor } = await mountEditor(four())
    await typeInto(editors()[0], 'A')
    editor.update(() => {
      $getRoot().getChildren()[1].remove()
    }, { discrete: true })
    await flushPromises()
    expect(editors()).toHaveLength(0)
    await undo(editor)
    expect(editors().map(textOf)).toEqual(['一A', '二', '三', '四'])
    await typeInto(editors()[1], 'B')
    expect(cellTexts(editor)[1]).toBe('二B')
  })
})

describe('columns and rows', () => {
  it('more columns add blank cells, as one undo step', async () => {
    const { editor } = await mountEditor(doc(grid([
      cell('一'),
      cell('二'),
    ]), paragraph()))
    expect(button('2 欄').getAttribute('aria-pressed')).toBe('true')
    await press('3 欄')
    expect(button('3 欄').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector<HTMLElement>('.hlx-grid')!.style.getPropertyValue('--hlx-grid-cols')).toBe('3')
    expect(stored(editor).cols).toBe(3)
    expect(editors().map(textOf)).toEqual(['一', '二', ''])
    await undo(editor)
    expect(stored(editor).cols).toBe(2)
    expect(editors()).toHaveLength(2)
  })

  it('fewer columns rearrange the cells, losing nothing', async () => {
    const { editor } = await mountEditor(four())
    await press('1 欄')
    expect(stored(editor).cols).toBe(1)
    expect(cellTexts(editor)).toEqual(['一', '二', '三', '四'])
  })

  it('adds a row with focus on its first cell, as one undo step', async () => {
    const { editor } = await mountEditor(four())
    await press('新增列')
    expect(editors()).toHaveLength(6)
    expect(document.activeElement).toBe(editors()[4].getRootElement())
    await undo(editor)
    expect(editors()).toHaveLength(4)
  })

  it('fills out a row that was short', async () => {
    const { editor } = await mountEditor(doc(grid([
      cell('一'),
      cell('二'),
      cell('三'),
    ]), paragraph()))
    await press('新增列')
    expect(stored(editor).cells).toHaveLength(6)
  })

  it('only removes a last row that is blank, and never the only one', async () => {
    const { editor } = await mountEditor(doc(grid([
      cell('一'),
      cell('二'),
    ]), paragraph()))
    expect(button('移除最後一列').disabled).toBe(true)
    await press('新增列')
    expect(button('移除最後一列').disabled).toBe(false)
    await typeInto(editors()[3], '字')
    expect(button('移除最後一列').disabled).toBe(true)
    await undo(editor)
    expect(button('移除最後一列').disabled).toBe(false)
    await press('移除最後一列')
    expect(editors()).toHaveLength(2)
    await undo(editor)
    expect(editors()).toHaveLength(4)
  })

  it('doesn\'t take a block without text for blank', async () => {
    const rule = { type: 'horizontalrule', version: 1 }
    await mountEditor(doc(grid([
      cell('一'),
      cell('二'),
      content(rule),
      cell(''),
    ]), paragraph()))
    expect(button('移除最後一列').disabled).toBe(true)
  })

  it('writes blank cells in place of invalid ones once changed', async () => {
    const { editor } = await mountEditor(doc(grid([
      cell('一'),
      'x',
    ]), paragraph()))
    await press('3 欄')
    expect(stored(editor).cells[1]).toEqual(content(paragraph()))
  })

  it('has none of this when read-only, and follows a change to that', async () => {
    const { wrapper } = await mountEditor(four(), { editable: false })
    expect(document.querySelector('.hlx-grid-toolbar')).toBeNull()
    expect(editors().every(item => !item.isEditable())).toBe(true)
    await wrapper.setProps({ editable: true } as never)
    await flushPromises()
    expect(document.querySelector('.hlx-grid-toolbar')).not.toBeNull()
    expect(editors().every(item => item.isEditable())).toBe(true)
  })
})

describe('keyboard', () => {
  it('down from the line before goes to the first cell, and up from after to the last', async () => {
    const { editor } = await mountEditor(four())
    await caretAt(editor, 'start')
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(editors()[0].getRootElement())
    await caretAt(editor, 'end')
    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(editors()[3].getRootElement())
    expect(caretText(editors()[3])).toBe('四')
  })

  it('moves up and down the same column', async () => {
    await mountEditor(four())
    const [, second, , fourth] = editors()
    await caretAt(second, 'end')
    second.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(fourth.getRootElement())
    fourth.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(second.getRootElement())
  })

  it('leaves past the first and last rows', async () => {
    const { editor } = await mountEditor(four())
    const [first, , third] = editors()
    await caretAt(third, 'end')
    third.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(caretText(editor)).toBe('後')
    await caretAt(first, 'start')
    first.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(caretText(editor)).toBe('前')
  })

  it('esc selects the block, and Enter goes back in', async () => {
    const { editor } = await mountEditor(four())
    await caretAt(editors()[1], 'end')
    editors()[1].dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(selectedType(editor)).toBe('grid-container')
    expect(document.querySelector('.hlx-grid-editor')!.hasAttribute('data-selected')).toBe(true)
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(editors()[0].getRootElement())
  })
})

describe('copying and inserting', () => {
  it('a pasted copy has the same content, and can be edited apart', async () => {
    const source = grid([
      cell('一'),
    ])
    const { editor } = await mountEditor(doc(source, paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({
      namespace: 'hakulex',
      nodes: [source],
    }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const [first, second] = editors()
    await typeInto(second, '字')
    expect(textOf(first)).toBe('一')
    expect(textOf(second)).toBe('一字')
  })

  it('inserts two blank cells with focus on the first, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    editor.dispatchCommand(INSERT_GRID_COMMAND, undefined)
    await flushPromises()
    expect(editors()).toHaveLength(2)
    expect(document.activeElement).toBe(editors()[0].getRootElement())
    expect(stored(editor).cols).toBe(2)
    await undo(editor)
    expect(read(editor).map(node => node.type)).toEqual(['paragraph'])
  })
})

describe('markdown', () => {
  it('exports the cells as markdown, and comes back as text with nothing lost', async () => {
    const bold = {
      ...text('粗'),
      format: 1,
    }
    const { editor } = await mountEditor(doc(grid([
      content(paragraph(bold)),
      cell('細'),
    ], { cols: 3, gap: 8 })))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).toBe([
      '::: grid{cols=3 gap="8px"}',
      '::: cell',
      '**粗**',
      ':::',
      '::: cell',
      '細',
      ':::',
      ':::',
    ].join('\n'))
    const { editor: other } = await mountEditor(doc(paragraph()))
    other.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', markdown)
    other.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    expect(JSON.stringify(read(other))).toContain('粗')
    expect(JSON.stringify(read(other))).toContain('細')
    expect(read(other).map(node => node.type)).not.toContain('grid-container')
  })
})
