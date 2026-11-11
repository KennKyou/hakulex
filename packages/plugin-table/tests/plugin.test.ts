import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import type { TableAction } from '../src/table-actions'
import { RichEditor } from '@hakulex/editor'
import { $computeTableMapSkipCellCheck, $createTableNodeWithDimensions, $isTableNode } from '@lexical/table'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { TablePlugin } from '../src'
import { $runTableAction } from '../src/table-actions'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  headerState?: number
}

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountWithPlugin(props: Record<string, unknown> = {}, plugin = true) {
  const wrapper = mount(RichEditor, {
    props,
    attachTo: document.body,
    slots: plugin
      ? {
          default: () => h(TablePlugin),
        }
      : {},
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.getRootElement()!.focus()
  return { wrapper, editor }
}

/** A 2 × 2 table with a header row, filled with a b / c d. */
function fillTable(editor: LexicalEditor) {
  editor.update(() => {
    const table = $createTableNodeWithDimensions(2, 2, { rows: true, columns: false })
    $getRoot().clear().append($createParagraphNode().append($createTextNode('before')), table)
    const [map] = $computeTableMapSkipCellCheck(table, null, null)
    const letters = ['a', 'b', 'c', 'd']
    map.flat().forEach(({ cell }, i) => {
      cell.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().append($createTextNode(letters[i]))
    })
    map[0][0].cell.selectStart()
  }, { discrete: true })
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
const grid = (editor: LexicalEditor) => find(rootChildren(editor), 'tablerow').map(row => (row.children ?? []).map(textOf))
const headers = (editor: LexicalEditor) => find(rootChildren(editor), 'tablerow').map(row => (row.children ?? []).map(cell => cell.headerState))

function act(editor: LexicalEditor, at: [number, number], action: TableAction) {
  editor.update(() => {
    const table = $getRoot().getChildren().find($isTableNode)!
    const [map] = $computeTableMapSkipCellCheck(table, null, null)
    $runTableAction(map[at[0]][at[1]].cell, action)
  }, { discrete: true })
}

describe('$runTableAction', () => {
  it.each<[TableAction, string[][]]>([
    [
      'insert-row-above',
      [
        ['a', 'b'],
        ['', ''],
        ['c', 'd'],
      ],
    ],
    [
      'insert-row-below',
      [
        ['a', 'b'],
        ['c', 'd'],
        ['', ''],
      ],
    ],
    [
      'insert-column-left',
      [
        ['a', '', 'b'],
        ['c', '', 'd'],
      ],
    ],
    [
      'insert-column-right',
      [
        ['a', 'b', ''],
        ['c', 'd', ''],
      ],
    ],
  ])('%s from the bottom right cell goes in the right place, and undoes', async (action, expected) => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    const before = grid(editor)

    act(editor, [1, 1], action)
    await flushPromises()
    expect(grid(editor)).toEqual(expected)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(grid(editor)).toEqual(before)
  })

  it('appends at the end whichever cell it starts from', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    act(editor, [0, 0], 'append-row')
    await flushPromises()
    act(editor, [0, 0], 'append-column')
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a', 'b', ''],
      ['c', 'd', ''],
      ['', '', ''],
    ])
  })

  it('deletes a row and a column', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    act(editor, [1, 0], 'delete-row')
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a', 'b'],
    ])
    act(editor, [0, 1], 'delete-column')
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a'],
    ])
  })

  it.each<[TableAction]>([
    ['delete-row'],
    ['delete-column'],
  ])('%s on the last one removes the table, and undo restores it', async (action) => {
    const { editor } = await mountWithPlugin()
    editor.update(() => {
      const table = $createTableNodeWithDimensions(1, 1, false)
      $getRoot().clear().append(table)
      $computeTableMapSkipCellCheck(table, null, null)[0][0][0].cell.selectStart()
    }, { discrete: true })
    await flushPromises()

    act(editor, [0, 0], action)
    await flushPromises()
    expect(find(rootChildren(editor), 'table')).toHaveLength(0)
    expect(rootChildren(editor).map(node => node.type)).toEqual(['paragraph'])
    expect(editor.getEditorState().read(() => $isRangeSelection($getSelection()))).toBe(true)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'table')).toHaveLength(1)
  })

  it('toggles a whole header row and a whole header column', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    expect(headers(editor)).toEqual([
      [1, 1],
      [0, 0],
    ])

    act(editor, [0, 0], 'toggle-header-row')
    await flushPromises()
    expect(headers(editor)).toEqual([
      [0, 0],
      [0, 0],
    ])

    act(editor, [0, 1], 'toggle-header-column')
    await flushPromises()
    expect(headers(editor)).toEqual([
      [0, 2],
      [0, 2],
    ])
  })
})

describe('tablePlugin', () => {
  const handles = () => document.querySelector('.hlx-table-handles')
  const button = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  const open = async (label: string) => {
    button(label)!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    await flushPromises()
    await nextTick()
    await flushPromises()
  }
  const item = (text: string) => [
    ...document.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
  ].find(el => el.textContent?.includes(text))

  it('shows the handles while the caret is in a cell', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    expect(handles()).not.toBeNull()
    expect(button('列操作')).not.toBeNull()
    expect(button('欄操作')).not.toBeNull()
    expect(button('新增列')).not.toBeNull()
    expect(button('新增欄')).not.toBeNull()
  })

  it('hides the handles once the caret leaves the table', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })
    await flushPromises()
    expect(handles()).toBeNull()
  })

  it('hides caret handles when focus leaves the editor, and brings them back', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    expect(handles()).not.toBeNull()

    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await flushPromises()
    expect(handles()).toBeNull()

    editor.getRootElement()!.focus()
    await flushPromises()
    expect(handles()).not.toBeNull()
  })

  it('keeps the handles while focus is on one of them', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    button('列操作')!.focus()
    await flushPromises()
    expect(handles()).not.toBeNull()
    expect(document.activeElement).toBe(button('列操作'))
  })

  it('shows the handles for a hovered cell', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })
    await flushPromises()
    expect(handles()).toBeNull()

    editor.getRootElement()!.querySelector('td')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await flushPromises()
    expect(handles()).not.toBeNull()
  })

  it('appends from the append buttons', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    button('新增列')!.click()
    await flushPromises()
    button('新增欄')!.click()
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a', 'b', ''],
      ['c', 'd', ''],
      ['', '', ''],
    ])
  })

  it('runs row actions from the menu and shows header state', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    await open('列操作')
    expect(item('標題列')?.getAttribute('aria-checked')).toBe('true')

    item('在下方插入列')!.click()
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ])
  })

  it('runs column actions from the menu', async () => {
    const { editor } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    await open('欄操作')
    expect(item('標題欄')?.getAttribute('aria-checked')).toBe('false')

    item('刪除欄')!.click()
    await flushPromises()
    expect(grid(editor)).toEqual([
      ['b'],
      ['d'],
    ])
  })

  it('has no handles while read-only', async () => {
    const { editor, wrapper } = await mountWithPlugin()
    fillTable(editor)
    await flushPromises()
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(handles()).toBeNull()

    editor.getRootElement()!.querySelector('td')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await flushPromises()
    expect(handles()).toBeNull()
  })

  it('leaves tables editable without the plugin', async () => {
    const { editor } = await mountWithPlugin({}, false)
    fillTable(editor)
    await flushPromises()
    expect(handles()).toBeNull()
    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})
