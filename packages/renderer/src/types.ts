import type { VNodeChild } from 'vue'
import type { FootnoteIndex } from './footnote'

/**
 * A serialized Lexical node. Typed loosely on purpose: the renderer reads JSON
 * without the Lexical runtime, and unknown node types must not break it.
 */
export interface SerializedNode {
  type: string
  version?: number
  children?: SerializedNode[]
  [key: string]: unknown
}

/** A serialized editor state, as produced by `editorState.toJSON()`. */
export interface SerializedDocument {
  root: SerializedNode
}

export interface RenderContext {
  /** The node rendering `node`'s children belong to, or null for the root. */
  parent: SerializedNode | null
  /** Renders `node`'s children, passing `node` as their parent. */
  renderChildren: (node: SerializedNode) => VNodeChild[]
  /** Unique heading id for `text`, or undefined when heading ids are off. */
  headingId: (text: string) => string | undefined
  /** Numbers and content of the document's footnotes. */
  footnotes: FootnoteIndex
  /** True the first time it is asked for `key`, for what a document outputs only once. */
  once: (key: string) => boolean
}

/** Renders one node type. Return null to render nothing. */
export type NodeRenderer = (node: SerializedNode, context: RenderContext) => VNodeChild
