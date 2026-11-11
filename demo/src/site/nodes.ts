import type { NodeCategory, NodeType } from './samples/helpers'
import { blockNodes } from './samples/block'
import { containerNodes } from './samples/container'
import { inlineNodes } from './samples/inline'

/* Every node the site has a page for, in the order of the navigation. */

export type { NodeCategory, NodeSample, NodeType } from './samples/helpers'

export const nodeCategories: { key: NodeCategory, label: string }[] = [
  { key: 'inline', label: '行內' },
  { key: 'block', label: '區塊' },
  { key: 'container', label: '容器' },
]

export const nodeTypes: NodeType[] = [
  ...inlineNodes,
  ...blockNodes,
  ...containerNodes,
]

export const nodesIn = (category: NodeCategory) => nodeTypes.filter(node => node.category === category)

export const findNode = (type: unknown) => nodeTypes.find(node => node.type === type)

export function neighbours(type: string): { previous?: NodeType, next?: NodeType } {
  const index = nodeTypes.findIndex(node => node.type === type)
  return {
    previous: nodeTypes[index - 1],
    next: nodeTypes[index + 1],
  }
}
