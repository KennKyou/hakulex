import type { MultilineElementTransformer, Transformer } from '@lexical/markdown'
import type { TableCellNode } from '@lexical/table'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from '@lexical/markdown'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellNode as TableCell,
  TableCellHeaderStates,
  TableNode,
  TableRowNode,
} from '@lexical/table'
import { FOOTNOTE_REFERENCE } from '../footnote/transformers'
import { IMAGE } from '../image/transformer'
import { INLINE_TEXT_MATCH_TRANSFORMERS, UNDERLINE_MARKDOWN } from '../inline/transformers'
import { MATH_INLINE } from '../math/transformers'
import { FILE, FILE_INLINE, VIDEO } from '../media/transformers'

const ROW = /^\s*\|(.+)\|\s*$/
const DIVIDER = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/
const BREAK = /<br\s*\/?>/gi

/** What a cell can hold on import: inline text, and images on their own line. */
const CELL_TRANSFORMERS: Transformer[] = [
  IMAGE,
  VIDEO,
  FILE,
  ...TEXT_FORMAT_TRANSFORMERS,
  UNDERLINE_MARKDOWN,
  MATH_INLINE,
  FILE_INLINE,
  FOOTNOTE_REFERENCE,
  ...INLINE_TEXT_MATCH_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]

/** Splits on unescaped pipes, then unescapes them. `null` when the line is not a row. */
function parseRow(line: string): string[] | null {
  const match = ROW.exec(line)
  return match
    ? match[1].split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
    : null
}

function $createCell(markdown: string, header: boolean): TableCellNode {
  const cell = $createTableCellNode(header
    ? TableCellHeaderStates.ROW
    : TableCellHeaderStates.NO_STATUS)
  $convertFromMarkdownString(markdown.replace(BREAK, '\n\n'), CELL_TRANSFORMERS, cell)
  return cell
}

/**
 * GFM tables. Import keeps inline formats and every row at the header's width.
 * `getTransformers` is lazy because cells export with the whole list, this one included.
 */
export function createTableTransformer(getTransformers: () => Transformer[]): MultilineElementTransformer {
  const exportCell = (cell: TableCellNode) => $convertToMarkdownString(getTransformers(), cell)
    .split(/\n+/)
    .filter(Boolean)
    .join('<br>')
    .replace(/\|/g, '\\|')

  return {
    type: 'multiline-element',
    dependencies: [TableNode, TableRowNode, TableCell],
    regExpStart: ROW,
    regExpEnd: { optional: true, regExp: ROW },
    // Only for import: typing `| a |` stays text.
    replace: () => false,
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
      const header = parseRow(lines[startLineIndex])
      const divider = lines[startLineIndex + 1]
      if (!header || divider === undefined || !DIVIDER.test(divider) || parseRow(divider)?.length !== header.length)
        return null

      const table = $createTableNode()
      table.append($createTableRowNode().append(...header.map(cell => $createCell(cell, true))))

      let end = startLineIndex + 1
      while (end + 1 < lines.length) {
        const row = parseRow(lines[end + 1])
        if (!row)
          break
        end++
        table.append($createTableRowNode().append(...header.map((_, i) => $createCell(row[i] ?? '', false))))
      }
      rootNode.append(table)
      return [true, end]
    },
    export: (node) => {
      if (!$isTableNode(node))
        return null
      const rows = node.getChildren().filter($isTableRowNode).map(row => row.getChildren().filter($isTableCellNode).map(exportCell))
      const line = (cells: string[]) => `| ${cells.join(' | ')} |`
      const [header = [], ...body] = rows
      return [
        line(header),
        line(header.map(() => '---')),
        ...body.map(line),
      ].join('\n')
    },
  }
}
