import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalCommand, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import type { NestedContent } from '../nested/content'
import { contentRoot, normalizeGrid } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, $getEditor, createCommand, DecoratorNode } from 'lexical'
import GridEditor from '../components/GridEditor.vue'
import { createEmptyContent, createNestedContent, editedContent, nestedText } from '../nested/content'

/** Inserts two blank cells side by side, with focus on the first. */
export const INSERT_GRID_COMMAND: LexicalCommand<void> = createCommand('INSERT_GRID_COMMAND')

export type SerializedGridNode = SerializedLexicalNode & Record<string, unknown>

/** One cell. The editor is shared by every version of the node, so undo can bring a cell back. */
export interface GridCell extends NestedContent {
  /** Tells cells apart on the page. */
  uid: number
  /** What is stored for it, kept until the cell is edited. */
  source: unknown
}

let nextUid = 1

export function createGridCell(parent: Parameters<typeof createNestedContent>[0], source: unknown): GridCell {
  return {
    ...createNestedContent(parent, source),
    uid: nextUid++,
    source,
  }
}

const blankCell = (parent: Parameters<typeof createNestedContent>[0]) => createGridCell(parent, createEmptyContent())

function storedCells(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.cells) && raw.cells.length)
    return raw.cells
  // Older documents have a child for each cell.
  return Array.isArray(raw.children)
    ? raw.children
        .filter(child => typeof child === 'object' && child !== null)
        .map(child => ({
          root: {
            type: 'root',
            version: 1,
            format: '',
            indent: 0,
            direction: null,
            children: [child],
          },
        }))
    : []
}

/**
 * Cells side by side, each with an editor of its own. Holds the JSON as loaded and gives it back
 * until something changes, since a document nobody edited has to come out the same.
 */
export class GridNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>
  __cols: number
  __cells: readonly GridCell[]
  /** Have the cells or the columns changed since loading? Old versions of the node say no. */
  __changed: boolean

  static getType(): string {
    return 'grid-container'
  }

  static clone(node: GridNode): GridNode {
    return new GridNode(node.__raw, node.__cols, node.__cells, node.__changed, node.__key)
  }

  static importJSON(json: SerializedGridNode): GridNode {
    const parent = $getEditor()
    const cells = storedCells(json).map(source => createGridCell(parent, source))
    return $applyNodeReplacement(new GridNode(json, normalizeGrid(json).cols, cells)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, cols = 2, cells: readonly GridCell[] = [], changed = false, key?: NodeKey) {
    super(key)
    this.__raw = raw
    this.__cols = cols
    this.__cells = cells
    this.__changed = changed
  }

  exportJSON(): SerializedGridNode {
    const { __raw: raw, __cols: cols, __cells: cells, __changed: changed } = this.getLatest()
    const edited = cells.map(editedContent)
    if (!changed && edited.every(content => content === undefined)) {
      return {
        ...super.exportJSON(),
        ...raw,
      }
    }
    const { children: _children, ...rest } = raw
    return {
      ...super.exportJSON(),
      ...rest,
      cols,
      cells: cells.map((cell, index) => edited[index] ?? (contentRoot(cell.source)
        ? cell.source
        : createEmptyContent())),
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and stays a grid. */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    for (const cell of this.__cells) {
      const line = document.createElement('p')
      line.textContent = nestedText(cell.editor)
      element.append(line)
    }
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-grid-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return this.__cells.map(cell => nestedText(cell.editor)).join('\n')
  }

  getCols(): number {
    return this.getLatest().__cols
  }

  getGap(): string {
    return normalizeGrid(this.getLatest().__raw).gap
  }

  getCells(): readonly GridCell[] {
    return this.getLatest().__cells
  }

  /** Sets the columns, adding what a first row would need. Cells never go: they rearrange. */
  setCols(cols: number): this {
    const writable = this.getWritable()
    writable.__cols = cols
    if (writable.__cells.length < cols) {
      const parent = $getEditor()
      writable.__cells = [
        ...writable.__cells,
        ...Array.from({ length: cols - writable.__cells.length }, () => blankCell(parent)),
      ]
    }
    writable.__changed = true
    return writable
  }

  /** Adds a whole row, filling out a last row that was short. Returns the first new cell. */
  addRow(): GridCell {
    const writable = this.getWritable()
    const short = writable.__cells.length % writable.__cols
    const parent = $getEditor()
    const added = Array.from({ length: writable.__cols + (short
      ? writable.__cols - short
      : 0) }, () => blankCell(parent))
    writable.__cells = [
      ...writable.__cells,
      ...added,
    ]
    writable.__changed = true
    return added[short
      ? writable.__cols - short
      : 0]
  }

  /** How many cells the last row has. */
  lastRowSize(): number {
    const { __cells: cells, __cols: cols } = this.getLatest()
    return cells.length % cols || cols
  }

  removeLastRow(): this {
    const writable = this.getWritable()
    writable.__cells = writable.__cells.slice(0, writable.__cells.length - this.lastRowSize())
    writable.__changed = true
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(GridEditor, this.__key, {
      cols: this.__cols,
      gap: normalizeGrid(this.__raw).gap,
      cells: this.__cells,
    })
  }
}

/** Two blank cells. Call it inside an update of the editor that will hold it. */
export function $createGridNode(): GridNode {
  const parent = $getEditor()
  return $applyNodeReplacement(new GridNode({ gap: '16px' }, 2, [
    blankCell(parent),
    blankCell(parent),
  ], true))
}

export function $isGridNode(node: LexicalNode | null | undefined): node is GridNode {
  return node instanceof GridNode
}
