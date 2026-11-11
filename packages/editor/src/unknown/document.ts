import type { SerializedNode } from '@hakulex/renderer'
import type { EditorState, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import type { EditorNode } from '../nodes'
import { calloutWithChildren, calloutWithContent, isUnknownWrapper, UNKNOWN_BLOCK_TYPE, UNKNOWN_INLINE_TYPE, unknownWrapperRaw, unwrapUnknownNodes } from '@hakulex/renderer'
import { $getEditor } from 'lexical'

/** Lexical always registers these itself. */
const CORE_TYPES = [
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
]

/** Where a node is a block. JSON doesn't say, so anywhere else it sits among text. */
const BLOCK_PARENTS = new Set([
  'root',
  'alert-quote',
  'banner',
  'details',
  'tablecell',
])

export function registeredTypes(nodes: EditorNode[]): Set<string> {
  const types = new Set(CORE_TYPES)
  for (const node of nodes) {
    if ('replace' in node) {
      types.add(node.replace.getType())
      if (node.withKlass)
        types.add(node.withKlass.getType())
    }
    else {
      types.add(node.getType())
    }
  }
  return types
}

const isObject = (value: unknown): value is SerializedNode => typeof value === 'object' && value !== null && !Array.isArray(value)

function wrap(node: unknown, parentType: string, registered: Set<string>): unknown {
  if (!isObject(node))
    return node
  const wrapperType = BLOCK_PARENTS.has(parentType)
    ? UNKNOWN_BLOCK_TYPE
    : UNKNOWN_INLINE_TYPE
  const wrapper = isUnknownWrapper(node)
    ? node
    : null
  if (wrapper) {
    const raw = unknownWrapperRaw(wrapper)
    if (!raw)
      return node
    return registered.has(raw.type)
      ? wrap(raw, parentType, registered)
      : { ...wrapper, type: wrapperType }
  }
  if (!registered.has(node.type))
    return { type: wrapperType, version: 1, raw: node }
  const block = calloutWithChildren(node)
  return Array.isArray(block.children)
    ? {
        ...block,
        children: block.children.map(child => wrap(child, block.type, registered)),
      }
    : block
}

/** Stops at a wrapper: what's in there stays as it was stored. */
function toStored(node: SerializedNode): SerializedNode {
  if (isUnknownWrapper(node as unknown))
    return unwrapUnknownNodes(node)
  return Array.isArray(node.children)
    ? calloutWithContent({
        ...node,
        children: node.children.map(child => isObject(child)
          ? toStored(child)
          : child),
      })
    : node
}

/** Readies a stored document for `parseEditorState`, which refuses types it doesn't have. */
export function wrapUnknownNodes(state: SerializedEditorState, registered: Set<string>): SerializedEditorState {
  const root = state.root as unknown as SerializedNode
  if (!isObject(root) || !Array.isArray(root.children))
    return state
  return {
    ...state,
    root: {
      ...root,
      children: root.children.map(child => wrap(child, 'root', registered)),
    },
  } as unknown as SerializedEditorState
}

/**
 * The document as it should be stored: like `state.toJSON()`, but with the nodes
 * this editor doesn't know back to what they were, and alerts and banners with
 * their blocks in `content`. In the editor those are ordinary `children`.
 */
export function serializeEditorState(state: EditorState): SerializedEditorState {
  const json = state.toJSON()
  return {
    ...json,
    root: toStored(json.root as unknown as SerializedNode),
  } as unknown as SerializedEditorState
}

/**
 * Readies nodes in the stored shape (alerts and banners with their blocks in `content`,
 * types the editor may not have) for `$parseSerializedNode` in the active editor, as
 * `wrapUnknownNodes` does for a whole document. For nodes that are going in at the top
 * level, such as pasted ones.
 */
export function $prepareStoredNodes(nodes: SerializedLexicalNode[]): SerializedLexicalNode[] {
  const registered = new Set($getEditor()._nodes.keys())
  return nodes.map(node => wrap(node, 'root', registered) as SerializedLexicalNode)
}
