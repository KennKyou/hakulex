import type { TableCellNode } from '@lexical/table'
import {
  $computeTableMapSkipCellCheck,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $setTableColumnIsHeader,
  $setTableRowIsHeader,
  TableCellHeaderStates,
} from '@lexical/table'
import { $createParagraphNode, $getRoot } from 'lexical'

export type TableAction
  = | 'insert-row-above'
    | 'insert-row-below'
    | 'insert-column-left'
    | 'insert-column-right'
    | 'append-row'
    | 'append-column'
    | 'toggle-header-row'
    | 'toggle-header-column'
    | 'delete-row'
    | 'delete-column'

export function $getHeaderState(cell: TableCellNode) {
  return {
    row: cell.hasHeaderState(TableCellHeaderStates.ROW),
    column: cell.hasHeaderState(TableCellHeaderStates.COLUMN),
  }
}

function $position(cell: TableCellNode) {
  const table = $getTableNodeFromLexicalNodeOrThrow(cell)
  const [map, position] = $computeTableMapSkipCellCheck(table, cell, null)
  return {
    table,
    map,
    row: position?.startRow ?? 0,
    column: position?.startColumn ?? 0,
  }
}

/** Removing the only block leaves nowhere to type, so the caret gets a paragraph. */
function $ensureParagraph() {
  const root = $getRoot()
  if (root.isEmpty()) {
    const paragraph = $createParagraphNode()
    root.append(paragraph)
    paragraph.select()
  }
}

export function $runTableAction(cell: TableCellNode, action: TableAction): void {
  switch (action) {
    case 'insert-row-above':
      $insertTableRowAtNode(cell, false)
      break
    case 'insert-row-below':
      $insertTableRowAtNode(cell, true)
      break
    case 'insert-column-left':
      $insertTableColumnAtNode(cell, false, false)
      break
    case 'insert-column-right':
      $insertTableColumnAtNode(cell, true, false)
      break
    case 'append-row': {
      const last = $position(cell).map.at(-1)?.[0]?.cell
      if (last)
        $insertTableRowAtNode(last, true)
      break
    }
    case 'append-column': {
      const last = $position(cell).map[0]?.at(-1)?.cell
      if (last)
        $insertTableColumnAtNode(last, true, false)
      break
    }
    case 'toggle-header-row': {
      const { table, row } = $position(cell)
      $setTableRowIsHeader(table, row, !$getHeaderState(cell).row)
      break
    }
    case 'toggle-header-column': {
      const { table, column } = $position(cell)
      $setTableColumnIsHeader(table, column, !$getHeaderState(cell).column)
      break
    }
    case 'delete-row':
      cell.selectStart()
      $deleteTableRowAtSelection()
      $ensureParagraph()
      break
    case 'delete-column':
      cell.selectStart()
      $deleteTableColumnAtSelection()
      $ensureParagraph()
      break
  }
}
