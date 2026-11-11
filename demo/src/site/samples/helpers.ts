import type { SerializedEditorState } from 'lexical'

/*
 * What the node pages show, and the helpers that build it. Plain data, so that E2E can import
 * the list and go through every node.
 */

export type NodeCategory = 'inline' | 'block' | 'container'

export interface NodeSample {
  key: string
  label: string
  data: SerializedEditorState
}

export interface NodeType {
  type: string
  label: string
  category: NodeCategory
  description: string
  packageName: string
  samples: NodeSample[]
}

export type NodeTypeInput = Omit<NodeType, 'category' | 'packageName'>
export type SerializedNode = Record<string, unknown>

export function defineNodes(category: NodeCategory, nodes: NodeTypeInput[]): NodeType[] {
  return nodes.map(node => ({
    ...node,
    category,
    packageName: '@hakulex/editor',
  }))
}

/** Lexical's bits for `format`. */
export const FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
  highlight: 128,
} as const

export function text(value: string, format = 0): SerializedNode {
  return {
    type: 'text',
    version: 1,
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
  }
}

export function element(type: string, children: SerializedNode[], extra: SerializedNode = {}): SerializedNode {
  return {
    type,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children,
    ...extra,
  }
}

export function paragraph(...children: SerializedNode[]): SerializedNode {
  return element('paragraph', children, { textFormat: 0, textStyle: '' })
}

export function say(...lines: string[]): SerializedNode[] {
  return lines.map(line => paragraph(text(line)))
}

/** A whole document, also what a nested editor stores. */
export function doc(...children: SerializedNode[]): SerializedEditorState {
  return {
    root: element('root', children),
  } as unknown as SerializedEditorState
}

export function sample(key: string, label: string, ...children: SerializedNode[]): NodeSample {
  return {
    key,
    label,
    data: doc(...children),
  }
}
