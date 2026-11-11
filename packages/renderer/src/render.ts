import type { VNodeChild } from 'vue'
import type { NodeRenderer, RenderContext, SerializedDocument, SerializedNode } from './types'
import { Fragment, h } from 'vue'
import { builtinRenderers } from './builtin'
import { collectFootnotes } from './footnote'
import { createSlugger } from './slug'
import { toRenderableTree } from './unknown'

export interface RenderOptions {
  /** Added to (and overriding) `builtinRenderers`, keyed by node type. */
  renderers?: Record<string, NodeRenderer>
  /** Give headings slug ids for anchors / tables of contents. Default true. */
  headingIds?: boolean
}

const warned = new Set<string>()

/** Parses `value` (object or JSON string); returns null for anything without a root. */
export function toDocument(value: SerializedDocument | string | null | undefined): SerializedDocument | null {
  if (!value)
    return null
  const parsed: unknown = typeof value === 'string'
    ? JSON.parse(value)
    : value
  const root = (parsed as Partial<SerializedDocument>)?.root
  return root && typeof root === 'object'
    ? (parsed as SerializedDocument)
    : null
}

/** Renders a document's blocks to VNodes. Pure: no DOM access, safe for SSR. */
export function renderDocument(doc: SerializedDocument, options: RenderOptions = {}): VNodeChild[] {
  const renderers = {
    ...builtinRenderers,
    ...options.renderers,
  }
  const slug = options.headingIds === false
    ? null
    : createSlugger()

  const root = toRenderableTree(doc.root)
  const footnotes = collectFootnotes(root)
  const seen = new Set<string>()
  const once = (key: string) => !seen.has(key) && !!seen.add(key)

  const renderNode = (node: SerializedNode, parent: SerializedNode | null, key: string): VNodeChild => {
    const context: RenderContext = {
      parent,
      renderChildren: child => (child.children ?? []).map((grandchild, i) => renderNode(grandchild, child, `${key}.${i}`)),
      headingId: text => slug?.(text),
      footnotes,
      once,
    }
    // Types come from stored content: `constructor` is not a renderer.
    const renderer = Object.hasOwn(renderers, node.type)
      ? renderers[node.type]
      : undefined
    if (renderer)
      return withKey(renderer(node, context), key)

    if (import.meta.env?.DEV && !warned.has(node.type)) {
      warned.add(node.type)
      console.warn(`[hakulex/renderer] no renderer for node type "${node.type}"`)
    }
    // Unknown containers still show their content.
    return node.children?.length
      ? h(Fragment, { key }, context.renderChildren(node))
      : null
  }

  // The root has no element of its own; return its blocks directly.
  return (root.children ?? []).map((child, i) => renderNode(child, root, `${i}`))
}

function withKey(child: VNodeChild, key: string): VNodeChild {
  if (Array.isArray(child))
    return h(Fragment, { key }, child)
  if (child && typeof child === 'object' && 'type' in child && child.key == null)
    child.key = key
  return child
}
