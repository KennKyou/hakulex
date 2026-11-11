import type { SerializedNode } from './types'
import { calloutWithChildren } from './callout'

/**
 * The editor can only hold node types it has registered, so it keeps any other
 * node in one of these, with the original JSON in `raw`. Normally they are
 * unwrapped on the way out, but `editorState.toJSON()` shows them as they are.
 */
export const UNKNOWN_BLOCK_TYPE = 'hlx-unknown-block'
export const UNKNOWN_INLINE_TYPE = 'hlx-unknown-inline'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function isUnknownWrapper(value: unknown): value is SerializedNode {
  return isObject(value) && (value.type === UNKNOWN_BLOCK_TYPE || value.type === UNKNOWN_INLINE_TYPE)
}

/** What a wrapper holds, or null if stored content made it something that can't be unwrapped. */
export function unknownWrapperRaw(wrapper: SerializedNode): SerializedNode | null {
  return isObject(wrapper.raw) && !isUnknownWrapper(wrapper.raw)
    ? wrapper.raw as SerializedNode
    : null
}

/** Copies `node` with the wrappers in it restored. Wrappers with bad `raw` stay, so nothing is lost. */
export function unwrapUnknownNodes(node: SerializedNode): SerializedNode {
  const source = isUnknownWrapper(node)
    ? unknownWrapperRaw(node) ?? node
    : node
  if (!Array.isArray(source.children))
    return source
  return {
    ...source,
    children: source.children.map(child => isObject(child)
      ? unwrapUnknownNodes(child as SerializedNode)
      : child),
  }
}

/** Unwraps `node` and drops children that stored content made into something other than nodes. */
export function toRenderableTree(node: SerializedNode): SerializedNode {
  const prune = (current: SerializedNode): SerializedNode => {
    const { children, ...rest } = calloutWithChildren(current)
    return Array.isArray(children)
      ? {
          ...rest,
          // What came out of `content` hasn't been unwrapped yet.
          children: children.filter(isObject).map(child => prune(unwrapUnknownNodes(child as SerializedNode))),
        } as SerializedNode
      : rest as SerializedNode
  }
  return prune(unwrapUnknownNodes(node))
}
