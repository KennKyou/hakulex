import type { SerializedNode } from './types'
import { contentRoot } from './nested'
import { toRenderableTree } from './unknown'

export interface GridData {
  cols: number
  gap: string
  /** The content of each cell, or `null` for one that shows as blank. */
  cells: (SerializedNode | null)[]
}

const DEFAULT_COLS = 2
const MAX_COLS = 12
const DEFAULT_GAP = '16px'
const GAP = /^\d+(?:\.\d+)?(?:px|rem|em)$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function normalizeGap(gap: unknown): string {
  if (typeof gap === 'number') {
    return Number.isFinite(gap) && gap >= 0
      ? `${gap}px`
      : DEFAULT_GAP
  }
  return typeof gap === 'string' && GAP.test(gap)
    ? gap
    : DEFAULT_GAP
}

/**
 * What a stored grid shows. Stored content is untrusted and these values become styles,
 * so only plain numbers and sizes get through. Older documents have a child for each cell.
 */
export function normalizeGrid(node: Record<string, unknown>): GridData {
  const { cols, gap, cells, children } = node
  return {
    cols: typeof cols === 'number' && Number.isInteger(cols) && cols >= 1 && cols <= MAX_COLS
      ? cols
      : DEFAULT_COLS,
    gap: normalizeGap(gap),
    cells: Array.isArray(cells) && cells.length
      ? cells.map(contentRoot)
      : Array.isArray(children)
        ? children.filter(isObject).map(child => toRenderableTree({
            type: 'root',
            children: [child as SerializedNode],
          }))
        : [],
  }
}
