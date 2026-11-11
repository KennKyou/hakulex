import type { SerializedNode } from './types'
import { toRenderableTree } from './unknown'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored document as a tree ready to render, or `null` when it is not a document. */
export function contentRoot(content: unknown): SerializedNode | null {
  if (!isObject(content) || !isObject(content.root))
    return null
  return toRenderableTree(content.root as SerializedNode)
}
