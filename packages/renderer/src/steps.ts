import type { VNodeChild } from 'vue'
import type { RenderContext, SerializedNode } from './types'
import { h } from 'vue'
import { normalizeGrid } from './grid'
import { contentRoot } from './nested'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The steps of a stored node. What isn't a step is skipped: stored content can be anything. */
export function storedSteps(node: SerializedNode): Record<string, unknown>[] {
  return Array.isArray(node.steps)
    ? node.steps.filter(isObject)
    : []
}

/** A step's content as a tree ready to render, or `null` when it is not a document. */
export function stepContentRoot(step: unknown): SerializedNode | null {
  return isObject(step)
    ? contentRoot(step.content)
    : null
}

/** The trees inside a node, for walks over a whole document. */
export function nestedRoots(node: SerializedNode): SerializedNode[] {
  switch (node.type) {
    case 'steps':
      return storedSteps(node).flatMap(step => stepContentRoot(step) ?? [])
    case 'nested-doc':
    case 'alert-quote':
    case 'banner':
      return [
        contentRoot(node.content),
      ].flatMap(root => root ?? [])
    case 'grid-container':
      return normalizeGrid(node).cells.flatMap(root => root ?? [])
    default:
      return []
  }
}

export function renderSteps(node: SerializedNode, ctx: RenderContext): VNodeChild {
  const steps = storedSteps(node)
  if (!steps.length)
    return null
  return h('ol', { class: 'hlx-steps' }, steps.map((step, index) => {
    const title = typeof step.title === 'string'
      ? step.title.trim()
      : ''
    const root = stepContentRoot(step)
    return h('li', { class: 'hlx-step' }, [
      h('span', { 'class': 'hlx-step-number', 'aria-hidden': 'true' }, String(index + 1)),
      title
        ? h('div', { class: 'hlx-step-title' }, title)
        : null,
      h('div', { class: 'hlx-step-content' }, root
        ? ctx.renderChildren(root)
        : []),
    ])
  }))
}
