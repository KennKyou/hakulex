import type { Klass, LexicalNode } from 'lexical'

/*
 * Lexical's `parseEditorState` throws on a type it doesn't have, which is right in
 * the editor but wrong on a server that may be older than the editor that saved the document.
 * This takes those nodes out: an unknown node with children leaves its children, any other is
 * dropped. Turning the document into text or Markdown then still works, without those nodes.
 */

interface AnyNode {
  [key: string]: unknown
  children?: unknown[]
  type?: string
}

export interface SanitizeOptions {
  /** The node classes to treat as known, such as `allHeadlessNodes`. */
  nodes?: Klass<LexicalNode>[]
  /** Called once for each unknown type found. */
  onUnknown?: (type: string) => void
}

/** Lexical registers these itself: they are in every document but in no list of nodes. */
const INTRINSIC_TYPES = [
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
]

function knownTypes(nodes: Klass<LexicalNode>[]): Set<string> {
  const types = new Set<string>(INTRINSIC_TYPES)
  for (const klass of nodes) {
    const getType = (klass as unknown as { getType?: () => string }).getType
    if (typeof getType === 'function')
      types.add(getType.call(klass))
  }
  return types
}

function sanitizeNode(node: AnyNode, known: Set<string>, reported: Set<string>, onUnknown: ((type: string) => void) | undefined): AnyNode[] {
  if (!node || typeof node !== 'object')
    return []

  const children: AnyNode[] = []
  if (Array.isArray(node.children)) {
    for (const child of node.children as AnyNode[])
      children.push(...sanitizeNode(child, known, reported, onUnknown))
  }

  const type = typeof node.type === 'string'
    ? node.type
    : undefined
  if (!type || !known.has(type)) {
    if (type && onUnknown && !reported.has(type)) {
      reported.add(type)
      onUnknown(type)
    }
    return children
  }
  return Array.isArray(node.children)
    ? [
        { ...node, children },
      ]
    : [node]
}

/** A copy of `state` without the nodes `options.nodes` doesn't know. Changes nothing given. */
export function sanitizeSerializedState<T extends { root?: AnyNode }>(state: T, options: SanitizeOptions & { nodes: Klass<LexicalNode>[] }): T {
  const known = knownTypes(options.nodes)
  const reported = new Set<string>()
  const root = state.root
  if (!root || !Array.isArray(root.children))
    return state

  const children: AnyNode[] = []
  for (const child of root.children as AnyNode[])
    children.push(...sanitizeNode(child, known, reported, options.onUnknown))
  return {
    ...state,
    root: { ...root, children },
  }
}

/** The same for a document as a JSON string. A string that isn't JSON comes back as it was. */
export function sanitizeSerializedJSON(json: string, options: SanitizeOptions & { nodes: Klass<LexicalNode>[] }): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  }
  catch {
    return json
  }
  if (!parsed || typeof parsed !== 'object')
    return json
  return JSON.stringify(sanitizeSerializedState(parsed as { root?: AnyNode }, options))
}
