import type { NodeKey } from 'lexical'
import type { Component } from 'vue'
import { markRaw } from 'vue'

/**
 * What a `DecoratorNode<VueDecorator>` returns from `decorate()`.
 * The component is mounted into the node's DOM element by `<LexicalDecorators>`.
 */
export interface VueDecorator {
  component: Component
  props?: Record<string, unknown>
}

/** Props every decorator component receives in addition to its own. */
export interface DecoratorComponentProps {
  nodeKey: NodeKey
}

/** Builds a decorator; `nodeKey` is passed to the component automatically. */
export function vueDecorator<P extends Record<string, unknown>>(
  component: Component,
  nodeKey: NodeKey,
  props?: P,
): VueDecorator {
  return {
    component: markRaw(component),
    props: { ...props, nodeKey },
  }
}
